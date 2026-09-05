import * as THREE from 'three';
import { scene } from '../core/scene.js';

// Colores atmosféricos alegres, diáfanos y luminosos (cielo azul radiante)
const skyTopColor = '#1e88e5';     // Azul celeste vivo y saturado en el cenit
const skyMidColor = '#42a5f5';     // Azul cielo fresco y brillante
const skyHorizonColor = '#e3f2fd'; // Horizonte luminoso claro

scene.background = new THREE.Color(0x42a5f5);
scene.fog = null; // Sin niebla para máxima nitidez y viveza de color

// ============================================
// CÚPULA CELESTE CON GRADIENTE PROCEDURAL LUMINOSO (FOG DESACTIVADA)
// ============================================
function createGradientSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Gradiente vertical rico y vivo: azul vibrante a horizonte blanco-azulado limpio
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0.0, '#f0f8ff'); // Base horizonte suave y luminosa
    gradient.addColorStop(0.20, '#bbdefb'); // Tono azul claro fresco
    gradient.addColorStop(0.55, '#42a5f5'); // Azul cielo radiante
    gradient.addColorStop(1.0, '#1976d2');  // Azul vivo en el cenit

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;

    // Cúpula celeste esférica que envuelve todo el mundo
    const skyGeo = new THREE.SphereGeometry(800, 32, 24);
    const skyMat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false // CRUCIAL: La niebla nunca opaca el color azul del cielo
    });

    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);
}

createGradientSky();

