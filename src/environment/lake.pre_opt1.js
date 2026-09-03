import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { LAKE_CENTER_X, LAKE_CENTER_Z, LAKE_WATER_Y, getLakeBasinRadius, getShoreRatio } from '../terrain/terrainHeight.js';
import { createWaterMaterial, registerWaterMaterial } from './waterSystem.js';

let lakeWaterMesh = null;
let lakeWaterMaterial = null;

export function createLake() {
    // Generamos una malla polar con deformaciones orgánicas para la lámina de agua
    // Su radio se extiende más allá de la orilla (shoreR + 10m), enterrándose profundamente
    // dentro de los taludes de tierra del cráter para que ningún borde quede al aire.
    const rings = 36;
    const segments = 128;
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

    lakeWaterMaterial = createWaterMaterial({
        isRiver: false,
        shallowColor: 0x38bdf8, // Turquesa cristalino luminoso en orilla
        deepColor: 0x0284c7,    // Azul profundo luminoso y natural (no oscuro/opaco)
        foamColor: 0xffffff,
        flowSpeed: 0.85,
        flowDirection: new THREE.Vector2(0.4, 0.6).normalize(),
        waveHeight: 0.045,
        waveFrequency: 0.14,
        opacity: 0.86,
        foamIntensity: 0.55
    });
    registerWaterMaterial(lakeWaterMaterial);

    lakeWaterMesh = new THREE.Mesh(geometry, lakeWaterMaterial);
    lakeWaterMesh.position.set(LAKE_CENTER_X, LAKE_WATER_Y, LAKE_CENTER_Z);
    lakeWaterMesh.receiveShadow = true;
    lakeWaterMesh.renderOrder = 1;
    lakeWaterMesh.frustumCulled = false;

    scene.add(lakeWaterMesh);
}

export function updateLake(delta) {
    // La animación de ondas y cáusticas se procesa dinámicamente en el shader
}


