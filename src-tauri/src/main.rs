// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Arc;
use std::path::PathBuf;
use std::fs::OpenOptions;
use std::io::Write;
use tokio::sync::{broadcast, RwLock};
use axum::{
    Router,
    routing::{get, post},
    extract::{State, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::{IntoResponse, Redirect},
    http::StatusCode,
    Json,
};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::cors::CorsLayer;
use futures_util::{StreamExt, SinkExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::Manager;
use std::sync::OnceLock;
use tauri::AppHandle;

// 全局 AppHandle，用于 WebSocket 访问窗口
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

// ============== 日志工具 ==============

fn log_to_file(message: &str) {
    let timestamp = chrono::Local::now().format("%H:%M:%S%.3f");
    let log_line = format!("[{}] {}\n", timestamp, message);
    
    // 打印到控制台
    print!("{}", log_line);
    
    // 写入临时目录的日志文件（避免触发 Tauri 热重载）
    let log_path = std::env::temp_dir().join("blockgame_server.log");
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = file.write_all(log_line.as_bytes());
    }
}

// ============== 数据结构 ==============

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
struct JoystickState {
    x: f32,
    y: f32,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
struct ButtonState {
    #[serde(rename = "N", default)]
    n: bool,
    #[serde(rename = "S", default)]
    s: bool,
    #[serde(rename = "E", default)]
    e: bool,
    #[serde(rename = "W", default)]
    w: bool,
    #[serde(rename = "Start", default)]
    start: bool,
}

impl Default for ButtonState {
    fn default() -> Self {
        ButtonState { n: false, s: false, e: false, w: false, start: false }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
struct ControllerState {
    joystick: JoystickState,
    buttons: ButtonState,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
enum ClientMessage {
    #[serde(rename = "state")]
    State { joystick: JoystickState, buttons: ButtonState },
    #[serde(rename = "ping")]
    Ping { timestamp: u64 },
    #[serde(rename = "joystick")]
    Joystick { x: f32, y: f32 },
    #[serde(rename = "joystick_release")]
    JoystickRelease,
    #[serde(rename = "button")]
    Button { button: String, action: String },
}

// 广播的消息类型
#[derive(Clone, Debug)]
struct BroadcastMessage {
    content: String,
}

// 服务器状态
struct ServerState {
    controllers: RwLock<HashMap<u8, ControllerState>>,
    game_tx: broadcast::Sender<BroadcastMessage>,
    controller_tx: broadcast::Sender<BroadcastMessage>,  // 向控制器广播的频道
    available_ids: RwLock<Vec<u8>>,
}

const MAX_CONTROLLERS: u8 = 8;

impl ServerState {
    fn new() -> Self {
        // 容量足够多控制器 60Hz 输入时不被背压阻塞（约 8*60*2 条/秒）
        let (game_tx, _) = broadcast::channel(1024);
        let (controller_tx, _) = broadcast::channel(512);
        ServerState {
            controllers: RwLock::new(HashMap::new()),
            game_tx,
            controller_tx,
            available_ids: RwLock::new((1..=MAX_CONTROLLERS).rev().collect()),
        }
    }

    async fn allocate_controller_id(&self) -> Option<u8> {
        let mut ids = self.available_ids.write().await;
        ids.pop()
    }

    async fn release_controller_id(&self, id: u8) {
        let mut ids = self.available_ids.write().await;
        if !ids.contains(&id) {
            ids.push(id);
            ids.sort_by(|a, b| b.cmp(a));
        }
    }

    async fn get_controller_list(&self) -> Vec<serde_json::Value> {
        let controllers = self.controllers.read().await;
        controllers.keys()
            .map(|id| json!({"id": id, "connected": true}))
            .collect()
    }

    fn broadcast_to_games(&self, message: &str) {
        let _ = self.game_tx.send(BroadcastMessage { content: message.to_string() });
    }
    
    fn broadcast_to_controllers(&self, message: &str) {
        let _ = self.controller_tx.send(BroadcastMessage { content: message.to_string() });
    }
}

type AppState = Arc<ServerState>;

// ============== WebSocket 处理 ==============

async fn ws_controller_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_controller(socket, state))
}

async fn ws_game_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let local_ip = get_local_ip();
    ws.on_upgrade(move |socket| handle_game(socket, state, local_ip))
}

async fn handle_controller(socket: WebSocket, state: AppState) {
    let controller_id = match state.allocate_controller_id().await {
        Some(id) => id,
        None => {
            let (mut sender, _) = socket.split();
            let error_msg = json!({
                "type": "error",
                "message": format!("控制器数量已达上限 ({})", MAX_CONTROLLERS)
            });
            let _ = sender.send(Message::Text(error_msg.to_string())).await;
            return;
        }
    };

    log_to_file(&format!("[控制器 P{}] 新连接", controller_id));

    // 注册控制器
    {
        let mut controllers = state.controllers.write().await;
        controllers.insert(controller_id, ControllerState::default());
    }

    let (mut sender, mut receiver) = socket.split();

    // 发送连接成功消息
    let connect_msg = json!({
        "type": "connected",
        "message": "控制器已连接！",
        "role": "controller",
        "controller_id": controller_id
    });
    let _ = sender.send(Message::Text(connect_msg.to_string())).await;

    // 通知所有游戏
    let join_msg = json!({
        "type": "controller_joined",
        "controller_id": controller_id,
        "controllers": state.get_controller_list().await
    });
    state.broadcast_to_games(&join_msg.to_string());

    // 订阅控制器广播频道（用于接收游戏发来的消息）
    let mut ctrl_rx = state.controller_tx.subscribe();

    // 处理消息
    loop {
        tokio::select! {
            // 接收来自游戏的广播消息
            Ok(broadcast_msg) = ctrl_rx.recv() => {
                // 解析消息，判断是否转发
                if let Ok(json_msg) = serde_json::from_str::<serde_json::Value>(&broadcast_msg.content) {
                    let should_forward = if let Some(target_id) = json_msg.get("controller_id").and_then(|c| c.as_u64()) {
                        // 有 controller_id 的消息：只转发给目标控制器
                        target_id == controller_id as u64
                    } else {
                        // 没有 controller_id 的消息（如 game_state）：转发给所有控制器
                        true
                    };
                    
                    if should_forward {
                        if sender.send(Message::Text(broadcast_msg.content)).await.is_err() {
                            break;
                        }
                    }
                }
            }
            // 接收来自控制器的消息
            Some(msg) = receiver.next() => {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    match client_msg {
                        ClientMessage::State { joystick, buttons } => {
                            // 只转发，不写共享 state，避免多控制器时写锁竞争导致延迟
                            let forward_msg = json!({
                                "type": "state",
                                "controller_id": controller_id,
                                "joystick": joystick,
                                "buttons": buttons
                            });
                            state.broadcast_to_games(&forward_msg.to_string());
                        }
                        ClientMessage::Ping { timestamp } => {
                            let pong_msg = json!({
                                "type": "pong",
                                "timestamp": timestamp
                            });
                            let _ = sender.send(Message::Text(pong_msg.to_string())).await;
                        }
                        ClientMessage::Joystick { x, y } => {
                            let forward_msg = json!({
                                "type": "joystick",
                                "controller_id": controller_id,
                                "x": x,
                                "y": y
                            });
                            state.broadcast_to_games(&forward_msg.to_string());
                        }
                        ClientMessage::JoystickRelease => {
                            let forward_msg = json!({
                                "type": "joystick_release",
                                "controller_id": controller_id
                            });
                            state.broadcast_to_games(&forward_msg.to_string());
                        }
                        ClientMessage::Button { button, action } => {
                            let forward_msg = json!({
                                "type": "button",
                                "controller_id": controller_id,
                                "button": button,
                                "action": action
                            });
                            state.broadcast_to_games(&forward_msg.to_string());
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
                }
            }
            else => break,
        }
    }

    // 清理
    {
        let mut controllers = state.controllers.write().await;
        controllers.remove(&controller_id);
    }
    state.release_controller_id(controller_id).await;

    let leave_msg = json!({
        "type": "controller_left",
        "controller_id": controller_id,
        "controllers": state.get_controller_list().await
    });
    state.broadcast_to_games(&leave_msg.to_string());

    let reset_msg = json!({
        "type": "state",
        "controller_id": controller_id,
        "joystick": {"x": 0, "y": 0},
        "buttons": {"N": false, "S": false, "E": false, "W": false, "Start": false}
    });
    state.broadcast_to_games(&reset_msg.to_string());

    log_to_file(&format!("[控制器 P{}] 断开", controller_id));
}

async fn handle_game(socket: WebSocket, state: AppState, local_ip: String) {
    log_to_file("[游戏] 新连接");

    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.game_tx.subscribe();

    // 发送连接成功消息（同时发送已保存的游戏数据）
    let saved_data = load_game_data_internal().unwrap_or_else(|_| "{}".to_string());
    let is_debug = cfg!(debug_assertions);  // debug 模式为 true，release 模式为 false
    let connect_msg = json!({
        "type": "connected",
        "message": "游戏已连接！",
        "role": "game",
        "controllers": state.get_controller_list().await,
        "server_ip": local_ip,
        "server_port": 8088,
        "game_data": saved_data,
        "is_debug": is_debug
    });
    let _ = sender.send(Message::Text(connect_msg.to_string())).await;

    loop {
        tokio::select! {
            Ok(msg) = rx.recv() => {
                if sender.send(Message::Text(msg.content)).await.is_err() {
                    break;
                }
            }
            Some(msg) = receiver.next() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        // 解析 JSON 消息
                        if let Ok(json_msg) = serde_json::from_str::<serde_json::Value>(&text) {
                            match json_msg.get("type").and_then(|t| t.as_str()) {
                                Some("ping") => {
                                    if let Some(timestamp) = json_msg.get("timestamp").and_then(|t| t.as_u64()) {
                                        let pong_msg = json!({
                                            "type": "pong",
                                            "timestamp": timestamp
                                        });
                                        let _ = sender.send(Message::Text(pong_msg.to_string())).await;
                                    }
                                }
                                Some("save_data") => {
                                    // 保存游戏数据
                                    if let Some(data) = json_msg.get("data").and_then(|d| d.as_str()) {
                                        log_to_file(&format!("[WebSocket] 收到保存请求，数据长度: {}", data.len()));
                                        let result = save_game_data_internal(data);
                                        let response = json!({
                                            "type": "save_result",
                                            "success": result.is_ok(),
                                            "message": result.err().unwrap_or_else(|| "保存成功".to_string())
                                        });
                                        let _ = sender.send(Message::Text(response.to_string())).await;
                                    }
                                }
                                Some("load_data") => {
                                    // 加载游戏数据
                                    log_to_file("[WebSocket] 收到加载请求");
                                    let result = load_game_data_internal();
                                    let response = json!({
                                        "type": "load_result",
                                        "success": result.is_ok(),
                                        "data": result.as_ref().ok().cloned().unwrap_or_else(|| "{}".to_string()),
                                        "message": result.err().unwrap_or_else(|| "加载成功".to_string())
                                    });
                                    let _ = sender.send(Message::Text(response.to_string())).await;
                                }
                                Some("exit_app") => {
                                    // 退出应用
                                    log_to_file("[WebSocket] 收到退出请求，正在关闭应用...");
                                    std::process::exit(0);
                                }
                                Some("update_player_id") => {
                                    // 游戏通知控制器更新玩家编号
                                    if let (Some(controller_id), Some(player_id)) = (
                                        json_msg.get("controller_id").and_then(|c| c.as_u64()),
                                        json_msg.get("player_id").and_then(|p| p.as_u64())
                                    ) {
                                        log_to_file(&format!("[WebSocket] 更新玩家编号: 控制器{} -> P{}", controller_id, player_id));
                                        let update_msg = json!({
                                            "type": "player_id_updated",
                                            "controller_id": controller_id,
                                            "player_id": player_id
                                        });
                                        state.broadcast_to_controllers(&update_msg.to_string());
                                    }
                                }
                                Some("vibrate") => {
                                    // 游戏请求控制器振动
                                    if let Some(controller_id) = json_msg.get("controller_id").and_then(|c| c.as_u64()) {
                                        let duration = json_msg.get("duration").and_then(|d| d.as_u64()).unwrap_or(200);
                                        log_to_file(&format!("[WebSocket] 振动指令: 控制器{}, {}ms", controller_id, duration));
                                        let vibrate_msg = json!({
                                            "type": "vibrate",
                                            "controller_id": controller_id,
                                            "duration": duration
                                        });
                                        state.broadcast_to_controllers(&vibrate_msg.to_string());
                                    }
                                }
                                Some("game_state") => {
                                    // 游戏状态变化，通知所有控制器
                                    if let Some(game_state) = json_msg.get("state").and_then(|s| s.as_str()) {
                                        log_to_file(&format!("[WebSocket] 游戏状态: {}", game_state));
                                        let state_msg = json!({
                                            "type": "game_state",
                                            "state": game_state
                                        });
                                        state.broadcast_to_controllers(&state_msg.to_string());
                                    }
                                }
                                Some("set_fullscreen") => {
                                    // 设置全屏（通过 WebSocket 调用）
                                    if let Some(fullscreen) = json_msg.get("fullscreen").and_then(|f| f.as_bool()) {
                                        log_to_file(&format!("[WebSocket] 设置全屏: {}", fullscreen));
                                        
                                        // 使用全局 AppHandle 访问窗口
                                        if let Some(app_handle) = APP_HANDLE.get() {
                                            if let Some(window) = app_handle.get_webview_window("main") {
                                                match window.set_fullscreen(fullscreen) {
                                                    Ok(_) => {
                                                        log_to_file(&format!("[WebSocket] 全屏设置成功: {}", fullscreen));
                                                        // 发送成功响应
                                                        let response = json!({
                                                            "type": "fullscreen_result",
                                                            "success": true,
                                                            "fullscreen": fullscreen
                                                        });
                                                        let _ = sender.send(Message::Text(response.to_string())).await;
                                                    }
                                                    Err(e) => {
                                                        log_to_file(&format!("[WebSocket] 全屏设置失败: {}", e));
                                                        let response = json!({
                                                            "type": "fullscreen_result",
                                                            "success": false,
                                                            "error": e.to_string()
                                                        });
                                                        let _ = sender.send(Message::Text(response.to_string())).await;
                                                    }
                                                }
                                            } else {
                                                log_to_file("[WebSocket] 找不到主窗口");
                                            }
                                        } else {
                                            log_to_file("[WebSocket] AppHandle 未初始化");
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(_) => break,
                    _ => {}
                }
            }
            else => break,
        }
    }

    log_to_file("[游戏] 断开");
}

// ============== 工具函数 ==============

fn get_local_ip() -> String {
    // 只找以太网接口的 IP（名称包含"以太网"或"Ethernet"）
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (name, ip) in &interfaces {
            if ip.is_ipv4() {
                let name_lower = name.to_lowercase();
                if name_lower.contains("以太网") || name_lower.contains("ethernet") {
                    let ip_str = ip.to_string();
                    if ip_str.starts_with("192.168.") || ip_str.starts_with("10.") {
                        return ip_str;
                    }
                }
            }
        }
        // 如果没找到以太网，找任何 192.168.x.x 的地址
        for (_, ip) in &interfaces {
            if ip.is_ipv4() {
                let ip_str = ip.to_string();
                if ip_str.starts_with("192.168.") && !ip_str.ends_with(".1") {
                    return ip_str;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

fn get_base_path() -> PathBuf {
    if cfg!(debug_assertions) {
        // 开发模式下使用 dist 目录
        // cargo tauri dev 的工作目录是 src-tauri，所以需要往上一层找 dist
        let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        
        // 尝试多个路径
        let possible = vec![
            current.join("dist"),           // 如果已经在项目根目录
            current.join("..").join("dist"), // 如果在 src-tauri 目录
        ];
        
        for path in &possible {
            if path.join("controller.html").exists() {
                return path.canonicalize().unwrap_or(path.to_path_buf());
            }
        }
        
        // 默认返回
        current.join("dist")
    } else {
        // 发布模式下使用资源目录
        let exe_path = std::env::current_exe().unwrap();
        let exe_dir = exe_path.parent().unwrap();
        
        // 尝试多个可能的路径
        let possible_paths = vec![
            exe_dir.join("web"),                              // NSIS: <install>/web
            exe_dir.join("resources").join("web"),            // 备选
            exe_dir.join("..").join("Resources").join("web"), // macOS bundle
        ];
        
        for path in &possible_paths {
            if path.exists() {
                println!("找到资源目录: {:?}", path);
                return path.to_path_buf();
            }
        }
        
        println!("警告: 未找到资源目录，使用 exe 目录");
        exe_dir.to_path_buf()
    }
}

// ============== 存档系统 ==============

const SAVE_KEY: &[u8] = b"BlockGame2026!@#";  // XOR 加密密钥

// 简单 XOR 加密/解密
fn xor_crypt(data: &[u8], key: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, &b)| b ^ key[i % key.len()])
        .collect()
}

// 计算简单校验和
fn checksum(data: &[u8]) -> u32 {
    let mut sum: u32 = 0;
    for &b in data {
        sum = sum.wrapping_add(b as u32);
        sum = sum.wrapping_mul(31);
    }
    sum
}

// 获取存档文件路径
fn get_save_path() -> PathBuf {
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    let exe_dir = exe_path.parent().unwrap_or_else(|| std::path::Path::new("."));
    
    // 存档目录：与 exe 同级的 saves 文件夹
    let save_dir = exe_dir.join("saves");
    
    // 确保目录存在
    let _ = std::fs::create_dir_all(&save_dir);
    
    save_dir.join("game_data.sav")
}

#[tauri::command]
fn save_game_data(data: String) -> Result<bool, String> {
    save_game_data_internal(&data)
}

#[tauri::command]
fn load_game_data() -> Result<String, String> {
    load_game_data_internal()
}

// ============== HTTP API ==============

#[derive(Deserialize)]
struct SaveRequest {
    data: String,
}

#[derive(Serialize)]
struct SaveResponse {
    success: bool,
    message: String,
}

#[derive(Serialize)]
struct LoadResponse {
    success: bool,
    data: String,
    message: String,
}

async fn api_save_handler(Json(payload): Json<SaveRequest>) -> Json<SaveResponse> {
    log_to_file("[HTTP API] 收到保存请求");
    
    match save_game_data_internal(&payload.data) {
        Ok(_) => Json(SaveResponse {
            success: true,
            message: "保存成功".to_string(),
        }),
        Err(e) => Json(SaveResponse {
            success: false,
            message: e,
        }),
    }
}

async fn api_load_handler() -> Json<LoadResponse> {
    log_to_file("[HTTP API] 收到加载请求");
    
    match load_game_data_internal() {
        Ok(data) => Json(LoadResponse {
            success: true,
            data,
            message: "加载成功".to_string(),
        }),
        Err(e) => Json(LoadResponse {
            success: false,
            data: "{}".to_string(),
            message: e,
        }),
    }
}

async fn controller_route_handler() -> Redirect {
    Redirect::permanent("/controller.html")
}

async fn root_route_handler() -> (StatusCode, &'static str) {
    (
        StatusCode::NOT_FOUND,
        "BlockGame route required. Use /game or /controller",
    )
}

async fn index_block_handler() -> (StatusCode, &'static str) {
    (
        StatusCode::NOT_FOUND,
        "Index route disabled. Use /game",
    )
}

// 内部存档函数（供 Tauri 命令和 HTTP API 共用）
fn save_game_data_internal(data: &str) -> Result<bool, String> {
    let save_path = get_save_path();
    log_to_file(&format!("[存档] 保存到: {:?}", save_path));
    
    let json_bytes = data.as_bytes();
    let sum = checksum(json_bytes);
    let encrypted = xor_crypt(json_bytes, SAVE_KEY);
    
    let mut save_data = Vec::new();
    save_data.extend_from_slice(&sum.to_le_bytes());
    save_data.extend_from_slice(&encrypted);
    
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &save_data);
    
    match std::fs::write(&save_path, encoded) {
        Ok(_) => {
            log_to_file(&format!("[存档] 保存成功，大小: {} 字节", data.len()));
            Ok(true)
        }
        Err(e) => {
            log_to_file(&format!("[存档] 保存失败: {}", e));
            Err(format!("保存失败: {}", e))
        }
    }
}

fn load_game_data_internal() -> Result<String, String> {
    let save_path = get_save_path();
    log_to_file(&format!("[存档] 读取: {:?}", save_path));
    
    let encoded = match std::fs::read_to_string(&save_path) {
        Ok(s) => s,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                log_to_file("[存档] 文件不存在，返回空数据");
                return Ok("{}".to_string());
            }
            return Err(format!("读取失败: {}", e));
        }
    };
    
    let save_data = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded.trim())
        .map_err(|e| format!("解码失败: {}", e))?;
    
    if save_data.len() < 4 {
        return Err("存档文件损坏".to_string());
    }
    
    let stored_sum = u32::from_le_bytes([save_data[0], save_data[1], save_data[2], save_data[3]]);
    let encrypted = &save_data[4..];
    let decrypted = xor_crypt(encrypted, SAVE_KEY);
    
    let computed_sum = checksum(&decrypted);
    if stored_sum != computed_sum {
        log_to_file("[存档] 校验和不匹配，存档可能被篡改！");
        return Err("存档校验失败，可能已被篡改".to_string());
    }
    
    let json_str = String::from_utf8(decrypted)
        .map_err(|e| format!("数据损坏: {}", e))?;
    
    log_to_file(&format!("[存档] 读取成功，大小: {} 字节", json_str.len()));
    Ok(json_str)
}

// 读取显示模式设置（用于启动时决定是否全屏）
// 默认值为全屏模式，这样首次安装打开就是全屏
fn get_display_mode_from_save() -> String {
    match load_game_data_internal() {
        Ok(json_str) => {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(mode) = data.get("gameSettings")
                    .and_then(|s| s.get("displayMode"))
                    .and_then(|m| m.as_str()) 
                {
                    log_to_file(&format!("[启动] 读取到显示模式: {}", mode));
                    return mode.to_string();
                }
            }
            log_to_file("[启动] 未找到显示模式设置，使用默认全屏模式");
            "fullscreen".to_string()
        }
        Err(_) => {
            log_to_file("[启动] 无法读取存档，使用默认全屏模式");
            "fullscreen".to_string()
        }
    }
}

// ============== Tauri 命令 ==============

#[tauri::command]
fn get_server_info() -> serde_json::Value {
    json!({
        "ip": get_local_ip(),
        "port": 8088
    })
}

#[tauri::command]
fn set_fullscreen(window: tauri::Window, fullscreen: bool) -> Result<bool, String> {
    log_to_file(&format!("[全屏] 设置全屏: {}", fullscreen));
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())?;
    Ok(fullscreen)
}

#[tauri::command]
fn is_fullscreen(window: tauri::Window) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}

// ============== 主函数 ==============

fn main() {
    let base_path = get_base_path();
    println!("基础路径: {:?}", base_path);

    // 在后台启动服务器
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let state = Arc::new(ServerState::new());
            let local_ip = get_local_ip();

            // 创建路由
            let game_entry_file = base_path.join("index.html");
            let app = Router::new()
                .route("/", get(root_route_handler))
                .route("/index.html", get(index_block_handler))
                .route_service("/game", ServeFile::new(game_entry_file))
                .route("/ws", get(ws_controller_handler))
                .route("/ws/game", get(ws_game_handler))
                .route("/controller", get(controller_route_handler))
                .route("/api/save", post(api_save_handler))
                .route("/api/load", get(api_load_handler))
                .fallback_service(ServeDir::new(&base_path))
                .layer(CorsLayer::permissive())
                .with_state(state);

            // 启动服务器
            let addr = "0.0.0.0:8088";
            let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
            
            println!("\n========================================");
            println!("  方寸枢机 游戏服务器");
            println!("========================================");
            println!("  游戏入口: http://{}:8088/game", local_ip);
            println!("  控制器地址: http://{}:8088/controller", local_ip);
            println!("  WebSocket: ws://localhost:8088/ws/game");
            println!("========================================\n");

            axum::serve(listener, app).await.unwrap();
        });
    });

    // 启动前读取显示模式设置
    let display_mode = get_display_mode_from_save();
    let should_fullscreen = display_mode == "fullscreen";
    log_to_file(&format!("[启动] 显示模式: {}, 全屏: {}", display_mode, should_fullscreen));

    tauri::Builder::default()
        .setup(move |app| {
            // 保存 AppHandle 到全局变量，供 WebSocket 使用
            let _ = APP_HANDLE.set(app.handle().clone());
            log_to_file("[启动] AppHandle 已保存到全局变量");
            
            // 获取主窗口并设置全屏
            if should_fullscreen {
                if let Some(window) = app.get_webview_window("main") {
                    log_to_file("[启动] 设置窗口为全屏模式");
                    let _ = window.set_fullscreen(true);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_info, save_game_data, load_game_data, set_fullscreen, is_fullscreen])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}
