/* ======================================================
   MONTESERIN ACADEMY - MICROCHIP HUNT & METAL DETECTOR
   Misión 2: Rastreo con Detector de Metales y recogida manual
   - 7 ubicaciones fijas sobre el terreno (Y = getHeightAt(x, z))
   - Alcance de rastreo: 45 m
   - Revelación visual del chip + haz/pulso en el suelo: < 6 m (con Detector equipado)
   - Rango de recogida manual (E / botón táctil): < 2.8 m
   - HUD compacto: Mini-brújula circular + intensidad + contador X / 7
   - Efectos: Pitidos Web Audio progresivos + pulso LCD/bobina 3D + onda de suelo
   ====================================================== */

import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { camera } from '../core/camera.js';
import { runtimeState } from '../state/runtimeState.js';
import { gameState } from '../state/gameState.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { dialogueState } from '../dialogue/dialogueState.js';
import { isInputLocked } from '../systems/inputLockSystem.js';
import { isRegistryOpen } from '../ui/registry/registryUI.js';
import { playerEquipment } from '../player/playerEquipment.js';
import {
    isItemEquipped,
    addInventoryItem,
    getInventoryItemCount
} from '../ui/registry/modules/inventoryModuleV2.js';
import { updateDiaryContent } from '../ui/registry/modules/diaryModule.js';
import { showItemObtainedBanner } from '../ui/itemObtainedNotification.js';
import { saveGame } from './saveSystem.js';

export const MICROCHIP_DETECT_RANGE = 45.0;
export const MICROCHIP_REVEAL_RANGE = 6.0;
export const MICROCHIP_PICKUP_RANGE = 2.8;

export const MICROCHIP_SPAWN_POINTS = [
    { id: 'chip_0', x: 165,    z: -163 },
    { id: 'chip_1', x: 157,    z: -212 },
    { id: 'chip_2', x: 213,    z: -233 },
    { id: 'chip_3', x: 217,    z: -167 },
    { id: 'chip_4', x: 175,    z: -150 },
    { id: 'chip_5', x: 225,    z: -111 },
    { id: 'chip_6', x: 175.50, z: -62.47 }
];

const chipNodes = [];
let initialized = false;
let hudRoot = null;
let hudCompassNeedle = null;
let hudCompassDial = null;
let hudSignalLabel = null;
let hudDistanceLabel = null;
let hudCountLabel = null;
let hudSegments = [];
let hudRadarArcs = [];
let groundWaveRing = null;
let wavePhase = 0;

let activePickupChip = null;
let beepAudioCtx = null;
let nextBeepAt = 0;
let detectorElapsed = 0;

const tmpCamDir = new THREE.Vector3();

function ensureCollectedArray() {
    if (!gameState.flags || typeof gameState.flags !== 'object') {
        gameState.flags = {};
    }
    if (!Array.isArray(gameState.flags.collectedMicrochips)) {
        gameState.flags.collectedMicrochips = [];
    }
    return gameState.flags.collectedMicrochips;
}

function getAudioContext() {
    if (!beepAudioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            beepAudioCtx = new AudioContextClass();
        }
    }
    if (beepAudioCtx && beepAudioCtx.state === 'suspended') {
        beepAudioCtx.resume().catch(() => {});
    }
    return beepAudioCtx;
}

function playDetectorBeep(signalStrength) {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const freq = 520 + signalStrength * 740;
        const dur = Math.max(0.055, 0.13 - signalStrength * 0.065);
        const peakVol = 0.045 + signalStrength * 0.055;

        osc.type = signalStrength > 0.72 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        if (signalStrength > 0.85) {
            osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + dur);
        }

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(peakVol, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + dur + 0.02);
    } catch (_) {}
}

function playChipPickupSound(isFinalSeventh) {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        const notes = isFinalSeventh
            ? [659.25, 880, 1046.5, 1318.5, 1567.98]
            : [587.33, 880, 1174.66];

        notes.forEach((freq, idx) => {
            const start = now + idx * 0.065;
            const dur = isFinalSeventh ? 0.36 : 0.24;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + dur + 0.03);
        });
    } catch (_) {}
}

function createMicrochipMesh(chipId) {
    const root = new THREE.Group();
    root.name = `MicrochipPickup_${chipId}`;

    // Núcleo del microchip flotando suavemente sobre el suelo
    const chipSpinGroup = new THREE.Group();
    chipSpinGroup.position.y = 0.26;

    const pcbMat = new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        roughness: 0.3,
        metalness: 0.35,
        emissive: 0x065f46,
        emissiveIntensity: 0.35
    });
    const coreMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.15,
        metalness: 0.5,
        emissive: 0x0ea5e9,
        emissiveIntensity: 1.15
    });
    const pinMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0xca8a04,
        emissiveIntensity: 0.35
    });

    const board = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.32), pcbMat);
    chipSpinGroup.add(board);

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.065, 0.16), coreMat);
    core.position.y = 0.01;
    chipSpinGroup.add(core);

    // Pines dorados en los 4 lados
    const pinGeo = new THREE.BoxGeometry(0.04, 0.025, 0.09);
    [-0.1, 0, 0.1].forEach((offset) => {
        const pN = new THREE.Mesh(pinGeo, pinMat);
        pN.position.set(offset, 0, -0.19);
        chipSpinGroup.add(pN);

        const pS = new THREE.Mesh(pinGeo, pinMat);
        pS.position.set(offset, 0, 0.19);
        chipSpinGroup.add(pS);

        const pE = new THREE.Mesh(pinGeo, pinMat);
        pE.rotation.y = Math.PI / 2;
        pE.position.set(0.19, 0, offset);
        chipSpinGroup.add(pE);

        const pW = new THREE.Mesh(pinGeo, pinMat);
        pW.rotation.y = Math.PI / 2;
        pW.position.set(-0.19, 0, offset);
        chipSpinGroup.add(pW);
    });

    root.add(chipSpinGroup);

    // Anillo luminoso en el suelo
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    root.add(ring);

    // Haz vertical suave para localizarlo fácilmente entre la hierba
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.34, 1.55, 20, 1, true), beamMat);
    beam.position.y = 0.80;
    root.add(beam);

    root.userData = {
        chipSpinGroup,
        ring,
        ringMat,
        beam,
        beamMat,
        revealScale: 0.01
    };

    return root;
}

function createGroundWaveRing() {
    if (groundWaveRing) return groundWaveRing;
    const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.48, 32), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.name = 'DetectorGroundPulseRing';
    scene.add(mesh);
    groundWaveRing = mesh;
    return mesh;
}

function createDetectorHud() {
    if (hudRoot) return hudRoot;

    hudRoot = document.createElement('div');
    hudRoot.id = 'metalDetectorHud';
    hudRoot.className = 'metalDetectorHud';
    hudRoot.style.display = 'none';

    hudRoot.innerHTML = `
        <div class="mdCompassRing" id="mdCompassDial">
            <svg class="mdRadarArcSvg" viewBox="0 0 64 64" aria-hidden="true">
                <circle class="mdRadarArcSeg" cx="32" cy="32" r="28" stroke-dasharray="27.37 148.56" transform="rotate(-82 32 32)" />
                <circle class="mdRadarArcSeg" cx="32" cy="32" r="28" stroke-dasharray="27.37 148.56" transform="rotate(-10 32 32)" />
                <circle class="mdRadarArcSeg" cx="32" cy="32" r="28" stroke-dasharray="27.37 148.56" transform="rotate(62 32 32)" />
                <circle class="mdRadarArcSeg" cx="32" cy="32" r="28" stroke-dasharray="27.37 148.56" transform="rotate(134 32 32)" />
                <circle class="mdRadarArcSeg" cx="32" cy="32" r="28" stroke-dasharray="27.37 148.56" transform="rotate(206 32 32)" />
            </svg>
            <div class="mdCompassCross"></div>
            <div class="mdCompassNeedle" id="mdCompassNeedle">
                <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
                    <polygon points="18,3 25,21 18,17 11,21" fill="currentColor" />
                </svg>
            </div>
            <div class="mdCompassCenterDot"></div>
        </div>
        <div class="mdHudInfo">
            <div class="mdHudTopRow">
                <span class="mdHudTitle">DETECTOR DE METALES</span>
                <span class="mdHudCount" id="mdHudCount">0 / 7</span>
            </div>
            <div class="mdSignalBars" id="mdSignalBars">
                <span class="mdSignalSeg"></span>
                <span class="mdSignalSeg"></span>
                <span class="mdSignalSeg"></span>
                <span class="mdSignalSeg"></span>
                <span class="mdSignalSeg"></span>
            </div>
            <div class="mdHudBottomRow">
                <span class="mdSignalText" id="mdSignalLabel">Sin señal</span>
                <span class="mdDistanceText" id="mdDistanceLabel">-- m</span>
            </div>
        </div>
    `;

    document.body.appendChild(hudRoot);

    hudCompassNeedle = hudRoot.querySelector('#mdCompassNeedle');
    hudCompassDial = hudRoot.querySelector('#mdCompassDial');
    hudSignalLabel = hudRoot.querySelector('#mdSignalLabel');
    hudDistanceLabel = hudRoot.querySelector('#mdDistanceLabel');
    hudCountLabel = hudRoot.querySelector('#mdHudCount');
    hudSegments = Array.from(hudRoot.querySelectorAll('.mdSignalSeg'));
    hudRadarArcs = Array.from(hudRoot.querySelectorAll('.mdRadarArcSeg'));

    return hudRoot;
}

function updateDetector3DMeshFeedback(signalStrength, isClose, elapsed) {
    const equippedEntry = playerEquipment.equipped?.rightHand;
    const mesh = equippedEntry?.mesh;
    if (!mesh) return;

    mesh.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mat = child.material;
        const geoType = child.geometry?.type || '';

        // Pantalla LCD emisiva (PlaneGeometry en DetectorDeMetales)
        if (geoType === 'PlaneGeometry') {
            if (isClose) {
                const pulse = 0.55 + 0.45 * Math.sin(elapsed * 12.0);
                mat.color.setHex(0x4ade80);
                mat.emissive.setHex(0x22c55e);
                mat.emissiveIntensity = 1.4 + pulse * 1.1;
            } else if (signalStrength > 0.45) {
                mat.color.setHex(0xfef08a);
                mat.emissive.setHex(0xf59e0b);
                mat.emissiveIntensity = 1.1 + signalStrength * 0.7;
            } else if (signalStrength > 0) {
                mat.color.setHex(0x7dd3fc);
                mat.emissive.setHex(0x0284c7);
                mat.emissiveIntensity = 1.0 + signalStrength * 0.5;
            } else {
                mat.color.setHex(0x38bdf8);
                mat.emissive.setHex(0x2563eb);
                mat.emissiveIntensity = 0.75;
            }
        }

        // Bobina roja de búsqueda (TorusGeometry con radio >= 0.1)
        if (geoType === 'TorusGeometry' && (child.geometry?.parameters?.radius || 0) >= 0.1) {
            if (isClose) {
                const pulse = 0.5 + 0.5 * Math.sin(elapsed * 14.0);
                mat.emissive.setHex(0x38bdf8);
                mat.emissiveIntensity = 0.7 + pulse * 0.9;
            } else if (signalStrength > 0) {
                mat.emissive.setHex(0xdc2626);
                mat.emissiveIntensity = 0.25 + signalStrength * 0.75;
            } else {
                mat.emissive.setHex(0xdc2626);
                mat.emissiveIntensity = 0.20;
            }
        }
    });
}

function updateHudVisuals(equipped, signalStrength, minDistance, relAngleDeg, collectedCount, isHuntActive) {
    if (!hudRoot) createDetectorHud();

    const shouldHideForUI =
        !equipped ||
        !runtimeState.sessionStarted ||
        dialogueState.active ||
        isInputLocked() ||
        isRegistryOpen() ||
        runtimeState.isGodMode;

    if (shouldHideForUI) {
        hudRoot.style.display = 'none';
        return;
    }

    hudRoot.style.display = 'flex';

    if (hudCountLabel) {
        hudCountLabel.textContent = `${collectedCount} / ${MICROCHIP_SPAWN_POINTS.length}`;
    }

    // Todos recogidos
    if (!isHuntActive && collectedCount >= MICROCHIP_SPAWN_POINTS.length) {
        hudRoot.dataset.level = 'complete';
        hudSegments.forEach((seg) => seg.classList.add('active'));
        hudRadarArcs.forEach((arc) => arc.classList.add('active'));
        if (hudSignalLabel) hudSignalLabel.textContent = '¡7/7 listos! Ve con Alto';
        if (hudDistanceLabel) hudDistanceLabel.textContent = '✓';
        if (hudCompassDial) hudCompassDial.classList.remove('hasSignal');
        if (hudCompassNeedle) hudCompassNeedle.style.opacity = '0.25';
        return;
    }

    // Aún no activa la búsqueda o sin chips cerca (>45m)
    if (signalStrength <= 0 || !Number.isFinite(minDistance)) {
        hudRoot.dataset.level = 'none';
        hudSegments.forEach((seg) => seg.classList.remove('active'));
        hudRadarArcs.forEach((arc) => arc.classList.remove('active'));
        if (hudSignalLabel) hudSignalLabel.textContent = isHuntActive ? 'Sin señal cercana' : 'En espera';
        if (hudDistanceLabel) hudDistanceLabel.textContent = `>${Math.round(MICROCHIP_DETECT_RANGE)} m`;
        if (hudCompassDial) hudCompassDial.classList.remove('hasSignal');
        if (hudCompassNeedle) {
            hudCompassNeedle.style.opacity = '0.25';
        }
        return;
    }

    const activeSegments = Math.max(1, Math.min(5, Math.ceil(signalStrength * 5)));
    hudSegments.forEach((seg, idx) => {
        seg.classList.toggle('active', idx < activeSegments);
    });
    hudRadarArcs.forEach((arc, idx) => {
        arc.classList.toggle('active', idx < activeSegments);
    });

    if (minDistance <= MICROCHIP_REVEAL_RANGE) {
        hudRoot.dataset.level = 'hot';
        if (hudSignalLabel) hudSignalLabel.textContent = minDistance <= MICROCHIP_PICKUP_RANGE ? '¡Justo aquí!' : '¡Señal muy fuerte!';
    } else if (signalStrength >= 0.45) {
        hudRoot.dataset.level = 'warm';
        if (hudSignalLabel) hudSignalLabel.textContent = 'Señal media';
    } else {
        hudRoot.dataset.level = 'weak';
        if (hudSignalLabel) hudSignalLabel.textContent = 'Señal débil';
    }

    if (hudDistanceLabel) {
        hudDistanceLabel.textContent = `~${Math.max(1, Math.round(minDistance))} m`;
    }

    if (hudCompassDial) {
        hudCompassDial.classList.add('hasSignal');
    }
    if (hudCompassNeedle && Number.isFinite(relAngleDeg)) {
        hudCompassNeedle.style.opacity = '1';
        hudCompassNeedle.style.transform = `rotate(${relAngleDeg.toFixed(1)}deg)`;
    }
}

export function initMicrochipHuntSystem() {
    if (initialized) return;
    initialized = true;

    createDetectorHud();
    createGroundWaveRing();

    MICROCHIP_SPAWN_POINTS.forEach((pt, idx) => {
        const y = getHeightAt(pt.x, pt.z);
        const mesh = createMicrochipMesh(pt.id);
        mesh.position.set(pt.x, y, pt.z);
        mesh.visible = false;
        scene.add(mesh);

        chipNodes.push({
            id: pt.id,
            index: idx,
            x: pt.x,
            y,
            z: pt.z,
            mesh,
            collected: false
        });
    });

    syncMicrochipsFromGameState();
}

export function syncMicrochipsFromGameState() {
    const collected = ensureCollectedArray();
    const collectedSet = new Set(collected);
    const invCount = getInventoryItemCount('microchip');

    // Si ya se completó o entregó en misión, marcar todos recogidos en mapa
    const allDone = Boolean(gameState.flags?.deliveredMicrochips) || invCount >= MICROCHIP_SPAWN_POINTS.length;

    chipNodes.forEach((node) => {
        node.collected = allDone || collectedSet.has(node.id);
        if (node.collected) {
            node.mesh.visible = false;
        }
    });
}

export function updateMicrochipHuntSystem(delta = 0.016) {
    if (!initialized) initMicrochipHuntSystem();

    detectorElapsed += delta;
    activePickupChip = null;

    const player = runtimeState.player;
    const equipped = isItemEquipped('metalDetector');
    const huntPhase = Boolean(gameState.flags?.altoScannedCard) && !Boolean(gameState.flags?.deliveredMicrochips);
    const collectedCount = Math.min(
        MICROCHIP_SPAWN_POINTS.length,
        Math.max(ensureCollectedArray().length, getInventoryItemCount('microchip'))
    );

    if (!player || !equipped || !huntPhase || collectedCount >= MICROCHIP_SPAWN_POINTS.length) {
        chipNodes.forEach((node) => {
            node.mesh.visible = false;
            node.mesh.userData.revealScale = 0.01;
        });
        if (groundWaveRing) {
            groundWaveRing.visible = false;
        }
        updateDetector3DMeshFeedback(0, false, detectorElapsed);
        updateHudVisuals(equipped, 0, Infinity, 0, collectedCount, huntPhase);
        return;
    }

    const px = player.position.x;
    const pz = player.position.z;

    let nearestNode = null;
    let nearestDist = Infinity;
    let nearestPickupCandidate = null;
    let nearestPickupDist = Infinity;

    chipNodes.forEach((node) => {
        if (node.collected) {
            node.mesh.visible = false;
            return;
        }

        const dx = node.x - px;
        const dz = node.z - pz;
        const dist = Math.hypot(dx, dz);

        if (dist < nearestDist) {
            nearestDist = dist;
            nearestNode = node;
        }

        if (dist <= MICROCHIP_PICKUP_RANGE && dist < nearestPickupDist) {
            nearestPickupDist = dist;
            nearestPickupCandidate = node;
        }

        // Revelar microchip en el suelo solo al acercarse (< 6 m) con el detector equipado
        if (dist <= MICROCHIP_REVEAL_RANGE) {
            node.mesh.visible = true;
            const ud = node.mesh.userData;
            ud.revealScale = Math.min(1, ud.revealScale + delta * 5.0);
            node.mesh.scale.setScalar(ud.revealScale);

            // Giro suave y flotación
            if (ud.chipSpinGroup) {
                ud.chipSpinGroup.rotation.y += delta * 2.2;
                ud.chipSpinGroup.position.y = 0.28 + Math.sin(detectorElapsed * 3.4 + node.index) * 0.05;
            }
            // Pulso luminoso del anillo y haz en el suelo
            const pulse = 0.5 + 0.5 * Math.sin(detectorElapsed * 5.0 + node.index);
            if (ud.ring && ud.ringMat) {
                const s = 0.9 + pulse * 0.35;
                ud.ring.scale.set(s, s, 1);
                ud.ringMat.opacity = 0.45 + pulse * 0.45;
            }
            if (ud.beamMat) {
                ud.beamMat.opacity = 0.14 + pulse * 0.18;
            }
        } else {
            node.mesh.visible = false;
            node.mesh.userData.revealScale = 0.01;
        }
    });

    activePickupChip = nearestPickupCandidate;

    let signalStrength = 0;
    let relAngleDeg = 0;

    if (nearestNode && nearestDist <= MICROCHIP_DETECT_RANGE) {
        signalStrength = Math.max(0.05, 1.0 - (nearestDist / MICROCHIP_DETECT_RANGE));

        // Calcular ángulo relativo respecto a la orientación actual de cámara en pantalla
        camera.getWorldDirection(tmpCamDir);
        const fLen = Math.hypot(tmpCamDir.x, tmpCamDir.z) || 1;
        const fx = tmpCamDir.x / fLen;
        const fz = tmpCamDir.z / fLen;
        const dx = nearestNode.x - px;
        const dz = nearestNode.z - pz;
        const forwardComp = dx * fx + dz * fz;
        const rightComp = dx * (-fz) + dz * fx;
        relAngleDeg = Math.atan2(rightComp, forwardComp) * (180 / Math.PI);
    }

    const isClose = nearestDist <= MICROCHIP_REVEAL_RANGE;

    // Feedback 3D en pantalla LCD + bobina del detector equipado
    updateDetector3DMeshFeedback(signalStrength, isClose, detectorElapsed);

    // Onda expansiva en el suelo bajo el robot cuando hay señal detectada
    if (groundWaveRing) {
        if (signalStrength > 0.12 && !dialogueState.active && !isInputLocked() && !isRegistryOpen()) {
            wavePhase = (wavePhase + delta * (0.9 + signalStrength * 2.2)) % 1.0;
            const groundY = getHeightAt(px, pz) + 0.05;
            groundWaveRing.position.set(px, groundY, pz);
            const ringScale = 0.8 + wavePhase * (isClose ? 2.6 : 1.9);
            groundWaveRing.scale.set(ringScale, ringScale, 1);
            groundWaveRing.material.color.setHex(isClose ? 0x4ade80 : 0x38bdf8);
            groundWaveRing.material.opacity = (1.0 - wavePhase) * (0.25 + signalStrength * 0.35);
            groundWaveRing.visible = true;
        } else {
            groundWaveRing.visible = false;
        }
    }

    // Pitidos Web Audio progresivos (silenciados en diálogos/menús/pausa)
    const canPlayAudio =
        signalStrength > 0 &&
        !dialogueState.active &&
        !isInputLocked() &&
        !isRegistryOpen() &&
        !runtimeState.isGodMode &&
        runtimeState.sessionStarted &&
        !document.hidden;

    if (canPlayAudio) {
        const nowMs = performance.now();
        if (nowMs >= nextBeepAt) {
            playDetectorBeep(signalStrength);
            const intervalMs = 1350 - signalStrength * 1160; // ~1.35s lejos -> ~0.19s encima
            nextBeepAt = nowMs + Math.max(170, intervalMs);
        }
    }

    updateHudVisuals(equipped, signalStrength, nearestDist, relAngleDeg, collectedCount, huntPhase);
}

export function getNearbyMicrochipTarget() {
    if (!activePickupChip || activePickupChip.collected) return null;
    if (!isItemEquipped('metalDetector')) return null;
    if (!gameState.flags?.altoScannedCard || gameState.flags?.deliveredMicrochips) return null;
    return activePickupChip;
}

export function collectActiveMicrochip() {
    const target = getNearbyMicrochipTarget();
    if (!target) return false;

    const collected = ensureCollectedArray();
    if (!collected.includes(target.id)) {
        collected.push(target.id);
    }
    target.collected = true;
    target.mesh.visible = false;
    activePickupChip = null;

    addInventoryItem('microchip', 1);
    const totalCount = getInventoryItemCount('microchip');
    const isSeventh = totalCount >= MICROCHIP_SPAWN_POINTS.length;

    playChipPickupSound(isSeventh);
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(isSeventh ? [45, 50, 80] : 40);
        }
    } catch (_) {}

    if (isSeventh) {
        showItemObtainedBanner({
            title: '¡Microchips Completos (7/7)!',
            itemName: '¡Has reunido los 7 microchips!',
            subtitle: 'Vuelve con Señor Alto para entregarlos',
            thumbnail: 'assets/registry/inventory/microchip.svg',
            duration: 5200
        });
    } else {
        showItemObtainedBanner({
            title: '¡Microchip Recuperado!',
            itemName: `Microchip (${totalCount} / ${MICROCHIP_SPAWN_POINTS.length})`,
            subtitle: 'Añadido a tu Inventario',
            thumbnail: 'assets/registry/inventory/microchip.svg',
            duration: 3200
        });
    }

    updateDiaryContent();
    saveGame();
    return true;
}
