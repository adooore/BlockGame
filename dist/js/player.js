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

// 默认配置
const DEFAULT_CONFIG = {
    size: 40,
    // 与固定步长更新匹配后的默认体感参数
    moveSpeed: 10.5,
    dashMultiplier: 3.5,
    dashDuration: 8,
    dashCooldown: 30,
    jumpPower: 16,
    gravity: 1.8,
    trailLength: 6  // 减少轨迹长度
};

/**
 * 创建玩家对象
 * @param {number} id - 玩家 ID (1-4)
 * @param {number} x - 初始 X 坐标
 * @param {number} y - 初始 Y 坐标
 * @param {object} customConfig - 自定义配置
 */
function createPlayer(id, x, y, customConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const colors = PLAYER_COLORS[id] || PLAYER_COLORS[1];
    
    return {
        id,
        x, y,
        z: 0,              // 跳跃高度
        vx: 0, vy: 0,      // 水平速度
        vz: 0,             // 垂直速度
        width: config.size,
        height: config.size,
        trail: [],
        colors,
        isJumping: false,
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
 * @param {object} callbacks - 可选回调 { onConfirm, onCancel }
 */
function handlePlayerInput(player, input, callbacks = {}) {
    if (!player || !player.active) return;
    
    const { joystick, buttons } = input;
    const config = player.config;
    const deadzone = 0.3;
    
    // 摇杆移动
    if (Math.abs(joystick.x) > deadzone || Math.abs(joystick.y) > deadzone) {
        player.vx = joystick.x;
        player.vy = joystick.y;
    } else {
        player.vx = 0;
        player.vy = 0;
    }
    
    // 南键 (S) - 跳跃
    if (buttons.S && !player.isJumping) {
        player.isJumping = true;
        player.vz = config.jumpPower;
        // 记录跳跃起始位置残影
        player.ghostMarker = { x: player.x, y: player.y, type: 'jump', opacity: 1, timer: 60 };
    }
    
    // 东键 (E) - 冲刺
    if (buttons.E && player.dashCooldown <= 0) {
        if (player.vx !== 0 || player.vy !== 0) {
            player.dashTimer = config.dashDuration;
            player.dashCooldown = config.dashCooldown;
            // 记录冲刺起始位置残影
            player.ghostMarker = { x: player.x, y: player.y, type: 'dash', opacity: 1, timer: 60 };
        }
    }
    
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
}

/**
 * 更新玩家状态
 * @param {object} player - 玩家对象
 * @param {object} bounds - 边界 { minX, maxX, minY, maxY }
 * @param {number} dtScale - 时间缩放（60Hz=1）
 */
function updatePlayer(player, bounds = null, dtScale = 1) {
    if (!player || !player.active) return;
    
    const config = player.config;
    const scale = Number.isFinite(dtScale) && dtScale > 0 ? dtScale : 1;
    
    // 冲刺移动
    const isDashing = player.dashTimer > 0;
    if (isDashing) {
        player.x += player.vx * config.moveSpeed * config.dashMultiplier * scale;
        player.y += player.vy * config.moveSpeed * config.dashMultiplier * scale;
        player.dashTimer = Math.max(0, player.dashTimer - scale);
    } else {
        player.x += player.vx * config.moveSpeed * scale;
        player.y += player.vy * config.moveSpeed * scale;
    }
    
    if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - scale);
    
    // 跳跃逻辑
    if (player.isJumping) {
        player.z += player.vz * scale;
        player.vz -= config.gravity * scale;
        if (player.z <= 0) {
            player.z = 0;
            player.vz = 0;
            player.isJumping = false;
        }
    }
    
    // 轨迹（每帧添加，保持连贯）
    const isMoving = player.vx !== 0 || player.vy !== 0;
    
    if (isMoving || player.isJumping) {
        player.trail.unshift({ x: player.x, y: player.y, z: player.z });
    }
    
    // 限制轨迹长度（冲刺时允许更长的尾巴）
    const maxLen = isDashing ? config.trailLength + 4 : config.trailLength;
    while (player.trail.length > maxLen) player.trail.pop();
    
    // 静止时快速消散
    if (!isMoving && !player.isJumping && player.trail.length > 0) {
        player.trail.pop();
    }
    
    // 更新残影标记
    if (player.ghostMarker) {
        player.ghostMarker.timer = Math.max(0, player.ghostMarker.timer - scale);
        player.ghostMarker.opacity = player.ghostMarker.timer / 60;
        if (player.ghostMarker.timer <= 0) {
            player.ghostMarker = null;
        }
    }
    
    // 边界检测
    if (bounds) {
        player.x = Math.max(bounds.minX, Math.min(player.x, bounds.maxX - player.width));
        player.y = Math.max(bounds.minY, Math.min(player.y, bounds.maxY - player.height));
    }
}

/**
 * 绘制玩家（简化版，用于主页预览）
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {object} player - 玩家对象
 * @param {boolean} showLabel - 是否显示标签
 */
function drawPlayerSimple(ctx, player, showLabel = true) {
    if (!player || !player.active) return;
    
    const { x, y, z, trail, colors, width, height, id } = player;
    const jumpScale = 1 + (z / 80);
    const drawW = width * jumpScale;
    const drawH = height * jumpScale;
    const drawX = x + width/2 - drawW/2;
    const drawY = y + height/2 - drawH/2;
    
    // 绘制动作残影标记（跳跃/冲刺起始位置）
    if (player.ghostMarker) {
        const ghost = player.ghostMarker;
        const gx = ghost.x + width/2;
        const gy = ghost.y + height/2;
        
        ctx.globalAlpha = ghost.opacity * 0.6;
        ctx.strokeStyle = colors.main;  // 使用玩家当前颜色
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        
        // 绘制虚线方框
        ctx.strokeRect(ghost.x, ghost.y, width, height);
        
        // 绘制连接线到当前位置
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(x + width/2, y + height/2);
        ctx.stroke();
        
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }
    
    // 跳跃时的阴影
    if (z > 0) {
        const shadowScale = Math.max(0.2, 1 - z / 150);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(
            x + width/2, y + height/2,
            (width/2) * shadowScale, (height/2) * shadowScale,
            0, 0, Math.PI * 2
        );
        ctx.fill();
    }
    
    // 绘制轨迹
    trail.forEach((t, i) => {
        const trailScale = 1 + (t.z / 120);
        const tw = width * trailScale;
        const th = height * trailScale;
        const tx = t.x + width/2 - tw/2;
        const ty = t.y + height/2 - th/2;
        
        ctx.globalAlpha = (trail.length - i) / (trail.length * 3);
        ctx.fillStyle = colors.main;
        ctx.fillRect(tx, ty, tw, th);
    });
    ctx.globalAlpha = 1;
    
    // 绘制角色主体
    ctx.shadowBlur = 15 + Math.sin(Date.now()/100) * 5 + (z/5);
    ctx.shadowColor = colors.glow;
    ctx.fillStyle = colors.main;
    ctx.fillRect(drawX, drawY, drawW, drawH);
    
    // 绘制内核
    ctx.fillStyle = colors.core;
    ctx.fillRect(drawX + drawW*0.25, drawY + drawH*0.25, drawW*0.5, drawH*0.5);
    ctx.shadowBlur = 0;
    
    // 绘制玩家标识（头顶）
    if (showLabel) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = colors.main;
        ctx.fillStyle = colors.main;
        ctx.font = 'bold 12px Orbitron, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`P${id}`, x + width/2, drawY - 6);
        ctx.shadowBlur = 0;
    }
}

/**
 * 重置玩家状态
 * @param {object} player - 玩家对象
 * @param {number} x - 重置位置 X
 * @param {number} y - 重置位置 Y
 */
function resetPlayer(player, x, y) {
    if (!player) return;
    
    player.x = x;
    player.y = y;
    player.z = 0;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.isJumping = false;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.trail = [];
}

// 导出（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PLAYER_COLORS,
        DEFAULT_CONFIG,
        createPlayer,
        handlePlayerInput,
        updatePlayer,
        drawPlayerSimple,
        resetPlayer
    };
}

