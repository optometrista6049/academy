/* ======================================================
   MONTESERIN ACADEMY - UNIVERSAL DOCUMENT VIEWER
   Visualizador de documentos a pantalla completa
   Norma general para carnets y documentos del juego.
   Totalmente aislado para PC y móvil (no cierra el Registro).
   ====================================================== */

let viewerOverlay = null;
let viewerImg = null;
let viewerTitleEl = null;

export function isDocumentViewerOpen() {
    return Boolean(viewerOverlay && viewerOverlay.classList.contains('visible') && viewerOverlay.style.display !== 'none');
}

export function openDocumentViewer(imageSrc, title = 'Documento') {
    if (!viewerOverlay) {
        buildDocumentViewer();
    }

    if (!imageSrc) {
        console.warn('openDocumentViewer: imageSrc no proporcionado.');
        return;
    }

    viewerImg.src = imageSrc;
    viewerImg.alt = title;
    if (viewerTitleEl) {
        viewerTitleEl.textContent = title;
    }

    viewerOverlay.classList.add('visible');
    viewerOverlay.style.display = 'flex';

    // Focus listener for ESC key
    window.addEventListener('keydown', handleKeyDown, true);
}

export function closeDocumentViewer() {
    if (!viewerOverlay) return;
    viewerOverlay.classList.remove('visible');
    viewerOverlay.style.display = 'none';
    window.removeEventListener('keydown', handleKeyDown, true);
}

function handleKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        closeDocumentViewer();
    }
}

function buildDocumentViewer() {
    viewerOverlay = document.createElement('div');
    viewerOverlay.id = 'documentViewerOverlay';
    viewerOverlay.className = 'documentViewerOverlay';

    // Aislar completamente todo tipo de interacción táctil y de ratón (PC y Móvil)
    // para evitar que el listener global del documento cierre el Registro de fondo.
    const stopEvents = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'];
    stopEvents.forEach(evtName => {
        viewerOverlay.addEventListener(evtName, (e) => {
            e.stopPropagation();
        }, { passive: false });
    });

    const container = document.createElement('div');
    container.className = 'documentViewerContainer';

    // Header bar with title and prominent X
    const header = document.createElement('div');
    header.className = 'documentViewerHeader';

    viewerTitleEl = document.createElement('div');
    viewerTitleEl.className = 'documentViewerTitle';
    viewerTitleEl.textContent = 'Documento';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'documentViewerCloseBtn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Cerrar documento (Esc)';
    closeBtn.setAttribute('aria-label', 'Cerrar documento');

    stopEvents.forEach(evtName => {
        closeBtn.addEventListener(evtName, (e) => {
            e.stopPropagation();
        }, { passive: false });
    });

    closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeDocumentViewer();
    };

    header.appendChild(viewerTitleEl);
    header.appendChild(closeBtn);

    // Frame with image
    const frame = document.createElement('div');
    frame.className = 'documentViewerFrame';

    viewerImg = document.createElement('img');
    viewerImg.className = 'documentViewerImage';
    viewerImg.draggable = false;

    frame.appendChild(viewerImg);
    container.appendChild(header);
    container.appendChild(frame);
    viewerOverlay.appendChild(container);

    // Close on clicking backdrop (fuera de la imagen)
    viewerOverlay.onclick = (e) => {
        e.stopPropagation();
        if (e.target === viewerOverlay) {
            closeDocumentViewer();
        }
    };

    document.body.appendChild(viewerOverlay);
}
