/**
 * 主菜单背景悬浮方块（#blocks-container）
 */
window.FloatingBlocks = (function () {
    function init() {
        const container = document.getElementById('blocks-container');
        if (!container) return;

        const count = 15;
        for (let i = 0; i < count; i++) {
            const block = document.createElement('div');
            block.className = 'block';

            const size = Math.random() * 40 + 20;
            const left = Math.random() * 100;
            const duration = Math.random() * 10 + 10;

            const delay =
                i < count / 2
                    ? -(Math.random() * duration)
                    : Math.random() * 5;

            block.style.width = `${size}px`;
            block.style.height = `${size}px`;
            block.style.left = `${left}%`;
            block.style.animationDelay = `${delay}s`;
            block.style.animationDuration = `${duration}s`;

            if (Math.random() > 0.5) {
                block.style.background = 'transparent';
                block.style.borderColor = Math.random() > 0.5 ? 'var(--primary)' : 'var(--secondary)';
                block.style.boxShadow = `0 0 10px ${block.style.borderColor}`;
            }

            container.appendChild(block);
        }
    }

    return { init };
})();
