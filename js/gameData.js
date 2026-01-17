/**
 * 游戏数据管理模块
 * 处理存档、设置、URL参数等
 */

const GameData = {
    // ========== 持久化数据 (localStorage) ==========
    save: {
        _key: 'blockgame_save',
        
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
        
        // 最高分
        getHighScore(levelId = 'default') {
            return this.get().highScores?.[levelId] || 0;
        },
        
        setHighScore(levelId, score) {
            const saves = this.get();
            saves.highScores = saves.highScores || {};
            if (score > (saves.highScores[levelId] || 0)) {
                saves.highScores[levelId] = score;
                this.set(saves);
                return true;  // 新纪录
            }
            return false;
        },
        
        // 解锁关卡
        getUnlockedLevels() {
            return this.get().unlockedLevels || [1];
        },
        
        unlockLevel(levelId) {
            const levels = this.getUnlockedLevels();
            if (!levels.includes(levelId)) {
                levels.push(levelId);
                this.set({ unlockedLevels: levels });
            }
        },
        
        isLevelUnlocked(levelId) {
            return this.getUnlockedLevels().includes(levelId);
        }
    },

    // ========== 设置 (localStorage) ==========
    settings: {
        _key: 'blockgame_settings',
        
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
        
        // 语言
        getLanguage() {
            return this.get().lang || 'zh';
        },
        
        setLanguage(lang) {
            this.set({ lang });
        },
        
        // 音效
        getSoundEnabled() {
            return this.get().sound !== false;
        },
        
        setSoundEnabled(enabled) {
            this.set({ sound: enabled });
        }
    },

    // ========== 会话数据 (sessionStorage) ==========
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
        
        // 当前游戏进度
        setCurrentProgress(levelId, wave, score) {
            this.set({ currentLevel: levelId, currentWave: wave, currentScore: score });
        },
        
        getCurrentProgress() {
            return this.get();
        },
        
        clear() {
            sessionStorage.removeItem(this._key);
        }
    },

    // ========== URL 参数 ==========
    url: {
        get(key) {
            return new URLSearchParams(window.location.search).get(key);
        },
        
        getAll() {
            const params = {};
            new URLSearchParams(window.location.search).forEach((v, k) => params[k] = v);
            return params;
        },
        
        buildUrl(page, params = {}) {
            const url = new URL(page, window.location.origin);
            Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
            return url.toString();
        },
        
        goTo(page, params = {}) {
            window.location.href = this.buildUrl(page, params);
        }
    }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameData };
}

