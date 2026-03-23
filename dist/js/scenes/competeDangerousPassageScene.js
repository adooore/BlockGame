/**
 * 竞技危险通道场景模块 - 供 SceneManager 挂载
 * 逻辑来自 competeDangerousPassage.html，适配单页场景切换
 * 使用 CompeteScoreboard，危险通道逻辑，onBackToMenu -> SceneManager.enter('mainMenu')
 */
(function () {
    'use strict';

    const LEVEL_MODES = {
        1: '基础通道',
        2: '双重封锁',
        3: '极限穿越'
    };

    const BASE_UI_WIDTH = 1280;
    const INVINCIBLE_DURATION = 120;
    const SPAWN_OFFSETS = [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 }
    ];

    function mount(payload) {
        const currentLevel = (payload && payload.level) || 1;
        const levelNames = { 1: '竞技危险通道 I', 2: '竞技危险通道 II', 3: '竞技危险通道 III' };
        const levelSubtitles = {
            1: '基础模式 - 三格通道',
            2: '进阶模式 - 双层通道',
            3: '极限模式 - 多重通道'
        };

        // 1. Clone template and append to scene-container
        const tpl = document.getElementById('scene-competeDangerousPassage-tpl');
        const container = document.getElementById('scene-container');
        if (!tpl || !container) {
            console.error('[competeDangerousPassageScene] template or container not found');
            return;
        }
        const clone = tpl.content.cloneNode(true);
        const sceneRoot = clone.querySelector('#scene-competeDangerousPassage') || clone.firstElementChild;
        container.appendChild(clone);
        container.classList.add('active');

        // 2. Create loading screen
        const loadingScreen = LoadingAnimations.create({
            title: `危险通道 · ${LEVEL_MODES[currentLevel] || '基础通道'}`,
            subtitle: '⚔ 竞技模式',
            subtitle2: '多人对战 · 争夺最高分',
            minDuration: 1000,
            showControls: true,
            onComplete: () => {
                SoundManager.playDangerousBGM();
                SoundManager.initBGMAutoplay();
                startGame();
            }
        });

        // 3. Config from competeDangerousPassage.html
        const config = {
            gridSize: 12,
            tileGap: 6,
            playerSizeRatio: 0.5,
            moveSpeed: 7.5,
            dashMultiplier: 3.5,
            dashDuration: 8,
            dashCooldown: 30,
            jumpPower: 14,
            gravity: 1.0,
            trailLength: 6,
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
            allColors: ['cyan', 'yellow', 'purple', 'orange', 'pink', 'red', 'gray']
        };

        let targetColor = 'cyan';
        let dangerColor = 'red';
        const collectibleColors = ['cyan', 'yellow', 'purple', 'orange'];
        const ALL_COLORS = PersistedStore.playerColors.getAllColors();
        const GAME_PLAYER_COLORS = [ALL_COLORS[0], ALL_COLORS[1], ALL_COLORS[2], ALL_COLORS[3]];

        // 危险区域配置
        const dangerZoneConfig = { color: '#ff4444', glowColor: '#ff0000' };
        function getDangerZones() {
            if (currentLevel === 1) {
                return [{ height: 3, startRow: 4, gapWidth: 3, gapStartCol: 5, offset: 1 }];
            } else if (currentLevel === 2) {
                return [
                    { height: 3, startRow: 2, gapWidth: 3, gapStartCol: 3, offset: 1 },
                    { height: 3, startRow: 7, gapWidth: 3, gapStartCol: 7, offset: -1 }
                ];
            }
            return [];
        }
        const dangerZones = getDangerZones();

        // 第三关：滚动墙壁
        const rollingWalls = [];
        const rollingWallConfig = { height: 3, minSpeed: 0.75, maxSpeed: 1.5, gapWidth: 4, offset: 1 };
        function getRollingSpeed() {
            const waveNum = waveSys.waveNumber || 1;
            const progress = Math.min((waveNum - 1) / (config.maxWaves - 1), 1);
            return rollingWallConfig.minSpeed + (rollingWallConfig.maxSpeed - rollingWallConfig.minSpeed) * progress;
        }
        function initRollingLines() {
            if (currentLevel !== 3) return;
            rollingWalls.length = 0;
            rollingWalls.push({ startRow: 2, xOffset: 0, direction: 1, gapStartCol: 3, offset: 1 });
            rollingWalls.push({ startRow: 7, xOffset: 0, direction: -1, gapStartCol: 7, offset: -1 });
        }
        function updateRollingLines(dtScale) {
            if (currentLevel !== 3) return;
            const { tileSize } = gridSys;
            const totalTileSize = tileSize + config.tileGap;
            const currentSpeed = getRollingSpeed();
            rollingWalls.forEach(wall => {
                wall.xOffset += wall.direction * currentSpeed * dtScale;
                if (wall.xOffset > totalTileSize) {
                    wall.xOffset -= totalTileSize;
                    wall.gapStartCol = (wall.gapStartCol + 1) % config.gridSize;
                } else if (wall.xOffset < -totalTileSize) {
                    wall.xOffset += totalTileSize;
                    wall.gapStartCol = (wall.gapStartCol - 1 + config.gridSize) % config.gridSize;
                }
            });
        }
        function getRollingGapRange(wall, rowIndex) {
            const baseCol = wall.gapStartCol + rowIndex * wall.offset;
            const start = ((baseCol % config.gridSize) + config.gridSize) % config.gridSize;
            const end = start + rollingWallConfig.gapWidth;
            return { start, end };
        }
        function drawRollingLines() {
            if (currentLevel !== 3) return;
            const { gridX, gridY, tileSize, gridTotalDim } = gridSys;
            const gap = config.tileGap;
            const totalTileSize = tileSize + gap;
            ctx.save();
            ctx.beginPath();
            ctx.rect(gridX, gridY, gridTotalDim, gridTotalDim);
            ctx.clip();
            ctx.shadowBlur = 20;
            ctx.shadowColor = dangerZoneConfig.glowColor;
            ctx.fillStyle = dangerZoneConfig.color;
            rollingWalls.forEach(wall => {
                for (let i = 0; i < rollingWallConfig.height; i++) {
                    const row = wall.startRow + i;
                    const rowY = gridY + row * totalTileSize;
                    const gapRange = getRollingGapRange(wall, i);
                    for (let col = -1; col <= config.gridSize; col++) {
                        const normalizedCol = ((col % config.gridSize) + config.gridSize) % config.gridSize;
                        let inGap = false;
                        if (gapRange.end <= config.gridSize) {
                            inGap = normalizedCol >= gapRange.start && normalizedCol < gapRange.end;
                        } else {
                            inGap = normalizedCol >= gapRange.start || normalizedCol < (gapRange.end % config.gridSize);
                        }
                        if (!inGap) {
                            const blockX = gridX + col * totalTileSize + wall.xOffset;
                            ctx.fillRect(blockX, rowY, tileSize, tileSize);
                        }
                    }
                }
            });
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.restore();
        }
        function checkRollingLineCollision(p) {
            if (currentLevel !== 3) return false;
            if (p.z >= 1 || p.isDead) return false;
            const { gridX, gridY, tileSize } = gridSys;
            const totalTileSize = tileSize + config.tileGap;
            const playerLeft = p.x, playerRight = p.x + p.width, playerTop = p.y, playerBottom = p.y + p.height;
            for (const wall of rollingWalls) {
                for (let i = 0; i < rollingWallConfig.height; i++) {
                    const row = wall.startRow + i;
                    const rowY = gridY + row * totalTileSize;
                    const rowBottom = rowY + tileSize;
                    if (playerBottom > rowY && playerTop < rowBottom) {
                        const gapRange = getRollingGapRange(wall, i);
                        for (let col = 0; col < config.gridSize; col++) {
                            let inGap = gapRange.end <= config.gridSize
                                ? (col >= gapRange.start && col < gapRange.end)
                                : (col >= gapRange.start || col < (gapRange.end % config.gridSize));
                            if (!inGap) {
                                const blockX = gridX + col * totalTileSize + wall.xOffset;
                                if (playerRight > blockX && playerLeft < blockX + tileSize) return true;
                            }
                        }
                    }
                }
            }
            return false;
        }

        function getGapRange(zone, rowIndex) {
            const start = zone.gapStartCol + rowIndex * zone.offset;
            const end = start + zone.gapWidth;
            return { start: Math.max(0, start), end: Math.min(config.gridSize, end) };
        }
        function drawDangerZone() {
            const { gridX, gridY, tileSize } = gridSys;
            const gap = config.tileGap;
            const totalTileSize = tileSize + gap;
            ctx.shadowBlur = 20;
            ctx.shadowColor = dangerZoneConfig.glowColor;
            ctx.fillStyle = dangerZoneConfig.color;
            dangerZones.forEach(zone => {
                for (let i = 0; i < zone.height; i++) {
                    const row = zone.startRow + i;
                    const y = gridY + row * totalTileSize;
                    const gapRange = getGapRange(zone, i);
                    if (gapRange.start > 0) {
                        ctx.fillRect(gridX, y, gapRange.start * totalTileSize - gap, tileSize);
                    }
                    if (gapRange.end < config.gridSize) {
                        const rightX = gridX + gapRange.end * totalTileSize;
                        ctx.fillRect(rightX, y, (config.gridSize - gapRange.end) * totalTileSize - gap, tileSize);
                    }
                }
            });
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }
        function checkDangerZoneCollision(p) {
            if (p.z >= 1 || p.isDead) return false;
            if (currentLevel === 3) return checkRollingLineCollision(p);
            const { gridX, gridY, tileSize } = gridSys;
            const gap = config.tileGap;
            const totalTileSize = tileSize + gap;
            const playerLeft = p.x, playerRight = p.x + p.width, playerTop = p.y, playerBottom = p.y + p.height;
            for (const zone of dangerZones) {
                for (let i = 0; i < zone.height; i++) {
                    const row = zone.startRow + i;
                    const rowY = gridY + row * totalTileSize;
                    const rowBottom = rowY + tileSize;
                    if (playerBottom > rowY && playerTop < rowBottom) {
                        const gapRange = getGapRange(zone, i);
                        const gapLeftX = gridX + gapRange.start * totalTileSize;
                        const gapRightX = gridX + gapRange.end * totalTileSize - gap;
                        const inGap = playerLeft >= gapLeftX && playerRight <= gapRightX;
                        if (!inGap) return true;
                    }
                }
            }
            return false;
        }

        // 4. Initialize systems
        const gridSys = GridSystem.create({
            gridSize: config.gridSize,
            tileGap: config.tileGap,
            colors: config.colors,
            visual: { glowBase: 8.7, glowPulse: 3.5, normalLineWidth: 2.0, highlightLineWidth: 3.3, normalFillAlpha: 0.10, highlightFillAlpha: 0.18 }
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

        const competeScoreboard = new CompeteScoreboard(sceneRoot, { controllerManager: ControllerManager });
        const CORRECT_SCORE = competeScoreboard.CORRECT_SCORE;
        const WRONG_PENALTY = competeScoreboard.WRONG_PENALTY;
        const DEATH_PENALTY = competeScoreboard.DEATH_PENALTY;
        const REVIVE_COOLDOWN = competeScoreboard.REVIVE_COOLDOWN;

        let gameState = 'waiting';
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
            onConfigLoaded: () => initControllerAfterConfig(),
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
            const { gridX, gridY, gridTotalDim, tileSize } = gridSys;
            const gap = config.tileGap;
            const totalTileSize = tileSize + gap;
            const id = playerId || p.id || 1;
            const bottomY = gridY + gridTotalDim - p.height - totalTileSize * 0.5;
            const centerX = gridX + gridTotalDim / 2;
            const spacing = tileSize * 1.5;
            const xOffsets = [-0.5, 0.5, -1.5, 1.5];
            p.x = centerX - p.width / 2 + xOffsets[(id - 1) % 4] * spacing;
            p.y = bottomY;
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
            indicator.style.boxShadow = `0 0 20px ${hex}`;
            nameEl.textContent = name;
            nameEl.style.color = hex;
            nameEl.style.textShadow = `0 0 10px ${hex}`;
        }

        function initLevelUI() {
            const levelTitle = document.getElementById('level-title');
            const dangerBox = document.getElementById('danger-color-box');
            const maxWavesEl = document.getElementById('max-waves');
            if (levelTitle) levelTitle.textContent = `${levelNames[currentLevel]} - ${levelSubtitles[currentLevel]}`;
            if (maxWavesEl) maxWavesEl.textContent = config.maxWaves;
            if (dangerBox) {
                dangerBox.style.display = 'inline-block';
                dangerBox.style.borderColor = '#ff4444';
                const indicator = document.getElementById('danger-color-indicator');
                const nameEl = document.getElementById('danger-color-name');
                const labelEl = dangerBox.querySelector('div:first-child');
                if (indicator) {
                    indicator.style.background = '#ff4444';
                    indicator.style.boxShadow = '0 0 15px #ff0000';
                }
                if (nameEl) nameEl.textContent = '危险区';
                if (nameEl) nameEl.style.color = '#ff4444';
                if (labelEl) labelEl.textContent = '⚠ 危险通道';
            }
        }

        function updateDebugInfo() {
            const waveNumEl = document.getElementById('wave-num');
            const colorCountsEl = document.getElementById('color-counts');
            const targetCountEl = document.getElementById('target-color-count');
            if (!waveNumEl) return;
            waveNumEl.textContent = waveSys.waveNumber;
            const targetCount = gridSys.countTiles(targetColor);
            if (targetCountEl) targetCountEl.textContent = `剩余: ${targetCount}`;
            let html = `<span style="color: ${config.colorHex[targetColor]}; font-weight: bold;">★</span> ${targetCount} `;
            if (currentLevel === 3) {
                html += `<br><span style="color: #ff4444;">⚠ 滚动墙壁</span> ${rollingWalls.length}组`;
            } else {
                html += `<br><span style="color: #ff4444;">⚠ 通道数</span> ${dangerZones.length}`;
            }
            if (colorCountsEl) colorCountsEl.innerHTML = html;
        }

        function triggerNewWave() {
            waveSys.triggerWave(gridSys, {
                targetColors: collectibleColors,
                dangerColors: [],
                currentTarget: targetColor,
                currentDanger: 'red',
                players: Object.values(ControllerManager.getPlayers()),
                dynamicTarget: false,
                dynamicDanger: false
            });
            const waveNum = waveSys.waveNumber;
            const phase = waveNum <= 4 ? 1 : (waveNum <= 8 ? 2 : 3);
            if (phase === 3) {
                targetColor = collectibleColors[Math.floor(Math.random() * collectibleColors.length)];
            } else {
                targetColor = 'cyan';
            }
            dangerColor = 'red';
            updateTargetColorUI();

            gridSys.clearAll();
            const allPlayers = ControllerManager.getPlayers();
            const occupied = gridSys.getOccupiedTiles(Object.values(allPlayers));
            let safeTiles;
            if (currentLevel === 3) {
                safeTiles = gridSys.getAvailableTiles(occupied);
            } else {
                safeTiles = gridSys.getAvailableTiles(occupied).filter(tile => {
                    for (const zone of dangerZones) {
                        if (tile.row >= zone.startRow && tile.row < zone.startRow + zone.height) {
                            const rowIndex = tile.row - zone.startRow;
                            const gapRange = getGapRange(zone, rowIndex);
                            if (tile.col >= gapRange.start && tile.col < gapRange.end) return true;
                            return false;
                        }
                    }
                    return true;
                });
            }
            const shuffled = GameUtils.shuffle([...safeTiles]);
            let idx = 0;
            let actualTarget = 0;

            if (phase >= 2) {
                const perColorCount = 4;
                const shuffledColors = GameUtils.shuffle([...collectibleColors]);
                shuffledColors.forEach(color => {
                    for (let i = 0; i < perColorCount && idx < shuffled.length; i++, idx++) {
                        shuffled[idx].type = color;
                        shuffled[idx].pulse = 0;
                        if (color === targetColor) actualTarget++;
                    }
                });
            } else {
                actualTarget = Math.min(4, shuffled.length);
                for (let i = 0; i < actualTarget && idx < shuffled.length; i++, idx++) {
                    shuffled[idx].type = targetColor;
                    shuffled[idx].pulse = 0;
                }
            }
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
                if (newUp && !oldUp) { menuSystem.moveUp(); menuInputThrottle = true; setTimeout(() => menuInputThrottle = false, 150); }
                if (newDown && !oldDown) { menuSystem.moveDown(); menuInputThrottle = true; setTimeout(() => menuInputThrottle = false, 150); }
            }
            if (input.buttons.W && !prevMenuInput.buttons.W) menuSystem.confirm();
            prevMenuInput = { joystick: { ...input.joystick }, buttons: { ...input.buttons } };
        }

        const keydownHandler = () => {
            if (gameState === 'waiting') startGame();
        };
        window.addEventListener('keydown', keydownHandler);

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

        function checkPlayerCollision(p) {
            if (p.z >= 1 || p.isDead) return;
            const { gridX, gridY, tileSize } = gridSys;
            const cx = p.x + p.width / 2;
            const cy = p.y + p.height / 2;
            const col = Math.floor((cx - gridX) / (tileSize + config.tileGap));
            const row = Math.floor((cy - gridY) / (tileSize + config.tileGap));
            if (row < 0 || row >= config.gridSize || col < 0 || col >= config.gridSize) return;
            const tile = gridSys.grid.find(t => t.row === row && t.col === col);
            if (!tile || tile.type === 'none') return;
            const pos = gridSys.getTilePosition(row, col);
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
            } else if (collectibleColors.includes(tile.type)) {
                tile.type = 'none';
                competeScoreboard.addScore(p.id, WRONG_PENALTY, false);
                speedBoost.onPenalty();
                speedFxTimer = 0;
                floatingText.show(`${WRONG_PENALTY} 颜色错误!`, '#ff6b6b', pos.centerX, pos.y);
                SoundManager.playError();
                ControllerManager.vibrateLight(p.id);
            }
        }

        function update(fixedDt) {
            if (pauseMenu) pauseMenu.pollGamepadStart();
            if (pauseMenu && pauseMenu.isPaused) return;
            if (gameState !== 'playing') return;

            const dtScale = fixedDt * 60;
            if (speedFxTimer > 0) speedFxTimer = Math.max(0, speedFxTimer - dtScale);
            const players = ControllerManager.getPlayers();

            Object.values(players).forEach(p => {
                if (p.isDead) return;
                const input = ControllerManager.getInput(p.id);
                const { speedMult } = handlePlayerInput(p, input, {
                    onJump: () => SoundManager.playJump(),
                    onDash: () => SoundManager.playDash()
                }, { enablePreciseMovement: true, preciseSpeedMultiplier: DEFAULT_CONFIG.preciseSpeedMultiplier });
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
            updateRollingLines(dtScale);

            let needLeaderboardUpdate = false;
            Object.values(players).forEach(p => {
                if (invincibleTimer <= 0 && !p.isDead && checkDangerZoneCollision(p)) {
                    handlePlayerDeathCompete(p);
                }
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
                isDanger: false
            }));

            if (currentLevel === 3) drawRollingLines();
            else drawDangerZone();

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
                        invinciblePulseMs: 50,
                        shadowFill: 'rgba(0,0,0,0.6)',
                        glowBlurBase: 15,
                        glowBlurJumpDivisor: 5
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

            if (gameState === 'victory') checkMenuInput();
        }

        function victory() {
            gameState = 'victory';
            const rankings = competeScoreboard.getFinalRankings();
            competeScoreboard.showResults({
                waveInfo: `${waveSys.waveNumber} / ${config.maxWaves}`,
                currentLevel: currentLevel,
                maxLevel: 3,
                nextLevelUrl: '',
                onRestart: () => {
                    resetCompeteGame();
                    startGame();
                },
                onNextLevel: () => {
                    if (currentLevel < 3) {
                        SceneManager.enter('competeDangerousPassage', { level: currentLevel + 1 });
                    }
                },
                onBackToMenu: () => SceneManager.enter('mainMenu'),
                menuSystem: menuSystem
            });
            if (typeof ControlHint !== 'undefined') ControlHint.hide();
            resetMenuInputState();
        }

        function resetGame() {
            gameState = 'waiting';
            gameStartTime = 0;
            waveSys.reset();
            gridSys.clearAll();
            initRollingLines();
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
        const sceneRoot = container && container.querySelector('#scene-competeDangerousPassage');

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

    const competeDangerousPassageScene = { mount, unmount };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { competeDangerousPassageScene };
    }
    if (typeof window !== 'undefined') {
        window.SceneCompeteDangerousPassage = () => competeDangerousPassageScene;
    }
})();
