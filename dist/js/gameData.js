/**
 * 游戏数据管理模块
 * 支持 Tauri 文件存储（加密）和浏览器 localStorage 回退
 */

// ==================== 玩家颜色常量 ====================
const ALL_PLAYER_COLORS = [
    // 亮色系
    { id: 1, main: '#00f2ff', glow: '#00f2ff', core: '#e0faff', name: '青' },
    { id: 2, main: '#a855f7', glow: '#d946ef', core: '#f0e0ff', name: '紫' },
    { id: 3, main: '#4ade80', glow: '#39ff14', core: '#e0ffe0', name: '绿' },
    { id: 4, main: '#facc15', glow: '#ffaa00', core: '#fffbe0', name: '黄' },
    { id: 5, main: '#ff4757', glow: '#ff4757', core: '#ffe0e0', name: '红' },
    { id: 6, main: '#ff7f50', glow: '#ff7f50', core: '#ffe8e0', name: '橙' },
    { id: 7, main: '#ff6b9d', glow: '#ff6b9d', core: '#ffe0f0', name: '粉' },
    { id: 8, main: '#ffffff', glow: '#ffffff', core: '#f8f8f8', name: '白' },
    // 深色/暗色系 (高区分度)
    { id: 9, main: '#2563eb', glow: '#3b82f6', core: '#bfdbfe', name: '蓝' },
    { id: 10, main: '#9ca3af', glow: '#d1d5db', core: '#e5e7eb', name: '银' },
    { id: 11, main: '#92400e', glow: '#b45309', core: '#fde68a', name: '棕' },
    { id: 12, main: '#4f46e5', glow: '#6366f1', core: '#c7d2fe', name: '靛' },
    { id: 13, main: '#059669', glow: '#10b981', core: '#a7f3d0', name: '翠' },
    { id: 14, main: '#db2777', glow: '#ec4899', core: '#fbcfe8', name: '玫' },
    { id: 15, main: '#475569', glow: '#64748b', core: '#94a3b8', name: '墨' },
    { id: 16, main: '#eab308', glow: '#fbbf24', core: '#fef08a', name: '金' }
];

const GameData = {
    // 检测是否为桌面应用
    // - Tauri 原生页面有 window.__TAURI__
    // - HTTP 服务器页面是 localhost:8088
    // - Tauri 开发服务器是 127.0.0.1:1430 或 localhost:1430
    get _isDesktopApp() {
        if (typeof window === 'undefined') return false;
        if (window.__TAURI__) return true;
        const host = window.location.host;
        return host === 'localhost:8088' || 
               host === '127.0.0.1:8088' ||
               host.includes(':1430') ||  // Tauri dev server
               host.includes('localhost');
    },
    
    // WebSocket 引用（由游戏页面设置）
    _ws: null,
    
    // 设置 WebSocket 连接（供游戏页面调用）
    setWebSocket(ws) {
        this._ws = ws;
        console.log('[GameData] WebSocket 已设置');
    },
    
    // 内存缓存（避免频繁读取文件）
    _cache: null,
    _cacheLoaded: false,
    
    // 从服务器连接消息初始化数据
    initFromServer(gameData) {
        if (gameData && typeof gameData === 'string') {
            try {
                this._cache = JSON.parse(gameData);
                this._cacheLoaded = true;
                console.log('[GameData] 从服务器初始化成功:', this._cache);
            } catch (e) {
                console.warn('[GameData] 解析服务器数据失败:', e);
                this._cache = {};
            }
        }
    },
    
    // ========== 核心存储接口 ==========
    
    /**
     * 异步加载所有数据
     * 首次调用会从文件/localStorage读取，之后从缓存读取
     */
    async load() {
        if (this._cacheLoaded) {
            return this._cache;
        }
        
        try {
            console.log('[GameData] 环境检测: _isDesktopApp =', this._isDesktopApp);
            
            if (this._isDesktopApp) {
                // 桌面应用：数据已通过 WebSocket connected 消息初始化
                // 如果还没初始化，等待一下
                if (!this._cache) {
                    console.log('[GameData] 等待服务器数据...');
                    this._cache = {};
                }
                console.log('[GameData] 使用服务器文件存储');
            } else {
                // 纯浏览器环境：使用 localStorage
                console.log('[GameData] 使用 localStorage 存储');
                const saved = localStorage.getItem('blockgame_data');
                this._cache = saved ? JSON.parse(saved) : {};
                console.log('[GameData] 从 localStorage 加载');
            }
        } catch (e) {
            console.warn('[GameData] 加载失败，使用默认值:', e);
            this._cache = {};
        }
        
        this._cacheLoaded = true;
        
        // 同步内存缓存
        if (this._cache.gameSettings) {
            this.gameSettings._memCache = this._cache.gameSettings;
        }
        if (this._cache.playerColors) {
            this.playerColors._memCache = this._cache.playerColors;
        }
        
        return this._cache;
    },
    
    /**
     * 异步保存所有数据
     */
    async save() {
        console.log('[GameData] save() 被调用，_cache =', this._cache);
        
        if (!this._cache) {
            console.warn('[GameData] _cache 为空，跳过保存');
            return;
        }
        
        try {
            const jsonStr = JSON.stringify(this._cache);
            console.log('[GameData] 准备保存，数据长度:', jsonStr.length);
            console.log('[GameData] _isDesktopApp:', this._isDesktopApp);
            console.log('[GameData] _ws:', this._ws);
            console.log('[GameData] _ws.readyState:', this._ws?.readyState, '(OPEN=1)');
            
            if (this._isDesktopApp && this._ws && this._ws.readyState === WebSocket.OPEN) {
                // 桌面应用：通过 WebSocket 发送保存请求
                this._ws.send(JSON.stringify({
                    type: 'save_data',
                    data: jsonStr
                }));
                console.log('[GameData] ✓ 通过 WebSocket 发送保存请求');
            } else if (!this._isDesktopApp) {
                // 纯浏览器环境：写入 localStorage
                localStorage.setItem('blockgame_data', jsonStr);
                console.log('[GameData] ✓ 保存到 localStorage');
            } else {
                console.warn('[GameData] ✗ WebSocket 未连接，无法保存');
                console.warn('[GameData] 尝试使用 localStorage 作为备份...');
                localStorage.setItem('blockgame_data', jsonStr);
            }
        } catch (e) {
            console.error('[GameData] 保存失败:', e);
        }
    },
    
    // ========== 游戏记录 ==========
    
    records: {
        /**
         * 获取最快通关时间（秒），0 表示无记录
         */
        async getBestTime(levelId = 'eatAndAvoid') {
            const data = await GameData.load();
            return data.records?.[levelId]?.bestTime || 0;
        },
        
        /**
         * 设置最快通关时间（只有更快才会更新）
         * @returns {boolean} 是否是新纪录
         */
        async setBestTime(levelId, time) {
            const data = await GameData.load();
            data.records = data.records || {};
            data.records[levelId] = data.records[levelId] || {};
            
            const current = data.records[levelId].bestTime || 0;
            if (current === 0 || time < current) {
                data.records[levelId].bestTime = time;
                await GameData.save();
                console.log(`[GameData] 新纪录！关卡=${levelId}, 时间=${time}秒`);
                return true;
            }
            return false;
        },
        
        /**
         * 获取总游戏时长（秒）
         */
        async getTotalPlayTime() {
            const data = await GameData.load();
            return data.totalPlayTime || 0;
        },
        
        /**
         * 增加总游戏时长
         */
        async addPlayTime(seconds) {
            const data = await GameData.load();
            data.totalPlayTime = (data.totalPlayTime || 0) + seconds;
            await GameData.save();
        },
        
        /**
         * 获取游戏次数
         */
        async getPlayCount() {
            const data = await GameData.load();
            return data.playCount || 0;
        },
        
        /**
         * 增加游戏次数
         */
        async incrementPlayCount() {
            const data = await GameData.load();
            data.playCount = (data.playCount || 0) + 1;
            await GameData.save();
        }
    },
    
    // ========== 控制器设置（存入存档文件）==========
    
    controller: {
        async get() {
            const data = await GameData.load();
            return data.controller || {};
        },
        
        async set(newData) {
            const data = await GameData.load();
            data.controller = { ...(data.controller || {}), ...newData };
            await GameData.save();
        },
        
        async getLayout() {
            const ctrl = await this.get();
            return ctrl.layout || null;
        },
        
        async setLayout(layout) {
            await this.set({ layout });
        },
        
        async getScale() {
            const ctrl = await this.get();
            return ctrl.scale || { joystick: 1, buttons: 1, gap: 1 };
        },
        
        async setScale(scale) {
            await this.set({ scale });
        },
        
        async getLanguage() {
            const ctrl = await this.get();
            return ctrl.lang || 'cn';
        },
        
        async setLanguage(lang) {
            await this.set({ lang });
        }
    },
    
    // ========== 游戏设置（存入存档文件）==========
    
    gameSettings: {
        // 内存缓存，避免频繁异步读取
        _memCache: null,
        
        _getSync() {
            // 同步获取（从内存缓存或 _cache）
            if (this._memCache) return this._memCache;
            if (GameData._cache && GameData._cache.gameSettings) {
                this._memCache = GameData._cache.gameSettings;
                return this._memCache;
            }
            return {};
        },
        
        _setSync(newData) {
            // 同步设置（更新内存缓存和 _cache，延迟保存）
            const current = this._getSync();
            this._memCache = { ...current, ...newData };
            if (GameData._cache) {
                GameData._cache.gameSettings = this._memCache;
            }
            // 延迟保存，避免频繁写入
            this._scheduleSave();
        },
        
        _saveTimer: null,
        _scheduleSave() {
            if (this._saveTimer) clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                GameData.save();
                this._saveTimer = null;
            }, 500);
        },
        
        /**
         * 获取控制器模式（已固定为 independent）
         * @deprecated 模式已固定
         * @returns {'independent'}
         */
        getControllerMode() {
            return 'independent';
        },
        
        /**
         * 设置控制器模式（已废弃）
         * @deprecated 模式已固定为 independent
         */
        setControllerMode(mode) {
            // 不再需要，模式固定为 independent
        },
        
        /**
         * 获取键盘是否启用
         * @returns {boolean} 默认 true
         */
        getKeyboardEnabled() {
            const val = this._getSync().keyboardEnabled;
            return val !== false; // 默认启用
        },
        
        /**
         * 设置键盘是否启用
         * @param {boolean} enabled
         */
        setKeyboardEnabled(enabled) {
            this._setSync({ keyboardEnabled: enabled });
            console.log('[GameData] 键盘控制:', enabled ? '启用' : '禁用');
        },
        
        /**
         * 获取游戏难度
         * @returns {'easy'|'normal'} 默认 'normal'
         */
        getDifficulty() {
            return this._getSync().difficulty || 'normal';
        },
        
        /**
         * 设置游戏难度
         * @param {'easy'|'normal'} difficulty
         */
        setDifficulty(difficulty) {
            this._setSync({ difficulty });
            console.log('[GameData] 游戏难度:', difficulty);
        },
        
        /**
         * 获取显示模式
         * @returns {'windowed'|'fullscreen'} 默认 'fullscreen'（首次安装默认全屏）
         */
        getDisplayMode() {
            return this._getSync().displayMode || 'fullscreen';
        },
        
        /**
         * 设置显示模式
         * @param {'windowed'|'fullscreen'} mode
         */
        setDisplayMode(mode) {
            this._setSync({ displayMode: mode });
            console.log('[GameData] 显示模式:', mode);
        },
        
        /**
         * 获取所有设置
         */
        getAll() {
            return {
                controllerMode: this.getControllerMode(),
                difficulty: this.getDifficulty(),
                displayMode: this.getDisplayMode(),
                volume: this.getVolume()
            };
        },
        
        /**
         * 获取音量设置
         * @returns {{ master: number, bgm: number, sfx: number }}
         */
        getVolume() {
            const data = this._getSync();
            return {
                master: data.volume?.master ?? 1.0,
                bgm: data.volume?.bgm ?? 0.7,
                sfx: data.volume?.sfx ?? 0.8
            };
        },
        
        /**
         * 设置音量
         * @param {'master'|'bgm'|'sfx'} type - 音量类型
         * @param {number} value - 0.0 ~ 1.0
         */
        setVolume(type, value) {
            const data = this._getSync();
            data.volume = data.volume || {};
            data.volume[type] = Math.max(0, Math.min(1, value));
            this._setSync(data);
            console.log(`[GameData] ${type} 音量:`, Math.round(value * 100) + '%');
        },
        
        /**
         * 获取语言设置
         * @returns {string} 默认 'zh-CN'
         */
        getLanguage() {
            return this._getSync().language || 'zh-CN';
        },
        
        /**
         * 设置语言
         * @param {string} lang
         */
        setLanguage(lang) {
            this._setSync({ language: lang });
            console.log('[GameData] 语言:', lang);
        }
    },
    
    // ========== 玩家颜色管理（存入存档文件）==========
    
    playerColors: {
        // 内存缓存
        _memCache: null,
        
        /**
         * 获取所有颜色定义
         */
        getAllColors() {
            return ALL_PLAYER_COLORS;
        },
        
        /**
         * 根据ID获取颜色
         */
        getColorById(id) {
            return ALL_PLAYER_COLORS.find(c => c.id === id) || ALL_PLAYER_COLORS[0];
        },
        
        /**
         * 根据main色值查找颜色
         */
        getColorByMain(mainColor) {
            return ALL_PLAYER_COLORS.find(c => c.main === mainColor);
        },
        
        /**
         * 获取保存的玩家颜色 { playerId: { main, glow, core } }
         */
        getSavedColors() {
            // 优先从内存缓存读取
            if (this._memCache) return this._memCache;
            // 从 _cache 读取
            if (GameData._cache && GameData._cache.playerColors) {
                this._memCache = GameData._cache.playerColors;
                return this._memCache;
            }
            return {};
        },
        
        /**
         * 保存玩家颜色
         */
        saveColors(colors) {
            this._memCache = colors;
            if (GameData._cache) {
                GameData._cache.playerColors = colors;
            }
            // 延迟保存
            this._scheduleSave();
            console.log('[GameData] 保存玩家颜色:', colors);
        },
        
        _saveTimer: null,
        _scheduleSave() {
            if (this._saveTimer) clearTimeout(this._saveTimer);
            this._saveTimer = setTimeout(() => {
                GameData.save();
                this._saveTimer = null;
            }, 500);
        },
        
        /**
         * 获取单个玩家的颜色（返回颜色对象或默认值）
         */
        getPlayerColor(playerId) {
            const saved = this.getSavedColors();
            if (saved[playerId]) {
                // 优先使用保存的颜色ID
                if (saved[playerId].id && saved[playerId].id > 0) {
                    const preset = this.getColorById(saved[playerId].id);
                    if (preset) return preset;
                }
                // 尝试通过颜色值找到匹配的预设颜色
                const presetByMain = this.getColorByMain(saved[playerId].main);
                if (presetByMain) return presetByMain;
                // 返回保存的自定义颜色
                return { id: 0, ...saved[playerId], name: '自定义' };
            }
            // 默认：玩家ID对应颜色ID
            return this.getColorById(parseInt(playerId)) || ALL_PLAYER_COLORS[0];
    },
    
        /**
         * 设置单个玩家的颜色
         */
        setPlayerColor(playerId, colorIdOrObject) {
            const saved = this.getSavedColors();
            
            if (typeof colorIdOrObject === 'number') {
                // 传入颜色ID - 同时保存ID和颜色值
                const color = this.getColorById(colorIdOrObject);
                if (color) {
                    saved[playerId] = { 
                        id: colorIdOrObject,  // 保存颜色ID
                        main: color.main, 
                        glow: color.glow, 
                        core: color.core 
                    };
            }
            } else if (colorIdOrObject && colorIdOrObject.main) {
                // 传入颜色对象 - 尝试找到对应的ID
                const preset = this.getColorByMain(colorIdOrObject.main);
                saved[playerId] = { 
                    id: preset ? preset.id : 0,  // 保存颜色ID
                    main: colorIdOrObject.main, 
                    glow: colorIdOrObject.glow, 
                    core: colorIdOrObject.core 
                };
            }
            
            this.saveColors(saved);
        },
        
        /**
         * 应用保存的颜色到玩家对象
         */
        applyToPlayer(player) {
            if (!player || !player.id) return;
            const color = this.getPlayerColor(player.id);
            if (color) {
                player.colors = { main: color.main, glow: color.glow, core: color.core };
            }
        },
        
        /**
         * 应用保存的颜色到所有玩家
         */
        applyToAllPlayers(players) {
            if (!players) return;
            Object.values(players).forEach(player => this.applyToPlayer(player));
        }
    },
    
    // ========== 调试工具 ==========
    
    debug: {
        /**
         * 导出所有数据（明文）
         */
        async exportData() {
            const data = await GameData.load();
            return JSON.stringify(data, null, 2);
        },
        
        /**
         * 导入数据
         */
        async importData(jsonStr) {
            try {
                GameData._cache = JSON.parse(jsonStr);
                await GameData.save();
                return true;
            } catch (e) {
                console.error('[GameData] 导入失败:', e);
                return false;
            }
        },
        
        /**
         * 清空所有数据
         */
        async clearAll() {
            GameData._cache = {};
            await GameData.save();
            console.log('[GameData] 已清空所有数据');
        }
    }
};

// 页面加载时预加载数据
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        GameData.load().then(() => {
            console.log('[GameData] 初始化完成');
        });
    });
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameData };
}
