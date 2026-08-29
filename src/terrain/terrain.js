import * as THREE from 'three';

import { scene } from '../core/scene.js';

import { WORLD_SIZE } from '../core/config.js';

import { getHeightAt } from './terrainHeight.js';

// ======================================================
// GEOMETRY
// ======================================================

const geo = new THREE.PlaneGeometry(
    WORLD_SIZE,
    WORLD_SIZE,
    160,
    160
);

geo.rotateX(-Math.PI / 2);

const pos = geo.attributes.position;

const colors = [];

// ======================================================
// HELPERS
// ======================================================

function lerp(a,b,t){

    return a + (b - a) * t;

}

function blendColor(c1,c2,t){

    return new THREE.Color(

        lerp(c1.r,c2.r,t),
        lerp(c1.g,c2.g,t),
        lerp(c1.b,c2.b,t)

    );

}

// ======================================================
// BASE COLORS
// ======================================================

const grassDark = new THREE.Color(0x355e3b);

const grass = new THREE.Color(0x4c8f4c);

const grassLight = new THREE.Color(0x6aa84f);

const dirt = new THREE.Color(0x7a6a4f);

const rock = new THREE.Color(0x707070);

const rockLight = new THREE.Color(0x9a9a9a);

const snow = new THREE.Color(0xffffff);

// ======================================================
// TERRAIN COLORING
// ======================================================

for(let i = 0; i < pos.count; i++){

    const x = pos.getX(i);

    const z = pos.getZ(i);

    const h = getHeightAt(x,z);

    pos.setY(i,h);

    // =========================================
    // NOISE EXTRA PARA VARIAR COLOR
    // =========================================

    const noise =

        Math.sin(x * 0.08) * 0.5 +

        Math.cos(z * 0.08) * 0.5 +

        Math.sin((x + z) * 0.03);

    let color;

    // =========================================
    // AGUA / HUMEDAD
    // =========================================

    if(h < -1){

        color = blendColor(

            grassDark,
            dirt,
            0.5 + noise * 0.1

        );

    }

    // =========================================
    // HIERBA OSCURA
    // =========================================

    else if(h < 1){

        color = blendColor(

            grassDark,
            grass,
            0.4 + noise * 0.15

        );

    }

    // =========================================
    // HIERBA NORMAL
    // =========================================

    else if(h < 3){

        color = blendColor(

            grass,
            grassLight,
            0.5 + noise * 0.2

        );

    }

    // =========================================
    // TIERRA / TRANSICIÓN
    // =========================================

    else if(h < 5){

        color = blendColor(

            grassLight,
            dirt,
            0.4 + noise * 0.2

        );

    }

    // =========================================
    // ROCA
    // =========================================

    else if(h < 8){

        color = blendColor(

            rock,
            rockLight,
            0.5 + noise * 0.15

        );

    }

    // =========================================
    // NIEVE
    // =========================================

    else{

        color = blendColor(

            rockLight,
            snow,
            0.6 + noise * 0.1

        );

    }

    colors.push(

        color.r,
        color.g,
        color.b

    );

}

// ======================================================
// APPLY COLORS
// ======================================================

geo.setAttribute(

    'color',

    new THREE.Float32BufferAttribute(colors,3)

);

geo.computeVertexNormals();

// ======================================================
// MATERIAL
// ======================================================

const material = new THREE.MeshStandardMaterial({

    vertexColors:true,

    roughness:1,

    metalness:0

});

// ======================================================
// MESH
// ======================================================

const terrain = new THREE.Mesh(

    geo,
    material

);

terrain.receiveShadow = true;

scene.add(terrain);