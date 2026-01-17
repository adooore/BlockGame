/**
 * 寻路算法模块
 * 包含死局检测、可达性分析等
 */

const Pathfinding = (function() {
    
    /**
     * BFS 死局检测：检查玩家是否能到达至少一个目标格子
     * @param {Object} options - 配置选项
     * @param {Array} options.grid - 格子数组
     * @param {number} options.gridSize - 网格大小
     * @param {Array} options.startPositions - 起始位置数组 [{ row, col }]
     * @param {string|Array} options.targetTypes - 目标格子类型
     * @param {string|Array} options.blockTypes - 阻挡格子类型
     * @returns {boolean} true = 死局（无法到达任何目标）
     */
    function checkDeadlock(options) {
        const { grid, gridSize, startPositions, targetTypes, blockTypes } = options;
        const targets = Array.isArray(targetTypes) ? targetTypes : [targetTypes];
        const blocks = Array.isArray(blockTypes) ? blockTypes : [blockTypes];
        
        // 统计目标格子
        let targetCount = 0;
        for (let i = 0; i < grid.length; i++) {
            if (targets.includes(grid[i].type)) targetCount++;
        }
        
        if (targetCount === 0) {
            return false; // 没有目标格子，不算死局
        }
        
        const visited = new Uint8Array(gridSize * gridSize);
        const queue = [];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        
        // 从所有起始位置开始
        startPositions.forEach(pos => {
            // 检查起始位置周围的空格
            dirs.forEach(([dr, dc]) => {
                const nr = pos.row + dr;
                const nc = pos.col + dc;
                if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
                    const idx = nr * gridSize + nc;
                    if (!visited[idx]) {
                        const tile = grid[idx];
                        if (tile.type === 'none') {
                            visited[idx] = 1;
                            queue.push([nr, nc]);
                        }
                    }
                }
            });
        });
        
        // BFS 遍历
        let bfsIdx = 0;
        while (bfsIdx < queue.length) {
            const [row, col] = queue[bfsIdx++];
            
            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
                
                const idx = nr * gridSize + nc;
                if (visited[idx]) continue;
                
                const tile = grid[idx];
                
                // 找到目标格子
                if (targets.includes(tile.type)) {
                    return false; // 不是死局
                }
                
                // 空格可以继续搜索
                if (tile.type === 'none') {
                    visited[idx] = 1;
                    queue.push([nr, nc]);
                }
            }
        }
        
        // 遍历完所有可达区域都没找到目标，是死局
        return true;
    }
    
    /**
     * 计算两点间的曼哈顿距离
     * @param {number} r1 - 起点行
     * @param {number} c1 - 起点列
     * @param {number} r2 - 终点行
     * @param {number} c2 - 终点列
     * @returns {number} 曼哈顿距离
     */
    function manhattanDistance(r1, c1, r2, c2) {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2);
    }
    
    /**
     * A* 寻路算法（如果需要更复杂的寻路）
     * @param {Object} options - 配置选项
     * @param {Array} options.grid - 格子数组
     * @param {number} options.gridSize - 网格大小
     * @param {Object} options.start - 起点 { row, col }
     * @param {Object} options.end - 终点 { row, col }
     * @param {string|Array} options.walkable - 可行走的格子类型（默认 'none'）
     * @returns {Array|null} 路径数组 [{ row, col }] 或 null（无法到达）
     */
    function findPath(options) {
        const { grid, gridSize, start, end, walkable = ['none'] } = options;
        const walkableTypes = Array.isArray(walkable) ? walkable : [walkable];
        
        const openSet = [start];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        const key = (r, c) => `${r},${c}`;
        gScore.set(key(start.row, start.col), 0);
        fScore.set(key(start.row, start.col), manhattanDistance(start.row, start.col, end.row, end.col));
        
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        
        while (openSet.length > 0) {
            // 找 fScore 最小的节点
            let minIdx = 0;
            let minF = fScore.get(key(openSet[0].row, openSet[0].col)) || Infinity;
            for (let i = 1; i < openSet.length; i++) {
                const f = fScore.get(key(openSet[i].row, openSet[i].col)) || Infinity;
                if (f < minF) {
                    minF = f;
                    minIdx = i;
                }
            }
            
            const current = openSet.splice(minIdx, 1)[0];
            
            // 到达终点
            if (current.row === end.row && current.col === end.col) {
                const path = [current];
                let cur = key(current.row, current.col);
                while (cameFrom.has(cur)) {
                    const prev = cameFrom.get(cur);
                    path.unshift(prev);
                    cur = key(prev.row, prev.col);
                }
                return path;
            }
            
            // 遍历邻居
            for (const [dr, dc] of dirs) {
                const nr = current.row + dr;
                const nc = current.col + dc;
                if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
                
                const tile = grid[nr * gridSize + nc];
                if (!walkableTypes.includes(tile.type) && !(nr === end.row && nc === end.col)) continue;
                
                const tentativeG = (gScore.get(key(current.row, current.col)) || 0) + 1;
                const neighborKey = key(nr, nc);
                
                if (tentativeG < (gScore.get(neighborKey) || Infinity)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeG);
                    fScore.set(neighborKey, tentativeG + manhattanDistance(nr, nc, end.row, end.col));
                    
                    if (!openSet.some(n => n.row === nr && n.col === nc)) {
                        openSet.push({ row: nr, col: nc });
                    }
                }
            }
        }
        
        return null; // 无法到达
    }
    
    /**
     * 获取所有可达的格子
     * @param {Object} options - 配置选项
     * @param {Array} options.grid - 格子数组
     * @param {number} options.gridSize - 网格大小
     * @param {Object} options.start - 起点 { row, col }
     * @param {string|Array} options.walkable - 可行走的格子类型
     * @returns {Set} 可达格子的 key 集合 "row,col"
     */
    function getReachableTiles(options) {
        const { grid, gridSize, start, walkable = ['none'] } = options;
        const walkableTypes = Array.isArray(walkable) ? walkable : [walkable];
        
        const reachable = new Set();
        const visited = new Uint8Array(gridSize * gridSize);
        const queue = [[start.row, start.col]];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        
        visited[start.row * gridSize + start.col] = 1;
        reachable.add(`${start.row},${start.col}`);
        
        let idx = 0;
        while (idx < queue.length) {
            const [row, col] = queue[idx++];
            
            for (const [dr, dc] of dirs) {
                const nr = row + dr;
                const nc = col + dc;
                if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
                
                const i = nr * gridSize + nc;
                if (visited[i]) continue;
                
                const tile = grid[i];
                visited[i] = 1;
                
                if (walkableTypes.includes(tile.type)) {
                    reachable.add(`${nr},${nc}`);
                    queue.push([nr, nc]);
                }
            }
        }
        
        return reachable;
    }
    
    return {
        checkDeadlock,
        manhattanDistance,
        findPath,
        getReachableTiles
    };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pathfinding;
}

