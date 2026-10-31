/* ======================================================
   MONTESERIN ACADEMY - ITEM OBTAINED NOTIFICATION SYSTEM
   Efecto audiovisual para la obtención de carnets / objetos clave
   - Banner flotante superior con miniatura y texto brillante
   - Tintineo armónico cristalino sintetizado (Web Audio API)
   - Totalmente adaptado a PC y móvil (Landscape 100%)
   ====================================================== */

let bannerElement = null;
let dismissTimer = null;
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

/**
 * Tintineo armónico cristalino estilo RPG / aventura cuando se obtiene un carnet u objeto clave.
 * Acorde arpegiado ascendente brillante (C5, E5, G5, B5, C6) con campana armónica.
 */
export function playItemObtainedChime() {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        const notes = [
            { freq: 523.25, time: 0.00, dur: 0.55, vol: 0.16 }, // C5
            { freq: 659.25, time: 0.09, dur: 0.55, vol: 0.17 }, // E5
            { freq: 783.99, time: 0.18, dur: 0.65, vol: 0.18 }, // G5
            { freq: 987.77, time: 0.27, dur: 0.70, vol: 0.19 }, // B5
            { freq: 1046.50, time: 0.36, dur: 1.25, vol: 0.22 }, // C6 (campana brillante)
            { freq: 2093.00, time: 0.37, dur: 1.10, vol: 0.08 }  // Armónico C7
        ];

        notes.forEach(({ freq, time, dur, vol }) => {
            const start = now + time;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = freq > 1200 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.0, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(start);
            osc.stop(start + dur + 0.05);
        });
    } catch (_) {}
}

/**
 * Muestra el banner flotante superior de obtención de objeto/acreditación.
 */
export function showItemObtainedBanner({
    title = '¡Acreditación Obtenida!',
    itemName = 'Carnet de Aspirante',
    subtitle = 'Añadido al Inventario y Archivado en tu Registro',
    thumbnail = 'assets/ui/ASPIRANTE.jpg',
    duration = 4200
} = {}) {
    if (!bannerElement) {
        buildBannerDOM();
    }

    const thumbImg = bannerElement.querySelector('.itemObtainedThumb');
    const headerTitle = bannerElement.querySelector('.itemObtainedHeaderTitle');
    const nameEl = bannerElement.querySelector('.itemObtainedItemName');
    const subEl = bannerElement.querySelector('.itemObtainedSubtitle');

    if (thumbImg) thumbImg.src = thumbnail;
    if (headerTitle) headerTitle.textContent = title;
    if (nameEl) nameEl.textContent = itemName;
    if (subEl) subEl.textContent = subtitle;

    // Reproducir tintineo sonoro
    playItemObtainedChime();

    // Resetear timers
    if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
    }

    bannerElement.classList.remove('exit');
    bannerElement.classList.add('visible');
    bannerElement.style.display = 'flex';

    // Desvanecer automáticamente tras el tiempo estipulado
    dismissTimer = setTimeout(() => {
        hideItemObtainedBanner();
    }, duration);
}

export function hideItemObtainedBanner() {
    if (!bannerElement) return;
    bannerElement.classList.remove('visible');
    bannerElement.classList.add('exit');
    setTimeout(() => {
        if (bannerElement && !bannerElement.classList.contains('visible')) {
            bannerElement.style.display = 'none';
            bannerElement.classList.remove('exit');
        }
    }, 400);
}

function buildBannerDOM() {
    bannerElement = document.createElement('div');
    bannerElement.id = 'itemObtainedBanner';
    bannerElement.className = 'itemObtainedBanner';

    bannerElement.innerHTML = `
        <div class="itemObtainedGlow"></div>
        <div class="itemObtainedThumbFrame">
            <img class="itemObtainedThumb" src="assets/ui/ASPIRANTE.jpg" alt="Objeto" draggable="false" />
        </div>
        <div class="itemObtainedContent">
            <div class="itemObtainedHeaderTitle">¡Acreditación Obtenida!</div>
            <div class="itemObtainedItemName">Carnet de Aspirante</div>
            <div class="itemObtainedSubtitle">Añadido al Inventario y Archivado en Registro</div>
        </div>
        <button class="itemObtainedClose" title="Cerrar aviso" aria-label="Cerrar aviso">&times;</button>
    `;

    // Permitir descartar tocando el banner o la X
    bannerElement.onclick = () => {
        hideItemObtainedBanner();
    };

    document.body.appendChild(bannerElement);
}
