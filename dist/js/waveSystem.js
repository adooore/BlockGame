/**
 * 波次系统模块
 * 用于管理游戏中的方块生成和难度递增
 */

const WaveSystem = (function() {
    
    /**
     * 创建波次系统
     * @param {Object} options - 配置选项
     * @returns {Object} 波次系统实例
     */
    function create(options = {}) {
        const config = {
            maxWaves: options.maxWaves || 12,           // 最大波数
            initialTarget: options.initialTarget || 8,   // 初始目标方块数
            targetDecrement: options.targetDecrement || 1,  // 每波变化的目标数量（正数递减，负数递增）
            minTarget: options.minTarget || 3,           // 最少目标方块数
            maxTarget: options.maxTarget || 30,          // 最多目标方块数（递增模式使用）
            initialDanger: options.initialDanger || 5,   // 初始危险方块数
            dangerIncrement: options.dangerIncrement || 2,  // 每波增加的危险数量
            maxDanger: options.maxDanger || 25,          // 危险方块上限
            ...options
        };
        
        let waveNumber = 0;
        let onWaveStart = null;  // 回调函数
        
        /**
         * 计算当前波次的方块配置
         * @returns {Object} { targetCount, dangerCount }
         */
        function getWaveConfig() {
            let targetCount;
            if (config.targetDecrement >= 0) {
                // 递减模式：方块逐渐减少
                targetCount = Math.max(
                    config.initialTarget - (waveNumber - 1) * config.targetDecrement,
                    config.minTarget
                );
            } else {
                // 递增模式：方块逐渐增加（targetDecrement 为负数）
                targetCount = Math.min(
                    config.initialTarget + (waveNumber - 1) * Math.abs(config.targetDecrement),
                    config.maxTarget
                );
            }
            
            const dangerCount = Math.min(
                config.initialDanger + (waveNumber - 1) * config.dangerIncrement,
                config.maxDanger
            );
            
            return { targetCount, dangerCount };
        }
        
        /**
         * 生成新一波方块
         * @param {Object} gridSystem - 格子系统实例
         * @param {Object} waveOptions - 波次选项
         * @param {Array} waveOptions.targetColors - 目标颜色数组
         * @param {string} waveOptions.currentTarget - 当前目标颜色
         * @param {string} waveOptions.currentDanger - 当前危险颜色
         * @param {Array} waveOptions.players - 玩家数组（用于避开玩家位置）
         * @param {boolean} waveOptions.dynamicTarget - 是否动态目标颜色
         * @param {boolean} waveOptions.dynamicDanger - 是否动态危险颜色
         * @returns {Object} { targetColor, dangerColor, targetPlaced, dangerPlaced }
         */
        function triggerWave(gridSystem, waveOptions = {}) {
            waveNumber++;
            
            const {
                targetColors = ['cyan'],
                dangerColors = ['pink'],
                currentTarget = 'cyan',
                currentDanger = 'pink',
                players = [],
                dynamicTarget = false,
                dynamicDanger = false,
                otherColorRatio = 0.6  // 其他颜色占比
            } = waveOptions;
            
            // 确定目标颜色
            let targetColor = currentTarget;
            if (dynamicTarget && targetColors.length > 0) {
                targetColor = targetColors[Math.floor(Math.random() * targetColors.length)];
            }
            
            // 确定危险颜色
            let dangerColor = currentDanger;
            if (dynamicDanger && dangerColors.length > 0) {
                dangerColor = dangerColors[Math.floor(Math.random() * dangerColors.length)];
            }
            
            // 获取本波配置
            const { targetCount, dangerCount } = getWaveConfig();
            const otherColorCount = Math.floor(targetCount * otherColorRatio);
            
            // 清空所有格子
            gridSystem.clearAll();
            
            // 获取可用格子（排除玩家位置）
            const occupied = gridSystem.getOccupiedTiles(players);
            const availableTiles = gridSystem.getAvailableTiles(occupied);
            
            // 随机打乱
            const shuffled = availableTiles.sort(() => 0.5 - Math.random());
            
            let idx = 0;
            const collectibleTiles = [];
            
            // 放置目标颜色方块
            const actualTarget = Math.min(targetCount, shuffled.length - idx);
            for (let i = 0; i < actualTarget && idx < shuffled.length; i++, idx++) {
                shuffled[idx].type = targetColor;
                shuffled[idx].pulse = 0;
                collectibleTiles.push(shuffled[idx]);
            }
            
            // 放置其他颜色方块（干扰项）
            if (dynamicTarget && targetColors.length > 1) {
                const otherColors = targetColors.filter(c => c !== targetColor);
                otherColors.forEach(color => {
                    const count = Math.min(otherColorCount, shuffled.length - idx);
                    for (let i = 0; i < count && idx < shuffled.length; i++, idx++) {
                        shuffled[idx].type = color;
                        shuffled[idx].pulse = 0;
                        collectibleTiles.push(shuffled[idx]);
                    }
                });
            }
            
            // 简单安全区：可收集方块的上下左右不能放危险方块
            const safeZone = new Set();
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            collectibleTiles.forEach(tile => {
                directions.forEach(([dr, dc]) => {
                    const nr = tile.row + dr;
                    const nc = tile.col + dc;
                    if (nr >= 0 && nr < gridSystem.config.gridSize && 
                        nc >= 0 && nc < gridSystem.config.gridSize) {
                        safeZone.add(`${nr},${nc}`);
                    }
                });
            });
            
            // 放置危险方块（跳过安全区）
            let dangerPlaced = 0;
            for (let i = idx; i < shuffled.length && dangerPlaced < dangerCount; i++) {
                const tile = shuffled[i];
                if (!safeZone.has(`${tile.row},${tile.col}`)) {
                    tile.type = dangerColor;
                    tile.pulse = 0;
                    dangerPlaced++;
                }
            }
            
            // 触发回调
            if (onWaveStart) {
                onWaveStart({
                    waveNumber,
                    targetColor,
                    dangerColor,
                    targetPlaced: actualTarget,
                    dangerPlaced,
                    totalCollectible: collectibleTiles.length
                });
            }
            
            return {
                targetColor,
                dangerColor,
                targetPlaced: actualTarget,
                dangerPlaced,
                totalCollectible: collectibleTiles.length
            };
        }
        
        /**
         * 检查是否需要刷新（目标颜色全部吃完）
         * @param {Object} gridSystem - 格子系统实例
         * @param {string} targetColor - 当前目标颜色
         * @returns {boolean} 是否需要刷新
         */
        function shouldRefresh(gridSystem, targetColor) {
            return gridSystem.countTiles(targetColor) === 0;
        }
        
        /**
         * 检查是否通关
         * @returns {boolean}
         */
        function isComplete() {
            return waveNumber >= config.maxWaves;
        }
        
        /**
         * 重置波次
         */
        function reset() {
            waveNumber = 0;
        }
        
        /**
         * 设置波次开始回调
         * @param {Function} callback
         */
        function setOnWaveStart(callback) {
            onWaveStart = callback;
        }
        
        return {
            getWaveConfig,
            triggerWave,
            shouldRefresh,
            isComplete,
            reset,
            setOnWaveStart,
            
            get waveNumber() { return waveNumber; },
            get config() { return config; }
        };
    }
    
    return { create };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WaveSystem;
}

