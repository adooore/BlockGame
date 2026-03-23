
function hideBootCover() {
    const cover = document.getElementById('boot-cover');
    if (!cover) return;
    cover.classList.add('hidden');
    setTimeout(() => {
        if (cover.parentNode) cover.parentNode.removeChild(cover);
    }, 220);
}

// ==================== 开场动画（仅首次进入） ====================
const hasPlayedIntro = sessionStorage.getItem('intro_played');

if (!hasPlayedIntro) {
    // 首次进入，播放开场动画
    const introScreen = LoadingAnimations.createIntro({
        title: '方寸枢机',
        subtitle: 'BLOCK GAME',
        duration: 2000,
        onComplete: () => {
            console.log('[Intro] 开场动画完成');
            sessionStorage.setItem('intro_played', 'true');
            // 开场动画结束后播放背景音乐
            SoundManager.playMainBGM();
            SoundManager.initBGMAutoplay();
        }
    });
    // Intro 覆盖层接管后再移除黑幕，防止主页先闪一帧
    requestAnimationFrame(() => hideBootCover());
} else {
    // 非首次进入（从游戏返回），直接播放背景音乐
    console.log('[Intro] 跳过开场动画');
    SoundManager.playMainBGM();
    SoundManager.initBGMAutoplay();
    hideBootCover();
}


// 初始化图标
lucide.createIcons();

// ==================== 全局按钮点击音效 ====================
document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .btn-glitch, .btn-cyber, .menu-btn, .glass-panel[onclick]');
    if (target) {
        SoundManager.playClick();
    }
});




// 控制器状态
let connectedControllers = {};

// 使用共享模块的颜色配置
const slotColors = PLAYER_COLORS;

// ==================== 预览角色系统（使用共享模块）====================
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');

// 角色数据和输入状态
const players = {};
const controllerInputs = {};  // 每个控制器的输入状态

// 初始位置配置
const SPAWN_POSITIONS = {
    1: { x: 0.2, y: 0.5 },
    2: { x: 0.8, y: 0.5 },
    3: { x: 0.3, y: 0.7 },
    4: { x: 0.7, y: 0.7 }
};

function initPlayer(id) {
    const pos = SPAWN_POSITIONS[id] || { x: 0.5, y: 0.5 };
    players[id] = createPlayer(
        id,
        window.innerWidth * pos.x - 20,
        window.innerHeight * pos.y - 20
    );
    controllerInputs[id] = {
        joystick: { x: 0, y: 0 },
        buttons: { N: false, S: false, E: false, W: false }
    };
    
    // 使用 PersistedStore 统一的颜色管理，避免重复颜色
    const savedColor = PersistedStore.playerColors.getPlayerColor(id);
    // 获取首选颜色ID：优先使用保存的颜色ID，如果没有则用玩家ID作为默认
    let preferredColorId = (savedColor && savedColor.id && savedColor.id > 0) 
        ? savedColor.id 
        : parseInt(id);
    
    console.log(`[initPlayer] P${id} 首选颜色ID: ${preferredColorId}, savedColor:`, savedColor);
    
    // 获取其他玩家已使用的颜色
    const usedColors = Object.entries(playerColors)
        .filter(([pid, _]) => parseInt(pid) !== parseInt(id))  // 排除自己
        .map(([_, colorId]) => colorId);
    
    const ALL_COLORS = PersistedStore.playerColors.getAllColors();
    let finalColorId = preferredColorId;
    
    // 只有当首选颜色已被其他玩家使用时，才顺延到下一个可用颜色
    if (usedColors.includes(preferredColorId)) {
        console.log(`[initPlayer] P${id} 颜色 ${preferredColorId} 已被使用，寻找替代...`);
        for (let i = 1; i <= ALL_COLORS.length; i++) {
            const candidateId = ((preferredColorId - 1 + i) % ALL_COLORS.length) + 1;
            if (!usedColors.includes(candidateId)) {
                finalColorId = candidateId;
                console.log(`[initPlayer] P${id} 替代颜色: ${finalColorId}`);
                break;
            }
        }
    }
    
    playerColors[id] = finalColorId;
    
    // 应用颜色到玩家
    const colorData = PersistedStore.playerColors.getColorById(finalColorId);
    if (colorData && players[id]) {
        players[id].colors = { main: colorData.main, glow: colorData.glow, core: colorData.core };
    }
    
    // 只有当颜色变化时才保存（避免覆盖保存的颜色）
    if (!savedColor || savedColor.id !== finalColorId) {
        PersistedStore.playerColors.setPlayerColor(id, finalColorId);
    }
    syncPlayerMovementConfig(players[id], getLobbyPlayerSize());
    
    updateWardrobeUI();
}

function removePlayer(id) {
    delete players[id];
    delete controllerInputs[id];
    delete playerColors[id];
    updateWardrobeUI();
}

const BASE_UI_WIDTH = 1280;  // UI设计基准宽度
const BASE_UI_HEIGHT = 720; // UI设计基准高度

function getLobbyPlayerSize() {
    const minDim = Math.min(window.innerWidth || BASE_UI_WIDTH, window.innerHeight || BASE_UI_HEIGHT);
    // 720p 下约 40px，随窗口尺寸变化并限制上下界。
    return Math.max(24, Math.min(64, Math.round(minDim * 0.055)));
}

function rescaleLobbyPlayers(prevW, prevH, nextW, nextH) {
    const safePrevW = prevW > 0 ? prevW : nextW;
    const safePrevH = prevH > 0 ? prevH : nextH;
    const nextSize = getLobbyPlayerSize();

    Object.values(players).forEach((p) => {
        const centerXRatio = (p.x + p.width / 2) / safePrevW;
        const centerYRatio = (p.y + p.height / 2) / safePrevH;

        syncPlayerMovementConfig(p, nextSize);

        const nextCenterX = centerXRatio * nextW;
        const nextCenterY = centerYRatio * nextH;
        p.x = nextCenterX - p.width / 2;
        p.y = nextCenterY - p.height / 2;
        p.prevX = p.x;
        p.prevY = p.y;
    });
}

function resizePreviewCanvas() {
    const prevW = previewCanvas.width || window.innerWidth;
    const prevH = previewCanvas.height || window.innerHeight;
    previewCanvas.width = window.innerWidth;
    previewCanvas.height = window.innerHeight;
    rescaleLobbyPlayers(prevW, prevH, previewCanvas.width, previewCanvas.height);
    
    // 根据窗口大小缩放主内容
    const mainContent = document.getElementById('main-content');
    const wardrobeZone = document.getElementById('wardrobe-zone');
    
    if (mainContent) {
        // 基于宽度和高度计算缩放比例，取较小值确保内容不超出
        const scaleX = window.innerWidth / BASE_UI_WIDTH;
        const scaleY = window.innerHeight / BASE_UI_HEIGHT;
        const scale = Math.max(0.8, Math.min(2, Math.min(scaleX, scaleY)));
        
        mainContent.style.transform = `scale(${scale})`;
    }
    
    // 换装区缩放 - 现在独立于 main-content，可以安全缩放
    if (wardrobeZone) {
        const scaleByWidth = window.innerWidth / BASE_UI_WIDTH;
        const scaleByHeight = window.innerHeight / BASE_UI_HEIGHT;
        const scale = Math.max(0.75, Math.min(1.8, Math.min(scaleByWidth, scaleByHeight)));
        wardrobeZone.style.transform = `scale(${scale})`;
    }
    
    if (window.MainMenuUI && typeof MainMenuUI.resizeOverlayScale === 'function') {
        MainMenuUI.resizeOverlayScale();
    } else if (window.MainMenuUI && typeof MainMenuUI.resizeQrContentScale === 'function') {
        // 兼容旧接口
        MainMenuUI.resizeQrContentScale();
    }
}

// 每个玩家触碰的按钮 { playerId: button }
const playerHoveredButtons = {};

// 检测角色与按钮的碰撞
function checkButtonCollision(player) {
    // 检测所有可点击的按钮（btn-glitch 和带 onclick 的 glass-panel）
    const buttons = document.querySelectorAll('.btn-glitch:not([style*="display: none"]), .glass-panel[onclick]');
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    
    for (const btn of buttons) {
        // 跳过不可见的按钮（在隐藏菜单中）
        const menu = btn.closest('.menu-container');
        if (menu && menu.classList.contains('hidden-menu')) continue;
        
        // 跳过隐藏的弹窗中的按钮
        const modal = btn.closest('#qr-modal, #settings-modal');
        if (modal && !modal.classList.contains('active')) continue;
        
        const rect = btn.getBoundingClientRect();
        if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) {
            return btn;
        }
    }
    return null;
}

// 更新按钮高亮状态
function updateButtonHighlight() {
    // 清除所有高亮（包括 btn-glitch 和 glass-panel）
    document.querySelectorAll('.btn-glitch.player-hover, .glass-panel.player-hover').forEach(btn => {
        btn.classList.remove('player-hover');
    });
    
    // 检测所有玩家，每个玩家记住自己触碰的按钮
    Object.entries(players).forEach(([id, p]) => {
        const btn = checkButtonCollision(p);
        playerHoveredButtons[id] = btn;
        if (btn) {
            btn.classList.add('player-hover');
        }
    });
}

// 确认按钮点击（指定玩家）
function confirmButtonClick(playerId) {
    // 先检查是否在换装区
    if (tryChangeColor(playerId)) {
        return;
    }
    
    const btn = playerHoveredButtons[playerId];
    if (btn) {
        btn.click();
    }
}

// ==================== 换装系统 ====================
// 使用 PersistedStore 统一管理的颜色常量
const ALL_COLORS = PersistedStore.playerColors.getAllColors();

// 玩家当前颜色 { playerId: colorId }
const playerColors = {};

/** 进关前把主页预览区的颜色写入存档；由 levelSelectScene 的 selectLevel 调用（players 仅在本文件作用域） */
window.BlockGameMainMenu = window.BlockGameMainMenu || {};
window.BlockGameMainMenu.persistLobbyPlayerColors = function () {
    Object.keys(players).forEach((playerId) => {
        const colorId = playerColors[playerId] || parseInt(playerId, 10);
        PersistedStore.playerColors.setPlayerColor(playerId, colorId);
    });
};

// 检测玩家是否在换装区
function isInWardrobeZone(player) {
    const zone = document.getElementById('wardrobe-zone');
    const rect = zone.getBoundingClientRect();
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    
    // 扩大检测范围
    const padding = 20;
    return px >= rect.left - padding && px <= rect.right + padding &&
            py >= rect.top - padding && py <= rect.bottom + padding;
}

// 获取已被使用的颜色
function getUsedColors() {
    return Object.values(playerColors);
}

// 尝试换色
function tryChangeColor(playerId) {
    const player = players[playerId];
    if (!player || !isInWardrobeZone(player)) {
        return false;
    }
    
    const usedColors = getUsedColors();
    const currentColorId = playerColors[playerId] || parseInt(playerId);
    
    // 找下一个可用颜色
    let nextColorId = currentColorId;
    for (let i = 0; i < ALL_COLORS.length; i++) {
        nextColorId = (nextColorId % ALL_COLORS.length) + 1;
        // 跳过被其他玩家使用的颜色
        if (!usedColors.includes(nextColorId) || nextColorId === currentColorId) {
            break;
        }
    }
    
    // 如果找到了不同的颜色
    if (nextColorId !== currentColorId && !usedColors.includes(nextColorId)) {
        playerColors[playerId] = nextColorId;
        const newColor = ALL_COLORS.find(c => c.id === nextColorId);
        if (newColor && player.colors) {
            player.colors = { main: newColor.main, glow: newColor.glow, core: newColor.core };
        }
        // 立即保存颜色到存档
        PersistedStore.playerColors.setPlayerColor(playerId, nextColorId);
        updateWardrobeUI();
        return true;
    }
    
    return true; // 在换装区但没有可换的颜色
}

// 更新换装区 UI
function updateWardrobeUI() {
    const swatches = document.querySelectorAll('.color-swatch');
    const usedColors = getUsedColors();
    
    swatches.forEach(swatch => {
        const colorId = parseInt(swatch.dataset.color);
        if (usedColors.includes(colorId)) {
            swatch.classList.add('taken');
        } else {
            swatch.classList.remove('taken');
        }
    });
}

// 更新换装区高亮状态
function updateWardrobeHighlight() {
    const zone = document.getElementById('wardrobe-zone');
    let anyPlayerNearby = false;
    
    Object.values(players).forEach(p => {
        if (isInWardrobeZone(p)) {
            anyPlayerNearby = true;
        }
    });
    
    if (anyPlayerNearby) {
        zone.classList.add('player-nearby');
    } else {
        zone.classList.remove('player-nearby');
    }
}

let uiUpdateCounter = 0;
let previewScheduler = null;

function previewUpdate(fixedDt) {
    const dtScale = fixedDt * 60;
    // 定期更新控制器 UI（每 30 帧约 0.5 秒）
    uiUpdateCounter += dtScale;
    if (uiUpdateCounter >= 30) {
        uiUpdateCounter = 0;
        updateControllerUI();
    }
    
    // 更新所有玩家
    Object.keys(players).forEach(id => {
        const pid = parseInt(id);
        const input = ControllerManager.getInput(pid) || controllerInputs[id];

        // 调试：在主页观察键盘 / 手柄输入是否正常到达
        if (input) {
            const hasMove = Math.abs(input.joystick?.x || 0) > 0.2 || Math.abs(input.joystick?.y || 0) > 0.2;
            const hasButton = input.buttons && (input.buttons.N || input.buttons.S || input.buttons.E || input.buttons.W);
            if (hasMove || hasButton) {
                console.log('[Main] Input', {
                    playerId: pid,
                    source: ControllerManager.getInputSource ? ControllerManager.getInputSource(pid) : input.source,
                    joystick: input.joystick,
                    buttons: input.buttons
                });
            }
        }
        handlePlayerInput(players[id], input, {
            onConfirm: () => confirmButtonClick(id),
            onCancel: () => MainMenuUI.handleBack(),
            onJump: () => SoundManager.playJump(),
            onDash: () => SoundManager.playDash()
        });

        const p = players[id];
        updatePlayerMovement(p, {
            dtScale,
            bounds: {
                minX: 0,
                maxX: window.innerWidth - p.width,
                minY: 0,
                maxY: window.innerHeight - p.height
            },
            onLand: () => SoundManager.playLand()
        });
    });
    
    // 检测按钮碰撞
    updateButtonHighlight();
    
    // 检测换装区
    updateWardrobeHighlight();
}

function previewRender(alpha = 1) {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    Object.values(players).forEach(p => {
        drawPlayerSimple(previewCtx, p, undefined, alpha);
    });
}

function initPreviewScheduler() {
    previewScheduler = FrameScheduler.create({
        fixedHz: 60,
        onUpdate: (fixedDt) => previewUpdate(fixedDt),
        onRender: (alpha) => previewRender(alpha)
    });
    previewScheduler.start();
    console.log('[Main] PreviewScheduler 启动: logic=60Hz, render=60');
}

function reinitControllerForMainMenu() {
    const keyboardEnabled = PersistedStore.gameSettings.getKeyboardEnabled();
    ControllerManager.setCallbacks({
        enableKeyboard: keyboardEnabled,
        onPlayerCreate: (id, previousPlayer) => {
            initPlayer(id);
            console.log(`[Main] 创建玩家 P${id}`);
            updateControllerUI();
            return players[id];
        },
        onPlayerRemove: (id) => {
            if (players[id]) {
                delete players[id];
                delete playerColors[id];
                console.log(`[Main] 移除玩家 P${id}`);
                updateControllerUI();
            }
        },
        onUpdate: () => ControlHint.show(),
        onReassign: (webControllerMapping) => {
            if (GameWebSocket.isConnected()) {
                Object.entries(webControllerMapping).forEach(([controllerId, playerId]) => {
                    GameWebSocket.send({ type: 'update_player_id', controller_id: parseInt(controllerId), player_id: playerId });
                });
            }
            updateControllerUI();
        }
    });
    updateControllerUI();
}

function mountMainMenu() {
    const mainEl = document.getElementById('scene-mainMenu');
    const containerEl = document.getElementById('scene-container');
    if (mainEl) mainEl.classList.remove('hidden');
    if (containerEl) containerEl.classList.remove('active');
    if (!controllerInitialized) {
        initControllerAfterConfig();
    } else {
        reinitControllerForMainMenu();
    }
    if (previewScheduler && !previewScheduler.isRunning()) previewScheduler.start();
}

function unmountMainMenu() {
    if (previewScheduler && previewScheduler.isRunning()) previewScheduler.stop();
    const mainEl = document.getElementById('scene-mainMenu');
    const containerEl = document.getElementById('scene-container');
    if (mainEl) mainEl.classList.add('hidden');
    if (containerEl) containerEl.classList.add('active');
}

// ===== 输入处理（通过 ControllerManager 抽象层）=====
// ControllerManager 初始化延迟到配置加载完成后
let controllerInitialized = false;

function initControllerAfterConfig() {
    if (controllerInitialized) return;
    controllerInitialized = true;
    
    const keyboardEnabled = PersistedStore.gameSettings.getKeyboardEnabled();
    console.log('[Main] 配置加载完成');
    
    ControllerManager.init({
        enableKeyboard: keyboardEnabled,
        onPlayerCreate: (id, previousPlayer) => {
            initPlayer(id);
            console.log(`[Main] 创建玩家 P${id}`);
            updateControllerUI(); // 更新控制器显示
            return players[id];
        },
        onPlayerRemove: (id) => {
            if (players[id]) {
                delete players[id];
                delete playerColors[id];
                console.log(`[Main] 移除玩家 P${id}`);
                updateControllerUI(); // 更新控制器显示
            }
        },
        onUpdate: () => {
            ControlHint.show();
        },
        onReassign: (webControllerMapping) => {
            // 键盘开关后重新分配了 playerId，通知所有 Web 控制器更新显示
            console.log('[Main] 设备重新分配，通知 Web 控制器更新 playerId:', webControllerMapping);
            Object.entries(webControllerMapping).forEach(([controllerId, playerId]) => {
                GameWebSocket.send({
                    type: 'update_player_id',
                    controller_id: parseInt(controllerId),
                    player_id: playerId
                });
            });
            updateControllerUI();
        }
    });
    
    updateControllerUI();
}

// ==================== 音效（使用 SoundManager 统一管理）====================
SoundManager.preload();

// 加载保存的音量设置
(function applyVolumeSettings() {
    const volumes = PersistedStore.gameSettings.getVolume();
    SoundManager.setMasterVolume(volumes.master);
    SoundManager.setBGMVolume(volumes.bgm);
    SoundManager.setSFXVolume(volumes.sfx);
})();

// 启动游戏循环
resizePreviewCanvas();
window.addEventListener('resize', resizePreviewCanvas);
initPreviewScheduler();

function updateControllerUI() {
    const keyboardEnabled = ControllerManager.isKeyboardEnabled();
    const playerCountEl = document.getElementById('player-count');
    const hint = document.getElementById('connection-hint');
    const playerSlots = document.querySelectorAll('#player-slots .player-slot');
    
    // 统计已连接的玩家数量
    let playerCount = 0;
    for (let i = 1; i <= 8; i++) {
        if (ControllerManager.hasPlayer(i)) {
            playerCount++;
        }
    }
    
    // 更新数字显示
    if (playerCountEl) {
        playerCountEl.textContent = playerCount;
    }
    
    // 更新提示文字
    const controllerCount = Object.keys(connectedControllers).length;
    
    if (playerCount === 0) {
        if (hint) {
            hint.textContent = '等待控制器连接...';
            hint.style.color = 'rgba(255, 255, 255, 0.5)';
        }
    } else if (keyboardEnabled) {
        if (controllerCount === 0) {
            if (hint) {
                hint.textContent = 'P1 键盘控制 | 等待手柄连接...';
                hint.style.color = 'rgba(0, 242, 255, 0.5)';
            }
        } else {
            if (hint) {
                hint.textContent = `${controllerCount} 手柄已连接`;
                hint.style.color = 'rgba(0, 242, 255, 0.8)';
            }
        }
    } else {
        if (hint) {
            hint.textContent = `${controllerCount} 手柄已连接`;
            hint.style.color = 'rgba(0, 242, 255, 0.8)';
        }
    }

    if (playerSlots && playerSlots.length && window.PlayerSlotRenderer && typeof PlayerSlotRenderer.renderSlots === 'function') {
        PlayerSlotRenderer.renderSlots({
            slots: playerSlots,
            isActive: (playerId) => ControllerManager.hasPlayer(playerId),
            getColor: (playerId) => {
                if (PersistedStore.playerColors && typeof PersistedStore.playerColors.getPlayerColor === 'function') {
                    return PersistedStore.playerColors.getPlayerColor(playerId);
                }
                return null;
            }
        });
    }
}

// 大厅 WebSocket 逻辑由 dist/js/data/gameWebSocket.js 统一分发到此（见 GameWebSocket.handleMessage）
if (window.MainMenuWsLifecycleHandlers && typeof MainMenuWsLifecycleHandlers.register === 'function') {
    MainMenuWsLifecycleHandlers.register({
        target: window.BlockGameMainMenu,
        state: {
            players,
            playerColors,
            getControllerInitialized: () => controllerInitialized,
            getConnectedControllers: () => connectedControllers,
            updateWardrobeUI
        },
        controllerManager: ControllerManager,
        persistedStore: PersistedStore,
        gameWebSocket: GameWebSocket,
        fpsOverlay: window.FpsOverlay,
        mainMenuUI: window.MainMenuUI,
        initControllerAfterConfig,
        updateControllerUI,
        syncPlayerMovementConfig
    });
} else {
    console.warn('[MainEntry] MainMenuWsLifecycleHandlers 未加载，主菜单 WS 生命周期处理未注册');
}

if (window.MainMenuWsHandlers && typeof MainMenuWsHandlers.registerInputHandlers === 'function') {
    MainMenuWsHandlers.registerInputHandlers({
        target: window.BlockGameMainMenu,
        controllerInputs,
        controllerManager: ControllerManager,
        controlHint: ControlHint
    });
} else {
    console.warn('[MainEntry] MainMenuWsHandlers 未加载，主菜单 WS 输入处理未注册');
}

// 初始化
async function init() {
    // 尝试通过 Tauri 命令获取服务器信息（比 WebSocket 更快）
    if (window.__TAURI__) {
        try {
            const info = await window.__TAURI__.core.invoke('get_server_info');
            if (info.ip) {
                if (window.GameWebSocket && typeof window.GameWebSocket.setServerEndpoint === 'function') {
                    window.GameWebSocket.setServerEndpoint({ ip: info.ip, port: info.port || 8088 });
                }
                if (window.MainMenuUI && typeof MainMenuUI.setServerInfo === 'function') {
                    MainMenuUI.setServerInfo({ ip: info.ip, port: info.port || 8088 });
                }
                if (window.MainMenuUI && typeof MainMenuUI.generateQRCode === 'function') {
                    MainMenuUI.generateQRCode();
                }
                console.log('通过 Tauri 获取服务器 IP:', info.ip);
            }
        } catch (e) {
            console.log('Tauri 命令失败，等待 WebSocket:', e);
        }
    }
    // 全应用单连接：由 GameWebSocket 建立（见 js/data/gameWebSocket.js）
    GameWebSocket.init({ bootstrapLobby: true });
    SceneManager.enter('mainMenu', {});
}

// 场景注册与 init() 见 js/scenes/registerScenes.js（在 mainEntry 之后加载）
// 主菜单悬浮方块见 js/main/floatingBlocks.js

async function exitGame() {
    // 退出前保存数据
    try {
        await PersistedStore.save();
    } catch (e) {
        console.warn('[Exit] 保存失败:', e);
    }
    
    if (GameWebSocket.isConnected()) {
        GameWebSocket.send({ type: 'exit_app' });
    }
}

// 保留旧函数名兼容（关卡入口在 levelSelectScene.js 的 window.selectLevel）
function selectMode(mode) {
            if (mode === 'CO-OP') {
        if (typeof window.selectLevel === 'function') {
            window.selectLevel('color', 1);
        }
            } else if (mode === 'VERSUS') {
                alert('对战模式正在开发中...');
                location.reload();
            }
}


// 设置面板中的拖尾长度：依赖主页玩家列表，留在 mainEntry，由 MainMenuUI 通过 initRuntimeDeps 调用
function applyTrailLengthToActivePlayers(length) {
    const nextLength = Math.max(0, Math.min(1000, Math.round(Number(length) || 0)));
    Object.values(players).forEach(player => {
        syncPlayerMovementConfig(player, player.width, { trailLength: nextLength });
        if (nextLength === 0) player.trail = [];
    });
}

if (window.MainMenuUI && typeof MainMenuUI.initRuntimeDeps === 'function') {
    MainMenuUI.initRuntimeDeps({
        getGameWs: () => GameWebSocket.getWebSocket(),
        applyTrailLengthToActivePlayers
    });
}

window.onload = function() {
    if (window.FloatingBlocks && typeof FloatingBlocks.init === 'function') {
        FloatingBlocks.init();
    }

    if (window.MainMenuUI && typeof MainMenuUI.init === 'function') {
        MainMenuUI.init();
    } else {
        console.error('[MainEntry] MainMenuUI 未加载或未正确初始化');
    }
};