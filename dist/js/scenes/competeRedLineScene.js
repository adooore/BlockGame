/**
 * 竞技红线危机场景模块 - 供 SceneManager 挂载
 * 逻辑来自 competeRedLine.html，适配单页场景切换
 * 使用 CompeteScoreboard、playRedlineBGM、红线逻辑
 */
(function () {
    'use strict';

    const LEVEL_MODES = {
        1: '单线追击',
        2: '双线夹击',
        3: '十字封锁'
    };

    const SCANLINE_STORAGE_KEY = 'competeRedLineScanlineEnabled';
    const BASE_UI_WIDTH = 1280;
    const INVINCIBLE_DURATION = 120;
    const SPAWN_OFFSETS = [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 }
    ];

    const CORRECT_SCORE = CompeteScoreboard.CONFIG_DEFAULT.CORRECT_SCORE;
    const DEATH_PENALTY = CompeteScoreboard.CONFIG_DEFAULT.DEATH_PENALTY;
    const REVIVE_COOLDOWN = CompeteScoreboard.CONFIG_DEFAULT.REVIVE_COOLDOWN;

    function mount(payload) {
        const currentLevel = (payload && payload.level) || 1;
        const levelNames = { 1: '竞技红线危机 I', 2: '竞技红线危机 II', 3: '竞技红线危机 III' };
        const levelSubtitles = {
            1: '单线追击 - 躲避移动红线',
            2: '双线夹击 - 双向红线夹击',
            3: '十字封锁 - 水平垂直红线'
        };

        // 1. Clone template and append to scene-container
        const tpl = document.getElementById('scene-competeRedLine-tpl');
        const container = document.getElementById('scene-container');
        if (!tpl || !container) {
            console.error('[competeRedLineScene] template or container not found');
            return;
        }
        const clone = tpl.content.cloneNode(true);
        const sceneRoot = clone.querySelector('#scene-competeRedLine') || clone.firstElementChild;
        container.appendChild(clone);
        container.classList.add('active');

        // 2. Create loading screen
        const loadingScreen = LoadingAnimations.create({
            title: `红线危机 · ${LEVEL_MODES[currentLevel] || '单线追击'}`,
            subtitle: '⚔ 竞技模式',
            subtitle2: '多人对战 · 争夺最高分',
            minDuration: 1000,
            showControls: true,
            onComplete: () => {
                SoundManager.playRedlineBGM();
                SoundManager.initBGMAutoplay();
                startGame();
            }
        });

        // 3. Config (from competeRedLine.html)
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
            dangerColorHex: { pink: '#ff00ff', red: '#ff4444', gray: '#888888' },
            dangerColorNames: { pink: '粉色', red: '红色', gray: '灰色' },
            allColors: ['cyan', 'yellow', 'purple', 'orange', 'pink', 'red', 'gray']
        };

        let targetColor = 'cyan';
        let dangerColor = 'red';

        // Red line system config
        const redLineConfig = {
            color: '#ff4444',
            glowColor: '#ff0000',
            // 红线推进速度：提升体感密度（原先偏慢）
            baseSpeed: 1 / 20,
            // 末波 speedMult 至少达到 2x（提高到 4）
            maxSpeedMult: 4,
            warningTime: 60
        };
        let redLines = [];

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
        let purePlayTime = 0;
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
        let speedFxColor = '#ff4444';
        const SPEED_FX_DURATION = 18;

        const gameUI = GameUtils.createGameUI(document.getElementById('game-ui-container'));

        function updateControllerUI() {
            gameUI.updateControllerUI(ControllerManager);
        }

        // Red line helpers
        function createRedLine(direction) {
            const line = {
                direction: direction,
                position: 0,
                isHorizontal: direction === 'left' || direction === 'right',
                warning: redLineConfig.warningTime,
                active: false
            };
            if (direction === 'down') line.position = -1;
            else if (direction === 'up') line.position = config.gridSize;
            else if (direction === 'right') line.position = -1;
            else if (direction === 'left') line.position = config.gridSize;
            return line;
        }

        function initRedLines() {
            redLines = [];
            if (currentLevel === 1) {
                redLines.push(createRedLine('down'));
            } else if (currentLevel === 2) {
                redLines.push(createRedLine('down'));
                redLines.push(createRedLine('up'));
            } else {
                redLines.push(createRedLine('down'));
                redLines.push(createRedLine('right'));
            }
        }

        function updateRedLines(dtScale) {
            redLines.forEach(line => {
                if (line.warning > 0) {
                    line.warning = Math.max(0, line.warning - dtScale);
                    if (line.warning <= 0) line.active = true;
                    return;
                }
                const waveProgress = (waveSys.waveNumber - 1) / (config.maxWaves - 1);
                const speedMult = 1 + waveProgress * (redLineConfig.maxSpeedMult - 1);
                const speed = redLineConfig.baseSpeed * speedMult * dtScale;
                switch (line.direction) {
                    case 'down':
                        line.position += speed;
                        if (line.position >= config.gridSize) {
                            line.position = -1;
                            // 不在回卷时进入警告闪烁：直接保持红线继续滚动
                            line.warning = 0;
                            line.active = true;
                        }
                        break;
                    case 'up':
                        line.position -= speed;
                        if (line.position < -1) {
                            line.position = config.gridSize;
                            line.warning = 0;
                            line.active = true;
                        }
                        break;
                    case 'right':
                        line.position += speed;
                        if (line.position >= config.gridSize) {
                            line.position = -1;
                            line.warning = 0;
                            line.active = true;
                        }
                        break;
                    case 'left':
                        line.position -= speed;
                        if (line.position < -1) {
                            line.position = config.gridSize;
                            line.warning = 0;
                            line.active = true;
                        }
                        break;
                }
            });
        }

        function drawRedLines() {
            const { gridX, gridY, tileSize } = gridSys;
            const gap = config.tileGap;
            const totalTileSize = tileSize + gap;
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            redLines.forEach(line => {
                const pos = Math.floor(line.position);
                const fraction = line.position - pos;
                if (line.isHorizontal) {
                    const x = gridX + pos * totalTileSize + fraction * totalTileSize;
                    if (line.active) {
                        ctx.fillStyle = redLineConfig.color;
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = redLineConfig.glowColor;
                        ctx.fillRect(x, gridY, tileSize, config.gridSize * totalTileSize - gap);
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'transparent';
                    } else if (line.warning > 0) {
                        const alpha = 0.3 + Math.sin(Date.now() / 100) * 0.2;
                        ctx.fillStyle = `rgba(255, 68, 68, ${alpha})`;
                        const warnX = line.direction === 'right' ? gridX : gridX + (config.gridSize - 1) * totalTileSize;
                        ctx.fillRect(warnX, gridY, tileSize, config.gridSize * totalTileSize - gap);
                    }
                } else {
                    const y = gridY + pos * totalTileSize + fraction * totalTileSize;
                    if (line.active) {
                        ctx.fillStyle = redLineConfig.color;
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = redLineConfig.glowColor;
                        ctx.fillRect(gridX, y, config.gridSize * totalTileSize - gap, tileSize);
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'transparent';
                    } else if (line.warning > 0) {
                        const alpha = 0.3 + Math.sin(Date.now() / 100) * 0.2;
                        ctx.fillStyle = `rgba(255, 68, 68, ${alpha})`;
                        const warnY = line.direction === 'down' ? gridY : gridY + (config.gridSize - 1) * totalTileSize;
                        ctx.fillRect(gridX, warnY, config.gridSize * totalTileSize - gap, tileSize);
                    }
                }
            });
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        function checkRedLineCollision(p) {
            if (p.z >= 1 || p.isDead) return false;
            const { gridX, gridY, tileSize } = gridSys;
            const gap = config.tileGap;
            const totalTileSize = tileSize + gap;
            const playerLeft = p.x;
            const playerRight = p.x + p.width;
            const playerTop = p.y;
            const playerBottom = p.y + p.height;
            for (const line of redLines) {
                if (!line.active) continue;
                const pos = Math.floor(line.position);
                const fraction = line.position - pos;
                if (line.isHorizontal) {
                    const lineX = gridX + pos * totalTileSize + fraction * totalTileSize;
                    const lineLeft = lineX;
                    const lineRight = lineX + tileSize;
                    if (playerRight > lineLeft && playerLeft < lineRight) return true;
                } else {
                    const lineY = gridY + pos * totalTileSize + fraction * totalTileSize;
                    const lineTop = lineY;
                    const lineBottom = lineY + tileSize;
                    if (playerBottom > lineTop && playerTop < lineBottom) return true;
                }
            }
            return false;
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
            console.log(`[Compete] 玩家 ${id} 加入游戏，颜色:`, colorData.name || colorData.main);
            competeScoreboard.initPlayerScore(id);
            competeScoreboard.updateLeaderboard(gameState);
            return p;
        }

        function removeGamePlayer(id) {
            console.log(`[Compete] 玩家 ${id} 离开游戏`);
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
                if (nameEl) nameEl.textContent = '红线';
                if (nameEl) nameEl.style.color = '#ff4444';
                if (labelEl) labelEl.textContent = '⚠ 移动红线';
                const descEl = document.getElementById('danger-desc');
                if (descEl) descEl.textContent = '闪避移动';
            }
        }

        function updateDebugInfo() {
            const waveNumEl = document.getElementById('wave-num');
            const colorCountsEl = document.getElementById('color-counts');
            if (!waveNumEl) return;
            waveNumEl.textContent = waveSys.waveNumber;
            const cyanCount = gridSys.countTiles('cyan');
            const activeLines = redLines.filter(l => l.active).length;
            const warningLines = redLines.filter(l => l.warning > 0).length;
            let html = `<span style="color: #00f2ff; text-shadow: 0 0 5px #00f2ff; font-weight: bold;">★</span> ${cyanCount} `;
            html += `<br><span style="color: #ff4444; text-shadow: 0 0 5px #ff0000;">⚠ 红线</span> `;
            html += `<span style="color: #ff4444;">${activeLines}/${redLines.length}</span>`;
            if (warningLines > 0) {
                html += ` <span style="color: #ffaa00;">(${warningLines}即将)</span>`;
            }
            if (colorCountsEl) colorCountsEl.innerHTML = html;
        }

        function triggerNewWave() {
            targetColor = 'cyan';
            dangerColor = 'red';
            updateTargetColorUI();
            waveSys.triggerWave(gridSys, {
                targetColors: ['cyan'],
                dangerColors: [],
                currentTarget: targetColor,
                currentDanger: dangerColor,
                players: Object.values(ControllerManager.getPlayers()),
                dynamicTarget: false,
                dynamicDanger: false
            });
            gridSys.clearAll();
            const allPlayers = ControllerManager.getPlayers();
            const occupied = gridSys.getOccupiedTiles(Object.values(allPlayers));
            const availableTiles = gridSys.getAvailableTiles(occupied);
            const shuffled = GameUtils.shuffle([...availableTiles]);
            const { targetCount } = waveSys.getWaveConfig();
            let idx = 0;
            const actualTarget = Math.min(targetCount, shuffled.length - idx);
            for (let i = 0; i < actualTarget && idx < shuffled.length; i++, idx++) {
                shuffled[idx].type = targetColor;
                shuffled[idx].pulse = 0;
            }
            if (debugPanel) debugPanel.logWave(waveSys.waveNumber, actualTarget, redLines.length);
            // 不要在每次刷新波次时重置红线位置：只在尚未初始化时创建一次
            if (!redLines || redLines.length === 0) initRedLines();
            // 红线危机有固定规律，不需要每次刷新波次都给予无敌
            invincibleTimer = 0;
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

        function update(fixedDt) {
            if (pauseMenu) pauseMenu.pollGamepadStart();
            if (pauseMenu && pauseMenu.isPaused) return;
            if (gameState !== 'playing') return;

            const dtScale = fixedDt * 60;
            if (speedFxTimer > 0) speedFxTimer = Math.max(0, speedFxTimer - dtScale);
            if (gameStartTime > 0) {
                purePlayTime = (Date.now() - gameStartTime) / 1000;
                gameTime = purePlayTime;
            }

            const players = ControllerManager.getPlayers();
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
            updateRedLines(dtScale);

            let needLeaderboardUpdate = false;
            Object.values(players).forEach(p => {
                if (invincibleTimer <= 0 && !p.isDead && checkRedLineCollision(p)) {
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

        function checkPlayerCollision(p) {
            if (p.z >= 1 || p.isDead) return;
            const { gridX, gridY, tileSize } = gridSys;
            const cx = p.x + p.width / 2;
            const cy = p.y + p.height / 2;
            const col = Math.floor((cx - gridX) / (tileSize + config.tileGap));
            const row = Math.floor((cy - gridY) / (tileSize + config.tileGap));
            if (row >= 0 && row < config.gridSize && col >= 0 && col < config.gridSize) {
                const tile = gridSys.grid.find(t => t.row === row && t.col === col);
                if (tile && tile.type !== 'none' && tile.type === targetColor) {
                    tile.type = 'none';
                    const pos = gridSys.getTilePosition(row, col);
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
                isDanger: false
            }));

            drawRedLines();

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
                    competeScoreboard.hideResults();
                    resetCompeteGame();
                    SoundManager.playRedlineBGM();
                    startGame();
                },
                onNextLevel: () => {
                    competeScoreboard.hideResults();
                    if (currentLevel < 3) {
                        SceneManager.enter('competeRedLine', { mode: 'compete', level: currentLevel + 1 });
                    } else {
                        SceneManager.enter('competeDangerousPassage', { mode: 'compete', level: 1 });
                    }
                },
                onBackToMenu: () => {
                    competeScoreboard.hideResults();
                    SceneManager.enter('mainMenu');
                },
                menuSystem: menuSystem
            });
            if (typeof ControlHint !== 'undefined') ControlHint.hide();
            resetMenuInputState();
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

        // 6. CompeteScoreboard 实例
        const competeScoreboard = new CompeteScoreboard(sceneRoot, { controllerManager: ControllerManager });

        // 7. PauseMenu 实例
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

        // 9. FrameScheduler
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
        const sceneRoot = container && container.querySelector('#scene-competeRedLine');

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

    const competeRedLineScene = { mount, unmount };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { competeRedLineScene };
    }
    if (typeof window !== 'undefined') {
        window.SceneCompeteRedLine = () => competeRedLineScene;
    }
})();
