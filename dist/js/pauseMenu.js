/**
 * 暂停菜单模块
 * 提供统一的游戏暂停/恢复功能
 * 样式与游戏失败/胜利菜单保持一致
 * 
 * 支持：
 * - 键盘 ESC 键
 * - 手柄 Start/Options 按钮 (buttons[9])
 */

const PauseMenu = (function() {
    // 状态
    let isPaused = false;
    let overlay = null;
    let panel = null;
    let startButtonPressed = false;  // 防止连续触发
    
    // 回调
    let onPause = null;      // 暂停回调
    let onResume = null;     // 恢复回调
    let onRestart = null;    // 重新开始回调
    let onBackToMenu = null; // 返回主菜单回调
    let canPause = null;     // 判断是否可以暂停的函数
    
    // 菜单导航
    let selectedIndex = 0;
    let buttons = [];
    let lastJoystickY = 0;
    let confirmPressed = false;
    let keydownHandler = null;
    let gamepadPollId = null;
    
    // 缩放
    let currentScale = 1;
    
    // 样式是否已注入（复用 game-screens-style，只添加暂停特有样式）
    let styleInjected = false;
    
    /**
     * 注入 CSS 样式（仅暂停菜单特有的样式，基础样式复用 gameUtils 的）
     */
    function injectStyles() {
        if (styleInjected) return;
        
        const style = document.createElement('style');
        style.id = 'pause-menu-style';
        style.textContent = `
            /* 暂停专用动画 */
            .game-screen.pause-in {
                animation: screenPauseIn 0.35s ease-out forwards;
            }
            
            @keyframes screenPauseIn {
                0% {
                    opacity: 0;
                    visibility: visible;
                    transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 0.8));
                    filter: blur(10px);
                }
                50% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 1.02));
                    filter: blur(0);
                }
                100% {
                    opacity: 1;
                    visibility: visible;
                    transform: translate(-50%, -50%) scale(var(--menu-scale, 1));
                    filter: blur(0);
                }
            }
            
            /* 暂停边框蓝色光芒 */
            .game-screen.pause-in::before {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                background: linear-gradient(90deg, transparent, #00f2ff, transparent);
                z-index: -1;
                opacity: 0;
                animation: borderScan 0.3s ease-out forwards;
            }
        `;
        document.head.appendChild(style);
        styleInjected = true;
    }
    
    /**
     * 初始化暂停菜单
     * @param {Object} options - 配置选项
     * @param {function} options.onPause - 暂停时的回调
     * @param {function} options.onResume - 恢复时的回调
     * @param {function} options.onRestart - 重新开始回调
     * @param {function} options.onBackToMenu - 返回主菜单回调
     * @param {function} options.canPause - 判断是否可以暂停的函数 (返回 boolean)
     */
    function init(options = {}) {
        onPause = options.onPause || null;
        onResume = options.onResume || null;
        onRestart = options.onRestart || null;
        onBackToMenu = options.onBackToMenu || (() => { window.location.href = 'index.html'; });
        canPause = options.canPause || (() => true);
        
        injectStyles();
        
        // 监听键盘 ESC
        window.addEventListener('keydown', handleGlobalKeydown);
        
        console.log('[PauseMenu] 初始化完成');
    }
    
    /**
     * 处理全局键盘按键（仅用于触发暂停）
     */
    function handleGlobalKeydown(e) {
        if (e.code === 'Escape') {
            toggle();
        }
    }
    
    /**
     * 检查手柄 Start 按钮（需要在游戏循环中调用）
     * 支持原生手柄和 Web 控制器
     */
    function pollGamepadStart() {
        let anyStartPressed = false;
        
        // 1. 检测原生手柄
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        
        for (const gamepad of gamepads) {
            if (!gamepad) continue;
            
            // buttons[9] = Start/Options/Menu 按钮
            const startPressed = gamepad.buttons[9]?.pressed || false;
            
            if (startPressed) {
                anyStartPressed = true;
                break;
            }
        }
        
        // 2. 检测 Web 控制器（通过 ControllerManager）
        if (!anyStartPressed && typeof ControllerManager !== 'undefined') {
            const inputs = ControllerManager.inputs;
            for (const playerId in inputs) {
                const input = inputs[playerId];
                if (input && input.buttons && input.buttons.Start) {
                    anyStartPressed = true;
                    break;
                }
            }
        }
        
        // 处理按钮状态变化
        if (anyStartPressed && !startButtonPressed) {
            startButtonPressed = true;
            toggle();
        } else if (!anyStartPressed) {
            startButtonPressed = false;
        }
    }
    
    /**
     * 切换暂停状态
     */
    function toggle() {
        if (isPaused) {
            resume();
        } else {
            pause();
        }
    }
    
    /**
     * 暂停游戏
     */
    function pause() {
        // 检查是否可以暂停
        if (canPause && !canPause()) {
            return;
        }
        
        if (isPaused) return;
        
        isPaused = true;
        showOverlay();
        
        if (onPause) onPause();
        
        // 播放暂停音效
        if (typeof SoundManager !== 'undefined' && SoundManager.playClick) {
            SoundManager.playClick();
        }
        
        console.log('[PauseMenu] 游戏已暂停');
    }
    
    /**
     * 恢复游戏
     */
    function resume() {
        if (!isPaused) return;
        
        isPaused = false;
        hideOverlay();
        
        if (onResume) onResume();
        
        // 播放恢复音效
        if (typeof SoundManager !== 'undefined' && SoundManager.playClick) {
            SoundManager.playClick();
        }
        
        console.log('[PauseMenu] 游戏已恢复');
    }
    
    /**
     * 显示暂停界面
     */
    function showOverlay() {
        // 移除已存在的
        hideOverlay();
        
        // 创建遮罩
        overlay = document.createElement('div');
        overlay.id = 'pause-overlay';
        overlay.className = 'game-screen-overlay';
        document.body.appendChild(overlay);
        
        // 延迟显示遮罩背景
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
        
        // 创建暂停面板（使用与游戏菜单相同的 .game-screen 样式）
        panel = document.createElement('div');
        panel.id = 'pause-panel';
        panel.className = 'game-screen pause-in';
        panel.innerHTML = `
            <h1 class="neon-cyan">暂停</h1>
            <p class="time-label" style="margin-bottom: 24px;">PAUSED</p>
            
            <div class="screen-buttons">
                <button id="pause-resume-btn" class="btn-cyber menu-btn selected" data-action="resume">继续游戏</button>
                <button id="pause-restart-btn" class="btn-cyber menu-btn" data-action="restart">重新开始</button>
                <button id="pause-menu-btn" class="btn-cyber menu-btn" data-action="back">返回主菜单</button>
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
        
        // 设置 CSS 变量用于动画缩放
        panel.style.setProperty('--menu-scale', currentScale);
        
        document.body.appendChild(panel);
        
        // 动画结束后保持可见状态
        panel.addEventListener('animationend', () => {
            if (panel) {
                panel.classList.remove('pause-in');
                // 动画结束后手动设置可见状态和缩放
                panel.style.opacity = '1';
                panel.style.visibility = 'visible';
                panel.style.transform = `translate(-50%, -50%) scale(${currentScale})`;
            }
        }, { once: true });
        
        // 获取按钮列表
        buttons = [
            document.getElementById('pause-resume-btn'),
            document.getElementById('pause-restart-btn'),
            document.getElementById('pause-menu-btn')
        ];
        selectedIndex = 0;
        updateSelection();
        
        // 绑定按钮点击事件
        buttons.forEach(btn => {
            btn.addEventListener('click', handleButtonClick);
        });
        
        // 初始化菜单导航
        initMenuNavigation();
    }
    
    /**
     * 处理按钮点击
     */
    function handleButtonClick(e) {
        const action = e.currentTarget.dataset.action;
        
        switch (action) {
            case 'resume':
                resume();
                break;
            case 'restart':
                hideOverlay();
                isPaused = false;
                if (onRestart) onRestart();
                break;
            case 'back':
                if (onBackToMenu) onBackToMenu();
                break;
        }
    }
    
    /**
     * 隐藏暂停界面
     */
    function hideOverlay() {
        // 清理菜单导航
        cleanupMenuNavigation();
        
        if (panel) {
            panel.classList.remove('pause-in');
            panel.classList.add('animate-out');
            
            // 动画结束后移除
            setTimeout(() => {
                if (panel && panel.parentNode) {
                    panel.remove();
                }
                panel = null;
            }, 250);
        }
        
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay && overlay.parentNode) {
                    overlay.remove();
                }
                overlay = null;
            }, 300);
        }
        
        buttons = [];
    }
    
    /**
     * 更新按钮选中状态
     */
    function updateSelection() {
        buttons.forEach((btn, i) => {
            if (i === selectedIndex) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    }
    
    /**
     * 初始化菜单导航（键盘/手柄）
     */
    function initMenuNavigation() {
        lastJoystickY = 0;
        confirmPressed = false;
        
        // 键盘导航
        keydownHandler = (e) => {
            if (!isPaused) return;
            
            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    e.preventDefault();
                    selectedIndex = Math.max(0, selectedIndex - 1);
                    updateSelection();
                    if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    e.preventDefault();
                    selectedIndex = Math.min(buttons.length - 1, selectedIndex + 1);
                    updateSelection();
                    if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
                    break;
                case 'KeyJ':
                case 'KeyU':
                case 'Enter':
                case 'Space':
                    e.preventDefault();
                    if (typeof SoundManager !== 'undefined') SoundManager.playClick?.();
                    buttons[selectedIndex]?.click();
                    break;
            }
        };
        
        window.addEventListener('keydown', keydownHandler);
        
        // 手柄导航轮询（支持原生手柄和 Web 控制器）
        function pollPauseGamepad() {
            if (!isPaused) return;
            
            let jy = 0;
            let confirmBtnPressed = false;
            let hasInput = false;
            
            // 1. 检测原生手柄
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (const gamepad of gamepads) {
                if (!gamepad) continue;
                
                // 摇杆/D-Pad 导航
                jy = gamepad.axes[1] || 0;
                const dpadUp = gamepad.buttons[12]?.pressed || false;
                const dpadDown = gamepad.buttons[13]?.pressed || false;
                
                if (dpadUp) jy = -1;
                if (dpadDown) jy = 1;
                
                // X/□ 按钮确认（西键，buttons[2]）
                confirmBtnPressed = gamepad.buttons[2]?.pressed || false;
                
                if (Math.abs(jy) > 0.3 || confirmBtnPressed) {
                    hasInput = true;
                    break;
                }
            }
            
            // 2. 检测 Web 控制器（如果原生手柄没有输入）
            if (!hasInput && typeof ControllerManager !== 'undefined') {
                const inputs = ControllerManager.inputs;
                for (const playerId in inputs) {
                    const input = inputs[playerId];
                    if (!input) continue;
                    
                    // 摇杆导航
                    if (input.joystick && Math.abs(input.joystick.y) > Math.abs(jy)) {
                        jy = input.joystick.y;
                    }
                    
                    // W 按钮确认（西键）
                    if (input.buttons && input.buttons.W) {
                        confirmBtnPressed = true;
                    }
                }
            }
            
            // 死区
            if (Math.abs(jy) < 0.5) jy = 0;
            
            // 检测方向变化
            if (jy < -0.5 && lastJoystickY >= -0.5) {
                selectedIndex = Math.max(0, selectedIndex - 1);
                updateSelection();
                if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
            } else if (jy > 0.5 && lastJoystickY <= 0.5) {
                selectedIndex = Math.min(buttons.length - 1, selectedIndex + 1);
                updateSelection();
                if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
            }
            lastJoystickY = jy;
            
            // 确认按钮
            if (confirmBtnPressed && !confirmPressed) {
                confirmPressed = true;
                if (typeof SoundManager !== 'undefined') SoundManager.playClick?.();
                buttons[selectedIndex]?.click();
            } else if (!confirmBtnPressed) {
                confirmPressed = false;
            }
            
            if (isPaused) {
                gamepadPollId = requestAnimationFrame(pollPauseGamepad);
            }
        }
        
        gamepadPollId = requestAnimationFrame(pollPauseGamepad);
    }
    
    /**
     * 清理菜单导航
     */
    function cleanupMenuNavigation() {
        if (keydownHandler) {
            window.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }
        if (gamepadPollId) {
            cancelAnimationFrame(gamepadPollId);
            gamepadPollId = null;
        }
    }
    
    /**
     * 获取暂停状态
     */
    function getIsPaused() {
        return isPaused;
    }
    
    /**
     * 设置缩放比例
     * @param {number} scale - 缩放比例
     */
    function setScale(scale) {
        currentScale = scale;
        // 如果面板已存在且不在动画中，立即应用缩放
        if (panel && !panel.classList.contains('pause-in')) {
            panel.style.transform = `translate(-50%, -50%) scale(${scale})`;
        }
    }
    
    /**
     * 销毁暂停菜单
     */
    function destroy() {
        window.removeEventListener('keydown', handleGlobalKeydown);
        cleanupMenuNavigation();
        hideOverlay();
        isPaused = false;
        console.log('[PauseMenu] 已销毁');
    }
    
    // 公开 API
    return {
        init,
        pause,
        resume,
        toggle,
        pollGamepadStart,
        isPaused: getIsPaused,
        setScale,
        destroy
    };
})();
