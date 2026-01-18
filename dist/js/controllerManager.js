/**
 * 控制器管理模块
 * 统一管理键盘和手柄输入，自动映射到玩家角色
 * 
 * 设计原则：
 * - 键盘始终映射到 P1
 * - 第一个手柄连入时，和键盘共用 P1
 * - 后续手柄依次创建 P2、P3、P4
 * - 页面只需关心 players 对象，不需要知道输入来源
 */

const ControllerManager = (function() {
    // 内部状态
    let players = {};                    // 玩家对象 { id: playerObject }
    let controllerInputs = {};           // 控制器输入 { id: { joystick, buttons } }
    let connectedControllers = {};       // 已连接的手柄 { id: true }
    let keyboardState = {                // 键盘状态
        keys: {},
        joystick: { x: 0, y: 0 },
        buttons: { N: false, S: false, E: false, W: false }
    };
    
    let playerCreateCallback = null;     // 创建玩家的回调
    let playerRemoveCallback = null;     // 移除玩家的回调
    let onUpdateCallback = null;         // 状态更新回调
    
    let keyboardEnabled = true;          // 是否启用键盘
    let initialized = false;
    
    /**
     * 键盘按键映射配置
     * 所有键位绑定都在这里配置，上层游戏不需要知道具体按键
     * 
     * 手柄按钮布局（Xbox风格）：
     *        北(N)
     *   西(W)     东(E)
     *        南(S)
     * 
     * 键盘映射：
     * - 移动：WASD / 方向键
     * - 动作：J=南(跳跃) K=东(冲刺) U=西(确认) I=北(静步)
     */
    const KEY_MAP = {
        // ===== 移动 =====
        'KeyW': { type: 'move', dir: 'up' },
        'KeyS': { type: 'move', dir: 'down' },
        'KeyA': { type: 'move', dir: 'left' },
        'KeyD': { type: 'move', dir: 'right' },
        'ArrowUp': { type: 'move', dir: 'up' },
        'ArrowDown': { type: 'move', dir: 'down' },
        'ArrowLeft': { type: 'move', dir: 'left' },
        'ArrowRight': { type: 'move', dir: 'right' },
        
        // ===== 动作按钮 (JKUI 对应 南东西北) =====
        'KeyJ': { type: 'button', btn: 'S' },      // J = 南 = 跳跃
        'KeyK': { type: 'button', btn: 'E' },      // K = 东 = 冲刺
        'KeyU': { type: 'button', btn: 'W' },      // U = 西 = 确认
        'KeyI': { type: 'button', btn: 'N' },      // I = 北 = 静步/取消
        
        // ===== 备用键 =====
        'Enter': { type: 'button', btn: 'W' },     // Enter = 西 = 确认
        'Space': { type: 'button', btn: 'S' },     // Space = 南 = 跳跃
        'Escape': { type: 'button', btn: 'N' }     // Esc = 北 = 取消
    };
    
    /**
     * 初始化控制器管理器
     * @param {object} options - 配置选项
     * @param {function} options.onPlayerCreate - 创建玩家回调 (id) => playerObject
     * @param {function} options.onPlayerRemove - 移除玩家回调 (id) => void
     * @param {function} options.onUpdate - 状态更新回调 () => void
     * @param {boolean} options.enableKeyboard - 是否启用键盘控制（默认true）
     */
    function init(options = {}) {
        if (initialized) return;
        
        playerCreateCallback = options.onPlayerCreate;
        playerRemoveCallback = options.onPlayerRemove;
        onUpdateCallback = options.onUpdate;
        keyboardEnabled = options.enableKeyboard !== false;
        
        // 初始化键盘事件
        if (keyboardEnabled) {
            initKeyboardEvents();
            // 键盘默认创建 P1
            ensurePlayer(1);
        }
        
        initialized = true;
        console.log('[ControllerManager] 初始化完成，键盘控制:', keyboardEnabled ? '启用' : '禁用');
    }
    
    /**
     * 初始化键盘事件监听
     */
    function initKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            keyboardState.keys[e.code] = true;
            updateKeyboardInput();
            // 有键盘输入时触发回调
            if (onUpdateCallback) onUpdateCallback();
        });
        
        window.addEventListener('keyup', (e) => {
            keyboardState.keys[e.code] = false;
            updateKeyboardInput();
        });
    }
    
    /**
     * 更新键盘输入状态
     * 根据 KEY_MAP 配置自动映射，修改键位只需改 KEY_MAP
     */
    function updateKeyboardInput() {
        const keys = keyboardState.keys;
        
        // 更新摇杆（遍历所有移动键）
        keyboardState.joystick.x = 0;
        keyboardState.joystick.y = 0;
        
        Object.entries(KEY_MAP).forEach(([keyCode, mapping]) => {
            if (mapping.type === 'move' && keys[keyCode]) {
                switch (mapping.dir) {
                    case 'up': keyboardState.joystick.y = -1; break;
                    case 'down': keyboardState.joystick.y = 1; break;
                    case 'left': keyboardState.joystick.x = -1; break;
                    case 'right': keyboardState.joystick.x = 1; break;
                }
            }
        });
        
        // 更新按钮（遍历所有按钮键）
        keyboardState.buttons = { N: false, S: false, E: false, W: false };
        
        Object.entries(KEY_MAP).forEach(([keyCode, mapping]) => {
            if (mapping.type === 'button' && keys[keyCode]) {
                keyboardState.buttons[mapping.btn] = true;
            }
        });
        
        // 键盘输入映射到 P1
        controllerInputs[1] = {
            joystick: { ...keyboardState.joystick },
            buttons: { ...keyboardState.buttons },
            source: connectedControllers[1] ? 'both' : 'keyboard'
        };
    }
    
    /**
     * 确保玩家存在
     */
    function ensurePlayer(id) {
        if (!players[id] && playerCreateCallback) {
            players[id] = playerCreateCallback(id);
            console.log(`[ControllerManager] 创建玩家 P${id}`);
            if (onUpdateCallback) onUpdateCallback();
        }
    }
    
    /**
     * 移除玩家
     */
    function removePlayer(id) {
        // P1 不能被移除（键盘始终控制）
        if (id === 1 && keyboardEnabled) return;
        
        if (players[id]) {
            if (playerRemoveCallback) playerRemoveCallback(id);
            delete players[id];
            delete controllerInputs[id];
            console.log(`[ControllerManager] 移除玩家 P${id}`);
            if (onUpdateCallback) onUpdateCallback();
        }
    }
    
    /**
     * 手柄连接
     */
    function onControllerConnected(controllerId) {
        connectedControllers[controllerId] = true;
        
        // 初始化该控制器的输入
        if (!controllerInputs[controllerId]) {
            controllerInputs[controllerId] = {
                joystick: { x: 0, y: 0 },
                buttons: { N: false, S: false, E: false, W: false },
                source: 'controller'
            };
        }
        
        // 确保对应玩家存在
        ensurePlayer(controllerId);
        
        console.log(`[ControllerManager] 手柄 ${controllerId} 连接`);
        if (onUpdateCallback) onUpdateCallback();
    }
    
    /**
     * 手柄断开
     */
    function onControllerDisconnected(controllerId) {
        delete connectedControllers[controllerId];
        
        // P1 不移除（键盘仍然控制）
        if (controllerId !== 1 || !keyboardEnabled) {
            removePlayer(controllerId);
        } else {
            // P1 保留，但更新输入来源
            if (controllerInputs[1]) {
                controllerInputs[1].source = 'keyboard';
            }
        }
        
        console.log(`[ControllerManager] 手柄 ${controllerId} 断开`);
        if (onUpdateCallback) onUpdateCallback();
    }
    
    /**
     * 更新手柄输入
     */
    function updateControllerInput(controllerId, joystick, buttons) {
        if (!controllerInputs[controllerId]) {
            controllerInputs[controllerId] = {
                joystick: { x: 0, y: 0 },
                buttons: { N: false, S: false, E: false, W: false },
                source: 'controller'
            };
        }
        
        const input = controllerInputs[controllerId];
        
        // 如果是 P1 且有键盘输入，合并输入
        if (controllerId === 1 && keyboardEnabled) {
            // 手柄输入优先（如果有明显输入）
            const hasControllerInput = Math.abs(joystick.x) > 0.3 || Math.abs(joystick.y) > 0.3;
            const hasKeyboardInput = keyboardState.joystick.x !== 0 || keyboardState.joystick.y !== 0;
            
            if (hasControllerInput) {
                input.joystick = { ...joystick };
            } else if (hasKeyboardInput) {
                input.joystick = { ...keyboardState.joystick };
            } else {
                input.joystick = { ...joystick };
            }
            
            // 按钮合并（任一按下即为按下）
            input.buttons = {
                N: buttons.N || keyboardState.buttons.N,
                S: buttons.S || keyboardState.buttons.S,
                E: buttons.E || keyboardState.buttons.E,
                W: buttons.W || keyboardState.buttons.W
            };
            input.source = 'both';
        } else {
            input.joystick = { ...joystick };
            input.buttons = { ...buttons };
            input.source = 'controller';
        }
    }
    
    /**
     * 获取玩家数量
     */
    function getPlayerCount() {
        return Object.keys(players).length;
    }
    
    /**
     * 获取已连接手柄数量
     */
    function getControllerCount() {
        return Object.keys(connectedControllers).length;
    }
    
    /**
     * 获取玩家输入状态
     */
    function getInput(playerId) {
        return controllerInputs[playerId] || null;
    }
    
    /**
     * 获取所有玩家
     */
    function getPlayers() {
        return players;
    }
    
    /**
     * 获取指定玩家
     */
    function getPlayer(id) {
        return players[id] || null;
    }
    
    /**
     * 检查玩家是否存在
     */
    function hasPlayer(id) {
        return !!players[id];
    }
    
    /**
     * 检查是否有手柄连接
     */
    function hasController(id) {
        return !!connectedControllers[id];
    }
    
    /**
     * 获取玩家输入来源
     */
    function getInputSource(playerId) {
        const input = controllerInputs[playerId];
        return input ? input.source : null;
    }
    
    /**
     * 遍历所有玩家
     */
    function forEachPlayer(callback) {
        Object.values(players).forEach(callback);
    }
    
    /**
     * 重置所有玩家状态
     */
    function resetAllPlayers(resetFn) {
        Object.values(players).forEach(p => {
            if (resetFn) resetFn(p);
        });
    }
    
    /**
     * 获取键位配置（用于UI显示）
     */
    function getKeyBindings() {
        return {
            move: ['W/A/S/D', '方向键'],
            south: ['J', 'Space'],      // 跳跃
            east: ['K'],                 // 冲刺
            west: ['U', 'Enter'],        // 确认
            north: ['I', 'Esc']          // 静步/取消
        };
    }
    
    /**
     * 获取按钮功能说明
     */
    function getButtonActions() {
        return {
            S: '跳跃',    // 南
            E: '冲刺',    // 东
            W: '确认',    // 西
            N: '静步'     // 北
        };
    }
    
    // 公开 API
    return {
        init,
        onControllerConnected,
        onControllerDisconnected,
        updateControllerInput,
        getPlayers,
        getPlayer,
        getInput,
        getPlayerCount,
        getControllerCount,
        hasPlayer,
        hasController,
        getInputSource,
        forEachPlayer,
        resetAllPlayers,
        ensurePlayer,
        getKeyBindings,
        getButtonActions,
        // 暴露内部状态（只读）
        get players() { return players; },
        get inputs() { return controllerInputs; },
        get controllers() { return connectedControllers; },
        get keyMap() { return KEY_MAP; }
    };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControllerManager;
}

