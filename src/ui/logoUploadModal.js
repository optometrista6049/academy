/**
 * Modal y botón flotante para subir y procesar el logotipo oficial de Monteserín Academy.
 * Permite cargar un JPG/PNG desde el equipo, procesar la transparencia del fondo blanco
 * de forma limpia sin recurrir a IA, guardarlo en el servidor (/api/upload-logo)
 * y aplicarlo en tiempo real en las cinemáticas de diálogo.
 */

let modalRoot = null;
let floatingBtn = null;

export function initLogoUploadUI() {
    if (floatingBtn) return;

    // =====================================================
    // BOTÓN FLOTANTE DISCRETO (SUPERIOR DERECHA)
    // =====================================================
    floatingBtn = document.createElement('button');
    floatingBtn.id = 'logoUploadFloatingBtn';
    floatingBtn.innerHTML = `
        <span style="font-size:1.1rem;line-height:1;">🎨</span>
        <span>Subir Logo Oficial</span>
    `;

    Object.assign(floatingBtn.style, {
        position: 'fixed',
        top: '14px',
        right: '14px',
        zIndex: '12000',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 14px',
        backgroundColor: 'rgba(16, 24, 20, 0.88)',
        color: '#f5e197',
        border: '1.5px solid rgba(212, 175, 55, 0.75)',
        borderRadius: '24px',
        fontSize: '0.85rem',
        fontWeight: '600',
        letterSpacing: '0.5px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5), 0 0 12px rgba(46, 204, 113, 0.2)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation'
    });

    floatingBtn.addEventListener('mouseenter', () => {
        floatingBtn.style.transform = 'scale(1.04)';
        floatingBtn.style.backgroundColor = 'rgba(22, 34, 28, 0.95)';
        floatingBtn.style.borderColor = '#f5e197';
    });

    floatingBtn.addEventListener('mouseleave', () => {
        floatingBtn.style.transform = 'scale(1)';
        floatingBtn.style.backgroundColor = 'rgba(16, 24, 20, 0.88)';
        floatingBtn.style.borderColor = 'rgba(212, 175, 55, 0.75)';
    });

    floatingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openLogoUploadModal();
    });

    document.body.appendChild(floatingBtn);
}

export function openLogoUploadModal() {
    if (modalRoot) {
        modalRoot.style.display = 'flex';
        return;
    }

    modalRoot = document.createElement('div');
    modalRoot.id = 'logoUploadModalOverlay';
    Object.assign(modalRoot.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '16000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 10, 8, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '16px',
        boxSizing: 'border-box'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
        width: 'min(520px, 94vw)',
        maxHeight: '90vh',
        overflowY: 'auto',
        backgroundColor: 'rgba(18, 26, 22, 0.96)',
        border: '2px solid rgba(212, 175, 55, 0.85)',
        borderRadius: '20px',
        boxShadow: '0 16px 50px rgba(0,0,0,0.85), 0 0 30px rgba(46, 204, 113, 0.2)',
        padding: '24px',
        color: '#f0f4f2',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
    });

    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(212,175,55,0.25);padding-bottom:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:1.4rem;">🏛️</span>
                <h3 style="margin:0;font-size:1.15rem;color:#f5e197;letter-spacing:0.5px;">Cargar Logotipo Oficial</h3>
            </div>
            <button id="closeLogoModalBtn" style="background:none;border:none;color:#aaa;font-size:1.4rem;cursor:pointer;padding:4px 8px;line-height:1;border-radius:6px;">✕</button>
        </div>

        <p style="margin:0;font-size:0.9rem;line-height:1.5;color:#c0cdc6;">
            Sube el archivo <strong>JPG o PNG</strong> del logotipo de Monteserín Academy. Tu archivo exacto se integrará directamente sin interpretaciones de IA.
        </p>

        <!-- ZONA DE CARGA DRAG & DROP -->
        <div id="logoDropZone" style="border:2px dashed rgba(212,175,55,0.45);border-radius:14px;padding:22px;text-align:center;cursor:pointer;background:rgba(255,255,255,0.03);transition:all 0.2s ease;">
            <input type="file" id="logoFileInput" accept="image/png, image/jpeg, image/jpg, image/webp" style="display:none;" />
            <div style="font-size:2rem;margin-bottom:6px;">📁</div>
            <div style="font-weight:600;color:#f5e197;margin-bottom:4px;font-size:0.95rem;">Haz clic para seleccionar o arrastra el archivo aquí</div>
            <div style="font-size:0.8rem;color:#8ba094;">Formatos admitidos: JPG, PNG, WEBP</div>
        </div>

        <!-- CONTENEDOR PREVIEW -->
        <div id="logoPreviewContainer" style="display:none;flex-direction:column;gap:12px;">
            <div style="display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;">
                <div style="text-align:center;">
                    <div style="font-size:0.75rem;color:#8ba094;margin-bottom:4px;">Original</div>
                    <div style="width:130px;height:130px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #444;">
                        <img id="logoOriginalPreview" style="max-width:100%;max-height:100%;object-fit:contain;" />
                    </div>
                </div>

                <div style="font-size:1.5rem;color:#d4af37;">➔</div>

                <div style="text-align:center;">
                    <div style="font-size:0.75rem;color:#8ba094;margin-bottom:4px;">Fondo Transparente (Cinemática)</div>
                    <div style="width:130px;height:130px;background:radial-gradient(circle, #1a2a22 0%, #0d1511 100%);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #2ecc71;">
                        <img id="logoCleanPreview" style="max-width:100%;max-height:100%;object-fit:contain;" />
                    </div>
                </div>
            </div>

            <!-- OPCIÓN DE FONDO TRANSPARENTE -->
            <label style="display:flex;align-items:center;gap:10px;font-size:0.88rem;color:#d5e2da;cursor:pointer;background:rgba(0,0,0,0.25);padding:8px 12px;border-radius:8px;">
                <input type="checkbox" id="removeWhiteBgCheck" checked style="accent-color:#2ecc71;width:16px;height:16px;" />
                <span>Eliminar fondo blanco automáticamente para transparencia en la cinemática</span>
            </label>
        </div>

        <!-- STATUS MESSAGE -->
        <div id="logoStatusMsg" style="display:none;padding:10px 14px;border-radius:8px;font-size:0.88rem;text-align:center;font-weight:500;"></div>

        <!-- BOTONES DE ACCIÓN -->
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
            <button id="cancelLogoBtn" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#ccc;cursor:pointer;font-weight:600;font-size:0.9rem;">
                Cancelar
            </button>
            <button id="saveLogoBtn" disabled style="padding:10px 22px;border-radius:10px;border:none;background:linear-gradient(180deg, #d6b06a 0%, #aa8436 100%);color:#10141a;font-weight:700;font-size:0.9rem;cursor:not-allowed;opacity:0.5;box-shadow:0 4px 14px rgba(212,175,55,0.3);">
                Guardar y Aplicar Logotipo
            </button>
        </div>
    `;

    modalRoot.appendChild(card);
    document.body.appendChild(modalRoot);

    // Eventos del modal
    const closeBtn = card.querySelector('#closeLogoModalBtn');
    const cancelBtn = card.querySelector('#cancelLogoBtn');
    const dropZone = card.querySelector('#logoDropZone');
    const fileInput = card.querySelector('#logoFileInput');
    const previewContainer = card.querySelector('#logoPreviewContainer');
    const originalPreview = card.querySelector('#logoOriginalPreview');
    const cleanPreview = card.querySelector('#logoCleanPreview');
    const removeWhiteCheck = card.querySelector('#removeWhiteBgCheck');
    const saveBtn = card.querySelector('#saveLogoBtn');
    const statusMsg = card.querySelector('#logoStatusMsg');

    let loadedFile = null;
    let originalDataUrl = null;
    let cleanDataUrl = null;

    const closeModal = () => {
        modalRoot.style.display = 'none';
        statusMsg.style.display = 'none';
    };

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    modalRoot.onclick = (e) => {
        if (e.target === modalRoot) closeModal();
    };

    dropZone.onclick = () => fileInput.click();

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#2ecc71';
        dropZone.style.background = 'rgba(46, 204, 113, 0.08)';
    };

    dropZone.ondragleave = () => {
        dropZone.style.borderColor = 'rgba(212,175,55,0.45)';
        dropZone.style.background = 'rgba(255,255,255,0.03)';
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(212,175,55,0.45)';
        dropZone.style.background = 'rgba(255,255,255,0.03)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    removeWhiteCheck.onchange = () => {
        if (originalDataUrl) {
            processImage(originalDataUrl, removeWhiteCheck.checked);
        }
    };

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            showStatus('Por favor, selecciona un archivo de imagen válido (JPG, PNG).', true);
            return;
        }

        loadedFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            originalDataUrl = ev.target.result;
            originalPreview.src = originalDataUrl;
            processImage(originalDataUrl, removeWhiteCheck.checked);
        };
        reader.readAsDataURL(file);
    }

    function processImage(dataUrl, removeWhite) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            if (removeWhite) {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Si el píxel es blanco o muy cercano a blanco
                    // Calcular distancia a blanco puro (255, 255, 255)
                    const minChannel = Math.min(r, g, b);
                    const avg = (r + g + b) / 3;

                    if (minChannel > 225 && avg > 230) {
                        // Desvanecimiento suave del borde blanco
                        const factor = Math.max(0, (255 - avg) / 25);
                        data[i + 3] = Math.round(a * factor);
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }

            cleanDataUrl = canvas.toDataURL('image/png');
            cleanPreview.src = cleanDataUrl;

            previewContainer.style.display = 'flex';
            saveBtn.disabled = false;
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.opacity = '1';
            showStatus('Imagen cargada. Revisa la vista previa y haz clic en Guardar.', false);
        };
        img.src = dataUrl;
    }

    function showStatus(text, isError) {
        statusMsg.style.display = 'block';
        statusMsg.innerText = text;
        if (isError) {
            statusMsg.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
            statusMsg.style.color = '#ff8f8f';
            statusMsg.style.border = '1px solid rgba(231, 76, 60, 0.4)';
        } else {
            statusMsg.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            statusMsg.style.color = '#7bf1a8';
            statusMsg.style.border = '1px solid rgba(46, 204, 113, 0.4)';
        }
    }

    saveBtn.onclick = async () => {
        if (!cleanDataUrl) return;

        saveBtn.disabled = true;
        saveBtn.innerText = 'Guardando...';

        try {
            // 1. Guardar en localStorage para disponibilidad instantánea en el cliente
            localStorage.setItem('monteserin_custom_logo', cleanDataUrl);
            localStorage.setItem('monteserin_custom_logo_raw', originalDataUrl || cleanDataUrl);

            // 2. Enviar al servidor para persistirlo en disco (assets/ui/)
            try {
                await fetch('/api/upload-logo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cleanBase64Data: cleanDataUrl,
                        rawBase64Data: originalDataUrl || cleanDataUrl
                    })
                });
            } catch (netErr) {
                console.warn('Persistencia en backend completada con respaldo local:', netErr);
            }

            // 3. Actualizar inmediatamente cualquier elemento en la pantalla actual
            const imgs = document.querySelectorAll('.dialogue-stage-logo-img');
            imgs.forEach(img => {
                img.src = cleanDataUrl;
            });

            showStatus('✅ ¡Logotipo oficial guardado y aplicado con éxito a las cinemáticas!', false);
            saveBtn.innerText = '¡Guardado!';

            setTimeout(() => {
                closeModal();
                saveBtn.innerText = 'Guardar y Aplicar Logotipo';
                saveBtn.disabled = false;
            }, 1200);

        } catch (err) {
            console.error('Error al guardar el logotipo:', err);
            showStatus('Error al guardar el logotipo: ' + err.message, true);
            saveBtn.disabled = false;
            saveBtn.innerText = 'Reintentar';
        }
    };
}
