/* ======================================================
   MONTESERIN ACADEMY - TAB DE CONTROL DE BATERÍA / TIEMPO (DEV PANEL)
   Permite al desarrollador:
   - Activar/Desactivar el sistema a voluntad (inactivo por defecto hasta Misión 2)
   - Monitorear el tiempo real consumido, células y descansos
   - Forzar y testear transiciones, avisos de energía del Robot Aspirante y pantallas de bloqueo de 3h
   - Simular horas de descanso y resetear instantáneamente
   ====================================================== */

import {
    sessionBattery,
    getRemainingSeconds,
    getRemainingCells,
    isCooldownActive,
    getCooldownRemainingMs,
    devSetSystemEnabled,
    devSetConsumedMinutes,
    devSimulateRestHours,
    devPreviewRestScreen,
    devResetToFull,
    triggerCooldownLock,
    showBatteryToast,
    updateHUDVisuals,
    BATTERY_CONFIG
} from '../systems/sessionBatterySystem.js';
import { showDevToast } from './devPanel.js';

let liveMonitorInterval = null;

export function renderSessionBatteryTab(container) {
    cleanupSessionBatteryTab();

    container.innerHTML = `
        <div class="devBatteryWrapper">
            <div class="devSectionIntro">
                <strong>Control de Batería de Sesión (Híbrido 3):</strong>
                Regula el bienestar digital del explorador (máximo 60 minutos de aventura continua divididos en 3 células de 20 min, seguidos de 3 horas de enfriamiento con recarga de 1 célula por cada hora de descanso).
                <br><em>El sistema permanece inactivo por defecto hasta la llegada de la Misión 2. Puedes activarlo aquí para pruebas.</em>
            </div>

            <!-- TARJETA DE ESTADO Y TOGGLE -->
            <div class="devBatteryStatusCard">
                <div class="devBatteryStatusRow">
                    <div>
                        <div class="devBatteryStatusLabel">Estado del Sistema:</div>
                        <div id="devBatteryStatusText" class="devBatteryStatusValue">
                            ${sessionBattery.enabled ? '🟢 ACTIVO' : '⚪ INACTIVO (Espera Misión 2)'}
                        </div>
                    </div>
                    <div>
                        <button id="devToggleBatterySystemBtn" class="devActionBtn ${sessionBattery.enabled ? 'danger' : 'primary'}">
                            ${sessionBattery.enabled ? '⏸️ Desactivar Sistema' : '⚡ Activar Sistema Ahora'}
                        </button>
                    </div>
                </div>

                <!-- MONITOR EN VIVO -->
                <div class="devLiveMonitorGrid">
                    <div class="devMonitorBox">
                        <div class="devMonitorLabel">Tiempo Restante</div>
                        <div id="devMonRemaining" class="devMonitorVal">--:--</div>
                    </div>
                    <div class="devMonitorBox">
                        <div class="devMonitorLabel">Tiempo Consumido</div>
                        <div id="devMonConsumed" class="devMonitorVal">--:--</div>
                    </div>
                    <div class="devMonitorBox">
                        <div class="devMonitorLabel">Células Activas</div>
                        <div id="devMonCells" class="devMonitorVal">-- / 3</div>
                    </div>
                    <div class="devMonitorBox">
                        <div class="devMonitorLabel">Enfriamiento (3h)</div>
                        <div id="devMonCooldown" class="devMonitorVal">No</div>
                    </div>
                </div>

                <!-- BARRA DE CÉLULAS VISUAL -->
                <div class="devBatteryCellsPreview" id="devBatteryCellsBar">
                    <div class="devCellBar" id="devCell1">Célula 1 (0-20 min)</div>
                    <div class="devCellBar" id="devCell2">Célula 2 (20-40 min)</div>
                    <div class="devCellBar" id="devCell3">Célula 3 (40-60 min)</div>
                </div>
            </div>

            <!-- SIMULACIÓN RÁPIDA DE TIEMPOS -->
            <div class="devControlGroup">
                <div class="devGroupTitle">⚡ Simulación de Niveles y Avisos:</div>
                <div class="devButtonsGrid">
                    <button class="devActionBtn" id="btnSimFull">
                        🔋 100% (60 min)
                    </button>
                    <button class="devActionBtn" id="btnSim40m">
                        ⚡ 2 Células (40 min)
                    </button>
                    <button class="devActionBtn" id="btnSim20m">
                        ⚠️ 1 Célula (20 min)
                    </button>
                    <button class="devActionBtn warning" id="btnSim5m">
                        🚨 Aviso 5 min
                    </button>
                    <button class="devActionBtn danger" id="btnSim1m">
                        ⏱️ Aviso 50 seg
                    </button>
                </div>
            </div>

            <!-- SIMULACIÓN DE BLOQUEO Y DESCANSO (PANTALLA DE REPOSO) -->
            <div class="devControlGroup">
                <div class="devGroupTitle">🛑 Simulación de Bloqueo y Descanso (Pantalla de Reposo):</div>
                <div class="devButtonsGrid">
                    <button class="devActionBtn danger" id="btnPreviewRest0h">
                        🛑 Bloqueo Inicial (Quedan 3h / 0h descansadas)
                    </button>
                    <button class="devActionBtn" id="btnPreviewRest1h" style="border-color:#10b981;">
                        🛌 Tras 1h Descansada (Quedan 2h / Reanudar 20 min)
                    </button>
                    <button class="devActionBtn" id="btnPreviewRest2h" style="border-color:#10b981;">
                        🛌 Tras 2h Descansadas (Queda 1h / Reanudar 40 min)
                    </button>
                    <button class="devActionBtn primary" id="btnResetFull">
                        🔄 Batería Llena (100% / 3 Células - 60 min)
                    </button>
                </div>
            </div>
        </div>
    `;

    // Asignar listeners
    setupEventListeners(container);

    // Iniciar monitor en vivo
    updateLiveMonitor();
    liveMonitorInterval = setInterval(updateLiveMonitor, 1000);
}

export function cleanupSessionBatteryTab() {
    if (liveMonitorInterval) {
        clearInterval(liveMonitorInterval);
        liveMonitorInterval = null;
    }
}

function setupEventListeners(container) {
    // Toggle Activar / Desactivar
    const toggleBtn = container.querySelector('#devToggleBatterySystemBtn');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            const nextState = !sessionBattery.enabled;
            devSetSystemEnabled(nextState);
            showDevToast(nextState ? '✅ Sistema de Batería ACTIVADO' : '⏸️ Sistema de Batería DESACTIVADO');
            renderSessionBatteryTab(container);
        };
    }

    // 60 min (Full)
    const btnSimFull = container.querySelector('#btnSimFull');
    if (btnSimFull) {
        btnSimFull.onclick = () => {
            devSetConsumedMinutes(0);
            showDevToast('🔋 Batería restaurada al 100% (60 min)');
            updateLiveMonitor();
        };
    }

    // 40 min restantes (20 min consumidos)
    const btnSim40m = container.querySelector('#btnSim40m');
    if (btnSim40m) {
        btnSim40m.onclick = () => {
            devSetConsumedMinutes(20);
            showDevToast('⚡ Simulado minuto 20 (Quedan 40 min / 2 células)');
            updateLiveMonitor();
        };
    }

    // 20 min restantes (40 min consumidos)
    const btnSim20m = container.querySelector('#btnSim20m');
    if (btnSim20m) {
        btnSim20m.onclick = () => {
            devSetConsumedMinutes(40);
            showDevToast('⚠️ Simulado minuto 40 (Quedan 20 min / 1 célula)');
            updateLiveMonitor();
        };
    }

    // 5 min restantes (55 min consumidos)
    const btnSim5m = container.querySelector('#btnSim5m');
    if (btnSim5m) {
        btnSim5m.onclick = () => {
            devSetConsumedMinutes(55);
            showDevToast('🚨 Simulado minuto 55 (Quedan 5 min)');
            updateLiveMonitor();
        };
    }

    // 1 min restante (59 min y 10 seg consumidos)
    const btnSim1m = container.querySelector('#btnSim1m');
    if (btnSim1m) {
        btnSim1m.onclick = () => {
            sessionBattery.enabled = true;
            sessionBattery.consumedSeconds = 3550;
            sessionBattery.cooldownUntil = null;
            sessionBattery.notified5Min = true;
            sessionBattery.notified1Min = false;
            updateHUDVisuals();
            showDevToast('⏱️ Simulado último minuto (Quedan 50 seg)');
            updateLiveMonitor();
        };
    }

    // Bloqueo Inicial (0h descansadas - Quedan 3h)
    const btnPreviewRest0h = container.querySelector('#btnPreviewRest0h');
    if (btnPreviewRest0h) {
        btnPreviewRest0h.onclick = () => {
            devPreviewRestScreen(0);
            showDevToast('🛑 Bloqueo Inicial 3h forzado (0h descansadas)');
            updateLiveMonitor();
        };
    }

    // Vista previa 1h descansada (botón 1 célula / 20 min)
    const btnPreviewRest1h = container.querySelector('#btnPreviewRest1h');
    if (btnPreviewRest1h) {
        btnPreviewRest1h.onclick = () => {
            devPreviewRestScreen(1);
            showDevToast('🛌 Pantalla de Reposo: 1h descansada (botón 1 célula / 20 min activo)');
            updateLiveMonitor();
        };
    }

    // Vista previa 2h descansadas (botón 2 células / 40 min)
    const btnPreviewRest2h = container.querySelector('#btnPreviewRest2h');
    if (btnPreviewRest2h) {
        btnPreviewRest2h.onclick = () => {
            devPreviewRestScreen(2);
            showDevToast('🛌 Pantalla de Reposo: 2h descansadas (botón 2 células / 40 min activo)');
            updateLiveMonitor();
        };
    }

    // Reset / Batería Llena (100% / 3 Células)
    const btnResetFull = container.querySelector('#btnResetFull');
    if (btnResetFull) {
        btnResetFull.onclick = () => {
            devResetToFull();
            showDevToast('🔄 Batería restaurada al 100% (60 min) y bloqueos eliminados');
            updateLiveMonitor();
        };
    }
}

function updateLiveMonitor() {
    const remSec = getRemainingSeconds();
    const cells = getRemainingCells();
    const consumedSec = Math.round(sessionBattery.consumedSeconds);

    const remMin = Math.floor(remSec / 60);
    const remS = Math.floor(remSec % 60);

    const consMin = Math.floor(consumedSec / 60);
    const consS = Math.floor(consumedSec % 60);

    const elRem = document.getElementById('devMonRemaining');
    if (elRem) elRem.textContent = `${String(remMin).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;

    const elCons = document.getElementById('devMonConsumed');
    if (elCons) elCons.textContent = `${String(consMin).padStart(2, '0')}:${String(consS).padStart(2, '0')}`;

    const elCells = document.getElementById('devMonCells');
    if (elCells) elCells.textContent = `${cells} / 3`;

    const elCooldown = document.getElementById('devMonCooldown');
    if (elCooldown) {
        if (isCooldownActive()) {
            const cdMs = getCooldownRemainingMs();
            const cdSec = Math.floor(cdMs / 1000);
            const cdH = Math.floor(cdSec / 3600);
            const cdM = Math.floor((cdSec % 3600) / 60);
            const cdS = cdSec % 60;
            elCooldown.innerHTML = `<span style="color:#ef4444;font-weight:700;">BLOQUEO (${cdH}h ${cdM}m ${cdS}s)</span>`;
        } else {
            elCooldown.innerHTML = `<span style="color:#10b981;">Inactivo</span>`;
        }
    }

    // Actualizar barras de células en el monitor
    const cell1 = document.getElementById('devCell1');
    const cell2 = document.getElementById('devCell2');
    const cell3 = document.getElementById('devCell3');

    if (cell1) cell1.className = `devCellBar ${cells >= 1 ? 'active color-low' : 'empty'}`;
    if (cell2) cell2.className = `devCellBar ${cells >= 2 ? 'active color-mid' : 'empty'}`;
    if (cell3) cell3.className = `devCellBar ${cells >= 3 ? 'active color-high' : 'empty'}`;
}
