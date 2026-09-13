import * as THREE from 'three';
import { scene } from './scene.js';
import { renderer } from './renderer.js';

// Luz hemisférica diurna (Cielo azul fresco arriba, pradera verde esmeralda abajo)
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x558b2f, 0.70);
scene.add(hemiLight);

// Luz solar principal direccional (luz dorada templada, brillante y limpia)
export const sunLight = new THREE.DirectionalLight(0xfffaed, 1.15);
sunLight.position.set(50, 80, 40);
sunLight.castShadow = true;

// Añadir el target del sol a la escena para poder desplazarlo dinámicamente
scene.add(sunLight.target);

// Configuración optimizada de sombras suaves
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 250;
const d = 75; // Cobertura generosa alrededor del jugador
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.radius = 1.5; // Penumbra suave natural

scene.add(sunLight);

// Offset constante del sol respecto al punto de enfoque
const SUN_OFFSET_X = 50;
const SUN_OFFSET_Y = 80;
const SUN_OFFSET_Z = 40;

let lastSunX = null;
let lastSunZ = null;
let lastShadowUpdateTime = 0;

export function requestShadowUpdate() {
    if (renderer && renderer.shadowMap) {
        renderer.shadowMap.needsUpdate = true;
    }
}

/**
 * Mantiene la caja de sombras del sol centrada en la posición del jugador
 * y gestiona el ciclo de sombras (Shadow Throttling) para ahorrar GPU y batería.
 */
export function updateSunLighting(targetPosition, isMoving = false) {
    if (!targetPosition) return;

    const px = targetPosition.x;
    const py = targetPosition.y || 0;
    const pz = targetPosition.z;

    const dx = lastSunX === null ? 999 : Math.abs(px - lastSunX);
    const dz = lastSunZ === null ? 999 : Math.abs(pz - lastSunZ);
    const moved = isMoving || dx > 0.005 || dz > 0.005;

    if (moved) {
        lastSunX = px;
        lastSunZ = pz;
        sunLight.target.position.set(px, py, pz);
        sunLight.position.set(
            px + SUN_OFFSET_X,
            py + SUN_OFFSET_Y,
            pz + SUN_OFFSET_Z
        );
        // Cuando el jugador se desplaza, refrescar la sombra a 60 FPS completo
        if (renderer && renderer.shadowMap) {
            renderer.shadowMap.needsUpdate = true;
        }
    } else {
        // En reposo: refrescar a cadencia suave (~15-20 FPS) para animaciones sutiles
        const now = performance.now();
        if (now - lastShadowUpdateTime > 60) {
            lastShadowUpdateTime = now;
            if (renderer && renderer.shadowMap) {
                renderer.shadowMap.needsUpdate = true;
            }
        }
    }
}

// Luz ambiental de relleno suave para sombras luminosas y coloridas
const ambientLight = new THREE.AmbientLight(0xfffdf5, 0.45);
scene.add(ambientLight);
