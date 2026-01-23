/**
 * DebugPanel - 调试面板模块
 * 统一管理调试日志和快速通关按钮
 * 在 release 模式下自动隐藏
 */
const DebugPanel = (function() {
    let container = null;
    let logContent = null;
    let isVisible = false;
    let maxLogs = 50;
    let onVictoryTest = null;  // 快速通关回调
    
    // CSS 样式
    const STYLES = `
        /* 调试日志面板 - 默认隐藏，由 GameWebSocket 根据 is_debug 控制显示 */
        .debug-log {
            position: fixed;
            bottom: 30px;
            left: 30px;
            width: 280px;
            max-height: 200px;
            background: rgba(0, 0, 0, 0.85);
            border: 1px solid #333;
            border-radius: 4px;
            padding: 10px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            color: #888;
            overflow-y: auto;
            z-index: 50;
            display: none;  /* 默认隐藏，debug 模式下由 JS 显示 */
        }
        .debug-log-title {
            color: #00ff00;
            font-weight: bold;
            margin-bottom: 8px;
            border-bottom: 1px solid #333;
            padding-bottom: 4px;
        }
        .debug-log-item {
            padding: 3px 0;
            border-bottom: 1px solid #222;
        }
        .debug-log-item:last-child {
            border-bottom: none;
        }
        .log-wave { color: #00f2ff; }
        .log-target { color: #ff00ff; }
        .log-danger { color: #ff3333; }
        .log-collect { color: #00ff00; }
        .log-penalty { color: #ff6600; }
        .debug-victory-btn {
            margin-left: 10px;
            padding: 2px 8px;
            font-size: 10px;
            background: #333;
            border: 1px solid #ffd700;
            color: #ffd700;
            cursor: pointer;
        }
        .debug-victory-btn:hover {
            background: #ffd700;
            color: #000;
        }
    `;
    
    /**
     * 注入 CSS 样式
     */
    function injectStyles() {
        if (document.getElementById('debug-panel-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'debug-panel-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }
    
    /**
     * 创建面板 DOM
     */
    function createPanel() {
        if (container) return;
        
        container = document.createElement('div');
        container.className = 'debug-log';
        container.id = 'debugLog';
        
        const title = document.createElement('div');
        title.className = 'debug-log-title';
        title.innerHTML = '[DEBUG LOG]';
        
        // 快速通关按钮
        const victoryBtn = document.createElement('button');
        victoryBtn.className = 'debug-victory-btn';
        victoryBtn.id = 'victory-test-btn';
        victoryBtn.textContent = '快速通关';
        victoryBtn.addEventListener('click', () => {
            if (onVictoryTest) {
                add('<span style="color: #ffd700;">🎉 [DEBUG] 触发快速通关</span>');
                onVictoryTest();
            }
        });
        title.appendChild(victoryBtn);
        
        logContent = document.createElement('div');
        logContent.id = 'logContent';
        
        container.appendChild(title);
        container.appendChild(logContent);
        document.body.appendChild(container);
    }
    
    /**
     * 初始化调试面板
     * @param {Object} options 配置选项
     * @param {Function} options.onVictoryTest - 快速通关回调
     */
    function init(options = {}) {
        onVictoryTest = options.onVictoryTest || null;
        
        injectStyles();
        createPanel();
        
        console.log('[DebugPanel] 初始化完成');
    }
    
    /**
     * 添加日志
     * @param {string} message - 日志内容（支持 HTML）
     */
    function add(message) {
        if (!logContent) return;
        
        const item = document.createElement('div');
        item.className = 'debug-log-item';
        item.innerHTML = message;
        logContent.insertBefore(item, logContent.firstChild);
        
        // 限制日志数量
        while (logContent.children.length > maxLogs) {
            logContent.removeChild(logContent.lastChild);
        }
    }
    
    /**
     * 清空日志
     */
    function clear() {
        if (logContent) {
            logContent.innerHTML = '';
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
    
    /**
     * 显示面板
     */
    function show() {
        if (container) {
            container.style.display = 'block';
            isVisible = true;
        }
    }
    
    /**
     * 隐藏面板
     */
    function hide() {
        if (container) {
            container.style.display = 'none';
            isVisible = false;
        }
    }
    
    /**
     * 设置显示状态
     * @param {boolean} visible - 是否显示
     */
    function setVisible(visible) {
        if (visible) {
            show();
        } else {
            hide();
        }
    }
    
    /**
     * 获取显示状态
     */
    function getVisible() {
        return isVisible;
    }
    
    // 公开 API
    return {
        init,
        add,
        clear,
        logWave,
        show,
        hide,
        setVisible,
        isVisible: getVisible
    };
})();

// 导出为全局变量
if (typeof window !== 'undefined') {
    window.DebugPanel = DebugPanel;
}

