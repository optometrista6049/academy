import * as THREE from 'three';
import { scene } from '../core/scene.js';

scene.background = new THREE.Color(0x87ceeb);

scene.fog = new THREE.Fog(0x87ceeb, 80, 450);

const sky = new THREE.Mesh(

    new THREE.SphereGeometry(1000, 32, 32),

    new THREE.MeshBasicMaterial({
        color:0x87ceeb,
        side:THREE.BackSide
    })

);

scene.add(sky);
