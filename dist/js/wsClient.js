/**
 * WebSocket 客户端模块
 * 处理与服务器的连接和消息
 */

/**
 * 创建 WebSocket 客户端
 * @param {object} callbacks - 回调函数
 * @param {string} type - 连接类型 'game' 或 'controller'
 */
function createWSClient(callbacks = {}, type = 'game') {
    const {
        onConnect,
        onDisconnect,
        onControllerJoined,
        onControllerLeft,
        onJoystick,
        onJoystickRelease,
        onButton,
        onServerInfo
    } = callbacks;
    
    let ws = null;
    let serverInfo = { ip: null, port: 8088 };
    let reconnectTimer = null;
    
    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const endpoint = type === 'game' ? '/ws/game' : '/ws';
        const wsUrl = `${protocol}//${window.location.host}${endpoint}`;
        
        console.log(`[WS] 连接到 ${wsUrl}`);
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('[WS] 已连接');
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            onConnect?.();
        };
        
        ws.onclose = () => {
            console.log('[WS] 连接断开，3秒后重连...');
            onDisconnect?.();
            reconnectTimer = setTimeout(connect, 3000);
        };
        
        ws.onerror = (error) => {
            console.error('[WS] 错误:', error);
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (e) {
                console.log('[WS] 收到消息:', event.data);
            }
        };
    }
    
    function handleMessage(data) {
        const { type, controller_id } = data;
        
        switch (type) {
            case 'connected':
                if (data.server_ip) {
                    serverInfo.ip = data.server_ip;
                    serverInfo.port = data.server_port || 8088;
                    onServerInfo?.(serverInfo);
                }
                if (data.controllers) {
                    data.controllers.forEach(c => {
                        onControllerJoined?.(c.id);
                    });
                }
                break;
                
            case 'controller_joined':
                onControllerJoined?.(controller_id);
                break;
                
            case 'controller_left':
                onControllerLeft?.(controller_id);
                break;
                
            case 'joystick':
                onJoystick?.(controller_id, data.x, data.y);
                break;
                
            case 'joystick_release':
                onJoystickRelease?.(controller_id);
                break;
                
            case 'button':
                onButton?.(controller_id, data.button, data.action === 'press');
                break;
        }
    }
    
    function send(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }
    
    function disconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (ws) {
            ws.close();
            ws = null;
        }
    }
    
    function getServerInfo() {
        return serverInfo;
    }
    
    // 自动连接
    connect();
    
    return {
        send,
        disconnect,
        getServerInfo,
        reconnect: connect
    };
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createWSClient };
}

