// =====================================================
// MOBILE / FULLSCREEN BOOT SCREEN
// =====================================================

function isMobile(){

    return /Android|iPhone|iPad|iPod/i
        .test(navigator.userAgent);

}

// =====================================================
// CREATE BOOT SCREEN
// =====================================================

export function createBootScreen(onStart){

    // =====================================================
    // ROOT
    // =====================================================

    const boot = document.createElement('div');

    boot.id = 'bootScreen';

    // =====================================================
    // BACKGROUND
    // =====================================================

    const bg = document.createElement('div');

    bg.id = 'bootBackground';

    // IMPORTANT:
    // set AFTER append for mobile compatibility

    // =====================================================
    // OVERLAY
    // =====================================================

    const overlay = document.createElement('div');

    overlay.id = 'bootOverlay';

    // =====================================================
    // PANEL
    // =====================================================

    const panel = document.createElement('div');

    panel.id = 'bootPanel';

    // =====================================================
    // TITLE
    // =====================================================

    const title = document.createElement('h1');

    title.innerText =
        'MONTESERIN ACADEMY';

    panel.appendChild(title);

    // =====================================================
    // TEXT
    // =====================================================

    const text = document.createElement('div');

    text.className = 'bootText';

    text.innerHTML = isMobile()

        ? 'Se recomienda jugar en posición horizontal'

        : 'Mejor experiencia en pantalla completa';
		
    panel.appendChild(text);

    // =====================================================
    // BUTTON
    // =====================================================

    const button = document.createElement('button');

    button.id = 'startButton';

    button.innerText =
        'ENTRAR A LA EXPERIENCIA';

    // =====================================================
    // START GAME
    // =====================================================

    button.addEventListener('click', async ()=>{

        try{

            // =============================================
            // FULLSCREEN
            // =============================================

            if(document.documentElement.requestFullscreen){

                await document
                    .documentElement
                    .requestFullscreen();

            }

        }catch(e){}

        try{

            // =============================================
            // LANDSCAPE
            // =============================================

            if(

                screen.orientation &&
                screen.orientation.lock

            ){

                await screen.orientation
                    .lock('landscape');

            }

        }catch(e){}

        // =============================================
        // REMOVE BOOT
        // =============================================

        boot.remove();

        // =============================================
        // START GAME
        // =============================================

        if(onStart){

            onStart();

        }

    });

    panel.appendChild(button);

    // =====================================================
    // APPEND
    // =====================================================

    boot.appendChild(bg);

    boot.appendChild(overlay);

    boot.appendChild(panel);

    document.body.appendChild(boot);

    

}