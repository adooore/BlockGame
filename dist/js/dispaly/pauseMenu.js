/**
 * 暂停菜单类
 * 每场景 new PauseMenu(sceneRoot, options)，场景卸载时调用 instance.destroy()
 * 实例无引用后可被 GC
 */
const PAUSE_MENU_STYLES = `
    .game-screen.pause-in {
        animation: screenPauseIn 0.35s ease-out forwards;
    }
    @keyframes screenPauseIn {
        0% { opacity: 0; visibility: visible; transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 0.8)); filter: blur(10px); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(calc(var(--menu-scale, 1) * 1.02)); filter: blur(0); }
        100% { opacity: 1; visibility: visible; transform: translate(-50%, -50%) scale(var(--menu-scale, 1)); filter: blur(0); }
    }
    .game-screen.pause-in::before {
        content: ''; position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px;
        background: linear-gradient(90deg, transparent, #00f2ff, transparent); z-index: -1; opacity: 0;
        animation: borderScan 0.3s ease-out forwards;
    }
`;

let _pauseMenuStyleInjected = false;
function _injectPauseMenuStyles() {
    if (_pauseMenuStyleInjected) return;
    const style = document.createElement('style');
    style.id = 'pause-menu-style';
    style.textContent = PAUSE_MENU_STYLES;
    document.head.appendChild(style);
    _pauseMenuStyleInjected = true;
}

class PauseMenu {
    /**
     * @param {HTMLElement} parent - 挂载父节点（场景根）
     * @param {Object} options
     * @param {function} [options.onPause]
     * @param {function} [options.onResume]
     * @param {function} [options.onRestart]
     * @param {function} [options.onBackToMenu]
     * @param {function} [options.canPause] - () => boolean
     */
    constructor(parent, options = {}) {
        this.parent = parent;
        this.onPause = options.onPause || null;
        this.onResume = options.onResume || null;
        this.onRestart = options.onRestart || null;
        this.onBackToMenu = options.onBackToMenu || (() => {
            if (typeof SceneManager !== 'undefined' && typeof SceneManager.enter === 'function') {
                SceneManager.enter('mainMenu');
            } else {
                window.location.href = 'index.html';
            }
        });
        this.canPause = options.canPause || (() => true);

        this.isPaused = false;
        this.overlay = null;
        this.panel = null;
        this.startButtonPressed = false;
        this.selectedIndex = 0;
        this.buttons = [];
        this.lastJoystickY = 0;
        this.confirmPressed = false;
        this.keydownHandler = null;
        this.gamepadPollId = null;
        this.currentScale = 1;

        _injectPauseMenuStyles();
        this._boundKeydown = this._handleGlobalKeydown.bind(this);
        window.addEventListener('keydown', this._boundKeydown);
    }

    _handleGlobalKeydown(e) {
        if (e.code === 'Escape') this.toggle();
    }

    pause() {
        if (this.canPause && !this.canPause()) return;
        if (this.isPaused) return;
        this.isPaused = true;
        this._showOverlay();
        if (this.onPause) this.onPause();
        if (typeof SoundManager !== 'undefined' && SoundManager.playClick) SoundManager.playClick();
    }

    resume() {
        if (!this.isPaused) return;
        this.isPaused = false;
        this._hideOverlay();
        if (this.onResume) this.onResume();
        if (typeof SoundManager !== 'undefined' && SoundManager.playClick) SoundManager.playClick();
    }

    toggle() {
        if (this.isPaused) this.resume();
        else this.pause();
    }

    pollGamepadStart() {
        let anyStartPressed = false;
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gamepad of gamepads) {
            if (!gamepad) continue;
            if (gamepad.buttons[9]?.pressed) { anyStartPressed = true; break; }
        }
        if (!anyStartPressed && typeof ControllerManager !== 'undefined') {
            const inputs = ControllerManager.inputs;
            for (const playerId in inputs) {
                if (inputs[playerId]?.buttons?.Start) { anyStartPressed = true; break; }
            }
        }
        if (anyStartPressed && !this.startButtonPressed) {
            this.startButtonPressed = true;
            this.toggle();
        } else if (!anyStartPressed) {
            this.startButtonPressed = false;
        }
    }

    _showOverlay() {
        this._hideOverlay();
        this.overlay = document.createElement('div');
        this.overlay.id = 'pause-overlay';
        this.overlay.className = 'game-screen-overlay';
        this.parent.appendChild(this.overlay);
        requestAnimationFrame(() => this.overlay?.classList.add('visible'));

        this.panel = document.createElement('div');
        this.panel.id = 'pause-panel';
        this.panel.className = 'game-screen pause-in';
        this.panel.innerHTML = `
            <h1 class="neon-cyan">暂停</h1>
            <p class="time-label" style="margin-bottom: 24px;">PAUSED</p>
            <div class="screen-buttons">
                <button id="pause-resume-btn" class="btn-cyber menu-btn selected" data-action="resume">继续游戏</button>
                <button id="pause-restart-btn" class="btn-cyber menu-btn" data-action="restart">重新开始</button>
                <button id="pause-menu-btn" class="btn-cyber menu-btn" data-action="back">返回主菜单</button>
            </div>
            <div class="menu-hints">
                <span><span class="hint-key">W</span><span class="hint-key">S</span> 移动</span>
                <span>|</span><span><span class="hint-key">Enter</span> 确认</span>
                <span>|</span><span><span class="hint-btn hint-btn-west hint-btn-x">X</span> 确认</span>
                <span>|</span><span><span class="hint-btn hint-btn-west">西</span> 确认</span>
            </div>
        `;
        this.panel.style.setProperty('--menu-scale', this.currentScale);
        this.parent.appendChild(this.panel);

        this.panel.addEventListener('animationend', () => {
            if (this.panel) {
                this.panel.classList.remove('pause-in');
                this.panel.style.opacity = '1';
                this.panel.style.visibility = 'visible';
                this.panel.style.transform = `translate(-50%, -50%) scale(${this.currentScale})`;
            }
        }, { once: true });

        this.buttons = [
            document.getElementById('pause-resume-btn'),
            document.getElementById('pause-restart-btn'),
            document.getElementById('pause-menu-btn')
        ].filter(Boolean);
        this.selectedIndex = 0;
        this._updateSelection();
        this.buttons.forEach(btn => btn.addEventListener('click', (e) => this._handleButtonClick(e)));
        this._initMenuNavigation();
    }

    _handleButtonClick(e) {
        const action = e.currentTarget.dataset.action;
        if (action === 'resume') this.resume();
        else if (action === 'restart') {
            this._hideOverlay();
            this.isPaused = false;
            if (this.onRestart) this.onRestart();
        } else if (action === 'back') {
            if (this.onBackToMenu) this.onBackToMenu();
        }
    }

    _hideOverlay() {
        this._cleanupMenuNavigation();
        if (this.panel) {
            this.panel.classList.remove('pause-in');
            this.panel.classList.add('animate-out');
            setTimeout(() => {
                if (this.panel?.parentNode) this.panel.remove();
                this.panel = null;
            }, 250);
        }
        if (this.overlay) {
            this.overlay.classList.remove('visible');
            setTimeout(() => {
                if (this.overlay?.parentNode) this.overlay.remove();
                this.overlay = null;
            }, 300);
        }
        this.buttons = [];
    }

    _updateSelection() {
        this.buttons.forEach((btn, i) => {
            if (i === this.selectedIndex) btn.classList.add('selected');
            else btn.classList.remove('selected');
        });
    }

    _initMenuNavigation() {
        this.lastJoystickY = 0;
        this.confirmPressed = false;
        this.keydownHandler = (e) => {
            if (!this.isPaused) return;
            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                    this._updateSelection();
                    if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectedIndex = Math.min(this.buttons.length - 1, this.selectedIndex + 1);
                    this._updateSelection();
                    if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
                    break;
                case 'KeyJ':
                case 'KeyU':
                case 'Enter':
                case 'Space':
                    e.preventDefault();
                    if (typeof SoundManager !== 'undefined') SoundManager.playClick?.();
                    this.buttons[this.selectedIndex]?.click();
                    break;
            }
        };
        window.addEventListener('keydown', this.keydownHandler);

        const poll = () => {
            if (!this.isPaused) return;
            let jy = 0, confirmBtnPressed = false, hasInput = false;
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (const gamepad of gamepads) {
                if (!gamepad) continue;
                jy = gamepad.axes[1] || 0;
                if (gamepad.buttons[12]?.pressed) jy = -1;
                if (gamepad.buttons[13]?.pressed) jy = 1;
                confirmBtnPressed = gamepad.buttons[2]?.pressed || false;
                if (Math.abs(jy) > 0.3 || confirmBtnPressed) { hasInput = true; break; }
            }
            if (!hasInput && typeof ControllerManager !== 'undefined') {
                for (const playerId in ControllerManager.inputs) {
                    const input = ControllerManager.inputs[playerId];
                    if (!input) continue;
                    if (input.joystick && Math.abs(input.joystick.y) > Math.abs(jy)) jy = input.joystick.y;
                    if (input.buttons?.W) confirmBtnPressed = true;
                }
            }
            if (Math.abs(jy) < 0.5) jy = 0;
            if (jy < -0.5 && this.lastJoystickY >= -0.5) {
                this.selectedIndex = Math.max(0, this.selectedIndex - 1);
                this._updateSelection();
                if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
            } else if (jy > 0.5 && this.lastJoystickY <= 0.5) {
                this.selectedIndex = Math.min(this.buttons.length - 1, this.selectedIndex + 1);
                this._updateSelection();
                if (typeof SoundManager !== 'undefined') SoundManager.playTick?.();
            }
            this.lastJoystickY = jy;
            if (confirmBtnPressed && !this.confirmPressed) {
                this.confirmPressed = true;
                if (typeof SoundManager !== 'undefined') SoundManager.playClick?.();
                this.buttons[this.selectedIndex]?.click();
            } else if (!confirmBtnPressed) this.confirmPressed = false;
            if (this.isPaused) this.gamepadPollId = requestAnimationFrame(poll);
        };
        this.gamepadPollId = requestAnimationFrame(poll);
    }

    _cleanupMenuNavigation() {
        if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }
        if (this.gamepadPollId) {
            cancelAnimationFrame(this.gamepadPollId);
            this.gamepadPollId = null;
        }
    }

    setScale(scale) {
        this.currentScale = scale;
        if (this.panel && !this.panel.classList.contains('pause-in')) {
            this.panel.style.transform = `translate(-50%, -50%) scale(${scale})`;
        }
    }

    destroy() {
        window.removeEventListener('keydown', this._boundKeydown);
        this._cleanupMenuNavigation();
        this._hideOverlay();
        this.isPaused = false;
        this.parent = null;
        this.onPause = this.onResume = this.onRestart = this.onBackToMenu = this.canPause = null;
    }
}

if (typeof window !== 'undefined') window.PauseMenu = PauseMenu;
if (typeof module !== 'undefined' && module.exports) module.exports = { PauseMenu };
