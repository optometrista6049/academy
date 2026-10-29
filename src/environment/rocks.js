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
import { isProceduralInstanceHidden } from '../systems/worldLayoutSystem.js';

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
        dodecMesh.userData = { isRock: true, type: 'rock', geoType: 'dodecaedro', name: 'Roca Dodecaédrica', instances: dodecList };

        dodecList.forEach((r, idx) => {
            const isHidden = isProceduralInstanceHidden('rocks', {
                geoType: 'dodecaedro',
                instanceIdx: idx,
                x: r.x,
                z: r.z
            });

            if (isHidden) {
                dummy.position.set(0, -999, 0);
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                dodecMesh.setMatrixAt(idx, dummy.matrix);
                r.isHidden = true;
                return;
            }

            dummy.position.set(r.x, r.y, r.z);
            dummy.rotation.set(r.rotX, r.rotY, r.rotZ);
            dummy.scale.set(r.scaleX, r.scaleY, r.scaleZ);
            dummy.updateMatrix();

            dodecMesh.setMatrixAt(idx, dummy.matrix);
            tempColor.setHex(rockShades[idx % rockShades.length]);
            dodecMesh.setColorAt(idx, tempColor);

            // Registro de colisión física para instancias visibles
            r.colRef = addCollidable({
                position: new THREE.Vector3(r.x, r.y, r.z),
                userData: {
                    radius: r.radius,
                    isRock: true
                }
            });
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
        icosaMesh.userData = { isRock: true, type: 'rock', geoType: 'icosaedro', name: 'Roca Icosaédrica', instances: icosaList };

        icosaList.forEach((r, idx) => {
            const isHidden = isProceduralInstanceHidden('rocks', {
                geoType: 'icosaedro',
                instanceIdx: idx,
                x: r.x,
                z: r.z
            });

            if (isHidden) {
                dummy.position.set(0, -999, 0);
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                icosaMesh.setMatrixAt(idx, dummy.matrix);
                r.isHidden = true;
                return;
            }

            dummy.position.set(r.x, r.y, r.z);
            dummy.rotation.set(r.rotX, r.rotY, r.rotZ);
            dummy.scale.set(r.scaleX, r.scaleY, r.scaleZ);
            dummy.updateMatrix();

            icosaMesh.setMatrixAt(idx, dummy.matrix);
            tempColor.setHex(rockShades[(idx + 2) % rockShades.length]);
            icosaMesh.setColorAt(idx, tempColor);

            // Registro de colisión física para instancias visibles
            r.colRef = addCollidable({
                position: new THREE.Vector3(r.x, r.y, r.z),
                userData: {
                    radius: r.radius,
                    isRock: true
                }
            });
        });

        icosaMesh.instanceMatrix.needsUpdate = true;
        if (icosaMesh.instanceColor) icosaMesh.instanceColor.needsUpdate = true;
        scene.add(icosaMesh);
        cameraObstacles.push(icosaMesh);
    }
}

/**
 * Crea una roca 3D individual e independiente con su geometría y material facetado Three.js.
 */
export function createIndividualRock(geoType = 0, rockColorHex = 0x666666) {
    const isIcosa = (geoType === 1 || geoType === 'icosaedro');
    const geo = isIcosa
        ? new THREE.IcosahedronGeometry(1, 0)
        : new THREE.DodecahedronGeometry(1, 0);

    const color = typeof rockColorHex === 'string' ? new THREE.Color(rockColorHex) :
                  (typeof rockColorHex === 'number' ? new THREE.Color(rockColorHex) :
                  (rockColorHex instanceof THREE.Color ? rockColorHex : new THREE.Color(0x666666)));

    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0.1,
        flatShading: true
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `individual_rock_${isIcosa ? 'icosa' : 'dodec'}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { isRock: true, type: 'rock', geoType: isIcosa ? 'icosaedro' : 'dodecaedro' };
    return mesh;
}

// =====================================
// PUBLIC
// =====================================
export function createRockField() {
    generateAncientRocks();
    generateScatteredRocks();
    buildRockInstancedMeshes();
}
