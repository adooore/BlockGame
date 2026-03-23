/**
 * 场景管理器 - 单页多场景切换
 * 负责场景注册、enter/unmount/mount 生命周期，不包含具体场景实现
 */
const SceneManager = (function () {
    const scenes = {};
    let currentSceneId = null;
    let currentPayload = null;

    function register(sceneId, api) {
        if (!sceneId || typeof api !== 'object' || typeof api.mount !== 'function') {
            console.warn('[SceneManager] 无效场景注册:', sceneId);
            return;
        }
        scenes[sceneId] = api;
        console.log('[SceneManager] 注册场景:', sceneId);
    }

    function enter(sceneId, payload = {}) {
        if (!scenes[sceneId]) {
            console.warn('[SceneManager] 未注册的场景:', sceneId);
            return false;
        }

        // 1. 卸载当前场景
        if (currentSceneId && scenes[currentSceneId] && typeof scenes[currentSceneId].unmount === 'function') {
            try {
                scenes[currentSceneId].unmount();
            } catch (e) {
                console.error('[SceneManager] unmount 异常:', currentSceneId, e);
            }
            currentSceneId = null;
            currentPayload = null;
        }

        // 2. 挂载新场景
        currentSceneId = sceneId;
        currentPayload = payload;
        try {
            scenes[sceneId].mount(payload);
            console.log('[SceneManager] 进入场景:', sceneId, payload);
        } catch (e) {
            console.error('[SceneManager] mount 异常:', sceneId, e);
            currentSceneId = null;
            currentPayload = null;
            return false;
        }
        return true;
    }

    function getCurrentSceneId() {
        return currentSceneId;
    }

    function getPayload() {
        return currentPayload;
    }

    return {
        register,
        enter,
        getCurrentSceneId,
        getPayload
    };
})();

if (typeof window !== 'undefined') {
    window.SceneManager = SceneManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SceneManager };
}
