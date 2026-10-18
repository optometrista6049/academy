/* ======================================================
   MONTESERIN ACADEMY - CUSTOM 3D ITEM LIBRARY & STORAGE
   Gestión persistente de biblioteca de objetos 3D Three.js
   Soporta creación procedural, prompts IA, almacenamiento
   en LocalStorage y compilación dinámica de Three.js.
   ====================================================== */

import * as THREE from 'three';

const STORAGE_KEY = 'monteserin_custom_3d_items_v1';

/**
 * Plantillas predeterminadas de alta calidad en Three.js
 * listas para usarse o editarse.
 */
export const DEFAULT_3D_PRESETS = [
    {
        id: 'preset_energy_sword',
        name: 'Espada de Energía',
        icon: '⚔️',
        socket: 'rightHand',
        category: 'Armas',
        scale: 1.0,
        prompt: 'Espada de energía futurista con empuñadura táctica dorada y hoja de plasma cian resplandeciente',
        code: `// Espada de Energía Monteserín
const group = new THREE.Group();
group.name = "EspadaEnergia";

// Empuñadura ergonómica
const hiltGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.22, 16);
const hiltMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.85, roughness: 0.3 });
const hilt = new THREE.Mesh(hiltGeo, hiltMat);
hilt.position.y = -0.11;
group.add(hilt);

// Pomo dorado
const pommelGeo = new THREE.SphereGeometry(0.035, 16, 16);
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.95, roughness: 0.2 });
const pommel = new THREE.Mesh(pommelGeo, goldMat);
pommel.position.y = -0.22;
group.add(pommel);

// Guarda transversal con alas
const guardGeo = new THREE.BoxGeometry(0.18, 0.035, 0.05);
const guard = new THREE.Mesh(guardGeo, goldMat);
guard.position.y = 0.0;
group.add(guard);

// Hoja de energía de plasma cian (resplandeciente)
const bladeGeo = new THREE.BoxGeometry(0.045, 0.72, 0.015);
const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.5,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.92
});
const blade = new THREE.Mesh(bladeGeo, bladeMat);
blade.position.y = 0.36;
group.add(blade);

// Luz puntual emitida por la hoja
const light = new THREE.PointLight(0x38bdf8, 1.4, 4.0);
light.position.y = 0.45;
group.add(light);

return group;`
    },
    {
        id: 'preset_runic_shield',
        name: 'Escudo Rúnico',
        icon: '🛡️',
        socket: 'leftHand',
        category: 'Defensa',
        scale: 1.0,
        prompt: 'Escudo defensivo circular con emblema rúnico esmeralda y borde dorado reforzado',
        code: `// Escudo Rúnico Monteserín
const group = new THREE.Group();
group.name = "EscudoRunico";

// Cuerpo principal del escudo
const shieldGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.025, 32);
const shieldMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, metalness: 0.5, roughness: 0.4 });
const shield = new THREE.Mesh(shieldGeo, shieldMat);
shield.rotation.x = Math.PI / 2;
group.add(shield);

// Borde exterior dorado reforzado
const rimGeo = new THREE.TorusGeometry(0.265, 0.02, 16, 32);
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 });
const rim = new THREE.Mesh(rimGeo, goldMat);
group.add(rim);

// Umbo central saliente
const bossGeo = new THREE.SphereGeometry(0.08, 18, 18);
const boss = new THREE.Mesh(bossGeo, goldMat);
boss.position.z = 0.02;
group.add(boss);

// Gema rúnica central brillante
const gemGeo = new THREE.OctahedronGeometry(0.045);
const gemMat = new THREE.MeshStandardMaterial({
    color: 0x34d399,
    emissive: 0x10b981,
    emissiveIntensity: 1.3,
    roughness: 0.1
});
const gem = new THREE.Mesh(gemGeo, gemMat);
gem.position.z = 0.08;
group.add(gem);

// Manija de agarre posterior
const handleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 12);
const handleMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.7 });
const handle = new THREE.Mesh(handleGeo, handleMat);
handle.position.z = -0.05;
group.add(handle);

return group;`
    },
    {
        id: 'preset_crystal_staff',
        name: 'Cetro de Cristal',
        icon: '🔮',
        socket: 'rightHand',
        category: 'Magia',
        scale: 1.0,
        prompt: 'Báculo arcano estilizado con orbe de cristal violeta levitante y filigrana dorada',
        code: `// Cetro Arcano de Cristal
const group = new THREE.Group();
group.name = "CetroCristal";

// Vara o mástil de madera oscura noble
const staffGeo = new THREE.CylinderGeometry(0.022, 0.028, 1.10, 16);
const staffMat = new THREE.MeshStandardMaterial({ color: 0x271911, roughness: 0.65, metalness: 0.1 });
const staff = new THREE.Mesh(staffGeo, staffMat);
staff.position.y = 0.10;
group.add(staff);

// Anillos dorados de fijación
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.92, roughness: 0.2 });
[-0.2, 0.1, 0.4, 0.6].forEach(y => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 8, 20), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
});

// Soporte o corona superior para el cristal
const crownGeo = new THREE.CylinderGeometry(0.075, 0.03, 0.12, 6);
const crown = new THREE.Mesh(crownGeo, goldMat);
crown.position.y = 0.66;
group.add(crown);

// Orbe de cristal violeta resplandeciente
const crystalGeo = new THREE.DodecahedronGeometry(0.085);
const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0x9333ea,
    emissiveIntensity: 1.6,
    roughness: 0.08,
    metalness: 0.3,
    transparent: true,
    opacity: 0.90
});
const crystal = new THREE.Mesh(crystalGeo, crystalMat);
crystal.position.y = 0.76;
group.add(crystal);

// Luz arcana envolvente
const staffLight = new THREE.PointLight(0xa855f7, 1.5, 4.5);
staffLight.position.y = 0.78;
group.add(staffLight);

return group;`
    },
    {
        id: 'preset_tactical_radio',
        name: 'Radio Comunicador',
        icon: '📻',
        socket: 'back',
        category: 'Tecnología',
        scale: 1.0,
        prompt: 'Transmisor de comunicaciones militar con antena flexible y pantalla LCD',
        code: `// Radio Comunicador Táctico
const group = new THREE.Group();
group.name = "RadioTactico";

// Chasis principal de polímero negro
const bodyGeo = new THREE.BoxGeometry(0.14, 0.22, 0.07);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.4 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
group.add(body);

// Pantalla LCD verdosa
const screenGeo = new THREE.PlaneGeometry(0.09, 0.055);
const screenMat = new THREE.MeshStandardMaterial({
    color: 0x86efac,
    emissive: 0x22c55e,
    emissiveIntensity: 0.8,
    roughness: 0.2
});
const screen = new THREE.Mesh(screenGeo, screenMat);
screen.position.set(0, 0.045, 0.036);
group.add(screen);

// Rejilla de altavoz
const speakerGeo = new THREE.BoxGeometry(0.08, 0.04, 0.005);
const speakerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
const speaker = new THREE.Mesh(speakerGeo, speakerMat);
speaker.position.set(0, -0.045, 0.036);
group.add(speaker);

// Antena de alta frecuencia
const antennaGeo = new THREE.CylinderGeometry(0.006, 0.009, 0.38, 10);
const antennaMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.3 });
const antenna = new THREE.Mesh(antennaGeo, antennaMat);
antenna.position.set(0.045, 0.28, 0);
group.add(antenna);

// Dial rotativo dorado de frecuencia
const dialGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.025, 16);
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });
const dial = new THREE.Mesh(dialGeo, goldMat);
dial.position.set(-0.035, 0.12, 0);
group.add(dial);

return group;`
    },
    {
        id: 'preset_explorer_pack',
        name: 'Mochila de Explorador',
        icon: '🎒',
        socket: 'back',
        category: 'Accesorios',
        scale: 1.0,
        prompt: 'Mochila de supervivencia de lona reforzada con correas doradas y esterilla enrollada',
        code: `// Mochila de Supervivencia Monteserín
const group = new THREE.Group();
group.name = "MochilaExplorador";

// Compartimento principal
const packGeo = new THREE.BoxGeometry(0.32, 0.40, 0.18);
const canvasMat = new THREE.MeshStandardMaterial({ color: 0x2d3a33, roughness: 0.85, metalness: 0.05 });
const pack = new THREE.Mesh(packGeo, canvasMat);
group.add(pack);

// Bolsillo frontal
const pocketGeo = new THREE.BoxGeometry(0.24, 0.20, 0.08);
const pocket = new THREE.Mesh(pocketGeo, canvasMat);
pocket.position.set(0, -0.06, 0.12);
group.add(pocket);

// Correas y hebillas doradas
const strapMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.3 });
[-0.08, 0.08].forEach(x => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.41, 0.19), strapMat);
    strap.position.x = x;
    group.add(strap);
});

// Esterilla enrollada superior
const rollGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.36, 18);
rollGeo.rotateZ(Math.PI / 2);
const rollMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.7 });
const roll = new THREE.Mesh(rollGeo, rollMat);
roll.position.set(0, 0.24, 0.02);
group.add(roll);

return group;`
    }
];

/**
 * Obtiene todos los objetos de la biblioteca (combinando los predeterminados y guardados por el usuario).
 */
export function getCustomItems() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            // Inicializar con los presets base
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_3D_PRESETS));
            return [...DEFAULT_3D_PRESETS];
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
        return [...DEFAULT_3D_PRESETS];
    } catch (err) {
        console.warn('[CustomItemStorage] Error leyendo de localStorage:', err);
        return [...DEFAULT_3D_PRESETS];
    }
}

/**
 * Guarda o actualiza un objeto en la biblioteca persistente.
 */
export function saveCustomItem(item) {
    if (!item) return null;
    const items = getCustomItems();

    const normalizedItem = {
        id: item.id || `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: item.name || 'Objeto 3D Personalizado',
        icon: item.icon || '📦',
        socket: item.socket || 'rightHand',
        category: item.category || 'Personalizados',
        scale: typeof item.scale === 'number' ? item.scale : 1.0,
        prompt: item.prompt || '',
        code: item.code || '',
        updatedAt: Date.now()
    };

    const existingIndex = items.findIndex(i => i.id === normalizedItem.id);
    if (existingIndex >= 0) {
        items[existingIndex] = normalizedItem;
    } else {
        items.unshift(normalizedItem); // Los nuevos primero
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('[CustomItemStorage] Error guardando en localStorage:', e);
    }

    notifyStorageUpdate();
    return normalizedItem;
}

/**
 * Elimina un objeto de la biblioteca por su ID.
 */
export function deleteCustomItem(id) {
    let items = getCustomItems();
    items = items.filter(i => i.id !== id);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('[CustomItemStorage] Error eliminando en localStorage:', e);
    }

    notifyStorageUpdate();
    return items;
}

/**
 * Busca un ítem específico por ID.
 */
export function getCustomItemById(id) {
    const items = getCustomItems();
    return items.find(i => i.id === id) || null;
}

/**
 * Restablece la biblioteca a los valores iniciales.
 */
export function resetCustomLibrary() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_3D_PRESETS));
    notifyStorageUpdate();
    return [...DEFAULT_3D_PRESETS];
}

/**
 * Exporta todos los objetos en formato JSON para copias de seguridad.
 */
export function exportItemsJSON() {
    const items = getCustomItems();
    return JSON.stringify(items, null, 2);
}

/**
 * Importa objetos desde una cadena JSON.
 */
export function importItemsJSON(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        if (Array.isArray(parsed)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            notifyStorageUpdate();
            return { success: true, count: parsed.length };
        }
        return { success: false, error: 'El archivo JSON no contiene una lista válida.' };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Dispara un evento custom global para que otras pestañas (como Acople 3D)
 * se enteren de que hay nuevos ítems sin recargar.
 */
function notifyStorageUpdate() {
    window.dispatchEvent(new CustomEvent('customItemsUpdated', {
        detail: { timestamp: Date.now() }
    }));
}

/**
 * Compila de forma aislada y segura código Three.js JavaScript
 * que retorna un Object3D o Group.
 *
 * @param {string} code Código de la función que construye el objeto y retorna Object3D
 * @returns {{ success: boolean, object?: THREE.Object3D, error?: string, stats?: { meshes: number, size: THREE.Vector3 } }}
 */
export function buildThreeMeshFromCode(code) {
    if (!code || typeof code !== 'string') {
        return { success: false, error: 'Código Three.js vacío.' };
    }

    try {
        // Limpiar código: remover fences markdown, imports/exports accidentales
        let cleanCode = code.trim();
        cleanCode = cleanCode.replace(/^```(?:javascript|js|typescript|ts)?\s*/i, '');
        cleanCode = cleanCode.replace(/\s*```$/, '');
        cleanCode = cleanCode.replace(/^\s*import\s+.*?;?\s*$/gm, '');
        cleanCode = cleanCode.replace(/^\s*export\s+default\s+/gm, '');
        cleanCode = cleanCode.replace(/^\s*export\s+(?:const|let|var|function)\s+/gm, '');

        // Envolver en una función que recibe THREE como argumento
        // Permite sintaxis directa tipo: "const group = new THREE.Group(); ... return group;"
        const factoryFunction = new Function('THREE', `
            "use strict";
            try {
                ${cleanCode}
            } catch(e) {
                throw new Error("Error en ejecución de código Three.js: " + e.message);
            }
        `);

        const result = factoryFunction(THREE);

        if (!result || !(result instanceof THREE.Object3D)) {
            return {
                success: false,
                error: 'El código Three.js debe retornar una instancia de THREE.Object3D o THREE.Group (ej: return group;).'
            };
        }

        // Analizar estadísticas
        let meshes = 0;
        result.traverse((child) => {
            if (child.isMesh) {
                meshes++;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const box = new THREE.Box3().setFromObject(result);
        const size = new THREE.Vector3();
        box.getSize(size);

        return {
            success: true,
            object: result,
            stats: {
                meshes,
                size
            }
        };
    } catch (err) {
        console.error('[CustomItemStorage] Error compilando Three.js:', err);
        return {
            success: false,
            error: err.message || String(err)
        };
    }
}
