/**
 * GameWebSocket - 游戏 WebSocket 通信抽象层
 * 统一管理游戏与服务器的通信，减少重复代码
 */
const GameWebSocket = {
    ws: null,
    wsConnected: false,
    serverInfo: { ip: '', port: 8088 },
    reconnectTimeout: null,
    isDebugMode: false,  // 是否为调试模式（由服务器返回）
    
    // 回调函数
    callbacks: {
        onConfigLoaded: null,      // 配置加载完成时调用
        onControllerUpdate: null,  // 控制器 UI 需要更新时调用
        onLoadingInput: null,      // 加载界面收到输入时调用
    },
    
    /**
     * 初始化 WebSocket 连接
     * @param {Object} options 配置选项
     * @param {Function} options.onConfigLoaded - 配置加载完成回调，参数: (gameData)
     * @param {Function} options.onControllerUpdate - 控制器更新回调
     * @param {Object} options.loadingScreen - 加载界面对象（可选）
     */
    init(options = {}) {
        this.callbacks.onConfigLoaded = options.onConfigLoaded || null;
        this.callbacks.onControllerUpdate = options.onControllerUpdate || null;
        this.loadingScreen = options.loadingScreen || null;
        
        this.connect();
    },
    
    /**
     * 建立 WebSocket 连接
     */
    connect() {
        const wsUrl = 'ws://localhost:8088/ws/game';
        console.log('[GameWebSocket] 连接游戏服务器:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('[GameWebSocket] 游戏已连接到服务器!');
            this.wsConnected = true;
        };
        
        this.ws.onclose = () => {
            console.log('[GameWebSocket] 与服务器断开连接');
            this.wsConnected = false;
            
            // 断开时清理所有手柄
            if (typeof ControllerManager !== 'undefined') {
                Object.keys(ControllerManager.controllers).forEach(id => {
                    ControllerManager.onControllerDisconnected(parseInt(id));
                });
            }
            
            // 重连
            this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('[GameWebSocket] WebSocket 错误:', error);
        };
        
        this.ws.onmessage = (event) => this.handleMessage(event);
    },
    
    /**
     * 处理收到的消息
     */
    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            const controllerId = data.controller_id;
            
            switch (data.type) {
                case 'connected':
                    this.handleConnected(data);
                    break;
                    
                case 'controller_joined':
                    if (typeof ControllerManager !== 'undefined') {
                        ControllerManager.onControllerConnected(controllerId);
                    }
                    if (this.callbacks.onControllerUpdate) {
                        this.callbacks.onControllerUpdate();
                    }
                    break;
                    
                case 'controller_left':
                    if (typeof ControllerManager !== 'undefined') {
                        ControllerManager.onControllerDisconnected(controllerId);
                    }
                    if (this.callbacks.onControllerUpdate) {
                        this.callbacks.onControllerUpdate();
                    }
                    break;
                    
                case 'state':
                    this.handleControllerState(controllerId, data);
                    break;
                    
                case 'button':
                    // 单独的按钮事件（保持兼容）
                    if (typeof ControllerManager !== 'undefined') {
                        const input = ControllerManager.getInput(controllerId);
                        if (input) {
                            input.buttons[data.button] = data.action === 'press';
                        }
                    }
                    break;
                    
                case 'save_result':
                case 'load_result':
                    if (data.type === 'load_result' && data.success && typeof GameData !== 'undefined') {
                        GameData.initFromServer(data.data);
                    }
                    break;
                    
                default:
                    console.log('[GameWebSocket] 未知消息类型:', data.type);
            }
        } catch (e) {
            console.log('[GameWebSocket] 收到消息:', event.data);
        }
    },
    
    /**
     * 处理连接成功消息
     */
    handleConnected(data) {
        // 保存服务器信息
        if (data.server_ip) {
            this.serverInfo.ip = data.server_ip;
            this.serverInfo.port = data.server_port || 8088;
        }
        
        // 保存调试模式状态
        this.isDebugMode = data.is_debug === true;
        
        // 根据调试模式控制调试面板显示
        this.updateDebugPanelVisibility();
        
        // 设置全局 WebSocket
        if (typeof GameData !== 'undefined') {
            GameData.setWebSocket(this.ws);
        }
        
        // 初始化游戏数据
        if (data.game_data && typeof GameData !== 'undefined') {
            GameData.initFromServer(data.game_data);
        }
        
        // 调用配置加载完成回调（必须在注册控制器之前，因为里面会调用 ControllerManager.init()）
        if (this.callbacks.onConfigLoaded) {
            this.callbacks.onConfigLoaded(data.game_data);
        }
        
        // 通知 ControllerManager 已连接的 Web 控制器（必须在 ControllerManager.init() 之后）
        if (typeof ControllerManager !== 'undefined') {
            (data.controllers || []).forEach(c => {
                ControllerManager.onControllerConnected(c.id);
            });
        }
        
        // 更新控制器 UI
        if (this.callbacks.onControllerUpdate) {
            this.callbacks.onControllerUpdate();
        }
        
        // 标记配置加载完成，隐藏加载界面
        if (this.loadingScreen && this.loadingScreen.setConfigLoaded) {
            this.loadingScreen.setConfigLoaded();
        }
        
        // 通知 Web 控制器：进入游戏，显示暂停按钮
        this.sendGameState('playing');
    },
    
    /**
     * 根据调试模式更新调试面板显示
     */
    updateDebugPanelVisibility() {
        // 优先使用 DebugPanel 模块
        if (typeof DebugPanel !== 'undefined') {
            DebugPanel.setVisible(this.isDebugMode);
        } else {
            // 兼容旧的 HTML 内嵌调试面板
            const debugPanel = document.getElementById('debugLog');
            if (debugPanel) {
                debugPanel.style.display = this.isDebugMode ? 'block' : 'none';
            }
        }
        console.log(`[GameWebSocket] 调试模式: ${this.isDebugMode ? '开启' : '关闭'}`);
    },
    
    /**
     * 处理控制器状态更新
     */
    handleControllerState(controllerId, data) {
        // 更新 ControllerManager 中的输入状态
        if (typeof ControllerManager !== 'undefined') {
            ControllerManager.updateControllerInput(controllerId, data.joystick, data.buttons);
        }
        
        // 检测 Web 控制器输入以触发加载界面
        const btns = data.buttons || {};
        const hasAnyButton = btns.N || btns.S || btns.E || btns.W || btns.Start;
        if (hasAnyButton && this.loadingScreen && this.loadingScreen.handleExternalInput) {
            this.loadingScreen.handleExternalInput();
        }
    },
    
    /**
     * 发送游戏状态到 Web 控制器
     * @param {string} state - 状态: 'playing' | 'menu'
     */
    sendGameState(state) {
        console.log('[GameWebSocket] 发送游戏状态:', state);
        this.send({ type: 'game_state', state: state });
    },
    
    /**
     * 发送消息到服务器
     * @param {Object} data - 要发送的数据对象
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('[GameWebSocket] WebSocket 未连接，无法发送消息:', data);
        }
    },
    
    /**
     * 获取连接状态
     */
    isConnected() {
        return this.wsConnected;
    },
    
    /**
     * 获取原始 WebSocket 对象
     */
    getWebSocket() {
        return this.ws;
    },
    
    /**
     * 关闭连接
     */
    close() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.wsConnected = false;
    },
    
    /**
     * 页面卸载时发送退出游戏状态
     * 应在页面初始化时调用
     */
    setupUnloadHandler() {
        window.addEventListener('beforeunload', () => {
            console.log('[GameWebSocket] 页面卸载，发送游戏状态: menu');
            this.sendGameState('menu');
        });
    }
};

// 导出为全局变量
if (typeof window !== 'undefined') {
    window.GameWebSocket = GameWebSocket;
}

