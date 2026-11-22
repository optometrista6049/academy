import { clock } from './clock.js';

export function animate({

    scene,
    camera,
    renderer,
    updateFunctions = []

}){

    let lastWarnTime = 0;

    function warnThrottled(label, err) {
        const now = performance.now();
        if (now - lastWarnTime > 2000) {
            lastWarnTime = now;
            console.warn(label, err);
        }
    }

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
                warnThrottled('Game loop update error caught:', err);
            }
        }

        // =========================
        // RENDER
        // =========================
        try {
            renderer.render(scene, camera);
        } catch (err) {
            warnThrottled('Game loop render error caught:', err);
        }

    }

    loop();

}