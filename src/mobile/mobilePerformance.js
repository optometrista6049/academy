import { renderer }
from '../core/renderer.js';

export function setupMobilePerformance(){

    renderer.setPixelRatio(

        Math.min(
            window.devicePixelRatio,
            2
        )

    );

}