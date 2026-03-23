/**
 * 底部控制提示控件
 * 
 * 使用方法：
 * 1. 引入脚本: <script src="js/controlHint.js"></script>
 * 2. 初始化: ControlHint.init()
 * 3. 设置文案状态: ControlHint.setHintsState('main_menu') 等（内部根据状态表决定 N/S/E/W，并显示+重置淡出计时器）
 * 4. 有输入时由上层调用 ControlHint.show() 来显示并重置淡出计时器
 */

const ControlHint = (function() {
    // 提示文案 key 的枚举，避免在代码中散用字符串
    const HINTS_KEY = {
        MAIN_MENU: 'main_menu',
        MODE_SELECT: 'mode_select',
        LEVEL_SELECT: 'level_select',
        QR_MODAL: 'qr_modal',
        SETTINGS_MODAL: 'settings_modal'
    };
    
    let container = null;
    let buttons = {};
    // 当前提示文案 key，默认认为一开始是主菜单状态
    let currentHintsKey = HINTS_KEY.MAIN_MENU;
    let fadeTimer = null;
    let isVisible = false;
    
    // 配置
    const FADE_DELAY = 3000;  // 无输入后多久开始淡出（毫秒）
    
    // 按钮配置（与加载界面一致：web方向汉字 + Xbox按钮 + 键盘键）
    const BUTTON_CONFIG = {
        E: { webKey: '东', xboxKey: 'B', kbKey: 'K', color: '#f87171' },  // 红色
        S: { webKey: '南', xboxKey: 'A', kbKey: 'J', color: '#4ade80' },  // 绿色
        W: { webKey: '西', xboxKey: 'X', kbKey: 'U', color: '#3b82f6' },  // 蓝色
        N: { webKey: '北', xboxKey: 'Y', kbKey: 'I', color: '#facc15' }   // 黄色
    };
    
    // 底部提示的“状态机”：每种状态对应一套 N/S/E/W 文案
    // 注意：这里只管“文案”，不管 DOM / 菜单逻辑
    const STATE_HINTS = {
        main_menu:   { N: null,  S: '跳跃', E: '冲刺', W: '选择' },
        mode_select: { N: '返回', S: '跳跃', E: '冲刺', W: '选择' },
        level_select:{ N: '返回', S: '跳跃', E: '冲刺', W: '选择' },
        qr_modal:    { N: '关闭', S: null,   E: null,   W: null   },
        settings_modal:{ N: '关闭', S: null,   E: null,   W: null   }
        // 如需扩展，在此添加新状态
    };

    
    // 创建样式（与加载界面一致）
    function injectStyles() {
        if (document.getElementById('control-hint-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'control-hint-styles';
        style.textContent = `
            .control-hint-bar {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) scale(var(--control-hint-scale, 1));
                transform-origin: center bottom;
                display: flex;
                gap: 32px;
                padding: 12px 24px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 16px;
                backdrop-filter: blur(8px);
                z-index: 1000;
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
                transform: translateX(-50%) translateY(10px) scale(var(--control-hint-scale, 1));
                pointer-events: none;
            }
            
            /* 每个操作的卡片 */
            .control-hint-item {
                text-align: center;
                opacity: 0.4;
                transition: opacity 0.2s;
            }
            
            .control-hint-item.active {
                opacity: 1;
            }
            
            /* 按钮组（web + xbox + 键盘） */
            .control-hint-btns {
                display: flex;
                gap: 6px;
                justify-content: center;
                margin-bottom: 6px;
            }
            
            /* 通用按钮样式 */
            .control-hint-btn {
                width: 24px;
                height: 24px;
                border: 1.5px solid currentColor;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 6px currentColor;
            }
            
            /* Web手柄方向按钮（汉字） */
            .control-hint-btn.web-btn {
                font-family: 'Zhi Mang Xing', cursive;
                font-size: 14px;
            }
            
            /* Xbox按钮 */
            .control-hint-btn.xbox-btn {
                font-family: 'Orbitron', sans-serif;
                font-weight: 700;
                font-size: 10px;
            }
            
            /* 键盘按键（圆角方形） */
            .control-hint-btn.kb-btn {
                font-family: 'Orbitron', sans-serif;
                font-size: 10px;
                border-radius: 4px;
            }
            
            /* 功能名称 */
            .control-hint-label {
                font-size: 10px;
                color: rgba(255, 255, 255, 0.7);
                letter-spacing: 1px;
            }
            
            .control-hint-item.active .control-hint-label {
                color: rgba(255, 255, 255, 0.9);
            }
        `;
        document.head.appendChild(style);
    }

    
    // 创建控件
    function createContainer() {
        
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
            
            // 按钮组容器
            const btns = document.createElement('div');
            btns.className = 'control-hint-btns';
            btns.style.color = config.color;
            
            // Web手柄按钮（方向汉字）
            const webBtn = document.createElement('div');
            webBtn.className = 'control-hint-btn web-btn';
            webBtn.textContent = config.webKey;
            
            // Xbox按钮
            const xboxBtn = document.createElement('div');
            xboxBtn.className = 'control-hint-btn xbox-btn';
            xboxBtn.textContent = config.xboxKey;
            
            // 键盘按键
            const kbBtn = document.createElement('div');
            kbBtn.className = 'control-hint-btn kb-btn';
            kbBtn.textContent = config.kbKey;
            
            btns.appendChild(webBtn);
            btns.appendChild(xboxBtn);
            btns.appendChild(kbBtn);
            
            // 功能名称
            const label = document.createElement('div');
            label.className = 'control-hint-label';
            label.textContent = '-';
            
            item.appendChild(btns);
            item.appendChild(label);
            container.appendChild(item);
            
            buttons[key] = { item, label };
        });
        
        document.body.appendChild(container);
        return container;
    }

    function setScale(scale) {
        if (!container) createContainer();
        const next = Math.max(0.75, Math.min(1.25, Number(scale) || 1));
        container.style.setProperty('--control-hint-scale', String(next));
    }
    
    // 开始淡出计时（统一由上层决定什么时候调用）
    function startFadeTimer() {
        clearFadeTimer();
        fadeTimer = setTimeout(() => {
            hide();
        }, FADE_DELAY);
    }
    
    // 清除淡出计时
    function clearFadeTimer() {
        if (fadeTimer) {
            clearTimeout(fadeTimer);
            fadeTimer = null;
        }
    }

    // 初始化
    function init() {
        createContainer();
    }

    // 更新提示
    function update(hints) {
        if (!container) createContainer();
        
        Object.keys(BUTTON_CONFIG).forEach(key => {
            const hint = hints[key];
            const button = buttons[key];
            
            if (button) {
                if (hint) {
                    button.label.textContent = hint;
                    button.item.classList.add('active');
                } else {
                    button.label.textContent = '-';
                    button.item.classList.remove('active');
                }
            }
        });
    }

    function applyStateHints() {
        if (!currentHintsKey) return;
        const hints = STATE_HINTS[currentHintsKey];
        if (!hints) return;
        update(hints);
    }

    // 设置当前提示文案所使用的状态（如 main_menu / qr_modal）根据状态表更新文案，并显示一段时间
    function setHintsState(state) {
        currentHintsKey = state;
        applyStateHints();
        show();
        startFadeTimer();
    }
    
    // 显示
    function show() {
        if (!container) createContainer();
        container.classList.add('visible');
        container.classList.remove('hidden');
        isVisible = true;

        startFadeTimer();
    }
    
    // 隐藏
    function hide() {
        if (container) {
            container.classList.remove('visible');
            container.classList.add('hidden');
            isVisible = false;
        }
    }
    
    return {
        init,
        update,
        show,
        hide,
        setHintsState,
        setScale
    };
})();

if (typeof window !== 'undefined') { window.ControlHint = ControlHint; }
