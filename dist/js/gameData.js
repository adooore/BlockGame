/**
 * 游戏数据管理模块
 * 支持 Tauri 文件存储（加密）和浏览器 localStorage 回退
 */

// ==================== 玩家颜色常量 ====================
const ALL_PLAYER_COLORS = [
    { id: 1, main: '#00f2ff', glow: '#00f2ff', core: '#e0faff', name: '青' },
    { id: 2, main: '#a855f7', glow: '#d946ef', core: '#f0e0ff', name: '紫' },
    { id: 3, main: '#4ade80', glow: '#39ff14', core: '#e0ffe0', name: '绿' },
    { id: 4, main: '#facc15', glow: '#ffaa00', core: '#fffbe0', name: '黄' },
    { id: 5, main: '#ff4757', glow: '#ff4757', core: '#ffe0e0', name: '红' },
    { id: 6, main: '#ff7f50', glow: '#ff7f50', core: '#ffe8e0', name: '橙' },
    { id: 7, main: '#ff6b9d', glow: '#ff6b9d', core: '#ffe0f0', name: '粉' },
    { id: 8, main: '#ffffff', glow: '#ffffff', core: '#f8f8f8', name: '白' }
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
    
    // ========== 设置 ==========
    
    settings: {
        /**
         * 获取音量设置
         */
        async getVolume() {
            const data = await GameData.load();
            return {
                master: data.settings?.volume?.master ?? 1.0,
                bgm: data.settings?.volume?.bgm ?? 0.5,
                sfx: data.settings?.volume?.sfx ?? 0.8
            };
        },
        
        /**
         * 设置音量
         */
        async setVolume(type, value) {
            const data = await GameData.load();
            data.settings = data.settings || {};
            data.settings.volume = data.settings.volume || {};
            data.settings.volume[type] = value;
            await GameData.save();
        },
        
        /**
         * 获取语言
         */
        async getLanguage() {
            const data = await GameData.load();
            return data.settings?.language || 'zh';
        },
        
        /**
         * 设置语言
         */
        async setLanguage(lang) {
            const data = await GameData.load();
            data.settings = data.settings || {};
            data.settings.language = lang;
            await GameData.save();
        }
    },
    
    // ========== 控制器设置（同步，仍用 localStorage）==========
    // 控制器需要快速读写，且不需要加密，继续用 localStorage
    
    controller: {
        _key: 'blockgame_controller',
        
        get() {
            try {
                return JSON.parse(localStorage.getItem(this._key) || '{}');
            } catch (e) {
                return {};
            }
        },
        
        set(data) {
            const current = this.get();
            localStorage.setItem(this._key, JSON.stringify({ ...current, ...data }));
        },
        
        getLayout() {
            return this.get().layout || null;
        },
        
        setLayout(layout) {
            this.set({ layout });
        },
        
        getScale() {
            return this.get().scale || { joystick: 1, buttons: 1, gap: 1 };
        },
        
        setScale(scale) {
            this.set({ scale });
        },
        
        getLanguage() {
            return this.get().lang || 'cn';
        },
        
        setLanguage(lang) {
            this.set({ lang });
        }
    },
    
    // ========== 游戏设置（持久化存储）==========
    
    gameSettings: {
        _key: 'blockgame_gameSettings',
        
        get() {
            try {
                return JSON.parse(localStorage.getItem(this._key) || '{}');
            } catch (e) {
                return {};
            }
        },
        
        set(data) {
            const current = this.get();
            localStorage.setItem(this._key, JSON.stringify({ ...current, ...data }));
        },
        
        /**
         * 获取控制器模式
         * @returns {'shared'|'independent'} 默认 'shared'
         */
        getControllerMode() {
            return this.get().controllerMode || 'shared';
        },
        
        /**
         * 设置控制器模式
         * @param {'shared'|'independent'} mode
         */
        setControllerMode(mode) {
            this.set({ controllerMode: mode });
            console.log('[GameData] 控制器模式:', mode);
        },
        
        /**
         * 获取键盘是否启用
         * @returns {boolean} 默认 true
         */
        getKeyboardEnabled() {
            const val = this.get().keyboardEnabled;
            return val !== false; // 默认启用
        },
        
        /**
         * 设置键盘是否启用
         * @param {boolean} enabled
         */
        setKeyboardEnabled(enabled) {
            this.set({ keyboardEnabled: enabled });
            console.log('[GameData] 键盘控制:', enabled ? '启用' : '禁用');
        },
        
        /**
         * 获取游戏难度
         * @returns {'easy'|'normal'} 默认 'normal'
         */
        getDifficulty() {
            return this.get().difficulty || 'normal';
        },
        
        /**
         * 设置游戏难度
         * @param {'easy'|'normal'} difficulty
         */
        setDifficulty(difficulty) {
            this.set({ difficulty });
            console.log('[GameData] 游戏难度:', difficulty);
        },
        
        /**
         * 获取所有设置
         */
        getAll() {
            return {
                controllerMode: this.getControllerMode(),
                difficulty: this.getDifficulty()
            };
        }
    },
    
    // ========== 玩家颜色管理（持久化存储）==========
    
    playerColors: {
        _key: 'blockgame_playerColors',
        
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
            try {
                const saved = localStorage.getItem(this._key);
                return saved ? JSON.parse(saved) : {};
            } catch (e) {
                console.warn('[GameData] 读取玩家颜色失败:', e);
                return {};
            }
        },
        
        /**
         * 保存玩家颜色
         */
        saveColors(colors) {
            try {
                localStorage.setItem(this._key, JSON.stringify(colors));
                console.log('[GameData] 保存玩家颜色:', colors);
            } catch (e) {
                console.error('[GameData] 保存玩家颜色失败:', e);
            }
        },
        
        /**
         * 获取单个玩家的颜色（返回颜色对象或默认值）
         */
        getPlayerColor(playerId) {
            const saved = this.getSavedColors();
            if (saved[playerId]) {
                // 尝试找到匹配的预设颜色
                const preset = this.getColorByMain(saved[playerId].main);
                if (preset) return preset;
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
                // 传入颜色ID
                const color = this.getColorById(colorIdOrObject);
                if (color) {
                    saved[playerId] = { main: color.main, glow: color.glow, core: color.core };
                }
            } else if (colorIdOrObject && colorIdOrObject.main) {
                // 传入颜色对象
                saved[playerId] = { 
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
    
    // ========== 会话数据（临时，页面关闭后消失）==========
    
    session: {
        _key: 'blockgame_session',
        
        get() {
            try {
                return JSON.parse(sessionStorage.getItem(this._key) || '{}');
            } catch (e) {
                return {};
            }
        },
        
        set(data) {
            const current = this.get();
            sessionStorage.setItem(this._key, JSON.stringify({ ...current, ...data }));
        },
        
        clear() {
            sessionStorage.removeItem(this._key);
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
