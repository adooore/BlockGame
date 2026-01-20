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
    
    // 原生手柄状态 (Gamepad API)
    let nativeGamepads = {};             // 原生手柄 { gamepadIndex: playerId }
    let nativeGamepadEnabled = true;     // 是否启用原生手柄
    
    let playerCreateCallback = null;     // 创建玩家的回调
    let playerRemoveCallback = null;     // 移除玩家的回调
    let onUpdateCallback = null;         // 状态更新回调
    
    let keyboardEnabled = true;          // 是否启用键盘
    let initialized = false;
    
    // 控制器模式固定为独立分配（通过键盘开关控制是否参与）
    const controllerMode = 'independent';
    
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
     * @param {boolean} options.enableNativeGamepad - 是否启用原生手柄（默认true）
     */
    function init(options = {}) {
        if (initialized) return;
        
        playerCreateCallback = options.onPlayerCreate;
        playerRemoveCallback = options.onPlayerRemove;
        onUpdateCallback = options.onUpdate;
        keyboardEnabled = options.enableKeyboard !== false;
        nativeGamepadEnabled = options.enableNativeGamepad !== false;
        
        // 从 GameData 加载设置
        if (typeof GameData !== 'undefined' && GameData.gameSettings) {
            keyboardEnabled = GameData.gameSettings.getKeyboardEnabled();
            console.log('[ControllerManager] 加载设置 - 键盘:', keyboardEnabled ? '启用' : '禁用');
        }
        
        // 初始化键盘事件（始终监听，但根据 keyboardEnabled 决定是否处理）
        initKeyboardEvents();
        
        // 如果键盘启用，创建 P1
        if (keyboardEnabled) {
            ensurePlayer(1);
        }
        
        // 初始化原生手柄事件 (Gamepad API)
        if (nativeGamepadEnabled) {
            initNativeGamepadEvents();
            // 启动内部自动轮询循环
            startGamepadPolling();
        }
        
        initialized = true;
        console.log('[ControllerManager] 初始化完成，键盘:', keyboardEnabled ? '启用' : '禁用', 
                    '，原生手柄:', nativeGamepadEnabled ? '启用' : '禁用');
    }
    
    /**
     * 启动原生手柄自动轮询循环
     * 内部使用 requestAnimationFrame，上层无需关心
     */
    function startGamepadPolling() {
        function pollLoop() {
            pollNativeGamepads();
            requestAnimationFrame(pollLoop);
        }
        requestAnimationFrame(pollLoop);
        console.log('[ControllerManager] 原生手柄自动轮询已启动');
    }
    
    /**
     * 初始化键盘事件监听
     */
    function initKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            if (!keyboardEnabled) return; // 键盘禁用时忽略输入
            keyboardState.keys[e.code] = true;
            updateKeyboardInput();
            // 有键盘输入时触发回调
            if (onUpdateCallback) onUpdateCallback();
        });
        
        window.addEventListener('keyup', (e) => {
            if (!keyboardEnabled) return; // 键盘禁用时忽略输入
            keyboardState.keys[e.code] = false;
            updateKeyboardInput();
        });
    }
    
    /**
     * 原生手柄按钮映射 (Xbox/标准布局)
     * 
     * Xbox 手柄按钮索引：
     * 0 = A (南)    1 = B (东)
     * 2 = X (西)    3 = Y (北)
     * 
     * PS 手柄按钮索引：
     * 0 = × (南)    1 = ○ (东)
     * 2 = □ (西)    3 = △ (北)
     */
    const GAMEPAD_BUTTON_MAP = {
        0: 'S',  // A/× = 南 = 跳跃
        1: 'E',  // B/○ = 东 = 冲刺
        2: 'W',  // X/□ = 西 = 确认
        3: 'N'   // Y/△ = 北 = 静步
    };
    
    /**
     * 初始化原生手柄事件 (Gamepad API)
     */
    function initNativeGamepadEvents() {
        // 手柄连接事件
        window.addEventListener('gamepadconnected', (e) => {
            console.log(`[ControllerManager] 原生手柄连接: ${e.gamepad.id} (index: ${e.gamepad.index})`);
            onNativeGamepadConnected(e.gamepad);
        });
        
        // 手柄断开事件
        window.addEventListener('gamepaddisconnected', (e) => {
            console.log(`[ControllerManager] 原生手柄断开: ${e.gamepad.id} (index: ${e.gamepad.index})`);
            onNativeGamepadDisconnected(e.gamepad);
        });
        
        // 检查已经连接的手柄（页面加载时可能已有手柄连接）
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gamepad of gamepads) {
            if (gamepad) {
                onNativeGamepadConnected(gamepad);
            }
        }
    }
    
    /**
     * 原生手柄连接处理
     */
    function onNativeGamepadConnected(gamepad) {
        // 如果已经分配过，跳过
        if (nativeGamepads[gamepad.index] !== undefined) {
            return;
        }
        
        // 分配玩家ID
        const playerId = getNextAvailablePlayerId('nativeGamepad');
        
        if (playerId === null) {
            console.log('[ControllerManager] 已达最大玩家数(8)，忽略手柄');
            return;
        }
        
        nativeGamepads[gamepad.index] = playerId;
        connectedControllers[playerId] = true;
        
        // 初始化输入状态
        if (!controllerInputs[playerId]) {
            controllerInputs[playerId] = {
                joystick: { x: 0, y: 0 },
                buttons: { N: false, S: false, E: false, W: false },
                source: 'nativeGamepad'
            };
        } else {
            controllerInputs[playerId].source = playerId === 1 ? 'both' : 'nativeGamepad';
        }
        
        ensurePlayer(playerId);
        
        console.log(`[ControllerManager] 原生手柄 ${gamepad.index} -> P${playerId}`);
        if (onUpdateCallback) onUpdateCallback();
    }
    
    /**
     * 原生手柄断开处理
     */
    function onNativeGamepadDisconnected(gamepad) {
        const playerId = nativeGamepads[gamepad.index];
        if (playerId) {
            delete nativeGamepads[gamepad.index];
            
            // P1 不移除（键盘仍然控制）
            if (playerId !== 1 || !keyboardEnabled) {
                delete connectedControllers[playerId];
                removePlayer(playerId);
            } else {
                // P1 保留，但更新输入来源
                if (controllerInputs[1]) {
                    controllerInputs[1].source = 'keyboard';
                }
            }
            
            if (onUpdateCallback) onUpdateCallback();
        }
    }
    
    /**
     * 轮询原生手柄状态（需要在游戏循环中调用）
     */
    function pollNativeGamepads() {
        if (!nativeGamepadEnabled) return;
        
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        
        for (const gamepad of gamepads) {
            if (!gamepad) continue;
            
            const playerId = nativeGamepads[gamepad.index];
            if (!playerId) continue;
            
            // 读取摇杆（左摇杆 axes[0], axes[1]）
            const deadzone = 0.15;
            let jx = gamepad.axes[0] || 0;
            let jy = gamepad.axes[1] || 0;
            
            // 应用死区
            if (Math.abs(jx) < deadzone) jx = 0;
            if (Math.abs(jy) < deadzone) jy = 0;
            
            const joystick = { x: jx, y: jy };
            
            // 读取按钮
            const buttons = {
                S: gamepad.buttons[0]?.pressed || false,  // A
                E: gamepad.buttons[1]?.pressed || false,  // B
                W: gamepad.buttons[2]?.pressed || false,  // X
                N: gamepad.buttons[3]?.pressed || false   // Y
            };
            
            // 也支持 D-Pad 作为移动
            const dpadUp = gamepad.buttons[12]?.pressed || false;
            const dpadDown = gamepad.buttons[13]?.pressed || false;
            const dpadLeft = gamepad.buttons[14]?.pressed || false;
            const dpadRight = gamepad.buttons[15]?.pressed || false;
            
            if (dpadUp) joystick.y = -1;
            if (dpadDown) joystick.y = 1;
            if (dpadLeft) joystick.x = -1;
            if (dpadRight) joystick.x = 1;
            
            // 直接更新玩家输入（原生手柄的 playerId 已经映射好了）
            updatePlayerInput(playerId, joystick, buttons, 'nativeGamepad');
        }
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
     * 设置控制器模式（已废弃，固定为独立模式）
     * @deprecated 模式已固定为 independent
     */
    function setControllerMode(mode) {
        console.log('[ControllerManager] 控制器模式已固定为 independent');
    }
    
    /**
     * 重新分配所有设备
     * 键盘设置改变时调用
     */
    function reassignDevices() {
        console.log('[ControllerManager] 重新分配设备...');
        
        // 清理旧的玩家（保留键盘的 P1 如果启用）
        Object.keys(players).forEach(id => {
            const playerId = parseInt(id);
            if (playerId !== 1 || !keyboardEnabled) {
                if (playerRemoveCallback) playerRemoveCallback(playerId);
                delete players[playerId];
                delete controllerInputs[playerId];
            }
        });
        
        // 清理旧的映射
        Object.keys(connectedControllers).forEach(id => {
            if (parseInt(id) !== 1 || !keyboardEnabled) {
                delete connectedControllers[id];
            }
        });
        
        // 独立模式：为每个设备分配独立的玩家
        // 如果键盘禁用，手柄从 P1 开始；否则从 P2 开始
        let nextPlayerId = keyboardEnabled ? 2 : 1;
        
        // 为原生手柄分配玩家ID
        Object.keys(nativeGamepads).forEach(gamepadIndex => {
            if (nextPlayerId <= 8) {
                nativeGamepads[gamepadIndex] = nextPlayerId;
                connectedControllers[nextPlayerId] = true;
                controllerInputs[nextPlayerId] = {
                    joystick: { x: 0, y: 0 },
                    buttons: { N: false, S: false, E: false, W: false },
                    source: 'nativeGamepad'
                };
                ensurePlayer(nextPlayerId);
                console.log(`[ControllerManager] 原生手柄 ${gamepadIndex} -> P${nextPlayerId}`);
                nextPlayerId++;
            }
        });
        
        // 为 Web 控制器重新分配玩家ID
        const webControllerIds = Object.keys(webControllerToPlayer);
        webControllerIds.forEach(controllerId => {
            if (nextPlayerId <= 8) {
                webControllerToPlayer[controllerId] = nextPlayerId;
                connectedControllers[nextPlayerId] = true;
                controllerInputs[nextPlayerId] = {
                    joystick: { x: 0, y: 0 },
                    buttons: { N: false, S: false, E: false, W: false },
                    source: 'controller'
                };
                ensurePlayer(nextPlayerId);
                console.log(`[ControllerManager] Web手柄 ${controllerId} -> P${nextPlayerId}`);
                nextPlayerId++;
            }
        });
        
        // 如果键盘禁用，确保 P1 被移除（如果没有设备占用）
        if (!keyboardEnabled) {
            const hasDeviceOnP1 = Object.values(nativeGamepads).includes(1) || 
                                  Object.values(webControllerToPlayer).includes(1);
            if (!hasDeviceOnP1 && players[1]) {
                if (playerRemoveCallback) playerRemoveCallback(1);
                delete players[1];
                delete controllerInputs[1];
            }
        }
        
        // 更新 P1 的输入来源
        if (controllerInputs[1]) {
            const hasController = Object.keys(nativeGamepads).some(idx => nativeGamepads[idx] === 1) ||
                                  Object.values(webControllerToPlayer).includes(1);
            controllerInputs[1].source = hasController ? 'both' : 'keyboard';
        }
        
        if (onUpdateCallback) onUpdateCallback();
        console.log('[ControllerManager] 设备重新分配完成，当前玩家:', Object.keys(players));
    }
    
    /**
     * 获取控制器模式
     */
    function getControllerMode() {
        return controllerMode;
    }
    
    /**
     * 设置键盘是否启用
     * @param {boolean} enabled
     */
    function setKeyboardEnabled(enabled) {
        const wasEnabled = keyboardEnabled;
        keyboardEnabled = enabled;
        console.log(`[ControllerManager] 键盘控制: ${enabled ? '启用' : '禁用'}`);
        
        // 同步保存到 GameData
        if (typeof GameData !== 'undefined') {
            GameData.gameSettings.setKeyboardEnabled(enabled);
        }
        
        if (wasEnabled !== enabled) {
            if (enabled) {
                // 启用键盘：确保 P1 存在
                initKeyboardEvents();
                ensurePlayer(1);
                if (!controllerInputs[1]) {
                    controllerInputs[1] = {
                        joystick: { x: 0, y: 0 },
                        buttons: { N: false, S: false, E: false, W: false },
                        source: 'keyboard'
                    };
                }
            } else {
                // 禁用键盘：移除 P1（除非有手柄也控制 P1）
                const hasControllerOnP1 = Object.values(nativeGamepads).includes(1);
                if (!hasControllerOnP1 && players[1]) {
                    if (playerRemoveCallback) playerRemoveCallback(1);
                    delete players[1];
                    delete controllerInputs[1];
                }
            }
            if (onUpdateCallback) onUpdateCallback();
        }
    }
    
    /**
     * 获取键盘是否启用
     */
    function isKeyboardEnabled() {
        return keyboardEnabled;
    }
    
    /**
     * 获取下一个可用的玩家ID
     * @param {string} deviceType - 设备类型 ('keyboard'|'webController'|'nativeGamepad')
     */
    function getNextAvailablePlayerId(deviceType) {
        // 键盘固定 P1（如果启用）
        if (deviceType === 'keyboard') {
            return 1;
        }
        
        // 如果键盘被禁用，手柄从 P1 开始分配；否则从 P2 开始
        const startId = keyboardEnabled ? 2 : 1;
        
        // 分配可用的玩家ID
        for (let id = startId; id <= 8; id++) {
            if (!players[id]) {
                return id;
            }
        }
        
        // 玩家已满
        console.warn('[ControllerManager] 玩家已满 (8人)');
        return null;
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
    
    // Web控制器ID到玩家ID的映射
    const webControllerToPlayer = {};
    
    /**
     * 手柄连接
     * @param {number} controllerId - 服务器分配的控制器ID
     * @returns {number|null} 分配的玩家ID，如果已满则返回 null
     */
    function onControllerConnected(controllerId) {
        // 独立模式：为 Web 控制器分配独立的玩家ID
        // 如果键盘启用，Web 控制器从 P2 开始；否则从 P1 开始
        let playerId = getNextAvailablePlayerId('webController');
        
        if (playerId === null) {
            console.warn(`[ControllerManager] 玩家已满，无法为 Web 手柄 ${controllerId} 分配`);
            return null;
        }
        
        // 记录映射关系
        webControllerToPlayer[controllerId] = playerId;
        connectedControllers[playerId] = true;
        
        // 初始化该控制器的输入
        controllerInputs[playerId] = {
            joystick: { x: 0, y: 0 },
            buttons: { N: false, S: false, E: false, W: false },
            source: 'controller'
        };
        
        // 确保对应玩家存在
        ensurePlayer(playerId);
        
        console.log(`[ControllerManager] Web手柄 ${controllerId} -> P${playerId}`);
        if (onUpdateCallback) onUpdateCallback();
        
        return playerId;
    }
    
    /**
     * 手柄断开
     */
    function onControllerDisconnected(controllerId) {
        // 获取实际的玩家ID
        const playerId = webControllerToPlayer[controllerId];
        if (playerId === undefined) {
            console.warn(`[ControllerManager] 未知的 Web 手柄断开: ${controllerId}`);
            return;
        }
        
        delete connectedControllers[playerId];
        delete webControllerToPlayer[controllerId];
        
        // P1 不移除（键盘仍然控制）
        if (playerId !== 1 || !keyboardEnabled) {
            removePlayer(playerId);
        } else {
            // P1 保留，但更新输入来源
            if (controllerInputs[1]) {
                controllerInputs[1].source = 'keyboard';
            }
        }
        
        console.log(`[ControllerManager] Web手柄 ${controllerId} (P${playerId}) 断开`);
        if (onUpdateCallback) onUpdateCallback();
    }
    
    /**
     * 更新 Web 手柄输入（通过 controllerId 映射到 playerId）
     */
    function updateControllerInput(controllerId, joystick, buttons) {
        // 获取实际的玩家ID
        const playerId = webControllerToPlayer[controllerId];
        if (playerId === undefined) {
            // 可能是尚未完成连接的控制器
            return;
        }
        
        updatePlayerInput(playerId, joystick, buttons, 'controller');
    }
    
    /**
     * 直接更新玩家输入（供原生手柄使用）
     */
    function updatePlayerInput(playerId, joystick, buttons, source = 'controller') {
        if (!controllerInputs[playerId]) {
            controllerInputs[playerId] = {
                joystick: { x: 0, y: 0 },
                buttons: { N: false, S: false, E: false, W: false },
                source: 'controller'
            };
        }
        
        const input = controllerInputs[playerId];
        
        // 如果是 P1 且有键盘输入，合并输入
        if (playerId === 1 && keyboardEnabled) {
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
            input.source = source;
        }
        
        // 有输入时触发回调（统一所有输入源的行为）
        const hasInput = buttons.S || buttons.E || buttons.W || buttons.N ||
                         Math.abs(joystick.x) > 0.3 || Math.abs(joystick.y) > 0.3;
        if (hasInput && onUpdateCallback) {
            onUpdateCallback();
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
     * 检查玩家是否有任意输入（按钮或摇杆）
     * 用于"按任意键开始"等场景
     * @param {number} playerId - 玩家 ID，不传则检查所有玩家
     * @returns {boolean}
     */
    function hasAnyInput(playerId) {
        const checkInput = (input) => {
            if (!input) return false;
            const anyButton = input.buttons.S || input.buttons.E || input.buttons.W || input.buttons.N;
            const anyJoystick = Math.abs(input.joystick.x) > 0.5 || Math.abs(input.joystick.y) > 0.5;
            return anyButton || anyJoystick;
        };
        
        if (playerId !== undefined) {
            return checkInput(controllerInputs[playerId]);
        }
        
        // 检查所有玩家
        return Object.values(controllerInputs).some(checkInput);
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
        pollNativeGamepads,      // 轮询原生手柄（需在游戏循环中调用）
        getPlayers,
        getPlayer,
        getInput,
        getPlayerCount,
        getControllerCount,
        hasPlayer,
        hasController,
        hasAnyInput,        // 检查是否有任意输入（按任意键开始）
        getInputSource,
        forEachPlayer,
        resetAllPlayers,
        ensurePlayer,
        getKeyBindings,
        getButtonActions,
        // 键盘设置
        setKeyboardEnabled,     // 设置键盘是否启用
        isKeyboardEnabled,      // 获取键盘是否启用
        // 废弃的模式设置（保留兼容性）
        setControllerMode,      // 已废弃，模式固定为 independent
        getControllerMode,      // 总是返回 'independent'
        // 暴露内部状态（只读）
        get players() { return players; },
        get inputs() { return controllerInputs; },
        get controllers() { return connectedControllers; },
        get nativeGamepads() { return nativeGamepads; },
        get webControllers() { return webControllerToPlayer; },
        get keyMap() { return KEY_MAP; },
        get mode() { return 'independent'; }
    };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControllerManager;
}

