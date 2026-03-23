/**
 * MainMenuUI：主页菜单、设置、二维码、底部控制提示（N 键返回等）
 * mainEntry 通过 initRuntimeDeps 注入 gameWs、拖尾同步等运行时依赖。
 */
window.MainMenuUI = (function () {
    const BASE_UI_WIDTH = 1280;
    const BASE_UI_HEIGHT = 720;

    let serverInfo = { ip: null, port: 8088 };

    /** @type {{ getGameWs: () => WebSocket|null, applyTrailLengthToActivePlayers: (n: number) => void }} */
    let runtimeDeps = {
        getGameWs: () => null,
        applyTrailLengthToActivePlayers: function () {}
    };

    function initRuntimeDeps(deps) {
        if (!deps) return;
        if (typeof deps.getGameWs === 'function') runtimeDeps.getGameWs = deps.getGameWs;
        if (typeof deps.applyTrailLengthToActivePlayers === 'function') {
            runtimeDeps.applyTrailLengthToActivePlayers = deps.applyTrailLengthToActivePlayers;
        }
    }

    function setServerInfo(info) {
        if (!info) return;
        if (info.ip != null) serverInfo.ip = info.ip;
        if (info.port != null) serverInfo.port = info.port;
    }

    function getControllerUrl() {
        const protocol = window.location.protocol;
        const host = serverInfo.ip || window.location.hostname;
        const port = serverInfo.port || window.location.port || '8088';
        return `${protocol}//${host}:${port}/controller`;
    }

    function generateQRCode() {
        const url = getControllerUrl();
        const qrCanvas = document.getElementById('qr-canvas');
        const qrUrlDisplay = document.getElementById('qr-url');
        const qrLoading = document.getElementById('qr-loading');

        if (qrLoading) qrLoading.style.display = 'none';
        if (qrUrlDisplay) qrUrlDisplay.textContent = url;
        if (!qrCanvas || typeof qrcode !== 'function') return;

        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();

        const moduleCount = qr.getModuleCount();
        const cellSize = Math.floor(200 / moduleCount);
        const size = moduleCount * cellSize;

        qrCanvas.width = size;
        qrCanvas.height = size;
        const ctx = qrCanvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = '#000000';
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                }
            }
        }
    }

    /** 二维码弹窗内区域随窗口缩放（由 mainEntry resizePreviewCanvas 调用） */
    function resizeQrContentScale() {
        const qrContent = document.getElementById('qr-content');
        if (qrContent) {
            const scale = Math.max(0.75, Math.min(1.15, window.innerWidth / BASE_UI_WIDTH));
            qrContent.style.transform = `scale(${scale})`;
        }
    }

    /** 主菜单浮层（二维码/设置/底部提示）统一缩放。 */
    function resizeOverlayScale() {
        const scaleByWidth = window.innerWidth / BASE_UI_WIDTH;
        const scaleByHeight = window.innerHeight / BASE_UI_HEIGHT;
        const uiScale = Math.max(0.75, Math.min(1.15, Math.min(scaleByWidth, scaleByHeight)));

        resizeQrContentScale();

        const settingsContent = document.getElementById('settings-content');
        if (settingsContent) {
            settingsContent.style.transform = `scale(${uiScale})`;
        }

        if (window.ControlHint && typeof ControlHint.setScale === 'function') {
            ControlHint.setScale(uiScale);
        }
    }

    function init() {
        if (!window.ControlHint) {
            console.error('[MainMenuUI] ControlHint 未定义');
            return;
        }
        ControlHint.init();
        ControlHint.setHintsState('main_menu');
    }

    function toggleQR() {
        const modal = document.getElementById('qr-modal');
        if (!modal) return;
        if (modal.classList.contains('active')) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                updateControlHints();
            }, 300);
        } else {
            modal.style.display = 'flex';
            ControlHint.setHintsState('qr_modal');
            setTimeout(() => {
                modal.classList.add('active');
            }, 10);
        }
    }

    function updateControlHints() {
        const qrModal = document.getElementById('qr-modal');
        const settingsModal = document.getElementById('settings-modal');
        const gameModeMenu = document.getElementById('game-mode-menu');
        const coopMenu = document.getElementById('coop-menu');
        const versusMenu = document.getElementById('versus-menu');

        if (!window.ControlHint) {
            console.error('[MainMenuUI] ControlHint 未定义');
            return;
        }

        if (qrModal && qrModal.classList.contains('active')) {
            ControlHint.setHintsState('qr_modal');
        } else if (settingsModal && settingsModal.classList.contains('active')) {
            ControlHint.setHintsState('settings_modal');
        } else if (
            (coopMenu && coopMenu.classList.contains('visible-menu')) ||
            (versusMenu && versusMenu.classList.contains('visible-menu'))
        ) {
            ControlHint.setHintsState('level_select');
        } else if (gameModeMenu && gameModeMenu.classList.contains('visible-menu')) {
            ControlHint.setHintsState('mode_select');
        } else {
            ControlHint.setHintsState('main_menu');
        }
    }

    const MENU_FADE_OUT = 180;
    const MENU_FADE_IN = 220;

    function switchMenu(fromMenu, toMenu, options = {}) {
        const { hideTitle = false, showTitle = false } = options;
        const titleSection = document.getElementById('title-section');

        if (fromMenu) {
            fromMenu.classList.add('menu-fade-out');
        }

        if (hideTitle && titleSection) {
            titleSection.style.transition = `opacity ${MENU_FADE_OUT}ms ease, transform ${MENU_FADE_OUT}ms ease`;
            titleSection.style.opacity = '0';
            titleSection.style.transform = 'translateY(-20px)';
            titleSection.style.pointerEvents = 'none';
        }

        setTimeout(() => {
            if (fromMenu) {
                fromMenu.classList.remove('menu-fade-out', 'visible-menu');
                fromMenu.classList.add('hidden-menu');
            }
            if (hideTitle && titleSection) {
                titleSection.style.display = 'none';
            }

            if (showTitle && titleSection) {
                titleSection.style.display = '';
                titleSection.style.opacity = '0';
                titleSection.style.transform = 'translateY(15px)';
            }

            if (toMenu) {
                toMenu.classList.remove('hidden-menu');
                toMenu.style.opacity = '0';
                toMenu.style.transform = 'translateY(25px)';
                toMenu.offsetHeight;
                toMenu.style.transition = `opacity ${MENU_FADE_IN}ms ease-out, transform ${MENU_FADE_IN}ms ease-out`;
                toMenu.style.opacity = '1';
                toMenu.style.transform = 'translateY(0)';
                toMenu.classList.add('visible-menu');

                if (showTitle && titleSection) {
                    titleSection.style.transition = `opacity ${MENU_FADE_IN}ms ease-out, transform ${MENU_FADE_IN}ms ease-out`;
                    titleSection.style.opacity = '1';
                    titleSection.style.transform = 'translateY(0)';
                    titleSection.style.pointerEvents = '';
                }

                setTimeout(() => {
                    toMenu.style.transition = '';
                    toMenu.style.opacity = '';
                    toMenu.style.transform = '';
                    if (showTitle && titleSection) {
                        titleSection.style.transition = '';
                    }
                }, MENU_FADE_IN);

                if (typeof lucide !== 'undefined') lucide.createIcons();
                updateControlHints();
            }
        }, MENU_FADE_OUT);
    }

    function showModeSelection() {
        if (typeof SceneManager !== 'undefined' && typeof SceneManager.enter === 'function') {
            SceneManager.enter('levelSelect', { sub: 'mode' });
            return;
        }
        const mainMenu = document.getElementById('main-menu');
        const gameModeMenu = document.getElementById('game-mode-menu');
        if (mainMenu && gameModeMenu) {
            switchMenu(mainMenu, gameModeMenu, { hideTitle: true });
        }
    }

    function showCoopLevels() {
        const gameModeMenu = document.getElementById('game-mode-menu');
        const coopMenu = document.getElementById('coop-menu');
        switchMenu(gameModeMenu, coopMenu);
    }

    function showVersusLevels() {
        const gameModeMenu = document.getElementById('game-mode-menu');
        const versusMenu = document.getElementById('versus-menu');
        switchMenu(gameModeMenu, versusMenu);
    }

    function backToModeSelection() {
        const coopMenu = document.getElementById('coop-menu');
        const versusMenu = document.getElementById('versus-menu');
        const gameModeMenu = document.getElementById('game-mode-menu');
        const activeMenu = coopMenu.classList.contains('visible-menu') ? coopMenu : versusMenu;
        switchMenu(activeMenu, gameModeMenu);
    }

    function backToMain() {
        if (typeof SceneManager !== 'undefined' && SceneManager.getCurrentSceneId() === 'levelSelect') {
            SceneManager.enter('mainMenu', {});
            return;
        }
        const mainMenu = document.getElementById('main-menu');
        const gameModeMenu = document.getElementById('game-mode-menu');
        if (mainMenu && gameModeMenu) {
            switchMenu(gameModeMenu, mainMenu, { showTitle: true });
        }
    }

    function toggleSettings() {
        const modal = document.getElementById('settings-modal');
        if (!modal) return;

        if (modal.classList.contains('active')) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                updateControlHints();
            }, 300);
        } else {
            loadSettingsUI();
            modal.style.display = 'flex';
            modal.style.opacity = '0';
            ControlHint.setHintsState('settings_modal');
            requestAnimationFrame(() => {
                modal.classList.add('active');
                modal.style.opacity = '1';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        }
    }

    function loadSettingsUI() {
        const keyboardEnabled = PersistedStore.gameSettings.getKeyboardEnabled();
        const keyboardToggle = document.getElementById('keyboard-toggle');
        if (keyboardToggle) keyboardToggle.checked = keyboardEnabled;

        const difficulty = PersistedStore.gameSettings.getDifficulty();
        updateDifficultyUI(difficulty);

        loadAudioSettingsUI();
        loadDisplaySettingsUI();
        initSettingsTabs();
    }

    function loadDisplaySettingsUI() {
        const displayMode = PersistedStore.gameSettings.getDisplayMode();
        setDisplayMode(displayMode, false);

        const fpsEnabled = PersistedStore.gameSettings.getFpsOverlayEnabled();
        const fpsToggle = document.getElementById('fps-overlay-toggle');
        if (fpsToggle) fpsToggle.checked = fpsEnabled;
        if (window.FpsOverlay) window.FpsOverlay.setVisible(fpsEnabled);

        const showPlayerNumber = PersistedStore.gameSettings.getShowPlayerNumber();
        const showPlayerNumberToggle = document.getElementById('show-player-number-toggle');
        if (showPlayerNumberToggle) showPlayerNumberToggle.checked = showPlayerNumber;

        const trailLength = PersistedStore.gameSettings.getTrailLength();
        const trailInput = document.getElementById('trail-length-input');
        if (trailInput) trailInput.value = trailLength;
    }

    let settingsTabsBound = false;
    function initSettingsTabs() {
        if (settingsTabsBound) return;
        settingsTabsBound = true;
        const tabs = document.querySelectorAll('.settings-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.settings-panel').forEach(p => {
                    p.style.display = 'none';
                });
                tab.classList.add('active');
                const panelId = tab.dataset.tab;
                const panel = document.querySelector(`.settings-panel[data-panel="${panelId}"]`);
                if (panel) panel.style.display = 'block';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        });
    }

    function loadAudioSettingsUI() {
        const volumes = PersistedStore.gameSettings.getVolume();

        const masterSlider = document.getElementById('master-volume');
        const masterValue = document.getElementById('master-volume-value');
        if (masterSlider) {
            masterSlider.value = Math.round(volumes.master * 100);
            if (masterValue) masterValue.textContent = masterSlider.value + '%';
        }

        const bgmSlider = document.getElementById('bgm-volume');
        const bgmValue = document.getElementById('bgm-volume-value');
        if (bgmSlider) {
            bgmSlider.value = Math.round(volumes.bgm * 100);
            if (bgmValue) bgmValue.textContent = bgmSlider.value + '%';
        }

        const sfxSlider = document.getElementById('sfx-volume');
        const sfxValue = document.getElementById('sfx-volume-value');
        if (sfxSlider) {
            sfxSlider.value = Math.round(volumes.sfx * 100);
            if (sfxValue) sfxValue.textContent = sfxSlider.value + '%';
        }
    }

    function onMasterVolumeChange(value) {
        const volume = parseInt(value, 10) / 100;
        const el = document.getElementById('master-volume-value');
        if (el) el.textContent = value + '%';
        PersistedStore.gameSettings.setVolume('master', volume);
        SoundManager.setMasterVolume(volume);
    }

    function onBGMVolumeChange(value) {
        const volume = parseInt(value, 10) / 100;
        const el = document.getElementById('bgm-volume-value');
        if (el) el.textContent = value + '%';
        PersistedStore.gameSettings.setVolume('bgm', volume);
        SoundManager.setBGMVolume(volume);
    }

    function onSFXVolumeChange(value) {
        const volume = parseInt(value, 10) / 100;
        const el = document.getElementById('sfx-volume-value');
        if (el) el.textContent = value + '%';
        PersistedStore.gameSettings.setVolume('sfx', volume);
        SoundManager.setSFXVolume(volume);
        SoundManager.playScore();
    }

    function resetAudioSettings() {
        const defaults = { master: 1.0, bgm: 0.7, sfx: 0.8 };
        const m = document.getElementById('master-volume');
        const mv = document.getElementById('master-volume-value');
        const b = document.getElementById('bgm-volume');
        const bv = document.getElementById('bgm-volume-value');
        const s = document.getElementById('sfx-volume');
        const sv = document.getElementById('sfx-volume-value');
        if (m) m.value = defaults.master * 100;
        if (mv) mv.textContent = '100%';
        if (b) b.value = defaults.bgm * 100;
        if (bv) bv.textContent = '70%';
        if (s) s.value = defaults.sfx * 100;
        if (sv) sv.textContent = '80%';

        PersistedStore.gameSettings.setVolume('master', defaults.master);
        PersistedStore.gameSettings.setVolume('bgm', defaults.bgm);
        PersistedStore.gameSettings.setVolume('sfx', defaults.sfx);
        SoundManager.setMasterVolume(defaults.master);
        SoundManager.setBGMVolume(defaults.bgm);
        SoundManager.setSFXVolume(defaults.sfx);
        SoundManager.playScore();
    }

    function setLanguage(lang) {
        if (lang !== 'zh-CN') {
            console.log('[Settings] 语言暂不支持:', lang);
            return;
        }
        document.querySelectorAll('.language-option').forEach(opt => {
            opt.classList.remove('active');
            if (opt.dataset.lang === lang) opt.classList.add('active');
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    async function setDisplayMode(mode, saveToStorage = true) {
        const gameWs = runtimeDeps.getGameWs();
        if (gameWs && gameWs.readyState === WebSocket.OPEN) {
            gameWs.send(JSON.stringify({
                type: 'set_fullscreen',
                fullscreen: mode === 'fullscreen'
            }));
        } else {
            console.error('[Display] WebSocket 未连接，无法设置全屏');
        }

        updateDisplayModeUI(mode === 'fullscreen');

        if (saveToStorage && typeof PersistedStore !== 'undefined') {
            PersistedStore.gameSettings.setDisplayMode(mode);
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function updateDisplayModeUI(isFullscreen) {
        const windowedBtn = document.getElementById('display-windowed');
        const fullscreenBtn = document.getElementById('display-fullscreen');
        if (!windowedBtn || !fullscreenBtn) return;

        if (isFullscreen) {
            windowedBtn.classList.remove('active', 'border-cyan-500');
            windowedBtn.classList.add('border-transparent');
            const wc = windowedBtn.querySelector('.display-check');
            if (wc) wc.style.display = 'none';

            fullscreenBtn.classList.add('active');
            fullscreenBtn.classList.remove('border-transparent');
            fullscreenBtn.classList.add('border-cyan-500');
            const fc = fullscreenBtn.querySelector('.display-check');
            if (fc) fc.style.display = 'block';
        } else {
            fullscreenBtn.classList.remove('active', 'border-cyan-500');
            fullscreenBtn.classList.add('border-transparent');
            const fc = fullscreenBtn.querySelector('.display-check');
            if (fc) fc.style.display = 'none';

            windowedBtn.classList.add('active');
            windowedBtn.classList.remove('border-transparent');
            windowedBtn.classList.add('border-cyan-500');
            const wc = windowedBtn.querySelector('.display-check');
            if (wc) wc.style.display = 'block';
        }
    }

    function onFpsOverlayToggle(enabled) {
        const nextEnabled = !!enabled;
        PersistedStore.gameSettings.setFpsOverlayEnabled(nextEnabled);
        try {
            localStorage.setItem('blockgame_fps_overlay_enabled', nextEnabled ? '1' : '0');
        } catch (e) {}
        if (window.FpsOverlay) window.FpsOverlay.setVisible(nextEnabled);
    }

    function onShowPlayerNumberToggle(enabled) {
        PersistedStore.gameSettings.setShowPlayerNumber(!!enabled);
    }

    function setTrailLengthValue(value, syncInput = true) {
        const nextLength = Math.max(0, Math.min(1000, Math.round(Number(value) || 0)));
        const trailInput = document.getElementById('trail-length-input');
        if (syncInput && trailInput) trailInput.value = nextLength;
        PersistedStore.gameSettings.setTrailLength(nextLength);
        runtimeDeps.applyTrailLengthToActivePlayers(nextLength);
    }

    function onTrailLengthInputChange(value, live = false) {
        const parsed = Number(value);
        if (live && !Number.isFinite(parsed)) return;
        setTrailLengthValue(parsed);
    }

    function stepTrailLength(delta) {
        const trailInput = document.getElementById('trail-length-input');
        const current = trailInput ? Number(trailInput.value) : PersistedStore.gameSettings.getTrailLength();
        setTrailLengthValue((Number.isFinite(current) ? current : 0) + delta);
    }

    function onKeyboardToggle(enabled) {
        ControllerManager.setKeyboardEnabled(enabled);
    }

    function setDifficulty(difficulty) {
        PersistedStore.gameSettings.setDifficulty(difficulty);
        updateDifficultyUI(difficulty);
    }

    function updateDifficultyUI(difficulty) {
        const easyBtn = document.getElementById('difficulty-easy');
        const normalBtn = document.getElementById('difficulty-normal');
        if (!easyBtn || !normalBtn) return;
        easyBtn.classList.remove('selected');
        normalBtn.classList.remove('selected');
        if (difficulty === 'easy') {
            easyBtn.classList.add('selected');
        } else {
            normalBtn.classList.add('selected');
        }
    }

    function handleBack() {
        const qrModal = document.getElementById('qr-modal');
        const settingsModal = document.getElementById('settings-modal');
        const gameModeMenu = document.getElementById('game-mode-menu');
        const coopMenu = document.getElementById('coop-menu');
        const versusMenu = document.getElementById('versus-menu');

        if (qrModal && qrModal.classList.contains('active')) {
            toggleQR();
            return;
        }
        if (settingsModal && settingsModal.classList.contains('active')) {
            toggleSettings();
            return;
        }
        if (
            (coopMenu && coopMenu.classList.contains('visible-menu')) ||
            (versusMenu && versusMenu.classList.contains('visible-menu'))
        ) {
            backToModeSelection();
            return;
        }
        if (gameModeMenu && gameModeMenu.classList.contains('visible-menu')) {
            backToMain();
        }
    }

    return {
        init,
        initRuntimeDeps,
        setServerInfo,
        getControllerUrl,
        generateQRCode,
        resizeQrContentScale,
        resizeOverlayScale,
        updateControlHints,
        toggleQR,
        handleBack,
        switchMenu,
        showModeSelection,
        showCoopLevels,
        showVersusLevels,
        backToModeSelection,
        backToMain,
        toggleSettings,
        loadSettingsUI,
        loadDisplaySettingsUI,
        loadAudioSettingsUI,
        initSettingsTabs,
        onMasterVolumeChange,
        onBGMVolumeChange,
        onSFXVolumeChange,
        resetAudioSettings,
        setLanguage,
        setDisplayMode,
        updateDisplayModeUI,
        onFpsOverlayToggle,
        onShowPlayerNumberToggle,
        setTrailLengthValue,
        onTrailLengthInputChange,
        stepTrailLength,
        onKeyboardToggle,
        setDifficulty,
        updateDifficultyUI
    };
})();

/** index.html onclick 仍使用全局函数名：桥接到 MainMenuUI */
(function exposeMainMenuHtmlHandlers() {
    const M = window.MainMenuUI;
    if (!M) return;
    window.toggleSettings = () => M.toggleSettings();
    window.showModeSelection = () => M.showModeSelection();
    window.showCoopLevels = () => M.showCoopLevels();
    window.showVersusLevels = () => M.showVersusLevels();
    window.backToModeSelection = () => M.backToModeSelection();
    window.backToMain = () => M.backToMain();
    window.loadSettingsUI = () => M.loadSettingsUI();
    window.onMasterVolumeChange = (v) => M.onMasterVolumeChange(v);
    window.onBGMVolumeChange = (v) => M.onBGMVolumeChange(v);
    window.onSFXVolumeChange = (v) => M.onSFXVolumeChange(v);
    window.resetAudioSettings = () => M.resetAudioSettings();
    window.setLanguage = (l) => M.setLanguage(l);
    window.setDisplayMode = (mode, save) => M.setDisplayMode(mode, save);
    window.onFpsOverlayToggle = (e) => M.onFpsOverlayToggle(e);
    window.onShowPlayerNumberToggle = (e) => M.onShowPlayerNumberToggle(e);
    window.setTrailLengthValue = (v, s) => M.setTrailLengthValue(v, s);
    window.onTrailLengthInputChange = (v, live) => M.onTrailLengthInputChange(v, live);
    window.stepTrailLength = (d) => M.stepTrailLength(d);
    window.onKeyboardToggle = (e) => M.onKeyboardToggle(e);
    window.setDifficulty = (d) => M.setDifficulty(d);
})();
