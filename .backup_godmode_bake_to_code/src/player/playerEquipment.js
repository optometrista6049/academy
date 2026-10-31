/* ======================================================
   MONTESERIN ACADEMY - PLAYER EQUIPMENT SYSTEM
   Sistema de acoplamiento de objetos 3D al Player
   Soporte para Three.js procedural y modelos GLB
   Puntos de anclaje (Sockets): rightHand, leftHand, back, head
   Normalización matemática de escala 1:1 independiente de armatures
   ====================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getCustomItemById, buildThreeMeshFromCode } from '../systems/customItemStorage.js';

export const playerEquipment = {
    initialized: false,
    playerModel: null,
    bones: {
        rightHand: null,
        leftHand: null,
        back: null,
        head: null
    },
    sockets: {
        rightHand: null,
        leftHand: null,
        back: null,
        head: null
    },
    equipped: {
        rightHand: null,
        leftHand: null,
        back: null,
        head: null
    }
};

/**
 * Busca de forma flexible y robusta un hueso en la jerarquía del modelo GLTF.
 */
function findModelBone(model, candidateNames) {
    let found = null;
    model.traverse((node) => {
        if (found || !node.isBone) return;
        const name = (node.name || '').toLowerCase();
        for (const candidate of candidateNames) {
            if (typeof candidate === 'string') {
                if (name === candidate.toLowerCase() || name.includes(candidate.toLowerCase())) {
                    found = node;
                    return;
                }
            } else if (Array.isArray(candidate)) {
                if (candidate.every((kw) => name.includes(kw.toLowerCase()))) {
                    found = node;
                    return;
                }
            }
        }
    });
    return found;
}

/**
 * Inicializa los puntos de anclaje (sockets) en el modelo del jugador.
 * Normaliza las escalas mundiales para evitar desproporciones causadas por armatures Blender.
 */
export function initPlayerEquipment(playerModel) {
    if (!playerModel) return;

    playerEquipment.playerModel = playerModel;
    playerEquipment.bones = { rightHand: null, leftHand: null, back: null, head: null };
    playerEquipment.sockets = { rightHand: null, leftHand: null, back: null, head: null };

    // Buscar huesos exactos en RobotAnimado.glb o variantes
    playerEquipment.bones.rightHand = findModelBone(playerModel, [
        'Palm2R', 'Palm1R', 'Palm3R', ['palm', 'r'], ['hand', 'r'], 'LowerArmR'
    ]);

    playerEquipment.bones.leftHand = findModelBone(playerModel, [
        'Palm2L', 'Palm1L', 'Palm3L', ['palm', 'l'], ['hand', 'l'], 'LowerArmL'
    ]);

    playerEquipment.bones.back = findModelBone(playerModel, [
        'Torso_1', 'Torso', 'Chest', 'Spine2', 'Spine', 'Abdomen', 'Body'
    ]);

    playerEquipment.bones.head = findModelBone(playerModel, [
        'Head', 'Neck'
    ]);

    // Crear grupos socket y anclarlos con normalización métrica
    setupSocket('rightHand', playerEquipment.bones.rightHand, new THREE.Vector3(0.35, 0.75, 0.25));
    setupSocket('leftHand', playerEquipment.bones.leftHand, new THREE.Vector3(-0.35, 0.75, 0.25));
    setupSocket('back', playerEquipment.bones.back, new THREE.Vector3(0.0, 0.95, -0.25));
    setupSocket('head', playerEquipment.bones.head, new THREE.Vector3(0.0, 1.45, 0.05));

    playerEquipment.initialized = true;
    console.log('[PlayerEquipment] Sistema inicializado en sockets:', Object.keys(playerEquipment.sockets));
}

function setupSocket(socketName, bone, fallbackPos) {
    const socketGroup = new THREE.Group();
    socketGroup.name = `socket_${socketName}`;

    if (bone) {
        bone.add(socketGroup);
        // Contrarrestar la escala acumulada del armature para que los ítems mantengan escala métrica 1.0
        playerEquipment.playerModel?.updateMatrixWorld(true);
        const boneWorldScale = new THREE.Vector3();
        bone.getWorldScale(boneWorldScale);
        if (boneWorldScale.x !== 0 && boneWorldScale.y !== 0 && boneWorldScale.z !== 0) {
            socketGroup.scale.set(
                1 / boneWorldScale.x,
                1 / boneWorldScale.y,
                1 / boneWorldScale.z
            );
        }
    } else if (playerEquipment.playerModel) {
        socketGroup.position.copy(fallbackPos);
        playerEquipment.playerModel.add(socketGroup);
        const modelScale = new THREE.Vector3();
        playerEquipment.playerModel.getWorldScale(modelScale);
        if (modelScale.x !== 0 && modelScale.y !== 0 && modelScale.z !== 0) {
            socketGroup.scale.set(
                1 / modelScale.x,
                1 / modelScale.y,
                1 / modelScale.z
            );
        }
    }

    playerEquipment.sockets[socketName] = socketGroup;
}

/**
 * Acopla un objeto 3D en un socket con posición, rotación y escala ajustables.
 */
export function equipItem(socketName, item3D, transform = {}) {
    const socket = playerEquipment.sockets[socketName];
    if (!socket) {
        console.warn(`[PlayerEquipment] Socket no encontrado: ${socketName}`);
        return false;
    }

    // Retirar objeto previo si existe
    unequipItem(socketName);

    // Ajustar transformaciones
    const pos = transform.position || { x: 0, y: 0, z: 0 };
    const rot = transform.rotation || { x: 0, y: 0, z: 0 };
    
    let scaleX = 1.0, scaleY = 1.0, scaleZ = 1.0;
    if (typeof transform.scale === 'number') {
        scaleX = scaleY = scaleZ = transform.scale;
    } else if (typeof transform.scale === 'object' && transform.scale !== null) {
        scaleX = transform.scale.x ?? 1.0;
        scaleY = transform.scale.y ?? 1.0;
        scaleZ = transform.scale.z ?? 1.0;
    }

    item3D.position.set(pos.x, pos.y, pos.z);
    item3D.rotation.set(
        THREE.MathUtils.degToRad(rot.x),
        THREE.MathUtils.degToRad(rot.y),
        THREE.MathUtils.degToRad(rot.z)
    );
    item3D.scale.set(scaleX, scaleY, scaleZ);

    socket.add(item3D);
    playerEquipment.equipped[socketName] = {
        mesh: item3D,
        transform: { 
            position: { ...pos }, 
            rotation: { ...rot }, 
            scale: typeof transform.scale === 'number' ? transform.scale : { x: scaleX, y: scaleY, z: scaleZ } 
        }
    };

    return true;
}

/**
 * Retira el objeto del socket especificado.
 */
export function unequipItem(socketName) {
    const socket = playerEquipment.sockets[socketName];
    if (!socket) return;

    while (socket.children.length > 0) {
        socket.remove(socket.children[0]);
    }
    playerEquipment.equipped[socketName] = null;
}

/**
 * Ajusta en tiempo real la transformación del objeto actualmente equipado.
 */
export function updateEquippedTransform(socketName, { position, rotation, scale }) {
    const data = playerEquipment.equipped[socketName];
    if (!data || !data.mesh) return;

    if (position) {
        if (position.x !== undefined) data.mesh.position.x = position.x;
        if (position.y !== undefined) data.mesh.position.y = position.y;
        if (position.z !== undefined) data.mesh.position.z = position.z;
        data.transform.position = { ...data.mesh.position };
    }

    if (rotation) {
        if (rotation.x !== undefined) data.mesh.rotation.x = THREE.MathUtils.degToRad(rotation.x);
        if (rotation.y !== undefined) data.mesh.rotation.y = THREE.MathUtils.degToRad(rotation.y);
        if (rotation.z !== undefined) data.mesh.rotation.z = THREE.MathUtils.degToRad(rotation.z);
        data.transform.rotation = { ...rotation };
    }

    if (scale !== undefined) {
        if (typeof scale === 'number') {
            data.mesh.scale.set(scale, scale, scale);
            data.transform.scale = scale;
        } else if (typeof scale === 'object' && scale !== null) {
            const sx = scale.x ?? data.mesh.scale.x;
            const sy = scale.y ?? data.mesh.scale.y;
            const sz = scale.z ?? data.mesh.scale.z;
            data.mesh.scale.set(sx, sy, sz);
            data.transform.scale = { x: sx, y: sy, z: sz };
        }
    }
}

/**
 * Generador procedural de objetos 3D con Three.js a escala real (métrica natural).
 */
export function createProceduralItem(type) {
    const root = new THREE.Group();
    root.name = `item_${type}`;

    switch (type) {
        case 'flashlight': {
            // Linterna táctica robusta con proporciones naturales para la mano del robot
            // Empuñadura ergonómica
            const gripGeo = new THREE.CylinderGeometry(0.045, 0.048, 0.28, 16);
            const gripMat = new THREE.MeshStandardMaterial({ 
                color: 0x1f2937, 
                metalness: 0.85, 
                roughness: 0.35 
            });
            const grip = new THREE.Mesh(gripGeo, gripMat);
            grip.rotation.x = Math.PI / 2;
            root.add(grip);

            // Anillos tácticos de agarre antideslizante
            const ringGeo = new THREE.TorusGeometry(0.049, 0.007, 8, 20);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
            [-0.06, 0.0, 0.06].forEach((zPos) => {
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.position.z = zPos;
                root.add(ring);
            });

            // Cabezal reflector cónico metálico
            const headGeo = new THREE.CylinderGeometry(0.088, 0.052, 0.14, 18);
            const headMat = new THREE.MeshStandardMaterial({ 
                color: 0x9ca3af, 
                metalness: 0.95, 
                roughness: 0.2 
            });
            const head = new THREE.Mesh(headGeo, headMat);
            head.rotation.x = Math.PI / 2;
            head.position.z = 0.21;
            root.add(head);

            // Bisel dorado del reflector
            const bezelGeo = new THREE.TorusGeometry(0.088, 0.008, 8, 24);
            const bezel = new THREE.Mesh(bezelGeo, ringMat);
            bezel.position.z = 0.28;
            root.add(bezel);

            // Lente de cristal emisor de luz blanca/dorada
            const lensGeo = new THREE.CircleGeometry(0.082, 18);
            const lensMat = new THREE.MeshStandardMaterial({ 
                color: 0xffffff, 
                emissive: 0xfff9db, 
                emissiveIntensity: 1.2,
                roughness: 0.05 
            });
            const lens = new THREE.Mesh(lensGeo, lensMat);
            lens.position.z = 0.281;
            root.add(lens);

            // Luz suave integrada
            const light = new THREE.PointLight(0xfff3b0, 1.2, 5.0);
            light.position.set(0, 0, 0.40);
            root.add(light);
            break;
        }

        case 'key': {
            // Llave maestra dorada de Monteserín Academy
            const ringGeo = new THREE.TorusGeometry(0.09, 0.024, 12, 24);
            const keyMat = new THREE.MeshStandardMaterial({ 
                color: 0xd4af37, 
                metalness: 0.95, 
                roughness: 0.22 
            });
            const ring = new THREE.Mesh(ringGeo, keyMat);
            root.add(ring);

            const shaftGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.36, 14);
            const shaft = new THREE.Mesh(shaftGeo, keyMat);
            shaft.position.y = -0.20;
            root.add(shaft);

            const toothGeo = new THREE.BoxGeometry(0.08, 0.045, 0.025);
            const tooth1 = new THREE.Mesh(toothGeo, keyMat);
            tooth1.position.set(0.04, -0.32, 0);
            root.add(tooth1);

            const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.025), keyMat);
            tooth2.position.set(0.03, -0.25, 0);
            root.add(tooth2);
            break;
        }

        case 'notebook': {
            // Libreta / Diario de Campo Monteserín Academy
            const coverGeo = new THREE.BoxGeometry(0.28, 0.38, 0.045);
            const coverMat = new THREE.MeshStandardMaterial({ 
                color: 0x1b4332, 
                roughness: 0.45,
                metalness: 0.1 
            });
            const book = new THREE.Mesh(coverGeo, coverMat);
            root.add(book);

            // Bloque de páginas interiores
            const pagesGeo = new THREE.BoxGeometry(0.26, 0.36, 0.04);
            const pagesMat = new THREE.MeshStandardMaterial({ color: 0xfdfbf7, roughness: 0.85 });
            const pages = new THREE.Mesh(pagesGeo, pagesMat);
            pages.position.x = 0.01;
            root.add(pages);

            // Cinta elástica dorada de cierre
            const strapGeo = new THREE.BoxGeometry(0.02, 0.382, 0.048);
            const strapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
            const strap = new THREE.Mesh(strapGeo, strapMat);
            strap.position.x = 0.08;
            root.add(strap);
            break;
        }

        case 'wrench': {
            // Llave inglesa mecánica de taller
            const shaftGeo = new THREE.BoxGeometry(0.055, 0.42, 0.03);
            const toolMat = new THREE.MeshStandardMaterial({ 
                color: 0x94a3b8, 
                metalness: 0.92, 
                roughness: 0.28 
            });
            const shaft = new THREE.Mesh(shaftGeo, toolMat);
            root.add(shaft);

            // Cabezal curvo de llave
            const headGeo = new THREE.TorusGeometry(0.085, 0.032, 10, 18, Math.PI * 1.5);
            const head = new THREE.Mesh(headGeo, toolMat);
            head.position.y = 0.22;
            root.add(head);

            // Anillo inferior
            const bottomGeo = new THREE.TorusGeometry(0.045, 0.018, 8, 16);
            const bottomRing = new THREE.Mesh(bottomGeo, toolMat);
            bottomRing.position.y = -0.22;
            root.add(bottomRing);
            break;
        }

        case 'card': {
            // Carnet oficial de aspirante físico sostenido en mano
            const cardGeo = new THREE.BoxGeometry(0.28, 0.40, 0.012);
            const cardMat = new THREE.MeshStandardMaterial({ 
                color: 0x2d6a4f, 
                roughness: 0.3, 
                metalness: 0.15 
            });
            const card = new THREE.Mesh(cardGeo, cardMat);
            root.add(card);

            // Marco dorado perimetral
            const borderGeo = new THREE.BoxGeometry(0.284, 0.404, 0.01);
            const borderMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.2 });
            const border = new THREE.Mesh(borderGeo, borderMat);
            root.add(border);
            break;
        }

        default: {
            const custom = getCustomItemById(type);
            if (custom && custom.code) {
                const built = buildThreeMeshFromCode(custom.code);
                if (built.success && built.object) {
                    return built.object;
                }
            }
            const cubeGeo = new THREE.BoxGeometry(0.20, 0.20, 0.20);
            const cubeMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.6 });
            const cube = new THREE.Mesh(cubeGeo, cubeMat);
            root.add(cube);
            break;
        }
    }

    return root;
}

/**
 * Carga un modelo externo .glb y auto-normaliza sus dimensiones para evitar
 * modelos gigantes o microscópicos.
 */
export function loadGLBEquipment(url, onSuccess, onError) {
    const loader = new GLTFLoader();
    loader.load(
        url,
        (gltf) => {
            const model = gltf.scene || gltf.scenes[0];

            // Auto-normalizar tamaño inicial a dimensión estándar de mano (~0.35m)
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0 && (maxDim > 1.2 || maxDim < 0.1)) {
                const targetDim = 0.35;
                const factor = targetDim / maxDim;
                model.scale.multiplyScalar(factor);
            }

            if (onSuccess) onSuccess(model);
        },
        undefined,
        (err) => {
            console.error('[PlayerEquipment] Error cargando modelo GLB:', err);
            if (onError) onError(err);
        }
    );
}
