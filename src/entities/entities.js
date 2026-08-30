import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { collidables } from './collisions.js';
import { snap } from '../utils/snap.js';

function addEntity(mesh,type,x,z,offset=1){

    snap(mesh,x,z,offset);

    mesh.userData.solid = true;

    mesh.userData.type = type;

    scene.add(mesh);

    collidables.push(mesh);
}


