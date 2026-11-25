/* ======================================================
   MONTESERIN ACADEMY - ASSET MANAGER (DEV SUITE)
   Gestor de recursos con ranuras aisladas (Slots) para
   evitar confusiones entre logos, carnets, documentos PDF y modelos 3D.
   ====================================================== */

import { registryCatalog } from '../ui/registry/registryCatalog.js';
import { equipItem, loadGLBEquipment } from '../player/playerEquipment.js';
import { showDevModalDialog, escapeHtml } from './devModalDialog.js';
import { showDevToast } from './devPanel.js';
import { getBundledCustomDocsList, getBundledCustomDocDataUri } from '../systems/customAssetsBundle.js';
import { missions } from '../systems/missions/missionData.js';
import {
    initPdfDocumentStore,
    setServerManifestCache,
    saveLocalPdfOverride,
    updateLocalPdfMetadata,
    setLocalCatalogBinding,
    clearLocalBindingForFilename,
    removeLocalPdfOverride,
    getLocalPdfRecord,
    getAllLocalPdfRecords,
    getPdfCatalogSlots,
    getActivePdfCatalogLinkMap,
    isLocalOverrideNewerThanServer,
    buildExportableDocsPackage,
    base64ToPdfBlob
} from '../systems/pdfDocumentStore.js';

const DEFAULT_KNOWN_PDF_META = {
    'higiene_visual.pdf': {
        missionId: 'mission002',
        missionLabel: 'Misión 2: El Registro de Entrada',
        title: 'Guía de Higiene Visual y Postural'
    },
    'control_tiempo.pdf': {
        missionId: 'mission002',
        missionLabel: 'Misión 2: El Registro de Entrada',
        title: 'Sistema de Control de Tiempo'
    }
};

let existingServerPdfs = [];

function normalizeMissionId(rawId) {
    const val = String(rawId || '').trim();
    if (!val || val === 'unassigned') return 'unassigned';
    const numMatch = val.match(/^(?:misi[oó]n\s*|mission\s*|m)(\d{1,3})$/i);
    if (numMatch) {
        return `mission${String(Number(numMatch[1])).padStart(3, '0')}`;
    }
    return val.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getMissionNumber(missionId) {
    const match = String(missionId || '').match(/^mission(\d+)$/i);
    return match ? Number(match[1]) : null;
}

function getMissionPrefix(missionId) {
    const num = getMissionNumber(missionId);
    if (!num) return '';
    return `m${String(num).padStart(2, '0')}_`;
}

function stripMissionPrefix(filename) {
    return String(filename || '').replace(/^m\d{2,3}_/i, '');
}

function formatDefaultMissionLabel(missionId, fallbackLabel = '') {
    if (!missionId || missionId === 'unassigned') return 'Sin misión asignada / General';
    if (missions && missions[missionId]?.title) {
        const num = getMissionNumber(missionId);
        const rawTitle = missions[missionId].title;
        if (num && !/^misi[oó]n\s+\d+/i.test(rawTitle)) {
            return `Misión ${num}: ${rawTitle}`;
        }
        return rawTitle;
    }
    const num = getMissionNumber(missionId);
    if (num) return `Misión ${num} (Próxima)`;
    return fallbackLabel || missionId;
}

function buildMissionChoices(docs = []) {
    const map = new Map();

    // 1. Misiones oficiales declaradas en missionData.js
    Object.values(missions || {}).forEach((m) => {
        if (!m || !m.id) return;
        map.set(m.id, {
            id: m.id,
            label: formatDefaultMissionLabel(m.id, m.title),
            isOfficial: true
        });
    });

    // 2. Ranuras próximas habituales para ir preparando misión a misión
    ['mission003', 'mission004', 'mission005'].forEach((upcomingId) => {
        if (!map.has(upcomingId)) {
            map.set(upcomingId, {
                id: upcomingId,
                label: formatDefaultMissionLabel(upcomingId),
                isOfficial: false
            });
        }
    });

    // 3. Misiones personalizadas ya presentes en el manifiesto/discos
    (docs || []).forEach((doc) => {
        const mId = normalizeMissionId(doc.missionId);
        if (!mId || mId === 'unassigned') return;
        if (!map.has(mId)) {
            map.set(mId, {
                id: mId,
                label: doc.missionLabel || formatDefaultMissionLabel(mId),
                isOfficial: Boolean(missions && missions[mId])
            });
        }
    });

    const sorted = Array.from(map.values()).sort((a, b) => {
        const na = getMissionNumber(a.id);
        const nb = getMissionNumber(b.id);
        if (na !== null && nb !== null) return na - nb;
        if (na !== null) return -1;
        if (nb !== null) return 1;
        return a.label.localeCompare(b.label);
    });

    sorted.push({
        id: 'unassigned',
        label: 'Sin misión asignada / General',
        isOfficial: false
    });

    return sorted;
}

function buildRegistryPdfLinkMap() {
    return getActivePdfCatalogLinkMap();
}

function getEffectiveDocMeta(doc) {
    const fname = doc?.filename || '';
    const lower = fname.toLowerCase();
    const known = DEFAULT_KNOWN_PDF_META[lower];
    let missionId = normalizeMissionId(doc?.missionId);
    if (missionId === 'unassigned') {
        if (known) {
            missionId = known.missionId;
        } else {
            const pref = lower.match(/^m(\d{2,3})_/);
            if (pref) {
                missionId = `mission${String(Number(pref[1])).padStart(3, '0')}`;
            }
        }
    }
    const missionLabel = formatDefaultMissionLabel(missionId, doc?.missionLabel || known?.missionLabel || '');
    const title = String(doc?.title || known?.title || '').trim();
    return { missionId, missionLabel, title };
}

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

            <!-- RANURA 3 (AMPLIADA Y PERMANENTE): REPOSITORIO DE DOCUMENTOS PDF POR MISIONES -->
            <div class="devSlotCard devSlotCardWide">
                <div class="devSlotHeader" style="flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="devSlotBadge">RANURA 3 · PERMANENTE</span>
                        <h4 class="devSlotTitle">Gestor de Documentos PDF por Misión (Dev + GitHub)</h4>
                    </div>
                    <span style="font-size:0.7rem;color:#94a3b8;">
                        Guardado binario en <code>assets/docs/</code> + <code>public/assets/docs/</code> + índice de misiones
                    </span>
                </div>
                <p class="devSlotDesc">
                    Organiza los archivos <strong>.PDF</strong> por misión, asígnalos a documentos del juego con un clic y consérvalos en tu navegador mientras desarrollas.
                </p>

                <div id="devPdfEnvBanner" class="devPdfEnvBanner" style="display:none;"></div>

                <div class="devPdfWorkbench">
                    <!-- COLUMNA IZQUIERDA: FORMULARIO DE SUBIDA Y ORGANIZACIÓN -->
                    <div class="devPdfUploadCol">
                        <div class="devPdfColTitle">
                            <span>📤 Subir, Reemplazar u Organizar PDF</span>
                        </div>

                        <div class="devSlotInputs">
                            <label for="devPdfMissionSelect" style="font-size:0.7rem;color:#cbd5e1;font-weight:600;">
                                1. Misión asociada:
                            </label>
                            <select id="devPdfMissionSelect" class="devSelect"></select>
                            <div id="devPdfCustomMissionWrap" style="display:none;">
                                <input
                                    type="text"
                                    id="devPdfCustomMissionInput"
                                    class="devInputText"
                                    placeholder="Ej: mission006 o Misión 6: Taller"
                                    autocomplete="off"
                                />
                            </div>
                        </div>

                        <div style="font-size:0.7rem;color:#cbd5e1;font-weight:600;">2. Documento en esta misión (reemplazar existente o crear nuevo):</div>
                        <div class="devPdfPresetRow" id="devPdfPresetRow"></div>

                        <div class="devSlotInputs">
                            <label for="devPdfTitleInput" style="font-size:0.7rem;color:#a0b0a8;">
                                Título / descripción corta (para organizar en F9 y snippet):
                            </label>
                            <input
                                type="text"
                                id="devPdfTitleInput"
                                class="devInputText"
                                placeholder="Ej: Manual de Seguridad del Taller"
                                autocomplete="off"
                            />
                        </div>

                        <div class="devSlotInputs">
                            <label for="devPdfTargetNameInput" style="font-size:0.7rem;color:#a0b0a8;">
                                Nombre de archivo destino (.pdf):
                            </label>
                            <input
                                type="text"
                                id="devPdfTargetNameInput"
                                class="devInputText"
                                value="higiene_visual.pdf"
                                placeholder="ej: m03_manual_seguridad.pdf"
                                autocomplete="off"
                            />
                            <div id="devPdfTargetPathHint" class="devSlotMeta">
                                <span>Ruta final: <code>assets/docs/higiene_visual.pdf</code></span>
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

                        <div class="devPdfActionRow">
                            <button id="devUploadPdfBtn" class="devActionBtn" disabled style="opacity:0.5;cursor:not-allowed;flex:1;">
                                💾 Guardar PDF en el Proyecto
                            </button>
                            <button type="button" id="devSavePdfMetaBtn" class="devSecondaryBtn" style="display:none;">
                                🏷️ Actualizar solo Misión / Título (sin resubir PDF)
                            </button>
                        </div>

                        <div id="devPdfVerifyBox" class="devPdfVerifyBox">
                            <span>✅ Guardado en disco y <code>public/</code></span>
                            <a id="devPdfVerifyLink" href="#" target="_blank" rel="noopener noreferrer" class="devPdfMiniBtn">
                                👁️ Verificar PDF
                            </a>
                        </div>

                        <div id="devPdfStatus" class="devStatusMsg"></div>
                    </div>

                    <!-- COLUMNA DERECHA: BIBLIOTECA AGRUPADA POR MISIÓN -->
                    <div class="devPdfLibraryCol">
                        <div class="devPdfColTitle" style="gap:6px;flex-wrap:wrap;">
                            <span>📚 PDFs por Misión (<span id="devPdfCount">0</span>)</span>
                            <div style="display:flex;align-items:center;gap:5px;">
                                <select id="devPdfLibraryFilter" class="devPdfFilterSelect" title="Filtrar biblioteca por misión">
                                    <option value="all">Todas las misiones</option>
                                    <option value="__pending__">⏳ Pendientes de enlazar</option>
                                </select>
                                <button type="button" id="devExportPdfPackBtn" class="devPdfMiniBtn" title="Exportar manifiesto, bundle y copias locales para GitHub / Proyecto">
                                    📦 Exportar
                                </button>
                                <button type="button" id="devRefreshPdfListBtn" class="devPdfMiniBtn" title="Actualizar lista desde disco y navegador">
                                    ↻
                                </button>
                            </div>
                        </div>

                        <div id="devPdfListContainer" class="devPdfListContainer styledScrollbar">
                            <div class="devPdfEmptyMsg">Cargando documentos del servidor...</div>
                        </div>

                        <div id="devPdfExportBox" class="devPdfExportBox" style="display:none;"></div>
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
            reader.onload = async (evt) => {
                const rawDataUrl = evt.target?.result;
                if (!rawDataUrl) return;

                // Convertir a PNG válido antes de persistir en assets/ui/monteserin_academy_logo_clean.png
                let cleanPngDataUrl = rawDataUrl;
                try {
                    cleanPngDataUrl = await new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth || img.width || 512;
                            canvas.height = img.naturalHeight || img.height || 512;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                resolve(canvas.toDataURL('image/png'));
                            } else {
                                resolve(rawDataUrl);
                            }
                        };
                        img.onerror = () => resolve(rawDataUrl);
                        img.src = rawDataUrl;
                    });
                } catch (_) {}

                logoPreview.src = cleanPngDataUrl;
                const stageLogo = document.querySelector('.dialogue-stage-logo');
                if (stageLogo) stageLogo.src = cleanPngDataUrl;

                logoStatus.textContent = `⏳ Guardando logotipo "${file.name}" en el proyecto...`;
                logoStatus.className = 'devStatusMsg';

                try {
                    const res = await fetch('/api/upload-logo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cleanBase64Data: cleanPngDataUrl,
                            rawBase64Data: cleanPngDataUrl
                        })
                    });
                    const ctype = (res.headers.get('content-type') || '').toLowerCase();
                    if (!res.ok || !ctype.includes('application/json')) {
                        throw new Error('Sin servidor de desarrollo local');
                    }
                    logoPreview.src = `assets/ui/monteserin_academy_logo_clean.png?v=${Date.now()}`;
                    logoStatus.textContent = `✅ Logo guardado permanentemente en assets/ y public/: ${file.name}`;
                    logoStatus.className = 'devStatusMsg success';
                    showDevToast(`🎨 Logotipo guardado en disco: ${file.name}`);
                } catch (_) {
                    logoStatus.textContent = `⚠️ Logo aplicado solo en memoria temporal (requiere servidor dev para grabar en disco): ${file.name}`;
                    logoStatus.className = 'devStatusMsg warning';
                }
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

            const isJpg = file.type.includes('jpeg') || /\.jpe?g$/i.test(file.name);
            if (!isJpg) {
                carnetStatus.textContent = '⚠️ Selecciona una imagen en formato .JPG o .JPEG.';
                carnetStatus.className = 'devStatusMsg error';
                return;
            }

            const reader = new FileReader();
            reader.onload = async (evt) => {
                const dataUrl = evt.target?.result;
                if (!dataUrl) return;
                carnetPreview.src = dataUrl;

                if (registryCatalog.aspirantCard) {
                    registryCatalog.aspirantCard.thumbnail = dataUrl;
                    registryCatalog.aspirantCard.documentImage = dataUrl;
                }

                carnetStatus.textContent = `⏳ Guardando carnet "${file.name}" en el proyecto...`;
                carnetStatus.className = 'devStatusMsg';

                try {
                    const res = await fetch('/api/upload-carnet', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ carnetBase64Data: dataUrl })
                    });
                    const ctype = (res.headers.get('content-type') || '').toLowerCase();
                    if (!res.ok || !ctype.includes('application/json')) {
                        throw new Error('Sin servidor de desarrollo local');
                    }
                    const bustedUrl = `assets/ui/ASPIRANTE.jpg?v=${Date.now()}`;
                    carnetPreview.src = bustedUrl;
                    if (registryCatalog.aspirantCard) {
                        registryCatalog.aspirantCard.thumbnail = bustedUrl;
                        registryCatalog.aspirantCard.documentImage = bustedUrl;
                    }
                    carnetStatus.textContent = `✅ Carnet JPG guardado permanentemente en assets/ y public/: ${file.name}`;
                    carnetStatus.className = 'devStatusMsg success';
                    showDevToast(`🪪 Carnet JPG guardado en disco: ${file.name}`);
                } catch (_) {
                    carnetStatus.textContent = `⚠️ Carnet aplicado en memoria temporal (requiere servidor dev para grabar en disco): ${file.name}`;
                    carnetStatus.className = 'devStatusMsg warning';
                }
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
                    URL.revokeObjectURL(blobUrl);
                    equipItem(targetSocket, model, { scale: 1.0 });
                    glbStatus.textContent = `✅ Modelo "${file.name}" acoplado a ${targetSocket}!`;
                    glbStatus.className = 'devStatusMsg success';
                },
                (err) => {
                    URL.revokeObjectURL(blobUrl);
                    glbStatus.textContent = `❌ Error al cargar modelo 3D: ${err.message || 'Formato no soportado'}`;
                    glbStatus.className = 'devStatusMsg error';
                }
            );
        };
    }
}

function setupPdfManagerEvents() {
    const missionSelect = document.getElementById('devPdfMissionSelect');
    const customMissionWrap = document.getElementById('devPdfCustomMissionWrap');
    const customMissionInput = document.getElementById('devPdfCustomMissionInput');
    const titleInput = document.getElementById('devPdfTitleInput');
    const presetRow = document.getElementById('devPdfPresetRow');
    const targetNameInput = document.getElementById('devPdfTargetNameInput');
    const targetPathHint = document.getElementById('devPdfTargetPathHint');
    const dropZone = document.getElementById('devPdfDropZone');
    const fileInput = document.getElementById('devPdfFileInput');
    const metaBox = document.getElementById('devPdfFileMetaBox');
    const selectedNameEl = document.getElementById('devPdfSelectedName');
    const selectedSizeEl = document.getElementById('devPdfSelectedSize');
    const uploadBtn = document.getElementById('devUploadPdfBtn');
    const saveMetaBtn = document.getElementById('devSavePdfMetaBtn');
    const verifyBox = document.getElementById('devPdfVerifyBox');
    const verifyLink = document.getElementById('devPdfVerifyLink');
    const statusEl = document.getElementById('devPdfStatus');
    const libraryFilter = document.getElementById('devPdfLibraryFilter');
    const listContainer = document.getElementById('devPdfListContainer');
    const countEl = document.getElementById('devPdfCount');
    const refreshBtn = document.getElementById('devRefreshPdfListBtn');
    const exportPackBtn = document.getElementById('devExportPdfPackBtn');
    const exportBox = document.getElementById('devPdfExportBox');
    const envBanner = document.getElementById('devPdfEnvBanner');

    let pendingBase64 = null;
    let pendingOriginalName = '';
    let selectedMissionId = 'mission002';
    let uploadMode = 'existing'; // 'existing' | 'new'
    let activeTargetFilename = 'higiene_visual.pdf';
    let isManualFilename = false;
    let isDevServerAvailable = true;

    function getSelectedMissionMeta() {
        const rawSelect = missionSelect ? missionSelect.value : selectedMissionId;
        if (rawSelect === '__custom__') {
            const rawCustom = customMissionInput ? customMissionInput.value.trim() : '';
            if (!rawCustom) {
                return { missionId: 'unassigned', missionLabel: 'Sin misión asignada / General' };
            }
            const normId = normalizeMissionId(rawCustom);
            const label = rawCustom.includes(':') || /^misi[oó]n/i.test(rawCustom)
                ? rawCustom
                : formatDefaultMissionLabel(normId, rawCustom);
            return { missionId: normId, missionLabel: label };
        }
        const mId = normalizeMissionId(rawSelect || 'unassigned');
        const selectedOpt = missionSelect?.selectedOptions?.[0];
        const label = selectedOpt ? selectedOpt.textContent.trim() : formatDefaultMissionLabel(mId);
        return { missionId: mId, missionLabel: label };
    }

    function buildSuggestedFilename(rawFileName, missionId) {
        const normalized = normalizePdfFilenameInput(rawFileName);
        if (!normalized) return '';
        const prefix = getMissionPrefix(missionId);
        if (!prefix) return normalized;
        if (/^m\d{2,3}_/i.test(normalized)) {
            return prefix + stripMissionPrefix(normalized);
        }
        return prefix + normalized;
    }

    function populateMissionSelect(preserveValue = true) {
        if (!missionSelect) return;
        const prev = preserveValue ? missionSelect.value : selectedMissionId;
        const choices = buildMissionChoices(existingServerPdfs);
        missionSelect.innerHTML = [
            ...choices.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`),
            `<option value="__custom__">➕ Escribir otra misión personalizada...</option>`
        ].join('');

        if (prev && Array.from(missionSelect.options).some((o) => o.value === prev)) {
            missionSelect.value = prev;
        } else if (Array.from(missionSelect.options).some((o) => o.value === selectedMissionId)) {
            missionSelect.value = selectedMissionId;
        }
        if (customMissionWrap) {
            customMissionWrap.style.display = missionSelect.value === '__custom__' ? 'block' : 'none';
        }
    }

    function populateLibraryFilter() {
        if (!libraryFilter) return;
        const prev = libraryFilter.value || 'all';
        const seenMissions = new Map();
        existingServerPdfs.forEach((doc) => {
            const meta = getEffectiveDocMeta(doc);
            if (!seenMissions.has(meta.missionId)) {
                seenMissions.set(meta.missionId, meta.missionLabel);
            }
        });

        const sortedEntries = Array.from(seenMissions.entries()).sort((a, b) => {
            if (a[0] === 'unassigned') return 1;
            if (b[0] === 'unassigned') return -1;
            const na = getMissionNumber(a[0]);
            const nb = getMissionNumber(b[0]);
            if (na !== null && nb !== null) return na - nb;
            if (na !== null) return -1;
            if (nb !== null) return 1;
            return a[1].localeCompare(b[1]);
        });

        libraryFilter.innerHTML = [
            `<option value="all">Todas las misiones (${existingServerPdfs.length})</option>`,
            `<option value="__pending__">⏳ Pendientes de enlazar</option>`,
            ...sortedEntries.map(([mId, mLabel]) => `<option value="${escapeHtml(mId)}">${escapeHtml(mLabel)}</option>`)
        ].join('');

        if (Array.from(libraryFilter.options).some((o) => o.value === prev)) {
            libraryFilter.value = prev;
        }
    }

    function renderQuickMissionDocsRow() {
        if (!presetRow) return;
        const { missionId } = getSelectedMissionMeta();
        const missionDocs = existingServerPdfs.filter((doc) => getEffectiveDocMeta(doc).missionId === missionId);

        const chipsHtml = [
            ...missionDocs.map((doc) => {
                const meta = getEffectiveDocMeta(doc);
                const isActive = uploadMode === 'existing' && activeTargetFilename.toLowerCase() === doc.filename.toLowerCase();
                const shortTitle = meta.title ? `${doc.filename} · ${meta.title}` : doc.filename;
                return `
                    <button type="button"
                        class="devPdfPresetChip ${isActive ? 'active' : ''}"
                        data-mode="existing"
                        data-filename="${escapeHtml(doc.filename)}"
                        data-title="${escapeHtml(meta.title)}"
                        title="${escapeHtml(shortTitle)}">
                        📄 ${escapeHtml(doc.filename)}
                    </button>
                `;
            }),
            `
                <button type="button"
                    class="devPdfPresetChip ${uploadMode === 'new' ? 'active' : ''}"
                    data-mode="new"
                    data-filename="">
                    ✨ + Nuevo PDF
                </button>
            `
        ].join('');

        presetRow.innerHTML = chipsHtml;

        presetRow.querySelectorAll('.devPdfPresetChip').forEach((chip) => {
            chip.onclick = () => {
                const mode = chip.getAttribute('data-mode') || 'new';
                const fname = chip.getAttribute('data-filename') || '';
                const ftitle = chip.getAttribute('data-title') || '';
                uploadMode = mode;
                isManualFilename = false;

                if (mode === 'existing' && fname) {
                    activeTargetFilename = fname;
                    if (targetNameInput) targetNameInput.value = fname;
                    if (titleInput) titleInput.value = ftitle;
                } else {
                    activeTargetFilename = '';
                    if (titleInput) titleInput.value = '';
                    if (targetNameInput) {
                        if (pendingOriginalName) {
                            targetNameInput.value = buildSuggestedFilename(pendingOriginalName, getSelectedMissionMeta().missionId);
                        } else {
                            targetNameInput.value = getMissionPrefix(getSelectedMissionMeta().missionId);
                            targetNameInput.focus();
                        }
                    }
                }
                renderQuickMissionDocsRow();
                updatePathHintAndUploadState();
            };
        });
    }

    function updatePathHintAndUploadState() {
        const normalized = normalizePdfFilenameInput(targetNameInput?.value || '');
        const existingMatch = normalized
            ? existingServerPdfs.find((d) => d.filename.toLowerCase() === normalized.toLowerCase())
            : null;

        if (targetPathHint) {
            if (!normalized) {
                const pref = getMissionPrefix(getSelectedMissionMeta().missionId);
                targetPathHint.innerHTML = `<span style="color:#fca5a5;">Escribe un nombre válido (ej: <code>${escapeHtml(pref || 'm03_')}documento.pdf</code>)</span>`;
            } else if (existingMatch) {
                const mLabel = getEffectiveDocMeta(existingMatch).missionLabel;
                targetPathHint.innerHTML = `<span>Ruta: <code>assets/docs/${escapeHtml(normalized)}</code> · <strong style="color:#fbbf24;">Existe en ${escapeHtml(mLabel)} (se reemplazará)</strong></span>`;
            } else {
                targetPathHint.innerHTML = `<span>Ruta nueva: <code>assets/docs/${escapeHtml(normalized)}</code> + <code>public/assets/docs/${escapeHtml(normalized)}</code></span>`;
            }
        }

        const canSubmit = Boolean(pendingBase64 && normalized);
        if (uploadBtn) {
            uploadBtn.disabled = !canSubmit;
            uploadBtn.style.opacity = canSubmit ? '1' : '0.5';
            uploadBtn.style.cursor = canSubmit ? 'pointer' : 'not-allowed';
            uploadBtn.textContent = existingMatch ? '🔄 Reemplazar PDF en el Proyecto' : '💾 Guardar Nuevo PDF en el Proyecto';
        }

        if (saveMetaBtn) {
            saveMetaBtn.style.display = existingMatch ? 'block' : 'none';
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

            const { missionId } = getSelectedMissionMeta();
            const currentVal = (targetNameInput?.value || '').trim();
            const isJustPrefix = /^m\d{2,3}_?$/i.test(currentVal);

            if (uploadMode === 'new' && !isManualFilename && (!currentVal || isJustPrefix || currentVal === activeTargetFilename)) {
                if (targetNameInput) {
                    targetNameInput.value = buildSuggestedFilename(file.name, missionId);
                }
            }

            if (titleInput && !titleInput.value.trim() && uploadMode === 'new') {
                const cleanTitle = file.name
                    .replace(/\.pdf$/i, '')
                    .replace(/^m\d{2,3}[_-]+/i, '')
                    .replace(/[_-]+/g, ' ')
                    .trim();
                if (cleanTitle) {
                    titleInput.value = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
                }
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

    function updateEnvBanner() {
        if (!envBanner) return;
        const localOverrideDocs = existingServerPdfs.filter((d) => d.hasLocalOverride);
        if (!isDevServerAvailable) {
            envBanner.style.display = 'flex';
            envBanner.className = 'devPdfEnvBanner warning';
            envBanner.innerHTML = `<span>⚠️ <strong>Vista estática / sin servidor dev:</strong> los PDFs subidos se guardan solo en tu navegador (<code>IndexedDB</code>). Usa <strong>📦 Exportar</strong> para llevarlos a GitHub/Proyecto.</span>`;
            return;
        }
        if (localOverrideDocs.length > 0) {
            envBanner.style.display = 'flex';
            envBanner.className = 'devPdfEnvBanner info';
            envBanner.innerHTML = `<span>💾 Tienes <strong>${localOverrideDocs.length}</strong> cambio(s) en <code>IndexedDB</code> más recientes que el disco (protegidos frente a recargas y resyncs de AI Studio). Usa <strong>📦 Exportar</strong> para fijarlos en tu repo.</span>`;
            return;
        }
        envBanner.style.display = 'none';
        envBanner.innerHTML = '';
    }

    function triggerTextFileDownload(filename, textContent, mimeType = 'text/plain;charset=utf-8') {
        const blob = new Blob([textContent], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    }

    async function performUpload(overwrite = false) {
        const targetFilename = normalizePdfFilenameInput(targetNameInput?.value || '');
        if (!pendingBase64 || !targetFilename) return;

        const { missionId, missionLabel } = getSelectedMissionMeta();
        const docTitle = (titleInput?.value || '').trim();
        const existingMatch = existingServerPdfs.find((d) => d.filename.toLowerCase() === targetFilename.toLowerCase());

        if (existingMatch && !overwrite) {
            showDevModalDialog({
                title: 'Reemplazar Documento PDF',
                message: `Ya existe <strong>${escapeHtml(targetFilename)}</strong> en el proyecto.<br><br>¿Deseas sobrescribirlo con <strong>${escapeHtml(pendingOriginalName)}</strong> y asociarlo a <strong>${escapeHtml(missionLabel)}</strong>?`,
                confirmText: 'Sí, reemplazar',
                cancelText: 'Cancelar',
                onConfirm: () => {
                    performUpload(true);
                },
                onCancel: () => {
                    setStatus('Subida cancelada. Cambia el nombre de destino si quieres conservar ambos.', 'warning');
                    updatePathHintAndUploadState();
                }
            });
            return;
        }

        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '⏳ Guardando PDF...';
        }
        setStatus('Guardando PDF en servidor y en almacenamiento local (IndexedDB)...', '');

        let savedToServer = false;
        let finalFilename = targetFilename;
        let finalSize = 0;
        let finalUpdatedAt = Date.now();
        let finalUrl = `./assets/docs/${encodeURIComponent(targetFilename)}`;
        let finalCatalogId = existingMatch?.catalogId || '';

        try {
            const res = await fetch('/api/upload-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: targetFilename,
                    base64Data: pendingBase64,
                    overwrite,
                    missionId,
                    missionLabel,
                    title: docTitle
                })
            });

            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            const data = ctype.includes('application/json') ? await res.json().catch(() => ({})) : {};

            if (res.status === 409 && !overwrite) {
                showDevModalDialog({
                    title: 'Reemplazar Documento PDF',
                    message: `Ya existe <strong>${escapeHtml(targetFilename)}</strong> en el proyecto.<br><br>¿Deseas sobrescribirlo con <strong>${escapeHtml(pendingOriginalName)}</strong> y asociarlo a <strong>${escapeHtml(missionLabel)}</strong>?`,
                    confirmText: 'Sí, reemplazar',
                    cancelText: 'Cancelar',
                    onConfirm: () => {
                        performUpload(true);
                    },
                    onCancel: () => {
                        setStatus('Subida cancelada. Cambia el nombre de destino si quieres conservar ambos.', 'warning');
                        updatePathHintAndUploadState();
                    }
                });
                return;
            }

            if (res.ok && data.success) {
                savedToServer = true;
                isDevServerAvailable = true;
                finalFilename = data.filename || targetFilename;
                finalSize = Number(data.size) || 0;
                finalUpdatedAt = Number(data.updatedAt) || Date.now();
                finalUrl = data.url || finalUrl;
                finalCatalogId = data.catalogId || finalCatalogId;
            } else if (!ctype.includes('application/json')) {
                isDevServerAvailable = false;
            } else {
                throw new Error(data.error || `Error HTTP ${res.status}`);
            }
        } catch (err) {
            if (err && /Error HTTP|cabecera PDF|límite|permitido/i.test(String(err.message || ''))) {
                setStatus(`❌ Error al guardar PDF: ${err.message || err}`, 'error');
                updatePathHintAndUploadState();
                return;
            }
            isDevServerAvailable = false;
        }

        // Guardar siempre copia binaria en IndexedDB para resistir recargas y resyncs de AI Studio
        const localRec = await saveLocalPdfOverride({
            filename: finalFilename,
            base64Data: pendingBase64,
            size: finalSize,
            updatedAt: finalUpdatedAt,
            missionId,
            missionLabel,
            title: docTitle || existingMatch?.title || '',
            catalogId: finalCatalogId
        });

        finalSize = finalSize || localRec?.size || 0;

        if (verifyLink) {
            if (savedToServer) {
                verifyLink.href = `${finalUrl}?v=${Date.now()}`;
                verifyLink.onclick = null;
            } else if (localRec?.base64Data) {
                const blobUrl = URL.createObjectURL(base64ToPdfBlob(localRec.base64Data));
                verifyLink.href = blobUrl;
                verifyLink.onclick = () => {
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                };
            }
        }
        if (verifyBox) {
            verifyBox.style.display = 'flex';
        }

        if (savedToServer) {
            setStatus(`✅ "${finalFilename}" guardado en disco y en IndexedDB (${missionLabel} · ${formatBytes(finalSize)}).`, 'success');
            showDevToast(`📄 PDF guardado (${missionLabel}): ${finalFilename}`);
        } else {
            setStatus(`💾 "${finalFilename}" guardado en tu navegador (IndexedDB · ${formatBytes(finalSize)}). Usa 📦 Exportar para llevarlo a GitHub/Proyecto.`, 'warning');
            showDevToast(`💾 PDF guardado en navegador: ${finalFilename}`);
        }

        pendingBase64 = null;
        pendingOriginalName = '';
        uploadMode = 'existing';
        activeTargetFilename = finalFilename;
        isManualFilename = false;
        if (fileInput) fileInput.value = '';
        if (metaBox) metaBox.style.display = 'none';

        await fetchPdfLibrary();
        updatePathHintAndUploadState();
    }

    async function saveMetadataOnly() {
        const targetFilename = normalizePdfFilenameInput(targetNameInput?.value || '');
        if (!targetFilename) return;
        const { missionId, missionLabel } = getSelectedMissionMeta();
        const docTitle = (titleInput?.value || '').trim();

        if (saveMetaBtn) {
            saveMetaBtn.disabled = true;
            saveMetaBtn.textContent = '⏳ Guardando etiqueta...';
        }

        let serverSaved = false;
        try {
            const res = await fetch('/api/upload-pdf', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: targetFilename,
                    missionId,
                    missionLabel,
                    title: docTitle
                })
            });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            const data = ctype.includes('application/json') ? await res.json().catch(() => ({})) : {};
            if (res.ok && data.success) {
                serverSaved = true;
                if (data.manifest) setServerManifestCache(data.manifest);
            }
        } catch (_) {}

        await updateLocalPdfMetadata(targetFilename, { missionId, missionLabel, title: docTitle });

        if (serverSaved) {
            setStatus(`✅ Misión y título actualizados para "${targetFilename}" (${missionLabel}).`, 'success');
        } else {
            setStatus(`💾 Misión y título actualizados en copia local para "${targetFilename}".`, 'warning');
        }
        showDevToast(`🏷️ Organizado en ${missionLabel}: ${targetFilename}`);
        await fetchPdfLibrary();

        if (saveMetaBtn) {
            saveMetaBtn.disabled = false;
            saveMetaBtn.textContent = '🏷️ Actualizar solo Misión / Título (sin resubir PDF)';
        }
    }

    async function assignPdfToCatalog(filename, catalogId) {
        const doc = existingServerPdfs.find((d) => d.filename === filename);
        const meta = doc ? getEffectiveDocMeta(doc) : { missionId: 'unassigned', missionLabel: '', title: '' };
        const now = Date.now();

        if (catalogId) {
            await setLocalCatalogBinding(catalogId, filename, now);
        } else {
            await clearLocalBindingForFilename(filename);
        }

        if (isDevServerAvailable && !doc?.localOnly) {
            try {
                const res = await fetch('/api/upload-pdf', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename,
                        missionId: meta.missionId,
                        missionLabel: meta.missionLabel,
                        title: meta.title,
                        catalogId
                    })
                });
                const ctype = (res.headers.get('content-type') || '').toLowerCase();
                if (res.ok && ctype.includes('application/json')) {
                    const data = await res.json();
                    if (data.manifest) setServerManifestCache(data.manifest);
                }
            } catch (_) {}
        }

        const slotTitle = catalogId ? (registryCatalog?.[catalogId]?.title || catalogId) : 'Sin enlace fijo';
        showDevToast(catalogId ? `🔗 ${filename} → ${slotTitle}` : `🔗 Enlace quitado de ${filename}`);
        await fetchPdfLibrary();
    }

    async function copyToClipboard(text, toastPrefix = '📋 Copiado') {
        try {
            await navigator.clipboard.writeText(text);
            showDevToast(`${toastPrefix}`);
        } catch {
            showDevToast(`📄 ${text}`);
        }
    }

    function buildRegistrySnippet(doc) {
        const meta = getEffectiveDocMeta(doc);
        const baseId = doc.filename
            .replace(/\.pdf$/i, '')
            .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
            .replace(/^[^a-zA-Z]+/, '') || 'missionDoc';
        const catalogKey = `${baseId}Doc`;
        const cleanTitle = meta.title || doc.filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
        return `    // ${meta.missionLabel} (${meta.missionId})
    ${catalogKey}: {
        id: "${catalogKey}",
        type: "document",
        title: "${cleanTitle}",
        description: "Documento obtenido durante ${meta.missionLabel}.",
        thumbnail: "assets/registry/inventory/docHygiene.svg",
        documentImage: "${doc.assetPath}",
        downloadFilename: "${doc.filename}",
        canOpen: true,
        canArchive: true
    },`;
    }

    function loadDocIntoForm(doc) {
        const meta = getEffectiveDocMeta(doc);
        selectedMissionId = meta.missionId;
        uploadMode = 'existing';
        activeTargetFilename = doc.filename;
        isManualFilename = false;

        if (missionSelect) {
            if (Array.from(missionSelect.options).some((o) => o.value === meta.missionId)) {
                missionSelect.value = meta.missionId;
                if (customMissionWrap) customMissionWrap.style.display = 'none';
            } else {
                missionSelect.value = '__custom__';
                if (customMissionWrap) customMissionWrap.style.display = 'block';
                if (customMissionInput) customMissionInput.value = meta.missionLabel || meta.missionId;
            }
        }
        if (targetNameInput) targetNameInput.value = doc.filename;
        if (titleInput) titleInput.value = meta.title || '';

        renderQuickMissionDocsRow();
        updatePathHintAndUploadState();
        setStatus(`Editando "${doc.filename}". Arrastra un PDF nuevo para reemplazarlo o cambia su misión/título.`, '');
    }

    function renderPdfLibraryList(docs) {
        if (!listContainer) return;
        if (countEl) countEl.textContent = String(docs.length);

        if (!docs || docs.length === 0) {
            listContainer.innerHTML = `
                <div class="devPdfEmptyMsg">
                    Aún no hay archivos PDF guardados en <code>assets/docs/</code>.<br>
                    Selecciona una misión y sube un documento en la columna izquierda.
                </div>
            `;
            return;
        }

        const linkMap = buildRegistryPdfLinkMap();
        const activeFilter = libraryFilter ? libraryFilter.value : 'all';

        const filteredDocs = docs.filter((doc) => {
            const meta = getEffectiveDocMeta(doc);
            const linked = linkMap.get(doc.filename.toLowerCase());
            if (activeFilter === '__pending__') return !linked;
            if (activeFilter && activeFilter !== 'all') return meta.missionId === activeFilter;
            return true;
        });

        if (filteredDocs.length === 0) {
            listContainer.innerHTML = `
                <div class="devPdfEmptyMsg">
                    No hay documentos PDF que coincidan con este filtro.
                </div>
            `;
            return;
        }

        // Agrupar por misión
        const groups = new Map();
        filteredDocs.forEach((doc) => {
            const meta = getEffectiveDocMeta(doc);
            if (!groups.has(meta.missionId)) {
                groups.set(meta.missionId, {
                    missionId: meta.missionId,
                    missionLabel: meta.missionLabel,
                    items: []
                });
            }
            groups.get(meta.missionId).items.push({ doc, meta });
        });

        const sortedGroups = Array.from(groups.values()).sort((a, b) => {
            if (a.missionId === 'unassigned') return 1;
            if (b.missionId === 'unassigned') return -1;
            const na = getMissionNumber(a.missionId);
            const nb = getMissionNumber(b.missionId);
            if (na !== null && nb !== null) return na - nb;
            if (na !== null) return -1;
            if (nb !== null) return 1;
            return a.missionLabel.localeCompare(b.missionLabel);
        });

        const catalogSlots = getPdfCatalogSlots();

        listContainer.innerHTML = sortedGroups.map((group) => `
            <div class="devPdfMissionGroup">
                <div class="devPdfMissionGroupHeader">
                    <span>📂 ${escapeHtml(group.missionLabel)}</span>
                    <span class="devPdfMissionGroupCount">${group.items.length} PDF${group.items.length === 1 ? '' : 's'}</span>
                </div>
                ${group.items.map(({ doc, meta }) => {
                    const bothSynced = doc.inAssets && doc.inPublic;
                    const linked = linkMap.get(doc.filename.toLowerCase());
                    const displayTitle = linked?.title || meta.title;
                    const selectedCatId = linked ? linked.catalogId : '';
                    const syncBadgeHtml = doc.hasLocalOverride
                        ? `<span class="devPdfSyncBadge localOnly" title="Copia guardada en IndexedDB de tu navegador (sobrevive a recargas/resyncs)">💾 Local (navegador)</span>`
                        : `<span class="devPdfSyncBadge ${bothSynced ? '' : 'partial'}" title="${bothSynced ? 'Sincronizado en assets/docs y public/assets/docs' : 'Falta copia en una de las carpetas'}">${bothSynced ? '✓ Dev + GitHub' : (doc.inPublic ? 'Solo public/' : 'Solo assets/')}</span>`;

                    const assignOptionsHtml = [
                        `<option value="">— Sin enlace en Registro —</option>`,
                        ...catalogSlots.map((slot) => {
                            const isSel = selectedCatId === slot.catalogId;
                            const suffix = isSel && linked && !linked.isExplicit ? ' (Por defecto)' : '';
                            return `<option value="${escapeHtml(slot.catalogId)}" ${isSel ? 'selected' : ''}>${escapeHtml(slot.title)}${suffix}</option>`;
                        })
                    ].join('');

                    return `
                        <div class="devPdfItemRow">
                            <div class="devPdfItemInfo">
                                <div class="devPdfItemName" title="${escapeHtml(doc.assetPath)}">📄 ${escapeHtml(doc.filename)}</div>
                                ${displayTitle ? `<div class="devPdfItemTitle" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</div>` : ''}
                                <div class="devPdfItemMeta">
                                    <span>${formatBytes(doc.size)}</span>
                                    ${syncBadgeHtml}
                                    <span class="devPdfLinkBadge ${linked ? '' : 'pending'}" title="${linked ? `Conectado en el juego como "${linked.title}" (${linked.catalogId})` : 'Subido al proyecto pero aún no enlazado a ningún documento del Registro'}">
                                        ${linked ? `✓ Enlazado (${escapeHtml(linked.catalogId)})` : '⏳ Pendiente enlazar'}
                                    </span>
                                </div>
                                <div class="devPdfAssignRow">
                                    <span class="devPdfAssignLabel">🔗 Usar como:</span>
                                    <select class="devPdfAssignSelect" data-filename="${escapeHtml(doc.filename)}" title="Asignar este PDF a un documento del Registro del juego">
                                        ${assignOptionsHtml}
                                    </select>
                                </div>
                            </div>
                            <div class="devPdfItemActions">
                                <a href="${escapeHtml(doc.url)}?v=${Number(doc.updatedAt) || Date.now()}" target="_blank" rel="noopener noreferrer" class="devPdfMiniBtn devOpenPdfBtn" data-filename="${escapeHtml(doc.filename)}" data-url="${escapeHtml(doc.url)}" title="Abrir PDF en nueva pestaña">
                                    👁️
                                </a>
                                <button type="button" class="devPdfMiniBtn devSelectForEditBtn" data-filename="${escapeHtml(doc.filename)}" title="Reemplazar PDF o cambiar su misión/título">
                                    🔄
                                </button>
                                ${doc.hasLocalOverride ? `
                                    <button type="button" class="devPdfMiniBtn devClearLocalBtn" data-filename="${escapeHtml(doc.filename)}" title="Descartar copia local del navegador y volver a la versión del proyecto">
                                        🧹
                                    </button>
                                ` : ''}
                                <button type="button" class="devPdfMiniBtn devCopySnippetBtn" data-filename="${escapeHtml(doc.filename)}" title="Copiar bloque listo para registryCatalog.js">
                                    🧩
                                </button>
                                <button type="button" class="devPdfMiniBtn devCopyPdfPathBtn" data-path="${escapeHtml(doc.assetPath)}" title="Copiar ruta del proyecto">
                                    📋
                                </button>
                                <button type="button" class="devPdfMiniBtn danger devDeletePdfBtn" data-filename="${escapeHtml(doc.filename)}" title="Eliminar PDF de assets/, public/ y navegador">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `).join('');

        listContainer.querySelectorAll('.devPdfAssignSelect').forEach((sel) => {
            sel.onchange = () => {
                const fname = sel.getAttribute('data-filename');
                if (fname) assignPdfToCatalog(fname, sel.value || '');
            };
        });

        listContainer.querySelectorAll('.devOpenPdfBtn').forEach((link) => {
            link.onclick = async (e) => {
                const rawUrl = link.getAttribute('data-url');
                const fname = link.getAttribute('data-filename');
                const localRec = getLocalPdfRecord(fname);
                const docEntry = existingServerPdfs.find((d) => d.filename === fname);

                if (docEntry?.hasLocalOverride && localRec?.base64Data) {
                    e.preventDefault();
                    const blobUrl = URL.createObjectURL(base64ToPdfBlob(localRec.base64Data));
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                    return;
                }

                const bundledDataUri = getBundledCustomDocDataUri(rawUrl) || getBundledCustomDocDataUri(fname);
                if (!bundledDataUri) return;

                try {
                    const headRes = await fetch(`${rawUrl}?v=${Date.now()}`, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
                    const ctype = (headRes?.headers?.get('content-type') || '').toLowerCase();
                    if (headRes && headRes.ok && ctype.includes('application/pdf')) {
                        return;
                    }
                    e.preventDefault();
                    const blob = base64ToPdfBlob(bundledDataUri);
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                } catch (_) {}
            };
        });

        listContainer.querySelectorAll('.devSelectForEditBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                const doc = existingServerPdfs.find((d) => d.filename === fname);
                if (doc) loadDocIntoForm(doc);
            };
        });

        listContainer.querySelectorAll('.devClearLocalBtn').forEach((btn) => {
            btn.onclick = async () => {
                const fname = btn.getAttribute('data-filename');
                if (!fname) return;
                await removeLocalPdfOverride(fname);
                showDevToast(`🧹 Copia local eliminada para ${fname}`);
                await fetchPdfLibrary();
            };
        });

        listContainer.querySelectorAll('.devCopySnippetBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                const doc = existingServerPdfs.find((d) => d.filename === fname);
                if (doc) {
                    copyToClipboard(buildRegistrySnippet(doc), `🧩 Snippet copiado para ${fname}`);
                }
            };
        });

        listContainer.querySelectorAll('.devCopyPdfPathBtn').forEach((btn) => {
            btn.onclick = () => {
                const p = btn.getAttribute('data-path');
                copyToClipboard(p, `📋 Ruta copiada: ${p}`);
            };
        });

        listContainer.querySelectorAll('.devDeletePdfBtn').forEach((btn) => {
            btn.onclick = () => {
                const fname = btn.getAttribute('data-filename');
                if (!fname) return;
                const docEntry = existingServerPdfs.find((d) => d.filename === fname);
                showDevModalDialog({
                    title: 'Eliminar Documento PDF',
                    message: docEntry?.localOnly
                        ? `¿Seguro que quieres eliminar <strong>${escapeHtml(fname)}</strong> del almacenamiento local del navegador?`
                        : `¿Seguro que quieres eliminar <strong>${escapeHtml(fname)}</strong> tanto de <code>assets/docs/</code> como de <code>public/assets/docs/</code> y del navegador?`,
                    confirmText: 'Eliminar PDF',
                    cancelText: 'Cancelar',
                    isDanger: true,
                    onConfirm: async () => {
                        try {
                            await removeLocalPdfOverride(fname);
                            await clearLocalBindingForFilename(fname);
                            if (isDevServerAvailable && !docEntry?.localOnly) {
                                const res = await fetch(`/api/upload-pdf?filename=${encodeURIComponent(fname)}`, {
                                    method: 'DELETE'
                                });
                                const ctype = (res.headers.get('content-type') || '').toLowerCase();
                                const data = ctype.includes('application/json') ? await res.json().catch(() => ({})) : {};
                                if (!res.ok || !data.success) {
                                    throw new Error(data.error || 'No se pudo eliminar en disco');
                                }
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
        await initPdfDocumentStore();
        let baseDocs = [];

        try {
            const res = await fetch('/api/upload-pdf', { cache: 'no-store' });
            const ctype = (res.headers.get('content-type') || '').toLowerCase();
            if (!res.ok || !ctype.includes('application/json')) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            isDevServerAvailable = true;
            if (data.manifest) setServerManifestCache(data.manifest);
            baseDocs = Array.isArray(data.docs) ? data.docs : [];
        } catch (_) {
            isDevServerAvailable = false;
            baseDocs = getBundledCustomDocsList();
        }

        // Fusionar copias locales guardadas en IndexedDB
        const mergedMap = new Map();
        baseDocs.forEach((doc) => {
            mergedMap.set(doc.filename.toLowerCase(), { ...doc, hasLocalOverride: false, localOnly: false });
        });

        const localRecords = getAllLocalPdfRecords();
        localRecords.forEach((rec) => {
            const lower = rec.filename.toLowerCase();
            const existing = mergedMap.get(lower);
            if (existing) {
                const overrideNewer = isLocalOverrideNewerThanServer(rec.filename, existing) || !isDevServerAvailable;
                if (overrideNewer) {
                    existing.hasLocalOverride = true;
                    existing.size = rec.size || existing.size;
                    existing.updatedAt = rec.updatedAt || existing.updatedAt;
                    existing.missionId = rec.missionId || existing.missionId;
                    existing.missionLabel = rec.missionLabel || existing.missionLabel;
                    existing.title = rec.title || existing.title;
                    existing.localBase64 = rec.base64Data;
                }
            } else {
                mergedMap.set(lower, {
                    filename: rec.filename,
                    url: `./assets/docs/${encodeURIComponent(rec.filename)}`,
                    assetPath: `assets/docs/${rec.filename}`,
                    size: rec.size || 0,
                    updatedAt: rec.updatedAt || Date.now(),
                    inAssets: false,
                    inPublic: false,
                    missionId: rec.missionId || 'unassigned',
                    missionLabel: rec.missionLabel || 'Sin misión asignada',
                    title: rec.title || '',
                    catalogId: rec.catalogId || '',
                    hasLocalOverride: true,
                    localOnly: true,
                    localBase64: rec.base64Data
                });
            }
        });

        existingServerPdfs = Array.from(mergedMap.values()).sort((a, b) => a.filename.localeCompare(b.filename));

        populateMissionSelect(true);
        populateLibraryFilter();
        renderQuickMissionDocsRow();
        renderPdfLibraryList(existingServerPdfs);
        updateEnvBanner();
        updatePathHintAndUploadState();
    }

    if (missionSelect) {
        missionSelect.onchange = () => {
            const val = missionSelect.value;
            selectedMissionId = val;
            if (customMissionWrap) {
                customMissionWrap.style.display = val === '__custom__' ? 'block' : 'none';
                if (val === '__custom__' && customMissionInput) customMissionInput.focus();
            }

            const { missionId } = getSelectedMissionMeta();
            const missionDocs = existingServerPdfs.filter((d) => getEffectiveDocMeta(d).missionId === missionId);

            if (missionDocs.length > 0 && !pendingBase64) {
                const firstDoc = missionDocs[0];
                const meta = getEffectiveDocMeta(firstDoc);
                uploadMode = 'existing';
                activeTargetFilename = firstDoc.filename;
                isManualFilename = false;
                if (targetNameInput) targetNameInput.value = firstDoc.filename;
                if (titleInput) titleInput.value = meta.title || '';
            } else {
                uploadMode = 'new';
                activeTargetFilename = '';
                if (!isManualFilename && targetNameInput) {
                    targetNameInput.value = pendingOriginalName
                        ? buildSuggestedFilename(pendingOriginalName, missionId)
                        : getMissionPrefix(missionId);
                }
            }

            renderQuickMissionDocsRow();
            updatePathHintAndUploadState();
        };
    }

    if (customMissionInput) {
        customMissionInput.oninput = () => {
            if (uploadMode === 'new' && !isManualFilename && targetNameInput) {
                const { missionId } = getSelectedMissionMeta();
                targetNameInput.value = pendingOriginalName
                    ? buildSuggestedFilename(pendingOriginalName, missionId)
                    : getMissionPrefix(missionId);
            }
            updatePathHintAndUploadState();
        };
    }

    if (targetNameInput) {
        targetNameInput.oninput = () => {
            isManualFilename = Boolean(targetNameInput.value.trim());
            updatePathHintAndUploadState();
        };
    }

    if (libraryFilter) {
        libraryFilter.onchange = () => {
            renderPdfLibraryList(existingServerPdfs);
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

    if (saveMetaBtn) {
        saveMetaBtn.onclick = () => saveMetadataOnly();
    }

    if (refreshBtn) {
        refreshBtn.onclick = () => fetchPdfLibrary();
    }

    if (exportPackBtn && exportBox) {
        exportPackBtn.onclick = async () => {
            if (exportBox.style.display !== 'none') {
                exportBox.style.display = 'none';
                return;
            }
            const pkg = await buildExportableDocsPackage(existingServerPdfs);
            const localBtnsHtml = pkg.localOnlyFiles.map((f) => `
                <button type="button" class="devPdfMiniBtn devExportPdfFileBtn" data-filename="${escapeHtml(f.filename)}">
                    ⬇️ ${escapeHtml(f.filename)} (${formatBytes(f.size)})
                </button>
            `).join('');

            exportBox.innerHTML = `
                <div class="devPdfExportHeader">
                    <span>📦 Exportar para GitHub / Proyecto (${pkg.localOnlyFiles.length} copia(s) local(es))</span>
                    <button type="button" id="devCloseExportBoxBtn" class="devPdfMiniBtn">✕</button>
                </div>
                <div class="devPdfExportActions">
                    <button type="button" id="devDownloadManifestBtn" class="devPdfMiniBtn">📄 Descargar docs_manifest.json</button>
                    <button type="button" id="devDownloadBundleBtn" class="devPdfMiniBtn">📦 Descargar customAssetsBundle.js</button>
                    ${localBtnsHtml}
                </div>
            `;
            exportBox.style.display = 'flex';

            const closeBtn = document.getElementById('devCloseExportBoxBtn');
            if (closeBtn) closeBtn.onclick = () => { exportBox.style.display = 'none'; };

            const dlManifestBtn = document.getElementById('devDownloadManifestBtn');
            if (dlManifestBtn) {
                dlManifestBtn.onclick = () => {
                    triggerTextFileDownload('docs_manifest.json', pkg.manifestJson, 'application/json;charset=utf-8');
                    showDevToast('📄 Descargado docs_manifest.json');
                };
            }

            const dlBundleBtn = document.getElementById('devDownloadBundleBtn');
            if (dlBundleBtn) {
                dlBundleBtn.onclick = () => {
                    triggerTextFileDownload('customAssetsBundle.js', pkg.bundleJs, 'application/javascript;charset=utf-8');
                    showDevToast('📦 Descargado customAssetsBundle.js');
                };
            }

            exportBox.querySelectorAll('.devExportPdfFileBtn').forEach((btn) => {
                btn.onclick = () => {
                    const fname = btn.getAttribute('data-filename');
                    const fileObj = pkg.localOnlyFiles.find((x) => x.filename === fname);
                    if (!fileObj) return;
                    const blob = base64ToPdfBlob(fileObj.base64Data);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileObj.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 15000);
                    showDevToast(`⬇️ Descargado ${fileObj.filename}`);
                };
            });
        };
    }

    populateMissionSelect(false);
    renderQuickMissionDocsRow();
    updatePathHintAndUploadState();
    fetchPdfLibrary();
}
