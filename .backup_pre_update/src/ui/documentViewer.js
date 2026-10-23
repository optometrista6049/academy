/* ======================================================
   MONTESERIN ACADEMY - UNIVERSAL DOCUMENT VIEWER
   Visualizador de documentos y carnets a pantalla completa.
   Optimizado para móvil (100% viewport) y PC con:
   - Gesto de pellizcar con dos dedos (Pinch-to-zoom)
   - Desplazamiento fluido táctil y con ratón (Pan/Drag)
   - Doble toque rápido para zoom inteligente (Double-tap)
   - Botonera flotante de apoyo (+, -, reset, cerrar)
   - Cero botones de descarga (la descarga oficial permanece en Archivo)
   - Aislamiento completo de eventos táctiles para no interferir con el juego
   ====================================================== */

let viewerOverlay = null;
let viewerContainer = null;
let viewerFrame = null;
let viewerImg = null;
let viewerTitleEl = null;
let zoomBadgeEl = null;
let btnResetZoom = null;

// Estado de transformación interactiva
let currentScale = 1;
let translateX = 0;
let translateY = 0;
const MIN_SCALE = 1;
const MAX_SCALE = 4.5;

// Variables de interacción táctil y ratón
let isDragging = false;
let startPointerX = 0;
let startPointerY = 0;
let initialPinchDist = 0;
let initialScale = 1;
let isPinching = false;
let lastTapTime = 0;
let touchCount = 0;

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

    resetTransform(false);

    viewerImg.src = imageSrc;
    viewerImg.alt = title;
    if (viewerTitleEl) {
        viewerTitleEl.textContent = title;
    }

    viewerOverlay.classList.add('visible');
    viewerOverlay.style.display = 'flex';

    // Asegurar foco y captura de tecla ESC
    window.addEventListener('keydown', handleKeyDown, true);
}

export function closeDocumentViewer() {
    if (!viewerOverlay) return;
    viewerOverlay.classList.remove('visible');
    viewerOverlay.style.display = 'none';
    resetTransform(false);
    window.removeEventListener('keydown', handleKeyDown, true);
}

function handleKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        closeDocumentViewer();
    }
}

// ======================================================
// CONSTRUCCIÓN DEL VISOR (HTML / DOM)
// ======================================================

function buildDocumentViewer() {
    viewerOverlay = document.createElement('div');
    viewerOverlay.id = 'documentViewerOverlay';
    viewerOverlay.className = 'documentViewerOverlay';

    // Contenedor principal
    viewerContainer = document.createElement('div');
    viewerContainer.className = 'documentViewerContainer';

    // Barra de cabecera flotante
    const header = document.createElement('div');
    header.className = 'documentViewerHeader';

    // Información del título
    const titleArea = document.createElement('div');
    titleArea.className = 'documentViewerTitleArea';

    viewerTitleEl = document.createElement('div');
    viewerTitleEl.className = 'documentViewerTitle';
    viewerTitleEl.textContent = 'Documento';

    zoomBadgeEl = document.createElement('span');
    zoomBadgeEl.className = 'documentViewerZoomBadge';
    zoomBadgeEl.textContent = '100%';

    titleArea.appendChild(viewerTitleEl);
    titleArea.appendChild(zoomBadgeEl);

    // Controles de zoom y cierre (sin botón de descarga)
    const toolbar = document.createElement('div');
    toolbar.className = 'documentViewerToolbar';

    const btnZoomOut = document.createElement('button');
    btnZoomOut.className = 'viewerToolBtn';
    btnZoomOut.innerHTML = '&#8722;'; // Minus symbol
    btnZoomOut.title = 'Alejar zoom';
    btnZoomOut.setAttribute('aria-label', 'Alejar zoom');
    btnZoomOut.onclick = (e) => {
        e.stopPropagation();
        stepZoom(-0.5);
    };

    const btnZoomIn = document.createElement('button');
    btnZoomIn.className = 'viewerToolBtn';
    btnZoomIn.innerHTML = '&#43;'; // Plus symbol
    btnZoomIn.title = 'Acercar zoom';
    btnZoomIn.setAttribute('aria-label', 'Acercar zoom');
    btnZoomIn.onclick = (e) => {
        e.stopPropagation();
        stepZoom(0.5);
    };

    btnResetZoom = document.createElement('button');
    btnResetZoom.className = 'viewerToolBtn viewerResetBtn';
    btnResetZoom.innerHTML = '&#8634;'; // Reset circular arrow
    btnResetZoom.title = 'Restablecer tamaño (100%)';
    btnResetZoom.setAttribute('aria-label', 'Restablecer tamaño original');
    btnResetZoom.onclick = (e) => {
        e.stopPropagation();
        resetTransform(true);
    };

    const closeBtn = document.createElement('button');
    closeBtn.className = 'documentViewerCloseBtn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Cerrar documento (Esc)';
    closeBtn.setAttribute('aria-label', 'Cerrar documento');
    closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeDocumentViewer();
    };

    toolbar.appendChild(btnZoomOut);
    toolbar.appendChild(btnZoomIn);
    toolbar.appendChild(btnResetZoom);
    toolbar.appendChild(closeBtn);

    header.appendChild(titleArea);
    header.appendChild(toolbar);

    // Marco interactivo donde reside la imagen
    viewerFrame = document.createElement('div');
    viewerFrame.className = 'documentViewerFrame';

    viewerImg = document.createElement('img');
    viewerImg.className = 'documentViewerImage';
    viewerImg.draggable = false;

    viewerFrame.appendChild(viewerImg);
    viewerContainer.appendChild(header);
    viewerContainer.appendChild(viewerFrame);
    viewerOverlay.appendChild(viewerContainer);

    // Cerrar al pulsar el fondo oscuro fuera de la barra o marco
    viewerOverlay.onclick = (e) => {
        if (e.target === viewerOverlay) {
            closeDocumentViewer();
        }
    };

    // Registrar gestos interactivos (Pinch, Pan, Double-tap, Wheel)
    setupGestureInteractions(viewerFrame, viewerImg);

    document.body.appendChild(viewerOverlay);
}

// ======================================================
// SISTEMA DE TRANSFORMACIÓN Y ZOOM INTERACTIVO
// ======================================================

function setTransform(scale, tx, ty, animate = false) {
    currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

    if (currentScale <= 1) {
        translateX = 0;
        translateY = 0;
    } else {
        translateX = tx;
        translateY = ty;
        clampPosition();
    }

    if (viewerImg) {
        viewerImg.style.transition = animate ? 'transform 0.25s cubic-bezier(0.2, 0, 0.2, 1)' : 'none';
        viewerImg.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${currentScale})`;

        // Cambiar cursor para indicar arrastre disponible
        if (currentScale > 1) {
            viewerImg.style.cursor = isDragging ? 'grabbing' : 'grab';
        } else {
            viewerImg.style.cursor = 'zoom-in';
        }
    }

    // Actualizar indicador de zoom en la barra superior
    if (zoomBadgeEl) {
        zoomBadgeEl.textContent = `${Math.round(currentScale * 100)}%`;
    }

    if (btnResetZoom) {
        btnResetZoom.style.opacity = currentScale > 1 ? '1' : '0.5';
    }
}

function resetTransform(animate = true) {
    setTransform(1, 0, 0, animate);
}

function stepZoom(delta) {
    const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale + delta));
    setTransform(targetScale, translateX, translateY, true);
}

function clampPosition() {
    if (!viewerImg || !viewerFrame) return;
    if (currentScale <= 1) {
        translateX = 0;
        translateY = 0;
        return;
    }

    const frameRect = viewerFrame.getBoundingClientRect();
    const imgWidth = viewerImg.offsetWidth * currentScale;
    const imgHeight = viewerImg.offsetHeight * currentScale;

    // Permitir desplazarse hasta el límite de la imagen ampliada
    const maxTranslateX = Math.max(0, (imgWidth - frameRect.width) / 2 + 40);
    const maxTranslateY = Math.max(0, (imgHeight - frameRect.height) / 2 + 40);

    translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
    translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
}

// ======================================================
// GESTOS TÁCTILES (PINCH-TO-ZOOM, PAN, DOUBLE TAP) Y RATÓN
// ======================================================

function setupGestureInteractions(frame, img) {
    // Aislar completamente para que no afecte al juego de fondo
    ['mousedown', 'mousemove', 'mouseup', 'click'].forEach(evtName => {
        frame.addEventListener(evtName, (e) => e.stopPropagation(), { passive: false });
    });

    // --------------------------------------------------
    // EVENTOS TÁCTILES MÓVILES (TOUCH)
    // --------------------------------------------------

    frame.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        touchCount = e.touches.length;

        // Doble toque rápido con 1 dedo para zoom inteligente
        if (touchCount === 1) {
            const now = Date.now();
            const timeSinceLast = now - lastTapTime;

            if (timeSinceLast < 320 && timeSinceLast > 40) {
                // Doble toque detectado
                e.preventDefault();
                if (currentScale > 1.2) {
                    resetTransform(true);
                } else {
                    setTransform(2.5, 0, 0, true);
                }
                lastTapTime = 0;
                return;
            }
            lastTapTime = now;

            // Iniciar arrastre con 1 dedo
            isDragging = true;
            startPointerX = e.touches[0].clientX - translateX;
            startPointerY = e.touches[0].clientY - translateY;
        } else if (touchCount === 2) {
            // Iniciar gesto de pellizcar con 2 dedos (Pinch)
            isPinching = true;
            isDragging = false;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            initialPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            initialScale = currentScale;
        }
    }, { passive: false });

    frame.addEventListener('touchmove', (e) => {
        e.stopPropagation();
        e.preventDefault(); // Prevenir scroll o zoom nativo del navegador

        if (e.touches.length === 2 && isPinching) {
            // Pellizcar para ampliar o reducir
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

            if (initialPinchDist > 0) {
                const ratio = currentDist / initialPinchDist;
                const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, initialScale * ratio));
                setTransform(newScale, translateX, translateY, false);
            }
        } else if (e.touches.length === 1 && isDragging && currentScale > 1) {
            // Desplazar documento con 1 dedo cuando hay zoom
            const clientX = e.touches[0].clientX;
            const clientY = e.touches[0].clientY;
            setTransform(currentScale, clientX - startPointerX, clientY - startPointerY, false);
        }
    }, { passive: false });

    frame.addEventListener('touchend', (e) => {
        e.stopPropagation();
        touchCount = e.touches.length;

        if (touchCount === 0) {
            isDragging = false;
            isPinching = false;
            // Si el zoom quedó menor a 1 por el gesto elástico, rebotar a 100%
            if (currentScale <= 1) {
                resetTransform(true);
            } else {
                setTransform(currentScale, translateX, translateY, true);
            }
        } else if (touchCount === 1) {
            // Queda un dedo en pantalla
            isPinching = false;
            isDragging = true;
            startPointerX = e.touches[0].clientX - translateX;
            startPointerY = e.touches[0].clientY - translateY;
        }
    }, { passive: false });

    frame.addEventListener('touchcancel', (e) => {
        e.stopPropagation();
        isDragging = false;
        isPinching = false;
        if (currentScale <= 1) resetTransform(true);
    }, { passive: false });

    // --------------------------------------------------
    // EVENTOS DE RATÓN PARA ESCRITORIO (PC)
    // --------------------------------------------------

    frame.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.35 : -0.35;
        stepZoom(delta);
    }, { passive: false });

    frame.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Solo clic izquierdo
        e.preventDefault();
        isDragging = true;
        startPointerX = e.clientX - translateX;
        startPointerY = e.clientY - translateY;
        img.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || currentScale <= 1) return;
        e.preventDefault();
        setTransform(currentScale, e.clientX - startPointerX, e.clientY - startPointerY, false);
    });

    window.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        if (viewerImg && currentScale > 1) {
            viewerImg.style.cursor = 'grab';
        }
        if (currentScale <= 1) {
            resetTransform(true);
        } else {
            setTransform(currentScale, translateX, translateY, true);
        }
    });

    // Clic en la imagen cuando está al 100%: zoom directo al 2x
    img.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentScale === 1) {
            setTransform(2.2, 0, 0, true);
        }
    });
}
