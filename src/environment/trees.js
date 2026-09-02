import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { WORLD_SIZE } from '../core/config.js';
import { rand } from '../utils/random.js';
import { getHeightAt } from '../terrain/terrainHeight.js';
import { collidables, cameraObstacles } from '../entities/collisions.js';
import {
    LAKE_CENTER_X,
    LAKE_CENTER_Z,
    LAKE_RADIUS
} from '../terrain/terrainHeight.js';
import {
    isPointNearRiver
} from '../terrain/riverPath.js';

// =====================================
// GEOMETRY MERGE HELPER
// =====================================
function mergeBufferGeometries(geometries) {
    let totalPositions = 0;
    let totalNormals = 0;
    let totalIndices = 0;

    for (const g of geometries) {
        totalPositions += g.attributes.position.array.length;
        if (g.attributes.normal) totalNormals += g.attributes.normal.array.length;
        if (g.index) totalIndices += g.index.array.length;
    }

    const mergedPos = new Float32Array(totalPositions);
    const mergedNorm = totalNormals > 0 ? new Float32Array(totalNormals) : null;
    const mergedIndices = totalIndices > 0 ? new (totalPositions / 3 > 65535 ? Uint32Array : Uint16Array)(totalIndices) : null;

    let posOffset = 0;
    let normOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;

    for (const g of geometries) {
        mergedPos.set(g.attributes.position.array, posOffset);
        if (mergedNorm && g.attributes.normal) {
            mergedNorm.set(g.attributes.normal.array, normOffset);
            normOffset += g.attributes.normal.array.length;
        }
        if (mergedIndices && g.index) {
            for (let i = 0; i < g.index.array.length; i++) {
                mergedIndices[indexOffset + i] = g.index.array[i] + vertexOffset;
            }
            indexOffset += g.index.array.length;
        }
        vertexOffset += g.attributes.position.count;
        posOffset += g.attributes.position.array.length;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    if (mergedNorm) merged.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
    if (mergedIndices) merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
    return merged;
}

// =====================================
// TREE ARCHETYPES DEFINITION
// (Fácilmente extensible o sustituible por modelos de más polígonos)
// =====================================
function buildTreeArchetypes() {
    const archetypes = [];

    // 0: Roble Redondo
    {
        const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 8);
        trunk.translate(0, 1.1, 0);
        const foliage = new THREE.SphereGeometry(1.4, 8, 8);
        foliage.translate(0, 2.2 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.2 });
    }

    // 1: Roble Grande
    {
        const trunk = new THREE.CylinderGeometry(0.45, 0.55, 3.0, 8);
        trunk.translate(0, 1.5, 0);
        const foliage = new THREE.SphereGeometry(2.0, 8, 8);
        foliage.translate(0, 3.0 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.4 });
    }

    // 2: Pino
    {
        const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3.5, 8);
        trunk.translate(0, 1.75, 0);

        const coneGeos = [];
        for (let i = 0; i < 3; i++) {
            const cone = new THREE.ConeGeometry(1.4 - (i * 0.2), 2.0, 8);
            cone.translate(0, 3.5 + 0.8 + (i * 0.9), 0);
            coneGeos.push(cone);
        }
        const foliage = mergeBufferGeometries(coneGeos);
        archetypes.push({ trunk, foliage, radius: 1.2 });
    }

    // 3: Abeto Alto
    {
        const trunk = new THREE.CylinderGeometry(0.2, 0.3, 4.0, 8);
        trunk.translate(0, 2.0, 0);

        const coneGeos = [];
        for (let i = 0; i < 4; i++) {
            const cone = new THREE.ConeGeometry(1.6 - (i * 0.25), 2.0, 8);
            cone.translate(0, 4.0 + 0.8 + (i * 1.0), 0);
            coneGeos.push(cone);
        }
        const foliage = mergeBufferGeometries(coneGeos);
        archetypes.push({ trunk, foliage, radius: 1.2 });
    }

    // 4: Árbol Pequeño
    {
        const trunk = new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8);
        trunk.translate(0, 0.7, 0);
        const foliage = new THREE.SphereGeometry(0.9, 8, 8);
        foliage.translate(0, 1.4 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.0 });
    }

    // 5: Árbol Ancho
    {
        const trunk = new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8);
        trunk.translate(0, 1.1, 0);
        const foliage = new THREE.SphereGeometry(2.3, 8, 8);
        foliage.translate(0, 2.2 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.4 });
    }

    // 6: Árbol Inclinado
    {
        const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2.8, 8);
        trunk.translate(0, 1.4, 0);
        trunk.rotateZ(THREE.MathUtils.degToRad(10));
        const foliage = new THREE.SphereGeometry(1.4, 8, 8);
        foliage.translate(0.45, 2.8 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.2 });
    }

    // 7: Árbol Bifurcado
    {
        const b1 = new THREE.CylinderGeometry(0.18, 0.25, 2.0, 8);
        b1.translate(0, 1.0, 0);
        b1.rotateZ(0.3);

        const b2 = new THREE.CylinderGeometry(0.18, 0.25, 2.0, 8);
        b2.translate(0, 1.0, 0);
        b2.rotateZ(-0.3);

        const trunk = mergeBufferGeometries([b1, b2]);
        const foliage = new THREE.SphereGeometry(1.5, 8, 8);
        foliage.translate(0, 2.0 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.3 });
    }

    // 8: Árbol Frondoso
    {
        const trunk = new THREE.CylinderGeometry(0.35, 0.45, 2.8, 8);
        trunk.translate(0, 1.4, 0);
        const foliage = new THREE.SphereGeometry(1.8, 8, 8);
        foliage.translate(0, 2.8 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.3 });
    }

    // 9: Árbol Silvestre Mediano
    {
        const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 8);
        trunk.translate(0, 1.25, 0);
        const foliage = new THREE.SphereGeometry(1.6, 8, 8);
        foliage.translate(0, 2.5 + 0.8, 0);
        archetypes.push({ trunk, foliage, radius: 1.2 });
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

    const leafColors = [
        new THREE.Color(0x2e8b57),
        new THREE.Color(0x3a8f4d),
        new THREE.Color(0x4a9c55),
        new THREE.Color(0x228b22)
    ];

    for (let i = 0; i < 90; i++) {
        const x = (rand() - 0.5) * WORLD_SIZE;
        const z = (rand() - 0.5) * WORLD_SIZE;

        if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;

        // Exclusión del área del Gran Lago
        const distToLake = Math.hypot(x - LAKE_CENTER_X, z - LAKE_CENTER_Z);
        if (distToLake < LAKE_RADIUS + 4) {
            continue;
        }

        // Exclusión del cauce del río
        if (isPointNearRiver(x, z, 9.2)) {
            continue;
        }

        const variant = Math.floor(Math.random() * archetypeCount);
        const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
        const y = getHeightAt(x, z);

        const rotY = Math.random() * Math.PI * 2;
        const scale = 0.9 + Math.random() * 0.25;

        instanceBuckets[variant].push({
            x,
            y,
            z,
            rotY,
            scale,
            color: leafColor
        });

        // Registro de colisión física individual
        const radius = archetypes[variant].radius * scale;
        collidables.push({
            position: new THREE.Vector3(x, y, z),
            userData: {
                radius
            }
        });
    }

    // Materiales compartidos (1 Draw Call para todos los troncos y 1 para todas las hojas por arquetipo)
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b5a2b,
        roughness: 0.9,
        metalness: 0.05
    });

    const leavesMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, // Base blanca para multiplicar con instanceColor
        roughness: 0.8,
        metalness: 0.05
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
            foliageMesh.setColorAt(i, inst.color);
        }

        trunkMesh.instanceMatrix.needsUpdate = true;
        foliageMesh.instanceMatrix.needsUpdate = true;
        if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;

        scene.add(trunkMesh);
        scene.add(foliageMesh);
        cameraObstacles.push(trunkMesh, foliageMesh);
    }
}
