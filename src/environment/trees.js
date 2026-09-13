import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { rand } from '../utils/random.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { addCollidable, cameraObstacles } from '../entities/collisions.js';
import {
    LAKE_CENTER_X,
    LAKE_CENTER_Z,
    LAKE_RADIUS
} from '../terrain/terrainHeight.js';
import {
    isPointNearRiver
} from '../terrain/riverPath.js';
import {
    isPointNearBridge
} from './bridgeSystem.js';

// =====================================
// GEOMETRY HELPERS (100% Procedural Three.js)
// =====================================
function toNonIndexed(geo) {
    return geo.index ? geo.toNonIndexed() : geo;
}

function mergeNonIndexedGeometries(geometries) {
    const validGeos = geometries.map(g => g.index ? g.toNonIndexed() : g);
    let totalPositions = 0;
    for (const g of validGeos) {
        totalPositions += g.attributes.position.array.length;
    }

    const mergedPos = new Float32Array(totalPositions);
    let posOffset = 0;
    for (const g of validGeos) {
        mergedPos.set(g.attributes.position.array, posOffset);
        posOffset += g.attributes.position.array.length;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    merged.computeVertexNormals();
    return merged;
}

/**
 * Genera un tronco retorcido y estriado mediante una curva spline 3D
 * con torsión longitudinal en la corteza (efecto leñoso sinuoso natural)
 */
function createTwistedTrunk(points, radiusBottom, radiusTop, tubularSegments = 8, radialSegs = 6) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, tubularSegments, radiusBottom, radialSegs, false);
    const pos = geo.attributes.position;
    const pOnCurve = new THREE.Vector3();

    for (let i = 0; i <= tubularSegments; i++) {
        const u = i / tubularSegments;
        const rad = THREE.MathUtils.lerp(radiusBottom, radiusTop, u);
        curve.getPointAt(u, pOnCurve);

        for (let j = 0; j <= radialSegs; j++) {
            const idx = i * (radialSegs + 1) + j;
            if (idx >= pos.count) break;

            let x = pos.getX(idx);
            let y = pos.getY(idx);
            let z = pos.getZ(idx);

            let vx = x - pOnCurve.x;
            let vy = y - pOnCurve.y;
            let vz = z - pOnCurve.z;
            const currentDist = Math.hypot(vx, vy, vz);
            if (currentDist > 0.0001) {
                const factor = rad / currentDist;
                const angle = Math.atan2(vz, vx);
                // Relieve helicoidal de corteza retorcida
                const ridge = 1.0 + Math.sin(angle * 3 + u * Math.PI * 3.5) * 0.12;
                x = pOnCurve.x + vx * factor * ridge;
                y = pOnCurve.y + vy * factor * ridge;
                z = pOnCurve.z + vz * factor * ridge;
            }
            pos.setXYZ(idx, x, y, z);
        }
    }
    geo.computeVertexNormals();
    return toNonIndexed(geo);
}

/**
 * Crea una raíz en contrafuerte (buttress root) que brota del tronco
 * y se extiende curvándose hacia abajo en el terreno (y = -0.5m)
 */
function createRoot(angle, baseRadius, rootSpread, rootThick) {
    const rootLen = rootSpread * 1.15;
    const geo = new THREE.CylinderGeometry(rootThick * 0.45, rootThick, rootLen, 6);
    const start = new THREE.Vector3(Math.cos(angle) * baseRadius * 0.65, 0.25, Math.sin(angle) * baseRadius * 0.65);
    const end = new THREE.Vector3(Math.cos(angle) * (baseRadius + rootSpread), -0.50, Math.sin(angle) * (baseRadius + rootSpread));

    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();

    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const mat = new THREE.Matrix4().makeRotationFromQuaternion(quat);
    mat.setPosition(mid);
    geo.applyMatrix4(mat);
    return toNonIndexed(geo);
}

/**
 * Crea una rama principal leñosa que conecta el tronco con el corazón de la copa
 */
function createBranch(start, end, thickBase, thickTip) {
    const len = start.distanceTo(end);
    const geo = new THREE.CylinderGeometry(thickTip, thickBase, len, 6);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();

    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mat = new THREE.Matrix4().makeRotationFromQuaternion(quat);
    mat.setPosition(mid);
    geo.applyMatrix4(mat);
    return toNonIndexed(geo);
}

/**
 * Crea un racimo poliédrico de follaje facetado (Foliage Cluster - Imágenes 2 y 3)
 * con sutil ruido armónico y aplanamiento basal
 */
function createOrganicCluster(radius, detail = 1, squish = 0.82) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);

        if (y < 0) y *= squish;
        const n = 1.0 + Math.sin(x * 2.2 + y * 1.8) * 0.14 + Math.cos(z * 2.5) * 0.10;
        x *= n;
        y *= n;
        z *= n;

        pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return toNonIndexed(geo);
}

// =====================================
// TREE ARCHETYPES DEFINITION (Árboles Frondosos y Silvestres Esculpidos)
// =====================================
function buildTreeArchetypes() {
    const archetypes = [];

    // -------------------------------------------------------------
    // 0: Gran Roble Ancestral Retorcido (Ancient Gnarled Oak - Imagen 3)
    // Tronco robusto con torsión sinuosa, 5 raíces y monumental copa de 6 racimos
    // -------------------------------------------------------------
    {
        const trunkGeos = [];
        const pts = [
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(0.22, 0.7, -0.15),
            new THREE.Vector3(-0.18, 1.8, 0.20),
            new THREE.Vector3(0.12, 2.9, 0.10)
        ];
        trunkGeos.push(createTwistedTrunk(pts, 0.58, 0.36, 8, 6));

        for (let i = 0; i < 5; i++) {
            trunkGeos.push(createRoot((i / 5) * Math.PI * 2 + 0.15, 0.58, 1.3, 0.24));
        }
        trunkGeos.push(createBranch(new THREE.Vector3(0.12, 2.8, 0.1), new THREE.Vector3(1.2, 3.8, 0.4), 0.26, 0.15));
        trunkGeos.push(createBranch(new THREE.Vector3(0.12, 2.9, 0.1), new THREE.Vector3(-1.1, 4.0, 0.6), 0.24, 0.14));
        trunkGeos.push(createBranch(new THREE.Vector3(0.12, 2.8, 0.1), new THREE.Vector3(0.2, 3.9, -1.2), 0.24, 0.14));

        const trunk = mergeNonIndexedGeometries(trunkGeos);

        const foliageGeos = [];
        const cCenter = createOrganicCluster(1.85); cCenter.translate(0.1, 4.8, 0); foliageGeos.push(cCenter);
        const c1 = createOrganicCluster(1.55); c1.translate(1.3, 4.0, 0.5); foliageGeos.push(c1);
        const c2 = createOrganicCluster(1.50); c2.translate(-1.2, 4.2, 0.7); foliageGeos.push(c2);
        const c3 = createOrganicCluster(1.50); c3.translate(0.3, 4.1, -1.3); foliageGeos.push(c3);
        const c4 = createOrganicCluster(1.35); c4.translate(-0.5, 4.0, -0.9); foliageGeos.push(c4);
        const cTop = createOrganicCluster(1.45); cTop.translate(0.15, 5.9, 0.1); foliageGeos.push(cTop);

        const foliage = mergeNonIndexedGeometries(foliageGeos);

        archetypes.push({
            trunk,
            foliage,
            radius: 0.88,
            trunkColors: [new THREE.Color(0x3e2614), new THREE.Color(0x482d18), new THREE.Color(0x361f10)],
            leafColors: [new THREE.Color(0x20562c), new THREE.Color(0x1a4a25), new THREE.Color(0x276333)]
        });
    }

    // -------------------------------------------------------------
    // 1: Bonsái Silvestre / Sauce Sinuoso Inclinado (Imagen 2)
    // Fuerte curvatura en "S", tronco rojizo-caoba y copa en cascada escalonada
    // -------------------------------------------------------------
    {
        const trunkGeos = [];
        const pts = [
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(0.48, 0.8, -0.2),
            new THREE.Vector3(-0.35, 1.8, 0.28),
            new THREE.Vector3(0.65, 2.7, 0.12)
        ];
        trunkGeos.push(createTwistedTrunk(pts, 0.50, 0.28, 8, 6));

        for (let i = 0; i < 4; i++) {
            trunkGeos.push(createRoot((i / 4) * Math.PI * 2 + 0.3, 0.50, 1.2, 0.20));
        }
        trunkGeos.push(createBranch(new THREE.Vector3(0.55, 2.5, 0.1), new THREE.Vector3(1.4, 3.4, 0.3), 0.22, 0.12));
        trunkGeos.push(createBranch(new THREE.Vector3(0.40, 2.6, 0.1), new THREE.Vector3(-0.5, 3.5, -0.5), 0.20, 0.11));

        const trunk = mergeNonIndexedGeometries(trunkGeos);

        const foliageGeos = [];
        const cCenter = createOrganicCluster(1.55); cCenter.translate(0.6, 3.9, 0.1); foliageGeos.push(cCenter);
        const c1 = createOrganicCluster(1.35); c1.translate(1.5, 3.4, 0.4); foliageGeos.push(c1);
        const c2 = createOrganicCluster(1.30); c2.translate(-0.5, 3.6, -0.5); foliageGeos.push(c2);
        const c3 = createOrganicCluster(1.20); c3.translate(0.2, 3.7, 0.8); foliageGeos.push(c3);
        const cTop = createOrganicCluster(1.25); cTop.translate(0.7, 4.9, 0.0); foliageGeos.push(cTop);

        const foliage = mergeNonIndexedGeometries(foliageGeos);

        archetypes.push({
            trunk,
            foliage,
            radius: 0.72,
            trunkColors: [new THREE.Color(0x6b3719), new THREE.Color(0x783e1c), new THREE.Color(0x5d2f14)],
            leafColors: [new THREE.Color(0x3da64f), new THREE.Color(0x48b65a), new THREE.Color(0x329343)]
        });
    }

    // -------------------------------------------------------------
    // 2: Árbol Bifurcado en Doble Horquilla (Twin Gnarled Trunks)
    // Base gruesa que se divide en 2 troncos retorcidos divergentes en "V"
    // -------------------------------------------------------------
    {
        const trunkGeos = [];
        // Tronco base
        const basePts = [
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(0.04, 0.5, 0.0),
            new THREE.Vector3(0, 1.2, 0)
        ];
        trunkGeos.push(createTwistedTrunk(basePts, 0.55, 0.42, 6, 6));

        // Brazo izquierdo bifurcado
        const fork1Pts = [
            new THREE.Vector3(0, 1.2, 0),
            new THREE.Vector3(-0.45, 2.0, 0.25),
            new THREE.Vector3(-0.85, 2.9, 0.45)
        ];
        trunkGeos.push(createTwistedTrunk(fork1Pts, 0.34, 0.22, 6, 6));

        // Brazo derecho bifurcado
        const fork2Pts = [
            new THREE.Vector3(0, 1.2, 0),
            new THREE.Vector3(0.50, 2.1, -0.28),
            new THREE.Vector3(0.92, 3.0, -0.52)
        ];
        trunkGeos.push(createTwistedTrunk(fork2Pts, 0.34, 0.22, 6, 6));

        for (let i = 0; i < 5; i++) {
            trunkGeos.push(createRoot((i / 5) * Math.PI * 2 + 0.2, 0.55, 1.15, 0.21));
        }

        const trunk = mergeNonIndexedGeometries(trunkGeos);

        const foliageGeos = [];
        // Doble cúpula conectada
        const cFork1 = createOrganicCluster(1.50); cFork1.translate(-0.9, 3.8, 0.5); foliageGeos.push(cFork1);
        const cFork1b = createOrganicCluster(1.30); cFork1b.translate(-1.4, 3.3, 0.6); foliageGeos.push(cFork1b);
        const cFork2 = createOrganicCluster(1.50); cFork2.translate(0.95, 3.9, -0.55); foliageGeos.push(cFork2);
        const cFork2b = createOrganicCluster(1.30); cFork2b.translate(1.45, 3.4, -0.6); foliageGeos.push(cFork2b);
        const cMid = createOrganicCluster(1.40); cMid.translate(0.0, 3.9, 0.0); foliageGeos.push(cMid);
        const cTop = createOrganicCluster(1.25); cTop.translate(0.1, 4.8, 0.0); foliageGeos.push(cTop);

        const foliage = mergeNonIndexedGeometries(foliageGeos);

        archetypes.push({
            trunk,
            foliage,
            radius: 0.76,
            trunkColors: [new THREE.Color(0x4e3923), new THREE.Color(0x563f28), new THREE.Color(0x44311e)],
            leafColors: [new THREE.Color(0x496e42), new THREE.Color(0x547c4b), new THREE.Color(0x3e5e37)]
        });
    }

    // -------------------------------------------------------------
    // 3: Roble Monumental de Copa Ancha Aparasolada (Umbrella Oak - Imagen 3)
    // Tronco bajo y recio con 4 ramas horizontales y copa muy extensa
    // -------------------------------------------------------------
    {
        const trunkGeos = [];
        const pts = [
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(-0.08, 0.7, 0.06),
            new THREE.Vector3(0.05, 1.6, -0.05),
            new THREE.Vector3(0, 2.4, 0)
        ];
        trunkGeos.push(createTwistedTrunk(pts, 0.52, 0.38, 6, 6));

        for (let i = 0; i < 4; i++) {
            trunkGeos.push(createRoot((i / 4) * Math.PI * 2 + 0.4, 0.52, 1.25, 0.22));
        }
        trunkGeos.push(createBranch(new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(1.3, 2.9, 0.6), 0.22, 0.13));
        trunkGeos.push(createBranch(new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(-1.3, 2.9, -0.5), 0.22, 0.13));
        trunkGeos.push(createBranch(new THREE.Vector3(0, 2.3, 0), new THREE.Vector3(0.5, 3.0, -1.3), 0.21, 0.12));
        trunkGeos.push(createBranch(new THREE.Vector3(0, 2.3, 0), new THREE.Vector3(-0.5, 3.0, 1.3), 0.21, 0.12));

        const trunk = mergeNonIndexedGeometries(trunkGeos);

        const foliageGeos = [];
        const cCenter = createOrganicCluster(1.9, 1, 0.75); cCenter.translate(0, 3.7, 0); foliageGeos.push(cCenter);
        const c1 = createOrganicCluster(1.5, 1, 0.78); c1.translate(1.4, 3.3, 0.6); foliageGeos.push(c1);
        const c2 = createOrganicCluster(1.5, 1, 0.78); c2.translate(-1.4, 3.3, -0.5); foliageGeos.push(c2);
        const c3 = createOrganicCluster(1.45, 1, 0.78); c3.translate(0.5, 3.4, -1.4); foliageGeos.push(c3);
        const c4 = createOrganicCluster(1.45, 1, 0.78); c4.translate(-0.5, 3.4, 1.4); foliageGeos.push(c4);
        const cTop = createOrganicCluster(1.4, 1, 0.82); cTop.translate(0, 4.6, 0); foliageGeos.push(cTop);

        const foliage = mergeNonIndexedGeometries(foliageGeos);

        archetypes.push({
            trunk,
            foliage,
            radius: 0.80,
            trunkColors: [new THREE.Color(0x341f0f), new THREE.Color(0x3b2413), new THREE.Color(0x2e1a0c)],
            leafColors: [new THREE.Color(0x2b7937), new THREE.Color(0x348742), new THREE.Color(0x24682e)]
        });
    }

    // -------------------------------------------------------------
    // 4: Abedul / Fresno Silvestre Esbelto y Curvo (Windblown Birch/Ash)
    // Tronco esbelto con corteza ceniza/grisáceo clara y hojas lima-doradas
    // -------------------------------------------------------------
    {
        const trunkGeos = [];
        const pts = [
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(0.20, 1.0, 0.15),
            new THREE.Vector3(0.42, 2.2, 0.28),
            new THREE.Vector3(0.28, 3.3, 0.20)
        ];
        trunkGeos.push(createTwistedTrunk(pts, 0.36, 0.22, 8, 6));

        for (let i = 0; i < 3; i++) {
            trunkGeos.push(createRoot((i / 3) * Math.PI * 2 + 0.1, 0.36, 0.95, 0.16));
        }
        trunkGeos.push(createBranch(new THREE.Vector3(0.35, 2.8, 0.2), new THREE.Vector3(0.9, 3.7, 0.4), 0.17, 0.10));
        trunkGeos.push(createBranch(new THREE.Vector3(0.30, 2.9, 0.2), new THREE.Vector3(-0.4, 3.8, -0.2), 0.16, 0.10));

        const trunk = mergeNonIndexedGeometries(trunkGeos);

        const foliageGeos = [];
        const cCenter = createOrganicCluster(1.40); cCenter.translate(0.3, 4.3, 0.2); foliageGeos.push(cCenter);
        const c1 = createOrganicCluster(1.15); c1.translate(1.0, 3.9, 0.4); foliageGeos.push(c1);
        const c2 = createOrganicCluster(1.15); c2.translate(-0.4, 4.0, -0.2); foliageGeos.push(c2);
        const c3 = createOrganicCluster(1.05); c3.translate(0.1, 3.9, 0.8); foliageGeos.push(c3);
        const cTop = createOrganicCluster(1.15); cTop.translate(0.35, 5.2, 0.15); foliageGeos.push(cTop);

        const foliage = mergeNonIndexedGeometries(foliageGeos);

        archetypes.push({
            trunk,
            foliage,
            radius: 0.55,
            trunkColors: [new THREE.Color(0x887763), new THREE.Color(0x94826d), new THREE.Color(0x7c6c59)],
            leafColors: [new THREE.Color(0x68ab38), new THREE.Color(0x78b840), new THREE.Color(0x59962e)]
        });
    }

    // -------------------------------------------------------------
    // 5: Roble Nudoso Bajo Retorcido (Knotty Lowland Tree)
    // Tronco en sacacorchos, madera castaño cálida y hojas ámbar-otoñales
    // -------------------------------------------------------------
    {
        const trunkGeos = [];
        const pts = [
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(-0.25, 0.7, 0.2),
            new THREE.Vector3(0.22, 1.5, -0.15),
            new THREE.Vector3(-0.08, 2.3, 0.05)
        ];
        trunkGeos.push(createTwistedTrunk(pts, 0.46, 0.32, 8, 6));

        for (let i = 0; i < 4; i++) {
            trunkGeos.push(createRoot((i / 4) * Math.PI * 2 + 0.35, 0.46, 1.05, 0.19));
        }
        trunkGeos.push(createBranch(new THREE.Vector3(-0.05, 2.0, 0.05), new THREE.Vector3(0.8, 2.9, 0.4), 0.19, 0.11));
        trunkGeos.push(createBranch(new THREE.Vector3(-0.05, 2.0, 0.05), new THREE.Vector3(-0.8, 2.9, -0.4), 0.19, 0.11));

        const trunk = mergeNonIndexedGeometries(trunkGeos);

        const foliageGeos = [];
        const cCenter = createOrganicCluster(1.50); cCenter.translate(-0.1, 3.5, 0); foliageGeos.push(cCenter);
        const c1 = createOrganicCluster(1.25); c1.translate(0.9, 3.0, 0.4); foliageGeos.push(c1);
        const c2 = createOrganicCluster(1.25); c2.translate(-0.9, 3.1, -0.4); foliageGeos.push(c2);
        const c3 = createOrganicCluster(1.15); c3.translate(0.1, 3.1, 0.8); foliageGeos.push(c3);
        const cTop = createOrganicCluster(1.25); cTop.translate(-0.05, 4.5, 0); foliageGeos.push(cTop);

        const foliage = mergeNonIndexedGeometries(foliageGeos);

        archetypes.push({
            trunk,
            foliage,
            radius: 0.65,
            trunkColors: [new THREE.Color(0x5c3518), new THREE.Color(0x653b1c), new THREE.Color(0x522e13)],
            leafColors: [new THREE.Color(0x5c7c2b), new THREE.Color(0x6a8a32), new THREE.Color(0x4e6d24)]
        });
    }

    // -------------------------------------------------------------
    // 6: Árbol Joven Silvestre (Young Grove Tree)
    // Torsión suave juvenil, madera avellana clara y hojas verde prado vivo
    // -------------------------------------------------------------
    {
        const trunkGeos = [];
        const pts = [
            new THREE.Vector3(0, -0.55, 0),
            new THREE.Vector3(0.12, 0.7, -0.1),
            new THREE.Vector3(-0.10, 1.5, 0.1),
            new THREE.Vector3(0.08, 2.3, 0)
        ];
        trunkGeos.push(createTwistedTrunk(pts, 0.38, 0.26, 6, 6));

        for (let i = 0; i < 3; i++) {
            trunkGeos.push(createRoot((i / 3) * Math.PI * 2 + 0.2, 0.38, 0.85, 0.16));
        }
        trunkGeos.push(createBranch(new THREE.Vector3(0.08, 2.0, 0), new THREE.Vector3(0.65, 2.7, 0.3), 0.17, 0.10));

        const trunk = mergeNonIndexedGeometries(trunkGeos);

        const foliageGeos = [];
        const cCenter = createOrganicCluster(1.35); cCenter.translate(0.1, 3.1, 0); foliageGeos.push(cCenter);
        const c1 = createOrganicCluster(1.15); c1.translate(0.7, 2.8, 0.3); foliageGeos.push(c1);
        const c2 = createOrganicCluster(1.05); c2.translate(-0.6, 2.8, -0.3); foliageGeos.push(c2);
        const cTop = createOrganicCluster(1.10); cTop.translate(0.1, 4.0, 0); foliageGeos.push(cTop);

        const foliage = mergeNonIndexedGeometries(foliageGeos);

        archetypes.push({
            trunk,
            foliage,
            radius: 0.52,
            trunkColors: [new THREE.Color(0x6d4e2e), new THREE.Color(0x775634), new THREE.Color(0x5e4225)],
            leafColors: [new THREE.Color(0x42a850), new THREE.Color(0x4ebb5c), new THREE.Color(0x379644)]
        });
    }

    return archetypes;
}

// =====================================
// FOREST GENERATION WITH INSTANCED MESH
// =====================================
export function createForest() {
    const archetypes = buildTreeArchetypes();
    const archetypeCount = archetypes.length;

    // Cubos para agrupar instancias por arquetipo
    const instanceBuckets = Array.from({ length: archetypeCount }, () => []);

    const placedTrees = [];
    const TARGET_TREES = 96;
    const MAX_CANDIDATES = 400;

    for (let c = 0; c < MAX_CANDIDATES && placedTrees.length < TARGET_TREES; c++) {
        // Rango acotado al valle interior fértil (excluyendo cordilleras periféricas |x| > 200, |z| > 200)
        const x = (rand() - 0.5) * 390;
        const z = (rand() - 0.5) * 390;

        // 1. Exclusión estricta de montañas periféricas
        if (Math.abs(x) > 195 || Math.abs(z) > 195) continue;

        // 2. Comprobación de altura en terreno procedural
        const y = getHeightAt(x, z);

        // Sin árboles en acantilados rocosos altos ni bajo el nivel del agua
        if (y > 7.5 || y < -1.5) {
            continue;
        }

        // 3. Exclusión de zona de spawn y aldea central de NPCs
        if (Math.abs(x) < 26 && Math.abs(z) < 24) {
            continue;
        }

        // 4. Exclusión del Gran Lago (con margen holgado para no tocar orillas ni agua)
        const distToLake = Math.hypot(x - LAKE_CENTER_X, z - LAKE_CENTER_Z);
        if (distToLake < LAKE_RADIUS + 6.0) {
            continue;
        }

        // 5. Exclusión del cauce del río y sus riberas inmediatas
        if (isPointNearRiver(x, z, 10.5)) {
            continue;
        }

        // 6. Exclusión del puente, pilares y rampas de acceso
        if (isPointNearBridge(x, z, 6.0)) {
            continue;
        }

        // 7. Exclusión del monumento / círculo de Rocas Ancestrales (x: 78, z: 14)
        if (Math.hypot(x - 78, z - 14) < 16.0) {
            continue;
        }

        // 8. Exclusión del nacimiento del afluente (x: 233, z: 222)
        if (Math.hypot(x - 233, z - 222) < 25.0) {
            continue;
        }

        // 9. Separación natural entre árboles adyacentes para evitar solapamiento de troncos
        let tooClose = false;
        for (let j = 0; j < placedTrees.length; j++) {
            if (Math.hypot(x - placedTrees[j].x, z - placedTrees[j].z) < 6.2) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        // Selección de arquetipo
        const variant = Math.floor(rand() * archetypeCount);
        const arch = archetypes[variant];

        // Variación de color individual por árbol según el arquetipo
        const trunkColor = arch.trunkColors[Math.floor(rand() * arch.trunkColors.length)];
        const leafColor = arch.leafColors[Math.floor(rand() * arch.leafColors.length)];

        const rotY = rand() * Math.PI * 2;
        const scale = 0.92 + rand() * 0.22;

        placedTrees.push({ x, z });

        instanceBuckets[variant].push({
            x,
            y,
            z,
            rotY,
            scale,
            trunkColor,
            leafColor
        });

        // Registro de colisión física en el Spatial Hash Grid calibrado al tronco de madera
        const radius = arch.radius * scale;
        addCollidable({
            position: new THREE.Vector3(x, y, z),
            userData: {
                radius
            }
        });
    }

    // Materiales compartidos modulados por color de instancia (1 Draw Call para troncos y 1 para hojas por arquetipo)
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, // Modulado por instanceColor en trunkMesh
        roughness: 0.92,
        metalness: 0.04,
        flatShading: true
    });

    const leavesMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, // Modulado por instanceColor en foliageMesh
        roughness: 0.84,
        metalness: 0.05,
        flatShading: true // Sombreado facetado 3D profundo
    });

    const dummy = new THREE.Object3D();

    for (let archIdx = 0; archIdx < archetypeCount; archIdx++) {
        const bucket = instanceBuckets[archIdx];
        if (bucket.length === 0) continue;

        const { trunk, foliage } = archetypes[archIdx];

        const trunkMesh = new THREE.InstancedMesh(trunk, trunkMaterial, bucket.length);
        trunkMesh.castShadow = true;
        trunkMesh.receiveShadow = false;

        const foliageMesh = new THREE.InstancedMesh(foliage, leavesMaterial, bucket.length);
        foliageMesh.castShadow = true;
        foliageMesh.receiveShadow = false;

        for (let i = 0; i < bucket.length; i++) {
            const inst = bucket[i];

            dummy.position.set(inst.x, inst.y, inst.z);
            dummy.rotation.set(0, inst.rotY, 0);
            dummy.scale.set(inst.scale, inst.scale, inst.scale);
            dummy.updateMatrix();

            trunkMesh.setMatrixAt(i, dummy.matrix);
            foliageMesh.setMatrixAt(i, dummy.matrix);

            trunkMesh.setColorAt(i, inst.trunkColor);
            foliageMesh.setColorAt(i, inst.leafColor);
        }

        trunkMesh.instanceMatrix.needsUpdate = true;
        foliageMesh.instanceMatrix.needsUpdate = true;
        if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
        if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;

        scene.add(trunkMesh);
        scene.add(foliageMesh);
        cameraObstacles.push(trunkMesh, foliageMesh);
    }
}
