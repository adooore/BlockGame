/**
 * 格子系统模块
 * 用于管理游戏中的网格、方块生成和碰撞检测
 */

const GridSystem = (function() {
    
    /**
     * 创建格子系统
     * @param {Object} options - 配置选项
     * @param {number} options.gridSize - 网格大小（如 12x12）
     * @param {number} options.tileGap - 格子间隙
     * @param {Object} options.colors - 颜色配置
     * @returns {Object} 格子系统实例
     */
    function create(options = {}) {
        const config = {
            gridSize: options.gridSize || 12,
            tileGap: options.tileGap || 6,
            visual: {
                glowBase: 10,
                glowPulse: 5,
                normalLineWidth: 2,
                highlightLineWidth: 4,
                normalFillAlpha: 0.1,
                highlightFillAlpha: 0.2,
                ...(options.visual || {})
            },
            colors: {
                bg: '#050505',
                grid: '#1a1a1a',
                ...options.colors
            }
        };
        
        let grid = [];
        let tileSize = 0;
        let gridX = 0;
        let gridY = 0;
        let gridTotalDim = 0;
        
        /**
         * 初始化格子数组
         */
        function initGrid() {
            grid = [];
            for (let r = 0; r < config.gridSize; r++) {
                for (let c = 0; c < config.gridSize; c++) {
                    grid.push({ row: r, col: c, type: 'none', pulse: 0 });
                }
            }
            return grid;
        }
        
        /**
         * 根据画布尺寸重新计算格子大小和位置
         * @param {number} canvasWidth - 画布宽度
         * @param {number} canvasHeight - 画布高度
         */
        function resize(canvasWidth, canvasHeight) {
            const minDim = Math.min(canvasWidth, canvasHeight) * 0.85;
            tileSize = (minDim - (config.gridSize - 1) * config.tileGap) / config.gridSize;
            // 与 minDim 同一真值，避免 N*tileSize+(N-1)*gap 浮点回算略小于 minDim 导致边界少 1px 级误差
            gridTotalDim = minDim;
            gridX = (canvasWidth - gridTotalDim) / 2;
            gridY = (canvasHeight - gridTotalDim) / 2;
            
            return { tileSize, gridX, gridY, gridTotalDim };
        }
        
        /**
         * 获取指定坐标所在的格子
         * @param {number} x - 世界坐标 X
         * @param {number} y - 世界坐标 Y
         * @returns {Object|null} 格子对象或 null
         */
        function getTileAt(x, y) {
            const col = Math.floor((x - gridX) / (tileSize + config.tileGap));
            const row = Math.floor((y - gridY) / (tileSize + config.tileGap));
            
            if (row >= 0 && row < config.gridSize && col >= 0 && col < config.gridSize) {
                return grid.find(t => t.row === row && t.col === col);
            }
            return null;
        }
        
        /**
         * 获取格子的世界坐标
         * @param {number} row - 行号
         * @param {number} col - 列号
         * @returns {Object} { x, y, centerX, centerY }
         */
        function getTilePosition(row, col) {
            const x = gridX + col * (tileSize + config.tileGap);
            const y = gridY + row * (tileSize + config.tileGap);
            return {
                x, y,
                centerX: x + tileSize / 2,
                centerY: y + tileSize / 2
            };
        }
        
        /**
         * 获取玩家占用的格子（包括周围一圈）
         * @param {Array} players - 玩家数组 [{ x, y, width, height, active? }]
         * @returns {Array} 占用的格子坐标数组 [{ row, col }]
         */
        function getOccupiedTiles(players) {
            const occupied = [];
            
            players.forEach(player => {
                if (player.active === false) return;
                
                const col = Math.floor((player.x + player.width / 2 - gridX) / (tileSize + config.tileGap));
                const row = Math.floor((player.y + player.height / 2 - gridY) / (tileSize + config.tileGap));
                
                // 玩家周围 3x3 区域
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = row + dr;
                        const nc = col + dc;
                        if (nr >= 0 && nr < config.gridSize && nc >= 0 && nc < config.gridSize) {
                            occupied.push({ row: nr, col: nc });
                        }
                    }
                }
            });
            
            return occupied;
        }
        
        /**
         * 统计指定类型的格子数量
         * @param {string|Array} types - 类型或类型数组
         * @returns {number} 数量
         */
        function countTiles(types) {
            if (!Array.isArray(types)) types = [types];
            return grid.filter(t => types.includes(t.type)).length;
        }
        
        /**
         * 获取所有可用格子（排除指定坐标）
         * @param {Array} excludes - 要排除的格子 [{ row, col }]
         * @returns {Array} 可用格子数组
         */
        function getAvailableTiles(excludes = []) {
            return grid.filter(tile => {
                return !excludes.some(e => e.row === tile.row && e.col === tile.col);
            });
        }
        
        /**
         * 清空所有格子
         */
        function clearAll() {
            grid.forEach(tile => tile.type = 'none');
        }
        
        /**
         * 绘制网格线
         * @param {CanvasRenderingContext2D} ctx - 画布上下文
         */
        function drawGridLines(ctx) {
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 1;
            const ts = tileSize;
            const g = config.tileGap;
            // 与 drawTiles / getTilePosition 一致：第 k 列左缘在 gridX + k*(ts+g)，整块区域右/下缘在 gridX/Y + gridTotalDim。
            // 旧实现用 pos - g/2，会把线画在「间隙正中」，相对逻辑格子整体偏半格。
            for (let i = 0; i <= config.gridSize; i++) {
                const xLine = i < config.gridSize ? gridX + i * (ts + g) : gridX + gridTotalDim;
                ctx.beginPath();
                ctx.moveTo(xLine, gridY);
                ctx.lineTo(xLine, gridY + gridTotalDim);
                ctx.stroke();
                const yLine = i < config.gridSize ? gridY + i * (ts + g) : gridY + gridTotalDim;
                ctx.beginPath();
                ctx.moveTo(gridX, yLine);
                ctx.lineTo(gridX + gridTotalDim, yLine);
                ctx.stroke();
            }
        }
        
        /**
         * 绘制格子
         * @param {CanvasRenderingContext2D} ctx - 画布上下文
         * @param {Function} getColorFn - 获取颜色的函数 (tile) => { color, isHighlight }
         */
        function drawTiles(ctx, getColorFn) {
            grid.forEach(tile => {
                const x = gridX + tile.col * (tileSize + config.tileGap);
                const y = gridY + tile.row * (tileSize + config.tileGap);
                
                if (tile.type === 'none') {
                    // 空格子：绘制统一的暗色边框，保持视觉一致性
                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, tileSize, tileSize);
                } else {
                    const { color, isHighlight } = getColorFn(tile);
                    const glow = config.visual.glowBase + Math.sin(tile.pulse) * config.visual.glowPulse;
                    
                    ctx.shadowBlur = glow;
                    ctx.shadowColor = color;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = isHighlight ? config.visual.highlightLineWidth : config.visual.normalLineWidth;
                    ctx.strokeRect(x, y, tileSize, tileSize);
                    ctx.globalAlpha = isHighlight ? config.visual.highlightFillAlpha : config.visual.normalFillAlpha;
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, tileSize, tileSize);
                    ctx.globalAlpha = 1.0;
                    ctx.shadowBlur = 0;
                }
                
                // 更新脉冲动画
                tile.pulse += 0.05;
            });
        }
        
        // 返回公共 API
        return {
            initGrid,
            resize,
            getTileAt,
            getTilePosition,
            getOccupiedTiles,
            countTiles,
            getAvailableTiles,
            clearAll,
            drawGridLines,
            drawTiles,
            
            // 直接访问
            get grid() { return grid; },
            get tileSize() { return tileSize; },
            get gridX() { return gridX; },
            get gridY() { return gridY; },
            get gridTotalDim() { return gridTotalDim; },
            get config() { return config; }
        };
    }
    
    return { create };
})();

// 导出（兼容浏览器和 Node.js）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GridSystem;
}

