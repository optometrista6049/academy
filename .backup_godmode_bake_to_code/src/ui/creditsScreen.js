export function createCreditsScreen() {
    const panel = document.createElement('div');
    panel.id = 'creditsScreenOverlay';

    Object.assign(panel.style, {
        display: 'none',
        position: 'fixed',
        inset: '0',
        backgroundColor: '#070b14',
        backgroundImage: 'url(./assets/ui/credits11.jpg)',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center center',
        zIndex: '100005',
        cursor: 'default'
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✕';
    closeBtn.title = 'Cerrar pantalla de créditos (Esc)';
    closeBtn.setAttribute('aria-label', 'Cerrar');

    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '14px',
        right: '16px',
        width: '44px',
        height: '44px',
        fontSize: '20px',
        fontWeight: 'bold',
        borderRadius: '50%',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1.5px solid rgba(56, 189, 248, 0.65)',
        color: '#ffffff',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.75), 0 0 10px rgba(56, 189, 248, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.15s ease, background 0.15s ease',
        zIndex: '100006'
    });

    closeBtn.onmouseenter = () => {
        closeBtn.style.transform = 'scale(1.08)';
        closeBtn.style.background = 'rgba(239, 68, 68, 0.85)';
    };
    closeBtn.onmouseleave = () => {
        closeBtn.style.transform = 'scale(1)';
        closeBtn.style.background = 'rgba(15, 23, 42, 0.85)';
    };

    const close = (e) => {
        if (e) e.stopPropagation();
        panel.style.display = 'none';
        document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape' && panel.style.display !== 'none') {
            close();
        }
    };

    closeBtn.onclick = close;

    // Escuchar Escape mientras esté visible
    const observer = new MutationObserver(() => {
        if (panel.style.display !== 'none') {
            document.addEventListener('keydown', onKeyDown);
        } else {
            document.removeEventListener('keydown', onKeyDown);
        }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['style'] });

    panel.appendChild(closeBtn);
    return panel;
}