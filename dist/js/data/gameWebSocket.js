/**
 * GameWebSocket - 游戏 WebSocket 统一抽象（全应用单连接：主页 / 关卡选择 / 各游戏场景共用）
 */
const GameWebSocket = {
    ws: null,
    wsConnected: false,
    serverInfo: { ip: '', port: 8088 },
    reconnectTimeout: null,
    isDebugMode: false,
    _lastConnectedData: null,
    unloadHandlerAttached: false,

    callbacks: {
        onConfigLoaded: null,
        onControllerUpdate: null,
        onLoadingInput: null
    },

    loadingScreen: null,

    _isLobbyScene() {
        if (typeof SceneManager === 'undefined' || typeof SceneManager.getCurrentSceneId !== 'function') {
            return true;
        }
        const id = SceneManager.getCurrentSceneId();
        return id === 'mainMenu' || id === 'levelSelect' || id === null;
    },

    setServerEndpoint({ ip, port } = {}) {
        if (ip != null && ip !== '') this.serverInfo.ip = ip;
        if (port != null && Number.isFinite(Number(port))) this.serverInfo.port = Number(port);
    },

    /**
     * 初始化：关卡场景可多次调用；若已连接则只更新回调并立即触发 onConfigLoaded（用最近一次 connected 数据）
     * @param {Object} options
     * @param {boolean} [options.bootstrapLobby] - 仅主页启动时 true，建立唯一连接
     */
    init(options = {}) {
        if (options.bootstrapLobby) {
            this.callbacks.onConfigLoaded = null;
            this.callbacks.onControllerUpdate = null;
            this.loadingScreen = null;
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                this.connect();
            }
            return;
        }

        this.callbacks.onConfigLoaded = options.onConfigLoaded || null;
        this.callbacks.onControllerUpdate = options.onControllerUpdate || null;
        this.loadingScreen = options.loadingScreen || null;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // 推迟到微任务：场景 mount 里往往在 GameWebSocket.init 之后才声明 initControllerAfterConfig 等，
            // 同步调用会触发 let 暂时性死区（Cannot access before initialization）。
            const gd = this._lastConnectedData && this._lastConnectedData.game_data;
            const cbLoad = this.callbacks.onConfigLoaded;
            const cbUpdate = this.callbacks.onControllerUpdate;
            const loadingScreen = this.loadingScreen;
            queueMicrotask(() => {
                if (cbLoad) {
                    try {
                        cbLoad(gd);
                    } catch (e) {
                        console.error('[GameWebSocket] onConfigLoaded:', e);
                    }
                }
                if (cbUpdate) {
                    try {
                        cbUpdate();
                    } catch (e) {
                        console.error('[GameWebSocket] onControllerUpdate:', e);
                    }
                }
                if (loadingScreen && loadingScreen.setConfigLoaded) {
                    loadingScreen.setConfigLoaded();
                }
                this.sendGameState('playing');
            });
            return;
        }

        this.connect();
    },

    connect() {
        const protocol = (window.location && window.location.protocol === 'https:') ? 'wss' : 'ws';

        // 优先使用服务端给出的 endpoint（Tauri dev server 下 window.location.host 可能是 1430，不是 8088）
        // fallback：即使没拿到 serverInfo，也固定连 8088，避免把 /ws/game 连到前端 dev server。
        const hostname = window.location && window.location.hostname ? window.location.hostname : 'localhost';
        const port = (this.serverInfo && this.serverInfo.port) ? this.serverInfo.port : 8088;
        let host;
        if (this.serverInfo && this.serverInfo.ip) {
            host = `${this.serverInfo.ip}:${port}`;
        } else {
            host = `${hostname}:${port}`;
        }

        const wsUrl = `${protocol}://${host}/ws/game`;
        console.log('[GameWebSocket] 连接游戏服务器:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('[GameWebSocket] 游戏已连接到服务器!');
            this.wsConnected = true;
        };

        this.ws.onclose = () => {
            console.log('[GameWebSocket] 与服务器断开连接');
            this.wsConnected = false;

            if (window.BlockGameMainMenu && typeof BlockGameMainMenu.wsOnSocketClose === 'function') {
                BlockGameMainMenu.wsOnSocketClose();
            }

            if (typeof ControllerManager !== 'undefined') {
                Object.keys(ControllerManager.controllers).forEach((id) => {
                    ControllerManager.onControllerDisconnected(parseInt(id, 10));
                });
            }

            this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('[GameWebSocket] WebSocket 错误:', error);
        };

        this.ws.onmessage = (event) => this.handleMessage(event);
    },

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            const controllerId = data.controller_id;
            const lobby = this._isLobbyScene();

            switch (data.type) {
                case 'connected':
                    this.handleConnected(data);
                    break;

                case 'controller_joined':
                    if (lobby && window.BlockGameMainMenu && typeof BlockGameMainMenu.wsControllerJoined === 'function') {
                        BlockGameMainMenu.wsControllerJoined(data);
                    } else {
                        const actualPlayerId = ControllerManager.onControllerConnected(controllerId);
                        if (actualPlayerId !== null) {
                            this.send({
                                type: 'update_player_id',
                                controller_id: data.controller_id,
                                player_id: actualPlayerId
                            });
                        }
                        if (this.callbacks.onControllerUpdate) {
                            this.callbacks.onControllerUpdate();
                        }
                    }
                    break;

                case 'controller_left':
                    if (lobby && window.BlockGameMainMenu && typeof BlockGameMainMenu.wsControllerLeft === 'function') {
                        BlockGameMainMenu.wsControllerLeft(data);
                    } else {
                        ControllerManager.onControllerDisconnected(controllerId);
                        if (this.callbacks.onControllerUpdate) {
                            this.callbacks.onControllerUpdate();
                        }
                    }
                    break;

                case 'state':
                    if (lobby && window.BlockGameMainMenu && typeof BlockGameMainMenu.wsState === 'function') {
                        BlockGameMainMenu.wsState(data);
                    } else {
                        this.handleControllerState(controllerId, data);
                    }
                    break;

                case 'joystick':
                    if (lobby && window.BlockGameMainMenu && typeof BlockGameMainMenu.wsJoystick === 'function') {
                        BlockGameMainMenu.wsJoystick(data);
                    } else if (typeof ControllerManager !== 'undefined') {
                        const input = ControllerManager.getInput(data.controller_id);
                        if (input) {
                            ControllerManager.updateControllerInput(data.controller_id, { x: data.x, y: data.y }, input.buttons);
                        }
                    }
                    break;

                case 'joystick_release':
                    if (lobby && window.BlockGameMainMenu && typeof BlockGameMainMenu.wsJoystickRelease === 'function') {
                        BlockGameMainMenu.wsJoystickRelease(data);
                    } else if (typeof ControllerManager !== 'undefined') {
                        const input = ControllerManager.getInput(data.controller_id);
                        if (input) {
                            ControllerManager.updateControllerInput(data.controller_id, { x: 0, y: 0 }, input.buttons);
                        }
                    }
                    break;

                case 'button':
                    if (lobby && window.BlockGameMainMenu && typeof BlockGameMainMenu.wsButton === 'function') {
                        BlockGameMainMenu.wsButton(data);
                    } else if (typeof ControllerManager !== 'undefined') {
                        const input = ControllerManager.getInput(data.controller_id);
                        if (input) {
                            const newButtons = { ...input.buttons };
                            newButtons[data.button] = data.action === 'press';
                            ControllerManager.updateControllerInput(data.controller_id, input.joystick, newButtons);
                        }
                    }
                    break;

                case 'save_result':
                case 'load_result':
                    if (data.type === 'load_result' && data.success && typeof PersistedStore !== 'undefined') {
                        PersistedStore.initFromServer(data.data);
                    }
                    break;

                default:
                    console.log('[GameWebSocket] 未知消息类型:', data.type);
            }
        } catch (e) {
            console.log('[GameWebSocket] 收到消息:', event.data, e);
        }
    },

    handleConnected(data) {
        this._lastConnectedData = data;

        if (data.server_ip) {
            this.serverInfo.ip = data.server_ip;
            this.serverInfo.port = data.server_port || 8088;
        }

        this.isDebugMode = data.is_debug === true;
        this.updateDebugPanelVisibility();

        if (typeof PersistedStore !== 'undefined') {
            PersistedStore.setWebSocket(this.ws);
        }

        const lobby = this._isLobbyScene();

        if (lobby && window.BlockGameMainMenu && typeof BlockGameMainMenu.wsHandleConnected === 'function') {
            BlockGameMainMenu.wsHandleConnected(data);
            return;
        }

        if (data.game_data && typeof PersistedStore !== 'undefined') {
            PersistedStore.initFromServer(data.game_data);
        }

        if (this.callbacks.onConfigLoaded) {
            this.callbacks.onConfigLoaded(data.game_data);
        }

        if (typeof ControllerManager !== 'undefined') {
            (data.controllers || []).forEach((c) => {
                ControllerManager.onControllerConnected(c.id);
            });
        }

        if (this.callbacks.onControllerUpdate) {
            this.callbacks.onControllerUpdate();
        }

        if (this.loadingScreen && this.loadingScreen.setConfigLoaded) {
            this.loadingScreen.setConfigLoaded();
        }

        this.sendGameState('playing');
    },

    updateDebugPanelVisibility() {
        if (typeof DebugPanel !== 'undefined') {
            DebugPanel.setVisible(this.isDebugMode);
        } else {
            const debugPanel = document.getElementById('debugLog');
            if (debugPanel) {
                debugPanel.style.display = this.isDebugMode ? 'block' : 'none';
            }
        }
        console.log(`[GameWebSocket] 调试模式: ${this.isDebugMode ? '开启' : '关闭'}`);
    },

    handleControllerState(controllerId, data) {
        if (typeof ControllerManager !== 'undefined') {
            ControllerManager.updateControllerInput(controllerId, data.joystick, data.buttons);
        }

        const btns = data.buttons || {};
        const hasAnyButton = btns.N || btns.S || btns.E || btns.W || btns.Start;
        if (hasAnyButton && this.loadingScreen && this.loadingScreen.handleExternalInput) {
            this.loadingScreen.handleExternalInput();
        }
    },

    sendGameState(state) {
        console.log('[GameWebSocket] 发送游戏状态:', state);
        this.send({ type: 'game_state', state: state });
    },

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('[GameWebSocket] WebSocket 未连接，无法发送消息:', data);
        }
    },

    isConnected() {
        return this.wsConnected;
    },

    getWebSocket() {
        return this.ws;
    },

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

    /** 离开关卡场景时只卸下回调，不断开全局连接 */
    detachScene() {
        this.callbacks.onConfigLoaded = null;
        this.callbacks.onControllerUpdate = null;
        this.loadingScreen = null;
    },

    setupUnloadHandler() {
        if (this.unloadHandlerAttached) return;
        this.unloadHandlerAttached = true;
        window.addEventListener('beforeunload', () => {
            console.log('[GameWebSocket] 页面卸载，发送游戏状态: menu');
            this.sendGameState('menu');
        });
    }
};

if (typeof window !== 'undefined') {
    window.GameWebSocket = GameWebSocket;
}
