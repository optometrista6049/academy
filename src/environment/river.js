import * as THREE from 'three';
import { scene } from '../core/scene.js';
import {
    riverSpline,
    RIVER_HALF_WIDTH
} from '../terrain/riverPath.js';

let riverMesh = null;
let riverMaterial = null;

export function createRiver() {
    const lengthSegments = 140;
    const widthSegments = 8;
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const normals = [];
    const indices = [];

    // Tramos a lo largo del spline (desde t=0.0 dentro de las montañas hasta t=0.96 lago)
    const tStart = 0.0;
    const tEnd = 0.96;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFraction = i / lengthSegments;
        const t = tStart + uFraction * (tEnd - tStart);

        const centerPt = riverSpline.getPoint(t);
        const tangent = riverSpline.getTangent(t).normalize();

        // Vector normal perpendicular a la dirección del flujo en el plano XZ
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Ancho del agua con ligera variación orgánica
        const halfWidth = RIVER_HALF_WIDTH + 0.5 + Math.sin(t * 18.0) * 0.35;

        for (let j = 0; j <= widthSegments; j++) {
            const vFraction = j / widthSegments; // 0 (orilla izquierda) a 1 (orilla derecha)
            const across = (vFraction - 0.5) * 2.0; // -1 a +1

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            // La lámina de agua se mantiene a la altura de cota del spline
            const vy = centerPt.y;

            positions.push(vx, vy, vz);
            uvs.push(vFraction, uFraction * 16.0); // 16 repeticiones a lo largo del cauce
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

    riverMaterial = new THREE.MeshStandardMaterial({
        color: 0x196e9f,
        roughness: 0.12,
        metalness: 0.8,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    riverMesh = new THREE.Mesh(geometry, riverMaterial);
    riverMesh.receiveShadow = true;
    scene.add(riverMesh);
}

export function updateRiver(delta) {
    if (!riverMesh) return;

    // Sutil ondulación de flujo en la corriente
    const time = performance.now() * 0.002;
    const posAttr = riverMesh.geometry.attributes.position;
    
    // Animar sutilmente la micro-ondulación de la superficie
    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        // Pequeña oscilación senoidal continua del agua fluyendo
        const wave = Math.sin(vx * 0.5 + vz * 0.5 + time * 3.0) * 0.02;
        // Solo perturbación temporal sin acumular
    }
}
