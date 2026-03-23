/**
 * 集中注册 SceneManager 场景并在入口就绪后启动 init（须在 mainEntry.js 之后加载，以使用 mountMainMenu / init 等全局定义）
 */
(function registerAllScenesAndStart() {
    if (typeof SceneManager === 'undefined') {
        console.error('[registerScenes] SceneManager 未加载');
        return;
    }

    SceneManager.register('mainMenu', { mount: mountMainMenu, unmount: unmountMainMenu });
    if (typeof SceneLevelSelect === 'function') {
        SceneManager.register('levelSelect', SceneLevelSelect());
    }
    if (typeof SceneColorCollect === 'function') {
        SceneManager.register('gameColorCollect', SceneColorCollect());
    }
    if (typeof SceneRedLine === 'function') {
        SceneManager.register('gameRedLine', SceneRedLine());
    }
    if (typeof SceneDangerousPassage === 'function') {
        SceneManager.register('gameDangerousPassage', SceneDangerousPassage());
    }
    if (typeof SceneCompeteColorCollect === 'function') {
        SceneManager.register('competeColorCollect', SceneCompeteColorCollect());
    }
    if (typeof SceneCompeteRedLine === 'function') {
        SceneManager.register('competeRedLine', SceneCompeteRedLine());
    }
    if (typeof SceneCompeteDangerousPassage === 'function') {
        SceneManager.register('competeDangerousPassage', SceneCompeteDangerousPassage());
    }

    if (typeof init === 'function') {
        init();
    } else {
        console.error('[registerScenes] init 未定义，请确认 mainEntry.js 已先于本脚本加载');
    }
})();
