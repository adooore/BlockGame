/**
 * 游戏工具函数模块
 * 包含时间格式化、浮动文字、菜单系统等通用功能
 */

const GameUtils = (function() {
    
    // ==================== 时间格式化 ====================
    
    /**
     * 格式化时间为 MM:SS
     * @param {number} seconds - 秒数
     * @returns {string} 格式化的时间字符串
     */
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * 格式化最快记录（0 表示无记录）
     * @param {number} seconds - 秒数
     * @returns {string} 格式化的时间字符串或 '--:--'
     */
    function formatBestTime(seconds) {
        if (seconds === 0) return '--:--';
        return formatTime(seconds);
    }
    
    /**
     * 格式化时间为 MM:SS.mmm（毫秒精度）
     * @param {number} ms - 毫秒数
     * @returns {string} 格式化的时间字符串
     */
    function formatTimeMs(ms) {
        const totalSeconds = ms / 1000;
        const mins = Math.floor(totalSeconds / 60);
        const secs = Math.floor(totalSeconds % 60);
        const millis = Math.floor(ms % 1000);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
    }
    
    // ==================== 浮动文字系统 ====================
    
    /**
     * 创建浮动文字系统
     * @returns {Object} 浮动文字系统实例
     */
    function createFloatingTextSystem() {
        const texts = [];
        
        /**
         * 显示浮动文字
         * @param {string} text - 文字内容
         * @param {string} color - 颜色
         * @param {number} x - X 坐标
         * @param {number} y - Y 坐标
         * @param {Object} options - 可选配置
         */
        function show(text, color, x, y, options = {}) {
            texts.push({
                text,
                color,
                x,
                y,
                opacity: options.opacity || 1,
                vy: options.vy || -2,
                fontSize: options.fontSize || 16,
                duration: options.duration || 50,  // 帧数
                timer: 0
            });
        }
        
        /**
         * 更新所有浮动文字
         */
        function update() {
            for (let i = texts.length - 1; i >= 0; i--) {
                const ft = texts[i];
                ft.y += ft.vy;
                ft.timer++;
                ft.opacity = 1 - (ft.timer / ft.duration);
                if (ft.opacity <= 0) {
                    texts.splice(i, 1);
                }
            }
        }
        
        /**
         * 绘制所有浮动文字
         * @param {CanvasRenderingContext2D} ctx - 画布上下文
         */
        function draw(ctx) {
            texts.forEach(ft => {
                ctx.save();
                ctx.globalAlpha = ft.opacity;
                ctx.font = `bold ${ft.fontSize}px Orbitron`;
                ctx.fillStyle = ft.color;
                ctx.textAlign = 'center';
                ctx.shadowBlur = 10;
                ctx.shadowColor = ft.color;
                ctx.fillText(ft.text, ft.x, ft.y);
                ctx.restore();
            });
        }
        
        /**
         * 清空所有浮动文字
         */
        function clear() {
            texts.length = 0;
        }
        
        return { show, update, draw, clear, get count() { return texts.length; } };
    }
    
    // ==================== 菜单系统 ====================
    
    /**
     * 创建菜单控制系统
     * @returns {Object} 菜单系统实例
     */
    function createMenuSystem() {
        let selectedIndex = 0;
        let buttons = [];
        let moveThrottle = false;
        let confirmPressed = false;
        
        /**
         * 设置菜单按钮
         * @param {string} containerId - 按钮容器的 ID
         * @param {string} buttonSelector - 按钮选择器
         */
        function setup(containerId, buttonSelector = '.menu-btn') {
            const container = document.getElementById(containerId);
            if (container) {
                buttons = Array.from(container.querySelectorAll(buttonSelector));
                selectedIndex = 0;
                updateSelection();
            }
        }
        
        /**
         * 更新选中状态
         */
        function updateSelection() {
            buttons.forEach((btn, i) => {
                btn.classList.toggle('selected', i === selectedIndex);
            });
        }
        
        /**
         * 处理输入
         * @param {Object} joystick - 摇杆状态 { x, y }
         * @param {Object} buttons - 按钮状态
         * @param {string} confirmButton - 确认按钮名称（默认 'W' = 西键）
         */
        function handleInput(joystick, btns, confirmButton = 'W') {
            if (buttons.length === 0) return;
            
            // 摇杆上下移动选择
            if (!moveThrottle) {
                if (joystick.y < -0.5) {
                    selectedIndex = (selectedIndex - 1 + buttons.length) % buttons.length;
                    updateSelection();
                    moveThrottle = true;
                    setTimeout(() => moveThrottle = false, 200);
                } else if (joystick.y > 0.5) {
                    selectedIndex = (selectedIndex + 1) % buttons.length;
                    updateSelection();
                    moveThrottle = true;
                    setTimeout(() => moveThrottle = false, 200);
                }
            }
            
            // 确认按钮
            if (btns[confirmButton] && !confirmPressed) {
                confirmPressed = true;
                buttons[selectedIndex]?.click();
            } else if (!btns[confirmButton]) {
                confirmPressed = false;
            }
        }
        
        /**
         * 键盘上移
         */
        function moveUp() {
            if (buttons.length === 0) return;
            selectedIndex = (selectedIndex - 1 + buttons.length) % buttons.length;
            updateSelection();
        }
        
        /**
         * 键盘下移
         */
        function moveDown() {
            if (buttons.length === 0) return;
            selectedIndex = (selectedIndex + 1) % buttons.length;
            updateSelection();
        }
        
        /**
         * 确认选中
         */
        function confirm() {
            buttons[selectedIndex]?.click();
        }
        
        /**
         * 重置
         */
        function reset() {
            selectedIndex = 0;
            buttons = [];
            moveThrottle = false;
            confirmPressed = false;
        }
        
        return {
            setup,
            updateSelection,
            handleInput,
            moveUp,
            moveDown,
            confirm,
            reset,
            get selectedIndex() { return selectedIndex; },
            get buttons() { return buttons; }
        };
    }
    
    // ==================== 开始蒙版系统 ====================
    
    /**
     * 创建开始蒙版
     * 显示"按任意键开始"和操作提示
     * @param {Object} options - 配置选项
     * @returns {Object} 蒙版系统实例
     */
    function createStartOverlay(options = {}) {
        const {
            controls = [
                { key: '南', label: '跳跃', hint: '长按滞空', color: '#4ade80' },
                { key: '东', label: '冲刺', hint: '快速移动', color: '#f87171' },
                { key: '北', label: '静步', hint: '按住减速', color: '#facc15' }
            ],
            keyboardHint = '键盘: J=跳跃 | K=冲刺 | I=静步 | WASD=移动'
        } = options;
        
        let overlay = null;
        
        // CSS 样式（只注入一次）
        const styleId = 'start-overlay-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .start-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 500;
                }
                .start-overlay .title {
                    color: #00f2ff;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    text-transform: uppercase;
                    letter-spacing: 8px;
                    text-shadow: 0 0 20px #00f2ff, 0 0 40px #00f2ff;
                    animation: pulse 2s ease-in-out infinite;
                }
                .start-overlay .subtitle {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 12px;
                    margin-top: 20px;
                    letter-spacing: 4px;
                }
                .start-overlay .controls {
                    margin-top: 60px;
                    display: flex;
                    gap: 40px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 14px;
                }
                .start-overlay .control-item {
                    text-align: center;
                }
                .start-overlay .control-btn {
                    width: 50px;
                    height: 50px;
                    border: 2px solid currentColor;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 8px;
                    font-family: 'Zhi Mang Xing', cursive;
                    font-size: 24px;
                }
                .start-overlay .control-hint {
                    font-size: 10px;
                    opacity: 0.5;
                }
                .start-overlay .keyboard-hint {
                    margin-top: 30px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 11px;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        }
        
        /**
         * 创建 HTML 结构
         */
        function createHTML() {
            overlay = document.createElement('div');
            overlay.id = 'start-overlay';
            overlay.className = 'start-overlay';
            
            // 构建操作提示 HTML
            const controlsHTML = controls.map(ctrl => `
                <div class="control-item">
                    <div class="control-btn" style="color: ${ctrl.color}; border-color: ${ctrl.color};">${ctrl.key}</div>
                    <div>${ctrl.label}</div>
                    <div class="control-hint">${ctrl.hint}</div>
                </div>
            `).join('');
            
            overlay.innerHTML = `
                <div class="title">按任意键开始</div>
                <div class="subtitle">PRESS ANY KEY TO START</div>
                <div class="controls">${controlsHTML}</div>
                <div class="keyboard-hint">${keyboardHint}</div>
            `;
            
            document.body.appendChild(overlay);
        }
        
        /**
         * 显示蒙版
         */
        function show() {
            if (overlay) overlay.style.display = 'flex';
        }
        
        /**
         * 隐藏蒙版
         */
        function hide() {
            if (overlay) overlay.style.display = 'none';
        }
        
        /**
         * 检查是否显示中
         */
        function isVisible() {
            return overlay && overlay.style.display !== 'none';
        }
        
        /**
         * 获取 DOM 元素
         */
        function getElement() {
            return overlay;
        }
        
        // 初始化
        createHTML();
        
        return {
            show,
            hide,
            isVisible,
            getElement
        };
    }
    
    // ==================== 游戏结束屏幕系统 ====================
    
    /**
     * 创建游戏结束屏幕系统
     * 包含 Game Over 和 Victory 两种界面，支持自定义按钮和回调
     * @param {Object} options - 配置选项
     * @returns {Object} 屏幕系统实例
     */
    function createGameScreens(options = {}) {
        const {
            containerId = 'game-screens-container',  // 容器 ID
            onRestart = null,           // 重新开始回调
            onRevive = null,            // 复活回调（可选）
            onNextLevel = null,         // 下一关回调（可选）
            onBackToMenu = null,        // 返回主菜单回调
            gameType = 'color',         // 游戏类型（用于下一关按钮文字）
            currentLevel = 1,           // 当前关卡
            maxLevel = 3                // 最大关卡数
        } = options;
        
        let gameoverScreen = null;
        let victoryScreen = null;
        let menuSystem = null;
        
        // CSS 样式（只注入一次）- 与原游戏样式保持一致
        const styleId = 'game-screens-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .game-screen {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.8);
                    border: 2px solid #00f2ff;
                    padding: 30px 40px;
                    text-align: center;
                    z-index: 1000;
                    box-shadow: 0 0 15px #00f2ff, inset 0 0 10px #00f2ff;
                    font-family: 'Orbitron', 'Noto Sans SC', sans-serif;
                    color: white;
                    transform-origin: center center;
                }
                .game-screen h1 { margin: 0 0 16px 0; font-size: 2.25rem; font-weight: 900; }
                .game-screen .time-label { font-size: 14px; letter-spacing: 4px; opacity: 0.8; margin-bottom: 8px; }
                .game-screen .time-value { font-size: 3rem; font-weight: 900; margin-bottom: 8px; }
                .game-screen .time-detail { font-size: 12px; margin-bottom: 24px; display: flex; justify-content: center; gap: 20px; }
                .game-screen .best-time { font-size: 12px; opacity: 0.6; margin-bottom: 32px; }
                .game-screen .screen-buttons { display: flex; flex-direction: column; gap: 12px; align-items: center; }
                .game-screen .btn-cyber {
                    background: transparent;
                    border: 2px solid #00f2ff;
                    color: #00f2ff;
                    padding: 12px 40px;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 1.1rem;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 0 10px #00f2ff;
                    min-width: 200px;
                }
                .game-screen .btn-cyber:hover, .game-screen .btn-cyber.selected {
                    background: #00f2ff;
                    color: #000 !important;
                    box-shadow: 0 0 30px #00f2ff;
                }
                .game-screen .menu-hints {
                    margin-top: 20px;
                    font-size: 11px;
                    opacity: 0.5;
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .game-screen .hint-key {
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.3);
                    padding: 2px 8px;
                    border-radius: 3px;
                    margin: 0 2px;
                    font-family: 'JetBrains Mono', monospace;
                }
                .game-screen .hint-btn {
                    display: inline-flex;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    margin: 0 2px;
                    vertical-align: middle;
                }
                .game-screen .hint-btn-west { 
                    background: transparent; 
                    border: 2px solid #00f2ff; 
                    color: #00f2ff; 
                    text-shadow: 0 0 8px #00f2ff;
                    box-shadow: 0 0 10px rgba(0, 242, 255, 0.5);
                }
                .game-screen .neon-pink { color: #ff00ff; text-shadow: 0 0 10px #ff00ff, 0 0 20px #ff00ff; }
                .game-screen .neon-cyan { color: #00f2ff; text-shadow: 0 0 10px #00f2ff, 0 0 20px #00f2ff; }
                .game-screen .neon-gold { color: #ffd700; text-shadow: 0 0 20px #ffd700, 0 0 40px #ff8c00; }
            `;
            document.head.appendChild(style);
        }
        
        /**
         * 创建 HTML 结构
         */
        function createHTML() {
            // Game Over 界面
            gameoverScreen = document.createElement('div');
            gameoverScreen.id = 'gameover-screen';
            gameoverScreen.className = 'game-screen';
            gameoverScreen.style.display = 'none';
            gameoverScreen.innerHTML = `
                <h1 class="neon-pink">游戏结束</h1>
                <p class="time-label">本次用时</p>
                <p class="time-value neon-cyan" id="gs-final-time">00:00</p>
                <div class="time-detail">
                    <span style="color: #4ade80;">游戏时间: <span id="gs-final-play-time">00:00</span></span>
                    <span style="color: #ff6b6b;">惩罚时间: <span id="gs-final-penalty-time">+0s</span></span>
                </div>
                <p class="best-time">最快记录: <span id="gs-final-best-time">--:--</span></p>
                <div class="screen-buttons" id="gs-gameover-buttons">
                    <button class="btn-cyber menu-btn" data-action="restart">重新开始</button>
                    ${onRevive ? '<button class="btn-cyber menu-btn" data-action="revive">复活 <span style="font-size: 10px; opacity: 0.7;">(+1分钟)</span></button>' : ''}
                    <button class="btn-cyber menu-btn" data-action="back">返回主菜单</button>
                </div>
                <div class="menu-hints">
                    <span><span class="hint-key">W</span><span class="hint-key">S</span> 移动</span>
                    <span>|</span>
                    <span><span class="hint-key">Enter</span> 确认</span>
                    <span>|</span>
                    <span><span class="hint-btn hint-btn-west">西</span> 确认</span>
                </div>
            `;
            
            // Victory 界面
            victoryScreen = document.createElement('div');
            victoryScreen.id = 'victory-screen';
            victoryScreen.className = 'game-screen';
            victoryScreen.style.display = 'none';
            
            const nextLevelText = gameType === 'redline' ? '红线危机' : '颜色收集';
            victoryScreen.innerHTML = `
                <h1 class="neon-gold">通关成功！</h1>
                <p class="time-label">通关用时</p>
                <p class="time-value neon-cyan" id="gs-victory-time">00:00</p>
                <div class="time-detail">
                    <span style="color: #4ade80;">游戏时间: <span id="gs-victory-play-time">00:00</span></span>
                    <span style="color: #ff6b6b;">惩罚时间: <span id="gs-victory-penalty-time">+0s</span></span>
                </div>
                <p class="best-time" style="margin-bottom: 16px;">全部波次已通过</p>
                <p class="best-time">最快记录: <span id="gs-victory-best-time">--:--</span></p>
                <div class="screen-buttons" id="gs-victory-buttons">
                    ${onNextLevel && currentLevel < maxLevel ? `<button class="btn-cyber menu-btn" data-action="next">${nextLevelText} 第${currentLevel + 1}关</button>` : ''}
                    <button class="btn-cyber menu-btn" data-action="replay">再玩一次</button>
                    <button class="btn-cyber menu-btn" data-action="back">返回主菜单</button>
                </div>
                <div class="menu-hints">
                    <span><span class="hint-key">W</span><span class="hint-key">S</span> 移动</span>
                    <span>|</span>
                    <span><span class="hint-key">Enter</span> 确认</span>
                    <span>|</span>
                    <span><span class="hint-btn hint-btn-west">西</span> 确认</span>
                </div>
            `;
            
            // 添加到 body
            document.body.appendChild(gameoverScreen);
            document.body.appendChild(victoryScreen);
            
            // 绑定按钮事件
            bindButtonEvents();
        }
        
        /**
         * 绑定按钮事件
         */
        function bindButtonEvents() {
            const handleClick = (e) => {
                const action = e.target.dataset.action;
                if (!action) return;
                
                switch (action) {
                    case 'restart':
                    case 'replay':
                        if (onRestart) onRestart();
                        break;
                    case 'revive':
                        if (onRevive) onRevive();
                        break;
                    case 'next':
                        if (onNextLevel) onNextLevel();
                        break;
                    case 'back':
                        if (onBackToMenu) onBackToMenu();
                        break;
                }
            };
            
            gameoverScreen.addEventListener('click', handleClick);
            victoryScreen.addEventListener('click', handleClick);
        }
        
        /**
         * 显示 Game Over 界面
         * @param {Object} data - 显示数据
         */
        function showGameOver(data = {}) {
            const { totalTime = 0, playTime = 0, penaltyTime = 0, bestTime = 0 } = data;
            
            document.getElementById('gs-final-time').textContent = formatTime(totalTime);
            document.getElementById('gs-final-play-time').textContent = formatTime(playTime);
            document.getElementById('gs-final-penalty-time').textContent = `+${penaltyTime}s`;
            document.getElementById('gs-final-best-time').textContent = formatBestTime(bestTime);
            
            gameoverScreen.style.display = 'block';
            victoryScreen.style.display = 'none';
            
            // 设置菜单
            if (menuSystem) {
                menuSystem.setup('gs-gameover-buttons', '.menu-btn');
            }
            
            return 'gameover';
        }
        
        /**
         * 显示 Victory 界面
         * @param {Object} data - 显示数据
         */
        function showVictory(data = {}) {
            const { totalTime = 0, playTime = 0, penaltyTime = 0, bestTime = 0 } = data;
            
            document.getElementById('gs-victory-time').textContent = formatTime(totalTime);
            document.getElementById('gs-victory-play-time').textContent = formatTime(playTime);
            document.getElementById('gs-victory-penalty-time').textContent = `+${penaltyTime}s`;
            document.getElementById('gs-victory-best-time').textContent = formatBestTime(bestTime);
            
            victoryScreen.style.display = 'block';
            gameoverScreen.style.display = 'none';
            
            // 设置菜单
            if (menuSystem) {
                menuSystem.setup('gs-victory-buttons', '.menu-btn');
            }
            
            return 'victory';
        }
        
        /**
         * 隐藏所有界面
         */
        function hide() {
            if (gameoverScreen) gameoverScreen.style.display = 'none';
            if (victoryScreen) victoryScreen.style.display = 'none';
        }
        
        /**
         * 设置缩放
         * @param {number} scale - 缩放比例
         */
        function setScale(scale) {
            if (gameoverScreen) {
                gameoverScreen.style.transform = `translate(-50%, -50%) scale(${scale})`;
            }
            if (victoryScreen) {
                victoryScreen.style.transform = `translate(-50%, -50%) scale(${scale})`;
            }
        }
        
        /**
         * 绑定菜单系统
         * @param {Object} menu - GameUtils.createMenuSystem() 返回的实例
         */
        function bindMenuSystem(menu) {
            menuSystem = menu;
        }
        
        /**
         * 获取当前显示状态
         */
        function getVisibleScreen() {
            if (gameoverScreen?.style.display !== 'none') return 'gameover';
            if (victoryScreen?.style.display !== 'none') return 'victory';
            return null;
        }
        
        /**
         * 获取 DOM 元素（用于外部访问）
         */
        function getElements() {
            return {
                gameover: gameoverScreen,
                victory: victoryScreen
            };
        }
        
        // 初始化
        createHTML();
        
        return {
            showGameOver,
            showVictory,
            hide,
            setScale,
            bindMenuSystem,
            getVisibleScreen,
            getElements
        };
    }
    
    // ==================== 调试日志系统 ====================
    
    /**
     * 创建调试日志系统
     * @param {string} containerId - 日志容器的 ID
     * @param {number} maxItems - 最大日志条数
     * @returns {Object} 日志系统实例
     */
    function createDebugLog(containerId, maxItems = 20) {
        const container = document.getElementById(containerId);
        
        /**
         * 添加日志
         * @param {string} message - HTML 格式的消息
         */
        function add(message) {
            if (!container) return;
            
            const item = document.createElement('div');
            item.className = 'debug-log-item';
            item.innerHTML = message;
            container.insertBefore(item, container.firstChild);
            
            // 限制数量
            while (container.children.length > maxItems) {
                container.removeChild(container.lastChild);
            }
        }
        
        /**
         * 清空日志
         */
        function clear() {
            if (container) {
                container.innerHTML = '';
            }
        }
        
        /**
         * 记录波次信息
         * @param {number} waveNum - 波次号
         * @param {number} targetCount - 目标数量
         * @param {number} dangerCount - 危险数量
         */
        function logWave(waveNum, targetCount, dangerCount) {
            add(`<span class="log-wave">Wave ${waveNum}</span>: ` +
                `<span class="log-cyan">■${targetCount}</span> / ` +
                `<span class="log-pink">■${dangerCount}</span>`);
        }
        
        return { add, clear, logWave };
    }
    
    // ==================== 其他工具函数 ====================
    
    /**
     * 随机打乱数组
     * @param {Array} array - 要打乱的数组
     * @returns {Array} 打乱后的数组（原数组被修改）
     */
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    /**
     * 随机选择数组中的一个元素
     * @param {Array} array - 数组
     * @returns {*} 随机元素
     */
    function randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    
    /**
     * 限制数值范围
     * @param {number} value - 值
     * @param {number} min - 最小值
     * @param {number} max - 最大值
     * @returns {number} 限制后的值
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    
    /**
     * 线性插值
     * @param {number} a - 起始值
     * @param {number} b - 结束值
     * @param {number} t - 插值因子 (0-1)
     * @returns {number} 插值结果
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    /**
     * 缓动函数：ease-out
     * @param {number} t - 进度 (0-1)
     * @returns {number} 缓动后的进度
     */
    function easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    
    /**
     * 缓动函数：ease-in-out
     * @param {number} t - 进度 (0-1)
     * @returns {number} 缓动后的进度
     */
    function easeInOut(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    return {
        // 时间
        formatTime,
        formatBestTime,
        formatTimeMs,
        
        // 工厂函数
        createFloatingTextSystem,
        createMenuSystem,
        createDebugLog,
        createStartOverlay,   // 开始蒙版（按任意键开始）
        createGameScreens,    // 游戏结束屏幕（gameover/victory）
        
        // 工具
        shuffle,
        randomChoice,
        clamp,
        lerp,
        easeOut,
        easeInOut
    };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameUtils;
}

