import * as THREE from 'three';
import { scene } from '../core/scene.js';
import {
    riverSpline,
    RIVER_HALF_WIDTH
} from '../terrain/riverPath.js';
import { createWaterMaterial, registerWaterMaterial } from './waterSystem.js';

let riverMesh = null;
let riverMaterial = null;

export function createRiver() {
    const lengthSegments = 160;
    const widthSegments = 12;
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const normals = [];
    const indices = [];

    // Tramos a lo largo del spline (desde t=0.0 dentro de las montañas hasta t=0.94 dentro del borde del lago)
    const tStart = 0.0;
    const tEnd = 0.94;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFraction = i / lengthSegments;
        const t = tStart + uFraction * (tEnd - tStart);

        const centerPt = riverSpline.getPoint(t);
        const tangent = riverSpline.getTangent(t).normalize();

        // Vector normal perpendicular a la dirección del flujo en el plano XZ
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Ancho del agua con ensanchamiento suave en la llegada al lago
        const deltaSpread = t > 0.75 ? 1.0 + (t - 0.75) * 1.5 : 1.0;
        const halfWidth = (RIVER_HALF_WIDTH + 0.4 + Math.sin(t * 18.0) * 0.25) * deltaSpread;

        for (let j = 0; j <= widthSegments; j++) {
            const vFraction = j / widthSegments; // 0 (orilla izquierda) a 1 (orilla derecha)
            const across = (vFraction - 0.5) * 2.0; // -1 a +1

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            // La lámina de agua se mantiene a la altura de cota del spline
            const vy = centerPt.y;

            positions.push(vx, vy, vz);
            uvs.push(vFraction, uFraction); // UV normalizadas (0.0 en origen, 1.0 en desembocadura)
            normals.push(0, 1, 0);
        }
    }

    // Caras triangulares de la malla en cinta
    const vertsPerRow = widthSegments + 1;
    for (let i = 0; i < lengthSegments; i++) {
        for (let j = 0; j < widthSegments; j++) {
            const a = i * vertsPerRow + j;
            const b = (i + 1) * vertsPerRow + j;
            const c = (i + 1) * vertsPerRow + (j + 1);
            const d = i * vertsPerRow + (j + 1);

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    riverMaterial = createWaterMaterial({
        isRiver: true,
        shallowColor: 0x38bdf8, // Turquesa cristalino luminoso
        deepColor: 0x0284c7,    // Azul fresco y fluido
        foamColor: 0xffffff,
        flowSpeed: 1.45,        // Corriente más rápida en el río
        waveHeight: 0.035,
        waveFrequency: 0.22,
        opacity: 0.88,
        foamIntensity: 0.70     // Espuma en los rápidos del afluente
    });
    registerWaterMaterial(riverMaterial);

    riverMesh = new THREE.Mesh(geometry, riverMaterial);
    riverMesh.receiveShadow = true;
    scene.add(riverMesh);
}

export function updateRiver(delta) {
    // La animación de corriente, ondas longitudinales y cáusticas se procesa en el shader
}
