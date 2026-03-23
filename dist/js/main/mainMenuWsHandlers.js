window.MainMenuWsHandlers = (function () {
    function registerInputHandlers(options) {
        const {
            target,
            controllerInputs,
            controllerManager,
            controlHint
        } = options || {};

        if (!target || !controllerInputs || !controllerManager) {
            console.warn('[MainMenuWsHandlers] 缺少必要依赖，跳过注册');
            return;
        }

        function ensureControllerInputState(id) {
            if (!controllerInputs[id]) {
                controllerInputs[id] = {
                    joystick: { x: 0, y: 0 },
                    buttons: { N: false, S: false, E: false, W: false }
                };
            }
            return controllerInputs[id];
        }

        function applyControllerIncrementalUpdate(id, partialJoystick, partialButtons) {
            const currentInput = controllerManager.getInput(id);
            const state = ensureControllerInputState(id);

            const nextJoystick = partialJoystick || (currentInput ? currentInput.joystick : state.joystick);
            const nextButtons = partialButtons || (currentInput ? currentInput.buttons : state.buttons);

            controllerManager.updateControllerInput(id, nextJoystick, nextButtons);
            state.joystick = nextJoystick;
            state.buttons = nextButtons;
        }

        target.wsState = function (data) {
            const id = data.controller_id;
            controllerManager.updateControllerInput(id, data.joystick, data.buttons);

            const state = ensureControllerInputState(id);
            state.joystick = data.joystick;
            state.buttons = data.buttons;

            const hasInput = Math.abs(data.joystick.x) > 0.1 ||
                Math.abs(data.joystick.y) > 0.1 ||
                data.buttons.N || data.buttons.S ||
                data.buttons.E || data.buttons.W;
            if (hasInput && controlHint && typeof controlHint.show === 'function') {
                controlHint.show();
            }
        };

        target.wsJoystick = function (data) {
            applyControllerIncrementalUpdate(data.controller_id, { x: data.x, y: data.y }, null);
        };

        target.wsJoystickRelease = function (data) {
            applyControllerIncrementalUpdate(data.controller_id, { x: 0, y: 0 }, null);
        };

        target.wsButton = function (data) {
            const id = data.controller_id;
            const input = controllerManager.getInput(id) || ensureControllerInputState(id);
            const newButtons = { ...input.buttons, [data.button]: data.action === 'press' };
            applyControllerIncrementalUpdate(id, null, newButtons);
        };
    }

    return {
        registerInputHandlers
    };
})();
