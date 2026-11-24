/* ======================================================
   MONTESERIN ACADEMY - UNIVERSAL DOCUMENT VIEWER
   Visualizador in-game de documentos (imágenes y PDFs reales en modal)
   - Renderizado nativo de PDF en <canvas> mediante PDF.js (sin sacar del juego)
   - Paginación (◀ / ▶), ajuste Página completa / Ancho y zoom nítido HiDPI
   - Gestos táctiles (pinch-to-zoom, pan, doble toque) y controles de ratón
   - Diseño adaptativo sin solapamientos (barra lateral en móvil apaisado)
   ====================================================== */

import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).href;

let viewerOverlay = null;
let viewerContainer = null;
let viewerHeader = null;
let viewerFrame = null;
let viewerImg = null;
let viewerPdfStage = null;
let viewerPdfCanvas = null;
let viewerPdfStatus = null;
let viewerTitleEl = null;
let zoomBadgeEl = null;

// Controles PDF
let pdfControlsWrap = null;
let btnPdfPrev = null;
let btnPdfNext = null;
let pdfPageLabel = null;
let btnPdfFit = null;

// Controles Zoom
let btnZoomOut = null;
let btnZoomIn = null;
let btnResetZoom = null;

let isPdfMode = false;

// Estado de transformación interactiva
let currentScale = 1;
let translateX = 0;
let translateY = 0;
const MIN_SCALE = 1;
const MAX_SCALE = 4.5;

// Estado PDF
let pdfDoc = null;
let pdfLoadingTask = null;
let pdfRenderTask = null;
let pdfLoadToken = 0;
let pdfCurrentPage = 1;
let pdfTotalPages = 1;
let pdfFitMode = 'page'; // 'page' | 'width'
let pdfResizeTimer = null;
let pdfZoomDebounceTimer = null;

// Variables de interacción táctil y ratón
let isDragging = false;
let startPointerX = 0;
let startPointerY = 0;
let startScrollLeft = 0;
let startScrollTop = 0;
let initialPinchDist = 0;
let initialScale = 1;
let isPinching = false;
let lastTapTime = 0;
let touchCount = 0;

export function isDocumentViewerOpen() {
    return Boolean(viewerOverlay && viewerOverlay.classList.contains('visible') && viewerOverlay.style.display !== 'none');
}

export function openDocumentViewer(docSrc, title = 'Documento') {
    if (!viewerOverlay) {
        buildDocumentViewer();
    }

    if (!docSrc) {
        console.warn('openDocumentViewer: docSrc no proporcionado.');
        return;
    }

    cleanupPdfResources();
    resetTransform(false);

    const isPdf = /\.pdf(\?.*|#.*)?$/i.test(String(docSrc)) || String(docSrc).startsWith('data:application/pdf');
    isPdfMode = isPdf;
    pdfFitMode = 'page';
    pdfCurrentPage = 1;
    pdfTotalPages = 1;

    if (viewerContainer) {
        viewerContainer.classList.toggle('pdfMode', isPdf);
    }
    if (viewerFrame) {
        viewerFrame.classList.toggle('pdfMode', isPdf);
        viewerFrame.classList.remove('pdfScrollable');
        viewerFrame.scrollTop = 0;
        viewerFrame.scrollLeft = 0;
    }
    if (pdfControlsWrap) {
        pdfControlsWrap.style.display = isPdf ? 'flex' : 'none';
    }
    [zoomBadgeEl, btnZoomOut, btnZoomIn, btnResetZoom].forEach((el) => {
        if (el) el.style.display = '';
    });

    if (viewerTitleEl) {
        viewerTitleEl.textContent = title;
        viewerTitleEl.title = title;
    }
    if (viewerHeader) {
        viewerHeader.title = title;
    }

    viewerOverlay.classList.add('visible');
    viewerOverlay.style.display = 'flex';

    // Captura de teclado y eventos globales
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('resize', handleWindowResize);

    if (isPdf) {
        viewerImg.style.display = 'none';
        viewerImg.removeAttribute('src');
        if (viewerPdfStage) viewerPdfStage.style.display = 'flex';
        if (viewerPdfCanvas) viewerPdfCanvas.style.display = 'none';
        updatePdfControlsUI();
        // Esperar un frame para que viewerFrame tenga medidas reales antes de calcular escala PDF
        requestAnimationFrame(() => {
            loadPdfDocument(docSrc);
        });
    } else {
        if (viewerPdfStage) viewerPdfStage.style.display = 'none';
        viewerImg.style.display = 'block';
        viewerImg.src = docSrc;
        viewerImg.alt = title;
    }
}

export function closeDocumentViewer() {
    if (!viewerOverlay) return;
    isDragging = false;
    isPinching = false;
    isPdfMode = false;
    cleanupPdfResources();

    if (viewerContainer) viewerContainer.classList.remove('pdfMode');
    if (viewerFrame) {
        viewerFrame.classList.remove('pdfMode', 'pdfScrollable');
    }
    if (viewerPdfStage) viewerPdfStage.style.display = 'none';
    if (pdfControlsWrap) pdfControlsWrap.style.display = 'none';

    viewerOverlay.classList.remove('visible');
    viewerOverlay.style.display = 'none';
    resetTransform(false);

    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('resize', handleWindowResize);
}

// ======================================================
// MOTOR PDF EN MODAL IN-GAME (PDF.JS -> CANVAS)
// ======================================================

function cleanupPdfResources() {
    pdfLoadToken++;
    if (pdfResizeTimer) {
        clearTimeout(pdfResizeTimer);
        pdfResizeTimer = null;
    }
    if (pdfZoomDebounceTimer) {
        clearTimeout(pdfZoomDebounceTimer);
        pdfZoomDebounceTimer = null;
    }
    if (pdfRenderTask) {
        try { pdfRenderTask.cancel(); } catch (_) {}
        pdfRenderTask = null;
    }
    if (pdfLoadingTask) {
        try { pdfLoadingTask.destroy(); } catch (_) {}
        pdfLoadingTask = null;
    }
    if (pdfDoc) {
        try { pdfDoc.destroy(); } catch (_) {}
        pdfDoc = null;
    }
    if (viewerPdfCanvas) {
        viewerPdfCanvas.style.transform = '';
        const ctx = viewerPdfCanvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, viewerPdfCanvas.width, viewerPdfCanvas.height);
        }
    }
    setPdfStatus('');
}

function setPdfStatus(msg, isError = false) {
    if (!viewerPdfStatus) return;
    if (!msg) {
        viewerPdfStatus.style.display = 'none';
        viewerPdfStatus.textContent = '';
        viewerPdfStatus.classList.remove('error');
        return;
    }
    viewerPdfStatus.style.display = 'flex';
    viewerPdfStatus.textContent = msg;
    viewerPdfStatus.classList.toggle('error', isError);
}

async function loadPdfDocument(pdfSrc) {
    const token = ++pdfLoadToken;
    setPdfStatus('Cargando documento PDF...');

    try {
        pdfLoadingTask = pdfjsLib.getDocument(pdfSrc);
        const loadedDoc = await pdfLoadingTask.promise;

        if (token !== pdfLoadToken || !isDocumentViewerOpen()) {
            try { loadedDoc.destroy(); } catch (_) {}
            return;
        }

        pdfDoc = loadedDoc;
        pdfTotalPages = Math.max(1, pdfDoc.numPages || 1);
        pdfCurrentPage = 1;
        updatePdfControlsUI();
        await renderPdfPage(pdfCurrentPage, token);
    } catch (err) {
        if (token !== pdfLoadToken) return;
        console.error('Error cargando PDF en visor modal:', err);
        setPdfStatus('No se pudo cargar este documento PDF dentro del visor.', true);
    }
}

async function renderPdfPage(pageNumber, token = pdfLoadToken) {
    if (!pdfDoc || !viewerPdfCanvas || !viewerFrame) return;
    if (token !== pdfLoadToken) return;

    const targetPage = Math.max(1, Math.min(pdfTotalPages, pageNumber));
    pdfCurrentPage = targetPage;
    updatePdfControlsUI();

    if (pdfRenderTask) {
        try { pdfRenderTask.cancel(); } catch (_) {}
        pdfRenderTask = null;
    }

    try {
        const page = await pdfDoc.getPage(targetPage);
        if (token !== pdfLoadToken || !isDocumentViewerOpen()) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const frameW = Math.max(220, viewerFrame.clientWidth - 20);
        const frameH = Math.max(180, viewerFrame.clientHeight - 20);

        const fitWidthScale = frameW / baseViewport.width;
        const fitPageScale = Math.min(fitWidthScale, frameH / baseViewport.height);
        const baseFitScale = pdfFitMode === 'width' ? fitWidthScale : fitPageScale;

        const cssScale = Math.max(0.2, baseFitScale * currentScale);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        const cssViewport = page.getViewport({ scale: cssScale });
        const renderViewport = page.getViewport({ scale: cssScale * dpr });

        viewerPdfCanvas.style.transform = '';
        viewerPdfCanvas.width = Math.max(1, Math.floor(renderViewport.width));
        viewerPdfCanvas.height = Math.max(1, Math.floor(renderViewport.height));
        viewerPdfCanvas.style.width = `${Math.floor(cssViewport.width)}px`;
        viewerPdfCanvas.style.height = `${Math.floor(cssViewport.height)}px`;
        viewerPdfCanvas.style.display = 'block';

        const ctx = viewerPdfCanvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewerPdfCanvas.width, viewerPdfCanvas.height);

        const task = page.render({
            canvasContext: ctx,
            viewport: renderViewport
        });
        pdfRenderTask = task;

        await task.promise;
        if (pdfRenderTask === task) {
            pdfRenderTask = null;
        }
        if (token !== pdfLoadToken) return;

        setPdfStatus('');
        syncPdfScrollMode();
    } catch (err) {
        if (err && err.name === 'RenderingCancelledException') return;
        if (token !== pdfLoadToken) return;
        console.error('Error renderizando página PDF:', err);
        setPdfStatus('Error al renderizar la página del PDF.', true);
    }
}

function syncPdfScrollMode() {
    if (!viewerFrame || !isPdfMode) return;
    const isScrollable = currentScale > 1.02 || pdfFitMode === 'width' ||
        (viewerPdfCanvas && (
            viewerPdfCanvas.offsetWidth > viewerFrame.clientWidth - 8 ||
            viewerPdfCanvas.offsetHeight > viewerFrame.clientHeight - 8
        ));
    viewerFrame.classList.toggle('pdfScrollable', Boolean(isScrollable));
    if (viewerPdfCanvas) {
        viewerPdfCanvas.style.cursor = isScrollable ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in';
    }
}

function changePdfPage(delta) {
    if (!isPdfMode || !pdfDoc) return;
    const next = Math.max(1, Math.min(pdfTotalPages, pdfCurrentPage + delta));
    if (next === pdfCurrentPage) return;
    if (viewerFrame) {
        viewerFrame.scrollTop = 0;
        viewerFrame.scrollLeft = 0;
    }
    renderPdfPage(next);
}

function togglePdfFitMode() {
    if (!isPdfMode || !pdfDoc) return;
    pdfFitMode = pdfFitMode === 'page' ? 'width' : 'page';
    currentScale = 1;
    if (viewerFrame) {
        viewerFrame.scrollTop = 0;
        viewerFrame.scrollLeft = 0;
    }
    updateZoomIndicators();
    updatePdfControlsUI();
    renderPdfPage(pdfCurrentPage);
}

function updatePdfControlsUI() {
    if (pdfPageLabel) {
        pdfPageLabel.textContent = `${pdfCurrentPage}/${pdfTotalPages}`;
    }
    if (btnPdfPrev) {
        btnPdfPrev.disabled = !pdfDoc || pdfCurrentPage <= 1;
    }
    if (btnPdfNext) {
        btnPdfNext.disabled = !pdfDoc || pdfCurrentPage >= pdfTotalPages;
    }
    if (btnPdfFit) {
        const isWidth = pdfFitMode === 'width';
        btnPdfFit.classList.toggle('activeMode', isWidth);
        btnPdfFit.innerHTML = isWidth ? '&#9635;' : '&#8660;';
        btnPdfFit.title = isWidth ? 'Ajustar a página completa' : 'Ajustar al ancho para lectura';
    }
}

function handleWindowResize() {
    if (!isDocumentViewerOpen() || !isPdfMode || !pdfDoc) return;
    if (pdfResizeTimer) clearTimeout(pdfResizeTimer);
    pdfResizeTimer = setTimeout(() => {
        if (isDocumentViewerOpen() && isPdfMode && pdfDoc) {
            renderPdfPage(pdfCurrentPage);
        }
    }, 120);
}

// ======================================================
// EVENTOS GLOBALES DE RATÓN Y TECLADO
// ======================================================

function handleWindowMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    if (isPdfMode) {
        if (viewerFrame && viewerFrame.classList.contains('pdfScrollable')) {
            viewerFrame.scrollLeft = startScrollLeft - (e.clientX - startPointerX);
            viewerFrame.scrollTop = startScrollTop - (e.clientY - startPointerY);
        }
        return;
    }
    if (currentScale <= 1) return;
    setTransform(currentScale, e.clientX - startPointerX, e.clientY - startPointerY, false);
}

function handleWindowMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    if (isPdfMode) {
        syncPdfScrollMode();
        return;
    }
    if (viewerImg && currentScale > 1) {
        viewerImg.style.cursor = 'grab';
    }
    if (currentScale <= 1) {
        resetTransform(true);
    } else {
        setTransform(currentScale, translateX, translateY, true);
    }
}

function handleWindowBlur() {
    isDragging = false;
    isPinching = false;
    if (!isPdfMode && viewerImg && currentScale > 1) {
        viewerImg.style.cursor = 'grab';
    }
}

function handleKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        closeDocumentViewer();
        return;
    }
    if (isPdfMode && pdfDoc) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            e.preventDefault();
            e.stopPropagation();
            changePdfPage(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            e.preventDefault();
            e.stopPropagation();
            changePdfPage(-1);
        }
    }
}

// ======================================================
// CONSTRUCCIÓN DEL VISOR (HTML / DOM)
// ======================================================

function buildDocumentViewer() {
    viewerOverlay = document.createElement('div');
    viewerOverlay.id = 'documentViewerOverlay';
    viewerOverlay.className = 'documentViewerOverlay';

    viewerContainer = document.createElement('div');
    viewerContainer.className = 'documentViewerContainer';

    // Barra de herramientas (arriba en PC/portrait, rail lateral derecho en móvil apaisado)
    viewerHeader = document.createElement('div');
    viewerHeader.className = 'documentViewerHeader';

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

    const toolbar = document.createElement('div');
    toolbar.className = 'documentViewerToolbar';

    // Grupo exclusivo de PDF (oculto en imágenes)
    pdfControlsWrap = document.createElement('div');
    pdfControlsWrap.className = 'viewerPdfControls';
    pdfControlsWrap.style.display = 'none';

    btnPdfPrev = document.createElement('button');
    btnPdfPrev.className = 'viewerToolBtn viewerPdfNavBtn';
    btnPdfPrev.innerHTML = '&#9664;';
    btnPdfPrev.title = 'Página anterior';
    btnPdfPrev.setAttribute('aria-label', 'Página anterior');
    btnPdfPrev.onclick = (e) => {
        e.stopPropagation();
        changePdfPage(-1);
    };

    pdfPageLabel = document.createElement('span');
    pdfPageLabel.className = 'viewerPdfPageBadge';
    pdfPageLabel.textContent = '1/1';

    btnPdfNext = document.createElement('button');
    btnPdfNext.className = 'viewerToolBtn viewerPdfNavBtn';
    btnPdfNext.innerHTML = '&#9654;';
    btnPdfNext.title = 'Siguiente página';
    btnPdfNext.setAttribute('aria-label', 'Siguiente página');
    btnPdfNext.onclick = (e) => {
        e.stopPropagation();
        changePdfPage(1);
    };

    btnPdfFit = document.createElement('button');
    btnPdfFit.className = 'viewerToolBtn viewerPdfFitBtn';
    btnPdfFit.innerHTML = '&#8660;';
    btnPdfFit.title = 'Ajustar al ancho para lectura';
    btnPdfFit.setAttribute('aria-label', 'Alternar ajuste de página o ancho');
    btnPdfFit.onclick = (e) => {
        e.stopPropagation();
        togglePdfFitMode();
    };

    pdfControlsWrap.appendChild(btnPdfPrev);
    pdfControlsWrap.appendChild(pdfPageLabel);
    pdfControlsWrap.appendChild(btnPdfNext);
    pdfControlsWrap.appendChild(btnPdfFit);

    // Controles de zoom universales
    btnZoomOut = document.createElement('button');
    btnZoomOut.className = 'viewerToolBtn';
    btnZoomOut.innerHTML = '&#8722;';
    btnZoomOut.title = 'Alejar zoom';
    btnZoomOut.setAttribute('aria-label', 'Alejar zoom');
    btnZoomOut.onclick = (e) => {
        e.stopPropagation();
        stepZoom(-0.5);
    };

    btnZoomIn = document.createElement('button');
    btnZoomIn.className = 'viewerToolBtn';
    btnZoomIn.innerHTML = '&#43;';
    btnZoomIn.title = 'Acercar zoom';
    btnZoomIn.setAttribute('aria-label', 'Acercar zoom');
    btnZoomIn.onclick = (e) => {
        e.stopPropagation();
        stepZoom(0.5);
    };

    btnResetZoom = document.createElement('button');
    btnResetZoom.className = 'viewerToolBtn viewerResetBtn';
    btnResetZoom.innerHTML = '&#8634;';
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

    toolbar.appendChild(pdfControlsWrap);
    toolbar.appendChild(btnZoomOut);
    toolbar.appendChild(btnZoomIn);
    toolbar.appendChild(btnResetZoom);
    toolbar.appendChild(closeBtn);

    viewerHeader.appendChild(titleArea);
    viewerHeader.appendChild(toolbar);

    // Área útil del documento (imagen o canvas PDF)
    viewerFrame = document.createElement('div');
    viewerFrame.className = 'documentViewerFrame styledScrollbar';

    viewerImg = document.createElement('img');
    viewerImg.className = 'documentViewerImage';
    viewerImg.draggable = false;

    viewerPdfStage = document.createElement('div');
    viewerPdfStage.className = 'documentViewerPdfStage';
    viewerPdfStage.style.display = 'none';

    viewerPdfCanvas = document.createElement('canvas');
    viewerPdfCanvas.className = 'documentViewerPdfCanvas';

    viewerPdfStatus = document.createElement('div');
    viewerPdfStatus.className = 'documentViewerPdfStatus';
    viewerPdfStatus.style.display = 'none';

    viewerPdfStage.appendChild(viewerPdfCanvas);
    viewerPdfStage.appendChild(viewerPdfStatus);

    viewerFrame.appendChild(viewerImg);
    viewerFrame.appendChild(viewerPdfStage);

    viewerContainer.appendChild(viewerHeader);
    viewerContainer.appendChild(viewerFrame);
    viewerOverlay.appendChild(viewerContainer);

    viewerOverlay.onclick = (e) => {
        if (e.target === viewerOverlay) {
            closeDocumentViewer();
        }
    };

    setupGestureInteractions(viewerFrame, viewerImg);

    document.body.appendChild(viewerOverlay);
}

// ======================================================
// SISTEMA DE TRANSFORMACIÓN Y ZOOM INTERACTIVO
// ======================================================

function updateZoomIndicators() {
    if (zoomBadgeEl) {
        zoomBadgeEl.textContent = `${Math.round(currentScale * 100)}%`;
    }
    if (btnResetZoom) {
        const modified = currentScale > 1 || (isPdfMode && pdfFitMode !== 'page');
        btnResetZoom.style.opacity = modified ? '1' : '0.5';
    }
}

function setTransform(scale, tx, ty, animate = false) {
    currentScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

    if (isPdfMode) {
        updateZoomIndicators();
        if (pdfDoc) {
            if (pdfZoomDebounceTimer) clearTimeout(pdfZoomDebounceTimer);
            pdfZoomDebounceTimer = setTimeout(() => {
                renderPdfPage(pdfCurrentPage);
            }, animate ? 10 : 70);
        }
        return;
    }

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

        if (currentScale > 1) {
            viewerImg.style.cursor = isDragging ? 'grabbing' : 'grab';
        } else {
            viewerImg.style.cursor = 'zoom-in';
        }
    }

    updateZoomIndicators();
}

function resetTransform(animate = true) {
    if (isPdfMode) {
        currentScale = 1;
        pdfFitMode = 'page';
        if (viewerFrame) {
            viewerFrame.scrollTop = 0;
            viewerFrame.scrollLeft = 0;
        }
        updateZoomIndicators();
        updatePdfControlsUI();
        if (pdfDoc) {
            renderPdfPage(pdfCurrentPage);
        }
        return;
    }
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

    const maxTranslateX = Math.max(0, (imgWidth - frameRect.width) / 2 + 40);
    const maxTranslateY = Math.max(0, (imgHeight - frameRect.height) / 2 + 40);

    translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX));
    translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY));
}

// ======================================================
// GESTOS TÁCTILES (PINCH-TO-ZOOM, PAN, DOUBLE TAP) Y RATÓN
// ======================================================

function setupGestureInteractions(frame, img) {
    ['mousedown', 'mousemove', 'mouseup', 'click'].forEach((evtName) => {
        frame.addEventListener(evtName, (e) => e.stopPropagation(), { passive: false });
    });

    frame.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        touchCount = e.touches.length;

        if (touchCount === 1) {
            const now = Date.now();
            const timeSinceLast = now - lastTapTime;

            if (timeSinceLast < 320 && timeSinceLast > 40) {
                e.preventDefault();
                if (currentScale > 1.2) {
                    resetTransform(true);
                } else {
                    setTransform(2.0, 0, 0, true);
                }
                lastTapTime = 0;
                return;
            }
            lastTapTime = now;

            if (!isPdfMode) {
                isDragging = true;
                startPointerX = e.touches[0].clientX - translateX;
                startPointerY = e.touches[0].clientY - translateY;
            }
        } else if (touchCount === 2) {
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

        if (e.touches.length === 2 && isPinching) {
            e.preventDefault();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

            if (initialPinchDist > 0) {
                const ratio = currentDist / initialPinchDist;
                const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, initialScale * ratio));
                if (isPdfMode) {
                    currentScale = newScale;
                    updateZoomIndicators();
                    if (viewerPdfCanvas) {
                        const previewRatio = newScale / Math.max(0.5, initialScale);
                        viewerPdfCanvas.style.transform = `scale(${previewRatio.toFixed(3)})`;
                    }
                } else {
                    setTransform(newScale, translateX, translateY, false);
                }
            }
            return;
        }

        if (isPdfMode) {
            // Permitir desplazamiento táctil nativo cuando el PDF tiene scroll
            return;
        }

        e.preventDefault();
        if (e.touches.length === 1 && isDragging && currentScale > 1) {
            const clientX = e.touches[0].clientX;
            const clientY = e.touches[0].clientY;
            setTransform(currentScale, clientX - startPointerX, clientY - startPointerY, false);
        }
    }, { passive: false });

    frame.addEventListener('touchend', (e) => {
        e.stopPropagation();
        touchCount = e.touches.length;

        if (touchCount === 0) {
            const wasPinching = isPinching;
            isDragging = false;
            isPinching = false;

            if (isPdfMode) {
                if (wasPinching) {
                    if (viewerPdfCanvas) viewerPdfCanvas.style.transform = '';
                    if (currentScale <= 1.05) {
                        currentScale = 1;
                    }
                    updateZoomIndicators();
                    renderPdfPage(pdfCurrentPage);
                }
                return;
            }

            if (currentScale <= 1) {
                resetTransform(true);
            } else {
                setTransform(currentScale, translateX, translateY, true);
            }
        } else if (touchCount === 1 && !isPdfMode) {
            isPinching = false;
            isDragging = true;
            startPointerX = e.touches[0].clientX - translateX;
            startPointerY = e.touches[0].clientY - translateY;
        }
    }, { passive: false });

    frame.addEventListener('touchcancel', (e) => {
        e.stopPropagation();
        const wasPinching = isPinching;
        isDragging = false;
        isPinching = false;
        if (isPdfMode) {
            if (wasPinching && viewerPdfCanvas) {
                viewerPdfCanvas.style.transform = '';
                renderPdfPage(pdfCurrentPage);
            }
            return;
        }
        if (currentScale <= 1) resetTransform(true);
    }, { passive: false });

    // Rueda del ratón (en PDF deja hacer scroll si ya está ampliado/ajustado a ancho, salvo Ctrl+rueda)
    frame.addEventListener('wheel', (e) => {
        e.stopPropagation();
        if (isPdfMode && !e.ctrlKey && frame.classList.contains('pdfScrollable')) {
            return;
        }
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.35 : -0.35;
        stepZoom(delta);
    }, { passive: false });

    frame.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (isPdfMode) {
            if (!frame.classList.contains('pdfScrollable')) return;
            e.preventDefault();
            isDragging = true;
            startPointerX = e.clientX;
            startPointerY = e.clientY;
            startScrollLeft = frame.scrollLeft;
            startScrollTop = frame.scrollTop;
            if (viewerPdfCanvas) viewerPdfCanvas.style.cursor = 'grabbing';
            return;
        }
        e.preventDefault();
        isDragging = true;
        startPointerX = e.clientX - translateX;
        startPointerY = e.clientY - translateY;
        img.style.cursor = 'grabbing';
    });

    img.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isPdfMode) return;
        if (currentScale === 1) {
            setTransform(2.2, 0, 0, true);
        }
    });

    if (viewerPdfCanvas) {
        viewerPdfCanvas.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isPdfMode || isDragging) return;
            if (currentScale === 1 && pdfFitMode === 'page') {
                setTransform(1.75, 0, 0, true);
            }
        });
    }
}
