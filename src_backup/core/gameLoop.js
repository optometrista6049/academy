import { clock } from './clock.js';

export function animate({

    scene,
    camera,
    renderer,
    updateFunctions = []

}){

    function loop(){

        requestAnimationFrame(loop);

        // =========================
        // DELTA TIME
        // =========================
        const delta = clock.getDelta();

        // =========================
        // UPDATE SYSTEMS
        // =========================
        for(const update of updateFunctions){

            update(delta);

        }

        // =========================
        // RENDER
        // =========================
        renderer.render(scene, camera);

    }

    loop();

}