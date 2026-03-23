/**
 * 关卡选择场景：合作/对抗模式入口与各关卡按钮（由 SceneManager 与 mainMenu 互斥挂载）
 */
function SceneLevelSelect() {
    let sceneRoot = null;

    function setInitialPanel(payload) {
        const sub = payload && payload.sub ? payload.sub : 'mode';
        const gameModeMenu = document.getElementById('game-mode-menu');
        const coopMenu = document.getElementById('coop-menu');
        const versusMenu = document.getElementById('versus-menu');
        [gameModeMenu, coopMenu, versusMenu].forEach((el) => {
            if (!el) return;
            el.classList.remove('visible-menu');
            el.classList.add('hidden-menu');
        });
        if (sub === 'coop' && coopMenu) {
            coopMenu.classList.remove('hidden-menu');
            coopMenu.classList.add('visible-menu');
        } else if (sub === 'versus' && versusMenu) {
            versusMenu.classList.remove('hidden-menu');
            versusMenu.classList.add('visible-menu');
        } else if (gameModeMenu) {
            gameModeMenu.classList.remove('hidden-menu');
            gameModeMenu.classList.add('visible-menu');
        }
    }

    return {
        mount(payload = {}) {
            const tpl = document.getElementById('scene-levelSelect-tpl');
            const container = document.getElementById('scene-container');
            if (!tpl || !container) {
                console.error('[SceneLevelSelect] 缺少 template 或 scene-container');
                return;
            }
            const clone = tpl.content.cloneNode(true);
            sceneRoot = clone.querySelector('#scene-levelSelect') || clone.firstElementChild;
            container.appendChild(clone);

            setInitialPanel(payload);

            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            if (window.MainMenuUI && typeof MainMenuUI.updateControlHints === 'function') {
                MainMenuUI.updateControlHints();
            }
        },
        unmount() {
            const container = document.getElementById('scene-container');
            if (sceneRoot && sceneRoot.parentNode) {
                sceneRoot.parentNode.removeChild(sceneRoot);
            } else if (container) {
                const orphan = container.querySelector('#scene-levelSelect');
                if (orphan && orphan.parentNode) {
                    orphan.parentNode.removeChild(orphan);
                }
            }
            sceneRoot = null;
        }
    };
}

if (typeof window !== 'undefined') {
    window.SceneLevelSelect = SceneLevelSelect;
}

// ---------- 关卡入口（原 mainEntry.selectLevel；与主菜单预览通过 BlockGameMainMenu.persistLobbyPlayerColors 协作） ----------

/** 合作/竞技玩法类型 → SceneManager 注册的 sceneId（关卡号在 payload.level） */
const SELECT_LEVEL_GAME_TO_SCENE = {
    color: 'gameColorCollect',
    redline: 'gameRedLine',
    dangerousPassage: 'gameDangerousPassage',
    competeColor: 'competeColorCollect',
    competeRedLine: 'competeRedLine',
    competeDangerousPassage: 'competeDangerousPassage'
};

function selectLevel(gameType, level) {
    console.log('Selected Game:', gameType, 'Level:', level);

    if (window.BlockGameMainMenu && typeof window.BlockGameMainMenu.persistLobbyPlayerColors === 'function') {
        window.BlockGameMainMenu.persistLobbyPlayerColors();
        console.log('保存玩家颜色完成');
    } else {
        console.warn('[LevelSelect] persistLobbyPlayerColors 未就绪，跳过颜色存档');
    }

    const sceneId = SELECT_LEVEL_GAME_TO_SCENE[gameType];
    const levelNum = Number(level);
    if (!sceneId || levelNum < 1 || levelNum > 3 || levelNum !== Math.floor(levelNum)) {
        alert('关卡不存在！');
        return;
    }

    const payload = { mode: 'coop', level: levelNum };
    if (!SceneManager?.enter?.(sceneId, payload)) {
        console.error('[selectLevel] 无法进入场景:', sceneId, payload);
    }
}

window.selectLevel = selectLevel;
