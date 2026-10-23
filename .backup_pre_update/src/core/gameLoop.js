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
            try {
                update(delta);
            } catch (err) {
                console.warn('Game loop update error caught:', err);
            }
        }

        // =========================
        // RENDER
        // =========================
        try {
            renderer.render(scene, camera);
        } catch (err) {
            console.warn('Game loop render error caught:', err);
        }

    }

    loop();

}