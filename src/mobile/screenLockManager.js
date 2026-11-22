/* ======================================================
   MONTESERIN ACADEMY - SCREEN WAKE LOCK & FULLSCREEN MANAGER
   1. Screen Wake Lock: Impide que la pantalla del móvil se apague por inactividad.
   2. Fullscreen Recovery: Botón central táctil para recuperar la pantalla completa
      si el móvil se suspende o sale de fullscreen.
   ====================================================== */

import { isMobile as detectMobile } from './mobileDetection.js';

let wakeLock = null;
let fullscreenPrompt = null;
let isMobile = false;

export function initScreenLockManager() {
    isMobile = detectMobile();

    // 1. Activar Wake Lock en el primer gesto del usuario (solo si está soportado)
    if ('wakeLock' in navigator) {
        const gestureEvents = ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'];
        const cleanupGestureListeners = () => {
            gestureEvents.forEach(evt => {
                window.removeEventListener(evt, requestLockOnGesture);
            });
        };
        const requestLockOnGesture = async () => {
            const result = await acquireWakeLock();
            if (result === 'acquired' || result === 'denied') {
                cleanupGestureListeners();
            }
        };

        gestureEvents.forEach(evt => {
            window.addEventListener(evt, requestLockOnGesture, { passive: true });
        });
    }

    // 2. Re-adquirir Wake Lock al volver a la pestaña
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            await acquireWakeLock();
        }
    });

    // 3. Crear el botón central de recuperación de pantalla completa
    createCentralFullscreenPrompt();

    // 4. Escuchar cambios de fullscreen
    const onFullscreenChange = () => {
        const isCurrentlyFullscreen = Boolean(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );

        if (fullscreenPrompt) {
            // Solo mostrar el prompt si estamos en móvil o el usuario estaba jugando
            if (!isCurrentlyFullscreen && isMobile) {
                // Verificar si estamos dentro del juego (no en menú inicial)
                const mainMenu = document.getElementById('mainMenu');
                const isMenuVisible = mainMenu && mainMenu.style.display !== 'none';
                if (!isMenuVisible) {
                    showCentralFullscreenPrompt();
                }
            } else {
                hideCentralFullscreenPrompt();
            }
        }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
}

// ======================================================
// WAKE LOCK (MANTENER PANTALLA ENCENDIDA)
// ======================================================

async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return 'unsupported';
    if (wakeLock !== null) return 'acquired'; // Ya activo

    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
        });
        return 'acquired';
    } catch (err) {
        // En algunas plataformas puede fallar si la batería es muy baja o no tiene permiso
        console.warn('Wake Lock no disponible o denegado:', err);
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
            return 'denied';
        }
        return 'failed';
    }
}

// ======================================================
// RECUPERACIÓN CENTRAL DE PANTALLA COMPLETA
// ======================================================

function createCentralFullscreenPrompt() {
    if (document.getElementById('centralFullscreenPrompt')) return;

    fullscreenPrompt = document.createElement('div');
    fullscreenPrompt.id = 'centralFullscreenPrompt';
    fullscreenPrompt.className = 'centralFullscreenPrompt';
    fullscreenPrompt.style.zIndex = '2500000';

    fullscreenPrompt.innerHTML = `
        <div class="centralFullscreenCard">
            <div class="centralFullscreenIcon">⛶</div>
            <div class="centralFullscreenTitle">PANTALLA COMPLETA</div>
            <div class="centralFullscreenSubtitle">Toca en cualquier parte para volver a pantalla completa</div>
            <button class="centralFullscreenBtn">Continuar en Pantalla Completa</button>
        </div>
    `;

    // Al pulsar en cualquier punto del overlay o botón, volver a pantalla completa
    fullscreenPrompt.onclick = (e) => {
        e.stopPropagation();
        triggerFullscreen();
    };

    document.body.appendChild(fullscreenPrompt);
}

export function showCentralFullscreenPrompt() {
    if (!fullscreenPrompt) createCentralFullscreenPrompt();
    fullscreenPrompt.style.zIndex = '2500000';
    fullscreenPrompt.style.display = 'flex';
    void fullscreenPrompt.offsetWidth;
    fullscreenPrompt.classList.add('visible');
}

export function hideCentralFullscreenPrompt() {
    if (!fullscreenPrompt) return;
    fullscreenPrompt.classList.remove('visible');
    setTimeout(() => {
        if (!fullscreenPrompt.classList.contains('visible')) {
            fullscreenPrompt.style.display = 'none';
        }
    }, 250);
}

export async function triggerFullscreen() {
    const elem = document.documentElement;
    try {
        if (elem.requestFullscreen) {
            await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            await elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
            await elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
            await elem.msRequestFullscreen();
        }
    } catch (err) {
        console.warn('No se pudo activar pantalla completa:', err);
    }
    hideCentralFullscreenPrompt();
    await acquireWakeLock();
}
