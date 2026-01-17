/**
 * 底部控制提示控件
 * 显示四个方向按钮及其在当前页面的功能
 * 
 * 使用方法：
 * 1. 引入脚本: <script src="js/controlHint.js"></script>
 * 2. 初始化: ControlHint.init({ N: '返回', S: '跳跃', E: '冲刺', W: '确认' })
 * 3. 更新: ControlHint.update({ S: '新功能' })
 * 4. 显示/隐藏: ControlHint.show() / ControlHint.hide()
 */

const ControlHint = (function() {
    let container = null;
    let buttons = {};
    
    // 按钮配置（颜色与控制器一致）
    const BUTTON_CONFIG = {
        E: { label: '东', color: '#ff0066' },  // 红色
        S: { label: '南', color: '#00ff00' },  // 绿色
        W: { label: '西', color: '#00aaff' },  // 蓝色
        N: { label: '北', color: '#ffff00' }   // 黄色
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
                padding: 12px 24px;
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                backdrop-filter: blur(10px);
                z-index: 1000;
                font-family: 'JetBrains Mono', 'Consolas', monospace;
                transition: opacity 0.3s, transform 0.3s;
            }
            
            .control-hint-bar.hidden {
                opacity: 0;
                transform: translateX(-50%) translateY(20px);
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
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 2px solid currentColor;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                box-shadow: 0 0 8px currentColor;
                flex-shrink: 0;
            }
            
            .control-hint-text {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.8);
                text-transform: uppercase;
                letter-spacing: 1px;
                white-space: nowrap;
            }
            
            .control-hint-item.active .control-hint-text {
                color: white;
                text-shadow: 0 0 10px currentColor;
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
            
            item.appendChild(btn);
            item.appendChild(text);
            container.appendChild(item);
            
            buttons[key] = { item, text };
        });
        
        document.body.appendChild(container);
        return container;
    }
    
    // 初始化
    function init(hints = {}) {
        createContainer();
        update(hints);
        show();
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
    
    // 显示
    function show() {
        if (!container) createContainer();
        container.classList.remove('hidden');
    }
    
    // 隐藏
    function hide() {
        if (container) {
            container.classList.add('hidden');
        }
    }
    
    // 销毁
    function destroy() {
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
    
    return {
        init,
        update,
        show,
        hide,
        destroy,
        setButton
    };
})();

// 如果在模块环境中，导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlHint;
}

