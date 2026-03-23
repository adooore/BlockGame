/**
 * 竞技模式计分板类
 * 每场景 new CompeteScoreboard(sceneRoot, options)，场景卸载后实例无引用可被 GC
 */
class CompeteScoreboard {
    static CONFIG_DEFAULT = {
        CORRECT_SCORE: 5,
        WRONG_PENALTY: -10,
        DEATH_PENALTY: 0,
        STREAK_BONUS: 5,
        REVIVE_COOLDOWN: 180
    };

    /**
     * @param {HTMLElement} parent - 挂载父节点（场景根）
     * @param {Object} [options]
     * @param {object} [options.controllerManager]
     * @param {function} [options.onScoreChange]
     * @param {object} [options.config]
     */
    constructor(parent, options = {}) {
        this.parent = parent;
        this.config = { ...CompeteScoreboard.CONFIG_DEFAULT, ...(options.config || {}) };
        this.playerScores = {};
        this.prevRankings = {};
        this.gameState = 'waiting';
        this.controllerManager = options.controllerManager || (typeof window !== 'undefined' ? window.ControllerManager : null);
        this.onScoreChange = options.onScoreChange || null;
        this.leaderboardEl = null;
        this._injectStyles();
        this._createLeaderboardDOM();
        this.reset();
    }

    _injectStyles() {
        if (document.getElementById('compete-scoreboard-styles')) return;
        const style = document.createElement('style');
        style.id = 'compete-scoreboard-styles';
        style.textContent = CompeteScoreboard.STYLES;
        document.head.appendChild(style);
    }

    static STYLES = `
        /* ==================== 竞技模式 - 右侧排行榜样式 ==================== */
        #compete-leaderboard-panel {
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            z-index: 30;
            pointer-events: none;
        }
        
        .compete-leaderboard-container {
            background: rgba(0, 0, 0, 0.85);
            border: 2px solid rgba(255, 215, 0, 0.6);
            border-radius: 12px;
            padding: 12px 16px;
            min-width: 180px;
            backdrop-filter: blur(10px);
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.2);
        }
        
        .compete-leaderboard-title {
            font-size: 11px;
            font-weight: bold;
            color: #ffd700;
            text-transform: uppercase;
            letter-spacing: 2px;
            text-align: center;
            padding-bottom: 8px;
            margin-bottom: 8px;
            border-bottom: 1px solid rgba(255, 215, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        
        .compete-leaderboard-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .compete-leaderboard-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.03);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }
        
        .compete-leaderboard-item.rank-1 {
            background: rgba(255, 215, 0, 0.15);
            border: 1px solid rgba(255, 215, 0, 0.4);
        }
        
        .compete-leaderboard-item.rank-2 {
            background: rgba(192, 192, 192, 0.1);
            border: 1px solid rgba(192, 192, 192, 0.3);
        }
        
        .compete-leaderboard-item.rank-3 {
            background: rgba(205, 127, 50, 0.1);
            border: 1px solid rgba(205, 127, 50, 0.3);
        }
        
        .compete-leaderboard-item.dead {
            opacity: 0.4;
            filter: grayscale(60%);
        }
        
        .compete-rank-badge {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            border-radius: 4px;
            flex-shrink: 0;
        }
        
        .compete-rank-badge.gold { background: linear-gradient(135deg, #ffd700, #ffaa00); color: #000; }
        .compete-rank-badge.silver { background: linear-gradient(135deg, #c0c0c0, #a0a0a0); color: #000; }
        .compete-rank-badge.bronze { background: linear-gradient(135deg, #cd7f32, #b87333); color: #fff; }
        .compete-rank-badge.normal { background: rgba(255, 255, 255, 0.1); color: #888; }
        
        .compete-player-dot {
            width: 14px;
            height: 14px;
            border-radius: 3px;
            flex-shrink: 0;
        }
        
        .compete-player-name {
            font-size: 12px;
            font-weight: bold;
            flex-shrink: 0;
            min-width: 28px;
        }
        
        .compete-player-score {
            font-size: 18px;
            font-weight: 900;
            font-family: 'Orbitron', sans-serif;
            text-align: right;
            flex: 1;
            text-shadow: 0 0 10px currentColor;
        }
        
        .compete-stats-icon {
            font-size: 10px;
            opacity: 0.6;
        }
        
        .compete-revive-countdown {
            position: absolute;
            right: 8px;
            font-size: 10px;
            color: #facc15;
            font-family: 'Orbitron', sans-serif;
        }
        
        /* 分数变化动画 */
        @keyframes competeScoreFlash {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); text-shadow: 0 0 20px currentColor; }
            100% { transform: scale(1); }
        }
        
        @keyframes competeScorePenalty {
            0%, 100% { color: inherit; }
            25%, 75% { color: #ff4444; }
        }
        
        .compete-score-flash {
            animation: competeScoreFlash 0.3s ease-out;
        }
        
        .compete-score-penalty {
            animation: competeScorePenalty 0.5s ease-out;
        }
        
        /* 排名变化动画 */
        @keyframes competeRankUp {
            0% { transform: translateY(10px); opacity: 0.5; }
            100% { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes competeRankDown {
            0% { transform: translateY(-10px); opacity: 0.5; }
            100% { transform: translateY(0); opacity: 1; }
        }
        
        .compete-rank-up { animation: competeRankUp 0.5s ease-out; }
        .compete-rank-down { animation: competeRankDown 0.5s ease-out; }
        
        /* 结果弹窗 */
        @keyframes competeFadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
        
        .compete-results-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 200;
            animation: competeFadeIn 0.5s ease;
        }
        
        .compete-results-panel {
            background: rgba(0, 0, 0, 0.95);
            border: 3px solid #ffd700;
            border-radius: 16px;
            padding: 40px 50px;
            text-align: center;
            min-width: 400px;
            box-shadow: 0 0 50px rgba(255, 215, 0, 0.3);
        }
        
        .compete-results-title {
            font-size: 42px;
            font-weight: 900;
            color: #ffd700;
            text-shadow: 0 0 30px #ffd700;
            margin-bottom: 10px;
            font-family: 'Orbitron', sans-serif;
        }
        
        .compete-results-subtitle {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 30px;
        }
        
        .compete-ranking-item {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
        }
        
        .compete-ranking-item.winner {
            background: rgba(255, 215, 0, 0.15);
            border: 2px solid #ffd700;
            transform: scale(1.05);
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
        }
        
        .compete-ranking-item:not(.winner) {
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid currentColor;
        }
    `;

    _createLeaderboardDOM() {
        const oldPanel = document.getElementById('compete-leaderboard-panel');
        if (oldPanel) oldPanel.remove();
        const oldLeaderboard = document.getElementById('leaderboard-panel');
        if (oldLeaderboard) oldLeaderboard.remove();
        const panel = document.createElement('div');
        panel.id = 'compete-leaderboard-panel';
        panel.innerHTML = `
            <div class="compete-leaderboard-container">
                <div class="compete-leaderboard-title"><span>🏆</span><span>排行榜</span></div>
                <div id="compete-leaderboard-list" class="compete-leaderboard-list"></div>
            </div>
        `;
        this.parent.appendChild(panel);
        this.leaderboardEl = document.getElementById('compete-leaderboard-list');
    }

    initPlayerScore(playerId) {
        if (!this.playerScores[playerId]) {
            this.playerScores[playerId] = { 
                score: 0,
                deaths: 0,
                streak: 0,
                penaltyCount: 0,
                penaltyTotal: 0
            };
        }
    }

    addScore(playerId, points, isCorrect = true) {
        this.initPlayerScore(playerId);
        const data = this.playerScores[playerId];
        if (isCorrect) {
            data.streak++;
            const streakBonus = data.streak > 1 ? this.config.STREAK_BONUS * (data.streak - 1) : 0;
            data.score += points + streakBonus;
        } else {
            data.streak = 0;
            data.score += points;
            data.penaltyCount++;
            data.penaltyTotal += Math.abs(points);
        }
        const scoreEl = document.getElementById(`compete-score-${playerId}`);
        if (scoreEl) {
            scoreEl.classList.remove('compete-score-flash', 'compete-score-penalty');
            void scoreEl.offsetWidth;
            scoreEl.classList.add(isCorrect ? 'compete-score-flash' : 'compete-score-penalty');
        }
        this.updateLeaderboard();
        if (this.onScoreChange) this.onScoreChange(playerId, data);
        return data.score;
    }

    handleDeath(playerId) {
        this.initPlayerScore(playerId);
        const data = this.playerScores[playerId];
        data.deaths++;
        data.streak = 0;
        data.score += this.config.DEATH_PENALTY;
        this.updateLeaderboard();
    }

    removePlayer(playerId) {
        delete this.playerScores[playerId];
        delete this.prevRankings[playerId];
        this.updateLeaderboard();
    }

    getPlayerScore(playerId) {
        return this.playerScores[playerId] || null;
    }

    getStreak(playerId) {
        return this.playerScores[playerId]?.streak || 0;
    }

    updateLeaderboard(currentGameState) {
        if (currentGameState !== undefined) this.gameState = currentGameState;
        if (!this.leaderboardEl || !this.controllerManager) return;
        const players = this.controllerManager.getPlayers();
        const playerIds = Object.keys(players).map(id => parseInt(id));
        const sortedPlayers = playerIds
            .filter(id => this.playerScores[id])
            .sort((a, b) => this.playerScores[b].score - this.playerScores[a].score);
        this.leaderboardEl.innerHTML = '';
        const medals = ['🥇', '🥈', '🥉'];
        const rankClasses = ['gold', 'silver', 'bronze'];
        sortedPlayers.forEach((playerId, index) => {
            const rank = index + 1;
            const data = this.playerScores[playerId];
            const player = players[playerId];
            if (!player) return;
            const prevRank = this.prevRankings[playerId] || rank;
            const rankChanged = prevRank !== rank;
            const item = document.createElement('div');
            item.className = `compete-leaderboard-item rank-${rank}`;
            item.id = `compete-leaderboard-item-${playerId}`;
            if (player.isDead) item.classList.add('dead');
            if (rankChanged && this.gameState === 'playing') {
                item.classList.add(rank < prevRank ? 'compete-rank-up' : 'compete-rank-down');
            }
            const badgeClass = rank <= 3 ? rankClasses[rank - 1] : 'normal';
            const badgeContent = rank <= 3 ? medals[rank - 1] : rank;
            item.innerHTML = `
                <div class="compete-rank-badge ${badgeClass}">${badgeContent}</div>
                <div class="compete-player-dot" style="background: ${player.colors.main}; box-shadow: 0 0 8px ${player.colors.glow};"></div>
                <div class="compete-player-name" style="color: ${player.colors.main};">P${playerId}</div>
                <div class="compete-player-score" id="compete-score-${playerId}" style="color: ${player.colors.main};">${data.score}</div>
                ${data.penaltyCount > 0 ? `<div class="compete-stats-icon" style="color: #ff6b6b;">⚠${data.penaltyCount}</div>` : ''}
                ${data.deaths > 0 ? `<div class="compete-stats-icon">💀${data.deaths}</div>` : ''}
                ${player.isDead ? `<div class="compete-revive-countdown" id="compete-revive-${playerId}">${Math.ceil(player.reviveTimer / 60)}</div>` : ''}
            `;
            this.leaderboardEl.appendChild(item);
            this.prevRankings[playerId] = rank;
        });
    }

    updateReviveCountdown(playerId, reviveTimer) {
        const reviveEl = document.getElementById(`compete-revive-${playerId}`);
        if (reviveEl) reviveEl.textContent = Math.ceil(reviveTimer / 60);
    }

    getFinalRankings() {
        if (!this.controllerManager) return [];
        const players = this.controllerManager.getPlayers();
        return Object.keys(this.playerScores)
            .filter(id => players[id])
            .map(id => ({
                playerId: parseInt(id),
                score: this.playerScores[id].score,
                deaths: this.playerScores[id].deaths,
                penaltyCount: this.playerScores[id].penaltyCount || 0,
                penaltyTotal: this.playerScores[id].penaltyTotal || 0,
                color: players[id]?.colors?.main || '#00f2ff'
            }))
            .sort((a, b) => b.score - a.score);
    }
    
    showResults(options = {}) {
        const {
            waveInfo = '',
            currentLevel = 1,
            maxLevel = 3,
            nextLevelUrl = '',
            onRestart,
            onNextLevel,
            onBackToMenu,
            menuSystem
        } = options;
        const rankings = this.getFinalRankings();
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
        const oldOverlay = document.getElementById('compete-results-overlay');
        if (oldOverlay) oldOverlay.remove();
        const rankingsHtml = rankings.map((r, i) => `
            <div class="compete-ranking-item ${i === 0 ? 'winner' : ''}" style="border-color: ${r.color};">
                <span style="font-size: 28px;">${medals[i] || ''}</span>
                <span style="
                    width: 20px; height: 20px;
                    background: ${r.color};
                    border-radius: 4px;
                    box-shadow: 0 0 10px ${r.color};
                "></span>
                <span style="
                    font-size: 18px;
                    font-weight: bold;
                    color: ${r.color};
                    min-width: 50px;
                ">P${r.playerId}</span>
                <span style="
                    font-size: 32px;
                    font-weight: 900;
                    color: ${i === 0 ? '#ffd700' : '#fff'};
                    font-family: 'Orbitron', sans-serif;
                    text-shadow: 0 0 15px ${i === 0 ? '#ffd700' : r.color};
                    flex: 1;
                    text-align: right;
                ">${r.score}</span>
                <span style="
                    font-size: 11px;
                    color: #ff6b6b;
                    opacity: 0.8;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                ">
                    ${r.penaltyCount > 0 ? `<span>⚠${r.penaltyCount}次 -${r.penaltyTotal}</span>` : ''}
                    <span>💀${r.deaths}</span>
                </span>
            </div>
        `).join('');
        
        const overlay = document.createElement('div');
        overlay.id = 'compete-results-overlay';
        overlay.className = 'compete-results-overlay';
        overlay.innerHTML = `
            <div class="compete-results-panel">
                <div class="compete-results-title">🏆 竞技结束 🏆</div>
                <div class="compete-results-subtitle">${waveInfo ? `波次 ${waveInfo}` : ''}</div>
                
                <div style="margin-bottom: 30px;">
                    ${rankingsHtml}
                </div>
                
                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <button id="compete-restart-btn" class="btn-cyber" style="min-width: 150px;">再来一局</button>
                    ${currentLevel < maxLevel ? '<button id="compete-next-btn" class="btn-cyber" style="min-width: 150px; border-color: #4ade80; color: #4ade80;">下一关</button>' : ''}
                    <button id="compete-menu-btn" class="btn-cyber" style="min-width: 150px; border-color: #ff00ff; color: #ff00ff;">返回主菜单</button>
                </div>
                
                <div style="margin-top: 20px; font-size: 11px; color: rgba(255, 255, 255, 0.4);">
                    按 <span style="color: #3b82f6;">西键</span> 确认选择
                </div>
            </div>
        `;
        
        this.parent.appendChild(overlay);
        document.getElementById('compete-restart-btn').addEventListener('click', () => {
            overlay.remove();
            if (onRestart) onRestart();
        });
        const nextBtn = document.getElementById('compete-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (onNextLevel) onNextLevel();
                else if (nextLevelUrl) window.location.href = nextLevelUrl;
            });
        }
        document.getElementById('compete-menu-btn').addEventListener('click', () => {
            if (onBackToMenu) onBackToMenu();
            else window.location.href = 'index.html';
        });
        if (menuSystem) {
            const menuButtons = ['compete-restart-btn'];
            if (currentLevel < maxLevel) menuButtons.push('compete-next-btn');
            menuButtons.push('compete-menu-btn');
            menuSystem.init(menuButtons, (btnId) => document.getElementById(btnId).click());
        }
        return overlay;
    }

    hideResults() {
        const overlay = document.getElementById('compete-results-overlay');
        if (overlay) overlay.remove();
    }

    reset() {
        Object.keys(this.playerScores).forEach(id => {
            this.playerScores[id] = { score: 0, deaths: 0, streak: 0, penaltyCount: 0, penaltyTotal: 0 };
        });
        this.prevRankings = {};
        this.updateLeaderboard();
    }

    clear() {
        this.playerScores = {};
        this.prevRankings = {};
        if (this.leaderboardEl) this.leaderboardEl.innerHTML = '';
    }

    getConfig(key) {
        return this.config[key];
    }

    setConfig(key, value) {
        if (this.config.hasOwnProperty(key)) this.config[key] = value;
    }

    get CORRECT_SCORE() { return this.config.CORRECT_SCORE; }
    get WRONG_PENALTY() { return this.config.WRONG_PENALTY; }
    get DEATH_PENALTY() { return this.config.DEATH_PENALTY; }
    get STREAK_BONUS() { return this.config.STREAK_BONUS; }
    get REVIVE_COOLDOWN() { return this.config.REVIVE_COOLDOWN; }
}

if (typeof window !== 'undefined') window.CompeteScoreboard = CompeteScoreboard;
if (typeof module !== 'undefined' && module.exports) module.exports = CompeteScoreboard;

