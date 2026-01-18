/**
 * 底部控制提示控件
 * 
 * 场景模式：
 * - menu: 功能画面，有输入时显示，静止后自动淡出
 * - game: 游戏画面，默认隐藏，只有特殊情况才显示
 * 
 * 使用方法：
 * 1. 引入脚本: <script src="js/controlHint.js"></script>
 * 2. 初始化: ControlHint.init({ N: '返回', S: '跳跃', E: '冲刺', W: '确认' })
 * 3. 设置模式: ControlHint.setMode('menu') 或 ControlHint.setMode('game')
 * 4. 有输入时调用: ControlHint.onInput() 来显示并重置淡出计时器
 */

const ControlHint = (function() {
    let container = null;
    let buttons = {};
    let mode = 'menu';  // 'menu' 或 'game'
    let fadeTimer = null;
    let isVisible = false;
    
    // 配置
    const FADE_DELAY = 3000;  // 无输入后多久开始淡出（毫秒）
    
    // 按钮配置（颜色与控制器一致）
    const BUTTON_CONFIG = {
        E: { label: '东', color: '#ff0066', key: 'K' },  // 红色 - K键
        S: { label: '南', color: '#00ff00', key: 'J' },  // 绿色 - J键
        W: { label: '西', color: '#00aaff', key: 'U' },  // 蓝色 - U键
        N: { label: '北', color: '#ffff00', key: 'I' }   // 黄色 - I键
    };
    
    // 创建样式
    function injectStyles() {
        if (document.getElementById('control-hint-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'control-hint-styles';
        style.textContent = `
            .control-hint-bar {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 24px;
                padding: 10px 20px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 20px;
                backdrop-filter: blur(5px);
                z-index: 1000;
                font-family: 'JetBrains Mono', 'Consolas', monospace;
                transition: opacity 0.5s ease, transform 0.5s ease;
                opacity: 0;
                pointer-events: none;
            }
            
            .control-hint-bar.visible {
                opacity: 1;
                pointer-events: auto;
            }
            
            .control-hint-bar.hidden {
                opacity: 0;
                transform: translateX(-50%) translateY(10px);
                pointer-events: none;
            }
            
            .control-hint-item {
                display: flex;
                align-items: center;
                gap: 8px;
                opacity: 0.4;
                transition: opacity 0.2s;
            }
            
            .control-hint-item.active {
                opacity: 1;
            }
            
            .control-hint-btn {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                border: 1.5px solid currentColor;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-family: 'Zhi Mang Xing', cursive;
                box-shadow: 0 0 4px currentColor;
                flex-shrink: 0;
                opacity: 0.7;
            }
            
            .control-hint-text {
                font-size: 10px;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                letter-spacing: 1px;
                white-space: nowrap;
            }
            
            .control-hint-item.active .control-hint-text {
                color: rgba(255, 255, 255, 0.7);
                text-shadow: 0 0 5px currentColor;
            }
            
            .control-hint-key {
                font-size: 9px;
                color: rgba(255, 255, 255, 0.35);
                background: rgba(255, 255, 255, 0.08);
                padding: 1px 5px;
                border-radius: 3px;
                margin-left: 4px;
                font-family: 'JetBrains Mono', monospace;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .control-hint-item.active .control-hint-key {
                color: rgba(255, 255, 255, 0.5);
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
            }
        `;
        document.head.appendChild(style);
    }
    
    // 创建控件
    function createContainer() {
        if (container) return container;
        
        injectStyles();
        
        container = document.createElement('div');
        container.className = 'control-hint-bar';
        
        // 按照东南西北的顺序排列
        const order = ['E', 'S', 'W', 'N'];
        
        order.forEach(key => {
            const config = BUTTON_CONFIG[key];
            const item = document.createElement('div');
            item.className = 'control-hint-item';
            item.dataset.key = key;
            item.style.color = config.color;
            
            const btn = document.createElement('div');
            btn.className = 'control-hint-btn';
            btn.textContent = config.label;
            
            const text = document.createElement('span');
            text.className = 'control-hint-text';
            text.textContent = '-';
            
            const keyHint = document.createElement('span');
            keyHint.className = 'control-hint-key';
            keyHint.textContent = config.key;
            
            item.appendChild(btn);
            item.appendChild(text);
            item.appendChild(keyHint);
            container.appendChild(item);
            
            buttons[key] = { item, text, keyHint };
        });
        
        document.body.appendChild(container);
        return container;
    }
    
    // 开始淡出计时
    function startFadeTimer() {
        clearFadeTimer();
        if (mode === 'menu') {
            fadeTimer = setTimeout(() => {
                hide();
            }, FADE_DELAY);
        }
    }
    
    // 清除淡出计时
    function clearFadeTimer() {
        if (fadeTimer) {
            clearTimeout(fadeTimer);
            fadeTimer = null;
        }
    }
    
    // 初始化
    function init(hints = {}) {
        createContainer();
        update(hints);
        // 初始时显示一下，然后开始淡出计时
        if (mode === 'menu') {
            show();
            startFadeTimer();
        }
    }
    
    // 更新提示
    function update(hints) {
        if (!container) createContainer();
        
        Object.keys(BUTTON_CONFIG).forEach(key => {
            const hint = hints[key];
            const button = buttons[key];
            
            if (button) {
                if (hint) {
                    button.text.textContent = hint;
                    button.item.classList.add('active');
                } else {
                    button.text.textContent = '-';
                    button.item.classList.remove('active');
                }
            }
        });
    }
    
    // 设置模式
    function setMode(newMode) {
        mode = newMode;
        if (mode === 'game') {
            // 游戏模式：默认隐藏
            hide();
            clearFadeTimer();
        } else {
            // 菜单模式：显示后开始淡出计时
            show();
            startFadeTimer();
        }
    }
    
    // 有输入时调用（摇杆移动、按钮按下等）
    function onInput() {
        if (mode === 'menu') {
            show();
            startFadeTimer();
        }
        // 游戏模式下不响应普通输入
    }
    
    // 强制显示（用于游戏中的特殊情况）
    function forceShow(duration = 3000) {
        show();
        if (duration > 0) {
            clearFadeTimer();
            fadeTimer = setTimeout(() => {
                if (mode === 'game') {
                    hide();
                }
            }, duration);
        }
    }
    
    // 显示
    function show() {
        if (!container) createContainer();
        container.classList.add('visible');
        container.classList.remove('hidden');
        isVisible = true;
    }
    
    // 隐藏
    function hide() {
        if (container) {
            container.classList.remove('visible');
            container.classList.add('hidden');
            isVisible = false;
        }
    }
    
    // 销毁
    function destroy() {
        clearFadeTimer();
        if (container) {
            container.remove();
            container = null;
            buttons = {};
        }
    }
    
    // 设置单个按钮
    function setButton(key, hint) {
        if (!container) createContainer();
        
        const button = buttons[key];
        if (button) {
            if (hint) {
                button.text.textContent = hint;
                button.item.classList.add('active');
            } else {
                button.text.textContent = '-';
                button.item.classList.remove('active');
            }
        }
    }
    
    // 获取当前模式
    function getMode() {
        return mode;
    }
    
    // 是否可见
    function isShowing() {
        return isVisible;
    }
    
    return {
        init,
        update,
        show,
        hide,
        destroy,
        setButton,
        setMode,
        onInput,
        forceShow,
        getMode,
        isShowing
    };
})();

// 如果在模块环境中，导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlHint;
}
