window.PlayerSlotRenderer = (function () {
    function ensureCore(slot) {
        let core = slot.querySelector('.player-slot-core');
        if (core) return core;

        core = document.createElement('div');
        core.className = 'player-slot-core';
        core.style.position = 'absolute';
        core.style.left = '50%';
        core.style.top = '50%';
        core.style.transform = 'translate(-50%, -50%)';
        core.style.width = '50%';
        core.style.height = '50%';
        core.style.borderRadius = '1px';
        core.style.transition = 'all 180ms ease';
        slot.appendChild(core);
        return core;
    }

    function paintInactive(slot, core) {
        slot.style.background = 'rgba(70,70,70,0.22)';
        slot.style.borderColor = 'rgba(255,255,255,0.08)';
        slot.style.boxShadow = 'none';
        slot.style.filter = 'brightness(0.85)';
    core.style.background = 'rgba(72,72,72,0.78)';
    core.style.boxShadow = 'inset 0 0 2px rgba(255,255,255,0.08)';
    }

    function paintActive(slot, core, color) {
        const main = color?.main || '#00f2ff';
        const glow = color?.glow || main;
        const coreColor = color?.core || '#e0faff';

        slot.style.background = main;
        slot.style.borderColor = glow;
        slot.style.boxShadow = `0 0 8px ${glow}, 0 0 16px ${glow}aa, inset 0 0 6px ${glow}55`;
        slot.style.filter = 'brightness(1.05)';
        core.style.background = coreColor;
        core.style.boxShadow = `0 0 7px ${coreColor}dd`;
    }

    function renderSlots(options) {
        const { slots, isActive, getColor } = options || {};
        if (!slots || !slots.length || typeof isActive !== 'function') return;

        slots.forEach((slot, idx) => {
            const playerId = idx + 1;
            const active = !!isActive(playerId);

            slot.style.position = 'relative';
            slot.style.overflow = 'hidden';
            const core = ensureCore(slot);

            if (!active) {
                paintInactive(slot, core);
                return;
            }

            const color = typeof getColor === 'function' ? getColor(playerId) : null;
            paintActive(slot, core, color);
        });
    }

    return { renderSlots };
})();
