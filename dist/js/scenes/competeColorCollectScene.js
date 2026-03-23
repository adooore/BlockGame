/**
 * 竞技颜色收集场景模块 - 供 SceneManager 挂载
 * 逻辑来自 competeColorCollect.html，适配单页场景切换
 * 使用 CompeteScoreboard 处理胜利/排行榜，onBackToMenu/onNextLevel 使用 SceneManager.enter
 */
(function () {
    'use strict';

    const LEVEL_MODES = {
        1: '基础模式',
        2: '动态目标',
        3: '极限模式'
    };

    const SPAWN_OFFSETS = [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 }
    ];

    function mount(payload) {
        const currentLevel = (payload && payload.level) || 1;
        const levelNames = { 1: '竞技颜色收集 I', 2: '竞技颜色收集 II', 3: '竞技颜色收集 III' };
        const levelSubtitles = {
            1: '基础模式 - 固定青色目标',
            2: '进阶模式 - 动态目标 + 干扰项',
            3: '极限模式 - 双重颜色变换'
        };

        // 1. Clone template and append to scene-container
        const tpl = document.getElementById('scene-competeColorCollect-tpl');
        const container = document.getElementById('scene-container');
        if (!tpl || !container) {
            console.error('[competeColorCollectScene] template or container not found');
            return;
        }
        const clone = tpl.content.cloneNode(true);
        const sceneRoot = clone.querySelector('#scene-competeColorCollect') || clone.firstElementChild;
        container.appendChild(clone);
        container.classList.add('active');

        // 2. Create loading screen
        const loadingScreen = LoadingAnimations.create({
            title: `颜色收集 · ${LEVEL_MODES[currentLevel] || '基础模式'}`,
            subtitle: '⚔ 竞技模式',
            subtitle2: '多人对战 · 争夺最高分',
            minDuration: 1000,
            showControls: true,
            onComplete: () => {
                SoundManager.playGameBGM();
                SoundManager.initBGMAutoplay();
                startGame();
            }
        });

        // 3. Config
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
            colors: { bg: '#050505', grid: '#1a1a1a', cyan: '#00f2ff', pink: '#ff00ff' },
            collectibleColors: ['cyan', 'yellow', 'purple', 'orange'],
            colorHex: { cyan: '#00f2ff', yellow: '#facc15', purple: '#a855f7', orange: '#fb923c', pink: '#ff00ff', red: '#ff4444', gray: '#888888' },
            colorNames: { cyan: '青色', yellow: '黄色', purple: '紫色', orange: '橙色', pink: '粉色', red: '红色', gray: '灰色' },
            wrongColorPenalty: 5,
            dangerColors: ['pink', 'red', 'gray'],
            dangerColorHex: { pink: '#ff00ff', red: '#ff4444', gray: '#888888' },
            dangerColorNames: { pink: '粉色', red: '红色', gray: '灰色' },
            allColors: ['cyan', 'yellow', 'purple', 'orange', 'pink', 'red', 'gray']
        };

        const competeScoreboard = new CompeteScoreboard(sceneRoot, { controllerManager: ControllerManager });
        const INVINCIBLE_DURATION = 120;
        const CORRECT_SCORE = competeScoreboard.CORRECT_SCORE;
        const WRONG_PENALTY = competeScoreboard.WRONG_PENALTY;
        const DEATH_PENALTY = competeScoreboard.DEATH_PENALTY;
        const REVIVE_COOLDOWN = competeScoreboard.REVIVE_COOLDOWN;
        const BASE_UI_WIDTH = 1280;

        let targetColor = 'cyan';
        let dangerColor = 'pink';
        const ALL_COLORS = PersistedStore.playerColors.getAllColors();
        const GAME_PLAYER_COLORS = [ALL_COLORS[0], ALL_COLORS[1], ALL_COLORS[2], ALL_COLORS[3]];

        // 4. Initialize systems
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

        let gameState = 'waiting';
        let gameTime = 0;
        let gameStartTime = 0;
        let invincibleTimer = 0;
        let width, height;

        const BASE_MOVE_BODY_LENGTHS_PER_SEC = (typeof window !== 'undefined' && window.PLAYER_FEEL_METRICS && Number.isFinite(window.PLAYER_FEEL_METRICS.moveBodyLengthsPerSecond))
            ? window.PLAYER_FEEL_METRICS.moveBodyLengthsPerSecond
            : 15.75;
        const speedBoost = GameUtils.createSpeedBoostSystem({
            minBodyPerSec: 10,
            maxBodyPerSec: 30,
            stepsToMax: 16,
            baseMoveBodyLengthsPerSecond: BASE_MOVE_BODY_LENGTHS_PER_SEC
        });

        let speedFxTimer = 0;
        let speedFxColor = '#00f2ff';
        const SPEED_FX_DURATION = 18;

        const gameUI = GameUtils.createGameUI(document.getElementById('game-ui-container'));

        function updateControllerUI() {
            gameUI.updateControllerUI(ControllerManager);
        }

        // 5. GameWebSocket.init
        GameWebSocket.init({
            loadingScreen: loadingScreen,
            onConfigLoaded: () => {
                initControllerAfterConfig();
            },
            onControllerUpdate: updateControllerUI
        });
        GameWebSocket.setupUnloadHandler();

        function createGamePlayer(id, previousPlayer) {
            const fromPrevious = previousPlayer?.colors ? { main: previousPlayer.colors.main, glow: previousPlayer.colors.glow, core: previousPlayer.colors.core } : null;
            const savedColor = fromPrevious || PersistedStore.playerColors.getPlayerColor(id);
            const colorData = savedColor || GAME_PLAYER_COLORS[(id - 1) % GAME_PLAYER_COLORS.length];
            const { tileSize } = gridSys;
            const p = createPlayer(id, 0, 0);
            syncPlayerMovementConfig(p, tileSize * config.playerSizeRatio);
            p.colors = { main: colorData.main, glow: colorData.glow, core: colorData.core };
            p.isDead = false;
            p.reviveTimer = 0;
            resetPlayerPosition(p, id);
            competeScoreboard.initPlayerScore(id);
            competeScoreboard.updateLeaderboard(gameState);
            return p;
        }

        function removeGamePlayer(id) {
            competeScoreboard.removePlayer(id);
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
            const maxWaves = document.getElementById('max-waves');
            if (levelTitle) levelTitle.textContent = `${levelNames[currentLevel]} - ${levelSubtitles[currentLevel]}`;
            if (dangerBox) dangerBox.style.display = 'inline-block';
            if (maxWaves) maxWaves.textContent = config.maxWaves;
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
                gameTime = (Date.now() - gameStartTime) / 1000;
            }

            const players = ControllerManager.getPlayers();
            let needLeaderboardUpdate = false;
            Object.values(players).forEach(p => {
                if (p.isDead) return;
                const input = ControllerManager.getInput(p.id);
                const { speedMult } = handlePlayerInput(p, input, {
                    onJump: () => SoundManager.playJump(),
                    onDash: () => SoundManager.playDash()
                }, {
                    enablePreciseMovement: true,
                    preciseSpeedMultiplier: DEFAULT_CONFIG.preciseSpeedMultiplier
                });
                p.__inputSpeedMult = speedMult;
                const { gridX, gridY, gridTotalDim } = gridSys;
                updatePlayerMovement(p, {
                    speedMult: speedMult * speedBoost.getBoostMult(),
                    dtScale,
                    bounds: { minX: gridX, maxX: gridX + gridTotalDim - p.width, minY: gridY, maxY: gridY + gridTotalDim - p.height },
                    onLand: () => SoundManager.playLand()
                });
            });

            if (invincibleTimer > 0) invincibleTimer = Math.max(0, invincibleTimer - dtScale);

            Object.values(players).forEach(p => {
                checkPlayerCollision(p);
                if (p.isDead) {
                    updatePlayerRevive(p, dtScale);
                    const reviveEl = document.getElementById(`compete-revive-${p.id}`);
                    if (reviveEl) reviveEl.textContent = Math.ceil(p.reviveTimer / 60);
                    if (p.reviveTimer <= 0) needLeaderboardUpdate = true;
                }
            });

            if (needLeaderboardUpdate) competeScoreboard.updateLeaderboard(gameState);

            gridSys.grid.forEach(t => t.pulse += 0.05 * dtScale);
            updateDebugInfo();
            checkAndRefresh();
        }

        function checkPlayerCollision(p) {
            if (p.z >= 1 || p.isDead) return;
            const { gridX, gridY, tileSize } = gridSys;
            const cx = p.x + p.width / 2;
            const cy = p.y + p.height / 2;
            const col = Math.floor((cx - gridX) / (tileSize + config.tileGap));
            const row = Math.floor((cy - gridY) / (tileSize + config.tileGap));

            if (row >= 0 && row < config.gridSize && col >= 0 && col < config.gridSize) {
                const tile = gridSys.grid.find(t => t.row === row && t.col === col);
                if (tile && tile.type !== 'none') {
                    const pos = gridSys.getTilePosition(row, col);
                    if (isDangerColor(tile.type) && invincibleTimer <= 0) {
                        handlePlayerDeathCompete(p);
                        return;
                    } else if (!isDangerColor(tile.type) && config.colorHex[tile.type]) {
                        if (tile.type === targetColor) {
                            tile.type = 'none';
                            const streak = competeScoreboard.getStreak(p.id);
                            const bonus = streak > 0 ? ` x${streak + 1}` : '';
                            competeScoreboard.addScore(p.id, CORRECT_SCORE, true);
                            const { increased } = speedBoost.onCorrect();
                            if (increased) {
                                speedFxTimer = SPEED_FX_DURATION;
                                speedFxColor = config.colorHex[targetColor];
                            }
                            const bodyPerSec = speedBoost.getBodyPerSec(p.__inputSpeedMult || 1);
                            floatingText.show(`冲刺 ${bodyPerSec.toFixed(0)} 身位/s`, config.colorHex[targetColor], pos.centerX, pos.y);
                            SoundManager.playScore();
                        } else {
                            tile.type = 'none';
                            speedBoost.onPenalty();
                            speedFxTimer = 0;
                            CompeteScoreboard.addScore(p.id, WRONG_PENALTY, false);
                            floatingText.show(`${WRONG_PENALTY} 颜色错误!`, '#ff6b6b', pos.centerX, pos.y);
                            SoundManager.playError();
                            ControllerManager.vibrateLight(p.id);
                        }
                    }
                }
            }
        }

        function handlePlayerDeathCompete(p) {
            speedBoost.onPenalty();
            speedFxTimer = 0;
            p.isDead = true;
            p.reviveTimer = REVIVE_COOLDOWN;
            competeScoreboard.handleDeath(p.id);
            ControllerManager.vibrateStrong(p.id);
            SoundManager.playError();
            floatingText.show(`${DEATH_PENALTY} 死亡!`, '#ff4444', p.x + p.width / 2, p.y);
        }

        function updatePlayerRevive(p, dtScale) {
            if (!p.isDead) return;
            p.reviveTimer = Math.max(0, p.reviveTimer - dtScale);
            if (p.reviveTimer <= 0) {
                p.isDead = false;
                resetPlayer(p);
                const card = document.getElementById(`compete-leaderboard-item-${p.id}`);
                if (card) card.classList.remove('dead');
                floatingText.show('复活!', p.colors.main, p.x + p.width / 2, p.y);
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
                if (p.isDead) {
                    const reviveProgress = 1 - (p.reviveTimer / REVIVE_COOLDOWN);
                    ctx.globalAlpha = 0.2 + reviveProgress * 0.3;
                    const cx = p.x + p.width / 2;
                    const cy = p.y + p.height / 2;
                    ctx.strokeStyle = p.colors.main;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(cx, cy, p.width * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reviveProgress);
                    ctx.stroke();
                    ctx.fillStyle = '#444';
                    ctx.fillRect(p.x, p.y, p.width, p.height);
                    ctx.globalAlpha = 0.8;
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${Math.floor(p.width * 0.5)}px Orbitron`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(Math.ceil(p.reviveTimer / 60).toString(), cx, cy);
                    ctx.globalAlpha = 1.0;
                } else {
                    drawPlayerSprite(ctx, p, {
                        alpha: alpha || 1,
                        invincible: invincibleTimer > 0,
                        shadowFill: 'rgba(0,0,0,0.6)',
                        glowBlurBase: 10,
                        glowBlurJumpDivisor: 6,
                        invinciblePulseMs: 50
                    });
                }
            });

            if (speedFxTimer > 0) {
                const t = speedFxTimer / SPEED_FX_DURATION;
                const outerRFactor = 0.62 + 1.05 * (1 - t);
                Object.values(ControllerManager.getPlayers()).forEach(p => {
                    if (p.isDead || p.z >= 1) return;
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

            if (gameState === 'victory') {
                checkMenuInput();
            }
        }

        function victory() {
            gameState = 'victory';
            const rankings = competeScoreboard.getFinalRankings();
            competeScoreboard.showResults({
                waveInfo: `${waveSys.waveNumber} / ${config.maxWaves}`,
                currentLevel: currentLevel,
                maxLevel: 3,
                onRestart: () => {
                    resetCompeteGame();
                    SoundManager.playGameBGM();
                    startGame();
                },
                onNextLevel: () => {
                    if (currentLevel < 3) {
                        SceneManager.enter('competeColorCollect', { level: currentLevel + 1 });
                    } else {
                        SceneManager.enter('competeRedLine', { level: 1 });
                    }
                },
                onBackToMenu: () => SceneManager.enter('mainMenu'),
                menuSystem: menuSystem
            });

            if (typeof ControlHint !== 'undefined') ControlHint.hide();
            resetMenuInputState();
            if (debugPanel) debugPanel.add(`<span style="color: #ffd700;">🎉 竞技结束！冠军: P${rankings[0]?.playerId || 1} (${rankings[0]?.score || 0}分)</span>`);
        }

        function resetGame() {
            gameState = 'waiting';
            gameTime = 0;
            gameStartTime = 0;
            waveSys.reset();
            gridSys.clearAll();
            speedBoost.reset();
            speedFxTimer = 0;

                ControllerManager.resetAllPlayers(p => {
                    resetPlayer(p);
                    p.isJumping = false;
                    p.dashTimer = 0;
                    p.dashCooldown = 0;
                    p.ghostMarker = null;
                    p.isDead = false;
                    p.reviveTimer = 0;
                });
        }

        function resetCompeteGame() {
            resetGame();
            competeScoreboard.reset();
        }

        const pauseMenu = new PauseMenu(sceneRoot, {
            canPause: () => gameState === 'playing',
            onPause: () => {},
            onResume: () => {},
            onRestart: () => {
                resetCompeteGame();
                startGame();
            },
            onBackToMenu: () => SceneManager.enter('mainMenu')
        });

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

        sceneRoot._gcResize = resize;
        sceneRoot._gcKeydown = keydownHandler;
        sceneRoot._gcFrameScheduler = frameScheduler;
        sceneRoot._gcPauseMenu = pauseMenu;
        sceneRoot._gcDebugPanel = debugPanel;
        sceneRoot._gcCompeteScoreboard = competeScoreboard;
    }

    function unmount() {
        const container = document.getElementById('scene-container');
        const sceneRoot = container && container.querySelector('#scene-competeColorCollect');

        if (sceneRoot) {
            const frameScheduler = sceneRoot._gcFrameScheduler;
            const resize = sceneRoot._gcResize;
            const keydownHandler = sceneRoot._gcKeydown;
            const pauseMenu = sceneRoot._gcPauseMenu;
            const debugPanel = sceneRoot._gcDebugPanel;
            const competeScoreboard = sceneRoot._gcCompeteScoreboard;

            if (typeof DebugPanel !== 'undefined') DebugPanel.setCurrent(null);
            if (debugPanel && debugPanel.destroy) debugPanel.destroy();
            if (frameScheduler && frameScheduler.stop) frameScheduler.stop();
            GameWebSocket.detachScene();
            if (pauseMenu && pauseMenu.destroy) pauseMenu.destroy();
            if (competeScoreboard && competeScoreboard.hideResults) competeScoreboard.hideResults();

            if (resize) window.removeEventListener('resize', resize);
            if (keydownHandler) window.removeEventListener('keydown', keydownHandler);

            sceneRoot.remove();
        }
    }

    const competeColorCollectScene = { mount, unmount };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { competeColorCollectScene };
    }
    if (typeof window !== 'undefined') {
        window.SceneCompeteColorCollect = () => competeColorCollectScene;
    }
})();
