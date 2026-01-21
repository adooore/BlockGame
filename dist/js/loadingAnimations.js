/**
 * 加载动画模块
 * 包含各种加载界面动画
 */

const LoadingAnimations = (function() {
    
    // ==================== 霓虹方块加载动画 ====================
    
    /**
     * 创建霓虹方块加载界面
     * 四个彩色方块脉冲发光
     * @param {Object} options - 配置选项
     * @returns {Object} 加载界面实例
     */
    // 默认游戏小提示
    const DEFAULT_TIPS = [
        '推荐使用 [方寸枢] 进行游戏',
        '游戏可支持八人同玩',
        '扫描二维码可用手机当手柄,尝试使用方寸枢进行游玩吧!',
        '支持 Xbox、PlayStation 等主流手柄',
        '冲刺时可以穿过其他玩家',
        '与其绕远路，不如尝试一下跳跃功能',
        '在换衣区中可以更换角色颜色',
        '在设置中可以关闭键盘控制',
        '挑战更高分数，超越自己！'
    ];
    
    function createNeonCubes(options = {}) {
        const {
            minDuration = 1000,      // 最小显示时间（毫秒）
            title = '加载中',        // 标题文字
            subtitle = '',           // 副标题
            waitForInput = true,     // 是否等待用户输入才结束
            inputHint = '按任意键继续', // 等待输入时的提示
            tips = DEFAULT_TIPS,     // 小提示数组
            tipInterval = 5000,      // 提示切换间隔（毫秒）
            onComplete = null        // 加载完成回调
        } = options;
        
        let overlay = null;
        let startTime = 0;
        let isLoading = true;
        let configLoaded = false;
        let readyForInput = false;   // 是否已准备好接收输入
        let inputListenersAdded = false;
        let tipTimer = null;         // 提示轮播定时器
        let currentTipIndex = -1;    // 当前提示索引
        
        // CSS 样式
        const styleId = 'loading-neon-cubes-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .loading-screen {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: #0a0a0c;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                    transition: opacity 0.4s ease;
                }
                .loading-screen.fade-out {
                    opacity: 0;
                    pointer-events: none;
                }
                .loading-logo {
                    position: relative;
                    width: 24vmin;
                    height: 24vmin;
                    margin-bottom: 8vmin;
                }
                .loading-cube {
                    position: absolute;
                    width: 42%;
                    height: 42%;
                    border: 0.8vmin solid;
                    animation: cubeFloat 1.6s ease-in-out infinite;
                }
                /* 青色 - 左上 */
                .loading-cube:nth-child(1) {
                    top: 0;
                    left: 0;
                    border-color: #00f2ff;
                    box-shadow: 0 0 3vmin #00f2ff, inset 0 0 1.6vmin rgba(0, 242, 255, 0.3);
                    animation-delay: 0s;
                }
                /* 黄色 - 右上 */
                .loading-cube:nth-child(2) {
                    top: 0;
                    right: 0;
                    border-color: #facc15;
                    box-shadow: 0 0 3vmin #facc15, inset 0 0 1.6vmin rgba(250, 204, 21, 0.3);
                    animation-delay: 0.2s;
                }
                /* 绿色 - 左下 */
                .loading-cube:nth-child(3) {
                    bottom: 0;
                    left: 0;
                    border-color: #4ade80;
                    box-shadow: 0 0 3vmin #4ade80, inset 0 0 1.6vmin rgba(74, 222, 128, 0.3);
                    animation-delay: 0.4s;
                }
                /* 粉色 - 右下 */
                .loading-cube:nth-child(4) {
                    bottom: 0;
                    right: 0;
                    border-color: #ff00ff;
                    box-shadow: 0 0 3vmin #ff00ff, inset 0 0 1.6vmin rgba(255, 0, 255, 0.3);
                    animation-delay: 0.6s;
                }
                @keyframes cubeFloat {
                    0%, 100% { 
                        transform: scale(1);
                        filter: brightness(0.8);
                    }
                    50% { 
                        transform: scale(0.9);
                        filter: brightness(1.3);
                    }
                }
                .loading-title {
                    font-family: 'Orbitron', 'Noto Sans SC', sans-serif;
                    font-size: 4.4vmin;
                    font-weight: 700;
                    color: #00f2ff;
                    text-shadow: 0 0 2vmin #00f2ff, 0 0 4vmin #00f2ff, 0 0 8vmin rgba(0, 242, 255, 0.5);
                    letter-spacing: 1.6vmin;
                    margin-bottom: 2vmin;
                }
                .loading-subtitle {
                    font-family: 'Noto Sans SC', sans-serif;
                    font-size: 3vmin;
                    color: rgba(255, 255, 255, 0.6);
                    letter-spacing: 0.6vmin;
                    text-shadow: 0 0 1vmin rgba(255, 255, 255, 0.3);
                }
                .loading-dots {
                    display: flex;
                    gap: 2vmin;
                    margin-top: 6vmin;
                }
                .loading-dot {
                    width: 2vmin;
                    height: 2vmin;
                    background: #00f2ff;
                    border-radius: 50%;
                    box-shadow: 0 0 2vmin #00f2ff;
                    animation: dotPulse 1.2s ease-in-out infinite;
                }
                .loading-dot:nth-child(1) { animation-delay: 0s; }
                .loading-dot:nth-child(2) { animation-delay: 0.2s; }
                .loading-dot:nth-child(3) { animation-delay: 0.4s; }
                @keyframes dotPulse {
                    0%, 100% { 
                        opacity: 0.4;
                        transform: scale(1);
                        box-shadow: 0 0 1vmin #00f2ff;
                    }
                    50% { 
                        opacity: 1;
                        transform: scale(1.3);
                        box-shadow: 0 0 3vmin #00f2ff, 0 0 6vmin #00f2ff;
                    }
                }
                .loading-hint {
                    font-family: 'Noto Sans SC', sans-serif;
                    font-size: 2.5vmin;
                    color: rgba(255, 255, 255, 0.8);
                    letter-spacing: 0.4vmin;
                    margin-top: 4vmin;
                    animation: hintBlink 1.5s ease-in-out infinite;
                }
                @keyframes hintBlink {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 1; }
                }
                .loading-tip {
                    position: absolute;
                    bottom: 8vmin;
                    left: 50%;
                    transform: translateX(-50%);
                    font-family: 'Noto Sans SC', sans-serif;
                    font-size: 2vmin;
                    color: #00f2ff;
                    text-shadow: 0 0 1vmin rgba(0, 242, 255, 0.5);
                    letter-spacing: 0.2vmin;
                    text-align: center;
                    max-width: 80%;
                    transition: opacity 0.5s ease, transform 0.5s ease;
                }
                .loading-tip.fade-out {
                    opacity: 0;
                    transform: translateX(-50%) translateY(5px);
                }
                .loading-tip.fade-in {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            `;
            document.head.appendChild(style);
        }
        
        /**
         * 创建 HTML
         */
        function createHTML() {
            overlay = document.createElement('div');
            overlay.className = 'loading-screen';
            overlay.innerHTML = `
                <div class="loading-logo">
                    <div class="loading-cube"></div>
                    <div class="loading-cube"></div>
                    <div class="loading-cube"></div>
                    <div class="loading-cube"></div>
                </div>
                <div class="loading-title">${title}</div>
                ${subtitle ? `<div class="loading-subtitle">${subtitle}</div>` : ''}
                <div class="loading-dots">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
                <div class="loading-hint" style="display: none;">${inputHint}</div>
                <div class="loading-tip"></div>
            `;
            document.body.appendChild(overlay);
            startTime = Date.now();
            
            // 开始小提示轮播
            if (tips && tips.length > 0) {
                showRandomTip();
                startTipRotation();
            }
        }
        
        /**
         * 获取随机提示（避免连续重复）
         */
        function getRandomTip() {
            if (!tips || tips.length === 0) return '';
            if (tips.length === 1) return tips[0];
            
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * tips.length);
            } while (newIndex === currentTipIndex);
            
            currentTipIndex = newIndex;
            return tips[currentTipIndex];
        }
        
        /**
         * 显示随机提示
         */
        function showRandomTip() {
            const tipEl = overlay?.querySelector('.loading-tip');
            if (!tipEl) return;
            
            // 淡出
            tipEl.classList.remove('fade-in');
            tipEl.classList.add('fade-out');
            
            setTimeout(() => {
                tipEl.textContent = getRandomTip();
                // 淡入
                tipEl.classList.remove('fade-out');
                tipEl.classList.add('fade-in');
            }, 300);
        }
        
        /**
         * 开始提示轮播
         */
        function startTipRotation() {
            if (tipTimer) return;
            tipTimer = setInterval(() => {
                if (!isLoading) {
                    stopTipRotation();
                    return;
                }
                showRandomTip();
            }, tipInterval);
        }
        
        /**
         * 停止提示轮播
         */
        function stopTipRotation() {
            if (tipTimer) {
                clearInterval(tipTimer);
                tipTimer = null;
            }
        }
        
        /**
         * 处理用户输入
         */
        function handleInput(e) {
            if (!readyForInput || !isLoading) return;
            
            // 阻止事件传播
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            // 移除监听器
            removeInputListeners();
            
            // 隐藏加载界面
            hide();
            if (onComplete) onComplete();
        }
        
        /**
         * 添加输入监听器
         */
        function addInputListeners() {
            if (inputListenersAdded) return;
            inputListenersAdded = true;
            
            // 键盘
            document.addEventListener('keydown', handleInput, { once: false });
            // 鼠标点击
            document.addEventListener('click', handleInput, { once: false });
            document.addEventListener('mousedown', handleInput, { once: false });
            // 触摸
            document.addEventListener('touchstart', handleInput, { once: false });
            
            // 手柄轮询
            startGamepadPolling();
        }
        
        /**
         * 移除输入监听器
         */
        function removeInputListeners() {
            document.removeEventListener('keydown', handleInput);
            document.removeEventListener('click', handleInput);
            document.removeEventListener('mousedown', handleInput);
            document.removeEventListener('touchstart', handleInput);
            stopGamepadPolling();
        }
        
        let gamepadPollInterval = null;
        
        /**
         * 开始手柄轮询
         */
        function startGamepadPolling() {
            if (gamepadPollInterval) return;
            
            gamepadPollInterval = setInterval(() => {
                if (!readyForInput || !isLoading) {
                    stopGamepadPolling();
                    return;
                }
                
                const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
                for (const gp of gamepads) {
                    if (!gp) continue;
                    // 检查任意按钮
                    for (const btn of gp.buttons) {
                        if (btn.pressed) {
                            handleInput(null);
                            return;
                        }
                    }
                }
            }, 100);
        }
        
        /**
         * 停止手柄轮询
         */
        function stopGamepadPolling() {
            if (gamepadPollInterval) {
                clearInterval(gamepadPollInterval);
                gamepadPollInterval = null;
            }
        }
        
        /**
         * 标记配置加载完成
         */
        function setConfigLoaded() {
            configLoaded = true;
            tryComplete();
        }
        
        /**
         * 尝试完成加载
         */
        function tryComplete() {
            if (!isLoading) return;
            
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, minDuration - elapsed);
            
            if (configLoaded) {
                setTimeout(() => {
                    if (waitForInput) {
                        // 显示提示，等待用户输入
                        showInputHint();
                        readyForInput = true;
                        addInputListeners();
                    } else {
                        // 不等待输入，直接结束
                        hide();
                        if (onComplete) onComplete();
                    }
                }, remaining);
            }
        }
        
        /**
         * 显示输入提示
         */
        function showInputHint() {
            const hintEl = overlay?.querySelector('.loading-hint');
            const dotsEl = overlay?.querySelector('.loading-dots');
            const subtitleEl = overlay?.querySelector('.loading-subtitle');
            
            if (hintEl) hintEl.style.display = 'block';
            if (dotsEl) dotsEl.style.display = 'none';
            if (subtitleEl) subtitleEl.style.display = 'none';
        }
        
        /**
         * 隐藏加载界面
         */
        function hide() {
            if (!overlay || !isLoading) return;
            isLoading = false;
            readyForInput = false;
            
            // 移除监听器和定时器
            removeInputListeners();
            stopTipRotation();
            
            overlay.classList.add('fade-out');
            setTimeout(() => {
                if (overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 500);
        }
        
        /**
         * 强制立即隐藏
         */
        function forceHide() {
            if (!overlay) return;
            isLoading = false;
            readyForInput = false;
            
            // 移除监听器和定时器
            removeInputListeners();
            stopTipRotation();
            
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }
        
        /**
         * 更新标题
         */
        function setTitle(newTitle) {
            const titleEl = overlay?.querySelector('.loading-title');
            if (titleEl) titleEl.textContent = newTitle;
        }
        
        /**
         * 更新副标题
         */
        function setSubtitle(newSubtitle) {
            const subtitleEl = overlay?.querySelector('.loading-subtitle');
            if (subtitleEl) subtitleEl.textContent = newSubtitle;
        }
        
        // 初始化
        createHTML();
        
        return {
            setConfigLoaded,
            hide,
            forceHide,
            setTitle,
            setSubtitle
        };
    }
    
    // ==================== 游戏开场动画 ====================
    
    /**
     * 创建游戏开场动画
     * 展示游戏名称"方寸枢机"，带有霸气的霓虹特效
     * @param {Object} options - 配置选项
     * @returns {Object} 开场动画实例
     */
    function createIntro(options = {}) {
        const {
            title = '方寸枢机',
            subtitle = 'BLOCK GAME',
            duration = 2000,         // 总动画时长（2秒）
            onComplete = null
        } = options;
        
        let overlay = null;
        let isPlaying = true;
        
        // 加载本地字体
        const fontStyleId = 'intro-font-style';
        if (!document.getElementById(fontStyleId)) {
            const fontStyle = document.createElement('style');
            fontStyle.id = fontStyleId;
            fontStyle.textContent = `
                @font-face {
                    font-family: 'Bebas Neue';
                    src: url('fonts/BebasNeue-Regular.ttf') format('truetype');
                    font-weight: 400;
                    font-style: normal;
                    font-display: swap;
                }
                @font-face {
                    font-family: 'Montserrat';
                    src: url('fonts/Montserrat-Bold.ttf') format('truetype');
                    font-weight: 700;
                    font-style: normal;
                    font-display: swap;
                }
            `;
            document.head.appendChild(fontStyle);
        }
        
        // CSS 样式
        const styleId = 'intro-animation-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .intro-screen {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: #000;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                    overflow: hidden;
                }
                /* 黑场遮罩 - 初始透明 */
                .intro-blackout {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: #000;
                    opacity: 0;
                    z-index: 100;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                /* 黑场淡入 */
                .intro-blackout.fade-in {
                    animation: blackoutFadeIn 0.5s ease-out forwards;
                }
                @keyframes blackoutFadeIn {
                    0% { opacity: 0; }
                    100% { opacity: 1; }
                }
                /* 黑场文字 - 现代标题体 */
                .intro-blackout-text {
                    font-family: 'Bebas Neue', 'Montserrat', sans-serif;
                    font-size: 9vmin;
                    font-weight: 400;
                    color: #fff;
                    letter-spacing: 1.5vmin;
                    opacity: 0;
                }
                .intro-blackout.fade-in .intro-blackout-text {
                    animation: blackoutTextFadeIn 0.6s ease forwards;
                    animation-delay: 0.3s;
                }
                @keyframes blackoutTextFadeIn {
                    0% { opacity: 0; transform: scale(0.9); }
                    100% { opacity: 1; transform: scale(1); }
                }
                /* 文字淡出 */
                .intro-blackout.text-fade-out .intro-blackout-text {
                    animation: blackoutTextFadeOut 0.8s ease forwards;
                }
                @keyframes blackoutTextFadeOut {
                    0% { opacity: 1; }
                    100% { opacity: 0; }
                }
                /* 黑场淡出 */
                .intro-screen.fade-out {
                    animation: introFadeOut 1.2s ease forwards;
                }
                @keyframes introFadeOut {
                    0% { opacity: 1; }
                    100% { opacity: 0; pointer-events: none; }
                }
                
                /* 背景光线 - 青紫交错 */
                .intro-rays {
                    position: absolute;
                    width: 200%;
                    height: 200%;
                    background: 
                        conic-gradient(from 0deg at 50% 50%, 
                            transparent 0deg, 
                            rgba(0, 242, 255, 0.05) 15deg, 
                            transparent 30deg,
                            transparent 45deg,
                            rgba(168, 85, 247, 0.05) 60deg,
                            transparent 75deg,
                            transparent 90deg,
                            rgba(0, 242, 255, 0.05) 105deg,
                            transparent 120deg,
                            transparent 135deg,
                            rgba(168, 85, 247, 0.05) 150deg,
                            transparent 165deg,
                            transparent 180deg,
                            rgba(0, 242, 255, 0.05) 195deg,
                            transparent 210deg,
                            transparent 225deg,
                            rgba(168, 85, 247, 0.05) 240deg,
                            transparent 255deg,
                            transparent 270deg,
                            rgba(0, 242, 255, 0.05) 285deg,
                            transparent 300deg,
                            transparent 315deg,
                            rgba(168, 85, 247, 0.05) 330deg,
                            transparent 345deg
                        );
                    animation: raysRotate 8s linear infinite;
                    opacity: 0;
                }
                .intro-screen.active .intro-rays {
                    animation: raysAppear 1s ease forwards, raysRotate 8s linear infinite;
                }
                @keyframes raysRotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes raysAppear {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                /* 主标题容器 */
                .intro-title-container {
                    position: relative;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                
                /* 背景光晕 */
                .intro-glow {
                    position: absolute;
                    width: 60vmin;
                    height: 30vmin;
                    background: radial-gradient(ellipse at center, 
                        rgba(0, 242, 255, 0.15) 0%, 
                        rgba(168, 85, 247, 0.1) 40%,
                        transparent 70%);
                    filter: blur(3vmin);
                    opacity: 0;
                    z-index: -1;
                }
                .intro-screen.active .intro-glow {
                    animation: glowAppear 1s ease forwards;
                }
                @keyframes glowAppear {
                    from { opacity: 0; transform: scale(0.5); }
                    to { opacity: 1; transform: scale(1); }
                }
                
                /* 主标题容器 */
                .intro-title {
                    font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
                    font-size: 12vmin;
                    font-weight: 900;
                    letter-spacing: 2vmin;
                    position: relative;
                    opacity: 0;
                    transform: scale(0.3) skewX(-8deg);
                    display: flex;
                }
                .intro-screen.active .intro-title {
                    animation: titleBurst 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                               glitchFlicker 4s step-end infinite;
                    animation-delay: 0s, 2s;
                }
                /* 方寸 - 青色 */
                .intro-title-cyan {
                    color: #00f2ff;
                    text-shadow: 
                        0 0 1vmin rgba(0, 242, 255, 0.8),
                        0 0 2vmin rgba(0, 242, 255, 0.5),
                        0 0 4vmin rgba(0, 242, 255, 0.3);
                    position: relative;
                }
                .intro-title-cyan::before {
                    content: attr(data-text);
                    position: absolute;
                    top: 0;
                    left: 0;
                    color: #fff;
                    z-index: -1;
                    opacity: 0;
                }
                .intro-screen.active .intro-title-cyan::before {
                    animation: glitchWhite 0.15s ease-in-out infinite alternate;
                    animation-delay: 1.5s;
                    opacity: 0.6;
                }
                /* 枢机 - 紫色 */
                .intro-title-purple {
                    color: #a855f7;
                    text-shadow: 
                        0 0 1vmin rgba(168, 85, 247, 0.8),
                        0 0 2vmin rgba(168, 85, 247, 0.5),
                        0 0 4vmin rgba(168, 85, 247, 0.3);
                    position: relative;
                }
                .intro-title-purple::before {
                    content: attr(data-text);
                    position: absolute;
                    top: 0;
                    left: 0;
                    color: #fff;
                    z-index: -1;
                    opacity: 0;
                }
                .intro-screen.active .intro-title-purple::before {
                    animation: glitchWhite 0.15s ease-in-out infinite alternate-reverse;
                    animation-delay: 1.5s;
                    opacity: 0.6;
                }
                @keyframes titleBurst {
                    0% {
                        opacity: 0;
                        transform: scale(0.3) skewX(-8deg);
                        filter: blur(10px);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.1) skewX(-8deg);
                        filter: blur(0);
                    }
                    70% {
                        transform: scale(0.95) skewX(-8deg);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) skewX(-8deg);
                        filter: blur(0);
                    }
                }
                @keyframes glitchWhite {
                    0% { transform: translate(-0.3vmin, 0.1vmin); }
                    20% { transform: translate(0.2vmin, -0.1vmin); }
                    40% { transform: translate(-0.2vmin, 0.2vmin); clip-path: inset(20% 0 60% 0); }
                    60% { transform: translate(0.3vmin, 0); clip-path: inset(50% 0 30% 0); }
                    80% { transform: translate(-0.1vmin, -0.2vmin); clip-path: inset(10% 0 80% 0); }
                    100% { transform: translate(0.2vmin, 0.1vmin); clip-path: none; }
                }
                /* 随机故障闪烁 */
                @keyframes glitchFlicker {
                    0%, 100% { opacity: 1; transform: scale(1) skewX(-8deg); }
                    7% { opacity: 0.9; transform: scale(1) skewX(-8deg); }
                    8% { opacity: 1; transform: scale(1.01) skewX(-9deg); }
                    9% { opacity: 0.95; transform: scale(0.99) skewX(-7deg); }
                    10% { opacity: 1; transform: scale(1) skewX(-8deg); }
                    47% { opacity: 1; transform: scale(1) skewX(-8deg); }
                    48% { opacity: 0.85; transform: scale(1) skewX(-8deg) translateX(-0.2vmin); }
                    49% { opacity: 1; transform: scale(1) skewX(-8deg) translateX(0); }
                    77% { opacity: 1; transform: scale(1) skewX(-8deg); }
                    78% { opacity: 0.9; transform: scale(1.02) skewX(-8deg); }
                    79% { opacity: 1; transform: scale(1) skewX(-8deg); }
                }
                
                /* 副标题 - 紫色霓虹 */
                .intro-subtitle {
                    font-family: 'Orbitron', monospace;
                    font-size: 2.5vmin;
                    font-weight: 400;
                    color: #a855f7;
                    letter-spacing: 1.5vmin;
                    margin-top: 3vmin;
                    opacity: 0;
                    text-shadow: 0 0 1vmin #a855f7, 0 0 2vmin rgba(168, 85, 247, 0.5);
                }
                .intro-screen.active .intro-subtitle {
                    animation: subtitleFade 0.8s ease forwards;
                    animation-delay: 0.8s;
                }
                @keyframes subtitleFade {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                /* 装饰线条 - 左青右紫 */
                .intro-line {
                    position: absolute;
                    height: 3px;
                    opacity: 0;
                }
                .intro-line-left {
                    left: 5%;
                    width: 25%;
                    top: 50%;
                    background: linear-gradient(90deg, transparent, #00f2ff, #00f2ff);
                    box-shadow: 0 0 10px #00f2ff, 0 0 20px rgba(0, 242, 255, 0.5);
                }
                .intro-line-right {
                    right: 5%;
                    width: 25%;
                    top: 50%;
                    background: linear-gradient(90deg, #a855f7, #a855f7, transparent);
                    box-shadow: 0 0 10px #a855f7, 0 0 20px rgba(168, 85, 247, 0.5);
                }
                .intro-screen.active .intro-line-left {
                    animation: lineExpandLeft 0.6s ease forwards;
                    animation-delay: 0.6s;
                }
                .intro-screen.active .intro-line-right {
                    animation: lineExpandRight 0.6s ease forwards;
                    animation-delay: 0.6s;
                }
                @keyframes lineExpandLeft {
                    from { opacity: 0; transform: scaleX(0); transform-origin: right; }
                    to { opacity: 1; transform: scaleX(1); transform-origin: right; }
                }
                @keyframes lineExpandRight {
                    from { opacity: 0; transform: scaleX(0); transform-origin: left; }
                    to { opacity: 1; transform: scaleX(1); transform-origin: left; }
                }
                
                /* 粒子/火花效果 */
                .intro-particles {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                }
                .intro-particle {
                    position: absolute;
                    opacity: 0;
                }
                /* 圆形火花 */
                .intro-particle.spark-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    box-shadow: 0 0 8px var(--spark-color), 0 0 15px var(--spark-color);
                }
                /* 拖尾火花 */
                .intro-particle.spark-trail {
                    width: 3px;
                    height: 15px;
                    border-radius: 3px;
                    box-shadow: 0 0 6px var(--spark-color), 0 0 12px var(--spark-color);
                }
                /* 十字火花 */
                .intro-particle.spark-cross {
                    width: 2px;
                    height: 20px;
                    border-radius: 2px;
                    box-shadow: 0 0 8px var(--spark-color);
                }
                .intro-particle.spark-cross::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 20px;
                    height: 2px;
                    background: inherit;
                    border-radius: 2px;
                    transform: translate(-50%, -50%);
                    box-shadow: 0 0 8px var(--spark-color);
                }
                .intro-screen.active .intro-particle {
                    animation: particleBurst var(--spark-duration) ease-out forwards;
                }
                @keyframes particleBurst {
                    0% {
                        opacity: 1;
                        transform: translate(0, 0) scale(1) rotate(0deg);
                    }
                    30% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 0;
                        transform: var(--particle-end) scale(0) rotate(var(--spark-rotate));
                    }
                }
                
                /* 闪光效果 - 青紫渐变 */
                .intro-flash {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, rgba(0, 242, 255, 0.9), rgba(168, 85, 247, 0.9));
                    opacity: 0;
                    pointer-events: none;
                }
                .intro-screen.active .intro-flash {
                    animation: flashBang 0.4s ease-out forwards;
                    animation-delay: 0.1s;
                }
                @keyframes flashBang {
                    0% { opacity: 0.7; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        /**
         * 创建火花粒子
         */
        function createParticles(container, count = 40) {
            const sparkTypes = ['spark-dot', 'spark-dot', 'spark-trail', 'spark-cross'];
            const colors = ['#00f2ff', '#a855f7', '#00f2ff', '#a855f7', '#facc15', '#4ade80'];
            
            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                const sparkType = sparkTypes[Math.floor(Math.random() * sparkTypes.length)];
                particle.className = `intro-particle ${sparkType}`;
                
                // 随机位置（从中心开始）
                particle.style.left = '50%';
                particle.style.top = '50%';
                
                // 随机方向和距离
                const angle = (Math.random() * 360) * (Math.PI / 180);
                const distance = 20 + Math.random() * 50; // vmin
                const endX = Math.cos(angle) * distance;
                const endY = Math.sin(angle) * distance;
                
                // 随机颜色
                const color = colors[Math.floor(Math.random() * colors.length)];
                particle.style.background = color;
                particle.style.setProperty('--spark-color', color);
                particle.style.setProperty('--particle-end', `translate(${endX}vmin, ${endY}vmin)`);
                particle.style.setProperty('--spark-rotate', `${Math.random() * 360}deg`);
                particle.style.setProperty('--spark-duration', `${1 + Math.random() * 1}s`);
                particle.style.animationDelay = `${0.05 + Math.random() * 0.4}s`;
                
                // 拖尾火花指向运动方向
                if (sparkType === 'spark-trail') {
                    particle.style.transform = `rotate(${angle + Math.PI/2}rad)`;
                }
                
                container.appendChild(particle);
            }
        }
        
        /**
         * 创建 HTML
         */
        function createHTML() {
            overlay = document.createElement('div');
            overlay.className = 'intro-screen';
            overlay.innerHTML = `
                <div class="intro-rays"></div>
                <div class="intro-flash"></div>
                <div class="intro-particles"></div>
                <div class="intro-line intro-line-left"></div>
                <div class="intro-line intro-line-right"></div>
                <div class="intro-title-container">
                    <div class="intro-glow"></div>
                    <div class="intro-title">
                        <span class="intro-title-cyan" data-text="方寸">方寸</span>
                        <span class="intro-title-purple" data-text="枢机">枢机</span>
                    </div>
                </div>
                <div class="intro-subtitle">${subtitle}</div>
                <div class="intro-blackout">
                    <div class="intro-blackout-text">JUNRUI GAME</div>
                </div>
            `;
            document.body.appendChild(overlay);
            
            // 创建粒子
            const particlesContainer = overlay.querySelector('.intro-particles');
            createParticles(particlesContainer, 30);
            
            // 稍后激活动画
            requestAnimationFrame(() => {
                overlay.classList.add('active');
                
                // 播放开场音效（使用 SoundManager 统一管理）
                if (typeof SoundManager !== 'undefined') {
                    SoundManager.playOpenGame();
                }
            });
            
            // 设置自动结束
            setTimeout(() => {
                hide();
            }, duration);
        }
        
        /**
         * 隐藏开场动画
         */
        function hide() {
            if (!overlay || !isPlaying) return;
            isPlaying = false;
            
            // 黑场淡入
            const blackout = overlay.querySelector('.intro-blackout');
            if (blackout) {
                blackout.classList.add('fade-in');
            }
            
            // 黑场淡入完成后，停留一段时间
            setTimeout(() => {
                // 第一步：文字先淡出
                if (blackout) {
                    blackout.classList.add('text-fade-out');
                }
                
                // 第二步：文字淡出后，黑场再淡出
                setTimeout(() => {
                    overlay.classList.add('fade-out');
                    
                    setTimeout(() => {
                        if (overlay && overlay.parentNode) {
                            overlay.parentNode.removeChild(overlay);
                        }
                        if (onComplete) onComplete();
                    }, 1000); // 黑场淡出时间加长
                }, 1000); // 文字淡出 800ms + 停留 200ms
            }, 3000); // 黑场淡入 500ms + 文字停留 2500ms
        }
        
        
        /**
         * 跳过动画
         */
        function skip() {
            if (!overlay || !isPlaying) return;
            isPlaying = false;
            
            // 停止音效
            if (typeof SoundManager !== 'undefined') {
                SoundManager.stopSFX('opengame');
            }
            
            // 跳过时直接淡出
            overlay.classList.add('fade-out');
            setTimeout(() => {
                if (overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                if (onComplete) onComplete();
            }, 800);
        }
        
        // 初始化
        createHTML();
        
        return {
            hide,
            skip
        };
    }
    
    // ==================== 默认加载动画（别名）====================
    
    /**
     * 创建默认加载界面（霓虹方块）
     * @param {Object} options - 配置选项
     * @returns {Object} 加载界面实例
     */
    function createDefault(options = {}) {
        return createNeonCubes(options);
    }
    
    // ==================== 导出 ====================
    
    return {
        // 具体动画
        createNeonCubes,      // 霓虹方块动画（加载用）
        createIntro,          // 游戏开场动画（主页用）
        
        // 默认/别名
        createDefault,        // 默认加载动画
        create: createDefault // 简写
    };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingAnimations;
}

