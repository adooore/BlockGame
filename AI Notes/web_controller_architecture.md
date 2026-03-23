# 网页控制器架构说明与「不经过 Rust」方案

## 一、当前实现（控制器消息经 Rust 转发）

### 1. 连接关系

| 端 | 连接地址 | 说明 |
|----|----------|------|
| **游戏页** (index.html) | `ws://localhost:8088/ws/game` | 连到 Rust 服务；收存档、控制器加入/离开、手柄 state/button，并用于 PersistedStore 存读档 |
| **控制器页** (controller.html) | `ws://${location.host}/ws` | 手机打开时是 `ws://PC的IP:8088/ws`，同样连到 Rust 服务 |

### 2. 消息流（当前）

```
控制器页 (手机/另一标签)  --WS-->  Rust (8088)  --WS-->  游戏页
      发送 state/button              转发              更新 ControllerManager
      接收 vibrate/game_state        转发              游戏页发 game_state 等
```

- 控制器输入：**一定经过 Rust**（Rust 做转发）。
- 存档读写在游戏页 ↔ Rust 之间，本来就需要 Rust。

### 3. 相关代码位置

- **游戏页**：`mainEntry.js` 里 `initWebSocket()` → `gameWs = new WebSocket('ws://localhost:8088/ws/game')`，`onmessage` 里根据 `data.type`（`controller_joined` / `state` / `button` 等）调 `ControllerManager.updateControllerInput`。
- **场景**：部分场景用 `GameWebSocket.init()` 再连一次同一地址，同样在 `handleMessage` 里处理控制器消息。
- **控制器页**：`controller.html` 内联脚本里 `connectWebSocket()` → `ws = new WebSocket(protocol + '//' + host + '/ws')`，轮询 `sendControllerState()` 发 `{ type: 'state', joystick, buttons }`。

---

## 二、你的目标

- 希望**尽量统一**、**控制器相关消息在「网页这边」转发/通行，不经过 Rust**。

浏览器限制：**网页不能主动「开一个 WebSocket 服务」**，不能像 Rust 那样在 8088 上 listen 等别人来连。所以：

- **同设备、两个标签（游戏 + 控制器）**：可以用**只在网页里跑的通道**（例如 BroadcastChannel / SharedWorker）在两条页之间直连，**可以不经过 Rust**。
- **跨设备（手机当手柄）**：必须有一个「两边都能连上的中间人」；若不想用 Rust，就要换成别的服务器（Node/云函数/第三方 WS 中继等），本质仍是「经某服务转发」。

下面只讨论「同设备、不经过 Rust」的可行方案。

---

## 三、方案：同设备用 BroadcastChannel，不经过 Rust

### 1. 思路

- **同源、同机**的两个标签（游戏页 + 控制器页）可以通过 **BroadcastChannel** 互相发消息，无需任何服务器。
- 约定两个频道名，例如：
  - `controller-to-game`：控制器页 → 游戏页（state、button 等）。
  - `game-to-controller`：游戏页 → 控制器页（vibrate、game_state 等）。

### 2. 行为约定

| 场景 | 控制器输入路径 | 是否经 Rust |
|------|----------------|-------------|
| 同设备两标签（本机再开一个 controller 标签） | 控制器 → BroadcastChannel → 游戏页 | **否** |
| 跨设备（手机扫二维码打开 controller） | 控制器 → Rust `/ws` → 游戏页（Rust 转发） | **是**（无法用纯网页替代） |

### 3. 实现要点（供你挑选后再改代码）

- **游戏页**  
  - 保留现有 `gameWs` 连接 Rust（存档、以及「经 Rust 转发的远程控制器」）。  
  - 额外起一个 `BroadcastChannel('controller-to-game')`，在 `onmessage` 里解析和当前 `data.type === 'state'` 等相同结构，调 `ControllerManager.updateControllerInput(controllerId, data.joystick, data.buttons)`。  
  - 若希望「同设备控制器」不占 Rust 的 controller_id，可以约定一个固定 id（例如 `local_controller_id = 0` 或 1），仅用于 BroadcastChannel 这条路径。

- **控制器页**  
  - 先检测是否支持且同源：`new BroadcastChannel('controller-to-game')`。  
  - 若可用：不连 WebSocket，只通过 `BroadcastChannel` 按当前格式发 `{ type: 'state', joystick, buttons }`（以及 button 事件等）；并订阅 `game-to-controller` 收 vibrate、game_state。  
  - 若不可用（或你希望保留「远程」模式）：再回退到当前 `connectWebSocket()` 连 `ws://${host}/ws`。

- **统一入口**  
  - 游戏页侧：可以抽象一层「控制器输入源」，要么来自 `gameWs.onmessage`（Rust 转发），要么来自 BroadcastChannel；两路都调用同一个 `ControllerManager.updateControllerInput(...)`，这样「谁转发」对下游逻辑统一。

### 4. 这样做的结果

- **同设备两标签**：控制器消息**完全在网页这边**转发、通行，**不经过 Rust**。  
- **跨设备**：仍走现有 Rust WebSocket，无法用纯网页替代，除非你另接别的中继服务。  
- 存档、配置等仍按现在方式经 Rust，不受影响。

---

## 四、小结

- **当前**：网页控制器（含手机扫码）全部经 Rust 的 `/ws` 与 `/ws/game` 转发。  
- **可实现的「不经过 Rust」**：仅限**同设备、游戏页 + 控制器页两个标签**，用 BroadcastChannel 在网页侧直连；跨设备仍需一个服务（Rust 或其它）做转发。  
- 若你确认采用「同设备 BroadcastChannel」方案，我可以按你现有 `mainEntry.js` / `controller.html` 结构，给出具体改法（频道名、消息格式、与现有 `gameWs` 的兼容方式）。

---

## 五、多控制器时的延迟问题与优化（Rust 端）

### 现象

- 单台手机连 Rust：流畅。
- 2～3 台手机同时连：出现明显延迟。

### 原因（不是 WebSocket 或「多对象」能力差）

- WebSocket 本身支持多连接；Rust 用 **tokio 异步**，每个连接一个 task，多连接是并发的。
- 瓶颈在：
  1. **共享状态写锁**：每个控制器的 `state` 消息（60Hz）都会 `state.controllers.write().await` 更新 HashMap，多控制器抢同一把写锁，排队导致延迟。
  2. **broadcast channel 容量**：原来 100，多控制器 60Hz 时容易满，`send` 阻塞。
  3. **同步日志**：`log_to_file` 在热路径上做同步文件 I/O，会阻塞当前 task。

### 已做修改（2026-03-14）

1. **State 消息只转发、不写回 `controllers`**  
   - 游戏端只关心「收到转发包」，不依赖服务端存每帧状态。  
   - 去掉「先 `controllers.write().await` 再 broadcast」，直接组包 `broadcast_to_games`，避免每帧抢写锁。

2. **去掉控制器热路径上的 log**  
   - 摇杆释放、按钮按下不再调用 `log_to_file`，避免同步写文件阻塞。

3. **扩大 broadcast channel 容量**  
   - `game_tx`: 100 → 1024  
   - `controller_tx`: 100 → 512  
   - 多控制器 60Hz 时不易因背压阻塞。

### 若仍卡顿可再考虑

- 控制器端**降频**：例如 30Hz 发 state，减少消息量。
- **log 异步化**：用 `tokio::spawn_blocking` 或单独 task 写日志，避免阻塞 reactor。
- 不增加「多线程」：tokio 多 worker 已能利用多核；关键是减少锁竞争和阻塞 I/O。
