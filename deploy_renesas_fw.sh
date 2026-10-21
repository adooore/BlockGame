#!/bin/bash
# deploy_renesas_fw.sh
# Renesas uPD720201 firmware unattended deploy script
# Titanium Tiger PCIe USB3 adapter
#
# 开机早期直接 daemon-reload / enable / start 会撞上 systemd 启动事务：
# 服务可能被顺序环丢掉，或在 /lib/firmware 仍不可写时失败。
# 本脚本先等到系统稳定，再部署服务；开机后的恢复由 timer 反复触发，
# 未稳定时立刻退出让开机继续，稳定后再把固件写回 /lib/firmware。
set -euo pipefail

FW_SRC_FILE="renesas_usb_fw.mem"
FW_LIB_PATH="/lib/firmware/${FW_SRC_FILE}"
FW_ETC_PATH="/etc/firmware/${FW_SRC_FILE}"
RESTORE_BIN="/usr/local/sbin/renesas-firmware-restore.sh"
SERVICE_NAME="renesas-firmware-restore.service"
TIMER_NAME="renesas-firmware-restore.timer"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"
TIMER_FILE="/etc/systemd/system/${TIMER_NAME}"
LOCK_FILE="/run/lock/renesas-fw-deploy.lock"
ATTEMPT_FILE="/run/renesas-fw-deploy.attempt"
WAIT_TIMEOUT="${RENESAS_SYSTEM_WAIT_TIMEOUT:-300}"
RETRY_LIMIT=60

log() {
    printf '%s %s\n' "$(date '+%H:%M:%S')" "$*"
}

# 检查是否以 root 执行
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: 必须使用 sudo 执行本脚本！"
    exit 1
fi

SCRIPT_PATH="$(readlink -f -- "$0")"
SCRIPT_DIR="$(dirname "${SCRIPT_PATH}")"
FW_SRC="${SCRIPT_DIR}/${FW_SRC_FILE}"

mkdir -p /run/lock
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
    echo "ERROR: 已有部署任务在执行，请等待它完成后再试。"
    exit 1
fi

system_state() {
    if [ ! -S /run/systemd/private ]; then
        printf '%s\n' "offline"
        return 0
    fi
    local state
    state="$(systemctl is-system-running 2>/dev/null || true)"
    state="${state//$'\n'/}"
    printf '%s\n' "${state:-unknown}"
}

firmware_dirs_writable() {
    local dir
    mkdir -p /lib/firmware /etc/firmware 2>/dev/null || return 1
    for dir in /lib/firmware /etc/firmware; do
        if ! touch "${dir}/.renesas_write_test" 2>/dev/null; then
            return 1
        fi
        rm -f "${dir}/.renesas_write_test"
    done
}

system_is_stable() {
    local state="$1"
    case "${state}" in
        running|degraded) ;;
        *) return 1 ;;
    esac
    [ "$(systemctl is-active multi-user.target 2>/dev/null || true)" = "active" ] || return 1
    firmware_dirs_writable
}

schedule_deploy_retry() {
    local state="$1"
    local attempt=0
    if [ -f "${ATTEMPT_FILE}" ]; then
        attempt="$(tr -cd '0-9' < "${ATTEMPT_FILE}")"
    fi
    attempt=$((attempt + 1))
    if [ "${attempt}" -gt "${RETRY_LIMIT}" ]; then
        log "ERROR: 已改期 ${RETRY_LIMIT} 次，系统仍未稳定，放弃部署服务。"
        exit 1
    fi
    printf '%s\n' "${attempt}" > "${ATTEMPT_FILE}"
    log "由 systemd 拉起且系统仍为 ${state}（${attempt}/${RETRY_LIMIT}）。5 秒后重试部署，避免卡住开机事务。"
    systemd-run --quiet --collect \
        --unit="renesas-fw-deploy-retry-${attempt}" \
        --on-active=5s \
        --timer-property=AccuracySec=1s \
        --working-directory="${SCRIPT_DIR}" \
        /bin/bash "${SCRIPT_PATH}"
}

wait_for_system_stable() {
    local elapsed=0
    local next_log=0
    local state=""

    log "等待系统稳定后再部署服务（超时 ${WAIT_TIMEOUT}s）..."
    while [ "${elapsed}" -le "${WAIT_TIMEOUT}" ]; do
        state="$(system_state)"
        case "${state}" in
            maintenance|stopping)
                log "ERROR: 系统状态为 ${state}，停止部署服务。"
                return 1
                ;;
        esac

        if system_is_stable "${state}"; then
            log "系统已稳定（state=${state}），开始部署服务。"
            rm -f "${ATTEMPT_FILE}"
            return 0
        fi

        # 本进程若属于开机事务，阻塞等待 is-system-running 会和启动完成条件互相卡住。
        # 立刻改期并退出，让开机继续；下次由瞬态定时器在事务外重新进入本脚本。
        if [ -n "${INVOCATION_ID:-}" ]; then
            schedule_deploy_retry "${state}"
            exit 0
        fi

        if [ "${elapsed}" -ge "${next_log}" ]; then
            log "系统尚未稳定（state=${state}，已等待 ${elapsed}s）..."
            next_log=$((elapsed + 10))
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    log "ERROR: 等待系统稳定超时（${WAIT_TIMEOUT}s，最后状态=${state:-unknown}）。未部署服务。"
    return 1
}

install_restore_program() {
    cat > "${RESTORE_BIN}" << 'EOF'
#!/bin/bash
# 由 renesas-firmware-restore.timer 调用。
# 系统未稳定时立刻返回 75，timer 稍后重试；禁止在这里阻塞等待
# is-system-running，否则会把本次启动事务拖死。
set -euo pipefail

FW_SRC="/etc/firmware/renesas_usb_fw.mem"
FW_DST="/lib/firmware/renesas_usb_fw.mem"
TIMER_NAME="renesas-firmware-restore.timer"
ATTEMPT_FILE="/run/renesas-firmware-restore.attempt"
RETRY_LIMIT=60

log() {
    printf '%s %s\n' "renesas-firmware-restore:" "$*"
}

stop_timer() {
    systemctl stop --no-block "${TIMER_NAME}" >/dev/null 2>&1 || true
}

defer_or_give_up() {
    local reason="$1"
    local attempt=0
    if [ -f "${ATTEMPT_FILE}" ]; then
        attempt="$(tr -cd '0-9' < "${ATTEMPT_FILE}")"
    fi
    attempt=$((attempt + 1))
    printf '%s\n' "${attempt}" > "${ATTEMPT_FILE}"
    if [ "${attempt}" -gt "${RETRY_LIMIT}" ]; then
        log "${reason}; giving up after ${RETRY_LIMIT} retries"
        stop_timer
        exit 1
    fi
    log "${reason}; retry later (${attempt}/${RETRY_LIMIT})"
    exit 75
}

state="$(systemctl is-system-running 2>/dev/null || true)"
state="${state//$'\n'/}"
case "${state}" in
    running|degraded) ;;
    maintenance|stopping)
        log "system state=${state}, stop retrying"
        stop_timer
        exit 1
        ;;
    *)
        defer_or_give_up "system not stable yet (state=${state:-unknown})"
        ;;
esac

if [ "$(systemctl is-active multi-user.target 2>/dev/null || true)" != "active" ]; then
    defer_or_give_up "multi-user.target is not active yet"
fi

if [ ! -f "${FW_SRC}" ]; then
    log "missing ${FW_SRC}, stop retrying"
    stop_timer
    exit 1
fi

mkdir -p /lib/firmware
if ! touch /lib/firmware/.renesas_write_test 2>/dev/null; then
    defer_or_give_up "/lib/firmware is not writable yet"
fi
rm -f /lib/firmware/.renesas_write_test

if [ ! -f "${FW_DST}" ] || ! cmp -s "${FW_SRC}" "${FW_DST}"; then
    cp -f "${FW_SRC}" "${FW_DST}"
    log "updated ${FW_DST}"
else
    log "already current ${FW_DST}"
fi
chmod 644 "${FW_DST}"
chown root:root "${FW_DST}"
sync
rm -f "${ATTEMPT_FILE}"
stop_timer
exit 0
EOF
    chmod 755 "${RESTORE_BIN}"
    chown root:root "${RESTORE_BIN}"
}

install_units() {
    # 服务本身不要 WantedBy=multi-user.target。
    # 它若再 After=multi-user.target，会形成顺序环，开机时作业被删掉。
    cat > "${SERVICE_FILE}" << EOF
[Unit]
Description=Restore Renesas uPD720201 firmware after the system is stable
After=local-fs.target systemd-remount-fs.service
RequiresMountsFor=/lib/firmware /etc/firmware
StartLimitIntervalSec=0

[Service]
Type=oneshot
RemainAfterExit=no
SuccessExitStatus=75
ExecStart=${RESTORE_BIN}
TimeoutStartSec=30
EOF

    # AccuracySec 默认是 1min，不写小的话 OnStartupSec=5s 实际可能晚一分钟。
    # OnUnitInactiveSec：未稳定时脚本返回 75（视为成功）并变为 inactive，5 秒后再试。
    cat > "${TIMER_FILE}" << EOF
[Unit]
Description=Restore Renesas firmware only after the system is stable

[Timer]
OnStartupSec=5s
OnUnitInactiveSec=5s
AccuracySec=1s
Unit=${SERVICE_NAME}

[Install]
WantedBy=timers.target
EOF
    chmod 644 "${SERVICE_FILE}" "${TIMER_FILE}"
}

if [ ! -f "${FW_SRC}" ]; then
    echo "ERROR: 固件文件 ${FW_SRC_FILE} 未找到！必须和脚本放在同一目录，文件名大小写严格匹配！"
    exit 1
fi

wait_for_system_stable

echo "===== Renesas USB Firmware Unattended Deploy Start ====="

echo "Copy firmware to /etc/firmware ..."
cp -v "${FW_SRC}" "${FW_ETC_PATH}"
chmod 644 "${FW_ETC_PATH}"
chown root:root "${FW_ETC_PATH}"

echo "Copy firmware to /lib/firmware ..."
cp -v "${FW_SRC}" "${FW_LIB_PATH}"
chmod 644 "${FW_LIB_PATH}"
chown root:root "${FW_LIB_PATH}"
sync

echo "Install restore program and systemd units..."
install -d -m 755 /usr/local/sbin
install_restore_program
install_units

systemctl daemon-reload
systemctl enable "${TIMER_NAME}"
# 此时系统已经稳定，先立刻恢复一次。timer 只负责下次开机。
systemctl start "${SERVICE_NAME}"

exec_status="$(systemctl show -p ExecMainStatus --value "${SERVICE_NAME}" 2>/dev/null || true)"
exec_status="${exec_status#ExecMainStatus=}"
exec_status="${exec_status//$'\n'/}"
if [ "${exec_status}" != "0" ]; then
    echo "ERROR: ${SERVICE_NAME} 未在系统稳定后完成固件恢复（ExecMainStatus=${exec_status:-unknown}）。"
    systemctl status "${SERVICE_NAME}" --no-pager || true
    exit 1
fi

echo -e "\n==================== 【部署自检汇总报告】 ===================="
echo "【固件文件检查】"
if [ -f "${FW_LIB_PATH}" ]; then
    echo "✅ ${FW_LIB_PATH} 存在"
    ls -lh "${FW_LIB_PATH}"
else
    echo "❌ ${FW_LIB_PATH} 缺失"
fi

if [ -f "${FW_ETC_PATH}" ]; then
    echo "✅ ${FW_ETC_PATH} 存在"
    ls -lh "${FW_ETC_PATH}"
else
    echo "❌ ${FW_ETC_PATH} 缺失"
fi

echo -e "\n【Systemd 自动恢复检查】"
timer_enabled="$(systemctl is-enabled "${TIMER_NAME}" 2>/dev/null || true)"
echo "timer enabled: ${timer_enabled}"
systemctl status "${SERVICE_NAME}" --no-pager || true
systemctl status "${TIMER_NAME}" --no-pager || true

echo -e "\n【PCIe Renesas 硬件检测】"
if ! command -v lspci >/dev/null 2>&1; then
    echo "⚠️ 未安装 pciutils，跳过 lspci 检测"
elif lspci | grep -qi renesas; then
    echo "✅ 检测到 Renesas PCIe 设备"
    lspci | grep -i renesas
else
    echo "⚠️ 未检测到 Renesas PCIe 转接板，请检查硬件安装！"
fi

echo -e "\n============================================================"
echo "===== Deploy Finished ====="
echo "ℹ️ Important: "
echo "   1. 必须【整机断电冷重启】，不是软 reboot！"
echo "   2. 确认 PCIe 转接板已插好"
echo "   3. 开机后服务会等到系统稳定（running/degraded 且 multi-user.target 已激活）再写回固件"
echo "   4. 开机后执行：sudo dmesg | grep -E 'renesas|firmware'"
echo "   5. 确认恢复结果：systemctl status ${TIMER_NAME} ${SERVICE_NAME} --no-pager"
echo "============================================================"
