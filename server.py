"""
赛博朋克控制器服务器
========================
控制器 → 服务器 → 游戏
支持多控制器连接到同一个游戏

使用方法:
1. 安装依赖: pip install -r requirements.txt
2. 运行服务器: python server.py
3. 电脑浏览器访问: http://localhost:8080/game.html
4. 手机浏览器访问: http://电脑IP:8080
"""

import asyncio
import json
import socket
from aiohttp import web
import aiohttp

# 客户端分类
controller_clients = set()  # 控制器客户端
game_clients = set()        # 游戏客户端

# 当前控制状态 (用于新游戏客户端同步)
current_state = {
    'joystick': {'x': 0, 'y': 0},
    'buttons': {'A': False, 'B': False, 'X': False, 'Y': False}
}


def get_local_ip():
    """获取本机局域网IP地址"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


async def broadcast_to_games(message):
    """广播消息到所有游戏客户端"""
    if game_clients:
        await asyncio.gather(
            *[client.send_json(message) for client in game_clients if not client.closed],
            return_exceptions=True
        )


async def websocket_handler(request):
    """WebSocket 连接处理 - 控制器"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    controller_clients.add(ws)
    client_ip = request.remote
    print(f"\n[控制器] 新连接: {client_ip}")
    print(f"[状态] 控制器: {len(controller_clients)}, 游戏: {len(game_clients)}")
    
    # 发送连接成功消息
    await ws.send_json({
        'type': 'connected',
        'message': '控制器已连接！',
        'role': 'controller'
    })
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    msg_type = data.get('type')
                    
                    if msg_type == 'button':
                        button = data.get('button')
                        action = data.get('action')
                        # 更新状态
                        current_state['buttons'][button] = (action == 'press')
                        # 转发到游戏
                        await broadcast_to_games({
                            'type': 'button',
                            'button': button,
                            'action': action
                        })
                        print(f"[按钮] {button} {action}")
                        
                    elif msg_type == 'joystick':
                        x = data.get('x', 0)
                        y = data.get('y', 0)
                        # 更新状态
                        current_state['joystick'] = {'x': x, 'y': y}
                        # 转发到游戏
                        await broadcast_to_games({
                            'type': 'joystick',
                            'x': x,
                            'y': y
                        })
                        
                    elif msg_type == 'joystick_release':
                        # 更新状态
                        current_state['joystick'] = {'x': 0, 'y': 0}
                        # 转发到游戏
                        await broadcast_to_games({
                            'type': 'joystick_release'
                        })
                        print("[摇杆] 释放")
                    
                    elif msg_type == 'ping':
                        # 响应 ping
                        timestamp = data.get('timestamp', 0)
                        await ws.send_json({
                            'type': 'pong',
                            'timestamp': timestamp
                        })
                        
                except json.JSONDecodeError:
                    print(f"[错误] 无效的JSON数据: {msg.data}")
                    
            elif msg.type == aiohttp.WSMsgType.ERROR:
                print(f"[错误] WebSocket错误: {ws.exception()}")
                
    finally:
        controller_clients.discard(ws)
        # 控制器断开时，通知游戏停止所有输入
        await broadcast_to_games({'type': 'joystick_release'})
        for btn in ['A', 'B', 'X', 'Y']:
            current_state['buttons'][btn] = False
            await broadcast_to_games({'type': 'button', 'button': btn, 'action': 'release'})
        print(f"\n[控制器] 断开: {client_ip}")
        print(f"[状态] 控制器: {len(controller_clients)}, 游戏: {len(game_clients)}")
    
    return ws


async def game_websocket_handler(request):
    """WebSocket 连接处理 - 游戏"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    game_clients.add(ws)
    client_ip = request.remote
    print(f"\n[游戏] 新连接: {client_ip}")
    print(f"[状态] 控制器: {len(controller_clients)}, 游戏: {len(game_clients)}")
    
    # 发送连接成功消息和当前控制器数量
    await ws.send_json({
        'type': 'connected',
        'message': '游戏已连接！',
        'role': 'game',
        'controllers': len(controller_clients)
    })
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    msg_type = data.get('type')
                    
                    if msg_type == 'ping':
                        timestamp = data.get('timestamp', 0)
                        await ws.send_json({
                            'type': 'pong',
                            'timestamp': timestamp
                        })
                        
                except json.JSONDecodeError:
                    pass
                    
            elif msg.type == aiohttp.WSMsgType.ERROR:
                print(f"[错误] WebSocket错误: {ws.exception()}")
                
    finally:
        game_clients.discard(ws)
        print(f"\n[游戏] 断开: {client_ip}")
        print(f"[状态] 控制器: {len(controller_clients)}, 游戏: {len(game_clients)}")
    
    return ws


async def index_handler(request):
    """提供控制器页面"""
    return web.FileResponse('./controller.html')


async def game_handler(request):
    """提供游戏页面"""
    return web.FileResponse('./game.html')


async def static_handler(request):
    """静态文件处理"""
    filename = request.match_info.get('filename', 'index.html')
    return web.FileResponse(f'./{filename}')


def create_app():
    """创建 Web 应用"""
    app = web.Application()
    app.router.add_get('/', index_handler)
    app.router.add_get('/ws', websocket_handler)           # 控制器 WebSocket
    app.router.add_get('/ws/game', game_websocket_handler) # 游戏 WebSocket
    app.router.add_get('/game.html', game_handler)
    app.router.add_get('/{filename}', static_handler)
    return app


def print_banner(ip, port):
    """打印启动横幅"""
    print("\n" + "=" * 60)
    print("  ██████╗██╗   ██╗██████╗ ███████╗██████╗ ")
    print(" ██╔════╝╚██╗ ██╔╝██╔══██╗██╔════╝██╔══██╗")
    print(" ██║      ╚████╔╝ ██████╔╝█████╗  ██████╔╝")
    print(" ██║       ╚██╔╝  ██╔══██╗██╔══╝  ██╔══██╗")
    print(" ╚██████╗   ██║   ██████╔╝███████╗██║  ██║")
    print("  ╚═════╝   ╚═╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝")
    print("        赛 博 朋 克 控 制 器 服 务 器")
    print("=" * 60)
    print(f"\n  🎮 游戏页面: http://localhost:{port}/game.html")
    print(f"  📱 控制器:   http://{ip}:{port}")
    print(f"\n  手机和电脑需要在同一局域网!")
    print("=" * 60)
    print("\n[架构] 控制器 → 服务器 → 游戏")
    print("  • 支持多个控制器连接")
    print("  • 游戏可以在任意设备上运行")
    print("  • 信号直接转发，无键盘模拟")
    print("\n" + "-" * 60)
    print("等待连接...\n")


if __name__ == '__main__':
    HOST = '0.0.0.0'
    PORT = 8080
    
    local_ip = get_local_ip()
    print_banner(local_ip, PORT)
    
    app = create_app()
    web.run_app(app, host=HOST, port=PORT, print=None)
