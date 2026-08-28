import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { WORLD_SIZE } from '../core/config.js';

const under = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE*2, WORLD_SIZE*2),
    new THREE.MeshBasicMaterial({ color:0x2a2a2a })
);

under.rotation.x=-Math.PI/2;

under.position.y=-20;

scene.add(under);
