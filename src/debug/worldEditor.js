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

    panel.style.zIndex = '999999';

    panel.style.pointerEvents =
        'none';

    panel.style.borderRadius =
        '8px';

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

export function updateworldEditor(){

    if(
        !panel ||
        !runtimeState.player
    ){
        return;
    }

    const p =
        runtimeState.player.position;

    panel.innerHTML =

        `

        X : ${p.x.toFixed(2)}<br>

        Y : ${p.y.toFixed(2)}<br>

        Z : ${p.z.toFixed(2)}

        `;

}