"""
赛博朋克控制器服务器
========================
控制器 → 服务器 → 游戏
支持多控制器连接到同一个游戏

使用方法:
1. 安装依赖: pip install -r requirements.txt
2. 运行服务器: python server.py
3. 电脑浏览器访问: http://localhost:8080/gameEatAndAvoid.html
4. 手机浏览器访问: http://电脑IP:8080
"""

import asyncio
import json
import socket
from aiohttp import web
import aiohttp

# 客户端分类
controller_clients = {}     # 控制器客户端 {controller_id: ws}
game_clients = set()        # 游戏客户端
MAX_CONTROLLERS = 4         # 最大控制器数量

# 每个控制器的状态 {controller_id: {...}}
controller_states = {}


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


def allocate_controller_id():
    """分配控制器 ID（优先复用空闲的较小 ID）"""
    # 从 1 开始找第一个空闲的 ID
    for i in range(1, MAX_CONTROLLERS + 1):
        if i not in controller_clients:
            return i
    # 如果都满了，返回 None
    return None


def get_controller_list():
    """获取当前控制器列表"""
    return [{'id': cid, 'connected': True} for cid in controller_clients.keys()]


async def websocket_handler(request):
    """WebSocket 连接处理 - 控制器"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    # 分配控制器 ID
    controller_id = allocate_controller_id()
    
    # 检查是否已满
    if controller_id is None:
        await ws.send_json({
            'type': 'error',
            'message': f'控制器数量已达上限 ({MAX_CONTROLLERS})'
        })
        await ws.close()
        return ws
    
    controller_clients[controller_id] = ws
    controller_states[controller_id] = {
        'joystick': {'x': 0, 'y': 0},
        'buttons': {'N': False, 'S': False, 'E': False, 'W': False}
    }
    
    client_ip = request.remote
    print(f"\n[控制器 P{controller_id}] 新连接: {client_ip}")
    print(f"[状态] 控制器: {len(controller_clients)}/{MAX_CONTROLLERS}, 游戏: {len(game_clients)}")
    
    # 发送连接成功消息（包含控制器 ID）
    await ws.send_json({
        'type': 'connected',
        'message': '控制器已连接！',
        'role': 'controller',
        'controller_id': controller_id
    })
    
    # 通知所有游戏有新控制器加入
    await broadcast_to_games({
        'type': 'controller_joined',
        'controller_id': controller_id,
        'controllers': get_controller_list()
    })
    
    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    msg_type = data.get('type')
                    
                    if msg_type == 'state':
                        # 轮询模式：完整状态包
                        joystick = data.get('joystick', {'x': 0, 'y': 0})
                        buttons = data.get('buttons', {'N': False, 'S': False, 'E': False, 'W': False})
                        # 更新该控制器的状态
                        controller_states[controller_id] = {
                            'joystick': joystick,
                            'buttons': buttons
                        }
                        # 转发完整状态到游戏
                        await broadcast_to_games({
                            'type': 'state',
                            'controller_id': controller_id,
                            'joystick': joystick,
                            'buttons': buttons
                        })
                    
                    elif msg_type == 'button':
                        # 兼容事件驱动模式
                        button = data.get('button')
                        action = data.get('action')
                        controller_states[controller_id]['buttons'][button] = (action == 'press')
                        await broadcast_to_games({
                            'type': 'button',
                            'controller_id': controller_id,
                            'button': button,
                            'action': action
                        })
                        print(f"[P{controller_id} 按钮] {button} {action}")
                        
                    elif msg_type == 'joystick':
                        # 兼容事件驱动模式
                        x = data.get('x', 0)
                        y = data.get('y', 0)
                        controller_states[controller_id]['joystick'] = {'x': x, 'y': y}
                        await broadcast_to_games({
                            'type': 'joystick',
                            'controller_id': controller_id,
                            'x': x,
                            'y': y
                        })
                        
                    elif msg_type == 'joystick_release':
                        # 兼容事件驱动模式
                        controller_states[controller_id]['joystick'] = {'x': 0, 'y': 0}
                        await broadcast_to_games({
                            'type': 'joystick_release',
                            'controller_id': controller_id
                        })
                        print(f"[P{controller_id} 摇杆] 释放")
                    
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
        # 清理该控制器
        del controller_clients[controller_id]
        del controller_states[controller_id]
        
        # 通知游戏该控制器断开，释放所有输入
        await broadcast_to_games({
            'type': 'controller_left',
            'controller_id': controller_id,
            'controllers': get_controller_list()
        })
        # 发送一个清零的状态包（轮询模式兼容）
        await broadcast_to_games({
            'type': 'state',
            'controller_id': controller_id,
            'joystick': {'x': 0, 'y': 0},
            'buttons': {'N': False, 'S': False, 'E': False, 'W': False}
        })
        
        print(f"\n[控制器 P{controller_id}] 断开: {client_ip}")
        print(f"[状态] 控制器: {len(controller_clients)}/{MAX_CONTROLLERS}, 游戏: {len(game_clients)}")
    
    return ws


async def game_websocket_handler(request):
    """WebSocket 连接处理 - 游戏"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    game_clients.add(ws)
    client_ip = request.remote
    print(f"\n[游戏] 新连接: {client_ip}")
    print(f"[状态] 控制器: {len(controller_clients)}, 游戏: {len(game_clients)}")
    
    # 发送连接成功消息和当前控制器列表
    await ws.send_json({
        'type': 'connected',
        'message': '游戏已连接！',
        'role': 'game',
        'controllers': get_controller_list(),
        'server_ip': get_local_ip(),
        'server_port': 8080
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
    """提供主页"""
    return web.FileResponse('./index.html')


async def controller_handler(request):
    """提供控制器页面"""
    return web.FileResponse('./controller.html')


async def game_handler(request):
    """提供游戏页面"""
    return web.FileResponse('./gameEatAndAvoid.html')


async def test_handler(request):
    """提供测试页面"""
    return web.FileResponse('./test.html')


async def static_handler(request):
    """静态文件处理"""
    filename = request.match_info.get('filename', 'index.html')
    return web.FileResponse(f'./{filename}')


async def js_handler(request):
    """JS 模块处理"""
    filename = request.match_info.get('filename')
    filepath = f'./js/{filename}'
    return web.FileResponse(filepath)


async def source_handler(request):
    """资源文件处理（音效、图片等）"""
    filename = request.match_info.get('filename')
    filepath = f'./source/{filename}'
    return web.FileResponse(filepath)


def create_app():
    """创建 Web 应用"""
    app = web.Application()
    app.router.add_get('/', index_handler)
    app.router.add_get('/ws', websocket_handler)           # 控制器 WebSocket
    app.router.add_get('/ws/game', game_websocket_handler) # 游戏 WebSocket
    app.router.add_get('/gameEatAndAvoid.html', game_handler)
    app.router.add_get('/test', test_handler)              # 测试页面
    app.router.add_get('/js/{filename}', js_handler)       # JS 模块
    app.router.add_get('/source/{filename}', source_handler)  # 资源文件（音效等）
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
    print("         方 寸 枢 机 游 戏 服 务 器")
    print("=" * 60)
    print(f"\n  🏠 主页:     http://localhost:{port}")
    print(f"  🎮 游戏:     http://localhost:{port}/gameEatAndAvoid.html")
    print(f"  📱 控制器:   http://{ip}:{port}/controller.html")
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
