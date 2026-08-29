import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { LAKE_CENTER_X, LAKE_CENTER_Z, LAKE_WATER_Y, getLakeBasinRadius, getShoreRatio } from '../terrain/terrainHeight.js';

let lakeWaterMesh = null;
let lakeWaterMaterial = null;

export function createLake() {
    // Generamos una malla polar con deformaciones orgánicas para la lámina de agua
    // Su radio se extiende más allá de la orilla (shoreR + 10m), enterrándose profundamente
    // dentro de los taludes de tierra del cráter para que ningún borde quede al aire.
    const rings = 32;
    const segments = 120;
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const indices = [];

    // Vértice central
    positions.push(0, 0, 0);
    uvs.push(0.5, 0.5);

    // Anillos concéntricos polares con deformación orgánica
    for (let r = 1; r <= rings; r++) {
        const ringFraction = r / rings;
        for (let s = 0; s < segments; s++) {
            const theta = (s / segments) * Math.PI * 2;
            const basinR = getLakeBasinRadius(theta);
            const shoreR = basinR * getShoreRatio(theta);
            // El radio del agua penetra 6 metros dentro del talud de tierra
            const waterRadius = (shoreR + 6.0) * ringFraction;

            const x = Math.cos(theta) * waterRadius;
            const z = Math.sin(theta) * waterRadius;

            positions.push(x, 0, z);
            uvs.push(0.5 + (x / 140), 0.5 + (z / 140));
        }
    }

    // Caras del centro al primer anillo
    for (let s = 0; s < segments; s++) {
        const nextS = (s + 1) % segments;
        indices.push(0, s + 1, nextS + 1);
    }

    // Caras entre anillos sucesivos
    for (let r = 1; r < rings; r++) {
        const currentRingStart = 1 + (r - 1) * segments;
        const nextRingStart = 1 + r * segments;

        for (let s = 0; s < segments; s++) {
            const nextS = (s + 1) % segments;

            const c1 = currentRingStart + s;
            const c2 = currentRingStart + nextS;
            const n1 = nextRingStart + s;
            const n2 = nextRingStart + nextS;

            indices.push(c1, n1, c2);
            indices.push(c2, n1, n2);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    lakeWaterMaterial = new THREE.MeshStandardMaterial({
        color: 0x196e9f,
        roughness: 0.12,
        metalness: 0.8,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    lakeWaterMesh = new THREE.Mesh(geometry, lakeWaterMaterial);
    lakeWaterMesh.position.set(LAKE_CENTER_X, LAKE_WATER_Y, LAKE_CENTER_Z);
    lakeWaterMesh.receiveShadow = true;

    scene.add(lakeWaterMesh);
}

export function updateLake(delta) {
    if (!lakeWaterMesh) return;
    // Sutil ondulación vertical en la cota de agua
    const time = performance.now() * 0.0015;
    lakeWaterMesh.position.y = LAKE_WATER_Y + Math.sin(time) * 0.025;
}


