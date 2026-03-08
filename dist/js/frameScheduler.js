/**
 * 统一帧调度器
 * - 逻辑层：固定步长（默认 60Hz）
 * - 渲染层：固定 60fps
 */
const FrameScheduler = (function() {
    function getStats() {
        if (typeof window === 'undefined') return null;
        if (!window.__frameSchedulerStats) {
            window.__frameSchedulerStats = {
                updates: 0,
                renders: 0
            };
        }
        return window.__frameSchedulerStats;
    }

    function create(options = {}) {
        const fixedHz = Number(options.fixedHz) > 0 ? Number(options.fixedHz) : 60;
        const fixedStepSec = 1 / fixedHz;
        const fixedStepMs = fixedStepSec * 1000;
        const maxFrameDeltaMs = Number(options.maxFrameDeltaMs) > 0 ? Number(options.maxFrameDeltaMs) : 50;
        const maxCatchUpSteps = Number(options.maxCatchUpSteps) > 0 ? Number(options.maxCatchUpSteps) : 5;
        const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : function() {};
        const onRender = typeof options.onRender === 'function' ? options.onRender : function() {};
        const stats = getStats();

        let running = false;
        let paused = false;
        let rafId = null;
        let accumulatorMs = 0;
        let lastTimestampMs = 0;

        function loop(timestampMs) {
            if (!running) return;
            if (!lastTimestampMs) {
                lastTimestampMs = timestampMs;
            }

            let frameDeltaMs = timestampMs - lastTimestampMs;
            lastTimestampMs = timestampMs;

            if (paused) {
                accumulatorMs = 0;
                rafId = requestAnimationFrame(loop);
                return;
            }

            if (frameDeltaMs < 0) frameDeltaMs = 0;
            if (frameDeltaMs > maxFrameDeltaMs) frameDeltaMs = maxFrameDeltaMs;

            accumulatorMs += frameDeltaMs;
            let steps = 0;
            while (accumulatorMs >= fixedStepMs && steps < maxCatchUpSteps) {
                onUpdate(fixedStepSec);
                if (stats) stats.updates++;
                accumulatorMs -= fixedStepMs;
                steps++;
            }

            const alpha = fixedStepMs > 0 ? Math.max(0, Math.min(1, accumulatorMs / fixedStepMs)) : 1;
            onRender(alpha, frameDeltaMs / 1000);
            if (stats) stats.renders++;

            rafId = requestAnimationFrame(loop);
        }

        function start() {
            if (running) return;
            running = true;
            paused = false;
            accumulatorMs = 0;
            lastTimestampMs = 0;
            rafId = requestAnimationFrame(loop);
        }

        function stop() {
            running = false;
            paused = false;
            accumulatorMs = 0;
            lastTimestampMs = 0;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }

        function pause() {
            paused = true;
        }

        function resume() {
            paused = false;
            accumulatorMs = 0;
            lastTimestampMs = 0;
        }

        return {
            start,
            stop,
            pause,
            resume,
            getFixedHz: () => fixedHz,
            isRunning: () => running,
            isPaused: () => paused
        };
    }

    return { create };
})();

// 导出（兼容浏览器和 Node.js）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrameScheduler;
}
