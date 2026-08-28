import * as THREE from 'three';

import { camera } from './camera.js';

export const renderer = new THREE.WebGLRenderer({

    antialias:true

});

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