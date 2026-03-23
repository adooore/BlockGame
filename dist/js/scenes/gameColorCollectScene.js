/**
 * 颜色收集场景模块 - 供 SceneManager 挂载
 * 逻辑来自 gameColorCollect.html，适配单页场景切换
 */
(function () {
    'use strict';

    const LEVEL_MODES = {
        1: '基础模式',
        2: '动态目标',
        3: '极限模式'
    };

    const SCANLINE_STORAGE_KEY = 'colorCollectScanlineEnabled';
    const BASE_UI_WIDTH = 1280;
    const INVINCIBLE_DURATION = 120;
    const REVIVE_PENALTY = 60;
    const SPAWN_OFFSETS = [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 }
    ];

    function mount(payload) {
        const currentLevel = (payload && payload.level) || 1;
        const levelNames = { 1: '颜色收集 I', 2: '颜色收集 II', 3: '颜色收集 III' };
        const levelSubtitles = {
            1: '基础模式 - 固定目标与障碍',
            2: '进阶模式 - 动态目标颜色',
            3: '极限模式 - 双重颜色变换'
        };

        // 1. Clone template and append to scene-container
        const tpl = document.getElementById('scene-gameColorCollect-tpl');
        const container = document.getElementById('scene-container');
        if (!tpl || !container) {
            console.error('[gameColorCollectScene] template or container not found');
            return;
        }
        const clone = tpl.content.cloneNode(true);
        const sceneRoot = clone.querySelector('#scene-gameColorCollect') || clone.firstElementChild;
        container.appendChild(clone);
        container.classList.add('active');

        // 2. Create loading screen
        const loadingScreen = LoadingAnimations.create({
            title: `颜色收集 · ${LEVEL_MODES[currentLevel] || '基础模式'}`,
            subtitle: '🤝 合作模式',
            subtitle2: '携手通关 · 共同挑战',
            minDuration: 1000,
            showControls: true,
            onComplete: () => {
                SoundManager.playGameBGM();
                SoundManager.initBGMAutoplay();
                startGame();
            }
        });

        // 3. Config from DEFAULT_CONFIG (player.js)
        const PLAYER_DEFAULTS = DEFAULT_CONFIG;
        const config = {
            gridSize: 12,
            tileGap: 6,
            playerSizeRatio: 0.5,
            moveSpeed: PLAYER_DEFAULTS.moveSpeed,
            dashMultiplier: PLAYER_DEFAULTS.dashMultiplier,
            dashDuration: PLAYER_DEFAULTS.dashDuration,
            dashCooldown: PLAYER_DEFAULTS.dashCooldown,
            jumpPower: PLAYER_DEFAULTS.jumpPower,
            gravity: PLAYER_DEFAULTS.gravity,
            trailLength: PLAYER_DEFAULTS.trailLength,
            maxWaves: 9,
            initialCyan: 12,
            cyanDecrement: 1,
            minCyan: 6,
            initialPink: 5,
            pinkIncrement: 2,
            maxPink: 25,
            colors: { bg: '#050505', grid: '#1a1a1a', cyan: '#22d3ee', pink: '#d946ef' },
            collectibleColors: ['cyan', 'yellow', 'purple', 'orange'],
            colorHex: { cyan: '#22d3ee', yellow: '#facc15', purple: '#a78bfa', orange: '#fb923c', pink: '#d946ef', red: '#ef4444', gray: '#888888' },
            colorNames: { cyan: '青色', yellow: '黄色', purple: '紫色', orange: '橙色', pink: '粉色', red: '红色', gray: '灰色' },
            wrongColorPenalty: 5,
            dangerColors: ['pink', 'red', 'gray'],
            dangerColorHex: { pink: '#ff00ff', red: '#ff4444', gray: '#888888' },
            dangerColorNames: { pink: '粉色', red: '红色', gray: '灰色' },
            allColors: ['cyan', 'yellow', 'purple', 'orange', 'pink', 'red', 'gray']
        };

        let targetColor = 'cyan';
        let dangerColor = 'pink';
        const ALL_COLORS = PersistedStore.playerColors.getAllColors();
        const GAME_PLAYER_COLORS = [ALL_COLORS[0], ALL_COLORS[1], ALL_COLORS[2], ALL_COLORS[3]];

        // 4. Initialize systems from GameUtils
        const gridSys = GridSystem.create({
            gridSize: config.gridSize,
            tileGap: config.tileGap,
            colors: config.colors,
            visual: {
                glowBase: 8.7,
                glowPulse: 3.5,
                normalLineWidth: 2.0,
                highlightLineWidth: 3.3,
                normalFillAlpha: 0.10,
                highlightFillAlpha: 0.18
            }
        });
        const waveSys = WaveSystem.create({
            maxWaves: config.maxWaves,
            initialTarget: config.initialCyan,
            targetDecrement: config.cyanDecrement,
            minTarget: config.minCyan,
            initialDanger: config.initialPink,
            dangerIncrement: config.pinkIncrement,
            maxDanger: config.maxPink
        });
        const floatingText = GameUtils.createFloatingTextSystem();
        const menuSystem = GameUtils.createMenuSystem();

        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const timerElement = document.getElementById('timer');
        const bestTimeElement = document.getElementById('best-time');
        const speedBodyEl = document.getElementById('speed-boost-body');

        let gameState = 'waiting';
        let gameTime = 0;
        let gameStartTime = 0;
        let bestTime = 0;
        let invincibleTimer = 0;
        let penaltyTime = 0;
        let purePlayTime = 0;
        let width, height;
        let speedBoost = null;
        let speedFxTimer = 0; // 用于“赛车加速”的短暂视觉冲刺效果
        let speedFxColor = '#00f2ff';
        const SPEED_FX_DURATION = 18; // 帧数（和 update 的 dtScale 大致对应）
        let lastInputSpeedMult = 1; // UI 用：如果按了精细移动(N)，speedMult 会变

        const gameUI = GameUtils.createGameUI(document.getElementById('game-ui-container'));

        function updateControllerUI() {
            gameUI.updateControllerUI(ControllerManager);
        }

        const BASE_MOVE_BODY_LENGTHS_PER_SEC = (typeof window !== 'undefined' && window.PLAYER_FEEL_METRICS && Number.isFinite(window.PLAYER_FEEL_METRICS.moveBodyLengthsPerSecond))
            ? window.PLAYER_FEEL_METRICS.moveBodyLengthsPerSecond
            : 15.75;

        // 用真实的“基准体感速度”重建一遍系统（保证跨分辨率一致）
        speedBoost = GameUtils.createSpeedBoostSystem({
            minBodyPerSec: 10,
            maxBodyPerSec: 30,
            stepsToMax: 16,
            baseMoveBodyLengthsPerSecond: BASE_MOVE_BODY_LENGTHS_PER_SEC
        });

        function syncSpeedBoostUI() {
            if (!speedBodyEl) return;
            const bodyPerSec = speedBoost.getBodyPerSec(lastInputSpeedMult);
            speedBodyEl.textContent = bodyPerSec.toFixed(2);
        }

        syncSpeedBoostUI();

        // 5. GameWebSocket.init
        GameWebSocket.init({
            loadingScreen: loadingScreen,
            onConfigLoaded: (gameData) => {
                initControllerAfterConfig();
                const records = PersistedStore._cache?.records?.eatAndAvoid;
                if (records?.bestTime) {
                    bestTime = records.bestTime;
                    bestTimeElement.textContent = GameUtils.formatBestTime(bestTime);
                }
                loadBestTime();
            },
            onControllerUpdate: updateControllerUI
        });
        GameWebSocket.setupUnloadHandler();

        async function loadBestTime() {
            bestTime = await PersistedStore.records.getBestTime('eatAndAvoid');
            bestTimeElement.textContent = GameUtils.formatBestTime(bestTime);
        }

        function createGamePlayer(id, previousPlayer) {
            const fromPrevious = previousPlayer?.colors ? { main: previousPlayer.colors.main, glow: previousPlayer.colors.glow, core: previousPlayer.colors.core } : null;
            const savedColor = fromPrevious || PersistedStore.playerColors.getPlayerColor(id);
            const colorData = savedColor || GAME_PLAYER_COLORS[(id - 1) % GAME_PLAYER_COLORS.length];
            const { tileSize } = gridSys;
            const p = createPlayer(id, 0, 0);
            syncPlayerMovementConfig(p, tileSize * config.playerSizeRatio);
            p.colors = { main: colorData.main, glow: colorData.glow, core: colorData.core };
            resetPlayerPosition(p, id);
            console.log(`[Game] 玩家 ${id} 加入游戏，颜色:`, colorData.name || colorData.main);
            return p;
        }

        function removeGamePlayer(id) {
            console.log(`[Game] 玩家 ${id} 离开游戏`);
        }

        function resetPlayerPosition(p, playerId) {
            p.trail = [];
            const id = playerId || p.id || 1;
            const offset = SPAWN_OFFSETS[(id - 1) % SPAWN_OFFSETS.length];
            p.x = width / 2 - p.width / 2 + offset.x * gridSys.tileSize * 1.5;
            p.y = height / 2 - p.height / 2 + offset.y * gridSys.tileSize * 1.5;
            p.prevX = p.x;
            p.prevY = p.y;
            p.z = 0;
            p.prevZ = 0;
            p.vz = 0;
        }

        function updateTargetColorUI() {
            const hex = config.colorHex[targetColor];
            const name = config.colorNames[targetColor];
            const box = document.getElementById('target-color-box');
            const indicator = document.getElementById('target-color-indicator');
            const nameEl = document.getElementById('target-color-name');
            if (!box) return;
            box.style.borderColor = hex;
            indicator.style.background = hex;
            indicator.style.boxShadow = `0 0 12px ${hex}`;
            nameEl.textContent = name;
            nameEl.style.color = hex;
            nameEl.style.textShadow = `0 0 6px ${hex}`;
        }

        function updateDangerColorUI() {
            const hex = config.colorHex[dangerColor] || '#ff00ff';
            const name = config.colorNames[dangerColor] || '未知';
            const box = document.getElementById('danger-color-box');
            const indicator = document.getElementById('danger-color-indicator');
            const nameEl = document.getElementById('danger-color-name');
            if (!box) return;
            box.style.borderColor = hex;
            indicator.style.background = hex;
            indicator.style.boxShadow = `0 0 10px ${hex}`;
            nameEl.textContent = name;
            nameEl.style.color = hex;
        }

        function initLevelUI() {
            const levelTitle = document.getElementById('level-title');
            const dangerBox = document.getElementById('danger-color-box');
            if (levelTitle) levelTitle.textContent = `${levelNames[currentLevel]} - ${levelSubtitles[currentLevel]}`;
            if (dangerBox) dangerBox.style.display = 'inline-block';
            updateDangerColorUI();
        }

        function updateDebugInfo() {
            const waveNumEl = document.getElementById('wave-num');
            const colorCountsEl = document.getElementById('color-counts');
            if (!waveNumEl) return;
            waveNumEl.textContent = waveSys.waveNumber;
            const colorsToShow = currentLevel >= 3 ? config.allColors : config.collectibleColors;
            let html = '';
            colorsToShow.forEach(color => {
                const count = gridSys.countTiles(color);
                const hex = config.colorHex[color];
                const isTarget = color === targetColor;
                const isDanger = color === dangerColor;
                const marker = isTarget ? '★' : (isDanger ? '⚠' : '■');
                html += `<span style="color: ${hex}; text-shadow: 0 0 5px ${hex}; ${isTarget || isDanger ? 'font-weight: bold;' : ''}">${marker}</span> ${count} `;
            });
            if (currentLevel < 3) {
                html += '<br>';
                config.dangerColors.forEach(color => {
                    const count = gridSys.countTiles(color);
                    const hex = config.colorHex[color];
                    const isDanger = color === dangerColor;
                    html += `<span style="color: ${hex}; text-shadow: 0 0 5px ${hex}; ${isDanger ? 'font-weight: bold;' : ''}">${isDanger ? '⚠' : '■'}</span> ${count} `;
                });
            }
            if (colorCountsEl) colorCountsEl.innerHTML = html;
        }

        function isDangerColor(type) {
            return type === dangerColor;
        }

        function triggerNewWave() {
            let availableColors;
            if (currentLevel === 3) {
                availableColors = [...config.allColors];
                targetColor = GameUtils.randomChoice(availableColors);
                dangerColor = GameUtils.randomChoice(availableColors.filter(c => c !== targetColor));
                updateDangerColorUI();
            } else if (currentLevel === 2) {
                availableColors = config.collectibleColors;
                targetColor = GameUtils.randomChoice(availableColors);
                dangerColor = 'pink';
            } else {
                availableColors = config.collectibleColors;
                targetColor = 'cyan';
                dangerColor = 'pink';
            }
            updateTargetColorUI();

            const allPlayers = ControllerManager.getPlayers();
            waveSys.triggerWave(gridSys, {
                targetColors: availableColors,
                dangerColors: [dangerColor],
                currentTarget: targetColor,
                currentDanger: dangerColor,
                players: Object.values(allPlayers),
                dynamicTarget: currentLevel >= 2,
                dynamicDanger: currentLevel >= 3,
                otherColorRatio: 0.6
            });

            gridSys.clearAll();
            const occupied = gridSys.getOccupiedTiles(Object.values(allPlayers));
            const availableTiles = gridSys.getAvailableTiles(occupied);
            const shuffled = GameUtils.shuffle([...availableTiles]);

            const { targetCount, dangerCount } = waveSys.getWaveConfig();
            const waveProgress = (waveSys.waveNumber - 1) / (config.maxWaves - 1);
            const otherColorRatio = 0.6 + waveProgress * 0.4;
            const otherColorCount = Math.max(1, Math.floor(targetCount * otherColorRatio));

            let idx = 0;
            const collectibleTiles = [];
            const actualTarget = Math.min(targetCount, shuffled.length - idx);
            for (let i = 0; i < actualTarget && idx < shuffled.length; i++, idx++) {
                shuffled[idx].type = targetColor;
                shuffled[idx].pulse = 0;
                collectibleTiles.push(shuffled[idx]);
            }

            if (currentLevel >= 2) {
                const otherColors = availableColors.filter(c => c !== targetColor && c !== dangerColor);
                otherColors.forEach(color => {
                    const count = Math.min(otherColorCount, shuffled.length - idx);
                    for (let i = 0; i < count && idx < shuffled.length; i++, idx++) {
                        shuffled[idx].type = color;
                        shuffled[idx].pulse = 0;
                        collectibleTiles.push(shuffled[idx]);
                    }
                });
            }

            const safeZone = new Set();
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            collectibleTiles.forEach(tile => {
                directions.forEach(([dr, dc]) => {
                    const nr = tile.row + dr;
                    const nc = tile.col + dc;
                    if (nr >= 0 && nr < config.gridSize && nc >= 0 && nc < config.gridSize) {
                        safeZone.add(`${nr},${nc}`);
                    }
                });
            });

            let dangerPlaced = 0;
            for (let i = idx; i < shuffled.length && dangerPlaced < dangerCount; i++) {
                const tile = shuffled[i];
                if (!safeZone.has(`${tile.row},${tile.col}`)) {
                    tile.type = dangerColor;
                    tile.pulse = 0;
                    dangerPlaced++;
                }
            }

            if (debugPanel) debugPanel.logWave(waveSys.waveNumber, actualTarget, dangerPlaced);
            invincibleTimer = INVINCIBLE_DURATION;
        }

        function checkAndRefresh() {
            if (gameState !== 'playing') return;
            const targetCount = gridSys.countTiles(targetColor);
            const countEl = document.getElementById('target-color-count');
            if (countEl) countEl.textContent = `剩余: ${targetCount}`;
            if (targetCount === 0) {
                if (waveSys.isComplete()) {
                    victory();
                } else {
                    triggerNewWave();
                }
            }
        }

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;

            const dims = gridSys.resize(width, height);
            const allPlayers = ControllerManager.getPlayers();
            Object.values(allPlayers).forEach(p => {
                syncPlayerMovementConfig(p, dims.tileSize * config.playerSizeRatio);
            });

            const uiScale = Math.max(0.8, Math.min(2, width / BASE_UI_WIDTH));
            const uiOverlay = document.getElementById('ui-overlay');
            if (uiOverlay) uiOverlay.style.transform = `scale(${uiScale})`;
            if (gameScreens) gameScreens.setScale(uiScale);
            if (pauseMenu) pauseMenu.setScale(uiScale);
        }

        function startGame() {
            if (gameState === 'waiting') {
                gameState = 'playing';
                gameStartTime = Date.now();
                invincibleTimer = INVINCIBLE_DURATION;
            }
        }

        let menuInputThrottle = false;
        let menuInputLocked = false;
        let prevMenuInput = { joystick: { x: 0, y: 0 }, buttons: { N: false, S: false, E: false, W: false } };

        function resetMenuInputState() {
            menuInputLocked = true;
            menuInputThrottle = true;
        }

        function checkMenuInput() {
            const input = ControllerManager.getInput(1);
            if (!input) return;
            const deadzone = 0.3;
            const hasAnyInput = Math.abs(input.joystick.x) > deadzone || Math.abs(input.joystick.y) > deadzone ||
                input.buttons.N || input.buttons.S || input.buttons.E || input.buttons.W;

            if (menuInputLocked) {
                if (!hasAnyInput) {
                    menuInputLocked = false;
                    menuInputThrottle = false;
                    prevMenuInput = { joystick: { x: 0, y: 0 }, buttons: { N: false, S: false, E: false, W: false } };
                }
                return;
            }

            const newUp = input.joystick.y < -deadzone;
            const newDown = input.joystick.y > deadzone;
            const oldUp = prevMenuInput.joystick.y < -deadzone;
            const oldDown = prevMenuInput.joystick.y > deadzone;

            if (!menuInputThrottle) {
                if (newUp && !oldUp) {
                    menuSystem.moveUp();
                    menuInputThrottle = true;
                    setTimeout(() => menuInputThrottle = false, 150);
                }
                if (newDown && !oldDown) {
                    menuSystem.moveDown();
                    menuInputThrottle = true;
                    setTimeout(() => menuInputThrottle = false, 150);
                }
            }

            if (input.buttons.W && !prevMenuInput.buttons.W) {
                menuSystem.confirm();
            }
            prevMenuInput = { joystick: { ...input.joystick }, buttons: { ...input.buttons } };
        }

        const keydownHandler = (e) => {
            if (gameState === 'waiting') startGame();
        };
        window.addEventListener('keydown', keydownHandler);

        function update(fixedDt) {
            if (pauseMenu) pauseMenu.pollGamepadStart();
            if (pauseMenu && pauseMenu.isPaused) return;
            if (gameState !== 'playing') return;

            const dtScale = fixedDt * 60;
            if (speedFxTimer > 0) speedFxTimer = Math.max(0, speedFxTimer - dtScale);
            if (gameStartTime > 0) {
                purePlayTime = (Date.now() - gameStartTime) / 1000;
                gameTime = purePlayTime + penaltyTime;
                timerElement.textContent = GameUtils.formatTime(gameTime);
                const playTimeEl = document.getElementById('play-time');
                const penaltyEl = document.getElementById('penalty-time-display');
                if (playTimeEl) playTimeEl.textContent = GameUtils.formatTime(purePlayTime);
                if (penaltyEl) penaltyEl.textContent = penaltyTime > 0 ? `+${penaltyTime}s` : '+0s';
            }

            const players = ControllerManager.getPlayers();
            let uiSpeedMult = 1;
            Object.values(players).forEach(p => {
                const input = ControllerManager.getInput(p.id);
                const { speedMult } = handlePlayerInput(p, input, {
                    onJump: () => SoundManager.playJump(),
                    onDash: () => SoundManager.playDash()
                }, {
                    enablePreciseMovement: true,
                    preciseSpeedMultiplier: DEFAULT_CONFIG.preciseSpeedMultiplier
                });
                uiSpeedMult = Math.max(uiSpeedMult, speedMult);
                const { gridX, gridY, gridTotalDim } = gridSys;
                updatePlayerMovement(p, {
                    speedMult: speedMult * speedBoost.getBoostMult(),
                    dtScale,
                    bounds: { minX: gridX, maxX: gridX + gridTotalDim - p.width, minY: gridY, maxY: gridY + gridTotalDim - p.height },
                    onLand: () => SoundManager.playLand()
                });
            });
            lastInputSpeedMult = uiSpeedMult;
            syncSpeedBoostUI();

            if (invincibleTimer > 0) invincibleTimer = Math.max(0, invincibleTimer - dtScale);
            Object.values(players).forEach(p => checkPlayerCollision(p));

            gridSys.grid.forEach(t => t.pulse += 0.05 * dtScale);
            updateDebugInfo();
            checkAndRefresh();
        }

        function checkPlayerCollision(p) {
            if (p.z >= 1) return;
            const { gridX, gridY, tileSize } = gridSys;
            const cx = p.x + p.width / 2;
            const cy = p.y + p.height / 2;
            const col = Math.floor((cx - gridX) / (tileSize + config.tileGap));
            const row = Math.floor((cy - gridY) / (tileSize + config.tileGap));

            if (row >= 0 && row < config.gridSize && col >= 0 && col < config.gridSize) {
                const tile = gridSys.grid.find(t => t.row === row && t.col === col);
                if (tile && tile.type !== 'none') {
                    if (isDangerColor(tile.type) && invincibleTimer <= 0) {
                        speedBoost.onPenalty();
                        speedFxTimer = 0;
                        syncSpeedBoostUI();
                        gameOver();
                        return;
                    } else if (!isDangerColor(tile.type) && config.colorHex[tile.type]) {
                        const pos = gridSys.getTilePosition(row, col);
                        if (tile.type === targetColor) {
                            tile.type = 'none';
                            const { increased } = speedBoost.onCorrect();
                            syncSpeedBoostUI();
                            if (increased) {
                                speedFxTimer = SPEED_FX_DURATION;
                                speedFxColor = config.colorHex[targetColor];
                            }
                            const bodyPerSec = speedBoost.getBodyPerSec(lastInputSpeedMult);
                            floatingText.show(`冲刺 ${bodyPerSec.toFixed(0)} 身位/s`, config.colorHex[targetColor], pos.centerX, pos.y, {
                                vy: -4.4,
                                fontSize: 22,
                                duration: 35
                            });
                            SoundManager.playScore();
                        } else {
                            tile.type = 'none';
                            speedBoost.onPenalty();
                            speedFxTimer = 0;
                            syncSpeedBoostUI();
                            penaltyTime += config.wrongColorPenalty;
                            floatingText.show(`+${config.wrongColorPenalty}秒 颜色错误!`, '#ff6b6b', pos.centerX, pos.y);
                            SoundManager.playError();
                            ControllerManager.vibrateLight();
                        }
                    }
                }
            }
        }

        function draw(alpha) {
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = config.colors.bg;
            ctx.fillRect(0, 0, width, height);

            gridSys.drawGridLines(ctx);
            gridSys.drawTiles(ctx, (tile) => ({
                color: config.colorHex[tile.type] || config.colors.cyan,
                isHighlight: tile.type === targetColor,
                isDanger: isDangerColor(tile.type)
            }));

            Object.values(ControllerManager.getPlayers()).forEach(p => {
                drawPlayerSprite(ctx, p, {
                    alpha: alpha || 1,
                    invincible: invincibleTimer > 0,
                    shadowFill: 'rgba(0,0,0,0.6)',
                    glowBlurBase: 10,
                    glowBlurJumpDivisor: 6,
                    invinciblePulseMs: 50
                });
            });

            if (speedFxTimer > 0) {
                const t = speedFxTimer / SPEED_FX_DURATION; // 1 -> 刚触发, 0 -> 衰减结束
                const outerRFactor = 0.62 + 1.05 * (1 - t);
                Object.values(ControllerManager.getPlayers()).forEach(p => {
                    if (p.z >= 1) return;
                    const cx = p.x + p.width / 2;
                    const cy = p.y + p.height / 2;
                    const r = p.width * outerRFactor;
                    ctx.save();
                    ctx.globalAlpha = (0.08 + 0.25 * t);
                    ctx.strokeStyle = speedFxColor;
                    ctx.lineWidth = 2 + 3 * t;
                    ctx.shadowBlur = 16 + 16 * t;
                    ctx.shadowColor = speedFxColor;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.lineWidth = 1 + 2 * t;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                });
            }

            floatingText.draw(ctx);
            floatingText.update();

            if (gameState === 'gameover' || gameState === 'victory') {
                checkMenuInput();
            }
        }

        function gameOver() {
            gameState = 'gameover';
            ControllerManager.vibrateStrong();
            gameScreens.showGameOver({
                totalTime: Math.floor(gameTime),
                playTime: Math.floor(purePlayTime),
                penaltyTime: Math.floor(penaltyTime),
                bestTime: bestTime
            });
            if (typeof ControlHint !== 'undefined') ControlHint.hide();
            resetMenuInputState();
        }

        function victory() {
            gameState = 'victory';
            const finalTime = Math.floor(gameTime);
            const finalPlayTime = Math.floor(purePlayTime);
            const finalPenalty = Math.floor(penaltyTime);

            if (bestTime === 0 || finalTime < bestTime) {
                bestTime = finalTime;
                PersistedStore.records.setBestTime('eatAndAvoid', bestTime);
            }
            bestTimeElement.textContent = GameUtils.formatBestTime(bestTime);
            gameScreens.showVictory({
                totalTime: finalTime,
                playTime: finalPlayTime,
                penaltyTime: finalPenalty,
                bestTime: bestTime
            });
            if (typeof ControlHint !== 'undefined') ControlHint.hide();
            resetMenuInputState();
        }

        function resetGame() {
            gameState = 'waiting';
            gameTime = 0;
            gameStartTime = 0;
            penaltyTime = 0;
            purePlayTime = 0;
            timerElement.textContent = '00:00';
            const playTimeEl = document.getElementById('play-time');
            const penaltyEl = document.getElementById('penalty-time-display');
            if (playTimeEl) playTimeEl.textContent = '00:00';
            if (penaltyEl) penaltyEl.textContent = '+0s';

            waveSys.reset();
            gridSys.clearAll();
            speedBoost.reset();
            speedFxTimer = 0;
            lastInputSpeedMult = 1;
            syncSpeedBoostUI();

            ControllerManager.resetAllPlayers(p => {
                resetPlayerPosition(p);
                p.isJumping = false;
                p.dashTimer = 0;
                p.dashCooldown = 0;
                p.ghostMarker = null;
            });
        }

        // 6. gameScreens（挂到场景根，卸载时自然带走）
        const gameScreens = GameUtils.createGameScreens({
            parent: sceneRoot,
            gameType: 'color',
            currentLevel: currentLevel,
            maxLevel: 3,
            onRestart: () => {
                gameScreens.hide();
                resetGame();
                SoundManager.playGameBGM();
                startGame();
            },
            onRevive: () => {
                gameScreens.hide();
                gameState = 'playing';
                penaltyTime += REVIVE_PENALTY;
                floatingText.show(`+${REVIVE_PENALTY}秒复活惩罚`, '#ff6b6b', width / 2, height / 2 - 50);
                SoundManager.playGameBGM();
                ControllerManager.resetAllPlayers(p => {
                    resetPlayer(p);
                    p.isJumping = false;
                    p.dashTimer = 0;
                    p.dashCooldown = 0;
                    p.ghostMarker = null;
                });
                invincibleTimer = INVINCIBLE_DURATION;
            },
            onNextLevel: () => {
                if (currentLevel < 3) {
                    SceneManager.enter('gameColorCollect', { mode: 'coop', level: currentLevel + 1 });
                } else {
                    SceneManager.enter('gameRedLine', { mode: 'coop', level: 1 });
                }
            },
            onBackToMenu: () => SceneManager.enter('mainMenu')
        });
        gameScreens.bindMenuSystem(menuSystem);

        // 7. PauseMenu 实例（挂到场景根，unmount 时 destroy）
        const pauseMenu = new PauseMenu(sceneRoot, {
            canPause: () => gameState === 'playing',
            onPause: () => {},
            onResume: () => {},
            onRestart: () => {
                resetGame();
                startGame();
            },
            onBackToMenu: () => SceneManager.enter('mainMenu')
        });

        // 8. initControllerAfterConfig
        let controllerInitialized = false;
        function initControllerAfterConfig() {
            if (controllerInitialized) return;
            controllerInitialized = true;

            ControllerManager.setCallbacks({
                onPlayerCreate: createGamePlayer,
                onPlayerRemove: removeGamePlayer,
                onUpdate: () => {
                    updateControllerUI();
                    if (gameState === 'waiting' && ControllerManager.hasAnyInput()) startGame();
                },
                onReassign: (webControllerMapping) => {
                    const ws = PersistedStore._ws;
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        Object.entries(webControllerMapping).forEach(([controllerId, playerId]) => {
                            ws.send(JSON.stringify({
                                type: 'update_player_id',
                                controller_id: parseInt(controllerId),
                                player_id: playerId
                            }));
                        });
                    }
                    updateControllerUI();
                },
                enableKeyboard: PersistedStore.gameSettings.getKeyboardEnabled()
            });
            PersistedStore.playerColors.applyToAllPlayers(ControllerManager.getPlayers());
            updateControllerUI();
        }

        let debugPanel = null;
        if (typeof DebugPanel !== 'undefined') {
            debugPanel = new DebugPanel(sceneRoot, {
                onVictoryTest: () => {
                    if (gameState === 'playing' || gameState === 'waiting') {
                        if (gameState === 'waiting') startGame();
                        victory();
                    }
                }
            });
            DebugPanel.setCurrent(debugPanel);
        }

        // 9. resize, resetGame, initFrameScheduler
        const frameScheduler = FrameScheduler.create({
            fixedHz: 60,
            onUpdate: (fixedDt) => update(fixedDt),
            onRender: (alpha) => draw(alpha)
        });
        frameScheduler.start();

        window.addEventListener('resize', resize);
        gridSys.initGrid();
        initLevelUI();
        resize();
        resetGame();

        // Store references for unmount
        sceneRoot._gcResize = resize;
        sceneRoot._gcKeydown = keydownHandler;
        sceneRoot._gcFrameScheduler = frameScheduler;
        sceneRoot._gcGameScreens = gameScreens;
        sceneRoot._gcPauseMenu = pauseMenu;
        sceneRoot._gcDebugPanel = debugPanel;
    }

    function unmount() {
        const container = document.getElementById('scene-container');
        const sceneRoot = container && container.querySelector('#scene-gameColorCollect');

        if (sceneRoot) {
            const frameScheduler = sceneRoot._gcFrameScheduler;
            const resize = sceneRoot._gcResize;
            const keydownHandler = sceneRoot._gcKeydown;
            const gameScreens = sceneRoot._gcGameScreens;
            const pauseMenu = sceneRoot._gcPauseMenu;
            const debugPanel = sceneRoot._gcDebugPanel;

            if (typeof DebugPanel !== 'undefined') DebugPanel.setCurrent(null);
            if (debugPanel && debugPanel.destroy) debugPanel.destroy();
            if (frameScheduler && frameScheduler.stop) frameScheduler.stop();
            GameWebSocket.detachScene();
            if (pauseMenu && pauseMenu.destroy) pauseMenu.destroy();
            if (gameScreens && gameScreens.hide) gameScreens.hide();

            if (resize) window.removeEventListener('resize', resize);
            if (keydownHandler) window.removeEventListener('keydown', keydownHandler);

            sceneRoot.remove();
        }
    }

    const gameColorCollectScene = { mount, unmount };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { gameColorCollectScene };
    }
    if (typeof window !== 'undefined') {
        window.SceneColorCollect = () => gameColorCollectScene;
    }
})();
