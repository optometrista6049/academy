import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { getHeightAtBase } from '../terrain/terrainHeight.js';
import { collidables } from '../entities/collisions.js';
import { registerWorldObject } from '../systems/visibilitySystem.js';
import { river1Curve, river2Curve } from './waterSystem.js';

// ======================================================
// CONFIGURACIÓN DE LOS 4 PUENTES (2 EN CADA RÍO)
// ======================================================
export const BRIDGES_DATA = [
    // RÍO 1 - Puente A (Zona Este / Próximo al Lago)
    {
        id: 'bridge-1a',
        river: 1,
        t: 0.26,
        length: 16.0,
        width: 4.2,
        deckThickness: 0.5,
        archHeight: 1.2
    },
    // RÍO 1 - Puente B (Zona Noroeste)
    {
        id: 'bridge-1b',
        river: 1,
        t: 0.66,
        length: 16.0,
        width: 4.2,
        deckThickness: 0.5,
        archHeight: 1.2
    },
    // RÍO 2 - Puente A (Zona Sureste / Pasadas las Rocas Antiguas)
    {
        id: 'bridge-2a',
        river: 2,
        t: 0.33,
        length: 16.5,
        width: 4.2,
        deckThickness: 0.5,
        archHeight: 1.2
    },
    // RÍO 2 - Puente B (Zona Suroeste)
    {
        id: 'bridge-2b',
        river: 2,
        t: 0.66,
        length: 16.5,
        width: 4.2,
        deckThickness: 0.5,
        archHeight: 1.2
    }
];

export const instantiatedBridges = [];

// ======================================================
// CONSTRUCCIÓN VISUAL DE UN PUENTE
// ======================================================
function buildBridgeMesh(data, position, angle, baseHeight) {
    const group = new THREE.Group();
    group.position.set(position.x, baseHeight, position.z);
    group.rotation.y = angle;

    const woodDarkMat = new THREE.MeshStandardMaterial({
        color: 0x5a3d28,
        roughness: 0.85
    });

    const woodPlankMat = new THREE.MeshStandardMaterial({
        color: 0x7c5636,
        roughness: 0.75
    });

    const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x6e6e6e,
        roughness: 0.95
    });

    // 1. Pilares / Estribos de piedra a los extremos
    const abutmentGeo = new THREE.BoxGeometry(data.width + 0.8, 4.0, 2.5);
    const leftAbutment = new THREE.Mesh(abutmentGeo, stoneMat);
    leftAbutment.position.set(0, -1.0, -data.length * 0.5);
    group.add(leftAbutment);

    const rightAbutment = new THREE.Mesh(abutmentGeo, stoneMat);
    rightAbutment.position.set(0, -1.0, data.length * 0.5);
    group.add(rightAbutment);

    // 2. Vigas principales arqueadas
    const beamGeo = new THREE.BoxGeometry(0.5, 0.7, data.length);
    const leftBeam = new THREE.Mesh(beamGeo, woodDarkMat);
    leftBeam.position.set(-data.width * 0.5 + 0.25, data.archHeight * 0.4, 0);
    group.add(leftBeam);

    const rightBeam = new THREE.Mesh(beamGeo, woodDarkMat);
    rightBeam.position.set(data.width * 0.5 - 0.25, data.archHeight * 0.4, 0);
    group.add(rightBeam);

    // 3. Tablones de la plataforma (Deck) con suave arco
    const plankCount = Math.floor(data.length / 0.6);
    const plankGeo = new THREE.BoxGeometry(data.width, data.deckThickness, 0.52);

    for (let i = 0; i <= plankCount; i++) {
        const t = (i / plankCount) * 2 - 1; // -1 a +1
        const zPos = t * (data.length * 0.5);
        const yArch = (1 - t * t) * data.archHeight;

        const plank = new THREE.Mesh(plankGeo, woodPlankMat);
        plank.position.set(0, yArch + data.deckThickness * 0.5, zPos);
        // Ligera rotación del tablón siguiendo la pendiente del arco
        plank.rotation.x = -t * 0.15;
        group.add(plank);
    }

    // 4. Barandillas laterales (Railings) y postes
    const postGeo = new THREE.BoxGeometry(0.25, 1.3, 0.25);
    const railGeo = new THREE.BoxGeometry(0.2, 0.15, data.length);

    const postCount = 6;
    for (let i = 0; i <= postCount; i++) {
        const t = (i / postCount) * 2 - 1;
        const zPos = t * (data.length * 0.5);
        const yArch = (1 - t * t) * data.archHeight;

        // Poste izquierdo
        const postL = new THREE.Mesh(postGeo, woodDarkMat);
        postL.position.set(-data.width * 0.5 + 0.15, yArch + 0.65, zPos);
        group.add(postL);

        // Poste derecho
        const postR = new THREE.Mesh(postGeo, woodDarkMat);
        postR.position.set(data.width * 0.5 - 0.15, yArch + 0.65, zPos);
        group.add(postR);
    }

    // Pasamanos superior
    const railL = new THREE.Mesh(railGeo, woodDarkMat);
    railL.position.set(-data.width * 0.5 + 0.15, data.archHeight * 0.6 + 1.2, 0);
    group.add(railL);

    const railR = new THREE.Mesh(railGeo, woodDarkMat);
    railR.position.set(data.width * 0.5 - 0.15, data.archHeight * 0.6 + 1.2, 0);
    group.add(railR);

    // Farolillos decorativos en los postes centrales
    const lanternGeo = new THREE.BoxGeometry(0.35, 0.45, 0.35);
    const lanternMat = new THREE.MeshStandardMaterial({
        color: 0xffd580,
        emissive: 0xff9900,
        emissiveIntensity: 0.6
    });
    const lanternL = new THREE.Mesh(lanternGeo, lanternMat);
    lanternL.position.set(-data.width * 0.5 + 0.15, data.archHeight + 1.5, 0);
    group.add(lanternL);

    const lanternR = new THREE.Mesh(lanternGeo, lanternMat);
    lanternR.position.set(data.width * 0.5 - 0.15, data.archHeight + 1.5, 0);
    group.add(lanternR);

    return group;
}

// ======================================================
// INICIALIZAR TODOS LOS PUENTES
// ======================================================
export function createBridges() {
    BRIDGES_DATA.forEach((bData) => {
        const curve = bData.river === 1 ? river1Curve : river2Curve;
        const pos = curve.getPointAt(bData.t);
        const tangent = curve.getTangentAt(bData.t);

        // El puente se orienta cruzando el río (perpendicular a la corriente / tangente)
        // La longitud del puente se extiende a lo largo de este vector normal
        const bridgeAngle = Math.atan2(tangent.x, tangent.z);

        const baseH = getHeightAtBase(pos.x, pos.z) + 0.2;

        const bridgeMesh = buildBridgeMesh(bData, pos, bridgeAngle, baseH);
        scene.add(bridgeMesh);
        registerWorldObject(bridgeMesh, 'bridge');

        instantiatedBridges.push({
            ...bData,
            worldPos: new THREE.Vector2(pos.x, pos.z),
            angle: bridgeAngle,
            baseHeight: baseH,
            mesh: bridgeMesh
        });
    });
}

// ======================================================
// CÁLCULO DE ALTURA SOBRE EL PUENTE Y COLISIÓN LATERAL
// ======================================================
export function getBridgeInteraction(px, pz) {
    for (const b of instantiatedBridges) {
        // Transformar la posición del jugador al espacio local del puente
        const dx = px - b.worldPos.x;
        const dz = pz - b.worldPos.y;

        // Rotar inversamente por el ángulo del puente
        const cosA = Math.cos(-b.angle);
        const sinA = Math.sin(-b.angle);

        const localX = dx * cosA - dz * sinA; // Ancho del puente (-width/2 a +width/2)
        const localZ = dx * sinA + dz * cosA; // Largo del puente (-length/2 a +length/2)

        const halfW = b.width * 0.5;
        const halfL = b.length * 0.5 + 1.2; // Margen de acceso a las orillas

        if (Math.abs(localZ) <= halfL) {
            // Está en la longitud del puente
            const t = Math.max(-1, Math.min(1, localZ / (b.length * 0.5)));
            const archY = (1 - t * t) * b.archHeight;
            const walkHeight = b.baseHeight + archY + b.deckThickness + 0.1;

            if (Math.abs(localX) <= halfW - 0.3) {
                // Dentro de la pasarela caminable
                return {
                    onBridge: true,
                    walkHeight: walkHeight,
                    blocked: false,
                    bridgeId: b.id
                };
            } else if (Math.abs(localX) <= halfW + 1.0) {
                // Colisión con la barandilla lateral (Hitbox lateral del puente)
                return {
                    onBridge: true,
                    walkHeight: walkHeight,
                    blocked: true, // Bloquea para no caer al agua lateralmente
                    bridgeId: b.id
                };
            }
        }
    }

    return { onBridge: false, walkHeight: null, blocked: false };
}
