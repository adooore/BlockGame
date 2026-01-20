/**
 * 音效管理模块
 * 统一管理所有游戏音效和背景音乐，方便更换资源
 */

const SoundManager = (function() {
    // ==================== 资源配置 ====================
    // 在这里统一配置所有音频路径，更换资源只需修改这里
    
    // 音效配置
    const SFX_CONFIG = {
        // 玩家动作音效
        dash: 'source/flash_effect.wav',      // 冲刺
        jump: 'source/jump_effect.wav',       // 起跳
        land: 'source/fall_effect.wav',       // 落地
        score: 'source/score_effect.wav',     // 得分
        
        // 可扩展更多音效
        // hit: 'source/hit_effect.wav',
        // victory: 'source/victory_effect.wav',
        // gameover: 'source/gameover_effect.wav',
    };
    
    // 背景音乐配置
    const BGM_CONFIG = {
        main: 'source/main_bgm.wav',              // 主页背景音乐
        game: 'source/eat_and_avoid_bgm.wav',     // 游戏背景音乐
        
        // 可扩展更多BGM
        // boss: 'source/boss_bgm.wav',
        // victory: 'source/victory_bgm.wav',
    };
    
    // 音量配置
    const VOLUME_CONFIG = {
        // 音效音量
        sfx: {
            dash: 0.8,
            jump: 0.5,
            land: 0.3,
            score: 0.5,
            default: 0.5
        },
        // BGM音量
        bgm: {
            main: 0.5,
            game: 1.0,
            default: 0.5
        }
    };
    
    // ==================== 内部状态 ====================
    const sfxCache = {};        // 音效缓存
    const bgmCache = {};        // BGM缓存
    let masterVolume = 1.0;     // 主音量
    let sfxVolume = 1.0;        // 音效总音量倍率
    let bgmVolume = 1.0;        // BGM总音量倍率
    let sfxEnabled = true;      // 是否启用音效
    let bgmEnabled = true;      // 是否启用BGM
    let currentBGM = null;      // 当前播放的BGM名称
    let bgmStarted = false;     // BGM是否已开始（用于处理浏览器交互要求）
    let pendingBGM = null;      // 待播放的BGM（等待用户交互）
    
    // ==================== 音效 (SFX) ====================
    
    /**
     * 预加载所有音效
     */
    function preloadSFX() {
        Object.keys(SFX_CONFIG).forEach(name => {
            getSFXAudio(name);
        });
        console.log('[SoundManager] 音效预加载完成');
    }
    
    /**
     * 获取或创建音效对象
     */
    function getSFXAudio(name) {
        if (!sfxCache[name]) {
            const path = SFX_CONFIG[name];
            if (!path) {
                console.warn(`[SoundManager] 未知音效: ${name}`);
                return null;
            }
            sfxCache[name] = new Audio(path);
        }
        // 每次获取时更新音量（基础音量 × 音效倍率 × 主音量）
        const baseVol = VOLUME_CONFIG.sfx[name] ?? VOLUME_CONFIG.sfx.default;
        sfxCache[name].volume = baseVol * sfxVolume * masterVolume;
        return sfxCache[name];
    }
    
    /**
     * 播放音效
     * @param {string} name - 音效名称 (如 'dash', 'land', 'score')
     */
    function playSFX(name) {
        if (!sfxEnabled) return;
        
        const audio = getSFXAudio(name);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    }
    
    /**
     * 停止音效
     */
    function stopSFX(name) {
        const audio = sfxCache[name];
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
    
    /**
     * 停止所有音效
     */
    function stopAllSFX() {
        Object.values(sfxCache).forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
    }
    
    // ==================== 背景音乐 (BGM) ====================
    
    /**
     * 获取或创建BGM对象
     */
    function getBGMAudio(name) {
        if (!bgmCache[name]) {
            const path = BGM_CONFIG[name];
            if (!path) {
                console.warn(`[SoundManager] 未知BGM: ${name}`);
                return null;
            }
            bgmCache[name] = new Audio(path);
            bgmCache[name].loop = true;
        }
        // 每次获取时更新音量（基础音量 × BGM倍率 × 主音量）
        const baseVol = VOLUME_CONFIG.bgm[name] ?? VOLUME_CONFIG.bgm.default;
        bgmCache[name].volume = baseVol * bgmVolume * masterVolume;
        return bgmCache[name];
    }
    
    /**
     * 播放背景音乐
     * @param {string} name - BGM名称 (如 'main', 'game')
     * @param {boolean} crossfade - 是否淡入淡出切换（暂不实现）
     */
    function playBGM(name) {
        if (!bgmEnabled) {
            pendingBGM = name;
            return;
        }
        
        // 如果正在播放同一首，不做处理
        if (currentBGM === name && bgmCache[name] && !bgmCache[name].paused) {
            return;
        }
        
        // 停止当前BGM
        if (currentBGM && bgmCache[currentBGM]) {
            bgmCache[currentBGM].pause();
            bgmCache[currentBGM].currentTime = 0;
        }
        
        const audio = getBGMAudio(name);
        if (audio) {
            pendingBGM = name;
            currentBGM = name;
            
            audio.play().then(() => {
                bgmStarted = true;
                console.log(`[SoundManager] BGM '${name}' 播放成功`);
            }).catch((err) => {
                console.log(`[SoundManager] BGM '${name}' 等待用户交互...`);
            });
        }
    }
    
    /**
     * 暂停当前BGM
     */
    function pauseBGM() {
        if (currentBGM && bgmCache[currentBGM]) {
            bgmCache[currentBGM].pause();
        }
    }
    
    /**
     * 恢复当前BGM
     */
    function resumeBGM() {
        if (!bgmEnabled) return;
        
        if (currentBGM && bgmCache[currentBGM]) {
            bgmCache[currentBGM].play().catch(() => {});
        }
    }
    
    /**
     * 停止当前BGM
     */
    function stopBGM() {
        if (currentBGM && bgmCache[currentBGM]) {
            bgmCache[currentBGM].pause();
            bgmCache[currentBGM].currentTime = 0;
        }
        currentBGM = null;
        bgmStarted = false;
    }
    
    /**
     * 停止所有BGM
     */
    function stopAllBGM() {
        Object.values(bgmCache).forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        currentBGM = null;
        bgmStarted = false;
    }
    
    /**
     * 尝试播放待播放的BGM（在用户交互后调用）
     */
    function tryPlayPendingBGM() {
        if (pendingBGM && bgmEnabled) {
            const audio = getBGMAudio(pendingBGM);
            if (audio && audio.paused) {
                audio.play().then(() => {
                    bgmStarted = true;
                    currentBGM = pendingBGM;
                    console.log(`[SoundManager] BGM '${pendingBGM}' 播放成功`);
                }).catch(() => {});
            }
        }
    }
    
    /**
     * 初始化BGM自动播放（处理浏览器交互要求）
     * 在页面加载后调用，自动监听用户交互
     */
    function initBGMAutoplay() {
        const events = ['click', 'keydown', 'touchstart'];
        
        function handleInteraction() {
            tryPlayPendingBGM();
        }
        
        events.forEach(event => {
            document.addEventListener(event, handleInteraction, { passive: true });
        });
        
        // 立即尝试播放（可能因autoplay policy失败）
        tryPlayPendingBGM();
    }
    
    // ==================== 设置 ====================
    
    /**
     * 设置主音量
     * @param {number} volume - 0.0 ~ 1.0
     */
    function setMasterVolume(volume) {
        masterVolume = Math.max(0, Math.min(1, volume));
        
        // 更新所有音效音量（基础音量 × 音效倍率 × 主音量）
        Object.keys(sfxCache).forEach(name => {
            const baseVol = VOLUME_CONFIG.sfx[name] ?? VOLUME_CONFIG.sfx.default;
            sfxCache[name].volume = baseVol * sfxVolume * masterVolume;
        });
        
        // 更新所有BGM音量（基础音量 × BGM倍率 × 主音量）
        Object.keys(bgmCache).forEach(name => {
            const baseVol = VOLUME_CONFIG.bgm[name] ?? VOLUME_CONFIG.bgm.default;
            bgmCache[name].volume = baseVol * bgmVolume * masterVolume;
        });
    }
    
    /**
     * 获取主音量
     */
    function getMasterVolume() {
        return masterVolume;
    }
    
    /**
     * 设置音效总音量倍率
     * @param {number} volume - 0.0 ~ 1.0，会乘以每个音效的基础音量
     */
    function setSFXVolume(volume) {
        sfxVolume = Math.max(0, Math.min(1, volume));
        // 更新所有已缓存音效的音量
        Object.keys(sfxCache).forEach(name => {
            const baseVol = VOLUME_CONFIG.sfx[name] ?? VOLUME_CONFIG.sfx.default;
            sfxCache[name].volume = baseVol * sfxVolume * masterVolume;
        });
    }
    
    /**
     * 设置BGM总音量倍率
     * @param {number} volume - 0.0 ~ 1.0，会乘以每个BGM的基础音量
     */
    function setBGMVolume(volume) {
        bgmVolume = Math.max(0, Math.min(1, volume));
        // 更新所有已缓存BGM的音量
        Object.keys(bgmCache).forEach(name => {
            const baseVol = VOLUME_CONFIG.bgm[name] ?? VOLUME_CONFIG.bgm.default;
            bgmCache[name].volume = baseVol * bgmVolume * masterVolume;
        });
    }
    
    /**
     * 获取音效总音量倍率
     */
    function getSFXVolume() {
        return sfxVolume;
    }
    
    /**
     * 获取BGM总音量倍率
     */
    function getBGMVolume() {
        return bgmVolume;
    }
    
    /**
     * 启用/禁用音效
     */
    function setSFXEnabled(value) {
        sfxEnabled = value;
        if (!sfxEnabled) {
            stopAllSFX();
        }
    }
    
    /**
     * 启用/禁用BGM
     */
    function setBGMEnabled(value) {
        bgmEnabled = value;
        if (!bgmEnabled) {
            stopAllBGM();
        } else if (pendingBGM) {
            playBGM(pendingBGM);
        }
    }
    
    /**
     * 检查音效是否启用
     */
    function isSFXEnabled() {
        return sfxEnabled;
    }
    
    /**
     * 检查BGM是否启用
     */
    function isBGMEnabled() {
        return bgmEnabled;
    }
    
    /**
     * 获取当前BGM名称
     */
    function getCurrentBGM() {
        return currentBGM;
    }
    
    // ==================== 便捷方法（兼容旧API）====================
    
    // 预加载（兼容旧版）
    function preload() {
        preloadSFX();
    }
    
    // 播放音效（兼容旧版）
    function play(name) {
        playSFX(name);
    }
    
    // 停止（兼容旧版）
    function stop(name) {
        stopSFX(name);
    }
    
    // 停止所有（兼容旧版）
    function stopAll() {
        stopAllSFX();
    }
    
    // 启用/禁用（兼容旧版，仅影响音效）
    function setEnabled(value) {
        setSFXEnabled(value);
    }
    
    function isEnabled() {
        return isSFXEnabled();
    }
    
    // ==================== 公开 API ====================
    return {
        // 初始化
        preload,
        preloadSFX,
        initBGMAutoplay,
        
        // 音效播放控制
        play,
        playSFX,
        stop,
        stopSFX,
        stopAll,
        stopAllSFX,
        
        // BGM播放控制
        playBGM,
        pauseBGM,
        resumeBGM,
        stopBGM,
        stopAllBGM,
        tryPlayPendingBGM,
        getCurrentBGM,
        
        // 设置
        setMasterVolume,
        getMasterVolume,
        setSFXVolume,
        getSFXVolume,
        setBGMVolume,
        getBGMVolume,
        setSFXEnabled,
        setBGMEnabled,
        isSFXEnabled,
        isBGMEnabled,
        
        // 兼容旧版（注意：setSFXVolume 现在是设置全局倍率）
        setVolume: setSFXVolume,
        setEnabled,
        isEnabled,
        
        // 便捷方法（直接调用常用音效）
        playDash: () => playSFX('dash'),
        playJump: () => playSFX('jump'),
        playLand: () => playSFX('land'),
        playScore: () => playSFX('score'),
        
        // 便捷方法（直接播放常用BGM）
        playMainBGM: () => playBGM('main'),
        playGameBGM: () => playBGM('game'),
        
        // 暴露配置（只读）
        get sfxConfig() { return { ...SFX_CONFIG }; },
        get bgmConfig() { return { ...BGM_CONFIG }; },
        get volumes() { return JSON.parse(JSON.stringify(VOLUME_CONFIG)); }
    };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundManager;
}
