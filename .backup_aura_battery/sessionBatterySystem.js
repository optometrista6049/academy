/* ======================================================
   MONTESERIN ACADEMY - SISTEMA DE CONTROL DE SESIÓN Y BATERÍA (HÍBRIDO 3)
   - Capacidad: 60 minutos de exploración continua divididos en 3 células (20 min c/u).
   - Cooldown: 3 horas continuas de descanso tras agotar la hora.
   - Recarga proporcional estricta: 1 hora de descanso = +1 célula (20 min).
   - Inactivo por defecto hasta la llegada de la Misión 2 (activable desde DevTools F9).
   ====================================================== */

import { gameState } from '../state/gameState.js';
import { saveGame } from './saveSystem.js';
import { DEV_CONFIG } from '../debug/devPanel.js';
import { mountRestRobot3DStage, unmountRestRobot3DStage } from './restRobot3DStage.js';
import { triggerFullscreen } from '../mobile/screenLockManager.js';

export const BATTERY_CONFIG = {
    MAX_SESSION_SEC: 60 * 60,         // 60 minutos = 3600 seg
    CELL_SEC: 20 * 60,                // 20 minutos por célula = 1200 seg
    TOTAL_CELLS: 3,
    COOLDOWN_MS: 3 * 60 * 60 * 1000,  // 3 horas = 10,800,000 ms
    REST_MS_PER_CELL: 60 * 60 * 1000, // 1 hora de descanso = +1 célula (20 min)
    MIN_REST_MS: 45 * 60 * 1000,      // Umbral mínimo anti-trampas (45 min)
    AFK_TIMEOUT_SEC: 90,              // 90 segundos sin interacción = pausa inteligente
    STORAGE_KEY: 'monteserin_session_battery',
    SUPERVISOR_PIN: '1234'
};

export const sessionBattery = {
    enabled: false,             // Inactivo por defecto hasta que Misión 2 lo active
    consumedSeconds: 0,         // Segundos de juego consumidos (0 a 3600)
    cooldownUntil: null,        // Timestamp ms del fin del enfriamiento
    lastActiveTimestamp: Date.now(),
    lastNotifiedCell: 3,
    notified5Min: false,
    notified1Min: false,
    timeSinceLastInput: 0,
    isAfk: false,
    isInitialized: false,
    listenersAttached: false
};

let hudElement = null;
let restOverlayElement = null;
let infoModalElement = null;
let toastTimer = null;
let countdownInterval = null;

// ======================================================
// INICIALIZACIÓN Y PERSISTENCIA
// ======================================================

export function initSessionBatterySystem() {
    if (sessionBattery.isInitialized) return;
    sessionBattery.isInitialized = true;

    loadBatteryState();
    calculateOfflineRecovery();
    setupInputTracking();
    createHUDWidget();
    createRestOverlay();
    createInfoModal();

    // Si ya había un bloqueo de 3h activo y el sistema está habilitado, mostrarlo de inmediato
    if (sessionBattery.enabled && isCooldownActive()) {
        showRestOverlay();
    }

    console.log('🔋 Sistema de Batería de Exploración inicializado (Estado: ' + (sessionBattery.enabled ? 'ACTIVO' : 'INACTIVO / ESPERA MISIÓN 2') + ')');
}

export function loadBatteryState() {
    try {
        const raw = localStorage.getItem(BATTERY_CONFIG.STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                if (typeof data.consumedSeconds === 'number') sessionBattery.consumedSeconds = Math.max(0, Math.min(BATTERY_CONFIG.MAX_SESSION_SEC, data.consumedSeconds));
                if (data.cooldownUntil) sessionBattery.cooldownUntil = Number(data.cooldownUntil);
                if (data.lastActiveTimestamp) sessionBattery.lastActiveTimestamp = Number(data.lastActiveTimestamp);
                if (data.devForced === true) {
                    sessionBattery.devForced = true;
                    sessionBattery.enabled = true;
                }
            }
        }
    } catch (e) {
        console.warn('No se pudo cargar el estado de la batería:', e);
    }

    // Sincronizar con gameState: Solo se activa de juego regular si Misión 2 lo ha desbloqueado
    if (gameState.flags?.batterySystemUnlocked) {
        sessionBattery.enabled = true;
    } else if (gameState.sessionControl?.enabled) {
        sessionBattery.enabled = true;
    } else if (!sessionBattery.devForced) {
        // Por defecto inactivo hasta el desarrollo de la Misión 2
        sessionBattery.enabled = false;
    }
}

export function saveBatteryState() {
    try {
        const payload = {
            enabled: sessionBattery.enabled,
            devForced: Boolean(sessionBattery.devForced),
            consumedSeconds: Math.round(sessionBattery.consumedSeconds),
            cooldownUntil: sessionBattery.cooldownUntil,
            lastActiveTimestamp: Date.now()
        };
        localStorage.setItem(BATTERY_CONFIG.STORAGE_KEY, JSON.stringify(payload));

        if (gameState.sessionControl) {
            gameState.sessionControl.enabled = sessionBattery.enabled;
            gameState.sessionControl.consumedSeconds = sessionBattery.consumedSeconds;
            gameState.sessionControl.cooldownUntil = sessionBattery.cooldownUntil;
            gameState.sessionControl.lastActiveTimestamp = payload.lastActiveTimestamp;
        }
    } catch (e) {
        console.warn('No se pudo persistir la batería:', e);
    }
}

// ======================================================
// CÁLCULO DE DESCANSO / RECUPERACIÓN FUERA DE LÍNEA
// ======================================================

function calculateOfflineRecovery() {
    const now = Date.now();
    const last = sessionBattery.lastActiveTimestamp || now;
    const elapsedMs = Math.max(0, now - last);

    // Caso 1: Estaba en enfriamiento forzado de 3h
    if (sessionBattery.cooldownUntil) {
        if (now >= sessionBattery.cooldownUntil) {
            // El enfriamiento de 3 horas ha concluido
            sessionBattery.cooldownUntil = null;
            sessionBattery.consumedSeconds = 0;
            sessionBattery.lastNotifiedCell = 3;
            sessionBattery.notified5Min = false;
            sessionBattery.notified1Min = false;
            saveBatteryState();
        }
        return;
    }

    // Caso 2: Descanso voluntario antes de bloquearse
    if (elapsedMs >= BATTERY_CONFIG.COOLDOWN_MS) {
        // Pasaron 3 horas o más: recarga total (100%)
        sessionBattery.consumedSeconds = 0;
        sessionBattery.lastNotifiedCell = 3;
        sessionBattery.notified5Min = false;
        sessionBattery.notified1Min = false;
    } else if (elapsedMs >= BATTERY_CONFIG.MIN_REST_MS) {
        // Pasó al menos el umbral mínimo (45 min): recuperar 1 célula por cada hora completa
        const cellsToRecover = Math.floor(elapsedMs / BATTERY_CONFIG.REST_MS_PER_CELL);
        if (cellsToRecover > 0) {
            const secToRecover = cellsToRecover * BATTERY_CONFIG.CELL_SEC;
            sessionBattery.consumedSeconds = Math.max(0, sessionBattery.consumedSeconds - secToRecover);
            sessionBattery.lastNotifiedCell = getRemainingCells();
            sessionBattery.notified5Min = false;
            sessionBattery.notified1Min = false;
        }
    }

    sessionBattery.lastActiveTimestamp = now;
    saveBatteryState();
}

// ======================================================
// ENTRADA Y DETECCIÓN AFK (SMART PAUSE)
// ======================================================

function setupInputTracking() {
    if (sessionBattery.listenersAttached) return;
    sessionBattery.listenersAttached = true;

    const onUserActivity = () => {
        sessionBattery.timeSinceLastInput = 0;
        sessionBattery.isAfk = false;
    };

    ['keydown', 'mousedown', 'mousemove', 'touchstart', 'pointerdown'].forEach(evt => {
        window.addEventListener(evt, onUserActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            sessionBattery.isAfk = true;
            saveBatteryState();
        } else {
            sessionBattery.timeSinceLastInput = 0;
            sessionBattery.isAfk = false;
            calculateOfflineRecovery();
            updateHUDVisuals();
        }
    });
}

// ======================================================
// LOOP PRINCIPAL (LLAMADO CADA FRAME)
// ======================================================

let saveCounter = 0;

export function updateSessionBattery(delta) {
    if (!sessionBattery.isInitialized) {
        initSessionBatterySystem();
    }

    // Si el sistema está inactivo (hasta Misión 2) y no forzado por dev, no consumir tiempo
    if (!sessionBattery.enabled) {
        if (hudElement) hudElement.style.display = 'none';
        return;
    }

    if (hudElement) hudElement.style.display = 'flex';

    // 1. Si está en enfriamiento de 3 horas
    if (isCooldownActive()) {
        if (!restOverlayElement || restOverlayElement.style.display !== 'flex') {
            showRestOverlay();
        }
        return;
    }

    // 2. Comprobar AFK
    sessionBattery.timeSinceLastInput += delta;
    if (sessionBattery.timeSinceLastInput >= BATTERY_CONFIG.AFK_TIMEOUT_SEC) {
        sessionBattery.isAfk = true;
        updateHUDVisuals();
        return; // Pausado, no resta batería
    }

    sessionBattery.isAfk = false;

    // 3. Consumir tiempo de juego
    sessionBattery.consumedSeconds = Math.min(
        BATTERY_CONFIG.MAX_SESSION_SEC,
        sessionBattery.consumedSeconds + delta
    );
    sessionBattery.lastActiveTimestamp = Date.now();

    const remainingSec = getRemainingSeconds();
    const currentCells = getRemainingCells();

    // 4. Notificaciones automáticas de energía del Robot Aspirante
    checkBatteryNotifications(remainingSec, currentCells);

    // 5. Agotamiento total de la batería (60 min) -> Bloqueo de 3 horas
    if (remainingSec <= 0) {
        triggerCooldownLock();
        return;
    }

    // 6. Actualizar visuales del HUD
    updateHUDVisuals();

    // 7. Auto-guardado periódico del estado de batería (cada 15 seg aprox)
    saveCounter += delta;
    if (saveCounter >= 15) {
        saveCounter = 0;
        saveBatteryState();
    }
}

// ======================================================
// CÁLCULOS AUXILIARES
// ======================================================

export function getRemainingSeconds() {
    return Math.max(0, BATTERY_CONFIG.MAX_SESSION_SEC - sessionBattery.consumedSeconds);
}

export function getRemainingCells() {
    const sec = getRemainingSeconds();
    if (sec > 2 * BATTERY_CONFIG.CELL_SEC) return 3;
    if (sec > 1 * BATTERY_CONFIG.CELL_SEC) return 2;
    if (sec > 0) return 1;
    return 0;
}

export function isCooldownActive() {
    if (!sessionBattery.cooldownUntil) return false;
    if (Date.now() >= sessionBattery.cooldownUntil) {
        sessionBattery.cooldownUntil = null;
        sessionBattery.consumedSeconds = 0;
        saveBatteryState();
        if (restOverlayElement) restOverlayElement.style.display = 'none';
        return false;
    }
    return true;
}

export function getCooldownRemainingMs() {
    if (!sessionBattery.cooldownUntil) return 0;
    return Math.max(0, sessionBattery.cooldownUntil - Date.now());
}

// ======================================================
// NOTIFICACIONES AUTOMÁTICAS DE ENERGÍA Y DESCANSO
// ======================================================

function checkBatteryNotifications(remainingSec, currentCells) {
    // Transición de 3 células a 2 células (minuto 40 restante)
    if (sessionBattery.lastNotifiedCell === 3 && currentCells === 2) {
        sessionBattery.lastNotifiedCell = 2;
        showBatteryToast(
            '🔋 Batería al 66%',
            'La batería de exploración del Robot Aspirante está al 66% (te quedan 40 minutos). Toca la batería arriba para ver más detalles.',
            'info'
        );
        pulseBatteryHUD();
    }

    // Transición de 2 células a 1 célula (minuto 20 restante)
    if (sessionBattery.lastNotifiedCell === 2 && currentCells === 1) {
        sessionBattery.lastNotifiedCell = 1;
        showBatteryToast(
            '⚡ Batería baja (33%)',
            'Los circuitos del Robot Aspirante necesitan descanso. Se recomienda buscar un punto seguro en los próximos 20 minutos.',
            'warning'
        );
        pulseBatteryHUD();
    }

    // Alerta de 5 minutos restantes
    if (!sessionBattery.notified5Min && remainingSec <= 300 && remainingSec > 60) {
        sessionBattery.notified5Min = true;
        showBatteryToast(
            '⚠️ Batería Crítica (5 minutos)',
            'Quedan 5 minutos de energía. Los circuitos del Robot Aspirante pronto entrarán en modo reposo.',
            'danger'
        );
        pulseBatteryHUD(true);
    }

    // Alerta del último minuto
    if (!sessionBattery.notified1Min && remainingSec <= 60 && remainingSec > 0) {
        sessionBattery.notified1Min = true;
        showBatteryToast(
            '⏱️ Último minuto',
            'Guardando tu partida automáticamente antes de que el Robot Aspirante entre en reposo...',
            'danger'
        );
        saveGame();
    }
}

// ======================================================
// BLOQUEO Y PANTALLA DE REPOSO (COOLDOWN)
// ======================================================

export function triggerCooldownLock() {
    sessionBattery.enabled = true;
    sessionBattery.cooldownUntil = Date.now() + BATTERY_CONFIG.COOLDOWN_MS;
    sessionBattery.consumedSeconds = BATTERY_CONFIG.MAX_SESSION_SEC;
    saveGame();
    saveBatteryState();
    showRestOverlay();
}

export function showRestOverlay() {
    if (!restOverlayElement) {
        createRestOverlay();
    }

    // Si el panel de desarrollo está abierto, cerrarlo automáticamente
    const devSuite = document.getElementById('devSuiteOverlay');
    if (devSuite && devSuite.style.display === 'flex') {
        devSuite.style.display = 'none';
    }

    restOverlayElement.style.display = 'flex';
    restOverlayElement.style.zIndex = '2000000';

    // Resetear posición de scroll a la parte superior en cada apertura
    restOverlayElement.scrollTop = 0;
    const restCard = restOverlayElement.querySelector('.robotRestCard');
    if (restCard) restCard.scrollTop = 0;

    // Montar escenario 3D del Robot Aspirante durmiendo sentado
    const container = document.getElementById('robotRest3DCanvasContainer');
    if (container) {
        mountRestRobot3DStage(container);
    }

    startCountdownTimer();
}

export function hideRestOverlay() {
    if (restOverlayElement) {
        restOverlayElement.style.display = 'none';
    }
    unmountRestRobot3DStage();
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function startCountdownTimer() {
    if (countdownInterval) clearInterval(countdownInterval);

    const updateDisplay = () => {
        const remainingMs = getCooldownRemainingMs();
        if (remainingMs <= 0) {
            sessionBattery.cooldownUntil = null;
            sessionBattery.consumedSeconds = 0;
            saveBatteryState();
            hideRestOverlay();
            showBatteryToast('🎉 ¡Batería Recargada!', 'Los circuitos del Robot Aspirante se han enfriado y la batería está al 100%. ¡Listo para explorar!', 'success');
            return;
        }

        const totalSec = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;

        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const timerText = document.getElementById('robotRestTimerText');
        if (timerText) timerText.textContent = timeStr;

        const progressPercent = Math.min(100, Math.max(0, ((BATTERY_CONFIG.COOLDOWN_MS - remainingMs) / BATTERY_CONFIG.COOLDOWN_MS) * 100));
        const progressBar = document.getElementById('robotRestProgressBar');
        if (progressBar) progressBar.style.width = `${progressPercent.toFixed(1)}%`;

        // Cálculo de descanso parcial (1 célula por cada hora completa descansada)
        const elapsedRestMs = BATTERY_CONFIG.COOLDOWN_MS - remainingMs;
        const cellsRecovered = Math.min(2, Math.floor(elapsedRestMs / BATTERY_CONFIG.REST_MS_PER_CELL));

        const partialBtn = document.getElementById('resumeWithPartialRestBtn');
        const partialSub = document.getElementById('resumeWithPartialRestSub');
        if (partialBtn && partialSub) {
            if (cellsRecovered >= 1) {
                partialBtn.style.display = 'flex';
                partialBtn.innerHTML = `⚡ Reanudar con ${cellsRecovered} Célula${cellsRecovered > 1 ? 's' : ''} (${cellsRecovered * 20} min)`;
                partialBtn.onclick = () => resumeWithPartialCells(cellsRecovered);
                partialSub.style.display = 'block';
                partialSub.innerHTML = `⏱️ Has descansado <strong>${cellsRecovered} hora${cellsRecovered > 1 ? 's' : ''}</strong> (+${cellsRecovered * 20} min recuperados).<br>Puedes entrar ya o seguir descansando hasta el 100% (3 células).`;
            } else {
                partialBtn.style.display = 'none';
                partialSub.style.display = 'block';
                partialSub.innerHTML = `💤 Enfriamiento recién iniciado (0h descansadas). El Robot Aspirante requiere reposo para recargar.`;
            }
        }
    };

    updateDisplay();
    countdownInterval = setInterval(updateDisplay, 1000);
}

export function resumeWithPartialCells(cells) {
    const validCells = Math.max(1, Math.min(2, cells));
    sessionBattery.cooldownUntil = null;
    sessionBattery.consumedSeconds = BATTERY_CONFIG.MAX_SESSION_SEC - (validCells * BATTERY_CONFIG.CELL_SEC);
    sessionBattery.lastActiveTimestamp = Date.now();
    sessionBattery.lastNotifiedCell = getRemainingCells();
    sessionBattery.notified5Min = false;
    sessionBattery.notified1Min = false;
    saveBatteryState();
    hideRestOverlay();
    if (hudElement) hudElement.style.display = 'flex';
    updateHUDVisuals();
    showBatteryToast('⚡ Exploración Reanudada', `Has entrado con ${validCells} célula${validCells > 1 ? 's' : ''} (${validCells * 20} min de juego).`, 'info');
}

// ======================================================
// CONSTRUCCIÓN DEL HUD (WIDGET DE BATERÍA DIEGÉTICA)
// ======================================================

function createHUDWidget() {
    if (document.getElementById('robotBatteryHUD')) return;

    hudElement = document.createElement('div');
    hudElement.id = 'robotBatteryHUD';
    hudElement.className = 'robotBatteryHUD';
    hudElement.title = 'Batería de exploración del Robot Aspirante (Haz clic o toca para ver detalles)';

    hudElement.innerHTML = `
        <div class="robotBatteryCapsule">
            <div class="robotBatteryAvatar" title="Robot Aspirante">
                <svg class="robotBatteryAvatarSvg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <defs>
                        <linearGradient id="robotGoldenGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#fcd34d"/>
                            <stop offset="60%" stop-color="#f59e0b"/>
                            <stop offset="100%" stop-color="#d97706"/>
                        </linearGradient>
                    </defs>
                    <!-- Antena dorada -->
                    <line x1="12" y1="2" x2="12" y2="6" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="12" cy="2" r="1.6" fill="#fde68a" stroke="#d97706" stroke-width="0.5"/>
                    <!-- Cabeza dorada / anaranjada acorde con el Robot del jugador -->
                    <rect x="3.5" y="6" width="17" height="15" rx="4" fill="url(#robotGoldenGrad)" stroke="#b45309" stroke-width="1"/>
                    <!-- Orejas mecánicas laterales -->
                    <rect x="1.5" y="10.5" width="2" height="6" rx="1" fill="#b45309"/>
                    <rect x="20.5" y="10.5" width="2" height="6" rx="1" fill="#b45309"/>
                    <!-- Visor oscuro con ojos cian -->
                    <rect x="6" y="9.5" width="12" height="5.5" rx="2" fill="#090d16" stroke="#0284c7" stroke-width="0.7"/>
                    <circle cx="9" cy="12.2" r="1.3" fill="#38bdf8"/>
                    <circle cx="15" cy="12.2" r="1.3" fill="#38bdf8"/>
                    <!-- Línea de sonrisa mecánica -->
                    <path d="M 8.5 17.5 Q 12 19.5 15.5 17.5" fill="none" stroke="#78350f" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="robotBatteryBody">
                <div class="robotBatteryCell cell-1" data-cell="1"></div>
                <div class="robotBatteryCell cell-2" data-cell="2"></div>
                <div class="robotBatteryCell cell-3" data-cell="3"></div>
            </div>
            <div class="robotBatteryTerminal"></div>
        </div>
        <div class="robotBatteryInfo">
            <span id="robotBatteryText" class="robotBatteryTime">60 min</span>
            <span class="robotBatteryInfoBadge" id="robotBatteryInfoBadge" title="Información y reglas de la batería">ⓘ</span>
        </div>
    `;

    // Abrir modal de información al pulsar
    hudElement.onclick = (e) => {
        e.stopPropagation();
        openInfoModal();
    };

    document.body.appendChild(hudElement);

    // Si está inactivo por defecto, ocultarlo
    if (!sessionBattery.enabled) {
        hudElement.style.display = 'none';
    }
}

export function updateHUDVisuals() {
    if (!hudElement || !sessionBattery.enabled) return;

    const remainingSec = getRemainingSeconds();
    const cells = getRemainingCells();
    const minutes = Math.ceil(remainingSec / 60);

    const textEl = document.getElementById('robotBatteryText');
    if (textEl) {
        if (sessionBattery.isAfk) {
            textEl.textContent = 'En pausa ⏸️';
        } else {
            textEl.textContent = `${minutes} min`;
        }
    }

    const cell1 = hudElement.querySelector('[data-cell="1"]');
    const cell2 = hudElement.querySelector('[data-cell="2"]');
    const cell3 = hudElement.querySelector('[data-cell="3"]');

    // Resetear clases preservando identificadores de celda
    if (cell1) cell1.className = 'robotBatteryCell cell-1';
    if (cell2) cell2.className = 'robotBatteryCell cell-2';
    if (cell3) cell3.className = 'robotBatteryCell cell-3';

    if (cells >= 3) {
        if (cell1) cell1.classList.add('cell-active', 'color-high');
        if (cell2) cell2.classList.add('cell-active', 'color-high');
        if (cell3) cell3.classList.add('cell-active', 'color-high');
        hudElement.classList.remove('batteryWarning', 'batteryDanger');
    } else if (cells === 2) {
        if (cell1) cell1.classList.add('cell-active', 'color-mid');
        if (cell2) cell2.classList.add('cell-active', 'color-mid');
        hudElement.classList.add('batteryWarning');
        hudElement.classList.remove('batteryDanger');
    } else if (cells === 1) {
        if (cell1) cell1.classList.add('cell-active', 'color-low');
        hudElement.classList.add('batteryDanger');
        hudElement.classList.remove('batteryWarning');
    } else {
        hudElement.classList.add('batteryDanger');
        hudElement.classList.remove('batteryWarning');
    }
}

function pulseBatteryHUD(isUrgent = false) {
    if (!hudElement) return;
    hudElement.classList.remove('hudPulseAnim', 'hudUrgentPulseAnim');
    void hudElement.offsetWidth; // Forzar reflow
    hudElement.classList.add(isUrgent ? 'hudUrgentPulseAnim' : 'hudPulseAnim');
}

// ======================================================
// MODAL DE DETALLES E INFORMACIÓN DE LA BATERÍA
// ======================================================

function createInfoModal() {
    if (document.getElementById('robotBatteryInfoModal')) return;

    infoModalElement = document.createElement('div');
    infoModalElement.id = 'robotBatteryInfoModal';
    infoModalElement.className = 'robotBatteryInfoOverlay';
    infoModalElement.style.zIndex = '35000'; // Por encima del botón de registro (z-index 25000)

    infoModalElement.innerHTML = `
        <div class="robotBatteryInfoCard">
            <div class="batteryCardHeader">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div class="batteryAvatarBig">
                        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                            <defs>
                                <linearGradient id="modalBotGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="#fcd34d"/>
                                    <stop offset="60%" stop-color="#f59e0b"/>
                                    <stop offset="100%" stop-color="#d97706"/>
                                </linearGradient>
                            </defs>
                            <line x1="12" y1="2" x2="12" y2="6" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
                            <circle cx="12" cy="2" r="1.6" fill="#fde68a"/>
                            <rect x="3.5" y="6" width="17" height="15" rx="4" fill="url(#modalBotGrad)" stroke="#b45309" stroke-width="1"/>
                            <rect x="1.5" y="10.5" width="2" height="6" rx="1" fill="#b45309"/>
                            <rect x="20.5" y="10.5" width="2" height="6" rx="1" fill="#b45309"/>
                            <rect x="6" y="9.5" width="12" height="5.5" rx="2" fill="#090d16" stroke="#0284c7" stroke-width="0.7"/>
                            <circle cx="9" cy="12.2" r="1.3" fill="#38bdf8"/>
                            <circle cx="15" cy="12.2" r="1.3" fill="#38bdf8"/>
                        </svg>
                    </div>
                    <div>
                        <div class="batteryCardTitle">Batería de Exploración del Robot Aspirante</div>
                        <div class="batteryCardSub">Sistema de descanso inteligente y circuitos saludables</div>
                    </div>
                </div>
                <button id="closeBatteryInfoBtn" class="batteryCloseModalBtn" title="Cerrar información">&times;</button>
            </div>

            <div class="batteryCardBody">
                <div class="batteryStatusBox">
                    <div class="batteryStatusBigVal" id="modalBatteryRemaining">-- min</div>
                    <div class="batteryStatusCells" id="modalBatteryCellsVisual">
                        <div class="modalCell cellA"></div>
                        <div class="modalCell cellB"></div>
                        <div class="modalCell cellC"></div>
                    </div>
                    <div class="batteryStatusNote" id="modalBatteryNote">3 de 3 células activas</div>
                </div>

                <div class="batteryRulesBox">
                    <div class="ruleItem">
                        <span class="ruleIcon">⏱️</span>
                        <div>
                            <strong>Capacidad máxima:</strong> 1 hora de juego continuo (dividida en 3 células de 20 minutos).
                        </div>
                    </div>
                    <div class="ruleItem">
                        <span class="ruleIcon">🔋</span>
                        <div>
                            <strong>Recarga por descanso:</strong> Cada 1 hora completa de descanso real recupera 1 célula (+20 min de juego).
                        </div>
                    </div>
                    <div class="ruleItem">
                        <span class="ruleIcon">💤</span>
                        <div>
                            <strong>Enfriamiento total:</strong> Tras 3 horas de descanso continuo, la batería se llena al 100% (3 células).
                        </div>
                    </div>
                    <div class="ruleItem">
                        <span class="ruleIcon">⏸️</span>
                        <div>
                            <strong>Pausa inteligente:</strong> Si dejas el juego inactivo o cambias de pestaña, la batería deja de consumirse.
                        </div>
                    </div>
                </div>
            </div>

            <div class="batteryCardFooter">
                <button id="understandBatteryBtn" class="batteryPrimaryBtn">¡Entendido! 👍 Cerrar ventana</button>
            </div>
        </div>
    `;

    document.body.appendChild(infoModalElement);

    const closeBtn = document.getElementById('closeBatteryInfoBtn');
    if (closeBtn) closeBtn.onclick = closeInfoModal;

    const okBtn = document.getElementById('understandBatteryBtn');
    if (okBtn) okBtn.onclick = closeInfoModal;

    infoModalElement.onclick = (e) => {
        if (e.target === infoModalElement) closeInfoModal();
    };
}

export function openInfoModal() {
    if (!infoModalElement) createInfoModal();

    // Resetear posición de scroll a la parte superior en cada apertura
    infoModalElement.scrollTop = 0;
    const infoCard = infoModalElement.querySelector('.robotBatteryInfoCard');
    if (infoCard) infoCard.scrollTop = 0;

    const remainingSec = getRemainingSeconds();
    const cells = getRemainingCells();
    const min = Math.ceil(remainingSec / 60);

    const bigVal = document.getElementById('modalBatteryRemaining');
    if (bigVal) bigVal.textContent = `${min} minutos de energía`;

    const note = document.getElementById('modalBatteryNote');
    if (note) note.textContent = `${cells} de 3 células activas`;

    const cellsVisual = document.getElementById('modalBatteryCellsVisual');
    if (cellsVisual) {
        cellsVisual.innerHTML = `
            <div class="modalCell ${cells >= 1 ? (cells === 1 ? 'active color-low' : (cells === 2 ? 'active color-mid' : 'active color-high')) : ''}"></div>
            <div class="modalCell ${cells >= 2 ? (cells === 2 ? 'active color-mid' : 'active color-high') : ''}"></div>
            <div class="modalCell ${cells >= 3 ? 'active color-high' : ''}"></div>
        `;
    }

    infoModalElement.style.display = 'flex';
}

export function closeInfoModal() {
    if (infoModalElement) infoModalElement.style.display = 'none';
}

// ======================================================
// PANTALLA DE REPOSO (OVERLAY DE BLOQUEO DE 3 HORAS)
// ======================================================

function createRestOverlay() {
    if (document.getElementById('robotRestOverlay')) return;

    restOverlayElement = document.createElement('div');
    restOverlayElement.id = 'robotRestOverlay';
    restOverlayElement.className = 'robotRestOverlay';

    // Evitar cualquier interacción con el juego de fondo
    ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown'].forEach(evt => {
        restOverlayElement.addEventListener(evt, (e) => {
            e.stopPropagation();
        });
    });

    restOverlayElement.innerHTML = `
        <!-- BOTÓN FLOTANTE DISCRETO PARA RECUPERAR PANTALLA COMPLETA EN CUALQUIER MOMENTO -->
        <button id="restFullscreenBtn" class="restFullscreenFloatBtn" title="Restaurar Pantalla Completa" aria-label="Pantalla Completa">
            ⛶ Pantalla Completa
        </button>

        <div class="robotRestCard">
            <!-- PARTE SUPERIOR: TÍTULO, MENSAJE Y CUENTA ATRÁS -->
            <div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:10px;">
                <h2 class="robotRestTitle">TIEMPO DE ENFRIAMIENTO</h2>
                <p class="robotRestMessage">
                    ¡Excelente sesión de exploración! Los circuitos del Robot Aspirante necesitan enfriarse y Monty se va a echar una siesta. Tómate una buena merienda, descansa la vista y vuelve en cuanto la batería esté lista.
                </p>

                <!-- CUENTA ATRÁS Y PROGRESO -->
                <div class="robotRestCountdownBox" style="width:100%;max-width:380px;">
                    <div class="robotRestCountdownLabel">Batería lista en:</div>
                    <div id="robotRestTimerText" class="robotRestTimerText">03:00:00</div>
                    <div class="robotRestProgressContainer">
                        <div id="robotRestProgressBar" class="robotRestProgressBar"></div>
                    </div>
                </div>

                <!-- CONTENEDOR DE REANUDACIÓN PARCIAL CON CÉLULAS RECUPERADAS -->
                <div id="partialRecoveryContainer" style="display:flex;flex-direction:column;align-items:center;width:100%;">
                    <button id="resumeWithPartialRestBtn" class="resumePartialRestBtn" style="display:none;"></button>
                    <div id="resumeWithPartialRestSub" class="resumePartialRestSub" style="display:none;"></div>
                </div>
            </div>

            <!-- PARTE CENTRAL / INFERIOR: ROBOT 3D DURMIENDO CENTRADO CON LETRAS Z -->
            <div class="robotRestIconArea" style="margin: 6px 0;">
                <div id="robotRest3DCanvasContainer" class="robotRest3DArea"></div>
                <div class="robotSleepingFloatingZ">
                    <span class="sleepZ z1">Z</span>
                    <span class="sleepZ z2">z</span>
                    <span class="sleepZ z3">z</span>
                </div>
            </div>

            <!-- CONSEJOS DE BIENESTAR -->
            <div class="robotRestTipsGrid" style="width:100%;">
                <div class="restTipCard">
                    <span class="tipIcon">🍎</span>
                    <div class="tipText">
                        <strong>Merienda sana:</strong> Come una fruta o bebe agua.
                    </div>
                </div>
                <div class="restTipCard">
                    <span class="tipIcon">👀</span>
                    <div class="tipText">
                        <strong>Descanso visual:</strong> Relaja la vista mirando lejos.
                    </div>
                </div>
                <div class="restTipCard">
                    <span class="tipIcon">🚶</span>
                    <div class="tipText">
                        <strong>Estiramiento:</strong> Mueve un poco el cuerpo.
                    </div>
                </div>
            </div>

            <!-- DESBLOQUEO INMEDIATO DE DESARROLLO (SOLO ACTIVO EN DEV, CERO FORMULARIO DE PIN) -->
            ${DEV_CONFIG.enabled ? `
            <div class="devUnlockContainer" style="margin-top:4px;">
                <button id="instantDevUnlockBtn" class="devUnlockInstantBtn">⚡ Desbloqueo Inmediato (Modo Dev)</button>
            </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(restOverlayElement);

    // Botón de pantalla completa en la pantalla de descanso
    const fsBtn = restOverlayElement.querySelector('#restFullscreenBtn');
    if (fsBtn) {
        fsBtn.onclick = (e) => {
            e.stopPropagation();
            triggerFullscreen();
        };
    }

    // Botón directo de desarrollo (sin PIN ni avisos del navegador de contraseñas)
    const instantBtn = document.getElementById('instantDevUnlockBtn');
    if (instantBtn) {
        instantBtn.onclick = () => {
            bypassCooldown('Desbloqueo de Desarrollo');
        };
    }
}

export function bypassCooldown(reason = 'Bypass') {
    sessionBattery.cooldownUntil = null;
    sessionBattery.consumedSeconds = 0;
    sessionBattery.lastNotifiedCell = 3;
    sessionBattery.notified5Min = false;
    sessionBattery.notified1Min = false;
    saveBatteryState();
    hideRestOverlay();
    showBatteryToast('✅ Desbloqueado', `${reason}. La batería vuelve a estar al 100%.`, 'success');
}

// ======================================================
// TOAST NOTIFICATIONS DE BATERÍA
// ======================================================

export function showBatteryToast(title, message, type = 'info') {
    let toast = document.getElementById('robotBatteryToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'robotBatteryToast';
        toast.className = 'robotBatteryToast';
        document.body.appendChild(toast);
    }

    toast.className = `robotBatteryToast toast-${type} visible`;
    toast.innerHTML = `
        <div class="toastHeader">
            <span class="toastIcon">${type === 'danger' ? '⚠️' : (type === 'warning' ? '⚡' : '🔋')}</span>
            <strong>${title}</strong>
        </div>
        <div class="toastBody">${message}</div>
    `;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 4500);
}

// ======================================================
// FUNCIONES DE CONTROL PARA EL PANEL DE DESARROLLO (DEV TOOLS)
// ======================================================

export function devSetSystemEnabled(enabled) {
    sessionBattery.enabled = Boolean(enabled);
    sessionBattery.devForced = sessionBattery.enabled;
    saveBatteryState();
    if (hudElement) {
        hudElement.style.display = sessionBattery.enabled ? 'flex' : 'none';
    }
    updateHUDVisuals();
}

export function devSetConsumedMinutes(minutes) {
    sessionBattery.enabled = true; // Auto-activar para visibilidad inmediata en pruebas
    sessionBattery.consumedSeconds = Math.max(0, Math.min(BATTERY_CONFIG.MAX_SESSION_SEC, minutes * 60));
    sessionBattery.cooldownUntil = null;
    sessionBattery.lastActiveTimestamp = Date.now();
    sessionBattery.lastNotifiedCell = getRemainingCells();
    sessionBattery.notified5Min = (60 - minutes) <= 5;
    sessionBattery.notified1Min = (60 - minutes) <= 1;
    saveBatteryState();
    hideRestOverlay();
    if (hudElement) {
        hudElement.style.display = 'flex';
    }
    updateHUDVisuals();
}

export function devSimulateRestHours(hours) {
    sessionBattery.enabled = true; // Auto-activar para visibilidad inmediata en pruebas
    const msToSimulate = hours * 60 * 60 * 1000;
    
    // Si estaba en cooldown
    if (sessionBattery.cooldownUntil) {
        const remaining = sessionBattery.cooldownUntil - Date.now();
        if (msToSimulate >= remaining) {
            bypassCooldown(`Simuladas +${hours}h de descanso`);
        } else {
            sessionBattery.cooldownUntil -= msToSimulate;
            saveBatteryState();
            startCountdownTimer();
        }
        return;
    }

    // Si estaba en juego normal
    const cellsToRecover = Math.floor(msToSimulate / BATTERY_CONFIG.REST_MS_PER_CELL);
    const secToRecover = cellsToRecover * BATTERY_CONFIG.CELL_SEC;
    sessionBattery.consumedSeconds = Math.max(0, sessionBattery.consumedSeconds - secToRecover);
    sessionBattery.lastNotifiedCell = getRemainingCells();
    sessionBattery.notified5Min = false;
    sessionBattery.notified1Min = false;
    saveBatteryState();
    if (hudElement) {
        hudElement.style.display = 'flex';
    }
    updateHUDVisuals();
}

export function devResetToFull() {
    bypassCooldown('Reset completo a cero');
}

export function devPreviewRestScreen(restedHours) {
    sessionBattery.enabled = true;
    sessionBattery.devForced = true;
    sessionBattery.consumedSeconds = BATTERY_CONFIG.MAX_SESSION_SEC;
    // Si ha descansado 1h, le quedan 2h. Si descansó 2h, le queda 1h.
    const remainingHours = Math.max(0.01, 3 - restedHours);
    sessionBattery.cooldownUntil = Date.now() + (remainingHours * 3600 * 1000);
    saveBatteryState();
    showRestOverlay();
    startCountdownTimer();
}

