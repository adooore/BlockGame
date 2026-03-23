/**
 * 玩家角色模块
 * 提供角色创建、控制、绘制的通用逻辑
 */

// 玩家颜色配置
const PLAYER_COLORS = {
    1: { main: '#00f2ff', glow: '#00f2ff', core: '#e0faff' },  // P1 青色
    2: { main: '#a855f7', glow: '#d946ef', core: '#f0e0ff' },  // P2 紫色
    3: { main: '#4ade80', glow: '#39ff14', core: '#e0ffe0' },  // P3 绿色
    4: { main: '#facc15', glow: '#ffaa00', core: '#fffbe0' }   // P4 黄色
};

// 统一体感指标（按“玩家身位”定义，而不是裸像素）
const PLAYER_FEEL_METRICS = {
    referenceSize: 40,
    moveBodyLengthsPerSecond: 15.75,
    dashDistanceBodyLengths: 7.35,
    dashDurationFrames: 8,
    dashCooldownFrames: 30,
    jumpHeightBodyLengths: 1.7777777778,
    jumpAirtimeSeconds: 0.2962962963,
    trailLength: 3,
    preciseSpeedMultiplier: 0.5,
    jumpHoldGravityScale: 0.5,
    deadzone: 0.3,
    enableJumpHold: true
};

/** 从 PersistedStore 读取用户设置的拖尾长度，失败或未加载时退回 PLAYER_FEEL_METRICS.trailLength（默认 3）。 */
function getConfiguredTrailLength() {
    try {
        if (typeof PersistedStore !== 'undefined' && PersistedStore.gameSettings && typeof PersistedStore.gameSettings.getTrailLength === 'function') {
            return PersistedStore.gameSettings.getTrailLength();
        }
    } catch (e) {}
    return PLAYER_FEEL_METRICS.trailLength;
}

/** 根据体感参数（身位/秒、滞空、冲刺等）与 size/overrides 算出 60Hz 下可用的运动 config（moveSpeed、jumpPower、gravity、trailLength 等）。 */
function buildMovementConfig(size = PLAYER_FEEL_METRICS.referenceSize, overrides = {}) {
    const metrics = { ...PLAYER_FEEL_METRICS, trailLength: getConfiguredTrailLength(), ...overrides };
    const bodySize = Number.isFinite(size) && size > 0 ? size : PLAYER_FEEL_METRICS.referenceSize;
    const fixedHz = 60;
    const jumpAirtimeFrames = Math.max(1, metrics.jumpAirtimeSeconds * fixedHz);
    const jumpHeightPx = bodySize * metrics.jumpHeightBodyLengths;
    const moveSpeed = bodySize * metrics.moveBodyLengthsPerSecond / fixedHz;
    const dashDuration = Math.max(1, metrics.dashDurationFrames);
    const dashMultiplier = (metrics.dashDistanceBodyLengths * bodySize) / (moveSpeed * dashDuration);
    const jumpPower = (4 * jumpHeightPx) / jumpAirtimeFrames;
    const gravity = (8 * jumpHeightPx) / (jumpAirtimeFrames * jumpAirtimeFrames);

    return {
        size: bodySize,
        moveSpeed,
        dashMultiplier,
        dashDuration,
        dashCooldown: metrics.dashCooldownFrames,
        jumpPower,
        gravity,
        trailLength: metrics.trailLength,
        preciseSpeedMultiplier: metrics.preciseSpeedMultiplier,
        jumpHoldGravityScale: metrics.jumpHoldGravityScale,
        deadzone: metrics.deadzone,
        enableJumpHold: metrics.enableJumpHold
    };
}

/** 将当前体感配置同步到玩家对象（width/height/config），用于进场景或设置变更后刷新移动与拖尾等。 */
function syncPlayerMovementConfig(player, size, overrides = {}) {
    if (!player) return null;

    const nextConfig = buildMovementConfig(size || player.width || player.config?.size, overrides);
    player.width = nextConfig.size;
    player.height = nextConfig.size;
    player.config = { ...(player.config || {}), ...nextConfig };
    return player.config;
}

/** 从玩家 config 反推为人可读的体感指标（身位/秒、滞空时间、冲刺距离等），供调试或 UI 显示。 */
function getPlayerFeelMetrics(playerOrConfig = DEFAULT_CONFIG) {
    const config = playerOrConfig.config || playerOrConfig;
    const bodySize = playerOrConfig.width || config.size || DEFAULT_CONFIG.size;
    const jumpHeightPx = (config.jumpPower * config.jumpPower) / (2 * config.gravity);
    const jumpAirtimeSec = (2 * config.jumpPower / config.gravity) / 60;

    return {
        bodySize,
        moveBodyLengthsPerSecond: (config.moveSpeed * 60) / bodySize,
        dashDistanceBodyLengths: (config.moveSpeed * config.dashMultiplier * config.dashDuration) / bodySize,
        jumpHeightBodyLengths: jumpHeightPx / bodySize,
        jumpAirtimeSeconds: jumpAirtimeSec,
        dashDurationFrames: config.dashDuration,
        dashCooldownFrames: config.dashCooldown,
        jumpHoldGravityScale: config.jumpHoldGravityScale ?? 1
    };
}

/** 在上一帧与当前帧逻辑位置之间按 alpha 插值，用于渲染平滑（逻辑 60Hz、渲染更高帧率时）。 */
function getInterpolatedPlayerState(player, alpha = 1) {
    if (!player) return null;

    const t = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const prevX = Number.isFinite(player.prevX) ? player.prevX : player.x;
    const prevY = Number.isFinite(player.prevY) ? player.prevY : player.y;
    const prevZ = Number.isFinite(player.prevZ) ? player.prevZ : player.z;

    return {
        x: prevX + (player.x - prevX) * t,
        y: prevY + (player.y - prevY) * t,
        z: prevZ + (player.z - prevZ) * t
    };
}

/** 在 canvas 上绘制单个玩家：插值位置、幽灵标记、地面阴影、拖尾、主体发光方块、可选 P1 标签与无敌闪烁。 */
function drawPlayerSprite(ctx, player, options = {}) {
    if (!player || player.active === false) return;

    const {
        alpha = 1,
        showLabel: showLabelOpt,
        invincible = false,
        invincibleColor = '#ffffff',
        invinciblePulseMs = 50,
        shadowFill = 'rgba(0,0,0,0.4)',
        glowBlurBase = 12,
        glowBlurJumpDivisor = 8
    } = options;
    // 与拖尾一致：未传时从设置读取，局内局外统一
    const showLabel = showLabelOpt !== undefined ? showLabelOpt : (typeof PersistedStore !== 'undefined' && PersistedStore.gameSettings ? PersistedStore.gameSettings.getShowPlayerNumber() : true);

    const renderState = getInterpolatedPlayerState(player, alpha);
    const { colors, width, height, id } = player;
    const x = renderState ? renderState.x : player.x;
    const y = renderState ? renderState.y : player.y;
    const z = renderState ? renderState.z : player.z;
    const jumpScale = 1 + (z / 80);
    const drawW = width * jumpScale;
    const drawH = height * jumpScale;
    const drawX = x + width / 2 - drawW / 2;
    const drawY = y + height / 2 - drawH / 2;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    if (player.ghostMarker) {
        const ghost = player.ghostMarker;
        const gx = ghost.x + width / 2;
        const gy = ghost.y + height / 2;

        ctx.globalAlpha = ghost.opacity * 0.6;
        ctx.strokeStyle = colors.main;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(ghost.x, ghost.y, width, height);
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(centerX, centerY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    if (z > 0) {
        const shadowScale = Math.max(0.2, 1 - z / 150);
        ctx.fillStyle = shadowFill;
        ctx.beginPath();
        ctx.ellipse(
            centerX, centerY,
            (width / 2) * shadowScale, (height / 2) * shadowScale,
            0, 0, Math.PI * 2
        );
        ctx.fill();
    }

    // 拖尾恢复：在主体前绘制半透明轨迹，增强速度感
    player.trail.forEach((t, i) => {
        const trailScale = 1 + (t.z / 120);
        const tw = width * trailScale;
        const th = height * trailScale;
        const tx = t.x + width / 2 - tw / 2;
        const ty = t.y + height / 2 - th / 2;
        ctx.globalAlpha = (player.trail.length - i) / (player.trail.length * 3);
        ctx.fillStyle = colors.main;
        ctx.fillRect(tx, ty, tw, th);
    });
    ctx.globalAlpha = 1;

    if (invincible) {
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() / invinciblePulseMs) * 0.5;
    }

    ctx.shadowBlur = glowBlurBase + (z / glowBlurJumpDivisor);
    ctx.shadowColor = invincible ? invincibleColor : colors.glow;
    ctx.fillStyle = colors.main;
    ctx.fillRect(drawX, drawY, drawW, drawH);

    ctx.fillStyle = colors.core;
    ctx.fillRect(
        drawX + drawW * 0.25,
        drawY + drawH * 0.25,
        drawW * 0.5,
        drawH * 0.5
    );
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (showLabel) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = colors.main;
        ctx.fillStyle = colors.main;
        ctx.font = 'bold 12px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`P${id}`, centerX, drawY - 6);
        ctx.shadowBlur = 0;
    }
}

// 默认配置
const DEFAULT_CONFIG = buildMovementConfig();

/**
 * 创建玩家对象
 * @param {number} id - 玩家 ID (1-4)
 * @param {number} x - 初始 X 坐标
 * @param {number} y - 初始 Y 坐标
 * @param {object} customConfig - 自定义配置
 */
function createPlayer(id, x, y, customConfig = {}) {
    const config = buildMovementConfig(
        customConfig.size || customConfig.width || DEFAULT_CONFIG.size,
        customConfig
    );
    const colors = PLAYER_COLORS[id] || PLAYER_COLORS[1];
    
    return {
        id,
        x, y,
        prevX: x,
        prevY: y,
        z: 0,              // 跳跃高度
        prevZ: 0,
        vx: 0, vy: 0,      // 水平速度
        vz: 0,             // 垂直速度
        width: config.size,
        height: config.size,
        trail: [],
        colors,
        isJumping: false,
        isJumpHeld: false,
        dashTimer: 0,
        dashCooldown: 0,
        config,
        active: true,
        // 动作残影标记
        ghostMarker: null  // { x, y, type: 'jump'|'dash', opacity: 1, timer: 60 }
    };
}

/**
 * 按钮功能说明
 * ┌─────┬─────────┬──────────────────────┐
 * │ 键  │ 方向    │ 功能                  │
 * ├─────┼─────────┼──────────────────────┤
 * │  N  │ 北 (↑)  │ 取消/返回             │
 * │  S  │ 南 (↓)  │ 跳跃                  │
 * │  W  │ 西 (←)  │ 确认/选择             │
 * │  E  │ 东 (→)  │ 冲刺                  │
 * └─────┴─────────┴──────────────────────┘
 */

/**
 * 处理玩家输入
 * @param {object} player - 玩家对象
 * @param {object} input - 输入 { joystick: {x, y}, buttons: {N, S, W, E} }
 * @param {object} callbacks - 可选回调 { onConfirm, onCancel, onJump, onDash }
 * @param {object} options - 可选配置
 */
function handlePlayerInput(player, input, callbacks = {}, options = {}) {
    if (!player || player.active === false) {
        const empty = { joystick: { x: 0, y: 0 }, buttons: { N: false, S: false, W: false, E: false, Start: false } };
        return { input: empty, isPrecise: false, speedMult: 1 };
    }

    const { joystick, buttons } = input;
    const config = player.config || DEFAULT_CONFIG;
    const {
        deadzone = config.deadzone ?? 0.3,
        preciseSpeedMultiplier = config.preciseSpeedMultiplier ?? 1,
        enablePreciseMovement = false,
        enableJumpHold = config.enableJumpHold !== false
    } = options;

    // 摇杆移动
    if (Math.abs(joystick.x) > deadzone || Math.abs(joystick.y) > deadzone) {
        player.vx = joystick.x;
        player.vy = joystick.y;
    } else {
        player.vx = 0;
        player.vy = 0;
    }

    // 南键 (S) - 跳跃
    player.isJumpHeld = enableJumpHold ? buttons.S : false;
    if (buttons.S && !player._sPressed && !player.isJumping) {
        player.isJumping = true;
        player.vz = config.jumpPower;
        player.ghostMarker = { x: player.x, y: player.y, type: 'jump', opacity: 1, timer: 60 };
        if (callbacks.onJump) callbacks.onJump();
    }
    player._sPressed = buttons.S;

    // 东键 (E) - 冲刺
    const isMoving = player.vx !== 0 || player.vy !== 0;
    if (buttons.E && !player._ePressed && player.dashCooldown <= 0 && isMoving) {
        player.dashTimer = config.dashDuration;
        player.dashCooldown = config.dashCooldown;
        player.ghostMarker = { x: player.x, y: player.y, type: 'dash', opacity: 1, timer: 60 };
        if (callbacks.onDash) callbacks.onDash();
    }
    player._ePressed = buttons.E;

    // 西键 (W) - 确认/选择（用于 UI 交互）
    if (buttons.W && !player._wPressed) {
        player._wPressed = true;
        if (callbacks.onConfirm) callbacks.onConfirm();
    } else if (!buttons.W) {
        player._wPressed = false;
    }

    // 北键 (N) - 取消/返回（用于 UI 交互）
    if (buttons.N && !player._nPressed) {
        player._nPressed = true;
        if (callbacks.onCancel) callbacks.onCancel();
    } else if (!buttons.N) {
        player._nPressed = false;
    }

    const isPrecise = enablePreciseMovement && buttons.N;
    return {
        input,
        isPrecise,
        speedMult: isPrecise ? preciseSpeedMultiplier : 1
    };
}

/**
 * 更新玩家状态
 * @param {object} player - 玩家对象
 * @param {object} bounds - 边界 { minX, maxX, minY, maxY }
 * @param {number} dtScale - 时间缩放（60Hz=1）
 */
function updatePlayer(player, bounds = null, dtScale = 1) {
    updatePlayerMovement(player, { bounds, dtScale });
}

/**
 * 统一玩家运动更新入口（供各游戏/竞技页在逻辑帧内调用）
 * 将输入后的速度与状态推进一帧：位移、跳跃、冲刺、轨迹、边界、落地回调等。
 * @param {object} player - 玩家对象（createPlayer 创建，且已通过 handlePlayerInput 写入 vx/vy/vz 等）
 * @param {object} options - 可选配置
 * @param {number} [options.speedMult=1] - 速度倍率（如静步 0.5）
 * @param {number} [options.dtScale=1] - 时间步缩放（60Hz 下为 1）
 * @param {object} [options.bounds] - 边界 { minX, maxX, minY, maxY }：玩家**左上角**坐标的可取值（已含宽高，即 maxX = 右缘 - width），缺省不裁剪
 * @param {number} [options.moveSpeedScale=1] - 移动速度缩放（如按格子尺寸缩放时 dims.tileSize/BASE_TILE_SIZE）
 * @param {number} [options.jumpHoldGravityScale=1] - 按住跳跃时的重力缩放（如 0.5 表示半重力）
 * @param {function} [options.onLand] - 落地时回调（无参）
 */
function updatePlayerMovement(player, options = {}) {
    if (!player || player.active === false) return;  // 仅当显式 active=false 时跳过，缺省视为活跃
    const config = player.config || DEFAULT_CONFIG;
    player.prevX = player.x;
    player.prevY = player.y;
    player.prevZ = player.z;

    const {
        speedMult = 1,
        dtScale = 1,
        bounds = null,
        moveSpeedScale = 1,
        jumpHoldGravityScale = config.jumpHoldGravityScale ?? 1,
        onLand = null
    } = typeof options === 'object' ? options : {};
    const scale = Number.isFinite(dtScale) && dtScale > 0 ? dtScale : 1;
    const moveScale = config.moveSpeed * moveSpeedScale * speedMult * scale;

    // 冲刺移动
    const isDashing = player.dashTimer > 0;
    if (isDashing) {
        player.x += player.vx * config.dashMultiplier * moveScale;
        player.y += player.vy * config.dashMultiplier * moveScale;
        player.dashTimer = Math.max(0, player.dashTimer - scale);
    } else {
        player.x += player.vx * moveScale;
        player.y += player.vy * moveScale;
    }

    if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - scale);

    // 跳跃逻辑（支持按住跳跃时减轻重力）
    if (player.isJumping) {
        player.z += player.vz * scale;
        const effectiveGravity = (player.isJumpHeld ? config.gravity * jumpHoldGravityScale : config.gravity);
        player.vz -= effectiveGravity * scale;
        if (player.z <= 0) {
            player.z = 0;
            player.vz = 0;
            player.isJumping = false;
            if (player.hasOwnProperty('isJumpHeld')) player.isJumpHeld = false;
            if (typeof onLand === 'function') onLand();
        }
    }

    // 边界必须在拖尾入队之前：否则本帧越界的 x/y 会写入 trail，主体被拉回后拖尾仍画在界外
    if (bounds && typeof bounds.minX === 'number') {
        const maxX = typeof bounds.maxX === 'number' ? bounds.maxX : bounds.minX + 9999;
        const maxY = typeof bounds.maxY === 'number' ? bounds.maxY : bounds.minY + 9999;
        player.x = Math.max(bounds.minX, Math.min(player.x, maxX));
        player.y = Math.max(bounds.minY, Math.min(player.y, maxY));
    }

    // 拖尾：使用逻辑帧轨迹保留速度感，插值渲染会让主体更连续
    const isMoving = player.vx !== 0 || player.vy !== 0;
    if (config.trailLength > 0 && (isMoving || player.isJumping)) {
        player.trail.unshift({ x: player.x, y: player.y, z: player.z });
    }
    const maxTrailLength = isDashing ? config.trailLength + 4 : config.trailLength;
    while (player.trail.length > maxTrailLength) {
        player.trail.pop();
    }
    if (!isMoving && !player.isJumping && player.trail.length > 0) {
        player.trail.pop();
    }

    // 残影标记
    if (player.ghostMarker) {
        player.ghostMarker.timer = Math.max(0, player.ghostMarker.timer - scale);
        player.ghostMarker.opacity = player.ghostMarker.timer / 60;
        if (player.ghostMarker.timer <= 0) player.ghostMarker = null;
    }
}

/**
 * 绘制玩家（简化版，用于主页预览）
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {object} player - 玩家对象
 * @param {boolean} [showLabel] - 是否显示 P1/P2/P3，不传则从设置读取
 * @param {number} [alpha=1] - 透明度
 */
function drawPlayerSimple(ctx, player, showLabel, alpha = 1) {
    drawPlayerSprite(ctx, player, { showLabel, alpha });
}

/**
 * 重置玩家状态。不传 x,y 时在原地复活（只清速度/跳跃/拖尾等）；传 x,y 时重置到该位置（如开局/检查点）。
 * @param {object} player - 玩家对象
 * @param {number} [x] - 可选，重置位置 X
 * @param {number} [y] - 可选，重置位置 Y
 */
function resetPlayer(player, x, y) {
    if (!player) return;

    if (x !== undefined && y !== undefined) {
        player.x = x;
        player.y = y;
        player.prevX = x;
        player.prevY = y;
    } else {
        player.prevX = player.x;
        player.prevY = player.y;
    }
    player.z = 0;
    player.prevZ = 0;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.isJumping = false;
    player.isJumpHeld = false;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.trail = [];
}

if (typeof window !== 'undefined') {
    window.PLAYER_COLORS = PLAYER_COLORS;
    window.PLAYER_FEEL_METRICS = PLAYER_FEEL_METRICS;
}
