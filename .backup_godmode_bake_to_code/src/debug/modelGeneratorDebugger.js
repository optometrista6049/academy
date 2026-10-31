/* ======================================================
   MONTESERIN ACADEMY - 3D MODEL GENERATOR & STUDIO (DEV TAB)
   Pestaña dedicada para generar, editar y compilar modelos
   Three.js mediante prompts de texto, código en vivo y
   guardado persistente en la biblioteca de objetos.
   ====================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
    getCustomItems, 
    saveCustomItem, 
    deleteCustomItem, 
    buildThreeMeshFromCode,
    resetCustomLibrary,
    exportItemsJSON,
    importItemsJSON,
    updateCustomItemName
} from '../systems/customItemStorage.js';
import { generateThreeModelFromPrompt } from '../systems/threeGeneratorEngine.js';
import { showDevModalDialog, escapeHtml } from './devModalDialog.js';

// Estado del visor 3D del generador
let genScene = null;
let genCamera = null;
let genRenderer = null;
let genControls = null;
let genCurrentObject = null;
let genGridHelper = null;
let genAnimationId = null;
let genAutoRotate = false;
let genWireframe = false;
let genResizeObserver = null;
let genCurrentCode = '';
let genCurrentId = null;

export function renderModelGeneratorTab(container) {
    const customItems = getCustomItems();
    const firstItem = customItems[0];

    container.innerHTML = `
        <div class="devGenWrapper">
            <!-- COLUMNA IZQUIERDA: PROMPT, EDITOR Y ACCIONES -->
            <div class="devGenLeft styledScrollbar">
                
                <!-- SECCIÓN 1: PROMPT GENERADOR -->
                <div class="devSectionTitle">1. Generación por Prompt / IA</div>
                <div class="devPromptWrap">
                    <textarea id="devGenPromptInput" class="devPromptTextarea" placeholder="Describe el objeto que deseas crear... Ej: Espada de energía futurista azul resplandeciente, Martillo de guerra dorado, Antorcha mística de fuego, Mochila táctica con antena..."></textarea>
                    
                    <!-- CHIPS DE INSPIRACIÓN RÁPIDA -->
                    <div class="devPromptChips">
                        <button class="devChipBtn" data-prompt="Espada de plasma cian resplandeciente con guarda dorada" data-socket="rightHand">⚔️ Espada Plasma</button>
                        <button class="devChipBtn" data-prompt="Escudo rúnico defensivo esmeralda con borde de oro" data-socket="leftHand">🛡️ Escudo Rúnico</button>
                        <button class="devChipBtn" data-prompt="Antorcha mágica con brasero dorado y llama luminiscente" data-socket="rightHand">🏮 Antorcha Mística</button>
                        <button class="devChipBtn" data-prompt="Cetro arcano con orbe de cristal violeta brillante" data-socket="rightHand">🔮 Cetro Arcano</button>
                        <button class="devChipBtn" data-prompt="Radio comunicador táctico con diales y antena" data-socket="back">📻 Radio Táctico</button>
                        <button class="devChipBtn" data-prompt="Mochila de supervivencia de lona con correas doradas" data-socket="back">🎒 Mochila</button>
                        <button class="devChipBtn" data-prompt="Frasco de alquimia con poción brillante y corcho" data-socket="rightHand">🧪 Poción Alquímica</button>
                        <button class="devChipBtn" data-prompt="Corona real dorada con gemas resplandecientes" data-socket="head">👑 Corona Real</button>
                        <button class="devChipBtn" data-prompt="Hacha de combate pesada con doble filo metálico" data-socket="rightHand">🪓 Hacha Combate</button>
                    </div>

                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <button id="devGenSubmitBtn" class="devActionBtn" style="flex:1;padding:8px 12px;display:flex;align-items:center;justify-content:center;gap:6px;">
                            <span>✨ Generar Modelo con Three.js</span>
                        </button>
                        <button id="devGenClearBtn" class="devSecondaryBtn" style="padding:8px 12px;" title="Limpiar prompt">
                            🧹 Limpiar
                        </button>
                    </div>
                </div>

                <!-- SECCIÓN 2: METADATOS DEL OBJETO -->
                <div class="devSectionTitle" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
                    <span>2. Propiedades del Objeto</span>
                    <span id="devCurrentModeBadge" class="devModeBadge" style="font-size:0.68rem;padding:2px 8px;"></span>
                </div>
                <div class="devPropGrid">
                    <div class="devPropField">
                        <label>Nombre:</label>
                        <input type="text" id="devItemNameInput" class="devTextInput" value="${escapeHtml(firstItem ? firstItem.name : 'Espada de Energía')}" placeholder="Nombre del objeto" />
                    </div>
                    <div class="devPropField" style="max-width:90px;">
                        <label>Icono:</label>
                        <input type="text" id="devItemIconInput" class="devTextInput" value="${escapeHtml(firstItem ? firstItem.icon : '⚔️')}" maxlength="4" style="text-align:center;font-size:1.1rem;" />
                    </div>
                    <div class="devPropField">
                        <label>Socket Sugerido:</label>
                        <select id="devItemSocketSelect" class="devSelectInput">
                            <option value="rightHand" ${firstItem && firstItem.socket === 'rightHand' ? 'selected' : ''}>✋ Mano Derecha</option>
                            <option value="leftHand" ${firstItem && firstItem.socket === 'leftHand' ? 'selected' : ''}>🤚 Mano Izquierda</option>
                            <option value="back" ${firstItem && firstItem.socket === 'back' ? 'selected' : ''}>🎒 Espalda</option>
                            <option value="head" ${firstItem && firstItem.socket === 'head' ? 'selected' : ''}>👑 Cabeza</option>
                        </select>
                    </div>
                </div>

                <!-- SECCIÓN 3: EDITOR DE CÓDIGO THREE.JS -->
                <div class="devSectionTitle" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
                    <span>3. Código Three.js Procedural (En Vivo)</span>
                    <button id="devCompileCodeBtn" class="devSmallBtn" title="Compilar y actualizar previsualización 3D">
                        ⚡ Compilar Vista
                    </button>
                </div>

                <div class="devCodeEditorWrap">
                    <textarea id="devCodeEditor" class="devCodeTextarea styledScrollbar" spellcheck="false"></textarea>
                </div>

                <!-- MÉTRICAS Y RESULTADO DE COMPILACIÓN -->
                <div id="devCompileStatus" class="devCompileStatus">
                    <span id="devStatusIcon">✅</span>
                    <span id="devStatusMsg">Listo para compilar.</span>
                    <span id="devObjectMetrics" class="devMetricsBadge">0 mallas | 0.00 × 0.00m</span>
                </div>

                <!-- SECCIÓN 4: ACCIONES DE GUARDADO Y PRUEBA -->
                <div class="devSaveActionsBar">
                    <button id="devSaveToLibraryBtn" class="devSaveBtn">
                        💾 Guardar en Biblioteca
                    </button>
                    <button id="devSaveAsNewBtn" class="devSecondaryBtn" style="padding:8px 12px;font-size:0.78rem;" title="Crea un nuevo objeto independiente con los datos actuales">
                        📋 Guardar como Nuevo
                    </button>
                    <button id="devTestInEquipBtn" class="devActionBtn" style="background:#15803d;">
                        🎒 Probar en Acople Player
                    </button>
                </div>

            </div>

            <!-- COLUMNA DERECHA: VIEWPORT 3D Y GESTIÓN DE BIBLIOTECA -->
            <div class="devGenRight">
                
                <!-- 1. VIEWPORT 3D -->
                <div class="devGenViewportWrap">
                    <div class="devViewportTopBar">
                        <div class="devTopLeftTools">
                            <span class="devViewportBadge">🎨 Visor 3D Studio</span>
                            <button id="devToggleAutoRotateBtn" class="devCamBtn" title="Activar/desactivar auto-rotación">🔄 Giro: OFF</button>
                            <button id="devToggleWireframeBtn" class="devCamBtn" title="Modo alambre / Wireframe">🕸️ Malla</button>
                        </div>
                        <div class="devTopRightTools">
                            <button id="devGenCamCenterBtn" class="devCamBtn" title="Centrar cámara">👁️ Centrar</button>
                            <button id="devGenZoomInBtn" class="devQuickZoomBtn" title="Acercar">+</button>
                            <button id="devGenZoomOutBtn" class="devQuickZoomBtn" title="Alejar">−</button>
                        </div>
                    </div>

                    <div id="devGenCanvasContainer" class="devGenCanvasContainer">
                        <canvas id="devGen3DCanvas"></canvas>
                        <div class="devViewportHint">🖱️ Arrastra para rotar 360° | Rueda para zoom</div>
                        <div id="devGenLoadingEl" class="devViewportLoading" style="display:none;">Generando modelo...</div>
                    </div>
                </div>

                <!-- 2. BANDEJA DE BIBLIOTECA GUARDADA -->
                <div class="devLibrarySection styledScrollbar">
                    <div class="devLibraryHeader">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div class="devSectionTitle" style="margin:0;">📚 Biblioteca de Modelos Guardados</div>
                            <button id="devNewItemBtn" class="devActionBtn" style="padding:4px 10px;font-size:0.75rem;background:#10b981;color:#0e1410;font-weight:700;" title="Crear un nuevo objeto limpio desde cero">
                                ➕ Nuevo Objeto
                            </button>
                        </div>
                        <div class="devLibraryTools">
                            <button id="devExportJsonBtn" class="devSmallBtn" title="Exportar objetos en formato JSON">💾 Exportar</button>
                            <label class="devSmallBtn" style="cursor:pointer;" title="Importar objetos JSON">
                                📂 Importar
                                <input type="file" id="devImportJsonInput" accept=".json" style="display:none;" />
                            </label>
                            <button id="devResetLibBtn" class="devSmallBtn" style="color:#f87171;" title="Restaurar presets iniciales">🔄 Reset</button>
                        </div>
                    </div>

                    <div id="devLibraryCardsGrid" class="devLibraryGrid">
                        <!-- Se puebla dinámicamente -->
                    </div>
                </div>

            </div>
        </div>
    `;

    // Inicializar el visor 3D
    initGenerator3DViewport();

    // Cargar el primer modelo en el editor y visor
    if (firstItem) {
        loadItemIntoEditor(firstItem);
    } else {
        compileAndPreviewCode(`
            const group = new THREE.Group();
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.2, 0.2),
                new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 })
            );
            group.add(mesh);
            return group;
        `);
    }

    // Renderizar las tarjetas de la biblioteca
    renderLibraryCards();

    // Configurar escuchas de eventos
    setupGeneratorEvents();
}

/**
 * Inicializa la escena 3D, cámara perspectiva, luces y OrbitControls.
 */
function initGenerator3DViewport() {
    const canvas = document.getElementById('devGen3DCanvas');
    const container = document.getElementById('devGenCanvasContainer');
    if (!canvas || !container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 360;

    // 1. Escena
    genScene = new THREE.Scene();
    genScene.background = new THREE.Color(0x0e1410);

    // 2. Cámara
    genCamera = new THREE.PerspectiveCamera(45, width / height, 0.05, 50);
    genCamera.position.set(0, 0.45, 1.35);

    // 3. Renderer con sombras
    genRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    genRenderer.setSize(width, height);
    genRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    genRenderer.shadowMap.enabled = true;
    genRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. OrbitControls
    genControls = new OrbitControls(genCamera, canvas);
    genControls.enableDamping = true;
    genControls.dampingFactor = 0.06;
    genControls.target.set(0, 0.15, 0);
    genControls.minDistance = 0.25;
    genControls.maxDistance = 6.0;

    // 5. Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    genScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(2, 4, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    genScene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x52b788, 0.5);
    backLight.position.set(-2, 2, -2);
    genScene.add(backLight);

    // 6. Cuadrícula de suelo de referencia estética
    genGridHelper = new THREE.GridHelper(1.8, 18, 0xd4af37, 0x1b4332);
    genGridHelper.position.y = -0.15;
    genScene.add(genGridHelper);

    // Anillo exterior decorativo
    const ringGeo = new THREE.RingGeometry(0.85, 0.88, 36);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.149;
    genScene.add(ring);

    // 7. ResizeObserver
    if (genResizeObserver) genResizeObserver.disconnect();
    genResizeObserver = new ResizeObserver(() => {
        if (!container || !genRenderer || !genCamera) return;
        const newW = container.clientWidth || 500;
        const newH = container.clientHeight || 360;
        genCamera.aspect = newW / newH;
        genCamera.updateProjectionMatrix();
        genRenderer.setSize(newW, newH);
    });
    genResizeObserver.observe(container);

    // 8. Bucle de animación
    function animate() {
        genAnimationId = requestAnimationFrame(animate);

        if (genAutoRotate && genCurrentObject) {
            genCurrentObject.rotation.y += 0.015;
        }

        if (genControls) genControls.update();
        if (genRenderer && genScene && genCamera) {
            genRenderer.render(genScene, genCamera);
        }
    }
    animate();
}

/**
 * Carga un ítem de la biblioteca en el editor de código y en las propiedades.
 */
function loadItemIntoEditor(item) {
    if (!item) return;
    genCurrentId = item.id;
    genCurrentCode = item.code || '';

    const nameInput = document.getElementById('devItemNameInput');
    const iconInput = document.getElementById('devItemIconInput');
    const socketSelect = document.getElementById('devItemSocketSelect');
    const codeEditor = document.getElementById('devCodeEditor');

    if (nameInput) nameInput.value = item.name || '';
    if (iconInput) iconInput.value = item.icon || '📦';
    if (socketSelect && item.socket) socketSelect.value = item.socket;
    if (codeEditor) codeEditor.value = item.code || '';

    compileAndPreviewCode(item.code);
    updateEditorStatusBadge();
}

/**
 * Actualiza el badge indicador de modo (Editando vs Nuevo) y el texto del botón de guardado.
 */
function updateEditorStatusBadge() {
    const badge = document.getElementById('devCurrentModeBadge');
    const saveBtn = document.getElementById('devSaveToLibraryBtn');
    const saveAsNewBtn = document.getElementById('devSaveAsNewBtn');
    const nameInput = document.getElementById('devItemNameInput');

    if (genCurrentId) {
        const customItems = getCustomItems();
        const current = customItems.find(i => i.id === genCurrentId);
        const name = current ? current.name : (nameInput?.value || 'Objeto');
        if (badge) {
            badge.textContent = `Editando: ${name}`;
            badge.style.background = 'rgba(16, 185, 129, 0.2)';
            badge.style.borderColor = 'rgba(16, 185, 129, 0.5)';
            badge.style.color = '#34d399';
        }
        if (saveBtn) saveBtn.textContent = '💾 Actualizar Objeto';
        if (saveAsNewBtn) saveAsNewBtn.style.display = 'inline-flex';
    } else {
        if (badge) {
            badge.textContent = '✨ Nuevo Objeto (Sin guardar)';
            badge.style.background = 'rgba(212, 175, 55, 0.2)';
            badge.style.borderColor = 'rgba(212, 175, 55, 0.5)';
            badge.style.color = '#ffd54f';
        }
        if (saveBtn) saveBtn.textContent = '💾 Guardar en Biblioteca';
        if (saveAsNewBtn) saveAsNewBtn.style.display = 'none';
    }
}

/**
 * Limpia el editor para crear un nuevo modelo desde cero sin sobreescribir el anterior.
 */
function startNewItemClean() {
    genCurrentId = null;
    genCurrentCode = `// Nuevo Objeto Three.js
const group = new THREE.Group();
group.name = "NuevoObjeto";

// Geometría base inicial de trabajo
const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.6, roughness: 0.3 })
);
group.add(mesh);

return group;`;

    const nameInput = document.getElementById('devItemNameInput');
    const iconInput = document.getElementById('devItemIconInput');
    const socketSelect = document.getElementById('devItemSocketSelect');
    const codeEditor = document.getElementById('devCodeEditor');
    const promptInput = document.getElementById('devGenPromptInput');

    if (nameInput) nameInput.value = 'Nuevo Objeto';
    if (iconInput) iconInput.value = '✨';
    if (socketSelect) socketSelect.value = 'rightHand';
    if (codeEditor) codeEditor.value = genCurrentCode;
    if (promptInput) promptInput.value = '';

    compileAndPreviewCode(genCurrentCode);
    renderLibraryCards();
    updateEditorStatusBadge();
    showDevToast('✨ Editor listo para crear un nuevo objeto.');
}

/**
 * Compila y monta el objeto 3D en la escena del visor studio.
 */
function compileAndPreviewCode(code) {
    genCurrentCode = code;
    const statusIcon = document.getElementById('devStatusIcon');
    const statusMsg = document.getElementById('devStatusMsg');
    const metricsBadge = document.getElementById('devObjectMetrics');

    const result = buildThreeMeshFromCode(code);

    if (!result.success) {
        if (statusIcon) statusIcon.textContent = '❌';
        if (statusMsg) {
            statusMsg.textContent = result.error || 'Error de compilación.';
            statusMsg.style.color = '#f87171';
        }
        return false;
    }

    // Éxito: Retirar objeto previo y montar nuevo
    if (genCurrentObject && genScene) {
        genScene.remove(genCurrentObject);
    }

    genCurrentObject = result.object;

    // Aplicar wireframe si está activo
    if (genWireframe) {
        applyWireframeMode(genCurrentObject, true);
    }

    // Centrar en el origen relativo
    const box = new THREE.Box3().setFromObject(genCurrentObject);
    const center = new THREE.Vector3();
    box.getCenter(center);
    genCurrentObject.position.sub(center);

    genScene.add(genCurrentObject);

    // Actualizar métricas visuales
    if (statusIcon) statusIcon.textContent = '✅';
    if (statusMsg) {
        statusMsg.textContent = 'Three.js compilado con éxito.';
        statusMsg.style.color = '#34d399';
    }

    if (metricsBadge && result.stats) {
        const s = result.stats.size;
        metricsBadge.textContent = `${result.stats.meshes} malla(s) | ${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)}m`;
    }

    return true;
}

/**
 * Aplica o retira modo wireframe en todos los materiales del objeto.
 */
function applyWireframeMode(root, enabled) {
    if (!root) return;
    root.traverse((node) => {
        if (node.isMesh && node.material) {
            if (Array.isArray(node.material)) {
                node.material.forEach(m => m.wireframe = enabled);
            } else {
                node.material.wireframe = enabled;
            }
        }
    });
}

/**
 * Renderiza la cuadrícula de tarjetas de la biblioteca guardada.
 * Ahora TODA la tarjeta es clicable, y cuenta con botón de renombrado rápido ✏️.
 */
function renderLibraryCards() {
    const grid = document.getElementById('devLibraryCardsGrid');
    if (!grid) return;

    const items = getCustomItems();
    if (items.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding:24px; color:rgba(255,255,255,0.4); font-size:0.85rem;">
                No hay modelos guardados. ¡Genera uno nuevo arriba y haz clic en "Guardar en Biblioteca"!
            </div>
        `;
        return;
    }

    const socketLabels = {
        rightHand: '✋ Mano Derecha',
        leftHand: '🤚 Mano Izquierda',
        back: '🎒 Espalda',
        head: '👑 Cabeza'
    };

    grid.innerHTML = items.map((item) => {
        const isCurrent = genCurrentId === item.id;
        const socketText = socketLabels[item.socket] || item.socket;
        return `
            <div class="devLibCard ${isCurrent ? 'activeCard' : ''}" data-id="${item.id}" title="Haz clic para cargar este objeto en el editor y visor 3D">
                <div class="devLibCardTop">
                    <span class="devLibIcon">${escapeHtml(item.icon || '📦')}</span>
                    <div class="devLibMeta">
                        <div class="devLibNameRow">
                            <span class="devLibName" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                            <button class="devRenameBtn renameCardBtn" data-id="${item.id}" title="Cambiar nombre de este objeto">✏️</button>
                        </div>
                        <div class="devLibSocket">${socketText}</div>
                    </div>
                </div>
                <div class="devLibActions">
                    <button class="devSmallBtn loadCardBtn" data-id="${item.id}" title="Cargar este modelo en el editor y visor 3D">
                        📝 Editar
                    </button>
                    <button class="devSmallBtn testCardBtn" data-id="${item.id}" style="color:#34d399;" title="Probar acople en el Player en 3D">
                        🎒 Acoplar
                    </button>
                    <button class="devSmallBtn delCardBtn" data-id="${item.id}" style="color:#f87171;" title="Eliminar de la biblioteca">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // 1. Clic en CUALQUIER PARTE de la tarjeta para cargar el objeto
    grid.querySelectorAll('.devLibCard').forEach(card => {
        card.onclick = (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            const id = card.getAttribute('data-id');
            const target = items.find(i => i.id === id);
            if (target) {
                loadItemIntoEditor(target);
                renderLibraryCards();
                showDevToast(`Cargado: "${target.name}"`);
            }
        };
    });

    // 2. Renombrado rápido con icono de lápiz ✏️
    grid.querySelectorAll('.renameCardBtn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const target = items.find(i => i.id === id);
            if (!target) return;

            showDevModalDialog({
                title: '✏️ Cambiar Nombre del Objeto 3D',
                message: `Introduce el nuevo nombre para este modelo:`,
                input: { value: target.name, placeholder: 'Nombre del objeto 3D...' },
                confirmText: '💾 Guardar Nombre',
                cancelText: 'Cancelar',
                onConfirm: (newName) => {
                    if (newName && newName.trim() && newName.trim() !== target.name) {
                        const cleanName = newName.trim();
                        updateCustomItemName(id, cleanName);
                        if (genCurrentId === id) {
                            const nameInput = document.getElementById('devItemNameInput');
                            if (nameInput) nameInput.value = cleanName;
                            updateEditorStatusBadge();
                        }
                        renderLibraryCards();
                        showDevToast(`Nombre actualizado a: "${cleanName}"`);
                    }
                }
            });
        };
    });

    // 3. Botón explícito Editar
    grid.querySelectorAll('.loadCardBtn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const target = items.find(i => i.id === id);
            if (target) {
                loadItemIntoEditor(target);
                renderLibraryCards();
                showDevToast(`Cargado en editor: "${target.name}"`);
            }
        };
    });

    // 4. Botón Acoplar al Player
    grid.querySelectorAll('.testCardBtn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const target = items.find(i => i.id === id);
            if (target) {
                switchToEquipmentTabWithItem(target);
            }
        };
    });

    // 5. Botón Eliminar con confirmación visual garantizada
    grid.querySelectorAll('.delCardBtn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const target = items.find(i => i.id === id);
            const name = target ? target.name : 'este objeto';

            showDevModalDialog({
                title: '🗑️ Eliminar Objeto 3D',
                message: `¿Estás seguro de que deseas eliminar permanentemente <strong>"${escapeHtml(name)}"</strong> de tu biblioteca?<br><br><span style="font-size:0.8rem;color:#fca5a5;">Esta acción eliminará el modelo de la biblioteca y de los archivos del servidor.</span>`,
                confirmText: '🔴 Sí, Eliminar',
                cancelText: 'Cancelar',
                isDanger: true,
                onConfirm: () => {
                    deleteCustomItem(id);
                    if (genCurrentId === id) {
                        startNewItemClean();
                    } else {
                        renderLibraryCards();
                    }
                    showDevToast(`Objeto "${name}" eliminado de la biblioteca.`);
                }
            });
        };
    });
}

/**
 * Guarda o actualiza el modelo actual en la biblioteca persistente.
 */
function handleSaveCurrentItem() {
    const nameInput = document.getElementById('devItemNameInput');
    const iconInput = document.getElementById('devItemIconInput');
    const socketSelect = document.getElementById('devItemSocketSelect');
    const codeEditor = document.getElementById('devCodeEditor');

    const name = (nameInput?.value || '').trim() || 'Modelo Three.js';
    const icon = (iconInput?.value || '').trim() || '📦';
    const socket = socketSelect?.value || 'rightHand';
    const code = codeEditor?.value || genCurrentCode;

    // Verificar que compile bien antes de guardar
    const compileResult = buildThreeMeshFromCode(code);
    if (!compileResult.success) {
        alert(`No se puede guardar: el código contiene errores de Three.js.\n\n${compileResult.error}`);
        return null;
    }

    const saved = saveCustomItem({
        id: genCurrentId || `item_${Date.now()}`,
        name,
        icon,
        socket,
        code,
        scale: 1.0
    });

    genCurrentId = saved.id;
    renderLibraryCards();
    updateEditorStatusBadge();
    showDevToast(`¡"${saved.name}" guardado con éxito en la biblioteca!`);
    return saved;
}

/**
 * Guarda como un nuevo objeto independiente (Copia / Duplicado).
 */
function handleSaveAsNewItem() {
    const nameInput = document.getElementById('devItemNameInput');
    const iconInput = document.getElementById('devItemIconInput');
    const socketSelect = document.getElementById('devItemSocketSelect');
    const codeEditor = document.getElementById('devCodeEditor');

    let name = (nameInput?.value || '').trim() || 'Modelo Three.js (Copia)';
    const icon = (iconInput?.value || '').trim() || '📦';
    const socket = socketSelect?.value || 'rightHand';
    const code = codeEditor?.value || genCurrentCode;

    const compileResult = buildThreeMeshFromCode(code);
    if (!compileResult.success) {
        alert(`No se puede guardar: el código contiene errores de Three.js.\n\n${compileResult.error}`);
        return null;
    }

    const saved = saveCustomItem({
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name,
        icon,
        socket,
        code,
        scale: 1.0
    });

    genCurrentId = saved.id;
    renderLibraryCards();
    updateEditorStatusBadge();
    showDevToast(`¡Copia guardada como nuevo objeto: "${saved.name}"!`);
    return saved;
}

/**
 * Salta a la pestaña de acople del player y equipa inmediatamente este ítem.
 */
function switchToEquipmentTabWithItem(item) {
    // 1. Guardar primero para asegurar persistencia
    const saved = item || handleSaveCurrentItem();
    if (!saved) return;

    // 2. Guardar selección en sesión para que Acople 3D la tome
    sessionStorage.setItem('monteserin_pending_equip_item_id', saved.id);

    // 3. Activar la pestaña de Acople 3D al Player
    const equipTabBtn = document.querySelector('.devTabBtn[data-tab="equipment"]');
    if (equipTabBtn) {
        equipTabBtn.click();
        showDevToast(`Acoplando "${saved.name}" al modelo del Player...`);
    }
}

/**
 * Configura los eventos del generador, inputs, botones y herramientas de cámara.
 */
function setupGeneratorEvents() {
    // 1. Botón de Generar con Prompt / IA
    const submitBtn = document.getElementById('devGenSubmitBtn');
    const promptInput = document.getElementById('devGenPromptInput');
    const loadingEl = document.getElementById('devGenLoadingEl');
    const socketSelect = document.getElementById('devItemSocketSelect');

    if (submitBtn && promptInput) {
        submitBtn.onclick = async () => {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                alert('Por favor escribe un prompt descriptivo para generar el modelo 3D.');
                promptInput.focus();
                return;
            }

            if (loadingEl) loadingEl.style.display = 'flex';
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Generando con Three.js...';

            try {
                const generated = await generateThreeModelFromPrompt(prompt, socketSelect?.value || 'rightHand');

                // Llenar metadatos
                const nameInput = document.getElementById('devItemNameInput');
                const iconInput = document.getElementById('devItemIconInput');
                const codeEditor = document.getElementById('devCodeEditor');

                if (nameInput) nameInput.value = generated.name;
                if (iconInput) iconInput.value = generated.icon;
                if (socketSelect && generated.socket) socketSelect.value = generated.socket;
                if (codeEditor) codeEditor.value = generated.code;

                genCurrentId = null; // Es uno nuevo no guardado aún
                compileAndPreviewCode(generated.code);
                renderLibraryCards();
                updateEditorStatusBadge();
                showDevToast(`✨ ¡Modelo "${generated.name}" generado exitosamente!`);
            } catch (err) {
                console.error('[ModelGenerator] Error generando modelo:', err);
                alert(`Error al generar modelo: ${err.message || err}`);
            } finally {
                if (loadingEl) loadingEl.style.display = 'none';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>✨ Generar Modelo con Three.js</span>';
            }
        };
    }

    // 2. Chips de sugerencias
    document.querySelectorAll('.devChipBtn').forEach(btn => {
        btn.onclick = () => {
            const prompt = btn.getAttribute('data-prompt');
            const sock = btn.getAttribute('data-socket');
            if (promptInput && prompt) promptInput.value = prompt;
            if (socketSelect && sock) socketSelect.value = sock;
            if (submitBtn) submitBtn.click();
        };
    });

    // 3. Limpiar prompt
    const clearBtn = document.getElementById('devGenClearBtn');
    if (clearBtn && promptInput) {
        clearBtn.onclick = () => {
            promptInput.value = '';
            promptInput.focus();
        };
    }

    // 4. Compilar código Three.js manualmente
    const compileBtn = document.getElementById('devCompileCodeBtn');
    const codeEditor = document.getElementById('devCodeEditor');
    if (compileBtn && codeEditor) {
        compileBtn.onclick = () => {
            compileAndPreviewCode(codeEditor.value);
            showDevToast('Vista 3D actualizada.');
        };

        // Atajo Ctrl+Enter dentro del textarea para compilar
        codeEditor.onkeydown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                compileBtn.click();
            }
        };
    }

    // 5. Botón Nuevo Objeto (Limpio)
    const newItemBtn = document.getElementById('devNewItemBtn');
    if (newItemBtn) {
        newItemBtn.onclick = () => {
            startNewItemClean();
        };
    }

    // 6. Guardar en biblioteca (Actualizar o Crear según genCurrentId)
    const saveBtn = document.getElementById('devSaveToLibraryBtn');
    if (saveBtn) {
        saveBtn.onclick = () => {
            handleSaveCurrentItem();
        };
    }

    // 7. Guardar como Nuevo / Duplicar
    const saveAsNewBtn = document.getElementById('devSaveAsNewBtn');
    if (saveAsNewBtn) {
        saveAsNewBtn.onclick = () => {
            handleSaveAsNewItem();
        };
    }

    // 8. Probar en acople
    const testBtn = document.getElementById('devTestInEquipBtn');
    if (testBtn) {
        testBtn.onclick = () => {
            switchToEquipmentTabWithItem();
        };
    }

    // Actualizar badge inicial
    updateEditorStatusBadge();

    // 7. Herramientas de visualización (Auto-rotate, Wireframe, Centrar, Zoom)
    const rotateBtn = document.getElementById('devToggleAutoRotateBtn');
    if (rotateBtn) {
        rotateBtn.onclick = () => {
            genAutoRotate = !genAutoRotate;
            rotateBtn.textContent = genAutoRotate ? '🔄 Giro: ON' : '🔄 Giro: OFF';
            rotateBtn.classList.toggle('activeCam', genAutoRotate);
        };
    }

    const wireframeBtn = document.getElementById('devToggleWireframeBtn');
    if (wireframeBtn) {
        wireframeBtn.onclick = () => {
            genWireframe = !genWireframe;
            wireframeBtn.classList.toggle('activeCam', genWireframe);
            if (genCurrentObject) {
                applyWireframeMode(genCurrentObject, genWireframe);
            }
        };
    }

    const centerBtn = document.getElementById('devGenCamCenterBtn');
    if (centerBtn) {
        centerBtn.onclick = () => {
            if (genCamera && genControls) {
                genControls.target.set(0, 0.15, 0);
                genCamera.position.set(0, 0.45, 1.35);
                genControls.update();
            }
        };
    }

    const zoomInBtn = document.getElementById('devGenZoomInBtn');
    if (zoomInBtn) {
        zoomInBtn.onclick = () => {
            if (genCamera && genControls) {
                const dir = new THREE.Vector3().subVectors(genControls.target, genCamera.position).normalize();
                genCamera.position.addScaledVector(dir, 0.25);
                genControls.update();
            }
        };
    }

    const zoomOutBtn = document.getElementById('devGenZoomOutBtn');
    if (zoomOutBtn) {
        zoomOutBtn.onclick = () => {
            if (genCamera && genControls) {
                const dir = new THREE.Vector3().subVectors(genCamera.position, genControls.target).normalize();
                genCamera.position.addScaledVector(dir, 0.25);
                genControls.update();
            }
        };
    }

    // 8. Utilidades de biblioteca (Exportar / Importar / Reset)
    const exportBtn = document.getElementById('devExportJsonBtn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            const jsonStr = exportItemsJSON();
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `monteserin_custom_3d_items_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showDevToast('Biblioteca exportada como archivo JSON.');
        };
    }

    const importInput = document.getElementById('devImportJsonInput');
    if (importInput) {
        importInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const res = importItemsJSON(evt.target.result);
                if (res.success) {
                    renderLibraryCards();
                    showDevToast(`¡${res.count} objetos importados exitosamente!`);
                } else {
                    showDevToast(`⚠️ Error importando: ${res.error || 'Archivo inválido'}`);
                }
            };
            reader.readAsText(file);
        };
    }

    const resetLibBtn = document.getElementById('devResetLibBtn');
    if (resetLibBtn) {
        resetLibBtn.onclick = () => {
            showDevModalDialog({
                title: '🔄 Restablecer Biblioteca de Fábrica',
                message: '¿Estás seguro de que deseas restaurar las plantillas predeterminadas de fábrica?<br><br><span style="font-size:0.8rem;color:#fca5a5;">Los modelos se restablecerán a la configuración original de fábrica.</span>',
                confirmText: '🔄 Sí, Restablecer',
                cancelText: 'Cancelar',
                isDanger: true,
                onConfirm: () => {
                    resetCustomLibrary();
                    renderLibraryCards();
                    showDevToast('Biblioteca restablecida a fábrica.');
                }
            });
        };
    }
}

/**
 * Limpieza de recursos y bucle de render cuando se cierra o cambia de pestaña.
 */
export function cleanupModelGeneratorDebugger() {
    if (genAnimationId) {
        cancelAnimationFrame(genAnimationId);
        genAnimationId = null;
    }
    if (genResizeObserver) {
        genResizeObserver.disconnect();
        genResizeObserver = null;
    }
    if (genControls) {
        genControls.dispose();
        genControls = null;
    }
    if (genRenderer) {
        genRenderer.dispose();
        genRenderer = null;
    }
    genScene = null;
    genCamera = null;
    genCurrentObject = null;
}

function showDevToast(msg) {
    const toast = document.getElementById('devToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'devToast show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.className = 'devToast';
    }, 2800);
}
