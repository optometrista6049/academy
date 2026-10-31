import { camera }
from '../core/camera.js';

import { renderer }
from '../core/renderer.js';

export function setupResizeSystem(){

    window.addEventListener(
        "resize",
        ()=>{

            camera.aspect =
                innerWidth / innerHeight;

            camera.updateProjectionMatrix();

            renderer.setSize(
                innerWidth,
                innerHeight
            );

        }
    );

}