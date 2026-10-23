/* ======================================================
   MONTESERIN ACADEMY - ASSET MANAGER (DEV SUITE)
   Gestor de recursos con ranuras aisladas (Slots) para
   evitar confusiones entre logos, carnets y modelos 3D.
   ====================================================== */

import { registryCatalog } from '../ui/registry/registryCatalog.js';
import { equipItem, loadGLBEquipment } from '../player/playerEquipment.js';

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

            <!-- RANURA 3: NUEVO DOCUMENTO (MISIONES FUTURAS) -->
            <div class="devSlotCard">
                <div class="devSlotHeader">
                    <span class="devSlotBadge">RANURA 3</span>
                    <h4 class="devSlotTitle">Registrar Nuevo Documento</h4>
                </div>
                <p class="devSlotDesc">Registra acreditaciones o documentos adicionales para las siguientes misiones.</p>
                <div class="devSlotInputs">
                    <input type="text" id="devDocId" placeholder="ID único (ej: carnet_socio)" class="devInputText" />
                    <input type="text" id="devDocTitle" placeholder="Título (ej: Carnet de Socio Oficial)" class="devInputText" />
                    <textarea id="devDocDesc" placeholder="Descripción del documento..." class="devTextarea"></textarea>
                </div>
                <label class="devFileBtn">
                    📁 Seleccionar imagen del documento
                    <input type="file" id="devDocFileInput" accept="image/*" style="display:none;" />
                </label>
                <button id="devSaveDocBtn" class="devActionBtn" style="margin-top:6px;">
                    ➕ Añadir al Catálogo del Registro
                </button>
                <div id="devDocStatus" class="devStatusMsg"></div>
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
        </div>
    `;

    setupSlotEvents();
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

                // Actualizar inmediatamente en el escenario de diálogo si está activo
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

                // Actualizar catálogo en memoria
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
    // Ranura 3: Documento adicional
    // ------------------------------------------
    const docInput = document.getElementById('devDocFileInput');
    const saveDocBtn = document.getElementById('devSaveDocBtn');
    const docStatus = document.getElementById('devDocStatus');
    let loadedDocDataUrl = null;

    if (docInput) {
        docInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                loadedDocDataUrl = evt.target.result;
                docStatus.textContent = `Archivo listo: ${file.name}`;
                docStatus.className = 'devStatusMsg';
            };
            reader.readAsDataURL(file);
        };
    }

    if (saveDocBtn) {
        saveDocBtn.onclick = () => {
            const id = (document.getElementById('devDocId').value || '').trim();
            const title = (document.getElementById('devDocTitle').value || '').trim();
            const desc = (document.getElementById('devDocDesc').value || '').trim();

            if (!id || !title || !loadedDocDataUrl) {
                docStatus.textContent = '⚠️ Debes rellenar ID, Título y seleccionar una imagen.';
                docStatus.className = 'devStatusMsg error';
                return;
            }

            registryCatalog[id] = {
                id,
                type: 'document',
                title,
                description: desc || 'Documento oficial registrado en Monteserín Academy.',
                thumbnail: loadedDocDataUrl,
                documentImage: loadedDocDataUrl,
                canOpen: true,
                canArchive: true,
                isArchived: true
            };

            docStatus.textContent = `✅ Documento "${title}" añadido al catálogo del Registro exitosamente.`;
            docStatus.className = 'devStatusMsg success';
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
