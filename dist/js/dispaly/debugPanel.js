/**
 * DebugPanel - 调试面板类
 * 每场景 new 一个实例并挂到场景根，场景卸载后实例无引用可被 GC
 * GameWebSocket 通过 DebugPanel.setCurrent(instance) / setVisible(bool) 控制当前场景的面板显示
 */
const DEBUG_PANEL_STYLES = `
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
        display: none;
    }
    .debug-log-title { color: #00ff00; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 4px; }
    .debug-log-item { padding: 3px 0; border-bottom: 1px solid #222; }
    .debug-log-item:last-child { border-bottom: none; }
    .log-wave { color: #00f2ff; }
    .log-target { color: #ff00ff; }
    .log-danger { color: #ff3333; }
    .log-collect { color: #00ff00; }
    .log-penalty { color: #ff6600; }
    .debug-victory-btn {
        margin-left: 10px; padding: 2px 8px; font-size: 10px;
        background: #333; border: 1px solid #ffd700; color: #ffd700; cursor: pointer;
    }
    .debug-victory-btn:hover { background: #ffd700; color: #000; }
`;

function _injectDebugPanelStyles() {
    if (document.getElementById('debug-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'debug-panel-styles';
    style.textContent = DEBUG_PANEL_STYLES;
    document.head.appendChild(style);
}

class DebugPanel {
    /** 当前场景的实例，供 GameWebSocket.setVisible 使用 */
    static current = null;

    /**
     * 设置当前实例（场景 mount 时传入，unmount 时传 null）
     * @param {DebugPanel|null} instance
     */
    static setCurrent(instance) {
        DebugPanel.current = instance;
    }

    /**
     * 显示/隐藏当前场景的调试面板（由 GameWebSocket 根据 is_debug 调用）
     * @param {boolean} visible
     */
    static setVisible(visible) {
        if (DebugPanel.current) DebugPanel.current.setVisible(visible);
    }

    /**
     * @param {HTMLElement} parent - 挂载父节点（场景根），DOM 随父节点移除而移除
     * @param {Object} [options]
     * @param {Function} [options.onVictoryTest] - 快速通关回调
     */
    constructor(parent, options = {}) {
        _injectDebugPanelStyles();
        this.parent = parent;
        this.onVictoryTest = options.onVictoryTest || null;
        this.maxLogs = 50;
        this._isVisible = false;
        this._container = null;
        this._logContent = null;
        this._buildDOM();
    }

    _buildDOM() {
        this._container = document.createElement('div');
        this._container.className = 'debug-log';
        this._container.id = 'debugLog';

        const title = document.createElement('div');
        title.className = 'debug-log-title';
        title.innerHTML = '[DEBUG LOG]';

        const victoryBtn = document.createElement('button');
        victoryBtn.className = 'debug-victory-btn';
        victoryBtn.id = 'victory-test-btn';
        victoryBtn.textContent = '快速通关';
        victoryBtn.addEventListener('click', () => {
            if (this.onVictoryTest) {
                this.add('<span style="color: #ffd700;">🎉 [DEBUG] 触发快速通关</span>');
                this.onVictoryTest();
            }
        });
        title.appendChild(victoryBtn);

        this._logContent = document.createElement('div');
        this._logContent.id = 'logContent';

        this._container.appendChild(title);
        this._container.appendChild(this._logContent);
        this.parent.appendChild(this._container);
    }

    add(message) {
        if (!this._logContent) return;
        const item = document.createElement('div');
        item.className = 'debug-log-item';
        item.innerHTML = message;
        this._logContent.insertBefore(item, this._logContent.firstChild);
        while (this._logContent.children.length > this.maxLogs) {
            this._logContent.removeChild(this._logContent.lastChild);
        }
    }

    clear() {
        if (this._logContent) this._logContent.innerHTML = '';
    }

    logWave(waveNum, targetCount, dangerCount) {
        this.add(`<span class="log-wave">Wave ${waveNum}</span>: ` +
            `<span class="log-cyan">■${targetCount}</span> / <span class="log-pink">■${dangerCount}</span>`);
    }

    show() {
        if (this._container) {
            this._container.style.display = 'block';
            this._isVisible = true;
        }
    }

    hide() {
        if (this._container) {
            this._container.style.display = 'none';
            this._isVisible = false;
        }
    }

    setVisible(visible) {
        if (visible) this.show();
        else this.hide();
    }

    get isVisible() {
        return this._isVisible;
    }

    /**
     * 可选：显式解绑；通常场景卸载后无引用即可被 GC，DOM 随 parent 移除
     */
    destroy() {
        this._container = null;
        this._logContent = null;
        this.onVictoryTest = null;
    }
}

if (typeof window !== 'undefined') {
    window.DebugPanel = DebugPanel;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DebugPanel };
}
