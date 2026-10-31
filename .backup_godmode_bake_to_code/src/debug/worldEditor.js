import { runtimeState }

from '../state/runtimeState.js';

let panel;

// =====================================================
// INIT
// =====================================================

export function initworldEditor(){

    panel = document.createElement('div');

    panel.id = 'worldEditor';

    panel.style.position = 'fixed';

    panel.style.top = '10px';

    panel.style.left = '10px';

    panel.style.padding = '10px';

    panel.style.background =
        'rgba(0,0,0,0.75)';

    panel.style.color = 'white';

    panel.style.fontFamily =
        'monospace';

    panel.style.fontSize = '14px';

    // Opción C3: z-index subordinado para no solapar menús, registro ni diálogos
    panel.style.zIndex = '100';

    panel.style.pointerEvents =
        'none';

    panel.style.borderRadius =
        '8px';

    panel.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

    document.body.appendChild(panel);

    // =========================================
    // PRESS P TO PRINT POSITION
    // =========================================

    window.addEventListener(

        'keydown',

        (e)=>{

            if(
                e.key.toLowerCase() !== 'p'
            ){
                return;
            }

            if(!runtimeState.player){
                return;
            }

            const p =
                runtimeState.player.position;

            console.log(

                `PLAYER POSITION`

            );

            console.log({

                x:Number(
                    p.x.toFixed(2)
                ),

                y:Number(
                    p.y.toFixed(2)
                ),

                z:Number(
                    p.z.toFixed(2)
                )

            });

        }

    );

}

// =====================================================
// UPDATE
// =====================================================

let lastPanelUpdateTime = 0;
let lastCoordString = '';

export function updateworldEditor(){

    if(
        !panel ||
        !runtimeState.player
    ){
        return;
    }

    // Opción C3: Ocultar automáticamente si el registro o un diálogo están abiertos
    const isRegistryOpen = document.body.classList.contains('registry-open');
    const isInDialogue = document.body.classList.contains('in-dialogue');
    if (isRegistryOpen || isInDialogue) {
        if (panel.style.display !== 'none') {
            panel.style.display = 'none';
        }
        return;
    } else {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        }
    }

    const now = performance.now();
    // Actualizar solo 5 veces por segundo (cada 200 ms) para evitar forzar reflows en el DOM a 60 FPS
    if (now - lastPanelUpdateTime < 200) {
        return;
    }
    lastPanelUpdateTime = now;

    const p =
        runtimeState.player.position;

    const newString = `X : ${p.x.toFixed(2)}<br>Y : ${p.y.toFixed(2)}<br>Z : ${p.z.toFixed(2)}`;

    if (newString !== lastCoordString) {
        lastCoordString = newString;
        panel.innerHTML = newString;
    }

}