import * as THREE from 'three';
import { scene } from '../core/scene.js';
import {
    LAKE_CONFIG,
    river1Curve,
    river2Curve,
    torrentCurve,
    RIVER_WIDTH_1,
    RIVER_WIDTH_2,
    TORRENT_WIDTH
} from './waterSystem.js';

let waterMeshes = [];
let waterMaterial;

// ======================================================
// GENERAR MALLA DE CINTA DE RÍO SIGUIENDO LA CURVA
// ======================================================
function createRiverRibbon(curve, width, segments = 180, waterY = LAKE_CONFIG.waterY) {
    const points = curve.getPoints(segments);
    const tangents = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        tangents.push(curve.getTangentAt(t));
    }

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    // Creamos una franja de vértices (3 puntos transversales por segmento para suave curvatura)
    const transverseSubdivs = 4;
    const halfW = width * 0.5;

    for (let i = 0; i <= segments; i++) {
        const p = points[i];
        const tan = tangents[i];
        // Vector normal perpendicular a la tangente en el plano XZ
        const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

        for (let j = 0; j <= transverseSubdivs; j++) {
            const frac = (j / transverseSubdivs) * 2 - 1; // -1 a +1
            const x = p.x + norm.x * (frac * halfW);
            const z = p.z + norm.z * (frac * halfW);
            // Ligero arqueo hacia abajo en el centro para profundidad visual
            const yOffset = (1 - frac * frac) * -0.08;

            positions.push(x, waterY + yOffset, z);
            normals.push(0, 1, 0);
            uvs.push(j / transverseSubdivs, (i / segments) * 20);
        }
    }

    const rowSize = transverseSubdivs + 1;
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < transverseSubdivs; j++) {
            const a = i * rowSize + j;
            const b = (i + 1) * rowSize + j;
            const c = (i + 1) * rowSize + (j + 1);
            const d = i * rowSize + (j + 1);

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}

// ======================================================
// GENERAR MALLA DEL LAGO
// ======================================================
function createLakeGeometry() {
    // Geometría de disco de alta resolución con ligera escala elíptica
    // +4 unidades más ancha que el cauce para meterse bajo las orillas elevadas
    const geo = new THREE.CircleGeometry(LAKE_CONFIG.radiusX + 4.5, 64, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);

        // Escalar eje Z según el radio del lago
        const scaleZ = LAKE_CONFIG.radiusZ / LAKE_CONFIG.radiusX;
        pos.setZ(i, z * scaleZ);

        // Nivel de agua base
        pos.setY(i, LAKE_CONFIG.waterY);
    }
    geo.computeVertexNormals();
    return geo;
}

// ======================================================
// GENERAR ENSENADA / DESEMBOCADURA
// ======================================================
function createCoveGeometry(centerX, centerZ, radius = 22) {
    const geo = new THREE.CircleGeometry(radius, 32);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        pos.setY(i, LAKE_CONFIG.waterY);
    }
    geo.computeVertexNormals();
    return geo;
}

// ======================================================
// INICIALIZACIÓN DEL SISTEMA VISUAL DE AGUA
// ======================================================
export function createWater() {
    // Material de agua estilizado, translúcido y con brillo suave
    waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x2294bd,
        roughness: 0.15,
        metalness: 0.25,
        transparent: true,
        opacity: 0.88,
        depthWrite: true,
        side: THREE.DoubleSide
    });

    // 1. Malla del Lago
    const lakeGeo = createLakeGeometry();
    const lakeMesh = new THREE.Mesh(lakeGeo, waterMaterial);
    lakeMesh.position.set(LAKE_CONFIG.x, 0, LAKE_CONFIG.z);
    lakeMesh.receiveShadow = true;
    scene.add(lakeMesh);
    waterMeshes.push(lakeMesh);

    // 2. Malla del Río 1 (Noroeste) - Ancho extra para esconder bordes bajo las orillas
    const river1Geo = createRiverRibbon(river1Curve, RIVER_WIDTH_1 + 3.2, 160);
    const river1Mesh = new THREE.Mesh(river1Geo, waterMaterial);
    river1Mesh.receiveShadow = true;
    scene.add(river1Mesh);
    waterMeshes.push(river1Mesh);

    // 3. Malla del Río 2 (Sureste / Suroeste)
    const river2Geo = createRiverRibbon(river2Curve, RIVER_WIDTH_2 + 3.2, 160);
    const river2Mesh = new THREE.Mesh(river2Geo, waterMaterial);
    river2Mesh.receiveShadow = true;
    scene.add(river2Mesh);
    waterMeshes.push(river2Mesh);

    // 4. Malla del Torrente (alimenta al lago desde las montañas)
    const torrentGeo = createRiverRibbon(torrentCurve, TORRENT_WIDTH + 2.5, 40);
    const torrentMesh = new THREE.Mesh(torrentGeo, waterMaterial);
    torrentMesh.receiveShadow = true;
    scene.add(torrentMesh);
    waterMeshes.push(torrentMesh);

    // 5. Ensenadas terminales (Noroeste y Suroeste en la base montañosa)
    const cove1Geo = createCoveGeometry(-234, 192, 22);
    const cove1Mesh = new THREE.Mesh(cove1Geo, waterMaterial);
    cove1Mesh.position.set(-234, 0, 192);
    scene.add(cove1Mesh);
    waterMeshes.push(cove1Mesh);

    const cove2Geo = createCoveGeometry(-234, -206, 22);
    const cove2Mesh = new THREE.Mesh(cove2Geo, waterMaterial);
    cove2Mesh.position.set(-234, 0, -206);
    scene.add(cove2Mesh);
    waterMeshes.push(cove2Mesh);
}

// ======================================================
// ANIMACIÓN DE OLAS SUAVES EN EL AGUA
// ======================================================
let waveTime = 0;
export function updateWater(delta) {
    waveTime += delta * 2.2;
    if (!waterMaterial) return;

    // Sutil oscilación del color y brillo de la superficie acuática
    const brightness = 0.95 + Math.sin(waveTime * 0.8) * 0.05;
    waterMaterial.color.setRGB(
        0.13 * brightness,
        0.58 * brightness,
        0.75 * brightness
    );
}
