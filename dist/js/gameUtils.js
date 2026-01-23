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
                // 只选择可见的按钮（排除 display: none 的按钮）
                buttons = Array.from(container.querySelectorAll(buttonSelector))
                    .filter(btn => btn.style.display !== 'none' && getComputedStyle(btn).display !== 'none');
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
                    // 播放切换音效
                    if (typeof SoundManager !== 'undefined') {
                        SoundManager.playClick();
                    }
                } else if (joystick.y > 0.5) {
                    selectedIndex = (selectedIndex + 1) % buttons.length;
                    updateSelection();
                    moveThrottle = true;
                    setTimeout(() => moveThrottle = false, 200);
                    // 播放切换音效
                    if (typeof SoundManager !== 'undefined') {
                        SoundManager.playClick();
                    }
                }
            }
            
            // 确认按钮
            if (btns[confirmButton] && !confirmPressed) {
                confirmPressed = true;
                // 播放确认音效
                if (typeof SoundManager !== 'undefined') {
                    SoundManager.playClick();
                }
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
            // 播放切换音效
            if (typeof SoundManager !== 'undefined') {
                SoundManager.playClick();
            }
        }
        
        /**
         * 键盘下移
         */
        function moveDown() {
            if (buttons.length === 0) return;
            selectedIndex = (selectedIndex + 1) % buttons.length;
            updateSelection();
            // 播放切换音效
            if (typeof SoundManager !== 'undefined') {
                SoundManager.playClick();
            }
        }
        
        /**
         * 确认选中
         */
        function confirm() {
            // 播放确认音效
            if (typeof SoundManager !== 'undefined') {
                SoundManager.playClick();
            }
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
                /* 全屏遮罩背景 */
                .game-screen-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0);
                    z-index: 999;
                    pointer-events: none;
                    transition: background 0.5s ease;
                }
                .game-screen-overlay.visible {
                    background: rgba(0, 0, 0, 0.5);
                    pointer-events: auto;
                }
                
                .game-screen {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.9);
                    border: 2px solid #00f2ff;
                    padding: 30px 40px;
                    text-align: center;
                    z-index: 1000;
                    box-shadow: 0 0 15px #00f2ff, inset 0 0 10px #00f2ff;
                    font-family: 'Orbitron', 'Noto Sans SC', sans-serif;
                    color: white;
                    transform-origin: center center;
                    /* 初始隐藏状态 */
                    opacity: 0;
                    visibility: hidden;
                    /* 限制光芒在菜单内 */
                    overflow: hidden;
                }
                
                /* 入场动画 - 能量聚集 + 故障闪烁 */
                .game-screen.animate-in {
                    animation: screenGlitchIn 0.5s ease-out forwards;
                }
                
                /* 隐藏动画 */
                .game-screen.animate-out {
                    animation: screenGlitchOut 0.25s ease-in forwards;
                }
                
                @keyframes screenGlitchIn {
                    0% {
                        opacity: 0;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(0.3);
                        filter: blur(20px) brightness(3);
                    }
                    20% {
                        opacity: 1;
                        transform: translate(-48%, -50%) scale(1.05);
                        filter: blur(0) brightness(1.5);
                    }
                    25% {
                        transform: translate(-52%, -50%) scale(1.02);
                        filter: blur(2px) brightness(1);
                    }
                    35% {
                        transform: translate(-50%, -48%) scale(1);
                        filter: blur(0) brightness(1.3);
                    }
                    45% {
                        transform: translate(-50%, -52%) scale(1.01);
                    }
                    60% {
                        filter: blur(0) brightness(1);
                    }
                    100% {
                        opacity: 1;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(1);
                        filter: blur(0) brightness(1);
                    }
                }
                
                @keyframes screenGlitchOut {
                    0% {
                        opacity: 1;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(var(--menu-scale, 1));
                        filter: blur(0);
                    }
                    30% {
                        transform: translate(-48%, -50%) scale(calc(var(--menu-scale, 1) * 1.02));
                        filter: blur(2px);
                    }
                    100% {
                        opacity: 0;
                        visibility: hidden;
                        transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 0.5));
                        filter: blur(15px) brightness(2);
                    }
                }
                
                /* 边框发光脉冲效果 */
                .game-screen.animate-in::before {
                    content: '';
                    position: absolute;
                    top: -2px;
                    left: -2px;
                    right: -2px;
                    bottom: -2px;
                    background: linear-gradient(90deg, transparent, #00f2ff, transparent);
                    z-index: -1;
                    opacity: 0;
                    animation: borderScan 0.4s ease-out forwards;
                }
                
                @keyframes borderScan {
                    0% {
                        opacity: 1;
                        transform: translateX(-100%);
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                }
                
                /* 死亡专用动画 - 从零弹出 + 旋转 */
                .game-screen.death-in {
                    animation: screenDeathIn 0.5s ease-out forwards;
                }
                
                @keyframes screenDeathIn {
                    0% {
                        opacity: 0;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(0) rotate(8deg);
                        filter: blur(15px) brightness(2);
                    }
                    35% {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 1.1)) rotate(-2deg);
                        filter: blur(0) brightness(1.3);
                    }
                    55% {
                        transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 0.96)) rotate(1deg);
                        filter: brightness(1.1);
                    }
                    75% {
                        transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 1.03)) rotate(-0.5deg);
                        filter: brightness(1);
                    }
                    100% {
                        opacity: 1;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(var(--menu-scale, 1)) rotate(0deg);
                        filter: blur(0) brightness(1);
                    }
                }
                
                /* 胜利专用动画 - 更华丽 */
                .game-screen.victory-in {
                    animation: screenVictoryIn 0.6s ease-out forwards;
                }
                
                @keyframes screenVictoryIn {
                    0% {
                        opacity: 0;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(0) rotate(-5deg);
                        filter: blur(20px) brightness(3);
                    }
                    40% {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 1.08)) rotate(1deg);
                        filter: blur(0) brightness(1.5);
                    }
                    60% {
                        transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 0.98)) rotate(-0.5deg);
                        filter: brightness(1.2);
                    }
                    80% {
                        transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 1.02)) rotate(0deg);
                        filter: brightness(1.1);
                    }
                    100% {
                        opacity: 1;
                        visibility: visible;
                        transform: translate(-50%, -50%) scale(var(--menu-scale, 1)) rotate(0deg);
                        filter: blur(0) brightness(1);
                    }
                }
                
                /* 胜利边框金色光芒 */
                .game-screen.victory-in::before {
                    content: '';
                    position: absolute;
                    top: -3px;
                    left: -3px;
                    right: -3px;
                    bottom: -3px;
                    background: linear-gradient(90deg, transparent, #ffd700, #ff8c00, transparent);
                    z-index: -1;
                    opacity: 0;
                    animation: goldenScan 0.5s ease-out forwards;
                }
                
                @keyframes goldenScan {
                    0% {
                        opacity: 1;
                        transform: translateX(-100%);
                    }
                    60% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                }
                
                /* 屏幕闪烁效果 */
                .screen-flash {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 998;
                    opacity: 0;
                }
                
                /* 死亡红色闪烁 + 震动 */
                .screen-flash.death {
                    background: radial-gradient(circle at center, rgba(255, 0, 0, 0.6), rgba(100, 0, 0, 0.3));
                    animation: deathFlash 0.5s ease-out forwards;
                }
                
                @keyframes deathFlash {
                    0% { opacity: 0.9; }
                    15% { opacity: 0.4; }
                    30% { opacity: 0.7; }
                    50% { opacity: 0.3; }
                    70% { opacity: 0.5; }
                    100% { opacity: 0; }
                }
                
                /* 画面震动效果 */
                .screen-shake {
                    animation: screenShake 0.4s ease-out;
                }
                
                @keyframes screenShake {
                    0%, 100% { transform: translate(0, 0); }
                    10% { transform: translate(-8px, -5px); }
                    20% { transform: translate(8px, 5px); }
                    30% { transform: translate(-6px, 4px); }
                    40% { transform: translate(6px, -4px); }
                    50% { transform: translate(-4px, 3px); }
                    60% { transform: translate(4px, -3px); }
                    70% { transform: translate(-2px, 2px); }
                    80% { transform: translate(2px, -2px); }
                    90% { transform: translate(-1px, 1px); }
                }
                
                /* 胜利金色闪光 */
                .screen-flash.victory {
                    background: radial-gradient(circle at center, rgba(255, 215, 0, 0.5), rgba(255, 140, 0, 0.2));
                    animation: victoryFlash 0.6s ease-out forwards;
                }
                
                @keyframes victoryFlash {
                    0% { opacity: 0; }
                    30% { opacity: 0.7; }
                    100% { opacity: 0; }
                }
                .game-screen h1 { margin: 0 0 16px 0; font-size: 2.25rem; font-weight: 900; text-align: center; width: 100%; }
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
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    align-items: center;
                    justify-content: center;
                    font-size: 9px;
                    margin: 0 2px;
                    vertical-align: middle;
                }
                .game-screen .hint-btn-x {
                    font-size: 10px;
                    font-weight: bold;
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
                
                /* 星级评价样式 */
                .star-rating {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    margin: 16px 0;
                }
                .star-rating .star {
                    font-size: 2.5rem;
                    transition: all 0.3s ease;
                    opacity: 0;
                    transform: scale(0);
                }
                .star-rating .star.empty {
                    color: #333;
                    text-shadow: none;
                    opacity: 1;
                    transform: scale(1);
                }
                .star-rating .star.filled {
                    color: #ffd700;
                    text-shadow: 0 0 15px #ffd700, 0 0 30px #ff8c00;
                    animation: starBounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards,
                               starGlow 1.5s ease-in-out 0.6s infinite;
                }
                .star-rating .star.filled:nth-child(1) { animation-delay: 0.4s, 1.0s; }
                .star-rating .star.filled:nth-child(2) { animation-delay: 0.9s, 1.5s; }
                .star-rating .star.filled:nth-child(3) { animation-delay: 1.4s, 2.0s; }
                @keyframes starBounceIn {
                    0% { 
                        opacity: 0; 
                        transform: scale(0) rotate(-180deg); 
                    }
                    50% { 
                        transform: scale(1.3) rotate(10deg); 
                    }
                    70% { 
                        transform: scale(0.9) rotate(-5deg); 
                    }
                    100% { 
                        opacity: 1; 
                        transform: scale(1) rotate(0deg); 
                    }
                }
                @keyframes starGlow {
                    0%, 100% { 
                        transform: scale(1); 
                        text-shadow: 0 0 15px #ffd700, 0 0 30px #ff8c00;
                    }
                    50% { 
                        transform: scale(1.15); 
                        text-shadow: 0 0 25px #ffd700, 0 0 50px #ff8c00, 0 0 70px #ffd700;
                    }
                }
                .rating-text {
                    font-size: 14px;
                    letter-spacing: 2px;
                    margin-bottom: 8px;
                    opacity: 0.8;
                }
                .rating-text.rating-3 { color: #ffd700; text-shadow: 0 0 10px #ffd700; }
                .rating-text.rating-2 { color: #c0c0c0; text-shadow: 0 0 10px #c0c0c0; }
                .rating-text.rating-1 { color: #cd7f32; text-shadow: 0 0 10px #cd7f32; }
                .rating-text.rating-0 { color: #666; }
                .rating-standards {
                    display: flex;
                    justify-content: center;
                    gap: 16px;
                    font-size: 10px;
                    opacity: 0.5;
                    margin-bottom: 16px;
                }
                .rating-standards .std { letter-spacing: 1px; }
                .rating-standards .std-3 { color: #ffd700; }
                .rating-standards .std-2 { color: #c0c0c0; }
                .rating-standards .std-1 { color: #cd7f32; }
            `;
            document.head.appendChild(style);
        }
        
        // 遮罩层元素
        let overlayElement = null;
        // 闪烁效果元素
        let flashElement = null;
        
        /**
         * 创建 HTML 结构
         */
        function createHTML() {
            // 创建遮罩层
            overlayElement = document.createElement('div');
            overlayElement.className = 'game-screen-overlay';
            document.body.appendChild(overlayElement);
            
            // 创建闪烁效果元素
            flashElement = document.createElement('div');
            flashElement.className = 'screen-flash';
            document.body.appendChild(flashElement);
            
            // Game Over 界面
            gameoverScreen = document.createElement('div');
            gameoverScreen.id = 'gameover-screen';
            gameoverScreen.className = 'game-screen';
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
                    ${onRevive ? '<button class="btn-cyber menu-btn" id="gs-revive-btn" data-action="revive">复活 <span style="font-size: 10px; opacity: 0.7;">(+1分钟)</span></button>' : ''}
                    <button class="btn-cyber menu-btn" data-action="back">返回主菜单</button>
                </div>
                <div class="menu-hints">
                    <span><span class="hint-key">W</span><span class="hint-key">S</span> 移动</span>
                    <span>|</span>
                    <span><span class="hint-key">Enter</span> 确认</span>
                    <span>|</span>
                    <span><span class="hint-btn hint-btn-west hint-btn-x">X</span> 确认</span>
                    <span>|</span>
                    <span><span class="hint-btn hint-btn-west">西</span> 确认</span>
                </div>
            `;
            
            // Victory 界面
            victoryScreen = document.createElement('div');
            victoryScreen.id = 'victory-screen';
            victoryScreen.className = 'game-screen';
            victoryScreen.style.display = 'none';
            
            const gameTypeNames = {
                color: '颜色收集',
                redline: '红线危机',
                dangerousPassage: '危险通道'
            };
            
            // 计算下一关信息（支持跨游戏连接）
            // 关卡顺序：颜色收集 1-3 → 红线危机 1-3 → 危险通道 1-3
            const gameOrder = ['color', 'redline', 'dangerousPassage'];
            let nextLevelBtnText = '';
            let hasNextLevel = false;
            
            if (onNextLevel) {
                if (currentLevel < maxLevel) {
                    // 同游戏下一关
                    nextLevelBtnText = `${gameTypeNames[gameType]} 第${currentLevel + 1}关`;
                    hasNextLevel = true;
                } else {
                    // 检查是否有下一个游戏
                    const currentGameIndex = gameOrder.indexOf(gameType);
                    if (currentGameIndex >= 0 && currentGameIndex < gameOrder.length - 1) {
                        const nextGameType = gameOrder[currentGameIndex + 1];
                        nextLevelBtnText = `${gameTypeNames[nextGameType]} 第1关`;
                        hasNextLevel = true;
                    }
                    // 危险通道第3关是最终关，无下一关
                }
            }
            
            victoryScreen.innerHTML = `
                <h1 class="neon-gold">通关成功</h1>
                <div class="star-rating" id="gs-star-rating">
                    <span class="star empty">★</span>
                    <span class="star empty">★</span>
                    <span class="star empty">★</span>
                </div>
                <p class="rating-text" id="gs-rating-text">评价中...</p>
                <div class="rating-standards">
                    <span class="std std-3">★★★ &lt;2:30</span>
                    <span class="std std-2">★★ &lt;5:00</span>
                    <span class="std std-1">★ &lt;10:00</span>
                </div>
                <p class="time-label">通关用时</p>
                <p class="time-value neon-cyan" id="gs-victory-time">00:00</p>
                <div class="time-detail">
                    <span style="color: #4ade80;">游戏时间: <span id="gs-victory-play-time">00:00</span></span>
                    <span style="color: #ff6b6b;">惩罚时间: <span id="gs-victory-penalty-time">+0s</span></span>
                </div>
                <p class="best-time" style="margin-bottom: 8px;">最快记录: <span id="gs-victory-best-time">--:--</span></p>
                <div class="screen-buttons" id="gs-victory-buttons">
                    ${hasNextLevel ? `<button class="btn-cyber menu-btn" data-action="next">${nextLevelBtnText}</button>` : ''}
                    <button class="btn-cyber menu-btn" data-action="replay">再玩一次</button>
                    <button class="btn-cyber menu-btn" data-action="back">返回主菜单</button>
                </div>
                <div class="menu-hints">
                    <span><span class="hint-key">W</span><span class="hint-key">S</span> 移动</span>
                    <span>|</span>
                    <span><span class="hint-key">Enter</span> 确认</span>
                    <span>|</span>
                    <span><span class="hint-btn hint-btn-west hint-btn-x">X</span> 确认</span>
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
         * 触发屏幕效果
         * @param {string} type - 效果类型 ('death' | 'victory')
         */
        function triggerScreenEffect(type) {
            if (!flashElement) return;
            
            // 移除旧动画类
            flashElement.classList.remove('death', 'victory');
            
            // 触发重绘
            void flashElement.offsetWidth;
            
            // 添加新动画类
            flashElement.classList.add(type);
            
            // 震动效果（仅死亡时）
            if (type === 'death') {
                const canvas = document.querySelector('canvas');
                if (canvas) {
                    canvas.classList.add('screen-shake');
                    setTimeout(() => {
                        canvas.classList.remove('screen-shake');
                    }, 400);
                }
            }
            
            // 动画结束后移除类
            setTimeout(() => {
                flashElement.classList.remove(type);
            }, type === 'death' ? 500 : 600);
        }
        
        /**
         * 显示 Game Over 界面
         * @param {Object} data - 显示数据
         * @param {number} data.freezeDelay - 定格延迟时间（毫秒），默认800
         */
        function showGameOver(data = {}) {
            const { totalTime = 0, playTime = 0, penaltyTime = 0, bestTime = 0, freezeDelay = 800 } = data;
            
            // 先停止背景音乐，再播放失败音效
            if (typeof SoundManager !== 'undefined') {
                SoundManager.stopAllBGM();
                SoundManager.playLose();
            }
            
            // 触发死亡屏幕效果（红色闪烁 + 震动）
            triggerScreenEffect('death');
            
            // 更新数据（立即更新，但不显示）
            document.getElementById('gs-final-time').textContent = formatTime(totalTime);
            document.getElementById('gs-final-play-time').textContent = formatTime(playTime);
            document.getElementById('gs-final-penalty-time').textContent = `+${penaltyTime}s`;
            document.getElementById('gs-final-best-time').textContent = formatBestTime(bestTime);
            
            // 根据难度设置显示/隐藏复活按钮
            const reviveBtn = document.getElementById('gs-revive-btn');
            if (reviveBtn) {
                const difficulty = (typeof GameData !== 'undefined' && GameData.gameSettings) 
                    ? GameData.gameSettings.getDifficulty() 
                    : 'normal';
                reviveBtn.style.display = (difficulty === 'easy') ? 'block' : 'none';
            }
            
            // 确保隐藏 victory 界面
            victoryScreen.style.display = 'none';
            victoryScreen.classList.remove('animate-in', 'animate-out');
            
            // 定格一段时间后，显示遮罩和动画弹出菜单
            setTimeout(() => {
                // 显示遮罩
                if (overlayElement) {
                    overlayElement.classList.add('visible');
                }
                
                // 移除旧动画类，重置状态
                gameoverScreen.classList.remove('animate-in', 'animate-out', 'death-in', 'victory-in');
                gameoverScreen.style.display = 'block';
                
                // 设置 CSS 变量用于动画缩放
                gameoverScreen.style.setProperty('--menu-scale', currentScale);
                
                // 触发重绘后添加死亡专属动画
                void gameoverScreen.offsetWidth;
                gameoverScreen.classList.add('death-in');
                
                // 动画结束后保持可见状态
                gameoverScreen.addEventListener('animationend', function onAnimEnd() {
                    gameoverScreen.removeEventListener('animationend', onAnimEnd);
                    gameoverScreen.classList.remove('death-in');
                    gameoverScreen.style.opacity = '1';
                    gameoverScreen.style.visibility = 'visible';
                    gameoverScreen.style.transform = `translate(-50%, -50%) scale(${currentScale})`;
                });
                
                // 设置菜单
                if (menuSystem) {
                    menuSystem.setup('gs-gameover-buttons', '.menu-btn');
                }
            }, freezeDelay);
            
            return 'gameover';
        }
        
        /**
         * 计算星级评价
         * @param {number} totalTime - 总用时（秒）
         * @returns {Object} { stars: 0-3, text: 评价文字 }
         */
        function calculateRating(totalTime) {
            if (totalTime < 150) {        // < 2.5 分钟
                return { stars: 3, text: '完美通关！', className: 'rating-3' };
            } else if (totalTime < 300) { // < 5 分钟
                return { stars: 2, text: '优秀表现！', className: 'rating-2' };
            } else if (totalTime < 600) { // < 10 分钟
                return { stars: 1, text: '顺利通关', className: 'rating-1' };
            } else {                       // >= 10 分钟
                return { stars: 0, text: '艰难通关...', className: 'rating-0' };
            }
        }
        
        /**
         * 显示 Victory 界面
         * @param {Object} data - 显示数据
         * @param {number} data.freezeDelay - 定格延迟时间（毫秒），默认800
         */
        function showVictory(data = {}) {
            const { totalTime = 0, playTime = 0, penaltyTime = 0, bestTime = 0, freezeDelay = 800 } = data;
            
            // 先停止背景音乐，再播放胜利音效
            if (typeof SoundManager !== 'undefined') {
                SoundManager.stopAllBGM();
                SoundManager.playWin();
            }
            
            // 触发胜利屏幕效果（金色闪光）
            triggerScreenEffect('victory');
            
            // 更新数据（立即更新，但不显示）
            document.getElementById('gs-victory-time').textContent = formatTime(totalTime);
            document.getElementById('gs-victory-play-time').textContent = formatTime(playTime);
            document.getElementById('gs-victory-penalty-time').textContent = `+${penaltyTime}s`;
            document.getElementById('gs-victory-best-time').textContent = formatBestTime(bestTime);
            
            // 计算星级评价（准备数据）
            const rating = calculateRating(totalTime);
            const starContainer = document.getElementById('gs-star-rating');
            const ratingText = document.getElementById('gs-rating-text');
            
            // 先重置星星为空状态
            const stars = starContainer.querySelectorAll('.star');
            stars.forEach(star => {
                star.className = 'star empty';
            });
            ratingText.textContent = '';
            
            // 确保隐藏 gameover 界面
            gameoverScreen.style.display = 'none';
            gameoverScreen.classList.remove('animate-in', 'animate-out');
            
            // 定格一段时间后，显示遮罩和动画弹出菜单
            setTimeout(() => {
                // 显示遮罩
                if (overlayElement) {
                    overlayElement.classList.add('visible');
                }
                
                // 移除旧动画类，重置状态
                victoryScreen.classList.remove('animate-in', 'animate-out', 'death-in', 'victory-in');
                victoryScreen.style.display = 'block';
                
                // 设置 CSS 变量用于动画缩放
                victoryScreen.style.setProperty('--menu-scale', currentScale);
                
                // 触发重绘后添加胜利专属动画
                void victoryScreen.offsetWidth;
                victoryScreen.classList.add('victory-in');
                
                // 动画结束后保持可见状态
                victoryScreen.addEventListener('animationend', function onAnimEnd() {
                    victoryScreen.removeEventListener('animationend', onAnimEnd);
                    victoryScreen.classList.remove('victory-in');
                    victoryScreen.style.opacity = '1';
                    victoryScreen.style.visibility = 'visible';
                    victoryScreen.style.transform = `translate(-50%, -50%) scale(${currentScale})`;
                });
                
                // 菜单弹出后，延迟显示星星动画（等弹入动画结束后）
                setTimeout(() => {
                    stars.forEach((star, index) => {
                        if (index < rating.stars) {
                            star.className = 'star filled';
                            // 播放星星音效
                            const starNum = index + 1;
                            const delays = [400, 900, 1400];
                            setTimeout(() => {
                                if (typeof SoundManager !== 'undefined') {
                                    if (starNum === 1) SoundManager.playStar1();
                                    else if (starNum === 2) SoundManager.playStar2();
                                    else if (starNum === 3) SoundManager.playStar3();
                                }
                            }, delays[index]);
                        }
                    });
                    
                    // 更新评价文字
                    ratingText.textContent = rating.text;
                    ratingText.className = `rating-text ${rating.className}`;
                }, 200); // 等弹入动画播放一小段后开始星星动画
                
                // 设置菜单
                if (menuSystem) {
                    menuSystem.setup('gs-victory-buttons', '.menu-btn');
                }
            }, freezeDelay);
            
            return 'victory';
        }
        
        /**
         * 隐藏所有界面
         * @param {boolean} animate - 是否使用动画（默认 false，立即隐藏）
         */
        function hide(animate = false) {
            // 隐藏遮罩
            if (overlayElement) {
                overlayElement.classList.remove('visible');
            }
            
            const allAnimClasses = ['animate-in', 'animate-out', 'death-in', 'victory-in'];
            
            if (animate) {
                // 带动画隐藏
                const hideScreen = (screen) => {
                    if (screen && screen.style.display !== 'none') {
                        screen.classList.remove(...allAnimClasses);
                        screen.classList.add('animate-out');
                        setTimeout(() => {
                            screen.style.display = 'none';
                            screen.classList.remove('animate-out');
                            // 清除 inline style，恢复初始状态
                            screen.style.opacity = '';
                            screen.style.visibility = '';
                            screen.style.transform = '';
                        }, 250);
                    }
                };
                hideScreen(gameoverScreen);
                hideScreen(victoryScreen);
            } else {
                // 立即隐藏
                if (gameoverScreen) {
                    gameoverScreen.style.display = 'none';
                    gameoverScreen.classList.remove(...allAnimClasses);
                    // 清除 inline style，恢复初始状态
                    gameoverScreen.style.opacity = '';
                    gameoverScreen.style.visibility = '';
                    gameoverScreen.style.transform = '';
                }
                if (victoryScreen) {
                    victoryScreen.style.display = 'none';
                    victoryScreen.classList.remove(...allAnimClasses);
                    // 清除 inline style，恢复初始状态
                    victoryScreen.style.opacity = '';
                    victoryScreen.style.visibility = '';
                    victoryScreen.style.transform = '';
                }
            }
        }
        
        // 保存缩放比例，用于动画
        let currentScale = 1;
        
        /**
         * 设置缩放
         * @param {number} scale - 缩放比例
         */
        function setScale(scale) {
            currentScale = scale;
            // 注意：由于使用了动画，这里只在非动画状态下设置 transform
            // 动画会自动处理最终位置
            if (gameoverScreen && !gameoverScreen.classList.contains('animate-in')) {
                gameoverScreen.style.transform = `translate(-50%, -50%) scale(${scale})`;
            }
            if (victoryScreen && !victoryScreen.classList.contains('animate-in')) {
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
        // 如果 DebugPanel 模块可用，直接使用它
        if (typeof DebugPanel !== 'undefined') {
            return DebugPanel;
        }
        
        // 兼容模式：使用旧的内嵌 HTML 面板
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
    
    // ==================== 游戏内 UI 组件 ====================
    
    /**
     * 创建游戏内控制提示和玩家状态 UI
     * @param {HTMLElement} container - 父容器元素
     * @returns {Object} UI 控制对象
     */
    function createGameUI(container) {
        // 创建操作提示
        const controlHints = document.createElement('div');
        controlHints.className = 'mt-4 opacity-50';
        controlHints.style.cssText = 'font-size: 10px; line-height: 1.8;';
        controlHints.innerHTML = `
            <div>键盘 | [WASD] 移动 · <span style="color: #4ade80;">[J] 跳跃</span> · <span style="color: #f87171;">[K] 冲刺</span> · <span style="color: #facc15;">[I] 静步</span></div>
            <div style="margin-top: 2px;">手柄 | [摇杆] 移动 · <span style="color: #4ade80;">[A/南] 跳跃</span> · <span style="color: #f87171;">[B/东] 冲刺</span> · <span style="color: #facc15;">[Y/北] 静步</span></div>
        `;
        container.appendChild(controlHints);
        
        // 创建玩家状态
        const controllerStatus = document.createElement('div');
        controllerStatus.id = 'controller-status';
        controllerStatus.className = 'mt-3';
        controllerStatus.style.cssText = 'font-size: 12px; display: grid; grid-template-columns: repeat(4, 44px); gap: 4px 8px;';
        
        for (let i = 1; i <= 8; i++) {
            const span = document.createElement('span');
            span.id = `p${i}-status`;
            span.className = 'opacity-30';
            span.textContent = `● P${i}`;
            controllerStatus.appendChild(span);
        }
        container.appendChild(controllerStatus);
        
        // 玩家颜色映射
        const playerColors = {
            1: '#00ffff',  // 青色
            2: '#ff6b6b',  // 红色
            3: '#4ade80',  // 绿色
            4: '#facc15',  // 黄色
            5: '#a78bfa',  // 紫色
            6: '#fb923c',  // 橙色
            7: '#f472b6',  // 粉色
            8: '#38bdf8'   // 天蓝
        };
        
        /**
         * 更新控制器 UI 状态
         * @param {Object} ControllerManager - 控制器管理器实例
         */
        function updateControllerUI(ControllerManager) {
            if (!ControllerManager) return;
            
            for (let i = 1; i <= 8; i++) {
                const el = document.getElementById(`p${i}-status`);
                if (!el) continue;
                
                const isActive = ControllerManager.hasPlayer(i);
                const color = playerColors[i];
                
                if (isActive) {
                    el.style.opacity = '1';
                    el.style.color = color;
                    el.style.textShadow = `0 0 8px ${color}`;
                } else {
                    el.style.opacity = '0.3';
                    el.style.color = '';
                    el.style.textShadow = '';
                }
            }
        }
        
        return {
            controlHints,
            controllerStatus,
            updateControllerUI
        };
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
        createGameUI,         // 游戏内控制提示和玩家状态
        
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

