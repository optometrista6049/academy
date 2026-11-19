/* ======================================================
   MONTESERIN ACADEMY - ASSET MANAGER (DEV SUITE)
   Gestor de recursos con ranuras aisladas (Slots) para
   evitar confusiones entre logos, carnets, documentos PDF y modelos 3D.
   ====================================================== */

import { registryCatalog } from '../ui/registry/registryCatalog.js';
import { equipItem, loadGLBEquipment } from '../player/playerEquipment.js';
import { showDevModalDialog, escapeHtml } from './devModalDialog.js';
import { showDevToast } from './devPanel.js';

const PDF_PRESET_SLOTS = [
    {
        id: 'higiene_visual',
        filename: 'higiene_visual.pdf',
        label: '👁️ Higiene Visual (Misión 2)'
    },
    {
        id: 'control_tiempo',
        filename: 'control_tiempo.pdf',
        label: '⏳ Control de Tiempo (Misión 2)'
    },
    {
        id: 'custom',
        filename: '',
        label: '✏️ Otro / Futuro PDF'
    }
];

let existingServerPdfs = [];

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizePdfFilenameInput(raw) {
    let val = String(raw || '').trim();
    if (!val) return '';
    val = val.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    if (!val) return '';
    if (!val.toLowerCase().endsWith('.pdf')) {
        val = val.replace(/\.[^.]+$/, '') + '.pdf';
    }
    return val;
}

export function renderAssetManagerTab(container) {
    container.innerHTML = `
        <div class="devSlotGrid">
            <!-- RANURA 1: LOGOTIPO OFICIAL -->
            <div class="devSlotCard">
                <div class="devSlotHeader">
                    <span class="devSlotBadge">RANURA 1</span>
                    <h4 class="devSlotTitle">Logotipo Oficial (Cinemática)</h4>
                </div>
                <p class="devSlotDesc">Logotipo que se proyecta en la esquina superior derecha durante los diálogos.</p>
                <div class="devSlotPreviewFrame checkerBg">
                    <img id="devLogoPreviewImg" src="assets/ui/monteserin_academy_logo_clean.png?v=${Date.now()}" alt="Logo Oficial" />
                </div>
                <div class="devSlotMeta">
                    <span>Destino: <code>assets/ui/monteserin_academy_logo_clean.png</code></span>
                    <span>Formatos: <strong>PNG (con transparencia), SVG</strong></span>
                </div>
                <label class="devFileBtn">
                    📁 Seleccionar nuevo logotipo
                    <input type="file" id="devLogoInput" accept="image/png, image/svg+xml" style="display:none;" />
                </label>
                <div id="devLogoStatus" class="devStatusMsg"></div>
            </div>

            <!-- RANURA 2: CARNET DE ASPIRANTE -->
            <div class="devSlotCard">
                <div class="devSlotHeader">
                    <span class="devSlotBadge">RANURA 2</span>
                    <h4 class="devSlotTitle">Carnet de Aspirante (Misión 1)</h4>
                </div>
                <p class="devSlotDesc">Acreditación oficial entregada por Monty, visualizable a pantalla completa y descargable.</p>
                <div class="devSlotPreviewFrame">
                    <img id="devCarnetPreviewImg" src="assets/ui/ASPIRANTE.jpg?v=${Date.now()}" alt="Carnet Oficial" />
                </div>
                <div class="devSlotMeta">
                    <span>Destino: <code>assets/ui/ASPIRANTE.jpg</code></span>
                    <span>Formatos: <strong>JPG / JPEG</strong></span>
                </div>
                <label class="devFileBtn">
                    📁 Seleccionar nuevo carnet oficial
                    <input type="file" id="devCarnetInput" accept="image/jpeg, image/jpg" style="display:none;" />
                </label>
                <div id="devCarnetStatus" class="devStatusMsg"></div>
            </div>

            <!-- RANURA 4: MODELO 3D GLB PARA EL PLAYER -->
            <div class="devSlotCard">
                <div class="devSlotHeader">
                    <span class="devSlotBadge">RANURA 4</span>
                    <h4 class="devSlotTitle">Cargar Herramienta 3D (.GLB)</h4>
                </div>
                <p class="devSlotDesc">Acopla un modelo 3D externo directamente a la mano o espalda del Player.</p>
                <div class="devSlotInputs">
                    <select id="devGlbSocketSelect" class="devSelect">
                        <option value="rightHand">Mano Derecha (rightHand)</option>
                        <option value="leftHand">Mano Izquierda (leftHand)</option>
                        <option value="back">Espalda (back)</option>
                    </select>
                </div>
                <label class="devFileBtn">
                    📁 Seleccionar archivo .glb
                    <input type="file" id="devGlbFileInput" accept=".glb, .gltf" style="display:none;" />
                </label>
                <div id="devGlbStatus" class="devStatusMsg"></div>
            </div>

            <!-- RANURA 3 (AMPLIADA Y PERMANENTE): REPOSITORIO DE DOCUMENTOS PDF -->
            <div class="devSlotCard devSlotCardWide">
                <div class="devSlotHeader" style="flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="devSlotBadge">RANURA 3 · PERMANENTE</span>
                        <h4 class="devSlotTitle">Gestor de Documentos PDF (Dev + GitHub)</h4>
                    </div>
                    <span style="font-size:0.7rem;color:#94a3b8;">
                        Guardado binario íntegro en <code>assets/docs/</code> y <code>public/assets/docs/</code>
                    </span>
                </div>
                <p class="devSlotDesc">
                    Sube archivos <strong>.PDF</strong> desde tu ordenador para incorporarlos permanentemente al proyecto y a la compilación de GitHub.
                </p>

                <div class="devPdfWorkbench">
                    <!-- COLUMNA IZQUIERDA: FORMULARIO DE SUBIDA -->
                    <div class="devPdfUploadCol">
                        <div class="devPdfColTitle">
                            <span>📤 Subir o Reemplazar PDF</span>
                        </div>

                        <div style="font-size:0.7rem;color:#cbd5e1;font-weight:600;">Destino rápido (o escribe un nombre nuevo):</div>
                        <div class="devPdfPresetRow" id="devPdfPresetRow">
                            ${PDF_PRESET_SLOTS.map((slot, idx) => `
                                <button type="button" class="devPdfPresetChip ${idx === 0 ? 'active' : ''}" data-preset-id="${slot.id}" data-filename="${slot.filename}">
                                    ${escapeHtml(slot.label)}
                                </button>
                            `).join('')}
                        </div>

                        <div class="devSlotInputs">
                            <label for="devPdfTargetNameInput" style="font-size:0.7rem;color:#a0b0a8;">
                                Nombre de archivo destino (.pdf):
                            </label>
                            <input
                                type="text"
                                id="devPdfTargetNameInput"
                                class="devInputText"
                                value="${PDF_PRESET_SLOTS[0].filename}"
                                placeholder="ej: higiene_visual.pdf"
                                autocomplete="off"
                            />
                            <div id="devPdfTargetPathHint" class="devSlotMeta">
                                <span>Ruta final: <code>assets/docs/${PDF_PRESET_SLOTS[0].filename}</code></span>
                            </div>
                        </div>

                        <div id="devPdfDropZone" class="devPdfDropZone">
                            <input type="file" id="devPdfFileInput" accept="application/pdf, .pdf" style="display:none;" />
                            <div style="font-size:1.5rem;line-height:1;">📄</div>
                            <div style="font-size:0.78rem;font-weight:700;color:#ffd54f;">Haz clic o arrastra tu archivo .PDF aquí</div>
                            <div style="font-size:0.68rem;color:#8ba094;">Máximo 25 MB · Se conserva el binario original exacto</div>
                        </div>

                        <div id="devPdfFileMetaBox" class="devPdfFileMetaBox">
                            <div><strong>Archivo seleccionado:</strong> <span id="devPdfSelectedName"></span></div>
                            <div><strong>Tamaño:</strong> <span id="devPdfSelectedSize"></span></div>
                        </div>

                        <button id="devUploadPdfBtn" class="devActionBtn" disabled style="opacity:0.5;cursor:not-allowed;">
                            💾 Guardar PDF en el Proyecto
                        </button>

                        <div id="devPdfVerifyBox" class="devPdfVerifyBox">
                            <span>✅ Guardado en disco y <code>public/</code></span>
                            <a id="devPdfVerifyLink" href="#" target="_blank" rel="noopener noreferrer" class="devPdfMiniBtn">
                                👁️ Verificar PDF
                            </a>
                        </div>

                        <div id="devPdfStatus" class="devStatusMsg"></div>
                    </div>

                    <!-- COLUMNA DERECHA: BIBLIOTECA DE PDFS EN DISCO -->
                    <div class="devPdfLibraryCol">
                        <div class="devPdfColTitle">
                            <span>📚 Documentos PDF en el Proyecto (<span id="devPdfCount">0</span>)</span>
                            <button type="button" id="devRefreshPdfListBtn" class="devPdfMiniBtn" title="Actualizar lista desde disco">
                                ↻ Actualizar
                            </button>
                        </div>

                        <div id="devPdfListContainer" class="devPdfListContainer styledScrollbar">
                            <div class="devPdfEmptyMsg">Cargando documentos del servidor...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupSlotEvents();
    setupPdfManagerEvents();
}

function setupSlotEvents() {
    // ------------------------------------------
    // Ranura 1: Logo
    // ------------------------------------------
    const logoInput = document.getElementById('devLogoInput');
    const logoPreview = document.getElementById('devLogoPreviewImg');
    const logoStatus = document.getElementById('devLogoStatus');

    if (logoInput) {
        logoInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const dataUrl = evt.target.result;
                logoPreview.src = dataUrl;

                const stageLogo = document.querySelector('.dialogue-stage-logo');
                if (stageLogo) stageLogo.src = dataUrl;

                logoStatus.textContent = `✅ Logo cargado en memoria temporal: ${file.name}`;
                logoStatus.className = 'devStatusMsg success';
            };
            reader.readAsDataURL(file);
        };
    }

    // ------------------------------------------
    // Ranura 2: Carnet
    // ------------------------------------------
    const carnetInput = document.getElementById('devCarnetInput');
    const carnetPreview = document.getElementById('devCarnetPreviewImg');
    const carnetStatus = document.getElementById('devCarnetStatus');

    if (carnetInput) {
        carnetInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const dataUrl = evt.target.result;
                carnetPreview.src = dataUrl;

                if (registryCatalog.aspirantCard) {
                    registryCatalog.aspirantCard.thumbnail = dataUrl;
                    registryCatalog.aspirantCard.documentImage = dataUrl;
                }

                carnetStatus.textContent = `✅ Carnet cargado y vinculado al Registro: ${file.name}`;
                carnetStatus.className = 'devStatusMsg success';
            };
            reader.readAsDataURL(file);
        };
    }

    // ------------------------------------------
    // Ranura 4: Modelo 3D GLB
    // ------------------------------------------
    const glbInput = document.getElementById('devGlbFileInput');
    const glbSocket = document.getElementById('devGlbSocketSelect');
    const glbStatus = document.getElementById('devGlbStatus');

    if (glbInput) {
        glbInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const blobUrl = URL.createObjectURL(file);
            const targetSocket = glbSocket ? glbSocket.value : 'rightHand';

            loadGLBEquipment(
                blobUrl,
                (model) => {
                    equipItem(targetSocket, model, { scale: 1.0 });
                    glbStatus.textContent = `✅ Modelo "${file.name}" acoplado a ${targetSocket}!`;
                    glbStatus.className = 'devStatusMsg success';
                },
                (err) => {
                    glbStatus.textContent = `❌ Error al cargar modelo 3D: ${err.message || 'Formato no soportado'}`;
                    glbStatus.className = 'devStatusMsg error';
                }
            );
        };
    }
}

function setupPdfManagerEvents() {
    const presetRow = document.getElementById('devPdfPresetRow');
    const targetNameInput = document.getElementById('devPdfTargetNameInput');
    const targetPathHint = document.getElementById('devPdfTargetPathHint');
    const dropZone = document.getElementById('devPdfDropZone');
    const fileInput = document.getElementById('devPdfFileInput');
    const metaBox = document.getElementById('devPdfFileMetaBox');
    const selectedNameEl = document.getElementById('devPdfSelectedName');
    const selectedSizeEl = document.getElementById('devPdfSelectedSize');
    const uploadBtn = document.getElementById('devUploadPdfBtn');
    const verifyBox = document.getElementById('devPdfVerifyBox');
    const verifyLink = document.getElementById('devPdfVerifyLink');
    const statusEl = document.getElementById('devPdfStatus');
    const listContainer = document.getElementById('devPdfListContainer');
    const countEl = document.getElementById('devPdfCount');
    const refreshBtn = document.getElementById('devRefreshPdfListBtn');

    let pendingBase64 = null;
    let pendingOriginalName = '';
    let activePresetId = PDF_PRESET_SLOTS[0].id;

    function updatePathHintAndUploadState() {
        const normalized = normalizePdfFilenameInput(targetNameInput?.value || '');
        if (targetPathHint) {
            if (!normalized) {
                targetPathHint.innerHTML = `<span style="color:#fca5a5;">Escribe un nombre válido (ej: <code>mi_documento.pdf</code>)</span>`;
            } else {
                const exists = existingServerPdfs.some((d) => d.filename.toLowerCase() === normalized.toLowerCase());
                targetPathHint.innerHTML = exists
                    ? `<span>Ruta: <code>assets/docs/${escapeHtml(normalized)}</code> · <strong style="color:#fbbf24;">Ya existe (se reemplazará al confirmar)</strong></span>`
                    : `<span>Ruta: <code>assets/docs/${escapeHtml(normalized)}</code> + <code>public/assets/docs/${escapeHtml(normalized)}</code></span>`;
            }
        }

        const canSubmit = Boolean(pendingBase64 && normalized);
        if (uploadBtn) {
            uploadBtn.disabled = !canSubmit;
            uploadBtn.style.opacity = canSubmit ? '1' : '0.5';
            uploadBtn.style.cursor = canSubmit ? 'pointer' : 'not-allowed';
        }
    }

    function setStatus(text, type = '') {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.className = `devStatusMsg ${type}`.trim();
    }

    function handleSelectedFile(file) {
        if (!file) return;
        const isPdfMime = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (!isPdfMime) {
            setStatus('⚠️ Selecciona un archivo con extensión .pdf válido.', 'error');
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            setStatus('⚠️ El PDF supera el límite máximo permitido de 25 MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            pendingBase64 = evt.target?.result || null;
            pendingOriginalName = file.name;

            if (activePresetId === 'custom' && targetNameInput && !targetNameInput.value.trim()) {
                targetNameInput.value = normalizePdfFilenameInput(file.name);
            }

            if (selectedNameEl) selectedNameEl.textContent = file.name;
            if (selectedSizeEl) selectedSizeEl.textContent = formatBytes(file.size);
            if (metaBox) metaBox.style.display = 'flex';
            if (verifyBox) verifyBox.style.display = 'none';
            setStatus('Archivo leído y listo para guardar en el proyecto.', 'success');
            updatePathHintAndUploadState();
        };
        reader.onerror = () => {
            setStatus('❌ No se pudo leer el archivo PDF seleccionado.', 'error');
        };
        reader.readAsDataURL(file);
    }

    async function performUpload(overwrite = false) {
        const targetFilename = normalizePdfFilenameInput(targetNameInput?.value || '');
        if (!pendingBase64 || !targetFilename) return;

        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '⏳ Guardando PDF...';
        }
        setStatus('Escribiendo archivo binario en assets/docs y public/assets/docs...', '');

        try {
            const res = await fetch('/api/upload-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: targetFilename,
                    base64Data: pendingBase64,
                    overwrite
                })
            });

            const data = await res.json().catch(() => ({}));

            if (res.status === 409 && !overwrite) {
                showDevModalDialog({
                    title: 'Reemplazar Documento PDF',
                    message: `Ya existe <strong>${escapeHtml(targetFilename)}</strong> en el proyecto.<br><br>¿Deseas sobrescribirlo con <strong>${escapeHtml(pendingOriginalName)}</strong>?`,
                    confirmText: 'Sí, reemplazar',
                    cancelText: 'Cancelar',
                    onConfirm: () => {
                        performUpload(true);
                    },
                    onCancel: () => {
                        if (uploadBtn) uploadBtn.textContent = '💾 Guardar PDF en el Proyecto';
                        setStatus('Subida cancelada. Cambia el nombre de destino si quieres conservar ambos.', 'warning');
                        updatePathHintAndUploadState();
                    }
                });
                return;
            }

            if (!res.ok || !data.success) {
                throw new Error(data.error || `Error HTTP ${res.status}`);
            }

            if (verifyLink) {
                verifyLink.href = `${data.url}?v=${Date.now()}`;
            }
            if (verifyBox) {
                verifyBox.style.display = 'flex';
            }

            setStatus(`✅ "${data.filename}" guardado (${formatBytes(data.size)}).`, 'success');
            showDevToast(`📄 PDF guardado: ${data.filename}`);

            pendingBase64 = null;
            pendingOriginalName = '';
            if (fileInput) fileInput.value = '';
            if (metaBox) metaBox.style.display = 'none';

            await fetchPdfLibrary();
        } catch (err) {
            setStatus(`❌ Error al guardar PDF: ${err.message || err}`, 'error');
        } finally {
            if (uploadBtn) {
                uploadBtn.textContent = '💾 Guardar PDF en el Proyecto';
            }
            updatePathHintAndUploadState();
        }
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showDevToast(`📋 Ruta copiada: ${text}`);
        } catch {
            showDevToast(`📄 Ruta: ${text}`);
        }
    }

    function renderPdfLibraryList(docs) {
        if (!listContainer) return;
        if (countEl) countEl.textContent = String(docs.length);

        if (!docs || docs.length === 0) {
            listContainer.innerHTML = `
                <div class="devPdfEmptyMsg">
                    Aún no hay archivos PDF guardados en <code>assets/docs/</code>.<br>
                    Selecciona uno en la columna izquierda para subirlo.
                </div>
            `;
            return;
        }

        listContainer.innerHTML = docs.map((doc) => {
            const bothSynced = doc.inAssets && doc.inPublic;
            return `
                <div class="devPdfItemRow">
                    <div class="devPdfItemInfo">
                        <div class="devPdfItemName" title="${escapeHtml(doc.assetPath)}">📄 ${escapeHtml(doc.filename)}</div>
                        <div class="devPdfItemMeta">
                            <span>${formatBytes(doc.size)}</span>
                            <span class="devPdfSyncBadge ${bothSynced ? '' : 'partial'}" title="${bothSynced ? 'Sincronizado en assets/docs y public/assets/docs' : 'Falta copia en una de las carpetas'}">
                                ${bothSynced ? '✓ Dev + GitHub' : (doc.inPublic ? 'Solo public/' : 'Solo assets/')}
                            </span>
                        </div>
                    </div>
                    <div class="devPdfItemActions">
                        <a href="${escapeHtml(doc.url)}?v=${Date.now()}" target="_blank" rel="noopener noreferrer" class="devPdfMiniBtn" title="Abrir PDF en nueva pestaña">
                            👁️ Ver
                        </a>
                        <button type="button" class="devPdfMiniBtn devCopyPdfPathBtn" data-path="${escapeHtml(doc.assetPath)}" title="Copiar ruta del proyecto">
                            📋 Ruta
                        </button>
                        <button type="button" class="devPdfMiniBtn danger devDeletePdfBtn" data-filename="${escapeHtml(doc.filename)}" title="Eliminar PDF de assets/ y public/">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        listContainer.querySelectorAll('.devCopyPdfPathBtn').forEach((btn) => {
            btn.onclick = () => copyToClipboard(btn.getAttribute('data-path'));
        });

        listContainer.querySelectorAll('.devDeletePdfBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                if (!fname) return;
                showDevModalDialog({
                    title: 'Eliminar Documento PDF',
                    message: `¿Seguro que quieres eliminar <strong>${escapeHtml(fname)}</strong> tanto de <code>assets/docs/</code> como de <code>public/assets/docs/</code>?`,
                    confirmText: 'Eliminar PDF',
                    cancelText: 'Cancelar',
                    isDanger: true,
                    onConfirm: async () => {
                        try {
                            const res = await fetch(`/api/upload-pdf?filename=${encodeURIComponent(fname)}`, {
                                method: 'DELETE'
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok || !data.success) {
                                throw new Error(data.error || 'No se pudo eliminar');
                            }
                            showDevToast(`🗑️ Eliminado: ${fname}`);
                            await fetchPdfLibrary();
                        } catch (err) {
                            showDevToast(`❌ Error eliminando PDF: ${err.message || err}`);
                        }
                    }
                });
            };
        });
    }

    async function fetchPdfLibrary() {
        try {
            const res = await fetch('/api/upload-pdf');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            existingServerPdfs = Array.isArray(data.docs) ? data.docs : [];
            renderPdfLibraryList(existingServerPdfs);
            updatePathHintAndUploadState();
        } catch (err) {
            if (listContainer) {
                listContainer.innerHTML = `<div class="devPdfEmptyMsg">No se pudo consultar <code>/api/upload-pdf</code> (${escapeHtml(err.message || err)}).</div>`;
            }
        }
    }

    // Presets de nombre de archivo
    if (presetRow) {
        presetRow.querySelectorAll('.devPdfPresetChip').forEach((chip) => {
            chip.onclick = () => {
                presetRow.querySelectorAll('.devPdfPresetChip').forEach((c) => c.classList.remove('active'));
                chip.classList.add('active');
                activePresetId = chip.getAttribute('data-preset-id') || 'custom';
                const presetFilename = chip.getAttribute('data-filename') || '';

                if (targetNameInput) {
                    if (presetFilename) {
                        targetNameInput.value = presetFilename;
                    } else if (pendingOriginalName) {
                        targetNameInput.value = normalizePdfFilenameInput(pendingOriginalName);
                    } else {
                        targetNameInput.value = '';
                        targetNameInput.focus();
                    }
                }
                updatePathHintAndUploadState();
            };
        });
    }

    if (targetNameInput) {
        targetNameInput.oninput = () => {
            updatePathHintAndUploadState();
        };
    }

    // Dropzone & selector de archivo
    if (dropZone && fileInput) {
        dropZone.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleSelectedFile(file);
        };

        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.classList.add('dragOver');
        };
        dropZone.ondragleave = () => {
            dropZone.classList.remove('dragOver');
        };
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragOver');
            const file = e.dataTransfer?.files && e.dataTransfer.files[0];
            if (file) handleSelectedFile(file);
        };
    }

    if (uploadBtn) {
        uploadBtn.onclick = () => performUpload(false);
    }

    if (refreshBtn) {
        refreshBtn.onclick = () => fetchPdfLibrary();
    }

    updatePathHintAndUploadState();
    fetchPdfLibrary();
}
