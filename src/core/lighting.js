import * as THREE from 'three';
import { scene } from './scene.js';

scene.add(
    new THREE.HemisphereLight(0xffffff, 0x444444)
);

const light = new THREE.DirectionalLight(0xffffff,1);

light.position.set(5,10,7);

scene.add(light);
