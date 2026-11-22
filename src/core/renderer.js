import * as THREE from 'three';

export const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
});

// Desactivar Tone Mapping para que los colores sean puros, vivos y alegres (sin filtros plomizos ni grises)
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputEncoding = THREE.LinearEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

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