/**
 * Modal y botón flotante para subir y gestionar recursos oficiales de Monteserín Academy:
 * 1. Logotipo oficial de Monteserín Academy (para cinemáticas y marcas de agua).
 * 2. Carnet oficial (JPG) para la entrega y finalización de la Misión 1 (archivo binario exacto, sin IA ni alteración).
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
        <span style="font-size:1.1rem;line-height:1;">📁</span>
        <span>Subir Logo / Carnet JPG</span>
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
        openLogoUploadModal('carnet');
    });

    document.body.appendChild(floatingBtn);
}

export function openLogoUploadModal(defaultTab = 'carnet') {
    if (modalRoot) {
        modalRoot.style.display = 'flex';
        switchTab(defaultTab);
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
        width: 'min(540px, 94vw)',
        maxHeight: '92vh',
        overflowY: 'auto',
        backgroundColor: 'rgba(18, 26, 22, 0.98)',
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
                <h3 style="margin:0;font-size:1.15rem;color:#f5e197;letter-spacing:0.5px;">Gestor de Recursos Oficiales</h3>
            </div>
            <button id="closeUploadModalBtn" style="background:none;border:none;color:#aaa;font-size:1.4rem;cursor:pointer;padding:4px 8px;line-height:1;border-radius:6px;">✕</button>
        </div>

        <!-- SELECTOR DE PESTAÑAS -->
        <div style="display:flex;gap:8px;background:rgba(0,0,0,0.35);padding:4px;border-radius:12px;border:1px solid rgba(212,175,55,0.2);">
            <button id="tabBtnCarnet" style="flex:1;padding:8px 12px;border-radius:8px;border:none;background:rgba(212,175,55,0.25);color:#f5e197;font-weight:700;font-size:0.88rem;cursor:pointer;transition:all 0.2s;">
                🪪 Carnet Oficial (JPG)
            </button>
            <button id="tabBtnLogo" style="flex:1;padding:8px 12px;border-radius:8px;border:none;background:transparent;color:#aaa;font-weight:600;font-size:0.88rem;cursor:pointer;transition:all 0.2s;">
                🎨 Logotipo Cinemática
            </button>
        </div>

        <!-- ============================================== -->
        <!-- SECCIÓN 1: SUBIR CARNET OFICIAL (JPG)         -->
        <!-- ============================================== -->
        <div id="sectionCarnet" style="display:flex;flex-direction:column;gap:14px;">
            <p style="margin:0;font-size:0.88rem;line-height:1.5;color:#c0cdc6;">
                Sube tu archivo <strong>JPG</strong> del Carnet Oficial para la Misión 1. Tu archivo se guardará <strong>íntegro byte a byte</strong>, conservando su resolución original, colores y compresión exacta, sin modificaciones ni interpretaciones de IA.
            </p>

            <div id="carnetDropZone" style="border:2px dashed rgba(212,175,55,0.45);border-radius:14px;padding:22px;text-align:center;cursor:pointer;background:rgba(255,255,255,0.03);transition:all 0.2s ease;">
                <input type="file" id="carnetFileInput" accept="image/jpeg, image/jpg, .jpg, .jpeg" style="display:none;" />
                <div style="font-size:2.2rem;margin-bottom:6px;">🪪</div>
                <div style="font-weight:600;color:#f5e197;margin-bottom:4px;font-size:0.95rem;">Haz clic para seleccionar o arrastra tu Carnet JPG</div>
                <div style="font-size:0.8rem;color:#8ba094;">Formato aceptado: .JPG / .JPEG (archivo exacto)</div>
            </div>

            <!-- PREVIEW CARNET -->
            <div id="carnetPreviewContainer" style="display:none;flex-direction:column;gap:10px;background:rgba(0,0,0,0.3);padding:14px;border-radius:12px;border:1px solid rgba(46,204,113,0.35);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:0.82rem;font-weight:600;color:#7bf1a8;">Vista previa del archivo original</span>
                    <span id="carnetFileInfo" style="font-size:0.75rem;color:#8ba094;"></span>
                </div>
                <div style="text-align:center;max-height:240px;overflow:hidden;border-radius:8px;border:1px solid #444;display:flex;align-items:center;justify-content:center;background:#0d1411;">
                    <img id="carnetPreviewImg" style="max-width:100%;max-height:240px;object-fit:contain;" />
                </div>
            </div>

            <!-- ENLACE DE VERIFICACIÓN POST-GUARDADO -->
            <div id="carnetVerifiedBox" style="display:none;flex-direction:column;gap:8px;background:rgba(46,204,113,0.12);padding:12px 14px;border-radius:10px;border:1px solid rgba(46,204,113,0.4);">
                <div style="font-size:0.86rem;color:#a3f7c4;font-weight:600;">✅ Archivo guardado en el servidor con éxito</div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <a id="carnetVerifyLink" href="#" target="_blank" rel="noopener noreferrer" style="flex:1;padding:8px 12px;background:#2ecc71;color:#0b1a12;text-decoration:none;border-radius:8px;font-size:0.82rem;font-weight:700;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
                        🔍 Abrir y Verificar JPG en Pestaña Nueva
                    </a>
                </div>
            </div>

            <div id="carnetStatusMsg" style="display:none;padding:10px 14px;border-radius:8px;font-size:0.88rem;text-align:center;font-weight:500;"></div>

            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
                <button id="cancelCarnetBtn" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#ccc;cursor:pointer;font-weight:600;font-size:0.9rem;">
                    Cerrar
                </button>
                <button id="saveCarnetBtn" disabled style="padding:10px 22px;border-radius:10px;border:none;background:linear-gradient(180deg, #d6b06a 0%, #aa8436 100%);color:#10141a;font-weight:700;font-size:0.9rem;cursor:not-allowed;opacity:0.5;">
                    Guardar Carnet Oficial (JPG)
                </button>
            </div>
        </div>

        <!-- ============================================== -->
        <!-- SECCIÓN 2: SUBIR LOGOTIPO CINEMÁTICA           -->
        <!-- ============================================== -->
        <div id="sectionLogo" style="display:none;flex-direction:column;gap:14px;">
            <p style="margin:0;font-size:0.88rem;line-height:1.5;color:#c0cdc6;">
                Logotipo oficial para la esquina superior derecha de las cinemáticas de diálogo.
            </p>

            <div id="logoDropZone" style="border:2px dashed rgba(212,175,55,0.45);border-radius:14px;padding:22px;text-align:center;cursor:pointer;background:rgba(255,255,255,0.03);transition:all 0.2s ease;">
                <input type="file" id="logoFileInput" accept="image/png, image/jpeg, image/jpg, image/webp" style="display:none;" />
                <div style="font-size:2rem;margin-bottom:6px;">🎨</div>
                <div style="font-weight:600;color:#f5e197;margin-bottom:4px;font-size:0.95rem;">Seleccionar logotipo</div>
                <div style="font-size:0.8rem;color:#8ba094;">Formatos: PNG, JPG</div>
            </div>

            <div id="logoPreviewContainer" style="display:none;flex-direction:column;gap:12px;">
                <div style="display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap;">
                    <div style="text-align:center;">
                        <div style="font-size:0.75rem;color:#8ba094;margin-bottom:4px;">Original</div>
                        <div style="width:120px;height:120px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #444;">
                            <img id="logoOriginalPreview" style="max-width:100%;max-height:100%;object-fit:contain;" />
                        </div>
                    </div>
                    <div style="font-size:1.5rem;color:#d4af37;">➔</div>
                    <div style="text-align:center;">
                        <div style="font-size:0.75rem;color:#8ba094;margin-bottom:4px;">Fondo Transparente</div>
                        <div style="width:120px;height:120px;background:radial-gradient(circle, #1a2a22 0%, #0d1511 100%);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #2ecc71;">
                            <img id="logoCleanPreview" style="max-width:100%;max-height:100%;object-fit:contain;" />
                        </div>
                    </div>
                </div>
                <label style="display:flex;align-items:center;gap:10px;font-size:0.86rem;color:#d5e2da;cursor:pointer;background:rgba(0,0,0,0.25);padding:8px 12px;border-radius:8px;">
                    <input type="checkbox" id="removeWhiteBgCheck" checked style="accent-color:#2ecc71;width:16px;height:16px;" />
                    <span>Eliminar fondo blanco automáticamente para transparencia</span>
                </label>
            </div>

            <div id="logoStatusMsg" style="display:none;padding:10px 14px;border-radius:8px;font-size:0.88rem;text-align:center;font-weight:500;"></div>

            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
                <button id="cancelLogoBtn" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#ccc;cursor:pointer;font-weight:600;font-size:0.9rem;">
                    Cerrar
                </button>
                <button id="saveLogoBtn" disabled style="padding:10px 22px;border-radius:10px;border:none;background:linear-gradient(180deg, #d6b06a 0%, #aa8436 100%);color:#10141a;font-weight:700;font-size:0.9rem;cursor:not-allowed;opacity:0.5;">
                    Guardar Logotipo
                </button>
            </div>
        </div>
    `;

    modalRoot.appendChild(card);
    document.body.appendChild(modalRoot);

    // =====================================================
    // LÓGICA DE PESTAÑAS
    // =====================================================
    const tabBtnCarnet = card.querySelector('#tabBtnCarnet');
    const tabBtnLogo = card.querySelector('#tabBtnLogo');
    const sectionCarnet = card.querySelector('#sectionCarnet');
    const sectionLogo = card.querySelector('#sectionLogo');

    function switchTab(tab) {
        if (tab === 'carnet') {
            tabBtnCarnet.style.background = 'rgba(212,175,55,0.25)';
            tabBtnCarnet.style.color = '#f5e197';
            tabBtnCarnet.style.fontWeight = '700';
            tabBtnLogo.style.background = 'transparent';
            tabBtnLogo.style.color = '#aaa';
            tabBtnLogo.style.fontWeight = '600';
            sectionCarnet.style.display = 'flex';
            sectionLogo.style.display = 'none';
        } else {
            tabBtnLogo.style.background = 'rgba(212,175,55,0.25)';
            tabBtnLogo.style.color = '#f5e197';
            tabBtnLogo.style.fontWeight = '700';
            tabBtnCarnet.style.background = 'transparent';
            tabBtnCarnet.style.color = '#aaa';
            tabBtnCarnet.style.fontWeight = '600';
            sectionLogo.style.display = 'flex';
            sectionCarnet.style.display = 'none';
        }
    }

    tabBtnCarnet.onclick = () => switchTab('carnet');
    tabBtnLogo.onclick = () => switchTab('logo');

    // Cerrar modal
    const closeBtn = card.querySelector('#closeUploadModalBtn');
    const closeModal = () => {
        modalRoot.style.display = 'none';
    };
    closeBtn.onclick = closeModal;
    modalRoot.onclick = (e) => {
        if (e.target === modalRoot) closeModal();
    };

    // =====================================================
    // CONTROL DEL CARNET OFICIAL (JPG)
    // =====================================================
    const carnetDropZone = card.querySelector('#carnetDropZone');
    const carnetFileInput = card.querySelector('#carnetFileInput');
    const carnetPreviewContainer = card.querySelector('#carnetPreviewContainer');
    const carnetPreviewImg = card.querySelector('#carnetPreviewImg');
    const carnetFileInfo = card.querySelector('#carnetFileInfo');
    const carnetVerifiedBox = card.querySelector('#carnetVerifiedBox');
    const carnetVerifyLink = card.querySelector('#carnetVerifyLink');
    const carnetStatusMsg = card.querySelector('#carnetStatusMsg');
    const saveCarnetBtn = card.querySelector('#saveCarnetBtn');
    const cancelCarnetBtn = card.querySelector('#cancelCarnetBtn');

    cancelCarnetBtn.onclick = closeModal;

    let carnetRawBase64 = null;

    carnetDropZone.onclick = () => carnetFileInput.click();
    carnetDropZone.ondragover = (e) => {
        e.preventDefault();
        carnetDropZone.style.borderColor = '#2ecc71';
        carnetDropZone.style.background = 'rgba(46, 204, 113, 0.08)';
    };
    carnetDropZone.ondragleave = () => {
        carnetDropZone.style.borderColor = 'rgba(212,175,55,0.45)';
        carnetDropZone.style.background = 'rgba(255,255,255,0.03)';
    };
    carnetDropZone.ondrop = (e) => {
        e.preventDefault();
        carnetDropZone.style.borderColor = 'rgba(212,175,55,0.45)';
        carnetDropZone.style.background = 'rgba(255,255,255,0.03)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleCarnetFile(e.dataTransfer.files[0]);
        }
    };
    carnetFileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleCarnetFile(e.target.files[0]);
        }
    };

    function handleCarnetFile(file) {
        if (!file.name.toLowerCase().endsWith('.jpg') && !file.name.toLowerCase().endsWith('.jpeg') && !file.type.includes('jpeg')) {
            showCarnetStatus('Por favor, selecciona un archivo en formato JPG (.jpg o .jpeg).', true);
            return;
        }

        const sizeKb = (file.size / 1024).toFixed(1);
        const reader = new FileReader();
        reader.onload = (ev) => {
            carnetRawBase64 = ev.target.result;
            carnetPreviewImg.src = carnetRawBase64;
            carnetPreviewContainer.style.display = 'flex';
            carnetVerifiedBox.style.display = 'none';
            carnetFileInfo.innerText = `${file.name} (${sizeKb} KB)`;

            saveCarnetBtn.disabled = false;
            saveCarnetBtn.style.cursor = 'pointer';
            saveCarnetBtn.style.opacity = '1';
            showCarnetStatus('Archivo JPG cargado correctamente. Haz clic en "Guardar Carnet Oficial" para almacenarlo íntegro.', false);
        };
        reader.readAsDataURL(file);
    }

    function showCarnetStatus(text, isError) {
        carnetStatusMsg.style.display = 'block';
        carnetStatusMsg.innerText = text;
        if (isError) {
            carnetStatusMsg.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
            carnetStatusMsg.style.color = '#ff8f8f';
            carnetStatusMsg.style.border = '1px solid rgba(231, 76, 60, 0.4)';
        } else {
            carnetStatusMsg.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            carnetStatusMsg.style.color = '#7bf1a8';
            carnetStatusMsg.style.border = '1px solid rgba(46, 204, 113, 0.4)';
        }
    }

    saveCarnetBtn.onclick = async () => {
        if (!carnetRawBase64) return;

        saveCarnetBtn.disabled = true;
        saveCarnetBtn.innerText = 'Guardando JPG...';

        try {
            // Guardar en localStorage para disponibilidad inmediata en el cliente
            localStorage.setItem('monteserin_official_carnet_data', carnetRawBase64);
            localStorage.setItem('monteserin_official_carnet_url', '/assets/carnet/carnet_oficial.jpg');

            // Enviar archivo binario al servidor para persistirlo en disco
            const resp = await fetch('/api/upload-carnet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carnetBase64Data: carnetRawBase64 })
            });

            const data = await resp.json();
            const carnetUrl = `${window.location.origin}/assets/carnet/carnet_oficial.jpg?v=${Date.now()}`;

            carnetVerifyLink.href = carnetUrl;
            carnetVerifiedBox.style.display = 'flex';

            showCarnetStatus('✅ ¡Carnet oficial JPG guardado con total exactitud binaria!', false);
            saveCarnetBtn.innerText = '¡Guardado!';

            window.dispatchEvent(new CustomEvent('carnet-uploaded', { detail: { url: carnetUrl } }));

        } catch (err) {
            console.error('Error al guardar el carnet:', err);
            showCarnetStatus('Error al guardar el carnet: ' + err.message, true);
            saveCarnetBtn.disabled = false;
            saveCarnetBtn.innerText = 'Reintentar';
        }
    };

    // =====================================================
    // CONTROL DEL LOGOTIPO OFICIAL
    // =====================================================
    const logoDropZone = card.querySelector('#logoDropZone');
    const logoFileInput = card.querySelector('#logoFileInput');
    const logoPreviewContainer = card.querySelector('#logoPreviewContainer');
    const originalPreview = card.querySelector('#logoOriginalPreview');
    const cleanPreview = card.querySelector('#logoCleanPreview');
    const removeWhiteCheck = card.querySelector('#removeWhiteBgCheck');
    const saveLogoBtn = card.querySelector('#saveLogoBtn');
    const logoStatusMsg = card.querySelector('#logoStatusMsg');
    const cancelLogoBtn = card.querySelector('#cancelLogoBtn');

    cancelLogoBtn.onclick = closeModal;

    let originalDataUrl = null;
    let cleanDataUrl = null;

    logoDropZone.onclick = () => logoFileInput.click();
    logoDropZone.ondragover = (e) => {
        e.preventDefault();
        logoDropZone.style.borderColor = '#2ecc71';
        logoDropZone.style.background = 'rgba(46, 204, 113, 0.08)';
    };
    logoDropZone.ondragleave = () => {
        logoDropZone.style.borderColor = 'rgba(212,175,55,0.45)';
        logoDropZone.style.background = 'rgba(255,255,255,0.03)';
    };
    logoDropZone.ondrop = (e) => {
        e.preventDefault();
        logoDropZone.style.borderColor = 'rgba(212,175,55,0.45)';
        logoDropZone.style.background = 'rgba(255,255,255,0.03)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleLogoFile(e.dataTransfer.files[0]);
        }
    };
    logoFileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleLogoFile(e.target.files[0]);
        }
    };

    removeWhiteCheck.onchange = () => {
        if (originalDataUrl) {
            processLogoImage(originalDataUrl, removeWhiteCheck.checked);
        }
    };

    function handleLogoFile(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            originalDataUrl = ev.target.result;
            originalPreview.src = originalDataUrl;
            processLogoImage(originalDataUrl, removeWhiteCheck.checked);
        };
        reader.readAsDataURL(file);
    }

    function processLogoImage(dataUrl, removeWhite) {
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
                    const minChannel = Math.min(r, g, b);
                    const avg = (r + g + b) / 3;
                    if (minChannel > 225 && avg > 230) {
                        const factor = Math.max(0, (255 - avg) / 25);
                        data[i + 3] = Math.round(a * factor);
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }

            cleanDataUrl = canvas.toDataURL('image/png');
            cleanPreview.src = cleanDataUrl;
            logoPreviewContainer.style.display = 'flex';
            saveLogoBtn.disabled = false;
            saveLogoBtn.style.cursor = 'pointer';
            saveLogoBtn.style.opacity = '1';
        };
        img.src = dataUrl;
    }

    saveLogoBtn.onclick = async () => {
        if (!cleanDataUrl) return;
        saveLogoBtn.disabled = true;
        saveLogoBtn.innerText = 'Guardando...';
        try {
            localStorage.setItem('monteserin_custom_logo', cleanDataUrl);
            await fetch('/api/upload-logo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cleanBase64Data: cleanDataUrl,
                    rawBase64Data: originalDataUrl || cleanDataUrl
                })
            });
            const imgs = document.querySelectorAll('.dialogue-stage-logo-img');
            imgs.forEach(img => { img.src = cleanDataUrl; });
            saveLogoBtn.innerText = '¡Guardado!';
            setTimeout(() => {
                closeModal();
                saveLogoBtn.innerText = 'Guardar Logotipo';
                saveLogoBtn.disabled = false;
            }, 1000);
        } catch (err) {
            saveLogoBtn.disabled = false;
            saveLogoBtn.innerText = 'Reintentar';
        }
    };

    switchTab(defaultTab);
}
