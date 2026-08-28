import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { WORLD_SIZE } from '../core/config.js';
import { getHeightAt } from './terrainHeight.js';
import { getWaterInfluence } from '../environment/waterSystem.js';
import { getPathInfluence } from '../environment/paths.js';

// ======================================================
// GEOMETRÍA DEL TERRENO (Alta resolución para cauces y caminos)
// ======================================================
const geo = new THREE.PlaneGeometry(
    WORLD_SIZE,
    WORLD_SIZE,
    220,
    220
);

geo.rotateX(-Math.PI / 2);

const pos = geo.attributes.position;
const colors = [];

// ======================================================
// HELPERS
// ======================================================
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function blendColor(c1, c2, t) {
    const clampedT = Math.max(0, Math.min(1, t));
    return new THREE.Color(
        lerp(c1.r, c2.r, clampedT),
        lerp(c1.g, c2.g, clampedT),
        lerp(c1.b, c2.b, clampedT)
    );
}

// ======================================================
// PALETA DE COLORES
// ======================================================
const riverBedDark = new THREE.Color(0x283b32); // Fondo oscuro bajo agua
const riverSand = new THREE.Color(0x8a7b5d);    // Arena de ribera
const pathDirt = new THREE.Color(0x8b7355);     // Tierra de caminos transitados
const pathPebbles = new THREE.Color(0xa28d6c);  // Grava y piedra de sendero
const grassDark = new THREE.Color(0x325936);    // Hierba profunda
const grass = new THREE.Color(0x478b47);        // Hierba pradera
const grassLight = new THREE.Color(0x65a84e);   // Hierba soleada
const dirt = new THREE.Color(0x76664d);         // Tierra y desnivel
const rock = new THREE.Color(0x6c6c6c);         // Roca
const rockLight = new THREE.Color(0x949494);    // Roca clara
const snow = new THREE.Color(0xf5f7fa);         // Nieve en cumbres

// ======================================================
// COLOREADO Y ESCULPIDO DEL TERRENO
// ======================================================
for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    const h = getHeightAt(x, z);
    pos.setY(i, h);

    const noise =
        Math.sin(x * 0.08) * 0.5 +
        Math.cos(z * 0.08) * 0.5 +
        Math.sin((x + z) * 0.03);

    const waterInfo = getWaterInfluence(x, z);
    const pathFactor = getPathInfluence(x, z);

    let color;

    // 1. Zona bajo agua / Lecho del río o lago
    if (waterInfo.inWater) {
        color = blendColor(riverBedDark, riverSand, 0.3 + noise * 0.1);
    }
    // 2. Orilla inmediata del agua (arena / grava húmeda)
    else if (waterInfo.bankFactor > 0.4) {
        const sandT = (waterInfo.bankFactor - 0.4) / 0.6;
        const baseGrassColor = blendColor(grassDark, grass, 0.5 + noise * 0.15);
        color = blendColor(baseGrassColor, riverSand, sandT * 0.85);
    }
    // 3. Senderos y Caminos definidos
    else if (pathFactor > 0.05) {
        const baseGrassColor = blendColor(grass, grassLight, 0.5 + noise * 0.2);
        const roadColor = blendColor(pathDirt, pathPebbles, 0.4 + noise * 0.2);
        color = blendColor(baseGrassColor, roadColor, pathFactor);
    }
    // 4. Hierba Baja / Planicie
    else if (h < 1) {
        color = blendColor(grassDark, grass, 0.45 + noise * 0.15);
    }
    // 5. Hierba Media
    else if (h < 3.2) {
        color = blendColor(grass, grassLight, 0.5 + noise * 0.2);
    }
    // 6. Colinas / Transición a tierra
    else if (h < 5.5) {
        color = blendColor(grassLight, dirt, 0.45 + noise * 0.2);
    }
    // 7. Zonas rocosas altas
    else if (h < 8.5) {
        color = blendColor(rock, rockLight, 0.5 + noise * 0.15);
    }
    // 8. Cumbres con nieve
    else {
        color = blendColor(rockLight, snow, 0.6 + noise * 0.1);
    }

    colors.push(color.r, color.g, color.b);
}

// ======================================================
// APLICAR ATRIBUTOS Y NORMALES
// ======================================================
geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
geo.computeVertexNormals();

// ======================================================
// MATERIAL Y MALLA
// ======================================================
const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.05
});

export const terrain = new THREE.Mesh(geo, material);
terrain.receiveShadow = true;
scene.add(terrain);
