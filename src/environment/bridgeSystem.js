import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { cameraObstacles, addCollidable } from '../entities/collisions.js';
import { createPolygonalStoneTexture } from './stoneTextureGenerator.js';
import { createPolygonalStoneGeometry } from './polygonalStoneGeometry.js';
import {
    getRiverInfo,
    riverSpline,
    riverOutflowSpline,
    river3Spline
} from '../terrain/riverPath.js';
import { registerWaterMaterial } from './waterSystem.js';

// =========================================================================
// DEFINICIÓN Y REGISTRO DE PUENTES
// =========================================================================

// Configuración geométrica del Puente 1 (Río 3, cerca de x: -116.33, z: 4.18)
// Conecta la orilla Oeste (A: pradera llana) con la orilla Este (B: pradera llana)
// cruzando limpiamente sobre el desfiladero y el cauce del río.
const BRIDGE_1_CONFIG = {
    id: 'bridge_river3_1',
    // Coordenadas fijas de las dos orillas opuestas (Río 3)
    startX: -140.59,
    startZ: -7.10,
    endX: -117.92,
    endZ: 3.44,
    width: 3.6,        // Ancho total de la calzada (metros)
    railHeight: 1.15,   // Altura de la barandilla sobre el tablero
    archHeight: 0.65    // Elevación máxima del arco en el centro
};

const BRIDGE_2_CONFIG = {
    id: 'bridge_river2_1',
    // Orilla oeste en x: 138, z: -115 cruzando perpendicularmente a la orilla contraria de Río 2
    startX: 138.0,
    startZ: -115.0,
    endX: 162.0,
    endZ: -119.46,
    width: 3.6,        // Mismo ancho de calzada
    railHeight: 1.15,   // Misma altura de barandilla
    archHeight: 0.65,   // Misma elevación de arco
    pierFractions: [0.26, 0.74]
};

const BRIDGE_3_CONFIG = {
    id: 'bridge_river1_1',
    // Orilla sureste en x: 206.0, z: 180.0 cruzando perpendicularmente Río 1 (afluente) a la orilla noroeste opuesta
    startX: 206.0,
    startZ: 180.0,
    endX: 196.0,
    endZ: 187.84,
    width: 3.6,        // Mismo ancho de calzada
    railHeight: 1.15,   // Misma altura de barandilla
    archHeight: 0.55,   // Arco proporcionado al vano de ~12.7m
    pierFractions: [0.35] // Pilar central asentado en el lecho del río
};

const BRIDGE_4_CONFIG = {
    id: 'bridge_river2_2',
    // Puente en Río 2 situado a la altura de x: 163, z: 45
    // Conecta la orilla oeste (x: 148.80, z: 28.70) con la orilla este (x: 167.40, z: 50.30)
    startX: 148.80,
    startZ: 28.70,
    endX: 167.40,
    endZ: 50.30,
    width: 3.6,        // Mismo ancho de calzada
    railHeight: 1.15,   // Misma altura de barandilla
    archHeight: 0.65,   // Elevación de arco proporcionada al vano de 28.5m
    pierFractions: [0.26, 0.74] // Dos pilares contrafuertes anclados en las laderas del cauce
};

const BRIDGE_5_CONFIG = {
    id: 'bridge_river3_2',
    // Puente en Río 3 en las coordenadas x: -35.0, z: 87.0
    // Conecta la orilla sureste (x: -35.0, z: 87.0) con la orilla noroeste (x: -42.80, z: 111.30)
    startX: -35.0,
    startZ: 87.0,
    endX: -42.80,
    endZ: 111.30,
    width: 3.6,        // Mismo ancho de calzada
    railHeight: 1.15,   // Misma altura de barandilla
    archHeight: 0.65,   // Elevación de arco proporcionada al vano de 25.5m
    pierFractions: [0.28, 0.72] // Dos pilares contrafuertes anclados en el cauce y laderas
};

// Objeto de cálculo preprocesado para evitar cálculos repetitivos en cada frame
class BridgeInstance {
    constructor(cfg) {
        this.id = cfg.id;
        this.startX = cfg.startX;
        this.startZ = cfg.startZ;
        this.endX = cfg.endX;
        this.endZ = cfg.endZ;
        this.width = cfg.width;
        this.halfWidth = cfg.width * 0.5;
        this.railHeight = cfg.railHeight;
        this.archHeight = cfg.archHeight;
        this.pierFractions = cfg.pierFractions || [0.26, 0.74];

        // Altura real del terreno en las dos orillas calculada proceduralmente
        this.startY = getHeightAt(this.startX, this.startZ);
        this.endY = getHeightAt(this.endX, this.endZ);

        // Vector longitudinal (a lo largo del puente)
        const dx = this.endX - this.startX;
        const dz = this.endZ - this.startZ;
        this.length = Math.hypot(dx, dz);
        this.dirX = dx / this.length;
        this.dirZ = dz / this.length;

        // Vector transversal perpendicular a la calzada
        this.normalX = -this.dirZ;
        this.normalZ = this.dirX;

        // Ángulo de rotación sobre el eje Y para alinear mallas
        this.rotationY = Math.atan2(this.dirX, this.dirZ);
    }

    // Proyección de una coordenada mundial (px, pz) en el sistema local del puente:
    // s = avance longitudinal (0 = orilla Oeste, length = orilla Este)
    // d = desviación lateral transversal desde el eje central (distancia absoluta o con signo)
    project(px, pz) {
        const vx = px - this.startX;
        const vz = pz - this.startZ;
        const s = vx * this.dirX + vz * this.dirZ;
        const d = vx * this.normalX + vz * this.normalZ;
        return { s, d };
    }

    // Altura del tablero en la coordenada longitudinal s
    getDeckHeightAtS(s) {
        // En los accesos exteriores, empatar con la orilla correspondiente
        if (s <= 0) return this.startY;
        if (s >= this.length) return this.endY;

        const t = s / this.length;
        // Línea base entre orillas
        const baseHeight = (1.0 - t) * this.startY + t * this.endY;
        // Arco parabólico de elevación estética y estructural
        const arch = 4.0 * t * (1.0 - t) * this.archHeight;

        return baseHeight + arch;
    }

    // Devuelve la altura del puente si (px, pz) está dentro del área de paso, o null si no
    // currentY permite comprobar si el jugador está realmente arriba en el tablero o abajo en la ladera/río
    getHeightAt(px, pz, currentY = null) {
        const { s, d } = this.project(px, pz);

        // Tolerancia lateral: semiancho de calzada
        if (Math.abs(d) > this.halfWidth) return null;

        // Tolerancia longitudinal: el vano completo más 1.6m de rampa suave en cada orilla
        if (s < -1.6 || s > this.length + 1.6) return null;

        let targetDeckH = 0;
        if (s >= 0 && s <= this.length) {
            targetDeckH = this.getDeckHeightAtS(s);
        } else if (s < 0) {
            // Rampa de aproximación suave orilla A
            const rampT = (s + 1.6) / 1.6;
            const smoothT = rampT * rampT * (3.0 - 2.0 * rampT);
            const groundH = getHeightAt(px, pz);
            targetDeckH = groundH * (1.0 - smoothT) + this.startY * smoothT;
        } else {
            // Rampa de aproximación suave orilla B
            const rampT = (this.length + 1.6 - s) / 1.6;
            const smoothT = rampT * rampT * (3.0 - 2.0 * rampT);
            const groundH = getHeightAt(px, pz);
            targetDeckH = groundH * (1.0 - smoothT) + this.endY * smoothT;
        }

        // Si se provee la altura actual del jugador:
        // Para estar sobre el puente, o bien entramos por las rampas de aproximación a ras de suelo,
        // o bien ya estamos a una cota muy próxima a la superficie del tablero (+- 0.55m).
        // Si el jugador está por debajo de (targetDeckH - 0.55m), está inequívocamente caminando por
        // la ladera o el lecho del río debajo de la estructura; no debe ser absorbido hacia arriba.
        if (currentY !== null) {
            const isAtEntranceRamp = (s < 0.2 || s > this.length - 0.2);
            if (!isAtEntranceRamp && currentY < targetDeckH - 0.55) {
                return null;
            }
        }

        return targetDeckH;
    }

    // Indica si el punto está sobre el puente para anular la colisión con agua
    isPointOnBridge(px, pz, currentY = null, margin = 0.0) {
        const { s, d } = this.project(px, pz);
        const inFootprint = Math.abs(d) <= (this.halfWidth + margin) && s >= -1.2 && s <= (this.length + 1.2);
        if (!inFootprint) return false;

        // Si se especifica currentY y el jugador está abajo en el lecho del río, no está sobre el puente
        if (currentY !== null) {
            const expectedDeckH = this.getDeckHeightAtS(Math.max(0, Math.min(this.length, s)));
            if (currentY < expectedDeckH - 0.55) {
                return false;
            }
        }
        return true;
    }

    // Comprueba colisión contra los pilares de piedra en coordenadas locales (caja orientada OBB)
    isPierCollision(px, pz, py = null, playerRadius = 0.55) {
        const { s, d } = this.project(px, pz);
        const pilarFractions = this.pierFractions;

        for (let i = 0; i < pilarFractions.length; i++) {
            const frac = pilarFractions[i];
            const sPillar = this.length * frac;
            const deckY = this.getDeckHeightAtS(sPillar);
            const pierTopY = deckY - 0.15; // Justo bajo la madera

            // Si se conoce la cota Y del jugador, solo choca si está por debajo del tablero y dentro de la altura del pilar
            if (py !== null) {
                if (py > pierTopY - 0.05) {
                    continue; // El jugador está arriba caminando sobre la madera
                }
            }

            // Dimensiones del pilar en el sistema local:
            // Longitud a lo largo del puente (s): núcleo 1.4m + 0.6m sillería poligonal = 2.0m total (semi-longitud 1.0m)
            // Ancho transversal (d): núcleo width + 0.25m = 3.85m (semi-ancho 1.92m)
            const halfS = 1.0 + playerRadius;
            const halfD = (this.halfWidth + 0.15) + playerRadius;

            if (Math.abs(s - sPillar) <= halfS && Math.abs(d) <= halfD) {
                return true;
            }
        }

        return false;
    }

    // Comprueba si un movimiento del jugador choca con las barandillas laterales y pilastras de entrada
    // currY indica la altura vertical del jugador para no bloquear a quien camina por debajo en la ladera
    isRailingCollision(currX, currZ, nextX, nextZ, currY = null, playerRadius = 0.45) {
        const curr = this.project(currX, currZ);
        const next = this.project(nextX, nextZ);

        // Si se provee la cota Y del jugador, verificar si está a la altura del tablero
        if (currY !== null) {
            const spanS = Math.max(0, Math.min(this.length, curr.s));
            const deckY = this.getDeckHeightAtS(spanS);
            // La barandilla solo existe desde (deckY - 0.4) hasta (deckY + 2.0)
            if (currY < deckY - 0.5 || currY > deckY + 2.2) {
                return false; // El jugador está muy por debajo (ej. en la ladera o río) o por encima; no choca con la barandilla
            }
        }

        const safeHalfWidth = this.halfWidth - playerRadius;

        // 1. Si el jugador está sobre el puente en el vano o en la rampa de aproximación
        const isCurrentlyInLongitudinalBounds = curr.s >= -0.5 && curr.s <= (this.length + 0.5);
        if (isCurrentlyInLongitudinalBounds && Math.abs(curr.d) <= this.halfWidth + 0.15) {
            // Intento de salirse lateralmente a través de la barandilla o postes
            if (Math.abs(next.d) > safeHalfWidth) {
                // Si el jugador ya estaba fuera de safeHalfWidth y se mueve hacia el interior del puente, permitirlo
                if (Math.abs(next.d) < Math.abs(curr.d)) {
                    // Se acerca al eje central del puente (desatasco seguro)
                } else {
                    return true; // Bloqueado por la barandilla
                }
            }
        }

        // 2. Si el jugador intenta entrar por el lateral desde fuera atravesando la barandilla en el vano central
        const isNextInProtectedRange = next.s >= 0.5 && next.s <= (this.length - 0.5);
        if (isNextInProtectedRange && Math.abs(curr.d) > this.halfWidth && Math.abs(next.d) <= this.halfWidth) {
            return true; // Bloqueado: no se puede entrar por el lateral, solo por la embocadura frontal
        }

        return false;
    }
}

// Lista activa de puentes instanciados en el mundo
let activeBridges = [];

// Inicialización de la lista de puentes
export function initBridges() {
    activeBridges = [
        new BridgeInstance(BRIDGE_1_CONFIG),
        new BridgeInstance(BRIDGE_2_CONFIG),
        new BridgeInstance(BRIDGE_3_CONFIG),
        new BridgeInstance(BRIDGE_4_CONFIG),
        new BridgeInstance(BRIDGE_5_CONFIG)
    ];
}

// =========================================================================
// FUNCIONES PÚBLICAS DE FÍSICAS Y CONSULTA
// =========================================================================

/**
 * Devuelve la cota Y del tablero del puente si el jugador está sobre él, o null si está en terreno natural.
 * currentY permite discernir si el jugador está realmente arriba en el tablero o abajo en la orilla/río.
 */
export function getBridgeHeight(px, pz, currentY = null) {
    if (activeBridges.length === 0) initBridges();
    for (let i = 0; i < activeBridges.length; i++) {
        const h = activeBridges[i].getHeightAt(px, pz, currentY);
        if (h !== null) return h;
    }
    return null;
}

/**
 * Comprueba si una posición está sobre un puente para permitir el paso sobre el agua.
 */
export function isPointOnAnyBridge(px, pz, currentY = null) {
    if (activeBridges.length === 0) initBridges();
    for (let i = 0; i < activeBridges.length; i++) {
        if (activeBridges[i].isPointOnBridge(px, pz, currentY, 0.1)) return true;
    }
    return false;
}

/**
 * Comprueba si el desplazamiento colisiona contra las barandillas de algún puente.
 * currY permite que la barandilla superior no bloquee al jugador cuando camina por debajo del arco.
 */
export function checkBridgeRailCollision(currX, currZ, nextX, nextZ, currY = null) {
    if (activeBridges.length === 0) initBridges();
    for (let i = 0; i < activeBridges.length; i++) {
        if (activeBridges[i].isRailingCollision(currX, currZ, nextX, nextZ, currY)) {
            return true;
        }
    }
    return false;
}

/**
 * Comprueba si una posición choca contra los pilares de piedra del puente (OBB 3D).
 */
export function checkBridgePierCollision(px, pz, py = null) {
    if (activeBridges.length === 0) initBridges();
    for (let i = 0; i < activeBridges.length; i++) {
        if (activeBridges[i].isPierCollision(px, pz, py)) {
            return true;
        }
    }
    return false;
}

/**
 * Devuelve el factor de proximidad a los accesos del puente [0, 1] para pintar el camino en el terreno
 */
export function getBridgeApproachFactor(px, pz) {
    if (activeBridges.length === 0) initBridges();
    let maxFactor = 0;
    for (let i = 0; i < activeBridges.length; i++) {
        const b = activeBridges[i];
        const { s, d } = b.project(px, pz);
        // Ancho del camino de acceso
        if (Math.abs(d) <= b.halfWidth + 0.6) {
            const latWeight = 1.0 - Math.min(1.0, Math.abs(d) / (b.halfWidth + 0.6));
            // Orilla A (s < 0) o Orilla B (s > b.length)
            if (s >= -5.5 && s <= 0.5) {
                const longWeight = s < 0 ? (s + 5.5) / 5.5 : 1.0;
                maxFactor = Math.max(maxFactor, latWeight * longWeight);
            } else if (s >= b.length - 0.5 && s <= b.length + 5.5) {
                const longWeight = s > b.length ? (b.length + 5.5 - s) / 5.5 : 1.0;
                maxFactor = Math.max(maxFactor, latWeight * longWeight);
            }
        }
    }
    return maxFactor;
}

/**
 * Para evitar que árboles o rocas se generen sobre el puente o sus accesos.
 */
export function isPointNearBridge(px, pz, safeDistance = 3.0) {
    if (activeBridges.length === 0) initBridges();
    for (let i = 0; i < activeBridges.length; i++) {
        const b = activeBridges[i];
        const { s, d } = b.project(px, pz);
        if (s >= -safeDistance && s <= b.length + safeDistance && Math.abs(d) <= b.halfWidth + safeDistance) {
            return true;
        }
    }
    return false;
}

// =========================================================================
// EFECTOS HIDRODINÁMICOS EN PILARES SUMERGIDOS (ONDAS DE CHOQUE Y SALPICADURAS)
// =========================================================================

function createPierWaterCollisionEffects(bridgeGroup, px, pz, bridge, riverInfo, pierWidth, pierDepth) {
    const spline = riverInfo.riverIndex === 1 ? riverSpline : (riverInfo.riverIndex === 2 ? riverOutflowSpline : river3Spline);
    const streamTangent = spline.getTangent(riverInfo.t).normalize();
    const flowDir = new THREE.Vector2(streamTangent.x, streamTangent.z).normalize();
    const flowNorm = new THREE.Vector2(-flowDir.y, flowDir.x);
    const waterY = riverInfo.y;

    const pierHalfWidth = pierWidth * 0.5;
    const pierHalfDepth = pierDepth * 0.5;

    // -------------------------------------------------------------
    // 1. ESTELA DE PROA Y ONDAS DE CHOQUE (WAKE & BOW WAVE DECAL)
    // -------------------------------------------------------------
    // Comienza antes del puente aguas arriba (s = -2.65m, por delante de la barandilla a -1.8m)
    // y llega casi al otro lado de la pasarela aguas abajo (s = +1.65m, justo antes de +1.8m)
    const upstreamStartDist = 2.65;  // 2.65m aguas arriba (frente abierto hacia el nacimiento)
    const downstreamEndDist = 1.65;  // 1.65m aguas abajo (casi al otro lado, sin rebasar la pasarela)
    const totalCorridorLen = upstreamStartDist + downstreamEndDist; // ~4.30m
    const corridorCenterOffset = (-upstreamStartDist + downstreamEndDist) * 0.5; // -0.50m

    // Ancho contenido en la pasarela (~3.8m transversal) y largo del corredor (~4.6m longitudinal)
    const wakeGeo = new THREE.PlaneGeometry(3.8, 4.6, 28, 28);
    wakeGeo.rotateX(-Math.PI * 0.5);

    const wakeMat = new THREE.ShaderMaterial({
        uniforms: {
            uPierPos: { value: new THREE.Vector3(px, waterY, pz) },
            uFlowDir: { value: flowDir },
            uFlowNormal: { value: flowNorm },
            uPierHalfWidth: { value: pierHalfWidth },
            uPierHalfDepth: { value: pierHalfDepth },
            uTime: { value: 0.0 },
            uFoamColor: { value: new THREE.Color(0xf8fafc) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
            uDeepColor: { value: new THREE.Color(0x0284c7) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                vUv = uv;
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPos = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform vec3 uPierPos;
            uniform vec2 uFlowDir;
            uniform vec2 uFlowNormal;
            uniform float uPierHalfWidth;
            uniform float uPierHalfDepth;
            uniform float uTime;
            uniform vec3 uFoamColor;
            uniform vec3 uCyanColor;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            void main() {
                vec2 delta = vWorldPos.xz - uPierPos.xz;
                float s = dot(delta, uFlowDir);
                float d = dot(delta, uFlowNormal);

                // 1. Ola de choque frontal que empieza antes del puente (s = -2.55m hacia el nacimiento)
                float bowParabola = s + 0.14 * (d * d);
                float bowDist = abs(bowParabola + 2.55);
                float bowWave = exp(-bowDist * bowDist * 16.0) * (0.90 + 0.10 * sin(uTime * 4.8));

                // 2. Ondulaciones de choque concéntricas avanzando hacia la cabecera
                float upDist = -(s + 2.55);
                float upRipples = 0.0;
                if (upDist > 0.0) {
                    upRipples = (sin(upDist * 8.5 + uTime * 6.2) * 0.5 + 0.5) * exp(-upDist * 1.8) * smoothstep(0.0, 0.35, upDist);
                }

                // 3. Corredor de aguas bravas y espuma a lo largo de todo el paso bajo la pasarela
                // (desde antes del puente hasta casi el otro lado aguas abajo)
                float corridor = smoothstep(-2.75, -2.40, s) * smoothstep(1.70, 1.40, s);
                float flankDist = abs(abs(d) - uPierHalfWidth * 0.95);
                float flankFoam = exp(-flankDist * flankDist * 14.0) * (0.82 + 0.18 * sin(uTime * 6.0 - s * 3.5));

                // 4. Espuma viva pegada al pilar y vórtices que cruzan al otro lado
                float centerFroth = exp(-max(abs(d) - uPierHalfWidth * 0.5, 0.0) * 8.0) * (0.60 + 0.20 * sin(uTime * 5.0 + s * 4.0));

                float totalFoam = clamp(bowWave * 0.95 + upRipples * 0.55 + (flankFoam * 0.75 + centerFroth * 0.50) * corridor, 0.0, 1.0);

                // Corte suave en los bordes del plano
                float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) *
                                 smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);

                if (totalFoam * edgeFade < 0.02) discard;

                vec3 color = mix(uCyanColor, uFoamColor, smoothstep(0.18, 0.72, totalFoam));
                float alpha = totalFoam * 0.88 * edgeFade;

                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false
    });

    registerWaterMaterial(wakeMat);

    const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat);
    // Centrado a lo largo del corredor entre el frente abierto y el borde posterior de la pasarela
    wakeMesh.position.set(px + flowDir.x * corridorCenterOffset, waterY + 0.025, pz + flowDir.y * corridorCenterOffset);
    wakeMesh.renderOrder = 22;
    bridgeGroup.add(wakeMesh);

    // -------------------------------------------------------------
    // 2. SISTEMA DE SALPICADURAS Y BRUMA (SPLASH & SPRAY PARTICLES)
    // -------------------------------------------------------------
    const particleCount = 200;
    const splashGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const aSplashParams = new Float32Array(particleCount * 4);
    const aDirections = new Float32Array(particleCount * 3);

    const maxLateralWidth = Math.min(pierWidth, 3.6); // Contenido sin sobrepasar la pasarela

    for (let i = 0; i < particleCount; i++) {
        const pType = i < 80 ? 0 : (i < 155 ? 1 : 2); // 0: impacto frontal, 1: spray lateral bajo pasarela, 2: bruma
        const lateral = (Math.random() - 0.5) * maxLateralWidth;

        // Distribución longitudinal a lo largo del flujo:
        let sOffset;
        if (pType === 0) {
            // Empieza antes del puente: en la línea de choque frontal entre s = -2.65m y -2.40m
            sOffset = -upstreamStartDist + Math.random() * 0.25;
        } else if (pType === 1) {
            // Recorre los flancos del pilar bajo la pasarela desde s = -2.40m hasta s = +0.60m
            sOffset = -2.40 + Math.random() * 3.0;
        } else {
            // Bruma distribuida desde el frente abierto hasta el final de la pasarela
            sOffset = -upstreamStartDist + Math.random() * (totalCorridorLen * 0.85);
        }

        positions[i * 3 + 0] = px + flowDir.x * sOffset + flowNorm.x * lateral;
        positions[i * 3 + 1] = waterY + 0.05;
        positions[i * 3 + 2] = pz + flowDir.y * sOffset + flowNorm.y * lateral;

        aSplashParams[i * 4 + 0] = Math.random() * 10.0; // phase
        aSplashParams[i * 4 + 1] = 1.2 + Math.random() * 1.5; // speed
        aSplashParams[i * 4 + 2] = (pType === 2 ? 6.5 : 4.4) + Math.random() * 3.5; // size
        aSplashParams[i * 4 + 3] = pType;

        if (pType === 0) {
            // Gotas de choque frontal en el frente abierto: saltan alto y avanzan hacia el puente
            const latDir = Math.sign(lateral || (Math.random() - 0.5)) * (0.3 + Math.random() * 0.7);
            aDirections[i * 3 + 0] = flowNorm.x * latDir;
            aDirections[i * 3 + 1] = 0.55 + Math.random() * 0.45;
            aDirections[i * 3 + 2] = flowNorm.y * latDir;
        } else if (pType === 1) {
            // Spray que viaja rápidamente hacia el otro lado del puente sin rebasarlo
            const latSide = Math.sign(lateral || (Math.random() - 0.5));
            aDirections[i * 3 + 0] = flowNorm.x * latSide * 0.6;
            aDirections[i * 3 + 1] = 0.25 + Math.random() * 0.30;
            aDirections[i * 3 + 2] = flowNorm.y * latSide * 0.6;
        } else {
            // Micro-bruma ascendente
            aDirections[i * 3 + 0] = (Math.random() - 0.5) * 0.3;
            aDirections[i * 3 + 1] = 0.95;
            aDirections[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        }
    }

    splashGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    splashGeo.setAttribute('aSplashParams', new THREE.BufferAttribute(aSplashParams, 4));
    splashGeo.setAttribute('aDirection', new THREE.BufferAttribute(aDirections, 3));

    const splashMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uPierPos: { value: new THREE.Vector3(px, waterY, pz) },
            uFlowDir: { value: flowDir },
            uFoamColor: { value: new THREE.Color(0xf8fafc) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) }
        },
        vertexShader: `
            attribute vec4 aSplashParams;
            attribute vec3 aDirection;
            uniform float uTime;
            uniform vec3 uPierPos;
            uniform vec2 uFlowDir;
            varying float vAlpha;
            varying float vType;

            void main() {
                float phase = aSplashParams.x;
                float speed = aSplashParams.y;
                float size = aSplashParams.z;
                float type = aSplashParams.w;
                vType = type;

                float duration = (type > 1.5) ? 2.6 : ((type > 0.5) ? 1.6 : 1.2);
                float cycle = mod((uTime + phase) * speed, duration);
                float progress = cycle / duration;

                vec3 pos = position;

                if (type > 1.5) {
                    // Bruma vaporosa flotando con la corriente
                    pos.y += progress * 0.95;
                    pos.x += uFlowDir.x * (progress * 1.6) + aDirection.x * (sin(progress * 4.0) * 0.25);
                    pos.z += uFlowDir.y * (progress * 1.6) + aDirection.z * (sin(progress * 4.0) * 0.25);
                } else if (type > 0.5) {
                    // Spray en los flancos viajando hacia el otro lado del puente
                    pos.x += uFlowDir.x * (progress * 2.2) + aDirection.x * (progress * 0.7);
                    pos.z += uFlowDir.y * (progress * 2.2) + aDirection.z * (progress * 0.7);
                    pos.y += sin(progress * 3.14159) * 0.32;
                } else {
                    // Gotas de choque frontal que saltan alto y caen hacia el puente
                    pos.y += sin(progress * 3.14159) * (0.48 + aDirection.y * 0.40) - progress * progress * 0.25;
                    pos.x += aDirection.x * (progress * 0.50) + uFlowDir.x * (progress * progress * 1.4);
                    pos.z += aDirection.z * (progress * 0.50) + uFlowDir.y * (progress * progress * 1.4);
                }

                // Desvanecer suavemente si se acerca al límite aguas abajo (s = +1.65m) para no rebasar la pasarela
                float s = dot(pos.xz - uPierPos.xz, uFlowDir);
                float boundsFade = smoothstep(1.70, 1.40, s) * smoothstep(-2.85, -2.55, s);

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float dist = length(mvPosition.xyz);
                float distFade = smoothstep(220.0, 35.0, dist);

                float baseAlpha = (type > 1.5) ? 0.45 : 0.94;
                vAlpha = sin(progress * 3.14159) * baseAlpha * distFade * boundsFade;

                gl_PointSize = size * (240.0 / max(dist, 1.0)) * distFade;
                gl_PointSize = clamp(gl_PointSize, 1.0, 150.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uFoamColor;
            uniform vec3 uCyanColor;
            varying float vAlpha;
            varying float vType;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                if (vType > 1.5) {
                    float softMist = smoothstep(0.5, 0.0, dist);
                    vec3 mistCol = mix(uCyanColor, uFoamColor, 0.65);
                    gl_FragColor = vec4(mistCol, vAlpha * softMist * 0.60);
                } else {
                    float soft = smoothstep(0.5, 0.05, dist);
                    vec3 col = mix(uCyanColor, uFoamColor, 0.85);
                    gl_FragColor = vec4(col, vAlpha * soft);
                }
            }
        `,
        transparent: true,
        depthWrite: false
    });

    registerWaterMaterial(splashMat);

    const splashPoints = new THREE.Points(splashGeo, splashMat);
    splashPoints.renderOrder = 26;
    splashPoints.frustumCulled = false;
    bridgeGroup.add(splashPoints);
}

// =========================================================================
// CONSTRUCCIÓN VISUAL DEL PUENTE (ESTILO MIXTO: PIEDRA Y MADERA NOBLE)
// =========================================================================

/**
 * Genera la geometría 3D del logotipo escultórico (monograma caligráfico 'G' en espiral botánica)
 * tallado en bulto redondo para coronar las pilastras de entrada de todos los puentes.
 */
function createLogoMonogramGeometry() {
    // 1. Arco exterior del monograma 'G'
    const outerShape = new THREE.Shape();
    outerShape.moveTo(0.12, 0.38);
    outerShape.bezierCurveTo(0.04, 0.50, -0.16, 0.46, -0.22, 0.25);
    outerShape.bezierCurveTo(-0.28, 0.02, -0.26, -0.22, -0.17, -0.38);
    outerShape.bezierCurveTo(-0.08, -0.53, 0.08, -0.50, 0.14, -0.35);
    outerShape.bezierCurveTo(0.18, -0.24, 0.17, -0.12, 0.13, -0.04);
    outerShape.lineTo(0.10, -0.04);
    outerShape.bezierCurveTo(0.13, -0.14, 0.12, -0.26, 0.07, -0.35);
    outerShape.bezierCurveTo(-0.02, -0.44, -0.12, -0.38, -0.17, -0.24);
    outerShape.bezierCurveTo(-0.23, -0.06, -0.22, 0.16, -0.14, 0.30);
    outerShape.bezierCurveTo(-0.08, 0.42, 0.04, 0.42, 0.12, 0.38);

    // 2. Trazo interior en espiral que conforma la curva interna y el tallo de la G
    const innerShape = new THREE.Shape();
    innerShape.moveTo(0.10, 0.24);
    innerShape.bezierCurveTo(0.06, 0.35, -0.06, 0.33, -0.11, 0.18);
    innerShape.bezierCurveTo(-0.17, 0.00, -0.16, -0.20, -0.09, -0.32);
    innerShape.bezierCurveTo(-0.03, -0.41, 0.07, -0.36, 0.10, -0.24);
    innerShape.bezierCurveTo(0.13, -0.10, 0.11, 0.04, 0.06, 0.08);
    innerShape.bezierCurveTo(0.08, -0.05, 0.07, -0.16, 0.03, -0.24);
    innerShape.bezierCurveTo(-0.02, -0.32, -0.09, -0.26, -0.11, -0.14);
    innerShape.bezierCurveTo(-0.13, 0.01, -0.10, 0.16, -0.05, 0.24);
    innerShape.bezierCurveTo(-0.01, 0.30, 0.06, 0.28, 0.10, 0.24);

    // 3. Ojo circular característico del remate interior
    const eyeShape = new THREE.Shape();
    const cx = 0.065, cy = 0.035, rOuter = 0.042, rInner = 0.018;
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.35) {
        const x = cx + Math.cos(a) * rOuter;
        const y = cy + Math.sin(a) * rOuter;
        if (a === 0) eyeShape.moveTo(x, y);
        else eyeShape.lineTo(x, y);
    }
    const hole = new THREE.Path();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.35) {
        const x = cx + Math.cos(a) * rInner;
        const y = cy + Math.sin(a) * rInner;
        if (a === 0) hole.moveTo(x, y);
        else hole.lineTo(x, y);
    }
    eyeShape.holes.push(hole);

    const extrudeSettings = {
        curveSegments: 8,
        steps: 1,
        depth: 0.085,
        bevelEnabled: true,
        bevelThickness: 0.016,
        bevelSize: 0.013,
        bevelOffset: 0,
        bevelSegments: 2
    };

    const geo = new THREE.ExtrudeGeometry([outerShape, innerShape, eyeShape], extrudeSettings);
    geo.center();
    geo.computeVertexNormals();
    return geo;
}

export function createBridges() {
    if (activeBridges.length === 0) initBridges();

    const bridgeMasterGroup = new THREE.Group();
    bridgeMasterGroup.name = 'BridgeSystemGroup';

    // -------------------------------------------------------------
    // MATERIALES COMPARTIDOS PARA CANTERÍA Y SILLERÍA CICLÓPEA
    // -------------------------------------------------------------

    // Textura procedural de mampostería poligonal encajada (Voronoi) según la imagen de referencia
    const polygonalStoneTextures = createPolygonalStoneTexture(1024, 1024);

    // Material de mampostería poligonal con relieve para muros de estribo y contrafuertes
    const polygonalStoneMaterial = new THREE.MeshStandardMaterial({
        map: polygonalStoneTextures.map,
        bumpMap: polygonalStoneTextures.bumpMap,
        bumpScale: 0.08,
        roughness: 0.90,
        metalness: 0.04
    });

    // Gama de tonalidades minerales frías (grises calizos y basalto) inspiradas en la foto
    const stoneMats = [
        new THREE.MeshStandardMaterial({ color: 0x9fa5ab, roughness: 0.92, metalness: 0.04, flatShading: true }), // Caliza clara
        new THREE.MeshStandardMaterial({ color: 0x82888e, roughness: 0.94, metalness: 0.05, flatShading: true }), // Gris medio granítico
        new THREE.MeshStandardMaterial({ color: 0x686e74, roughness: 0.93, metalness: 0.05, flatShading: true }), // Pizarra media
        new THREE.MeshStandardMaterial({ color: 0x4f545a, roughness: 0.90, metalness: 0.06, flatShading: true })  // Basalto oscuro
    ];

    // Mortero oscuro para fondo y juntas profundas
    const mortarMaterial = new THREE.MeshStandardMaterial({
        color: 0x282b2e,
        roughness: 0.98,
        metalness: 0.02
    });

    const darkStoneMaterial = stoneMats[3];
    const stoneMaterial = stoneMats[1];

    // 3. Material de madera noble oscura para vigas maestras y arcos
    const woodBeamMaterial = new THREE.MeshStandardMaterial({
        color: 0x422c1b,
        roughness: 0.80,
        metalness: 0.04
    });

    // 4. Material de madera para tablones de calzada (roble envejecido)
    const plankMaterial = new THREE.MeshStandardMaterial({
        color: 0x5e412a,
        roughness: 0.82,
        metalness: 0.05
    });

    const plankAltMaterial = new THREE.MeshStandardMaterial({
        color: 0x543924,
        roughness: 0.84,
        metalness: 0.05
    });

    // 5. Material de madera para barandillas y pasamanos
    const railMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3221,
        roughness: 0.76,
        metalness: 0.04
    });

    // 6. Material noble verde esmeralda con acabado de cantería para la escultura del logotipo
    const logoSculptureMaterial = new THREE.MeshStandardMaterial({
        color: 0x127c3a, // Verde esmeralda vivo y elegante del logotipo
        roughness: 0.52,
        metalness: 0.16,
        flatShading: false
    });

    // Geometría 3D compartida de la escultura del logotipo ("G" caligráfica en espiral)
    const sharedLogoGeo = createLogoMonogramGeometry();

    // Peanas escalonadas de cantería para asiento de la escultura
    const plinthBaseGeo = new THREE.BoxGeometry(0.64, 0.09, 0.64);
    const plinthTopGeo = new THREE.BoxGeometry(0.50, 0.07, 0.50);

    // Construcción individual de cada puente en la lista
    activeBridges.forEach(bridge => {
        const bridgeGroup = new THREE.Group();
        bridgeGroup.name = bridge.id;

        const L = bridge.length;
        const W = bridge.width;
        const hw = bridge.halfWidth;

        // -------------------------------------------------------------
        // A. ESTRIBOS Y CALZADA EMPEDRADA CON LOSAS ENCAJADAS (AMBAS ORILLAS)
        // -------------------------------------------------------------
        const abutmentData = [
            { s: 0, x: bridge.startX, z: bridge.startZ, y: bridge.startY, isStart: true },
            { s: L, x: bridge.endX, z: bridge.endZ, y: bridge.endY, isStart: false }
        ];

        abutmentData.forEach((abut, abutIdx) => {
            // Cota superior del estribo de piedra: justo a ras de la cara inferior de los listones de madera
            const abutTopY = abut.y - 0.15;

            // 1. ESTRIBO ESTRUCTURAL SÓLIDO DE MAMPOSTERÍA POLIGONAL
            // Una sola caja estructural precisa (sin duplicidad de mallas para erradicar el Z-fighting)
            // Ancho exactamente alineado bajo la calzada (W = 3.6m) para no sobresalir de las barandillas
            const abutHeight = 4.4;
            const abutDepth = 2.8;
            const abutGeo = new THREE.BoxGeometry(W, abutHeight, abutDepth);
            const abutMesh = new THREE.Mesh(abutGeo, polygonalStoneMaterial);
            abutMesh.position.set(abut.x, abutTopY - (abutHeight * 0.5), abut.z);
            abutMesh.rotation.y = bridge.rotationY;
            abutMesh.castShadow = true;
            abutMesh.receiveShadow = true;
            bridgeGroup.add(abutMesh);

            // 1B. SILLERÍA CICLÓPEA DE BLOQUES POLIGONALES EN RELIEVE SALIENTE
            // Hiladas poligonales con piezas de 4, 5 y 6 caras biseladas encajadas en el frente
            const wallRows = 5;
            const wallCols = 6;
            const rowHeight = 0.68;

            for (let wr = 0; wr < wallRows; wr++) {
                const rowCenterY = abutTopY - 0.35 - (wr * rowHeight);
                const stagger = (wr % 2 === 0) ? 0 : 0.45;

                for (let wc = 0; wc < wallCols; wc++) {
                    const seedVal = abutIdx * 50 + wr * 10 + wc;
                    const pseudo1 = Math.sin(seedVal * 12.3);
                    const pseudo2 = Math.cos(seedVal * 8.7);

                    const colFrac = (wc + stagger + (pseudo1 * 0.15) - (wallCols * 0.5)) / (wallCols * 0.5);
                    const latOffset = colFrac * (W * 0.44);

                    // Dimensiones poligonales orgánicas variadas
                    const stoneW = 0.50 + Math.abs(pseudo1) * 0.24;
                    const stoneH = 0.42 + Math.abs(pseudo2) * 0.20;
                    const stoneD = 0.30 + Math.abs(pseudo1) * 0.10;
                    const sides = 5 + (Math.abs(Math.floor(pseudo1 * 10)) % 3); // 5, 6 o 7 lados

                    const polyGeo = createPolygonalStoneGeometry(stoneW, stoneH, stoneD, sides);
                    const stoneMat = stoneMats[(abutIdx * 7 + wr * 3 + wc) % stoneMats.length];
                    const polyMesh = new THREE.Mesh(polyGeo, stoneMat);

                    // Cara exterior del estribo orientada hacia el río o hacia el borde
                    const frontOffset = (abut.isStart ? 1.35 : -1.35) + (pseudo2 * 0.04);

                    polyMesh.position.set(
                        abut.x + (bridge.normalX * latOffset) + (bridge.dirX * frontOffset),
                        rowCenterY + (pseudo1 * 0.03),
                        abut.z + (bridge.normalZ * latOffset) + (bridge.dirZ * frontOffset)
                    );
                    polyMesh.rotation.y = bridge.rotationY + (abut.isStart ? 0 : Math.PI);
                    polyMesh.rotation.z = pseudo1 * 0.12;
                    polyMesh.castShadow = true;
                    polyMesh.receiveShadow = true;
                    bridgeGroup.add(polyMesh);
                }
            }

            // 2. PILASTRAS EN LAS ESQUINAS CON TAMBORES POLIGONALES EN RELIEVE
            [-hw - 0.25, hw + 0.25].forEach((lateralOffset, sideIdx) => {
                const pillarX = abut.x + bridge.normalX * lateralOffset;
                const pillarZ = abut.z + bridge.normalZ * lateralOffset;
                const pillarY = abut.y;

                // Fuste formado por bloques poligonales apilados con juntas vivas
                const pillarBlocks = 4;
                const pBlockH = 0.38;
                for (let pb = 0; pb < pillarBlocks; pb++) {
                    const pbMat = stoneMats[(abutIdx * 5 + sideIdx * 3 + pb) % stoneMats.length];
                    const pbSides = 6 + (pb % 2);
                    const pbGeo = createPolygonalStoneGeometry(0.68, 0.68, pBlockH - 0.04, pbSides);
                    const pbMesh = new THREE.Mesh(pbGeo, pbMat);
                    pbMesh.position.set(pillarX, pillarY + (pb * pBlockH) + 0.20, pillarZ);
                    pbMesh.rotation.x = -Math.PI * 0.5;
                    pbMesh.rotation.z = bridge.rotationY + (pb * 0.45);
                    pbMesh.castShadow = true;
                    bridgeGroup.add(pbMesh);
                }

                // Cota superior real del último bloque poligonal de la columna:
                const lastBlockTopY = pillarY + (3 * pBlockH) + 0.20 + 0.187;

                // Capitel / remate moldurado de piedra
                const capHeight = 0.20;
                const capCenterY = (lastBlockTopY - 0.01) + (capHeight * 0.5);
                const capGeo = new THREE.BoxGeometry(0.78, capHeight, 0.78);
                const capMesh = new THREE.Mesh(capGeo, darkStoneMaterial);
                capMesh.position.set(pillarX, capCenterY, pillarZ);
                capMesh.rotation.y = bridge.rotationY;
                capMesh.castShadow = true;
                capMesh.receiveShadow = true;
                bridgeGroup.add(capMesh);

                const capTopY = capCenterY + (capHeight * 0.5);

                // Escultura 3D del logotipo ("G" en espiral botánica) sobre peana de cantería
                const sculptureGroup = new THREE.Group();
                sculptureGroup.position.set(pillarX, capTopY, pillarZ);

                // Peana inferior escalonada de cantería
                const plinthBaseMesh = new THREE.Mesh(plinthBaseGeo, darkStoneMaterial);
                plinthBaseMesh.position.y = 0.045 - 0.005; // 0.005m de encaje sobre el capitel
                plinthBaseMesh.castShadow = true;
                plinthBaseMesh.receiveShadow = true;
                sculptureGroup.add(plinthBaseMesh);

                // Peana superior moldurada
                const plinthTopMesh = new THREE.Mesh(plinthTopGeo, stoneMats[0]);
                plinthTopMesh.position.y = 0.09 + 0.035 - 0.005;
                plinthTopMesh.castShadow = true;
                plinthTopMesh.receiveShadow = true;
                sculptureGroup.add(plinthTopMesh);

                // Escultura 3D exenta del logotipo (monograma 'G' en espiral)
                const logoMesh = new THREE.Mesh(sharedLogoGeo, logoSculptureMaterial);
                const logoScale = 0.95;
                logoMesh.scale.set(logoScale, logoScale, logoScale);
                logoMesh.position.y = 0.16 + (0.46 * logoScale) - 0.005;
                // Orientación hacia el frente del camino de acceso al puente
                logoMesh.rotation.y = abut.isStart ? 0 : Math.PI;
                logoMesh.castShadow = true;
                logoMesh.receiveShadow = true;
                sculptureGroup.add(logoMesh);

                // Orientar el conjunto con el ángulo del puente
                sculptureGroup.rotation.y = bridge.rotationY;
                bridgeGroup.add(sculptureGroup);

                // Colisionador para el pilar de esquina de entrada (evita entrar en él o quedar atascado)
                const cornerObstacle = {
                    position: new THREE.Vector3(pillarX, pillarY + 0.8, pillarZ),
                    userData: {
                        radius: 0.50,
                        minVerticalY: pillarY - 0.5,
                        maxVerticalY: pillarY + 2.5
                    }
                };
                addCollidable(cornerObstacle);
            });
        });

        // -------------------------------------------------------------
        // B. PILARES / CONTRAFUERTES DE PIEDRA POLIGONAL CICLÓPEA
        // -------------------------------------------------------------
        // Colocados según la configuración del puente, anclados en las laderas y lecho
        // Quedan JUSTO a ras de la zona inferior de la pasarela de madera, sin sobresalir de ella
        const pilarFractions = bridge.pierFractions;
        pilarFractions.forEach((frac, pierIdx) => {
            const sPillar = L * frac;
            const px = bridge.startX + bridge.dirX * sPillar;
            const pz = bridge.startZ + bridge.dirZ * sPillar;
            const deckY = bridge.getDeckHeightAtS(sPillar);
            const groundY = getHeightAt(px, pz);

            // Cota superior exacta: justo en la cara inferior de los listones de madera (deckY - PLANK_THICKNESS)
            const pierTopY = deckY - 0.15;
            // Cota inferior: penetración sólida en el suelo rocoso del cañón
            const pierBottomY = Math.min(groundY - 1.2, pierTopY - 1.8);
            const totalHeight = pierTopY - pierBottomY;
            const pierCenterY = pierBottomY + (totalHeight * 0.5);

            // Núcleo central con textura de mampostería poligonal completa
            const pierCoreGeo = new THREE.BoxGeometry(W + 0.25, totalHeight, 1.4);
            const pierCoreMesh = new THREE.Mesh(pierCoreGeo, polygonalStoneMaterial);
            pierCoreMesh.position.set(px, pierCenterY, pz);
            pierCoreMesh.rotation.y = bridge.rotationY;
            pierCoreMesh.castShadow = true;
            pierCoreMesh.receiveShadow = true;
            bridgeGroup.add(pierCoreMesh);

            // Bloques de sillería poligonal en saliente en las caras vistas de los contrafuertes
            const pierCourses = Math.max(3, Math.floor(totalHeight / 0.70));
            const cHeight = totalHeight / pierCourses;

            for (let pc = 0; pc < pierCourses; pc++) {
                const taper = 1.0 + ((pierCourses - pc - 1) / pierCourses) * 0.25;
                const courseCenterY = pierBottomY + (pc + 0.5) * cHeight;

                // Si la hilada superior pudiera rozar la parte inferior del tablero, recortar su altura
                const maxAllowedHalfH = (pierTopY - courseCenterY) * 0.95;
                const actualBlockH = Math.min(cHeight * 0.85, maxAllowedHalfH * 1.8);

                // Piedras poligonales en los dos frentes transversales del pilar
                [-1, 1].forEach((faceSide, fIdx) => {
                    const seedVal = pierIdx * 80 + pc * 12 + fIdx * 5;
                    const p1 = Math.sin(seedVal * 14.1);
                    const p2 = Math.cos(seedVal * 9.7);

                    const polyGeo = createPolygonalStoneGeometry(
                        (W * 0.44) * taper,
                        actualBlockH,
                        0.30,
                        6
                    );
                    const pierMat = stoneMats[(pierIdx * 5 + pc + fIdx) % stoneMats.length];
                    const polyMesh = new THREE.Mesh(polyGeo, pierMat);

                    const faceOffset = (0.70 * taper) * faceSide;
                    polyMesh.position.set(
                        px + (bridge.dirX * faceOffset),
                        courseCenterY + (p1 * 0.02),
                        pz + (bridge.dirZ * faceOffset)
                    );
                    polyMesh.rotation.y = bridge.rotationY + (faceSide > 0 ? 0 : Math.PI);
                    polyMesh.rotation.z = p2 * 0.10;
                    polyMesh.castShadow = true;
                    polyMesh.receiveShadow = true;
                    bridgeGroup.add(polyMesh);
                });
            }

            // ---------------------------------------------------------
            // EFECTO HIDRODINÁMICO: AGUA CHOCANDO CONTRA EL PILAR SUMERGIDO
            // ---------------------------------------------------------
            const riverInfo = getRiverInfo(px, pz);
            if (riverInfo && riverInfo.active && riverInfo.distance < (riverInfo.halfWidth + 0.6)) {
                createPierWaterCollisionEffects(bridgeGroup, px, pz, bridge, riverInfo, W + 0.25, 1.4);
            }
        });

        // -------------------------------------------------------------
        // C. VIGAS MAESTRAS CURVADAS DE MADERA NOBLE (ARCOS LONGITUDINALES)
        // -------------------------------------------------------------
        const BEAM_SEGMENTS = 36;
        [-hw + 0.35, 0.0, hw - 0.35].forEach(beamOffset => {
            const beamPoints = [];
            for (let i = 0; i <= BEAM_SEGMENTS; i++) {
                const s = (i / BEAM_SEGMENTS) * L;
                const deckY = bridge.getDeckHeightAtS(s);
                const bx = bridge.startX + bridge.dirX * s + bridge.normalX * beamOffset;
                const bz = bridge.startZ + bridge.dirZ * s + bridge.normalZ * beamOffset;
                // La viga corre 0.25m por debajo del tablero de tablas
                beamPoints.push(new THREE.Vector3(bx, deckY - 0.25, bz));
            }

            const beamCurve = new THREE.CatmullRomCurve3(beamPoints);
            const beamGeo = new THREE.TubeGeometry(beamCurve, BEAM_SEGMENTS, 0.16, 6, false);
            const beamMesh = new THREE.Mesh(beamGeo, woodBeamMaterial);
            beamMesh.castShadow = true;
            beamMesh.receiveShadow = true;
            bridgeGroup.add(beamMesh);
        });

        // -------------------------------------------------------------
        // D. TABLERO DE CALZADA: TABLONES INDIVIDUALES DE MADERA RÚSTICA
        // -------------------------------------------------------------
        const PLANK_LENGTH = W;           // Ancho de la calzada
        const PLANK_WIDTH = 0.30;         // Avance longitudinal de cada tabla
        const PLANK_THICKNESS = 0.14;     // Grosor de la tabla
        const PLANK_SPACING = 0.34;       // Distancia entre centros de tablas sucesivas
        const totalPlanks = Math.floor(L / PLANK_SPACING);

        const plankGeo = new THREE.BoxGeometry(PLANK_LENGTH, PLANK_THICKNESS, PLANK_WIDTH);

        for (let p = 0; p <= totalPlanks; p++) {
            const s = (p / totalPlanks) * L;
            const deckY = bridge.getDeckHeightAtS(s);
            const px = bridge.startX + bridge.dirX * s;
            const pz = bridge.startZ + bridge.dirZ * s;

            // Variación visual sutil: tono y micro-desfase de posición
            const mat = (p % 3 === 0) ? plankAltMaterial : plankMaterial;
            const plankMesh = new THREE.Mesh(plankGeo, mat);

            // Micro-variación rústica artesanal
            const slightTilt = Math.sin(p * 1.7) * 0.015;
            const slightYOffset = Math.sin(p * 2.3) * 0.012;

            plankMesh.position.set(px, deckY - (PLANK_THICKNESS * 0.5) + slightYOffset, pz);
            plankMesh.rotation.y = bridge.rotationY;
            plankMesh.rotation.x = slightTilt;
            plankMesh.castShadow = true;
            plankMesh.receiveShadow = true;

            bridgeGroup.add(plankMesh);
        }

        // Bordillos laterales longitudinales (guías de madera para afianzar el piso)
        [-hw + 0.08, hw - 0.08].forEach(curbOffset => {
            const curbPoints = [];
            for (let i = 0; i <= BEAM_SEGMENTS; i++) {
                const s = (i / BEAM_SEGMENTS) * L;
                const deckY = bridge.getDeckHeightAtS(s);
                const cx = bridge.startX + bridge.dirX * s + bridge.normalX * curbOffset;
                const cz = bridge.startZ + bridge.dirZ * s + bridge.normalZ * curbOffset;
                curbPoints.push(new THREE.Vector3(cx, deckY + 0.06, cz));
            }
            const curbCurve = new THREE.CatmullRomCurve3(curbPoints);
            const curbGeo = new THREE.TubeGeometry(curbCurve, BEAM_SEGMENTS, 0.09, 4, false);
            const curbMesh = new THREE.Mesh(curbGeo, railMaterial);
            curbMesh.castShadow = true;
            bridgeGroup.add(curbMesh);
        });

        // -------------------------------------------------------------
        // E. BARANDILLAS LATERALES EN AMBOS COSTADOS
        // -------------------------------------------------------------
        const POST_SPACING = 1.35; // Distancia entre postes verticales sucesivos
        const numPosts = Math.floor(L / POST_SPACING);

        [-hw, hw].forEach((sideOffset, sideIndex) => {
            const postGeo = new THREE.BoxGeometry(0.13, bridge.railHeight + 0.15, 0.13);
            const postPointsTop = [];
            const postPointsMid = [];

            for (let i = 0; i <= numPosts; i++) {
                const s = (i / numPosts) * L;
                const deckY = bridge.getDeckHeightAtS(s);
                const postX = bridge.startX + bridge.dirX * s + bridge.normalX * sideOffset;
                const postZ = bridge.startZ + bridge.dirZ * s + bridge.normalZ * sideOffset;
                const postY = deckY + (bridge.railHeight * 0.5);

                const postMesh = new THREE.Mesh(postGeo, railMaterial);
                postMesh.position.set(postX, postY, postZ);
                postMesh.rotation.y = bridge.rotationY;
                postMesh.castShadow = true;
                bridgeGroup.add(postMesh);

                // Puntos para generar pasamanos continuo superior e intermedio
                const topY = deckY + bridge.railHeight;
                const midY = deckY + (bridge.railHeight * 0.48);
                postPointsTop.push(new THREE.Vector3(postX, topY, postZ));
                postPointsMid.push(new THREE.Vector3(postX, midY, postZ));

                // Diagonales en cruz (aspa) entre postes consecutivos
                if (i > 0) {
                    const prevS = ((i - 1) / numPosts) * L;
                    const prevDeckY = bridge.getDeckHeightAtS(prevS);
                    const prevPostX = bridge.startX + bridge.dirX * prevS + bridge.normalX * sideOffset;
                    const prevPostZ = bridge.startZ + bridge.dirZ * prevS + bridge.normalZ * sideOffset;

                    const p1 = new THREE.Vector3(prevPostX, prevDeckY + 0.12, prevPostZ);
                    const p2 = new THREE.Vector3(postX, topY - 0.08, postZ);
                    const p3 = new THREE.Vector3(prevPostX, prevDeckY + bridge.railHeight - 0.08, prevPostZ);
                    const p4 = new THREE.Vector3(postX, deckY + 0.12, postZ);

                    // Aspa diagonal 1
                    const crossCurve1 = new THREE.LineCurve3(p1, p2);
                    const crossGeo1 = new THREE.TubeGeometry(crossCurve1, 1, 0.035, 4, false);
                    const crossMesh1 = new THREE.Mesh(crossGeo1, railMaterial);
                    bridgeGroup.add(crossMesh1);

                    // Aspa diagonal 2
                    const crossCurve2 = new THREE.LineCurve3(p3, p4);
                    const crossGeo2 = new THREE.TubeGeometry(crossCurve2, 1, 0.035, 4, false);
                    const crossMesh2 = new THREE.Mesh(crossGeo2, railMaterial);
                    bridgeGroup.add(crossMesh2);
                }
            }

            // Pasamanos superior continuo de madera redondeada
            const topCurve = new THREE.CatmullRomCurve3(postPointsTop);
            const topRailGeo = new THREE.TubeGeometry(topCurve, BEAM_SEGMENTS, 0.08, 6, false);
            const topRailMesh = new THREE.Mesh(topRailGeo, railMaterial);
            topRailMesh.castShadow = true;
            bridgeGroup.add(topRailMesh);

            // Travesaño intermedio continuo
            const midCurve = new THREE.CatmullRomCurve3(postPointsMid);
            const midRailGeo = new THREE.TubeGeometry(midCurve, BEAM_SEGMENTS, 0.05, 5, false);
            const midRailMesh = new THREE.Mesh(midRailGeo, railMaterial);
            bridgeGroup.add(midRailMesh);
        });

        bridgeMasterGroup.add(bridgeGroup);
        cameraObstacles.push(bridgeGroup);
    });

    scene.add(bridgeMasterGroup);
    console.log('[BridgeSystem] Puentes creados e integrados en la escena.');
}
