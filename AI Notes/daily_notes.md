## BlockGame 日常开发记录（Daily Notes）

> 说明：这里只记录每天的开发小结、体感反馈和短期计划。长期不变的架构 / 设计原则等，请查看同目录下的 `standard.md`。

---

### 2026-03-04

- **完成内容**
  - 已完成「刷新与速度逻辑统一」：将游戏的刷新逻辑与速度控制统一到一套时间步进方案下（依赖统一帧调度思路），为后续调整整体节奏与体感打基础。
  - 建立 `AI Notes` 记忆体系：在项目中新增 `AI Notes/standard.md`（核心架构与长期约定）与 `AI Notes/daily_notes.md`（日常开发小结），方便后续让 AI 快速对齐历史信息并节省上下文。
- **当前问题 / 体感反馈**
  - 整体移动速度即使提升到 1.5 倍，仍然偏慢，低于预期节奏感。
  - 跳跃动作明显变慢：从起跳到落地的全过程被拉长，滞空时间偏长，手感不够紧凑。
- **下一步优先事项**
  - 校准跳跃相关参数（初速度、重力、最大高度等）与时间步进系数，让滞空时间与水平移动速度匹配预期体感。
  - 在统一帧调度的前提下，重新标定「默认游戏速度」，确保稍微提高速度不会立刻失控。

- **补充更新（当日迭代）**
  - 已修复统一帧调度后的手感回退问题：上调移动与跳跃参数，并收紧跳跃重力逻辑，恢复更紧凑的跳跃节奏与移动速度。
  - 已完成参数抽象收敛：`gameColorCollect.html` 的玩家运动参数改为统一读取 `player.js` 的 `DEFAULT_CONFIG`，避免双维护与参数漂移。
  - 新增全局 FPS 浮层（右上角）并统一接入主要页面；同时区分显示「屏幕帧率 / 游戏渲染帧率 / 逻辑帧率」，避免把显示器刷新率误判为游戏逻辑帧率。
  - 主页面开场流程已优化：修复开场动画前主页闪帧问题（启动遮罩 + 动画接管），并将 FPS 面板改为可在设置中开关（持久化保存）。
  - 颜色收集页面完成视觉调优与可配置化：新增风格切换与扫描线开关，降低蓝紫刺眼感，并按反馈多轮微调地图方块光照强度到更舒适档位。

- **下一步调整（待明日）**
  - 视觉调优目前主要落在 `gameColorCollect.html`：需评估并同步到 `gameRedLine.html`、`gameDangerousPassage.html` 及对应竞技页，避免模式间风格割裂。
  - 颜色收集的「风格切换」已确认仅用于开发观察，不作为长期功能保留；后续不做通用主题模块抽象。
  - 玩家运动逻辑仍有页面内分支实现（各页面自写 `updatePlayerMovement`）：建议抽象统一物理更新入口，减少后续调参要多处同步的问题。
  - FPS 设置入口目前在主页设置页：需确认是否在暂停菜单/关卡内也提供快捷开关，减少玩家切页调整成本。
  - 开场防闪帧方案目前在主页内联实现：建议抽成可复用的启动守卫逻辑，后续有开场动画的页面可直接复用。

### 2026-03-08

- **完成内容**
  - 已完成玩家控制链路收敛：主页与各游戏/竞技页统一接入 `player.js` 的共享输入、运动、绘制逻辑，减少页面内重复实现。
  - 已完成渲染插值抽象与推广：基于 `frameScheduler.js` 的逻辑/渲染解耦，将玩家插值绘制统一应用到主要页面，显著改善角色移动的“跳帧感 / 闪烁感”。
  - 已恢复玩家拖尾效果，并将拖尾长度暴露到主页显示设置中；当前支持 `0~1000` 的数值调节。
  - 已修复拖尾设置的保存与读取不同步问题：补上切页前延迟保存冲刷，并修正玩家创建时读取实时配置，避免 UI 值与实际渲染值不一致。
- **当前问题 / 架构结论**
  - 现有多 HTML 页面架构会导致页面级 JS 内存在切页时重建，运行时状态难以真正共享，设置与对象初始化时机也容易错位。
  - 今日拖尾设置问题已确认不仅是单点 bug，而是当前“多页面 + 页面内缓存”组织方式暴露出的结构性信号。
- **下一步优先事项**
  - 准备以 C 方向重构为目标，逐步从“多独立 HTML 页面”迁移到更专业的分层架构。
  - 重构时优先考虑建立统一运行时骨架，如 `App / SceneManager / GameState / Systems / StorageAdapter`，让设置、输入、玩家状态与场景切换都拥有明确分层与单一来源。

### 2026-03-08（方案 B 重构完成）

- **完成内容**
  - 已完成方案 B：单 HTML + SceneManager 重构。
  - 新增 `sceneManager.js`，主菜单与 6 个游戏/竞技场景统一通过 `SceneManager.enter()` 切换，不再整页跳转。
  - 6 个场景模块迁移至 `dist/js/scenes/`：gameColorCollect、gameRedLine、gameDangerousPassage、competeColorCollect、competeRedLine、competeDangerousPassage。
  - 旧版 HTML 已归档至 `dist/legacy/`。
  - ControllerManager 支持 `force: true` 以支持场景切换时重新初始化回调。
  - PauseMenu 默认 onBackToMenu 改为调用 `SceneManager.enter('mainMenu')`。
- **当前状态**
  - 游戏以单页运行，主菜单与各模式间切换不再重建 JS 运行时，PersistedStore、ControllerManager、SoundManager 等可共享。
- **下一步建议**
  - 验证各场景进入/返回/下一关流程是否正常。
  - 可选：增加 URL/hash 同步，支持刷新后恢复当前场景。

### 2026-03-11

- **完成内容**
  - **输入/键盘问题修复**：根因是首次进入主菜单时 `ControllerManager.init({ force: true })` 会走 forceReinit 分支，此前逻辑在 `forceReinit` 时不执行 `initKeyboardEvents()`，导致键盘监听从未挂上；改为用 `eventsInitialized` 标志，保证键盘与原生手柄事件**只绑定一次、全局复用**，与是否 force 无关，首次进主页即可用键盘控制。
  - **配置与玩家初始化顺序**：在 WebSocket `connected` 且 PersistedStore 加载完成后，对 `ControllerManager.getPlayers()` 中所有玩家统一执行一次 `syncPlayerMovementConfig`，使「第一个创建的玩家」也能拿到最新的拖尾长度等体感参数，避免早期值导致的“无拖尾”等问题；符合「设置优先、角色靠后」的初始化顺序。
  - **入口脚本抽离**：将 `index.html` 中原有超长内联 `<script>` 抽离到 `dist/js/mainEntry.js`，HTML 仅保留结构、样式与 `<script src="js/mainEntry.js"></script>` 引用，便于后续梳理与拆分；当前仍为**非模块 script**，所有顶层函数/变量仍在全局作用域。
  - 补充：移除扫描线相关逻辑与 UI（此前已完成）；在主页 previewUpdate 中增加「有输入时打印」的调试 log，用于确认键盘/手柄输入是否到达（后续可删或保留为可选调试）。
- **当前状态**
  - 主菜单与关卡内键盘控制、拖尾表现已正常；入口逻辑集中在 `mainEntry.js`，便于明日梳理。
- **明日优先事项**
  - **梳理 mainEntry.js**：从头到尾整理其内容，当前 1500+ 行较乱，建议按职责分段（如：启动/开场、WebSocket、主菜单预览与控制器、场景注册、二维码/设置等），或拆成多个命名空间/文件，避免全局函数重名与难以维护。
  - **梳理 index.html 中脚本加载顺序**：确认各 `<script src="...">` 的先后顺序是否合理（依赖关系、SceneManager/ControllerManager/PersistedStore 等谁先谁后），当前可能存在顺序问题，需梳理并记录在 daily_notes 或 standard 中，便于后续改 module 或拆包时参考。
  - **梳理完后把架构「固化」下来**：项目变大后容易忘，建议用下面几种方式留档，以后一看就能回忆起来。

- **架构记录方法（梳理后建议做）**
  - **分层/模块框图**：画「谁依赖谁」——例如：index.html → mainEntry → SceneManager / ControllerManager / PersistedStore；各 scene 依赖 player、frameScheduler、GameUtils。可用 Mermaid（见下）或手绘截图放在 `AI Notes/` 或 `docs/`。
  - **脚本加载顺序图**：在文档里列一列 `<script>` 的加载顺序表（或流程图），标明「先加载 A 再加载 B，因为 B 用到了 A 的全局变量」，以后改顺序或加新脚本时对照。
  - **Mermaid 图（推荐）**：在 Markdown 里直接写，GitHub / 很多编辑器能渲染。例如：
    - **依赖关系**：`graph TD; index --> mainEntry; mainEntry --> SceneManager; mainEntry --> ControllerManager;`
    - **启动流程**：`sequenceDiagram; 页面加载->>PersistedStore: load; 页面加载->>mainEntry: 执行; mainEntry->>initWebSocket; connected->>initControllerAfterConfig;`
  - **一页纸「模块职责表」**：在 `standard.md` 或单独 `docs/architecture.md` 里用表格列：模块名、职责、被谁用、依赖谁，便于快速回忆。
  - **关键决策记录（ADR）**：重要选择（例如「用单页 + SceneManager 而不是多 HTML」「配置先于玩家初始化」）写在 `AI Notes/` 或 `docs/adr/`，一两段话即可，方便以后问「当时为啥这么搞」。

### 2026-03-13

- **完成内容（ControlHint 模块梳理与瘦身）**
  - **主菜单 UI 拆出**：底部控制提示与 N 键返回、二维码弹窗等从 `mainEntry.js` 抽到 `mainMenuUI.js`，以 `MainMenuUI` 单例暴露 `init` / `updateControlHints` / `toggleQR` / `handleBack`；`index.html` 增加 `<script src="js/mainMenuUI.js">`，脚本加载顺序按「工具→核心系统→UI 辅助→场景→入口」整理并写入 `standard.md`。
  - **ControlHint 状态机**：在 `controlHint.js` 内用 `STATE_HINTS` 表维护「状态 key → N/S/E/W 文案」，对外统一用 `setHintsState(state)` 切换文案并触发显示与淡出计时；不再在控件内区分 menu/game，逻辑由上层决定何时调用。
  - **接口精简**：移除控件内的 `displayMode` 与 `setDisplayMode` / `setContext(mode, state)`，改为单参 `setHintsState(state)`；「有输入时刷新底栏」由上层调用 `ControlHint.show()`，不再提供 `onInput()`；删除未使用的 `setButton`、`destroy`、`forceShow` 的对外暴露。
  - **枚举与默认值**：保留 `HINTS_KEY` 枚举供内部默认 `currentHintsKey`；已移除 `DISPLAY_MODE`（menu/game 由外层判断）。
  - **外部调用更新**：`mainMenuUI.js` 与 `mainEntry.js` 中所有 `ControlHint.setContext(...)` 改为 `ControlHint.setHintsState(...)`，所有 `ControlHint.onInput()` 改为 `ControlHint.show()`；控件头部注释已同步为当前用法。
- **当前状态**
  - ControlHint 对外仅暴露：`init`、`update`、`show`、`hide`、`setHintsState`；主菜单与设置等处的底部提示均通过 `MainMenuUI.updateControlHints()` → `setHintsState` 驱动，输入续命由上层在合适时机调用 `show()`。
- **今日收尾**
  - ControlHint 相关修改已全部落地，外部调用已对齐新接口；如需后续扩展（如游戏内短暂提示），可在上层按需调用 `show()` / `hide()` 或再封装。

### 2026-03-14

- **决策记录（命名收敛）**
  - 将持久化层的全局入口从 `GameData` 改名为 `PersistedStore`，用于更直观表达「存档 + 设置」的职责，避免与“本局运行时数据”混淆。
  - 相关脚本文件命名同步为 `persistedStore.js`，入口页脚本引用与全局调用点一并更新。

- **完成内容（显示玩家序号 + 场景 UI 生命周期重构）**
  - **玩家序号显示收敛到 player 抽象**：与拖尾一致，在 `player.js` 的 `drawPlayerSprite` 内，当调用方未传 `showLabel` 时从 `PersistedStore.gameSettings.getShowPlayerNumber()` 读取并决定是否绘制 P1/P2/P3；各游戏场景与主菜单不再单独读设置、传 `showLabel`，避免每处重复实现。
  - **场景生命周期澄清**：确认退出游戏时 SceneManager 会对当前场景调用 `unmount()`（停止帧调度、关闭 WebSocket、移除事件、`sceneRoot.remove()` 等），有明确销毁过程；场景「定义」仍注册在 SceneManager 内，下次进入会重新 `mount()`。
  - **调试面板出现在主菜单外的问题**：根因是 DebugPanel / PauseMenu / CompeteScoreboard 等当时都挂到 `document.body`，与场景根是兄弟关系，没有 Qt 式的父子树，`sceneRoot.remove()` 不会带走它们；依赖显式在 unmount 里调 `destroy` 或 `panel.remove()`，易漏（DebugPanel 就曾漏掉）。
  - **「挂在场景根、自然带走」**：上述三个模块与 `GameUtils.createGameScreens` 改为接受 `parent`（场景根），将 DOM 挂到 `parent` 下，退出时仅需 `sceneRoot.remove()` 即可自然带走，减少显式销毁与漏写风险。
  - **类 + 每场景 new 实例**：进一步将 DebugPanel、PauseMenu、CompeteScoreboard 从「全局单例 + 挂载点」改为**类**，每场景在 mount 里 `new Xxx(sceneRoot, options)` 并保存引用，unmount 时 `destroy()` / `setCurrent(null)` 并丢弃引用，实例随场景消失可被 GC，所有权清晰。DebugPanel 保留静态 `setCurrent(instance)` / `setVisible(bool)` 供 GameWebSocket 根据 `is_debug` 控制当前场景面板显示。
  - **六场景与 GameUtils**：六场景统一改为创建上述实例、存到 `sceneRoot._gc*`、循环内用实例方法（如 `pauseMenu.pollGamepadStart()`、`debugPanel.logWave()`）；unmount 中取回引用并调用 `destroy` / `DebugPanel.setCurrent(null)` / `competeScoreboard.hideResults()`。`GameUtils.createDebugLog` 不再返回全局 DebugPanel，仅提供基于 containerId 的 fallback。
  - **三个 UI 文件目录调整**：`debugPanel.js`、`pauseMenu.js`、`competeScoreboard.js` 移至 `dist/js/dispaly/`；已更新 `dist/index.html`、`dist/legacy/*.html` 中所有对应 `<script src="...">`，以及 `AI Notes/standard.md`、`AI Notes/architecture_check_2026-03-09.md` 中的路径说明。
- **当前状态**
  - 显示玩家序号由 player 层统一读设置；场景内 UI（调试面板、暂停菜单、排行榜、Game Over/Victory）均为「类 + 每场景实例」，挂到场景根下，退出时随根移除且实例无引用可回收。
- **可后续优化**
  - 若将目录名 `dispaly` 更正为 `display`，需全局把脚本路径与文档中的 `dispaly` 改为 `display`。

### 2026-03-22

- **完成内容（关卡选择 → SceneManager 场景）**
  - 将「游戏模式选择（合作/对抗）+ 合作关卡列表 + 对抗关卡列表」从 `#scene-mainMenu` 内拆出，改为由 **`SceneManager` 管理的独立场景 `levelSelect`**。
  - 新增 [`dist/js/scenes/levelSelectScene.js`](dist/js/scenes/levelSelectScene.js)：`SceneLevelSelect()` 返回 `mount` / `unmount`，从 `#scene-levelSelect-tpl` 克隆内容挂到 `#scene-container`；`mount` 支持 `payload.sub` 为 `'mode' | 'coop' | 'versus'`，用于初始显示哪一块菜单。
  - [`dist/index.html`](dist/index.html)：增加 `<template id="scene-levelSelect-tpl">`（含 `.scene-levelSelect` 与 `.bg-grid`）、关卡相关样式；增加 `js/scenes/levelSelectScene.js` 引用（在 `sceneManager.js` 之后）；**修正** `mainMenuUI` 脚本路径为 `js/main/mainMenuUI.js`（与仓库实际文件一致，原 `js/dispaly/mainMenuUI.js` 为错误路径）。
  - [`dist/js/mainEntry.js`](dist/js/mainEntry.js)：`SceneManager.register('levelSelect', SceneLevelSelect())`；**修正** `selectMode` 中错误调用 `selectLevel(1)` 为 `selectLevel('color', 1)`。
  - [`dist/js/main/mainMenuUI.js`](dist/js/main/mainMenuUI.js)：`showModeSelection()` 优先 `SceneManager.enter('levelSelect', { sub: 'mode' })`；`backToMain()` 在 `getCurrentSceneId() === 'levelSelect'` 时 `enter('mainMenu')`；保留无 `SceneManager` 时的旧 `switchMenu` 回退。`showCoopLevels` / `showVersusLevels` / `backToModeSelection` 仍依赖原 DOM id，仅在关卡场景挂载后存在，行为不变。
- **行为说明**
  - 点「开始游戏」会卸载主菜单（预览循环停止、主场景隐藏），再挂载关卡选择；从模式选择「返回」回到主菜单。选关进入具体游戏场景时仍由现有 `selectLevel` → `SceneManager.enter(gameSceneId)` 处理，`levelSelect` 会先被卸载。
- **仅讨论、未落代码（留作后续阶段）**
  - `mainEntry.js` 按函数/模块进一步拆分、跨文件状态与传参约定；`index.html` 内联样式拆成多个 `.css` 文件；社区扩展 / 动态加载 mods 目录与第三方脚本的安全模型等。

- **补充更新（同日 · WebSocket 统一与补调时序）**
  - **架构**：删除 `mainEntry.js` 内重复的 `gameWs` / `WsClient` / `initWebSocket`，全站只保留 [`dist/js/data/gameWebSocket.js`](dist/js/data/gameWebSocket.js) 一条连接；大厅输入委托给 `BlockGameMainMenu.ws*`；`PersistedStore.setWebSocket` 始终指向 `GameWebSocket.ws`；关卡 `unmount` 用 `GameWebSocket.detachScene()` 只卸回调、不断开共享连接。
  - **`init` 补调**：关卡场景在 WS 已 `OPEN` 时，`init` 会用缓存的 `_lastConnectedData` 立即触发 `onConfigLoaded`，避免进关不再收到第二次 `connected` 时配置未加载。
  - **问题记录（TDZ）**：上述「已连接则立即回调」若为**同步**调用，会在场景 `mount` 尚未执行到后面的 `let controllerInitialized` / `function initControllerAfterConfig` 时进入 `onConfigLoaded`，触发 JavaScript 暂时性死区错误：`ReferenceError: Cannot access 'controllerInitialized' before initialization`（栈指向场景内 `initControllerAfterConfig`，实际根因在调用顺序）。
  - **修复**：在 `GameWebSocket.init` 中，对已连接分支里的 `onConfigLoaded` / `onControllerUpdate` 使用 **`queueMicrotask`** 推迟到当前同步 `mount` 跑完后再执行，无需把各场景数百行声明整体挪到 `GameWebSocket.init` 之前。
  - **备注**：`handleConnected`（来自 WebSocket 消息）异步到达时，`mount` 通常已结束，一般不受此问题影响；主要踩坑是「单页已连接 + 场景内同步 `init`」路径。
