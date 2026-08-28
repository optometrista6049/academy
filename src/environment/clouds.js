import * as THREE from "three";

import { scene } from "../core/scene.js";

import {
 WORLD_SIZE,
  LIMIT
} from "../core/config.js";

import { rand } from "../utils/random.js";



// ======================
// TEXTURA NUBE
// ======================
function createCloudTexture(){

  const canvas = document.createElement("canvas");

  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(
    64,64,10,
    64,64,64
  );

  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.arc(64,64,60,0,Math.PI * 2);

  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}



const cloudTexture = createCloudTexture();

const clouds = [];



// ======================
// CREAR NUBE
// ======================
function createCloud(x, z){

  const cloudGroup = new THREE.Group();

  const layers = 3 + Math.floor(rand() * 4);

  for(let i = 0; i < layers; i++){

    const mat = new THREE.MeshBasicMaterial({

      map: cloudTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.7 + rand() * 0.3

    });

    const size = 15 + rand() * 20;

    const geo = new THREE.PlaneGeometry(size, size);

    const part = new THREE.Mesh(geo, mat);

    part.position.set(

      (rand() - 0.5) * 15,
      (rand() - 0.5) * 5,
      (rand() - 0.5) * 15

    );

    part.rotation.y = rand() * Math.PI;

    cloudGroup.add(part);
  }

  cloudGroup.position.set(

    x,
    40 + rand() * 20,
    z

  );

  cloudGroup.userData.speed = 0.01 + rand() * 0.02;

  scene.add(cloudGroup);

  clouds.push(cloudGroup);
}



// ======================
// GENERAR NUBES
// ======================
export function generateClouds(){

  const cloudGrid = 5;

  for(
    let x = -LIMIT;
    x <= LIMIT;
    x += WORLD_SIZE / cloudGrid
  ){

    for(
      let z = -LIMIT;
      z <= LIMIT;
      z += WORLD_SIZE / cloudGrid
    ){

      const offsetX = (rand() - 0.5) * 40;
      const offsetZ = (rand() - 0.5) * 40;

      createCloud(
        x + offsetX,
        z + offsetZ
      );
    }
  }
}



// ======================
// UPDATE NUBES
// ======================
export function updateClouds(){

  for(const c of clouds){

    c.position.x += c.userData.speed;

    c.position.z += c.userData.speed * 0.3;

    // movimiento vertical suave
    c.position.y +=
      Math.sin(
        Date.now() * 0.0001 + c.position.x
      ) * 0.01;

    // reciclaje horizontal
    if(c.position.x > LIMIT){
      c.position.x = -LIMIT;
    }

    if(c.position.z > LIMIT){
      c.position.z = -LIMIT;
    }

    // reciclaje inverso
    if(c.position.x < -LIMIT){
      c.position.x = LIMIT;
    }

    if(c.position.z < -LIMIT){
      c.position.z = LIMIT;
    }
  }
}