import * as THREE from 'three';
import { camera } from '../core/camera.js';
import { scene } from '../core/scene.js';
import { runtimeState } from '../state/runtimeState.js';
import { gameState } from '../state/gameState.js';
import { getHeightAt, LAKE_WATER_Y } from '../terrain/terrainHeight.js';
import { getBridgeHeight } from '../environment/bridgeSystem.js';
import { getWaterSurfaceLevel } from '../terrain/riverPath.js';
import { lockInput, unlockInput } from '../systems/inputLockSystem.js';
import {
    setCameraCinematicOverride,
    clearCameraCinematicOverride,
    snapCameraOrbitTo
} from '../player/playerCamera.js';
import { setPlayerAnimationOverride } from '../player/playerAnimation.js';
import { getMuebleDrawer, getMuebleObject, syncMuebleDrawerTransform } from '../entities/objects/muebleObject.js';
import { getEntityTransform } from '../systems/worldLayoutSystem.js';
import { addInventoryItem, removeInventoryItem } from '../ui/registry/modules/inventoryModuleV2.js';
import { completeObjective } from '../systems/missionManager.js';
import { updateDiaryContent } from '../ui/registry/modules/diaryModule.js';
import { isMobileDevice } from '../utils/deviceDetection.js';
import { hideMobileInteractionButton } from '../mobile/mobileInteractionButton.js';
import { triggerRegistryIntakeEffect } from '../ui/registry/registryUI.js';
import { saveGame } from '../systems/saveSystem.js';
import { collidables } from '../entities/collisions.js';
import { rebuildSpatialGrid } from '../systems/chunkSystem.js';

// =========================================================================
// AUDIO PROCEDURAL CON WEB AUDIO API
// =========================================================================

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
 * Sonido suave de la llave insertándose en la bocallave metálica.
 */
function playKeyInsertSFX() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.09, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (_) {}
}

/**
 * Ruido nítido y realista de "clic-clac" metálico de la cerradura desbloqueándose:
 * 1. Impacto agudo de la llave enganchando el mecanismo interno.
 * 2. Transitorio de fricción metálica.
 * 3. Salto contundente del pasador/resorte (el "clac" mecánico característico).
 * 4. Resonancia grave de la caja del mueble.
 */
function playLockMechanicalClickSFX() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        const now = ctx.currentTime;

        // 1. Diente de la llave enganchando el cerrojo (impacto agudo nítido)
        const oscTooth = ctx.createOscillator();
        const gainTooth = ctx.createGain();
        oscTooth.type = 'triangle';
        oscTooth.frequency.setValueAtTime(2600, now);
        oscTooth.frequency.exponentialRampToValueAtTime(850, now + 0.018);
        gainTooth.gain.setValueAtTime(0.28, now);
        gainTooth.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
        oscTooth.connect(gainTooth);
        gainTooth.connect(ctx.destination);
        oscTooth.start(now);
        oscTooth.stop(now + 0.025);

        // 2. Ruido blanco filtrado transitorio (textura metálica del mecanismo)
        const bufferLen = Math.floor(ctx.sampleRate * 0.035);
        const noiseBuf = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufferLen; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.007));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuf;
        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.frequency.setValueAtTime(2200, now);
        bpf.Q.value = 3.5;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.22, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        noise.connect(bpf);
        bpf.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);

        // 3. Salto del pestillo de resorte ("CLAC" metálico contundente 40ms después)
        const tClac = now + 0.040;
        const oscClac = ctx.createOscillator();
        const gainClac = ctx.createGain();
        oscClac.type = 'sine';
        oscClac.frequency.setValueAtTime(1100, tClac);
        oscClac.frequency.exponentialRampToValueAtTime(320, tClac + 0.055);
        gainClac.gain.setValueAtTime(0.35, tClac);
        gainClac.gain.exponentialRampToValueAtTime(0.001, tClac + 0.06);
        oscClac.connect(gainClac);
        gainClac.connect(ctx.destination);
        oscClac.start(tClac);
        oscClac.stop(tClac + 0.065);

        // 4. Resonancia metálica hueca del cajetín de la cerradura
        const oscBody = ctx.createOscillator();
        const gainBody = ctx.createGain();
        oscBody.type = 'triangle';
        oscBody.frequency.setValueAtTime(420, tClac);
        oscBody.frequency.exponentialRampToValueAtTime(160, tClac + 0.09);
        gainBody.gain.setValueAtTime(0.20, tClac);
        gainBody.gain.exponentialRampToValueAtTime(0.001, tClac + 0.09);
        oscBody.connect(gainBody);
        gainBody.connect(ctx.destination);
        oscBody.start(tClac);
        oscBody.stop(tClac + 0.095);
    } catch (_) {}
}

/**
 * Sonido de deslizamiento de la madera del cajón abriéndose suavemente.
 */
function playDrawerSlideSFX() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        const bufferSize = ctx.sampleRate * 0.75;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.15;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(260, ctx.currentTime + 0.75);
        filter.Q.value = 3.0;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
        noise.stop(ctx.currentTime + 0.8);
    } catch (_) {}
}

/**
 * Fanfarria musical de recompensa (arpegio brillante con armónicos cálidos).
 */
function playDiscoveryFanfareSFX() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const start = ctx.currentTime + idx * 0.10;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0.0, start);
            gain.gain.linearRampToValueAtTime(0.20, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + (idx === 3 ? 0.9 : 0.45));

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + (idx === 3 ? 0.95 : 0.5));
        });
    } catch (_) {}
}

/**
 * Fanfarria triunfal orquestada de objeto obtenido (estilo clásico RPG / Aventura).
 * Se dispara inmediatamente cuando el jugador pulsa Continuar / recoger el objeto.
 * Combina un arpegio ascendente brillante, acorde polifónico triunfal y campana brillante.
 */
function playItemCollectedFanfareSFX() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;

        // 1. Arpegio heroico ascendente (Do5, Mi5, Sol5, Do6, Mi6, Sol6)
        const arpeggio = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
        arpeggio.forEach((freq, idx) => {
            const start = now + idx * 0.085;
            const osc = ctx.createOscillator();
            const subOsc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);

            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(freq * 0.5, start);

            gain.gain.setValueAtTime(0.0, start);
            gain.gain.linearRampToValueAtTime(0.38, start + 0.02);
            const isTop = idx === arpeggio.length - 1;
            gain.gain.exponentialRampToValueAtTime(0.001, start + (isTop ? 1.4 : 0.38));

            osc.connect(gain);
            subOsc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(start);
            subOsc.start(start);
            osc.stop(start + (isTop ? 1.45 : 0.42));
            subOsc.stop(start + (isTop ? 1.45 : 0.42));
        });

        // 2. Acorde triunfal sostenido y resonante al culminar el arpegio (+0.42s)
        const chordStart = now + 0.42;
        const chordNotes = [523.25, 659.25, 783.99, 1046.50];
        chordNotes.forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, chordStart);

            gain.gain.setValueAtTime(0.0, chordStart);
            gain.gain.linearRampToValueAtTime(0.25, chordStart + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, chordStart + 1.35);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(chordStart);
            osc.stop(chordStart + 1.4);
        });

        // 3. Campana cristalina brillante sobre el acorde
        const bell = ctx.createOscillator();
        const bellGain = ctx.createGain();
        bell.type = 'sine';
        bell.frequency.setValueAtTime(2093.0, chordStart); // C7
        bellGain.gain.setValueAtTime(0.0, chordStart);
        bellGain.gain.linearRampToValueAtTime(0.28, chordStart + 0.02);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, chordStart + 1.25);
        bell.connect(bellGain);
        bellGain.connect(ctx.destination);
        bell.start(chordStart);
        bell.stop(chordStart + 1.3);
    } catch (_) {}
}

/**
 * Ding cristalino de impacto y absorción al entrar la caja en el icono del Registro.
 */
function playRegistryAbsorbChimeSFX() {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const bell1 = ctx.createOscillator();
        const bell2 = ctx.createOscillator();
        const gain = ctx.createGain();

        bell1.type = 'sine';
        bell1.frequency.setValueAtTime(2093.0, now); // C7
        bell2.type = 'sine';
        bell2.frequency.setValueAtTime(2637.02, now); // E7

        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);

        bell1.connect(gain);
        bell2.connect(gain);
        gain.connect(ctx.destination);

        bell1.start(now);
        bell2.start(now);
        bell1.stop(now + 1.2);
        bell2.stop(now + 1.2);
    } catch (_) {}
}

/**
 * Calcula la posición 3D en el espacio mundial frente a la cámara
 * que se alinea exactamente con el botón del Registro en la pantalla.
 */
function getRegistryButtonWorldPos(cam) {
    const btn = document.getElementById('registryButton');
    let screenX = 0;
    let screenY = -0.84;
    if (btn) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height * 0.45;
            screenX = (cx / window.innerWidth) * 2 - 1;
            screenY = -(cy / window.innerHeight) * 2 + 1;
        }
    }
    const ndcVec = new THREE.Vector3(screenX, screenY, 0.5);
    ndcVec.unproject(cam);
    const dir = ndcVec.sub(cam.position).normalize();
    return cam.position.clone().addScaledVector(dir, 0.72);
}

/**
 * Crea una estela de partículas doradas chispeantes que sigue a la caja durante su vuelo.
 */
function createBoxSparkleTrail() {
    const group = new THREE.Group();
    group.name = 'boxSparkleTrail';
    const count = 20;
    const particles = [];
    const geom = new THREE.SphereGeometry(0.016, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffe270,
        transparent: true,
        opacity: 0.95
    });

    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geom, mat.clone());
        mesh.visible = false;
        group.add(mesh);
        particles.push({
            mesh,
            life: 0,
            maxLife: 0.35 + Math.random() * 0.25,
            pos: new THREE.Vector3(),
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 0.35,
                (Math.random() - 0.5) * 0.35,
                (Math.random() - 0.5) * 0.35
            )
        });
    }

    let emitIdx = 0;

    function update(boxPos, dt) {
        for (let k = 0; k < 2; k++) {
            const p = particles[emitIdx];
            emitIdx = (emitIdx + 1) % count;
            p.life = p.maxLife;
            p.mesh.visible = true;
            p.pos.copy(boxPos).add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.08,
                (Math.random() - 0.5) * 0.08,
                (Math.random() - 0.5) * 0.08
            ));
            p.mesh.position.copy(p.pos);
        }

        particles.forEach(p => {
            if (p.life > 0) {
                p.life -= dt;
                p.pos.addScaledVector(p.vel, dt);
                p.mesh.position.copy(p.pos);
                const progress = Math.max(0, p.life / p.maxLife);
                p.mesh.scale.setScalar(progress);
                p.mesh.material.opacity = progress * 0.9;
                if (p.life <= 0) {
                    p.mesh.visible = false;
                }
            }
        });
    }

    function burstAndDispose(burstPos) {
        particles.forEach(p => {
            p.life = 0.32;
            p.maxLife = 0.32;
            p.pos.copy(burstPos);
            p.vel.set(
                (Math.random() - 0.5) * 0.9,
                (Math.random() - 0.5) * 0.9,
                (Math.random() - 0.5) * 0.9
            );
            p.mesh.visible = true;
        });
        setTimeout(() => {
            if (group.parent) group.parent.remove(group);
            geom.dispose();
            mat.dispose();
            particles.forEach(p => p.mesh.material.dispose());
        }, 360);
    }

    return { group, update, burstAndDispose };
}

// =========================================================================
// CURVAS DE INTERPOLACIÓN CINEMATOGRÁFICA
// =========================================================================

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
}

/**
 * Crea la llave dorada que el robot sostiene en su mano derecha.
 */
function createHeldKey() {
    const keyGroup = new THREE.Group();
    keyGroup.name = 'cinematicHeldKey';

    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.28,
        metalness: 0.88
    });

    const ringGeom = new THREE.TorusGeometry(0.022, 0.005, 12, 24);
    const ringMesh = new THREE.Mesh(ringGeom, goldMat);
    ringMesh.position.set(0, 0, -0.05);
    ringMesh.castShadow = true;
    keyGroup.add(ringMesh);

    const shaftGeom = new THREE.CylinderGeometry(0.004, 0.004, 0.05, 12);
    shaftGeom.rotateX(Math.PI / 2);
    const shaftMesh = new THREE.Mesh(shaftGeom, goldMat);
    shaftMesh.position.set(0, 0, -0.025);
    shaftMesh.castShadow = true;
    keyGroup.add(shaftMesh);

    const bitGeom = new THREE.BoxGeometry(0.005, 0.014, 0.010);
    const bitMesh = new THREE.Mesh(bitGeom, goldMat);
    bitMesh.position.set(0, -0.01, -0.008);
    bitMesh.castShadow = true;
    keyGroup.add(bitMesh);

    function dispose() {
        ringGeom.dispose();
        shaftGeom.dispose();
        bitGeom.dispose();
        goldMat.dispose();
        if (keyGroup.parent) {
            keyGroup.parent.remove(keyGroup);
        }
    }

    return { keyGroup, dispose };
}

// =========================================================================
// ESTADO Y REPRODUCCIÓN DE LA CINEMÁTICA
// =========================================================================

let isCinematicActive = false;

export function isMuebleCinematicRunning() {
    return isCinematicActive;
}

export function isMuebleCinematicActive() {
    return isCinematicActive;
}

/**
 * Ejecuta la cinemática de apertura del mueble (Opción A):
 * - El jugador NO desaparece en ningún momento.
 * - Camina de forma natural hasta situarse frente al cajón con su animación de marcha.
 * - La cámara viaja simultáneamente a una vista por encima de su hombro derecho (Over-The-Shoulder).
 * - Su propio brazo real (huesos del modelo 3D RobotAnimado) se alza llevando la llave a la cerradura.
 * - La llave se introduce y gira 90°, disparando el sonido de "clic-clac" metálico de la cerradura.
 * - El brazo regresa a su costado, el cajón se desliza abriéndose y la caja levita con aura dorada.
 * - Aparece el diálogo interactivo con 'E' / toque.
 * - Al terminar, la cámara regresa suavemente a tercera persona y el jugador continúa de pie sin cortes.
 */
export function playMuebleOpeningCinematic(onFinished = null) {
    if (isCinematicActive) return;

    const mueble = getMuebleObject();
    const drawerData = getMuebleDrawer();
    const player = runtimeState.player;

    if (!mueble || !drawerData || !player) {
        console.warn('Mueble, cajón o jugador no disponible para cinemática');
        if (onFinished) onFinished();
        return;
    }

    isCinematicActive = true;
    lockInput('muebleCinematic');

    // Ocultar controles táctiles durante la cinemática
    hideMobileInteractionButton();
    const joystickElem = document.getElementById('mobileJoystick');
    if (joystickElem) joystickElem.style.display = 'none';

    // El jugador PERMANECE 100% VISIBLE
    player.visible = true;

    // Calcular cotas y marco de referencia dinámico respecto a la cómoda actual
    const muebleTransform = getEntityTransform('furniture', 'mueble') || {};
    const muebleX = Number.isFinite(mueble?.position?.x)
        ? mueble.position.x
        : (typeof muebleTransform.x === 'number' ? muebleTransform.x : 14.77);
    const muebleZ = Number.isFinite(mueble?.position?.z)
        ? mueble.position.z
        : (typeof muebleTransform.z === 'number' ? muebleTransform.z : 23.26);
    const muebleRotY = Number.isFinite(mueble?.rotation?.y)
        ? mueble.rotation.y
        : (typeof muebleTransform.rotationY === 'number' ? muebleTransform.rotationY : Math.PI);
    const liveLogicalScale = mueble?.userData?.logicalScale;
    const cfgScaleXYZ = muebleTransform.scaleXYZ;
    const fallbackUniform = (typeof muebleTransform.scale === 'number' && muebleTransform.scale > 0) ? muebleTransform.scale : 1.0;
    const scaleX = (liveLogicalScale && liveLogicalScale.x > 0) ? liveLogicalScale.x : (cfgScaleXYZ?.x > 0 ? cfgScaleXYZ.x : fallbackUniform);
    const scaleY = (liveLogicalScale && liveLogicalScale.y > 0) ? liveLogicalScale.y : (cfgScaleXYZ?.y > 0 ? cfgScaleXYZ.y : fallbackUniform);
    const scaleZ = (liveLogicalScale && liveLogicalScale.z > 0) ? liveLogicalScale.z : (cfgScaleXYZ?.z > 0 ? cfgScaleXYZ.z : fallbackUniform);

    const deltaRotY = muebleRotY - Math.PI;
    const cosM = Math.cos(deltaRotY);
    const sinM = Math.sin(deltaRotY);
    const baseGroundY = getHeightAt(muebleX, muebleZ);
    const muebleBaseBottomY = Number.isFinite(drawerData?.baseY)
        ? (drawerData.baseY - 0.63 * scaleY)
        : baseGroundY;

    function getWalkableSurfaceY(wx, wz) {
        const gh = getHeightAt(wx, wz);
        const bh = getBridgeHeight(wx, wz, gh);
        return bh !== null ? Math.max(gh, bh) : gh;
    }

    function localOffsetToWorld(lx, lyOffset, lz, useTerrainGround = false) {
        const sx = lx * scaleX;
        const sz = lz * scaleZ;
        const wx = muebleX + sx * cosM + sz * sinM;
        const wz = muebleZ - sx * sinM + sz * cosM;
        const wy = useTerrainGround ? getWalkableSurfaceY(wx, wz) : (muebleBaseBottomY + lyOffset * scaleY);
        return new THREE.Vector3(wx, wy, wz);
    }

    function worldToLocalOffset(worldPos) {
        const dx = worldPos.x - muebleX;
        const dz = worldPos.z - muebleZ;
        const invX = 1 / Math.max(0.05, scaleX);
        const invZ = 1 / Math.max(0.05, scaleZ);
        return {
            x: (dx * cosM - dz * sinM) * invX,
            z: (dx * sinM + dz * cosM) * invZ
        };
    }

    function localApproachToWorld(lx, lz) {
        const appScaleX = Math.max(0.85, scaleX);
        const appScaleZ = Math.max(0.85, scaleZ);
        const sx = lx * appScaleX;
        const sz = lz * appScaleZ;
        const wx = muebleX + sx * cosM + sz * sinM;
        const wz = muebleZ - sx * sinM + sz * cosM;
        const wy = getWalkableSurfaceY(wx, wz);
        return new THREE.Vector3(wx, wy, wz);
    }

    // Posición inicial del jugador y rotación
    const startPlayerPos = player.position.clone();
    const startPlayerRotY = player.rotation.y;

    // Posición exacta del cerrojo/bocallave en el frontal del mueble
    const lockTarget = localOffsetToWorld(-0.42, 0.65, -0.42, false);

    // Posición final del robot frente a la cómoda (con despeje mínimo garantizado incluso en escalas pequeñas)
    const targetPlayerPos = localApproachToWorld(-0.02, -1.61);
    const targetPlayerRotY = Math.atan2(lockTarget.x - targetPlayerPos.x, lockTarget.z - targetPlayerPos.z);

    // Posiciones cinematográficas de la cámara (Opción B):
    const camCloseUpPos = localOffsetToWorld(-0.27, 0.72, -0.84, false);
    const camCloseUpLook = lockTarget.clone();

    const camRevealPos = localOffsetToWorld(-1.22, 1.28, -1.86, false);
    const camRevealLook = localOffsetToWorld(-0.42, 0.68, -0.51, false);

    const camStartPos = camera.position.clone();
    const camStartLook = new THREE.Vector3(player.position.x, player.position.y + 1.3, player.position.z);

    // Waypoint de seguridad para el traveling continuo de la cámara si estaba detrás del mueble
    const camLocalStart = worldToLocalOffset(camStartPos);
    const isCameraBehindOrSide = camLocalStart.z > -0.51 || Math.abs(camLocalStart.x) > 1.4;
    let camMidPos = null;
    if (isCameraBehindOrSide) {
        camMidPos = camLocalStart.x <= 0
            ? localOffsetToWorld(-2.07, 1.55, -1.06, false)
            : localOffsetToWorld(1.83, 1.55, -1.06, false);
    }

    function evaluateInitialCamera(t) {
        let pos = new THREE.Vector3();
        if (camMidPos) {
            const p0 = camStartPos;
            const p1 = camMidPos;
            const p2 = camCloseUpPos;
            const u = 1 - t;
            pos.x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
            pos.y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
            pos.z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
        } else {
            pos.lerpVectors(camStartPos, camCloseUpPos, t);
        }

        const h = getWalkableSurfaceY(pos.x, pos.z);
        if (pos.y < h + 0.50) {
            pos.y = h + 0.50;
        }
        return pos;
    }

    // =========================================================================
    // RUTAS Y WAYPOINTS PERIMETRALES PARA NO ATRAVESAR EL MUEBLE
    // =========================================================================
    const pathPoints = [];
    pathPoints.push(startPlayerPos.clone());

    const startLocal = worldToLocalOffset(startPlayerPos);
    if (startLocal.z >= -0.56) {
        // El jugador interactúa desde detrás o un flanco del mueble:
        // Rodear el mueble por el lateral más próximo sin colisionar
        if (startLocal.x <= 0) {
            // Flanco izquierdo
            if (startLocal.z > 0.14) {
                pathPoints.push(localApproachToWorld(-1.57, startLocal.z));
            }
            pathPoints.push(localApproachToWorld(-1.62, 0));
            pathPoints.push(localApproachToWorld(-1.42, -1.61));
        } else {
            // Flanco derecho
            if (startLocal.z > 0.14) {
                pathPoints.push(localApproachToWorld(1.53, startLocal.z));
            }
            pathPoints.push(localApproachToWorld(1.58, 0));
            pathPoints.push(localApproachToWorld(1.28, -1.61));
        }
    }
    pathPoints.push(targetPlayerPos.clone());

    // Calcular longitud de tramos y distancia total
    const segDistances = [0];
    let totalPathDist = 0;
    for (let i = 1; i < pathPoints.length; i++) {
        const d = Math.hypot(pathPoints[i].x - pathPoints[i - 1].x, pathPoints[i].z - pathPoints[i - 1].z);
        totalPathDist += d;
        segDistances.push(totalPathDist);
    }

    // Duración adaptativa a velocidad de trote natural (~2.1 m/s)
    const walkDuration = Math.max(1.2, Math.min(2.8, totalPathDist / 2.1));

    function lerpShortestAngle(from, to, t) {
        let diff = (to - from) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        return from + diff * t;
    }

    function samplePath(u) {
        if (totalPathDist <= 0.01) {
            return {
                pos: targetPlayerPos.clone(),
                angle: targetPlayerRotY
            };
        }
        const targetDist = u * totalPathDist;
        let segIdx = 1;
        while (segIdx < segDistances.length - 1 && segDistances[segIdx] < targetDist) {
            segIdx++;
        }
        const d0 = segDistances[segIdx - 1];
        const d1 = segDistances[segIdx];
        const segLen = d1 - d0;
        const tSeg = segLen > 0.0001 ? (targetDist - d0) / segLen : 0;

        const p0 = pathPoints[segIdx - 1];
        const p1 = pathPoints[segIdx];

        const x = THREE.MathUtils.lerp(p0.x, p1.x, tSeg);
        const z = THREE.MathUtils.lerp(p0.z, p1.z, tSeg);
        const y = getWalkableSurfaceY(x, z);

        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        let segAngle = targetPlayerRotY;
        if (Math.hypot(dx, dz) > 0.001) {
            segAngle = Math.atan2(dx, dz);
        }

        let finalAngle = segAngle;
        if (u > 0.75) {
            const blendEnd = (u - 0.75) / 0.25;
            finalAngle = lerpShortestAngle(segAngle, targetPlayerRotY, blendEnd);
        } else if (u < 0.25) {
            const blendStart = u / 0.25;
            finalAngle = lerpShortestAngle(startPlayerRotY, segAngle, blendStart);
        }

        return {
            pos: new THREE.Vector3(x, y, z),
            angle: finalAngle
        };
    }

    // Instanciar la llave dorada
    const heldKeyData = createHeldKey();
    const heldKey = heldKeyData.keyGroup;
    const keyVisualScale = Math.max(0.65, Math.min(1.8, (scaleX + scaleY + scaleZ) / 3));
    heldKey.scale.setScalar(keyVisualScale);
    scene.add(heldKey);
    heldKey.visible = false;

    // Configuración inicial de partes del cajón: garantizar que la caja está limpia dentro del cajón y la llave invisible
    drawerData._cinematicOverride = true;
    drawerData.setDrawerProgress(0);
    drawerData.setKeyProgress(0, 0, false);
    drawerData.keyGroup.visible = false;
    if (typeof drawerData.resetBoxToDrawer === 'function') {
        drawerData.resetBoxToDrawer(true);
    } else {
        drawerData.boxGroup.visible = true;
    }
    drawerData.setBoxLift(0);

    // Activar animación nativa de marcha para la aproximación
    setPlayerAnimationOverride('robotarmature|robot_running');

    let elapsed = 0;
    let sfxKeyInsertPlayed = false;
    let sfxKeyTurnPlayed = false;
    let sfxDrawerSlidePlayed = false;
    let sfxFanfarePlayed = false;
    let rewardModalShown = false;

    // Tiempos relativos sincronizados para Opción B (Plano Detalle Close-Up AAA):
    // 1) Desplazamiento del jugador y traveling de cámara hacia el plano detalle
    const tArrival = Math.max(1.8, Math.max(walkDuration, 1.8));
    // 2) Pausa de enfoque macro nítido de la cerradura y frontal de madera
    const tCloseUpSettle = tArrival + 0.35;
    // 3) Entrada e inserción precisa de la llave dorada en el cerrojo
    const tInsert = tCloseUpSettle + 0.95;
    // 4) Giro mecánico de la llave 90° con "clic-clac"
    const tTurn = tInsert + 0.70;
    // 5) Traveling de retroceso abriendo el plano hacia la vista panorámica despejada
    const tReveal = tTurn + 0.95;
    // 6) Deslizamiento del cajón abriéndose (cámara ya fija y despejada en camRevealPos)
    const tSlide = tReveal + 1.1;
    // 7) Elevación y suspensión mágica de la caja
    const tBox = tSlide + 1.0;

    let isBoxFlying = false;
    let flightElapsed = 0;
    const flightDuration = 1.25;
    let flightStartPos = null;
    let boxSparkleGroup = null;

    function startBoxFlight() {
        if (isBoxFlying) return;
        isBoxFlying = true;
        flightElapsed = 0;
        scene.attach(drawerData.boxGroup);
        flightStartPos = drawerData.boxGroup.position.clone();
        boxSparkleGroup = createBoxSparkleTrail();
        scene.add(boxSparkleGroup.group);
    }

    const currentLookTarget = camStartLook.clone();

    // Loop de cinemática con anulación temporal de cámara
    setCameraCinematicOverride((delta, cam) => {
        elapsed += delta;

        // =====================================================================
        // FASE 1: DESPLAZAMIENTO DEL JUGADOR Y TRAVELING HACIA EL PLANO DETALLE
        // =====================================================================
        if (elapsed < tArrival) {
            // El jugador camina con soltura hasta su posición lateral despejada
            if (elapsed < walkDuration) {
                const walkT = Math.min(1.0, elapsed / walkDuration);
                const walkEased = easeInOutCubic(walkT);
                const sampled = samplePath(walkEased);
                player.position.copy(sampled.pos);
                player.rotation.y = sampled.angle;
            } else {
                player.position.copy(targetPlayerPos);
                player.rotation.y = targetPlayerRotY;
                setPlayerAnimationOverride('robotarmature|robot_idle');
            }

            // La cámara realiza un traveling orbital que transiciona hacia el plano detalle
            const camT = Math.min(1.0, elapsed / tArrival);
            const camEased = easeInOutCubic(camT);
            const targetCamPos = evaluateInitialCamera(camEased);
            cam.position.copy(targetCamPos);

            currentLookTarget.lerpVectors(camStartLook, camCloseUpLook, camEased);
            cam.lookAt(currentLookTarget);

            // Llaves ocultas durante el desplazamiento inicial
            heldKey.visible = false;
            drawerData.keyGroup.visible = false;
        }

        // =====================================================================
        // FASE 1.5: [tArrival - tCloseUpSettle] PLANO DETALLE NÍTIDO (CERRADURA VACÍA)
        // =====================================================================
        if (elapsed >= tArrival && elapsed < tCloseUpSettle) {
            player.position.copy(targetPlayerPos);
            player.rotation.y = targetPlayerRotY;
            setPlayerAnimationOverride('robotarmature|robot_idle');

            // Cámara macro completamente fija en el frontal de madera y la bocallave
            cam.position.copy(camCloseUpPos);
            cam.lookAt(camCloseUpLook);

            heldKey.visible = false;
            drawerData.keyGroup.visible = false;
        }

        // =====================================================================
        // FASE 2: [tCloseUpSettle - tInsert] ENTRADA E INSERCIÓN DE LA LLAVE DORADA
        // =====================================================================
        if (elapsed >= tCloseUpSettle && elapsed < tInsert) {
            player.position.copy(targetPlayerPos);
            player.rotation.y = targetPlayerRotY;
            setPlayerAnimationOverride('robotarmature|robot_idle');

            // Mantener plano detalle macro
            cam.position.copy(camCloseUpPos);
            cam.lookAt(camCloseUpLook);

            const insertT = (elapsed - tCloseUpSettle) / (tInsert - tCloseUpSettle);
            const easedInsert = easeInOutCubic(insertT);

            // La llave entra con elegancia en el encuadre macro y se introduce en la bocallave
            heldKey.visible = true;
            drawerData.keyGroup.visible = false;

            const keyEntryStart = localOffsetToWorld(-0.35, 0.69, -0.68, false);
            heldKey.position.lerpVectors(keyEntryStart, lockTarget, easedInsert);
            heldKey.rotation.set(0, deltaRotY, 0);

            // Clic metálico de inserción al encajar en el fondo de la cerradura
            if (insertT >= 0.88 && !sfxKeyInsertPlayed) {
                playKeyInsertSFX();
                sfxKeyInsertPlayed = true;
            }
        }

        // =====================================================================
        // FASE 3: [tInsert - tTurn] GIRO MECÁNICO 90° Y CLIC ("CLIC-CLAC")
        // =====================================================================
        if (elapsed >= tInsert && elapsed < tTurn) {
            player.position.copy(targetPlayerPos);
            player.rotation.y = targetPlayerRotY;
            setPlayerAnimationOverride('robotarmature|robot_idle');

            cam.position.copy(camCloseUpPos);
            cam.lookAt(camCloseUpLook);

            const turnT = (elapsed - tInsert) / (tTurn - tInsert);
            const easedTurn = easeInOutCubic(turnT);

            heldKey.visible = true;
            drawerData.keyGroup.visible = false;
            heldKey.position.copy(lockTarget);

            // Giro limpio de 90° en el eje longitudinal de la cerradura
            heldKey.rotation.set(0, deltaRotY, (Math.PI / 2) * easedTurn);

            // Auténtico sonido de desbloqueo mecánico ("clic-clac")
            if (turnT >= 0.45 && !sfxKeyTurnPlayed) {
                playLockMechanicalClickSFX();
                sfxKeyTurnPlayed = true;
            }
        }

        // =====================================================================
        // FASE 4: [tTurn - tReveal] TRAVELING DE RETROCESO HACIA PLANO AMPLIO PANORÁMICO
        // =====================================================================
        if (elapsed >= tTurn && elapsed < tReveal) {
            player.position.copy(targetPlayerPos);
            player.rotation.y = targetPlayerRotY;
            setPlayerAnimationOverride('robotarmature|robot_idle');

            // Transferir la llave permanentemente a la cerradura del mueble
            heldKey.visible = false;
            drawerData.keyGroup.visible = true;
            drawerData.setKeyProgress(1.0, 1.0, true);

            const revealT = (elapsed - tTurn) / (tReveal - tTurn);
            const easedReveal = easeInOutCubic(revealT);

            // La cámara retrocede suavemente abriendo el plano:
            // Revela la cómoda en el centro y al robot en el lateral derecho contemplándola sin tapar nada
            cam.position.lerpVectors(camCloseUpPos, camRevealPos, easedReveal);
            currentLookTarget.lerpVectors(camCloseUpLook, camRevealLook, easedReveal);
            cam.lookAt(currentLookTarget);
        }

        // =====================================================================
        // FASE 5: [tReveal - tSlide] DESLIZAMIENTO DEL CAJÓN ABRIÉNDOSE (100% DESPEJADO)
        // =====================================================================
        if (elapsed >= tReveal && elapsed < tSlide) {
            player.position.copy(targetPlayerPos);
            player.rotation.y = targetPlayerRotY;
            setPlayerAnimationOverride('robotarmature|robot_idle');

            drawerData.keyGroup.visible = true;
            drawerData.setKeyProgress(1.0, 1.0, true);

            if (!sfxDrawerSlidePlayed) {
                playDrawerSlideSFX();
                sfxDrawerSlidePlayed = true;
            }

            const drawerT = (elapsed - tReveal) / (tSlide - tReveal);
            drawerData.setDrawerProgress(easeInOutCubic(drawerT));

            // Cámara fija en la vista panorámica amplia
            cam.position.copy(camRevealPos);
            cam.lookAt(camRevealLook);
        }

        // =====================================================================
        // FASE 6: [tSlide EN ADELANTE] ELEVACIÓN Y FANFARRIA DE LA CAJA DE CARTÓN
        // =====================================================================
        if (elapsed >= tSlide && !isBoxFlying) {
            player.position.copy(targetPlayerPos);
            player.rotation.y = targetPlayerRotY;
            setPlayerAnimationOverride('robotarmature|robot_idle');

            drawerData.setDrawerProgress(1.0);
            drawerData.setKeyProgress(1.0, 1.0);

            if (!sfxFanfarePlayed) {
                playDiscoveryFanfareSFX();
                sfxFanfarePlayed = true;
            }

            const liftT = Math.min(1.0, (elapsed - tSlide) / 0.9);
            const gentleBob = Math.sin(elapsed * 4.0) * 0.015;
            drawerData.setBoxLift(easeOutQuad(liftT) + (liftT >= 1.0 ? gentleBob : 0));

            cam.position.copy(camRevealPos);
            cam.lookAt(camRevealLook);
        }

        // =====================================================================
        // VUELO DE LA CAJA HACIA EL BOTÓN DEL REGISTRO (OPCIÓN 2)
        // =====================================================================
        if (isBoxFlying) {
            player.position.copy(targetPlayerPos);
            player.rotation.y = targetPlayerRotY;
            setPlayerAnimationOverride('robotarmature|robot_idle');

            flightElapsed += delta;
            const u = Math.min(1.0, flightElapsed / flightDuration);
            const easedU = easeInOutCubic(u);

            const targetWorldPos = getRegistryButtonWorldPos(cam);

            const invU = 1 - easedU;
            const arcApexY = Math.max(flightStartPos.y, targetWorldPos.y) + 0.45;
            const midX = flightStartPos.x * 0.45 + targetWorldPos.x * 0.55;
            const midZ = flightStartPos.z * 0.45 + targetWorldPos.z * 0.55;

            drawerData.boxGroup.position.x = invU * invU * flightStartPos.x + 2 * invU * easedU * midX + easedU * easedU * targetWorldPos.x;
            drawerData.boxGroup.position.y = invU * invU * flightStartPos.y + 2 * invU * easedU * arcApexY + easedU * easedU * targetWorldPos.y;
            drawerData.boxGroup.position.z = invU * invU * flightStartPos.z + 2 * invU * easedU * midZ + easedU * easedU * targetWorldPos.z;

            // Contracción de escala y giro tridimensional elegante
            const scale = THREE.MathUtils.lerp(1.0, 0.10, easedU);
            drawerData.boxGroup.scale.set(scale, scale, scale);
            drawerData.boxGroup.rotation.y += delta * 7.5;
            drawerData.boxGroup.rotation.x += delta * 4.2;

            if (boxSparkleGroup) {
                boxSparkleGroup.update(drawerData.boxGroup.position, delta);
            }

            cam.position.copy(camRevealPos);
            cam.lookAt(camRevealLook);

            if (u >= 1.0) {
                isBoxFlying = false;
                drawerData.hideBox();
                if (boxSparkleGroup) {
                    boxSparkleGroup.burstAndDispose(targetWorldPos);
                    boxSparkleGroup = null;
                }

                // Destello dorado de impacto en el botón del Registro
                triggerRegistryIntakeEffect();

                // Ding cristalino de absorción exitosa en el Registro
                playRegistryAbsorbChimeSFX();

                finishCinematic();
                return;
            }
        }

        // =====================================================================
        // FASE 7: [tBox] MOSTRAR MODAL INTERACTIVO DE RECOMPENSA
        // =====================================================================
        if (elapsed >= tBox && !rewardModalShown && !isBoxFlying) {
            rewardModalShown = true;
            showRewardOverlay(() => {
                startBoxFlight();
            });
        }
    });

    /**
     * Finalización de la cinemática tras recoger la recompensa:
     * - Oculta la caja de cartón recogida.
     * - Actualiza misiones, diario e inventario.
     * - Restaura la rotación orbital y distancia natural de la cámara.
     * - Desbloquea los controles con el jugador en pie frente a la cómoda.
     */
    function finishCinematic() {
        heldKeyData.dispose();
        drawerData.hideBox();
        drawerData._cinematicOverride = false;

        // Restaurar estado base de animaciones del jugador
        setPlayerAnimationOverride(null);

        // Actualizar datos de inventario y estado del juego
        removeInventoryItem('furnitureKey');
        addInventoryItem('badgeBox');
        gameState.flags.openedMueble = true;
        gameState.flags.drawerOpened = true;
        completeObjective('findBadgeBox');
        updateDiaryContent();
        syncMuebleDrawerTransform();
        rebuildSpatialGrid(collidables);
        saveGame();

        // Transición suave de retorno de la cámara al modo normal de juego
        let returnElapsed = 0;
        const returnDuration = 0.85;
        const returnStartPos = camera.position.clone();
        const returnStartLook = camRevealLook.clone();

        const p = (player && Number.isFinite(player.position.x))
            ? player.position
            : targetPlayerPos;
        const returnEndLook = new THREE.Vector3(p.x, p.y + 1.4, p.z);

        // Cámara de tercera persona por detrás del jugador mirando hacia la cómoda con cota segura
        const defaultCamDistance = 4.2;
        const returnEndPos = new THREE.Vector3(
            p.x - defaultCamDistance * sinM,
            p.y + 1.7,
            p.z - defaultCamDistance * cosM
        );
        const endSurfaceH = getWalkableSurfaceY(returnEndPos.x, returnEndPos.z);
        const endWaterH = getWaterSurfaceLevel(returnEndPos.x, returnEndPos.z);
        const minEndY = Math.max(endSurfaceH + 1.2, (endWaterH !== null ? endWaterH : LAKE_WATER_Y) + 0.8);
        if (returnEndPos.y < minEndY) {
            returnEndPos.y = minEndY;
        }

        setCameraCinematicOverride((retDelta, retCam) => {
            returnElapsed += retDelta;
            const t = Math.min(1.0, returnElapsed / returnDuration);
            const eased = easeInOutCubic(t);

            retCam.position.lerpVectors(returnStartPos, returnEndPos, eased);
            const retSurfaceH = getWalkableSurfaceY(retCam.position.x, retCam.position.z);
            const retWaterH = getWaterSurfaceLevel(retCam.position.x, retCam.position.z);
            const minRetY = Math.max(retSurfaceH + 0.8, (retWaterH !== null ? retWaterH : LAKE_WATER_Y) + 0.6);
            if (retCam.position.y < minRetY) {
                retCam.position.y = minRetY;
            }
            const currentLook = new THREE.Vector3().lerpVectors(returnStartLook, returnEndLook, eased);
            retCam.lookAt(currentLook);

            if (t >= 1.0) {
                // Sincronizar parámetros habituales de playerCamera sin saltos ni NaN
                snapCameraOrbitTo(retCam.position, returnEndLook);
                clearCameraCinematicOverride();
                unlockInput('muebleCinematic');
                isCinematicActive = false;

                // Restaurar joystick táctil si estaba oculto
                const stick = document.getElementById('mobileJoystick');
                if (stick) stick.style.display = '';

                if (onFinished) {
                    onFinished();
                }
            }
        });
    }
}

// =========================================================================
// MODAL DE RECOMPENSA EN PANTALLA
// =========================================================================

function showRewardOverlay(onClose) {
    const existing = document.getElementById('muebleRewardModal');
    if (existing) existing.remove();

    const isMobile = isMobileDevice();

    const overlay = document.createElement('div');
    overlay.id = 'muebleRewardModal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'flex-end';
    overlay.style.justifyContent = 'center';
    overlay.style.paddingBottom = isMobile ? '24px' : '50px';
    overlay.style.zIndex = '99999';
    overlay.style.pointerEvents = 'auto';
    overlay.style.animation = 'muebleFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards';

    const continueLabel = isMobile ? 'Toca para continuar' : 'Continuar (E)';

    overlay.innerHTML = `
        <style>
            @keyframes muebleFadeIn {
                from { opacity: 0; transform: translateY(18px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .rewardContainer {
                background: linear-gradient(145deg, rgba(26, 21, 16, 0.96), rgba(16, 12, 8, 0.98));
                border: 2px solid rgba(230, 185, 95, 0.7);
                border-radius: 18px;
                padding: 20px 28px;
                max-width: 520px;
                width: 90%;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(212, 163, 89, 0.3);
                display: flex;
                align-items: center;
                gap: 18px;
                color: #f7ede2;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                backdrop-filter: blur(8px);
                cursor: pointer;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
                transition: transform 0.15s ease, border-color 0.15s ease;
            }
            .rewardContainer:active {
                transform: scale(0.99);
                border-color: rgba(255, 215, 120, 0.9);
            }
            .rewardIconBox {
                width: 64px;
                height: 64px;
                border-radius: 14px;
                background: radial-gradient(circle, rgba(230, 185, 95, 0.25) 0%, rgba(30, 20, 10, 0.6) 100%);
                border: 1px solid rgba(230, 185, 95, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .rewardIconBox img {
                width: 44px;
                height: 44px;
                object-fit: contain;
                filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
            }
            .rewardContent {
                flex: 1;
            }
            .rewardBadge {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: #ffca28;
                margin-bottom: 4px;
            }
            .rewardTitle {
                font-size: 18px;
                font-weight: 800;
                color: #ffffff;
                margin: 0 0 6px 0;
            }
            .rewardNotice {
                font-size: 12.5px;
                line-height: 1.4;
                color: #c7b89d;
                margin: 0;
            }
            .rewardBtn {
                margin-top: 10px;
                align-self: flex-start;
                background: linear-gradient(135deg, #d4a359 0%, #a4732b 100%);
                color: #1a1205;
                font-weight: 700;
                font-size: 13px;
                padding: 8px 20px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: transform 0.15s ease, filter 0.15s ease;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            .rewardBtn:hover {
                filter: brightness(1.15);
                transform: scale(1.02);
            }
            .rewardBtn:active {
                transform: scale(0.98);
            }
            @media (max-width: 600px) {
                .rewardContainer {
                    padding: 16px 18px;
                    gap: 14px;
                    width: 94%;
                }
                .rewardIconBox {
                    width: 52px;
                    height: 52px;
                }
                .rewardIconBox img {
                    width: 36px;
                    height: 36px;
                }
                .rewardTitle {
                    font-size: 16px;
                }
                .rewardNotice {
                    font-size: 11.5px;
                }
                .rewardBtn {
                    padding: 8px 16px;
                    font-size: 12.5px;
                }
            }
        </style>
        <div id="rewardContainer" class="rewardContainer">
            <div class="rewardIconBox">
                <img src="assets/registry/inventory/badgeBox.svg" alt="Caja de cartón">
            </div>
            <div class="rewardContent">
                <div class="rewardBadge">Objeto Obtenido</div>
                <h3 class="rewardTitle">Caja de cartón</h3>
                <p class="rewardNotice">
                    La llave ha quedado puesta en la cerradura del mueble. Pulsa Continuar para recoger la caja y guardarla en tu Registro.
                </p>
                <button id="rewardConfirmBtn" class="rewardBtn" type="button">${continueLabel}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    let isClosed = false;

    function handleConfirm() {
        if (isClosed) return;
        isClosed = true;

        // Reanudar contexto de audio bajo el gesto de usuario y reproducir fanfarria triunfal
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        playItemCollectedFanfareSFX();

        window.removeEventListener('keydown', handleKey);
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
        if (onClose) onClose();
    }

    function handleKey(e) {
        if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            e.stopPropagation();
            handleConfirm();
        }
    }

    const btn = document.getElementById('rewardConfirmBtn');
    const container = document.getElementById('rewardContainer');

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleConfirm();
        });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleConfirm();
        });
    }

    if (container) {
        container.addEventListener('click', () => {
            handleConfirm();
        });
        container.addEventListener('touchend', (e) => {
            e.preventDefault();
            handleConfirm();
        });
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleConfirm();
    });
    overlay.addEventListener('touchend', (e) => {
        if (e.target === overlay) {
            e.preventDefault();
            handleConfirm();
        }
    });

    window.addEventListener('keydown', handleKey);
}
