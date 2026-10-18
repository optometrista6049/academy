/* ======================================================
   MONTESERIN ACADEMY - DEVELOPER SUITE (DEV PANEL)
   Panel unificado de desarrollo y testeo:
   - Salto instantáneo de misiones
   - Calibrador de acople 3D al Player
   - Gestor de recursos por ranuras aisladas (Logo, Carnet, GLB)
   ====================================================== */

import { MISSION_PRESETS } from './missionDebugger.js';
import { renderEquipmentDebuggerTab, cleanupEquipmentDebugger } from './equipmentDebugger.js';
import { renderModelGeneratorTab, cleanupModelGeneratorDebugger } from './modelGeneratorDebugger.js';
import { renderAssetManagerTab } from './assetManagerDebug.js';
import { renderWorldEditorTab } from './worldEditorTab.js';

export const DEV_CONFIG = {
    enabled: true // Cambiar a false para distribución final a alumnos
};

let devModalRoot = null;
let currentTab = 'missions';
let toastTimer = null;

export function initDevSuite() {
    if (!DEV_CONFIG.enabled) return;

    // Escuchar tecla F9 o Ctrl+Shift+D para abrir/cerrar
    window.addEventListener('keydown', (e) => {
        if (e.key === 'F9' || (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd'))) {
            e.preventDefault();
            toggleDevPanel();
        }
    });

    // Añadir botón flotante de desarrollo discreto (en esquina inferior derecha o minimizable)
    createDevTriggerButton();
}

export function openDevPanel() {
    if (!devModalRoot) {
        buildDevModal();
    }
    devModalRoot.style.display = 'flex';
    switchTab(currentTab);
}

export function closeDevPanel() {
    if (!devModalRoot) return;
    cleanupEquipmentDebugger();
    cleanupModelGeneratorDebugger();
    devModalRoot.style.display = 'none';
}

export function toggleDevPanel() {
    if (devModalRoot && devModalRoot.style.display === 'flex') {
        closeDevPanel();
    } else {
        openDevPanel();
    }
}

function createDevTriggerButton() {
    if (document.getElementById('devSuiteTriggerBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'devSuiteTriggerBtn';
    btn.className = 'devSuiteTriggerBtn';
    btn.innerHTML = '⚙️ DevTools [F9]';
    btn.title = 'Abrir panel de desarrollo (F9)';

    btn.onclick = (e) => {
        e.stopPropagation();
        toggleDevPanel();
    };

    document.body.appendChild(btn);
}

function buildDevModal() {
    devModalRoot = document.createElement('div');
    devModalRoot.id = 'devSuiteOverlay';
    devModalRoot.className = 'devSuiteOverlay';

    // Aislar eventos para no interferir con el juego
    ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(evt => {
        devModalRoot.addEventListener(evt, (e) => {
            e.stopPropagation();
        });
    });

    devModalRoot.innerHTML = `
        <div class="devSuiteCard">
            <!-- CABECERA -->
            <div class="devSuiteHeader">
                <div class="devSuiteBrand">
                    <span class="devSuiteIcon">🛠️</span>
                    <div>
                        <div class="devSuiteTitle">Monteserín Academy — Developer Suite</div>
                        <div class="devSuiteSubtitle">Herramientas de depuración, salto de misiones, calibración y generación 3D</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <span class="devModeBadge">DEV MODE ACTIVO</span>
                    <button id="devSuiteCloseBtn" class="devCloseBtn" title="Cerrar panel (Esc / F9)">&times;</button>
                </div>
            </div>

            <!-- NAVEGACIÓN POR PESTAÑAS -->
            <div class="devSuiteTabs">
                <button class="devTabBtn active" data-tab="missions">🚩 Salto de Misiones</button>
                <button class="devTabBtn" data-tab="equipment">🎒 Acople 3D al Player</button>
                <button class="devTabBtn" data-tab="modelGenerator">✨ Generador 3D (Three.js)</button>
                <button class="devTabBtn" data-tab="worldEditor">🌐 Modo Dios &bull; Mundo</button>
                <button class="devTabBtn" data-tab="assets">📁 Gestor de Recursos (Slots)</button>
            </div>

            <!-- CONTENEDOR DE CONTENIDO -->
            <div id="devSuiteContent" class="devSuiteContent styledScrollbar"></div>

            <!-- TOAST FEEDBACK -->
            <div id="devToast" class="devToast"></div>
        </div>
    `;

    document.body.appendChild(devModalRoot);

    // Eventos
    const closeBtn = document.getElementById('devSuiteCloseBtn');
    if (closeBtn) closeBtn.onclick = closeDevPanel;

    devModalRoot.onclick = (e) => {
        if (e.target === devModalRoot) closeDevPanel();
    };

    const tabBtns = devModalRoot.querySelectorAll('.devTabBtn');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchTab(btn.getAttribute('data-tab'));
        };
    });
}

function switchTab(tabId) {
    cleanupEquipmentDebugger();
    cleanupModelGeneratorDebugger();
    currentTab = tabId;
    const content = document.getElementById('devSuiteContent');
    if (!content) return;

    content.innerHTML = '';

    if (tabId === 'missions') {
        renderMissionsTab(content);
    } else if (tabId === 'equipment') {
        renderEquipmentDebuggerTab(content);
    } else if (tabId === 'modelGenerator') {
        renderModelGeneratorTab(content);
    } else if (tabId === 'worldEditor') {
        renderWorldEditorTab(content);
    } else if (tabId === 'assets') {
        renderAssetManagerTab(content);
    }
}

function renderMissionsTab(container) {
    container.innerHTML = `
        <div class="devMissionsWrapper">
            <div class="devSectionIntro">
                <strong>Inyector de Estados de Misión:</strong> Selecciona un punto clave de la historia para saltar a él directamente. 
                El sistema inyectará los objetos correspondientes en el Inventario y Archivo, configurará los flags y moverá al jugador a la posición idónea.
            </div>

            <div class="devPresetList">
                ${MISSION_PRESETS.map((preset) => `
                    <div class="devPresetCard">
                        <div class="devPresetInfo">
                            <div class="devPresetName">${preset.name}</div>
                            <div class="devPresetDesc">${preset.description}</div>
                        </div>
                        <button class="devActionBtn applyPresetBtn" data-preset="${preset.id}">
                            ⚡ Aplicar Estado
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    const buttons = container.querySelectorAll('.applyPresetBtn');
    buttons.forEach(btn => {
        btn.onclick = () => {
            const presetId = btn.getAttribute('data-preset');
            const preset = MISSION_PRESETS.find(p => p.id === presetId);
            if (preset) {
                preset.apply();
                showDevToast(`✅ Estado aplicado: ${preset.name}`);
            }
        };
    });
}

export function showDevToast(message) {
    const toast = document.getElementById('devToast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 3200);
}
