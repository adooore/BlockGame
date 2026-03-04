/**
 * 全局 FPS 浮层（右上角）
 * 用于统一所有页面的帧率显示，不与具体页面 UI 耦合。
 */
(function initGlobalFpsOverlay() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__fpsOverlayInitialized) return;
    window.__fpsOverlayInitialized = true;
    const FPS_OVERLAY_STORAGE_KEY = 'blockgame_fps_overlay_enabled';
    let visible = true;
    let rootRef = null;

    function getStoredVisible() {
        try {
            const simpleFlag = localStorage.getItem(FPS_OVERLAY_STORAGE_KEY);
            if (simpleFlag === '0') return false;
            if (simpleFlag === '1') return true;

            const raw = localStorage.getItem('blockgame_data');
            if (!raw) return true;
            const parsed = JSON.parse(raw);
            return parsed?.gameSettings?.fpsOverlayEnabled !== false;
        } catch (e) {
            return true;
        }
    }

    visible = getStoredVisible();

    window.FpsOverlay = {
        show() {
            visible = true;
            if (rootRef) rootRef.style.display = 'block';
        },
        hide() {
            visible = false;
            if (rootRef) rootRef.style.display = 'none';
        },
        setVisible(nextVisible) {
            visible = !!nextVisible;
            try {
                localStorage.setItem(FPS_OVERLAY_STORAGE_KEY, visible ? '1' : '0');
            } catch (e) {}
            if (rootRef) rootRef.style.display = visible ? 'block' : 'none';
        }
    };

    function mount() {
        if (!document.body) return null;
        const root = document.createElement('div');
        root.id = 'global-fps-overlay';
        root.style.position = 'fixed';
        root.style.top = '12px';
        root.style.right = '12px';
        root.style.padding = '6px 10px';
        root.style.borderRadius = '8px';
        root.style.border = '1px solid rgba(0, 242, 255, 0.45)';
        root.style.background = 'rgba(0, 0, 0, 0.45)';
        root.style.color = '#00f2ff';
        root.style.fontFamily = "'JetBrains Mono', 'Consolas', monospace";
        root.style.fontSize = '12px';
        root.style.letterSpacing = '0.08em';
        root.style.textShadow = '0 0 8px rgba(0, 242, 255, 0.8)';
        root.style.zIndex = '99999';
        root.style.pointerEvents = 'none';
        root.style.display = visible ? 'block' : 'none';
        root.textContent = '屏幕: -- | 游戏渲染: -- | 逻辑: --';
        document.body.appendChild(root);
        rootRef = root;
        return root;
    }

    function start(root) {
        let last = performance.now();
        let rafFrames = 0;
        let prevRenderCount = (window.__frameSchedulerStats && window.__frameSchedulerStats.renders) || 0;
        let prevUpdateCount = (window.__frameSchedulerStats && window.__frameSchedulerStats.updates) || 0;

        function tick(now) {
            rafFrames += 1;
            const elapsed = now - last;
            if (elapsed >= 500) {
                const rafFps = Math.round((rafFrames * 1000) / elapsed);

                const stats = window.__frameSchedulerStats || { renders: 0, updates: 0 };
                const renderDelta = stats.renders - prevRenderCount;
                const updateDelta = stats.updates - prevUpdateCount;
                const gameRenderFps = Math.round((renderDelta * 1000) / elapsed);
                const gameLogicFps = Math.round((updateDelta * 1000) / elapsed);

                root.textContent = `屏幕: ${rafFps} | 游戏渲染: ${gameRenderFps} | 逻辑: ${gameLogicFps}`;

                prevRenderCount = stats.renders;
                prevUpdateCount = stats.updates;
                rafFrames = 0;
                last = now;
            }
            requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    const mountedRoot = mount();
    if (mountedRoot) {
        start(mountedRoot);
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            const delayedRoot = mount();
            if (delayedRoot) start(delayedRoot);
        }, { once: true });
    }
})();
