# 架构目标达成检查（2026-03-09）

> 目标：统一输入、统一角色信息管理、统一设置管理，所有信息走一处，同一内存不重新加载

---

## 一、目标达成情况

### ✅ 1. 统一输入（基本实现）

| 维度 | 状态 | 说明 |
|------|------|------|
| 输入入口 | ✅ | ControllerManager 统一管理键盘、原生手柄、Web 手柄 |
| 单页持久 | ✅ | 键盘/手柄事件在 window 层只注册一次，场景切换不清除 |
| 调用方 | ✅ | 主菜单和所有游戏场景都通过 `ControllerManager.getPlayers()` / `getInput(id)` 获取 |
| 场景适配 | ✅ | mount 时 `ControllerManager.init({ force: true })` 只切换 `onPlayerCreate` 回调，输入设备映射保持 |

- ControllerManager 从 PersistedStore.gameSettings 读取键盘开关，设置统一走 PersistedStore ✅

### ✅ 2. 统一角色信息管理（基本实现）

| 维度 | 状态 | 说明 |
|------|------|------|
| 玩家颜色 | ✅ | PersistedStore.playerColors 统一管理，`applyToAllPlayers` 在各场景 mount 时调用 |
| 玩家对象 | ✅ | ControllerManager.getPlayers() 为单一来源；主菜单与游戏场景的 players 语义不同（选择预览 vs 游戏实体），合理分离 |
| 运动参数 | ✅ | player.js 的 DEFAULT_CONFIG 为单一来源，场景从 PersistedStore.gameSettings.getTrailLength() 等读取 |

### ⚠️ 3. 统一设置管理（有分散）

| 维度 | 状态 | 说明 |
|------|------|------|
| 主设置 | ✅ | PersistedStore.gameSettings 管理：键盘、难度、全屏、FPS 面板、拖尾、音量等 |
| FPS 面板 | ⚠️ | fpsOverlay.js 自己读 `blockgame_fps_overlay_enabled` 和 `blockgame_data`，setVisible 时写 FPS_OVERLAY_STORAGE_KEY，与 PersistedStore 存在双写风险 |
| 扫描线 | ⚠️ | gameColorCollectScene、gameRedLineScene、competeRedLineScene 各自用 localStorage `colorCollectScanlineEnabled` / `redLineScanlineEnabled` / `competeRedLineScanlineEnabled`，未走 PersistedStore |

### ✅ 4. 同一内存、不重新加载（基本实现）

| 维度 | 状态 | 说明 |
|------|------|------|
| 场景切换 | ✅ | SceneManager.enter() 仅 mount/unmount DOM 和回调，不整页跳转 |
| 数据持久 | ✅ | PersistedStore._cache、ControllerManager、SoundManager 等全局单例，跨场景共享 |
| 无 location.href | ✅ | 主流程使用 SceneManager.enter；PauseMenu、CompeteScoreboard 传入 onBackToMenu/onNextLevel 时均用 SceneManager |

---

## 二、发现的问题（待修复）

### 问题 1：FPS 面板设置双写

**位置**：`fpsOverlay.js` vs `PersistedStore.gameSettings`

- fpsOverlay 初始化时读 `blockgame_fps_overlay_enabled` 或 `blockgame_data.gameSettings.fpsOverlayEnabled`
- setVisible 时写 `blockgame_fps_overlay_enabled`，不写 PersistedStore
- 主菜单设置页用 `PersistedStore.gameSettings.setFpsOverlayEnabled()` 修改
- **风险**：两边可能不同步；应让 fpsOverlay 只从 PersistedStore 读/写

### 问题 2：扫描线设置未统一

**位置**：`gameColorCollectScene`、`gameRedLineScene`、`competeRedLineScene`

- 各自用不同的 localStorage key 存储扫描线开关
- 未纳入 PersistedStore.gameSettings
- **建议**：若扫描线仅为开发调试用（daily_notes 提及「不作为长期功能保留」），可保持现状；若需长期保留，应收敛到 PersistedStore

### 问题 3：index.html 的 fallback 仍会整页跳转

**位置**：`dist/index.html` 第 2261–2276 行

- 当 `SceneManager.enter()` 返回 false（如场景未注册）时，会执行 `window.location.href = levelInfo.file?...`
- 此时会 404（旧 HTML 已在 legacy/），且会整页重载
- **建议**：fallback 改为 `alert` 提示错误，或跳回 mainMenu，避免整页跳转

### 问题 4：PauseMenu 的 location.href 后备

**位置**：`dispaly/pauseMenu.js` 第 107–108 行

- 当 `SceneManager` 不存在时，`onBackToMenu` 会执行 `window.location.href = 'index.html'`
- 单页架构下 SceneManager 必然存在，此分支理论上不会触发
- **建议**：可保留作兜底，或改为 `SceneManager.enter('mainMenu')` 并移除 location 后备

### 问题 5：CompeteScoreboard 的 location 后备

**位置**：`dispaly/competeScoreboard.js` 第 639–649 行

- `onNextLevel` / `onBackToMenu` 未传入时，会使用 `window.location.href`
- 各 compete 场景均已传入对应回调，此分支应不会触发
- **建议**：确认所有调用处都传入回调，或将默认回调改为 `SceneManager.enter('mainMenu')`

---

## 三、未提及但建议关注的点

1. **pagehide / beforeunload**：PersistedStore 已监听并调用 `flushPendingSaves()`，单页下切场景不会触发，仅关闭/刷新时生效，合理 ✅

2. **SoundManager**：全局单例，各场景共享，符合「同一内存」目标 ✅

3. **FrameScheduler**：每个游戏场景创建自己的实例，unmount 时 stop；主菜单有 previewScheduler，与游戏场景独立，逻辑合理 ✅

4. **WebSocket (PersistedStore._ws)**：由游戏页面设置，单页下可考虑在更高层统一建立并在场景间共享，当前实现可接受 ✅

---

## 四、总结

| 目标 | 达成度 | 备注 |
|------|--------|------|
| 统一输入 | ✅ 高 | ControllerManager 统一，设置来自 PersistedStore |
| 统一角色信息 | ✅ 高 | 颜色、运动参数走 PersistedStore/player.js |
| 统一设置 | ⚠️ 中 | PersistedStore 为主，FPS、扫描线有分散 |
| 同一内存不重载 | ✅ 高 | SceneManager 单页，主流程无整页跳转 |

**建议优先级**：
1. 中：FPS 面板设置收敛到 PersistedStore（避免双写）
2. 低：index.html fallback 避免整页跳转
3. 低：扫描线按产品决策决定是否统一到 PersistedStore
