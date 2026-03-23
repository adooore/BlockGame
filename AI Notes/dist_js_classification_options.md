# dist/js 目录结构（当前采用方案）

本文档描述 **当前工程已落地的** `dist/js` 分层与文件归属，便于对齐 `index.html` 脚本顺序与后续迭代。历史「多选一命名」草案已收敛为下列结构。

---

## 1. 总览

| 目录 | 职责 |
|------|------|
| （根） | 单页入口 `mainEntry.js`，仅负责启动与顶层编排 |
| `data/` | 持久化与游戏端 WebSocket（与 Rust 服务通信） |
| `core/` | 关卡空间、时间步进、帧循环（无 UI、无网络编排） |
| `player/` | 玩家实体、输入聚合（ControllerManager） |
| `scenes/` | SceneManager + 各模式 mount/unmount |
| `dispaly/` | 视听与 UI（含加载动画、菜单、暂停、排行榜、调试面板等） |
| `utils/` | 纯工具函数（如 `gameUtils.js`）；`pathfinding.js` 为寻路子模块，可按需加入 `index.html` |

> **拼写**：目录名 `dispaly` 为历史拼写，与代码路径一致；若全局改名为 `display`，需同步替换脚本引用与文档。

---

## 2. 目录树（约 2026-03）

```
dist/js/
├── mainEntry.js
├── data/
│   ├── persistedStore.js
│   └── gameWebSocket.js
├── core/
│   ├── gridSystem.js
│   ├── waveSystem.js
│   └── frameScheduler.js
├── player/
│   ├── player.js
│   └── controllerManager.js
├── scenes/
│   ├── sceneManager.js
│   ├── gameColorCollectScene.js
│   ├── gameRedLineScene.js
│   ├── gameDangerousPassageScene.js
│   ├── competeColorCollectScene.js
│   ├── competeRedLineScene.js
│   └── competeDangerousPassageScene.js
├── dispaly/
│   ├── loadingAnimations.js
│   ├── soundManager.js
│   ├── fpsOverlay.js
│   ├── controlHint.js
│   ├── mainMenuUI.js
│   ├── pauseMenu.js
│   ├── competeScoreboard.js
│   └── debugPanel.js
└── utils/
    ├── gameUtils.js
    └── pathfinding.js
```

---

## 3. 与 `index.html` 的加载分层（原则不变）

1. **工具 & 数据层**：`PersistedStore` → 通用工具 → 网格 / 波次 / 帧调度 → 加载动画  
2. **核心系统**：`SceneManager` → `player` / `ControllerManager` → 音效 → `GameWebSocket` → FPS / 排行榜 / 调试面板  
3. **UI 辅助**：ControlHint、PauseMenu、MainMenuUI  
4. **场景脚本**：六个 `*Scene.js`  
5. **最后**：`mainEntry.js`

具体 `<script src="...">` 顺序以 **`dist/index.html`** 为准。

---

## 4. 已移除 / 不再使用

- **`wsClient.js`**：曾计划的通用 WebSocket 工厂，未接入主流程；游戏端统一使用 **`data/gameWebSocket.js`**（`GameWebSocket`）。已从工程引用中删除。

---

## 5. 后续若调整目录名（可选备忘）

若仅重命名而不改职责，可在下表替换 **目录名候选**（文件级命名已稳定，一般可保持不变）：

| 当前目录 | 可选别名 |
|----------|----------|
| `data` | `io`、`network`、`persistence` |
| `core` | `world`、`gameworld` |
| `dispaly` | `ui`、`presentation`、`view`（**建议修正拼写为 `display`** 时一并改） |
| `utils` | `lib`、`helpers`、`common` |

确定改名后，同步更新 `dist/index.html`、`AI Notes/standard.md` 与本文件中的路径说明。
