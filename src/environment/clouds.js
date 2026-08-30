import * as THREE from "three";
import { scene } from "../core/scene.js";
import { WORLD_SIZE, LIMIT } from "../core/config.js";
import { rand } from "../utils/random.js";

// =========================================================================
// TEXTURA PROCEDURAL SUAVE DE VAPOR / HUMO (Canvas en memoria sin aristas)
// =========================================================================
function createVaporTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Gradiente radial con atenuación ultra-suave
  const radGrad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  radGrad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  radGrad.addColorStop(0.2, "rgba(255, 255, 255, 0.85)");
  radGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.45)");
  radGrad.addColorStop(0.8, "rgba(255, 255, 255, 0.12)");
  radGrad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

const vaporTexture = createVaporTexture();

// Paleta de tonalidades naturales para nubes (blanco puro, reflejo cielo azulado, matiz dorado solar)
const cloudTints = [
  0xffffff, // Blanco puro luminoso
  0xf0f7ff, // Reflejo azul cielo diáfano
  0xfffbf2, // Matiz cálido solar
  0xe8f4fd  // Azul pastel suave
];

const clouds = [];
const sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1);

// =========================================================================
// CREAR NUBE ORGÁNICA MULTI-CAPA (ESTILO VAPOR / HUMO FLOTANTE)
// =========================================================================
function createOrganicCloud(x, z) {
  const cloudGroup = new THREE.Group();

  // Tipo de nube aleatoria: 0 = cúmulo vaporoso grande, 1 = jirón alargado, 2 = nube mediana difusa
  const cloudType = Math.floor(rand() * 3);
  const baseTint = cloudTints[Math.floor(rand() * cloudTints.length)];

  // Material individual con variación sutil de color y opacidad
  const material = new THREE.MeshBasicMaterial({
    map: vaporTexture,
    color: baseTint,
    transparent: true,
    opacity: 0.60 + rand() * 0.25,
    depthWrite: false,
    side: THREE.DoubleSide, // Visible tanto desde el suelo como desde cualquier ángulo
    fog: false              // Inmune a la niebla del horizonte
  });

  let puffCount = 7 + Math.floor(rand() * 6);
  let mainScale = 38 + rand() * 35; // Nubes más grandes e imponentes

  if (cloudType === 1) {
    // Jirón alargado tipo estela
    puffCount = 6 + Math.floor(rand() * 4);
    mainScale = 45 + rand() * 40;
  }

  for (let i = 0; i < puffCount; i++) {
    const puff = new THREE.Mesh(sharedPlaneGeometry, material);

    let px = 0;
    let py = (rand() - 0.5) * (mainScale * 0.12);
    let pz = 0;
    let sx = mainScale * (0.6 + rand() * 0.7);
    let sy = mainScale * (0.5 + rand() * 0.6);

    if (cloudType === 1) {
      // Distribución horizontal alargada con variación
      const t = (i / (puffCount - 1)) - 0.5;
      px = t * (mainScale * 1.5);
      pz = (rand() - 0.5) * (mainScale * 0.35);
      sx *= 1.2;
    } else {
      // Masa vaporosa agrupada con núcleo central y bordes difusos
      const radius = (i === 0) ? 0 : (rand() * mainScale * 0.45);
      const angle = rand() * Math.PI * 2;
      px = Math.cos(angle) * radius;
      pz = Math.sin(angle) * radius;
    }

    puff.position.set(px, py, pz);
    puff.scale.set(sx, sy, 1);

    // Planos horizontales orientados al cielo con leve inclinación para dar volumen desde abajo
    puff.rotation.x = -Math.PI / 2 + (rand() - 0.5) * 0.25;
    puff.rotation.z = rand() * Math.PI * 2;

    cloudGroup.add(puff);
  }

  // Altitud en el cielo
  const height = 55 + rand() * 35;
  cloudGroup.position.set(x, height, z);

  // Movimiento sutil, natural y continuo (flotación sobre el terreno)
  cloudGroup.userData = {
    speedX: 0.018 + rand() * 0.012, // Velocidad perceptible y agradable
    speedZ: 0.003 + rand() * 0.005,
    rotSpeed: (rand() - 0.5) * 0.0002,
    bobOffset: rand() * Math.PI * 2,
    baseY: height
  };

  scene.add(cloudGroup);
  clouds.push(cloudGroup);
}

// =========================================================================
// GENERAR CONJUNTO DE NUBES EN LA ESCENA
// =========================================================================
export function generateClouds() {
  const cloudGrid = 5;
  const step = WORLD_SIZE / cloudGrid;

  for (let x = -LIMIT; x <= LIMIT; x += step) {
    for (let z = -LIMIT; z <= LIMIT; z += step) {
      const offsetX = (rand() - 0.5) * (step * 0.85);
      const offsetZ = (rand() - 0.5) * (step * 0.85);

      createOrganicCloud(x + offsetX, z + offsetZ);
    }
  }
}

// =========================================================================
// ACTUALIZAR FLOTACIÓN Y DERIVA CONTINUA
// =========================================================================
export function updateClouds() {
  const time = Date.now() * 0.0006;

  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    const data = c.userData;

    c.position.x += data.speedX;
    c.position.z += data.speedZ;
    c.rotation.y += data.rotSpeed;

    // Flotación ondulante muy sutil
    c.position.y = data.baseY + Math.sin(time + data.bobOffset) * 0.6;

    // Reciclaje infinito de los límites del mapa
    if (c.position.x > LIMIT + 60) {
      c.position.x = -LIMIT - 60;
    }
    if (c.position.z > LIMIT + 60) {
      c.position.z = -LIMIT - 60;
    }
  }
}
