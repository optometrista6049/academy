/* ======================================================
   MONTESERIN ACADEMY - WORLD EDITOR TAB (DEV SUITE)
   Pestaña integrada en el DevPanel para la gestión del
   Modo Dios y del Escenario 3D:
   - Activación de Vuelo Libre y Edición en tiempo real
   - Resumen y gestión de objetos colocados en el mundo
   - Carga de modelos .GLB/.GLTF desde el ordenador local
   - Exportación e importación de mapas (JSON)
   ====================================================== */

import { enterGodMode } from './godModeController.js';
import {
    getSavedWorldObjects,
    removePlacedObjectFromWorld,
    clearAllPlacedWorldObjects,
    getUploadedModelsCatalog,
    uploadLocalModelToServer,
    registerUploadedModel,
    deleteUploadedModel,
    exportWorldObjectsJSON,
    importWorldObjectsJSON,
    getSceneVersions,
    saveSceneVersion,
    restoreSceneVersion,
    deleteSceneVersion
} from '../systems/worldObjectsManager.js';
import { runtimeState } from '../state/runtimeState.js';
import { showDevToast, closeDevPanel } from './devPanel.js';
import { showDevModalDialog } from './devModalDialog.js';

export function renderWorldEditorTab(container) {
    const placedObjects = getSavedWorldObjects();
    const uploadedModels = getUploadedModelsCatalog();
    const versions = getSceneVersions();
    const playerPos = runtimeState.player ? runtimeState.player.position : { x: 0, y: 0, z: 0 };

    container.innerHTML = `
        <div class="devWorldWrapper styledScrollbar">
            <!-- HERO LAUNCHER MODO DIOS -->
            <div class="devWorldHero">
                <div class="devWorldHeroInfo">
                    <div class="devWorldHeroTitle">
                        <span class="devWorldHeroIcon">🌍</span>
                        <div>
                            <h3>Modo Dios &bull; Vuelo Libre y Editor de Escenario</h3>
                            <p>Explora el mapa sin restricciones, vuela con flechas o WASD y planta elementos 3D ajustados al milímetro sobre el terreno.</p>
                        </div>
                    </div>
                </div>
                <button id="devEnterGodModeBtn" class="devEnterGodBtn">
                    🚀 Entrar en Modo Dios (En Vivo)
                </button>
            </div>

            <!-- METRICAS EN VIVO -->
            <div class="devWorldStats">
                <div class="devWorldStatCard">
                    <span class="devStatNum">${placedObjects.length}</span>
                    <span class="devStatLabel">Objetos en Escenario</span>
                </div>
                <div class="devWorldStatCard">
                    <span class="devStatNum">${versions.length}</span>
                    <span class="devStatLabel">Versiones Guardadas</span>
                </div>
                <div class="devWorldStatCard">
                    <span class="devStatNum">${uploadedModels.length}</span>
                    <span class="devStatLabel">Modelos .GLB Subidos</span>
                </div>
                <div class="devWorldStatCard">
                    <span class="devStatNum" style="color:#10b981;">getHeightAt</span>
                    <span class="devStatLabel">Auto-Snap al Terreno</span>
                </div>
            </div>

            <!-- SECCIÓN HISTORIAL DE VERSIONES / PUNTOS DE GUARDADO -->
            <div class="devWorldSection">
                <div class="devWorldSectionHeader">
                    <div>
                        <h4 class="devWorldSectionTitle">📚 Historial de Versiones del Escenario (${versions.length})</h4>
                        <p class="devWorldSectionDesc">Crea puntos de restauración con nombre y fecha para recuperar estados previos en cualquier momento.</p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="text" id="devNewVersionNameInput" class="devInputText" placeholder="Nombre de versión opcional..." style="width:210px;" />
                        <button id="devSaveNewVersionBtn" class="devWorldActionBtn primary" title="Crear un punto de guardado del estado actual del mapa">
                            💾 Guardar Versión Actual
                        </button>
                    </div>
                </div>

                <div class="devVersionsGrid" id="devVersionsGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:10px;margin-top:6px;">
                    ${renderVersionsListHTML(versions)}
                </div>
            </div>

            <!-- SECCIÓN SUBIR MODELOS 3D DESDE EL PC -->
            <div class="devWorldSection">
                <div class="devWorldSectionHeader">
                    <div>
                        <h4 class="devWorldSectionTitle">📁 Cargar Modelos 3D (.GLB / .GLTF) desde el Ordenador</h4>
                        <p class="devWorldSectionDesc">Sube tus propios archivos 3D para incorporarlos de inmediato al mundo del juego sin necesidad de tocar código.</p>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <input type="file" id="devTabGlbFileInput" accept=".glb,.gltf" style="display:none;" />
                        <button id="devTabUploadGlbBtn" class="devWorldActionBtn primary">
                            ⬆️ Seleccionar Archivo .GLB
                        </button>
                    </div>
                </div>

                <div class="devUploadedGrid" id="devUploadedGrid">
                    ${renderUploadedModelsListHTML(uploadedModels)}
                </div>
            </div>

            <!-- SECCIÓN OBJETOS COLOCADOS EN EL MUNDO -->
            <div class="devWorldSection">
                <div class="devWorldSectionHeader">
                    <div>
                        <h4 class="devWorldSectionTitle">🗺️ Objetos Colocados en el Escenario (${placedObjects.length})</h4>
                        <p class="devWorldSectionDesc">Elementos que actualmente existen en el mapa del juego. Persisten automáticamente entre sesiones.</p>
                    </div>
                    <div class="devWorldHeaderActions">
                        <button id="devExportSceneBtn" class="devWorldActionBtn" title="Descargar como JSON">
                            📥 Exportar JSON
                        </button>
                        <input type="file" id="devImportSceneInput" accept=".json" style="display:none;" />
                        <button id="devImportSceneBtn" class="devWorldActionBtn" title="Restaurar mapa desde JSON">
                            📤 Importar JSON
                        </button>
                        <button id="devClearAllSceneBtn" class="devWorldActionBtn danger" title="Eliminar todos los objetos del mapa">
                            🗑️ Vaciar Mapa
                        </button>
                    </div>
                </div>

                <div class="devPlacedTableWrap">
                    ${renderPlacedObjectsTableHTML(placedObjects)}
                </div>
            </div>

            <!-- GUÍA DE CONTROLES -->
            <div class="devWorldControlsGuide">
                <div class="devGuideTitle">🎮 Controles durante el Modo Dios en Vivo:</div>
                <div class="devGuideGrid">
                    <div class="devGuideItem"><kbd>⬆️ ⬇️ ⬅️ ➡️</kbd> o <kbd>W A S D</kbd><span>Vuelo libre y strafe</span></div>
                    <div class="devGuideItem"><kbd>Espacio</kbd> / <kbd>E</kbd><span>Ascender en vertical</span></div>
                    <div class="devGuideItem"><kbd>Q</kbd><span>Descender en vertical</span></div>
                    <div class="devGuideItem"><kbd>Shift</kbd><span>Turbo (Velocidad x2.5)</span></div>
                    <div class="devGuideItem"><kbd>Clic Der + Arrastrar</kbd><span>Girar y orientar cámara</span></div>
                    <div class="devGuideItem"><kbd>Clic Izq</kbd><span>Plantar objeto en cursor (si hay uno elegido)</span></div>
                    <div class="devGuideItem"><kbd>R</kbd> / <kbd>T</kbd><span>Rotar objeto +45° / -45°</span></div>
                    <div class="devGuideItem"><kbd>+</kbd> / <kbd>-</kbd><span>Aumentar o reducir escala</span></div>
                    <div class="devGuideItem"><kbd>Ctrl+Z</kbd><span>Deshacer último objeto</span></div>
                    <div class="devGuideItem"><kbd>H</kbd><span>Ocultar / Mostrar dock inferior</span></div>
                    <div class="devGuideItem"><kbd>Esc</kbd><span>Salir y regresar al Player</span></div>
                </div>
            </div>
        </div>
    `;

    setupWorldEditorEvents(container);
}

function renderVersionsListHTML(versions) {
    if (!versions || versions.length === 0) {
        return `
            <div class="devWorldEmptyBox">
                <span>📚 Aún no has guardado versiones de escenario. Pulsa "Guardar Versión Actual" para crear tu primer punto de restauración.</span>
            </div>
        `;
    }

    return versions.map(v => `
        <div class="devVersionCard" data-id="${v.id}" style="display:flex;align-items:center;justify-content:space-between;background:rgba(20,28,22,0.85);border:1px solid rgba(212,175,55,0.25);border-radius:8px;padding:10px;gap:12px;">
            <div style="display:flex;flex-direction:column;gap:3px;overflow:hidden;">
                <strong style="color:#ffd54f;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(v.name)}</strong>
                <span style="color:#94a3b8;font-size:0.72rem;">📅 ${v.dateStr || ''} &bull; 📦 ${v.count || 0} objetos</span>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="devMiniActionBtn devRestoreVersionBtn" data-id="${v.id}" title="Restaurar el mapa a este punto exacto">
                    🔄 Restaurar
                </button>
                <button class="devMiniActionBtn danger devDeleteVersionBtn" data-id="${v.id}" title="Eliminar esta versión">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

function renderUploadedModelsListHTML(models) {
    if (!models || models.length === 0) {
        return `
            <div class="devWorldEmptyBox">
                <span>📁 No hay modelos subidos desde el ordenador todavía. Pulsa "Seleccionar Archivo .GLB" arriba para cargar uno.</span>
            </div>
        `;
    }

    return models.map(m => `
        <div class="devUploadedCard" data-id="${m.id}">
            <div class="devUploadedIcon">🎨</div>
            <div class="devUploadedMeta">
                <span class="devUploadedName" title="${escapeHtml(m.filename)}">${escapeHtml(m.name || m.filename)}</span>
                <span class="devUploadedUrl">${escapeHtml(m.url || 'local')}</span>
            </div>
            <div class="devUploadedActions">
                <button class="devMiniActionBtn devPlantUploadedBtn" data-id="${m.id}" data-url="${m.url}" data-name="${escapeHtml(m.name || m.filename)}">
                    🌱 Colocar en Modo Dios
                </button>
                <button class="devMiniActionBtn danger devDeleteUploadedBtn" data-id="${m.id}" title="Eliminar del catálogo">
                    ✕
                </button>
            </div>
        </div>
    `).join('');
}

function renderPlacedObjectsTableHTML(objects) {
    if (!objects || objects.length === 0) {
        return `
            <div class="devWorldEmptyBox">
                <span>🌱 No hay ningún objeto colocado en el escenario actualmente. ¡Entra en Modo Dios para plantar tus primeros modelos!</span>
            </div>
        `;
    }

    return `
        <table class="devPlacedTable">
            <thead>
                <tr>
                    <th>Elemento</th>
                    <th>Tipo</th>
                    <th>Coordenadas (X, Y, Z)</th>
                    <th>Escala</th>
                    <th>Rotación</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${objects.map(obj => `
                    <tr data-id="${obj.id}">
                        <td class="devPlacedColName">
                            <span class="devPlacedIcon">${obj.icon || '📦'}</span>
                            <strong>${escapeHtml(obj.name)}</strong>
                        </td>
                        <td>
                            <span class="devSourceBadge ${obj.source}">${obj.source.toUpperCase()}</span>
                        </td>
                        <td class="devCoordsCol">
                            X: ${obj.position.x.toFixed(1)}, Y: ${obj.position.y.toFixed(1)}, Z: ${obj.position.z.toFixed(1)}
                        </td>
                        <td>${(obj.scale || 1.0).toFixed(1)}x</td>
                        <td>${Math.round(THREE_radToDeg(obj.rotationY || 0))}°</td>
                        <td class="devTableActions">
                            <button class="devTableBtn devTeleportToObjBtn" data-x="${obj.position.x}" data-y="${obj.position.y}" data-z="${obj.position.z}" title="Teletransportar al jugador a este objeto">
                                📍 Ir
                            </button>
                            <button class="devTableBtn danger devDeleteObjBtn" data-id="${obj.id}" title="Eliminar objeto del escenario">
                                🗑️
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function setupWorldEditorEvents(container) {
    // 1. Entrar en Modo Dios
    const enterGodBtn = container.querySelector('#devEnterGodModeBtn');
    if (enterGodBtn) {
        enterGodBtn.onclick = () => {
            enterGodMode();
        };
    }

    // 2. Subida de archivo .GLB desde el PC
    const fileInput = container.querySelector('#devTabGlbFileInput');
    const uploadBtn = container.querySelector('#devTabUploadGlbBtn');
    if (uploadBtn && fileInput) {
        uploadBtn.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            showDevToast(`⏳ Subiendo "${file.name}"...`);

            try {
                const serverRes = await uploadLocalModelToServer(file);
                const modelUrl = serverRes.url;

                registerUploadedModel({
                    id: `uploaded_${Date.now()}`,
                    filename: file.name,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    url: modelUrl,
                    uploadedAt: Date.now()
                });

                showDevToast(`✅ Modelo "${file.name}" registrado con éxito`);
                renderWorldEditorTab(container);
            } catch (err) {
                console.warn('[WorldEditorTab] Error al subir al servidor, usando fallback Blob:', err);
                const blobUrl = URL.createObjectURL(file);
                registerUploadedModel({
                    id: `blob_${Date.now()}`,
                    filename: file.name,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    url: blobUrl,
                    uploadedAt: Date.now()
                });
                showDevToast(`✅ Modelo "${file.name}" cargado localmente con éxito`);
                renderWorldEditorTab(container);
            }
        };
    }

    // 3. Acciones de modelos subidos (Colocar / Eliminar)
    container.querySelectorAll('.devPlantUploadedBtn').forEach(btn => {
        btn.onclick = () => {
            const url = btn.getAttribute('data-url');
            const name = btn.getAttribute('data-name');
            const id = btn.getAttribute('data-id');
            enterGodMode();
        };
    });

    container.querySelectorAll('.devDeleteUploadedBtn').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            deleteUploadedModel(id);
            showDevToast('Modelo eliminado del catálogo');
            renderWorldEditorTab(container);
        };
    });

    // 4. Teletransportar al objeto
    container.querySelectorAll('.devTeleportToObjBtn').forEach(btn => {
        btn.onclick = () => {
            const x = parseFloat(btn.getAttribute('data-x'));
            const y = parseFloat(btn.getAttribute('data-y'));
            const z = parseFloat(btn.getAttribute('data-z'));

            if (runtimeState.player) {
                runtimeState.player.position.set(x, y, z + 2.0);
                showDevToast(`📍 Player teletransportado junto al objeto (${x.toFixed(1)}, ${z.toFixed(1)})`);
            }
        };
    });

    // 5. Eliminar objeto individual
    container.querySelectorAll('.devDeleteObjBtn').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            removePlacedObjectFromWorld(id);
            showDevToast('🗑️ Objeto eliminado del escenario');
            renderWorldEditorTab(container);
        };
    });

    // 6. Vaciar todo el escenario con confirmación visual integrada
    const clearAllBtn = container.querySelector('#devClearAllSceneBtn');
    if (clearAllBtn) {
        clearAllBtn.onclick = () => {
            showDevModalDialog({
                title: '🧹 Vaciar Escenario Completo',
                message: '¿Estás seguro de que deseas eliminar <strong>TODOS</strong> los objetos colocados en el escenario?<br><br><span style="font-size:0.8rem;color:#fca5a5;">Esta acción eliminará todos los objetos colocados tanto del navegador como del archivo del servidor.</span>',
                confirmText: '🔴 Sí, Vaciar Todo',
                cancelText: 'Cancelar',
                isDanger: true,
                onConfirm: () => {
                    clearAllPlacedWorldObjects();
                    showDevToast('🧹 Todo el escenario ha sido vaciado');
                    renderWorldEditorTab(container);
                }
            });
        };
    }

    // 7. Exportar JSON
    const exportBtn = container.querySelector('#devExportSceneBtn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            const jsonStr = exportWorldObjectsJSON();
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `escenario_monteserin_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showDevToast('📥 Escenario exportado en archivo JSON');
        };
    }

    // 8. Importar JSON
    const importInput = container.querySelector('#devImportSceneInput');
    const importBtn = container.querySelector('#devImportSceneBtn');
    if (importBtn && importInput) {
        importBtn.onclick = () => importInput.click();
        importInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const res = await importWorldObjectsJSON(event.target.result);
                if (res.success) {
                    showDevToast(`✅ Escenario restaurado: ${res.count} objetos cargados`);
                    renderWorldEditorTab(container);
                } else {
                    showDevToast(`❌ Error al importar JSON: ${res.error}`);
                }
            };
            reader.readAsText(file);
        };
    }
}

function THREE_radToDeg(rad) {
    return (rad * 180) / Math.PI;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
