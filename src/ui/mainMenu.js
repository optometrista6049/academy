import {
    hasSave,
    loadGame,
    deleteSave
}
from '../systems/saveSystem.js';

import {
    createControlsScreen
}
from './controlsScreen.js';

import {
    createCreditsScreen
}
from './creditsScreen.js';

import {
    showLoadingScreen
}
from './loadingScreen.js';

export function createMainMenu(onStart){

    const root =
        document.createElement('div');

    root.id = 'mainMenu';

    Object.assign(

        root.style,

        {

            position:'fixed',

            inset:'0',

            background:
                'url(assets/ui/mainmenu.jpg)',

            backgroundSize:'cover',

            backgroundPosition:'center',

            display:'flex',

            flexDirection:'column',

            justifyContent:'center',

            alignItems:'center',

            gap:'25px',

            zIndex:'9999'

        }

    );

    function createButton(text){

        const btn =
            document.createElement('button');

        btn.innerText = text;

        Object.assign(

            btn.style,

            {

                width:'320px',

                padding:'18px',

                fontSize:'18px',

                borderRadius:'12px',

                border:'none',

                cursor:'pointer',

                background:
                    'rgba(0,0,0,0.65)',

                color:'white',

                backdropFilter:'blur(4px)'

            }

        );

        return btn;

    }

    // =========================
    // CONTINUAR
    // =========================

    const btnContinue =
        createButton(
            'CONTINUAR EXPERIENCIA'
        );

    if(!hasSave()){

        btnContinue.style.display =
            'none';

    }

    btnContinue.onclick = ()=>{

        showLoadingScreen();

        loadGame();

        root.remove();

        setTimeout(()=>{

            onStart();

        },50);

    };

    // =========================
    // NUEVA PARTIDA
    // =========================

    const btnNew =
        createButton(
            'NUEVA EXPERIENCIA'
        );

    btnNew.onclick = ()=>{

        showLoadingScreen();

        deleteSave();

        root.remove();

        setTimeout(()=>{

            onStart();

        },50);

    };

    // =========================
    // PANELES
    // =========================

    const controlsPanel =
        createControlsScreen();

    const creditsPanel =
        createCreditsScreen();

    // =========================
    // CONTROLES
    // =========================

    const btnControls =
        createButton(
            'CONTROLES'
        );

    btnControls.onclick = ()=>{

        controlsPanel.style.display =
            'block';

    };

    // =========================
    // CREDITOS
    // =========================

    const btnCredits =
        createButton(
            'CRÉDITOS'
        );

    btnCredits.onclick = ()=>{

        creditsPanel.style.display =
            'block';

    };

    // =========================
    // APPEND
    // =========================

    root.appendChild(
        btnContinue
    );

    root.appendChild(
        btnNew
    );

    root.appendChild(
        btnControls
    );

    root.appendChild(
        btnCredits
    );

    root.appendChild(
        controlsPanel
    );

    root.appendChild(
        creditsPanel
    );

    document.body.appendChild(
        root
    );

}