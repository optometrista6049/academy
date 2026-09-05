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
        // DELTA TIME (Con límite de seguridad de 50ms para evitar teletransportes o tirones)
        // =========================
        const rawDelta = clock.getDelta();
        const delta = Math.min(rawDelta, 0.05);

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