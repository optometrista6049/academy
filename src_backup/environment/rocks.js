import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { WORLD_SIZE } from '../core/config.js';
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
// ROCK INSTANCES DATA
// =====================================
const rockList = [];

function recordRock(x, z, scale = 1) {
    const geoType = Math.floor(Math.random() * 2); // 0: Dodecahedron, 1: Icosahedron
    const y = getHeightAt(x, z);

    const scaleX = scale * (0.8 + Math.random() * 0.5);
    const scaleY = scale * (0.7 + Math.random() * 0.8);
    const scaleZ = scale * (0.8 + Math.random() * 0.5);

    const rotX = Math.random() * Math.PI;
    const rotY = Math.random() * Math.PI;
    const rotZ = Math.random() * Math.PI;

    rockList.push({
        x,
        y,
        z,
        scaleX,
        scaleY,
        scaleZ,
        rotX,
        rotY,
        rotZ,
        geoType,
        radius: scale
    });

    // Colisión física indexada en Spatial Hash Grid
    addCollidable({
        position: new THREE.Vector3(x, y, z),
        userData: {
            radius: scale
        }
    });
}

// =====================================
// ANCIENT ROCKS
// =====================================
function generateAncientRocks() {
    const centerX = 78;
    const centerZ = 14;

    for (let i = 0; i < 8; i++) {
        recordRock(
            centerX + (Math.random() - 0.5) * 14,
            centerZ + (Math.random() - 0.5) * 14,
            3 + Math.random() * 2
        );
    }
}

// =====================================
// RANDOM SCATTERED ROCKS
// =====================================
function generateScatteredRocks() {
    for (let i = 0; i < 30; i++) {
        const x = (rand() - 0.5) * WORLD_SIZE;
        const z = (rand() - 0.5) * WORLD_SIZE;

        if (Math.abs(x) < 25 && Math.abs(z) < 25) continue;

        // Exclusión del área del Gran Lago
        const distToLake = Math.hypot(x - LAKE_CENTER_X, z - LAKE_CENTER_Z);
        if (distToLake < LAKE_RADIUS + 3) {
            continue;
        }

        // Exclusión del cauce del río
        if (isPointNearRiver(x, z, 9.2)) {
            continue;
        }

        // Exclusión del puente y sus accesos
        if (isPointNearBridge(x, z, 3.5)) {
            continue;
        }

        recordRock(
            x,
            z,
            1 + Math.random() * 2.5
        );
    }
}

// =====================================
// BUILD INSTANCED MESHES
// =====================================
function buildRockInstancedMeshes() {
    const dodecList = rockList.filter(r => r.geoType === 0);
    const icosaList = rockList.filter(r => r.geoType === 1);

    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.1
    });

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    // Tonos de roca para variación orgánica
    const rockShades = [
        0x5a5a5a,
        0x666666,
        0x707070,
        0x7a7a7a
    ];

    if (dodecList.length > 0) {
        const dodecGeo = new THREE.DodecahedronGeometry(1, 0);
        const dodecMesh = new THREE.InstancedMesh(dodecGeo, rockMaterial, dodecList.length);
        dodecMesh.castShadow = true;
        dodecMesh.receiveShadow = true;

        dodecList.forEach((r, idx) => {
            dummy.position.set(r.x, r.y, r.z);
            dummy.rotation.set(r.rotX, r.rotY, r.rotZ);
            dummy.scale.set(r.scaleX, r.scaleY, r.scaleZ);
            dummy.updateMatrix();

            dodecMesh.setMatrixAt(idx, dummy.matrix);
            tempColor.setHex(rockShades[idx % rockShades.length]);
            dodecMesh.setColorAt(idx, tempColor);
        });

        dodecMesh.instanceMatrix.needsUpdate = true;
        if (dodecMesh.instanceColor) dodecMesh.instanceColor.needsUpdate = true;
        scene.add(dodecMesh);
        cameraObstacles.push(dodecMesh);
    }

    if (icosaList.length > 0) {
        const icosaGeo = new THREE.IcosahedronGeometry(1, 0);
        const icosaMesh = new THREE.InstancedMesh(icosaGeo, rockMaterial, icosaList.length);
        icosaMesh.castShadow = true;
        icosaMesh.receiveShadow = true;

        icosaList.forEach((r, idx) => {
            dummy.position.set(r.x, r.y, r.z);
            dummy.rotation.set(r.rotX, r.rotY, r.rotZ);
            dummy.scale.set(r.scaleX, r.scaleY, r.scaleZ);
            dummy.updateMatrix();

            icosaMesh.setMatrixAt(idx, dummy.matrix);
            tempColor.setHex(rockShades[(idx + 2) % rockShades.length]);
            icosaMesh.setColorAt(idx, tempColor);
        });

        icosaMesh.instanceMatrix.needsUpdate = true;
        if (icosaMesh.instanceColor) icosaMesh.instanceColor.needsUpdate = true;
        scene.add(icosaMesh);
        cameraObstacles.push(icosaMesh);
    }
}

// =====================================
// PUBLIC
// =====================================
export function createRockField() {
    generateAncientRocks();
    generateScatteredRocks();
    buildRockInstancedMeshes();
}
