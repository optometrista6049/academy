import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { cameraObstacles, addCollidable } from '../entities/collisions.js';
import { createPolygonalStoneTexture } from './stoneTextureGenerator.js';
import { createPolygonalStoneGeometry } from './polygonalStoneGeometry.js';

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
                return true; // Bloqueado por la barandilla
            }
        }

        // 2. Si el jugador intenta entrar por el lateral desde fuera atravesando la barandilla o los postes
        // Rango ampliado desde s = -1.2 hasta length + 1.2 para sellar las esquinas de los postes de entrada
        const isNextInProtectedRange = next.s >= -1.0 && next.s <= (this.length + 1.0);
        if (isNextInProtectedRange && Math.abs(curr.d) > safeHalfWidth && Math.abs(next.d) <= safeHalfWidth) {
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
        new BridgeInstance(BRIDGE_3_CONFIG)
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
// CONSTRUCCIÓN VISUAL DEL PUENTE (ESTILO MIXTO: PIEDRA Y MADERA NOBLE)
// =========================================================================

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

    // 6. Material de forja negra para faroles
    const ironMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.50,
        metalness: 0.70
    });

    // 7. Material emisivo cálido para el cristal iluminado de los faroles
    const lanternGlassMaterial = new THREE.MeshStandardMaterial({
        color: 0xffe29a,
        emissive: 0xffaa33,
        emissiveIntensity: 0.85,
        roughness: 0.30,
        metalness: 0.10
    });

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

                // Capitel / remate moldurado de piedra
                const capGeo = new THREE.BoxGeometry(0.78, 0.22, 0.78);
                const capMesh = new THREE.Mesh(capGeo, darkStoneMaterial);
                capMesh.position.set(pillarX, pillarY + (pillarBlocks * pBlockH) + 0.25, pillarZ);
                capMesh.rotation.y = bridge.rotationY;
                capMesh.castShadow = true;
                bridgeGroup.add(capMesh);

                // Farol artesanal de forja y cristal ámbar
                const lanternGroup = new THREE.Group();
                lanternGroup.position.set(pillarX, pillarY + (pillarBlocks * pBlockH) + 0.65, pillarZ);

                // Soporte metálico inferior
                const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.25, 6);
                const postMesh = new THREE.Mesh(postGeo, ironMaterial);
                postMesh.position.y = -0.15;
                lanternGroup.add(postMesh);

                // Cristal del farol
                const glassGeo = new THREE.BoxGeometry(0.30, 0.35, 0.30);
                const glassMesh = new THREE.Mesh(glassGeo, lanternGlassMaterial);
                glassMesh.position.y = 0.12;
                lanternGroup.add(glassMesh);

                // Marco exterior de forja
                const frameGeo = new THREE.BoxGeometry(0.34, 0.38, 0.34);
                const frameWire = new THREE.Mesh(frameGeo, ironMaterial);
                frameWire.position.y = 0.12;
                frameWire.scale.set(1.02, 1.02, 1.02);
                lanternGroup.add(frameWire);

                // Tejadillo piramidal del farol
                const roofGeo = new THREE.ConeGeometry(0.28, 0.20, 4);
                roofGeo.rotateY(Math.PI / 4);
                const roofMesh = new THREE.Mesh(roofGeo, ironMaterial);
                roofMesh.position.y = 0.38;
                lanternGroup.add(roofMesh);

                // Luz puntual tenue cálida
                const lanternLight = new THREE.PointLight(0xffb86c, 0.85, 9.5, 1.4);
                lanternLight.position.set(0, 0.12, 0);
                lanternGroup.add(lanternLight);

                bridgeGroup.add(lanternGroup);

                // Colisionador para el pilar de esquina de entrada (evita entrar en él o quedar atascado)
                const cornerObstacle = {
                    position: new THREE.Vector3(pillarX, pillarY + 0.8, pillarZ),
                    userData: {
                        radius: 0.65,
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
