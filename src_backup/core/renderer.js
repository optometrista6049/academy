import * as THREE from 'three';

import { camera } from './camera.js';

export const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});

// Desactivar Tone Mapping para que los colores sean puros, vivos y alegres (sin filtros plomizos ni grises)
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.setPixelRatio(

    Math.min(

        window.devicePixelRatio,

        1.5

    )

);

document.body.appendChild(

    renderer.domElement

);

window.addEventListener('resize', ()=>{

    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(

        window.innerWidth,

        window.innerHeight

    );

});