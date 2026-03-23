window.MainMenuWsLifecycleHandlers = (function () {
    function register(options) {
        const {
            target,
            state,
            controllerManager,
            persistedStore,
            gameWebSocket,
            fpsOverlay,
            mainMenuUI,
            initControllerAfterConfig,
            updateControllerUI,
            syncPlayerMovementConfig
        } = options || {};

        if (!target || !state || !controllerManager || !persistedStore || !gameWebSocket || !updateControllerUI) {
            console.warn('[MainMenuWsLifecycleHandlers] 缺少必要依赖，跳过注册');
            return;
        }

        target.wsHandleConnected = function (data) {
            const continueAfterPersistLoaded = () => {
                if (state.getControllerInitialized()) {
                    if (typeof controllerManager.refreshKeyboardEnabledFromStore === 'function') {
                        controllerManager.refreshKeyboardEnabledFromStore();
                    }
                } else if (typeof initControllerAfterConfig === 'function') {
                    initControllerAfterConfig();
                }

                Object.keys(state.players).forEach((id) => {
                    const savedColor = persistedStore.playerColors.getPlayerColor(id);
                    state.playerColors[id] = savedColor.id || parseInt(id, 10);
                    persistedStore.playerColors.applyToPlayer(state.players[id]);
                });
                if (typeof state.updateWardrobeUI === 'function') {
                    state.updateWardrobeUI();
                }

                if (fpsOverlay && typeof fpsOverlay.setVisible === 'function') {
                    fpsOverlay.setVisible(persistedStore.gameSettings.getFpsOverlayEnabled());
                }

                if (typeof controllerManager.resetAllPlayers === 'function' && typeof syncPlayerMovementConfig === 'function') {
                    controllerManager.resetAllPlayers((p) => {
                        syncPlayerMovementConfig(p, p.width);
                    });
                }

                if (data.server_ip) {
                    if (mainMenuUI && typeof mainMenuUI.setServerInfo === 'function') {
                        mainMenuUI.setServerInfo({ ip: data.server_ip, port: data.server_port || 8088 });
                    }
                    console.log('调用 generateQRCode，IP:', data.server_ip);
                    if (mainMenuUI && typeof mainMenuUI.generateQRCode === 'function') {
                        mainMenuUI.generateQRCode();
                    }
                    console.log('二维码生成完成');
                } else {
                    console.log('没有 server_ip 字段！');
                }

                if (data.controllers) {
                    const connectedControllers = state.getConnectedControllers();
                    Object.keys(connectedControllers).forEach((k) => delete connectedControllers[k]);

                    data.controllers.forEach((c) => {
                        connectedControllers[c.id] = true;
                        const actualPlayerId = controllerManager.onControllerConnected(c.id);
                        if (actualPlayerId !== null) {
                            gameWebSocket.send({
                                type: 'update_player_id',
                                controller_id: c.id,
                                player_id: actualPlayerId
                            });
                        }
                    });
                    updateControllerUI();
                }

                console.log('[Main] 配置加载完成');
            };

            if (data.game_data) {
                persistedStore.initFromServer(data.game_data);
                console.log('[PersistedStore] 从服务器加载存档完成');
                continueAfterPersistLoaded();
            } else {
                persistedStore.load()
                    .then(() => {
                        console.log('[PersistedStore] 无 game_data，已从 load() 就绪');
                        continueAfterPersistLoaded();
                    })
                    .catch((e) => {
                        console.warn('[PersistedStore] load 失败:', e);
                        continueAfterPersistLoaded();
                    });
            }
        };

        target.wsControllerJoined = function (data) {
            const connectedControllers = state.getConnectedControllers();
            connectedControllers[data.controller_id] = true;
            const actualPlayerId = controllerManager.onControllerConnected(data.controller_id);
            if (actualPlayerId !== null) {
                gameWebSocket.send({
                    type: 'update_player_id',
                    controller_id: data.controller_id,
                    player_id: actualPlayerId
                });
                console.log(`Web手柄 ${data.controller_id} -> P${actualPlayerId}`);
            }
            updateControllerUI();
        };

        target.wsControllerLeft = function (data) {
            const connectedControllers = state.getConnectedControllers();
            delete connectedControllers[data.controller_id];
            controllerManager.onControllerDisconnected(data.controller_id);
            updateControllerUI();
            console.log(`Web手柄 ${data.controller_id} 已断开`);
        };

        target.wsOnSocketClose = function () {
            const connectedControllers = state.getConnectedControllers();
            Object.keys(connectedControllers).forEach((k) => delete connectedControllers[k]);
            updateControllerUI();
        };
    }

    return {
        register
    };
})();
