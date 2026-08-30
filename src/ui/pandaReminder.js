import { gameState }
from '../state/gameState.js';

import {

    isMobileDevice

}
from '../utils/deviceDetection.js';

let reminderRoot = null;

let visible = false;

let timer = 0;

export function createPandaReminder(){

    const mobile =
        isMobileDevice();

    reminderRoot =
        document.createElement('div');

    Object.assign(

        reminderRoot.style,

        {

            position:'fixed',

            top: mobile
                ? '10px'
                : '30px',

            left:'50%',

            transform:'translateX(-50%)',

            width: mobile
                ? '85%'
                : '90%',

            maxWidth: mobile
                ? '450px'
                : '700px',

            padding: mobile
                ? '10px'
                : '20px',

            background:
                'rgba(0,0,0,0.85)',

            border:
                '2px solid #d6b06a',

            borderRadius:'20px',

            color:'white',

            zIndex:'14000',

            display:'none'

        }

    );

    const container =
        document.createElement('div');

    Object.assign(

        container.style,

        {

            display:'flex',

            alignItems:'center',

            gap: mobile
                ? '10px'
                : '20px'

        }

    );

    const portrait =
        document.createElement('img');

    portrait.src =
        './assets/ui/portraits/panda.png';

    Object.assign(

        portrait.style,

        {

            width: mobile
                ? '60px'
                : '100px',

            height: mobile
                ? '60px'
                : '100px',

            objectFit:'cover',

            borderRadius:'12px',

            border:
                '2px solid #d6b06a',

            flexShrink:'0'

        }

    );

    const text =
        document.createElement('div');

    text.innerHTML =

        mobile

        ?

        '<strong>Panda</strong><br><br>' +

        '🐼 Ven a hablar conmigo.'

        :

        '<strong>Panda</strong><br><br>' +

        'Hola.<br>' +

        'Ven a hablar conmigo.<br>' +

        'Necesito tu ayuda.';

    Object.assign(

        text.style,

        {

            fontSize: mobile
                ? '14px'
                : '22px',

            lineHeight:'1.5'

        }

    );

    container.appendChild(
        portrait
    );

    container.appendChild(
        text
    );

    reminderRoot.appendChild(
        container
    );

    document.body.appendChild(
        reminderRoot
    );

}

export function updatePandaReminder(delta){

    if(
        gameState.flags.metPanda
    ){

        reminderRoot.style.display =
            'none';

        return;

    }

    timer += delta;

    if(visible){

        if(timer >= 8){

            timer = 0;

            visible = false;

            reminderRoot.style.display =
                'none';

        }

    }else{

        if(timer >= 10){

            timer = 0;

            visible = true;

            reminderRoot.style.display =
                'block';

        }

    }

}