import * as THREE from 'three';

// ======================================================
// RED DE CAMINOS Y SENDEROS DE ACADEMY
// ======================================================
// Segmentos que conectan la Plaza Central, NPCs, Puentes, Rocas y Lago
export const PATH_SEGMENTS = [
    // 1. Centro (0,0) hacia Puente 1A (Noroeste próximo)
    [
        new THREE.Vector3(0, 0, 5),
        new THREE.Vector3(15, 0, 45),
        new THREE.Vector3(30, 0, 95),
        new THREE.Vector3(45, 0, 140),
        new THREE.Vector3(58, 0, 185) // Acceso a Puente 1A
    ],
    // 2. Centro (0,0) hacia Puente 1B (Noroeste lejano)
    [
        new THREE.Vector3(-4, 0, 2),
        new THREE.Vector3(-35, 0, 30),
        new THREE.Vector3(-75, 0, 70),
        new THREE.Vector3(-110, 0, 105),
        new THREE.Vector3(-140, 0, 138) // Acceso a Puente 1B
    ],
    // 3. Centro (0,0) hacia Puente 2A (Sureste) pasando cerca de Rocas Antiguas
    [
        new THREE.Vector3(4, 0, 2),
        new THREE.Vector3(35, 0, 10),
        new THREE.Vector3(68, 0, 14), // Bifurcación cerca de Rocas (78, 22)
        new THREE.Vector3(98, 0, 8),
        new THREE.Vector3(126, 0, -2)  // Acceso a Puente 2A
    ],
    // 4. Centro (0,0) hacia Puente 2B (Suroeste)
    [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-5, 0, -35),
        new THREE.Vector3(-10, 0, -80),
        new THREE.Vector3(-15, 0, -120),
        new THREE.Vector3(-22, 0, -155) // Acceso a Puente 2B
    ],
    // 5. Sendero desde Rocas Antiguas (78, 22) hacia el Lago (160, 168)
    [
        new THREE.Vector3(78, 0, 22),
        new THREE.Vector3(105, 0, 60),
        new THREE.Vector3(128, 0, 105),
        new THREE.Vector3(145, 0, 145),
        new THREE.Vector3(155, 0, 162) // Orilla del lago
    ],
    // 6. Conexión entre Puente 1A y el Lago
    [
        new THREE.Vector3(65, 0, 186),
        new THREE.Vector3(95, 0, 175),
        new THREE.Vector3(135, 0, 165)
    ],
    // 7. Conexión entre Puente 2A y Puente 2B por el sur
    [
        new THREE.Vector3(122, 0, -10),
        new THREE.Vector3(80, 0, -60),
        new THREE.Vector3(35, 0, -105),
        new THREE.Vector3(-18, 0, -150)
    ]
];

// Curvas precalculadas
const pathCurves = PATH_SEGMENTS.map(
    pts => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15)
);

const pathSampledPoints = pathCurves.map(curve => curve.getPoints(60));

export const PATH_WIDTH = 4.2;

function distToSegmentSq(px, pz, ax, az, bx, bz) {
    const l2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
    if (l2 === 0) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
    let t = ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / l2;
    t = Math.max(0, Math.min(1, t));
    const nx = ax + t * (bx - ax);
    const nz = az + t * (bz - az);
    const dx = px - nx;
    const dz = pz - nz;
    return dx * dx + dz * dz;
}

export function getPathInfluence(x, z) {
    // Distancia mínima a cualquier camino
    let minDistSq = Infinity;

    for (const points of pathSampledPoints) {
        for (let i = 0; i < points.length - 1; i++) {
            const dSq = distToSegmentSq(
                x, z,
                points[i].x, points[i].z,
                points[i + 1].x, points[i + 1].z
            );
            if (dSq < minDistSq) {
                minDistSq = dSq;
            }
        }
    }

    const dist = Math.sqrt(minDistSq);

    // En la plaza central (alrededor de 0,0 donde están los NPCs)
    const distCenter = Math.hypot(x, z);
    let centerPlazaFactor = 0;
    if (distCenter < 18) {
        centerPlazaFactor = Math.max(0, 1 - distCenter / 18);
    }

    const halfW = PATH_WIDTH * 0.5;
    let pathFactor = 0;
    if (dist < halfW) {
        pathFactor = 1.0;
    } else if (dist < halfW + 2.5) {
        pathFactor = 1.0 - (dist - halfW) / 2.5;
    }

    return Math.max(pathFactor, centerPlazaFactor);
}
