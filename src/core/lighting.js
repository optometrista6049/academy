import * as THREE from 'three';
import { scene } from './scene.js';

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

/**
 * Mantiene la caja de sombras del sol centrada en la posición del jugador
 * para que las sombras funcionen con máxima calidad en cualquier parte del mapa.
 */
export function updateSunLighting(targetPosition) {
    if (!targetPosition) return;
    
    sunLight.target.position.set(targetPosition.x, targetPosition.y || 0, targetPosition.z);
    sunLight.position.set(
        targetPosition.x + SUN_OFFSET_X,
        (targetPosition.y || 0) + SUN_OFFSET_Y,
        targetPosition.z + SUN_OFFSET_Z
    );
}

// Luz ambiental de relleno suave para sombras luminosas y coloridas
const ambientLight = new THREE.AmbientLight(0xfffdf5, 0.45);
scene.add(ambientLight);


