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

