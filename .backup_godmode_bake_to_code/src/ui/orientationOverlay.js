function isPortrait(){

    return window.innerHeight >
           window.innerWidth;

}

let overlay = null;

// =====================================================
// CREATE OVERLAY
// =====================================================

export function createOrientationOverlay(){

    overlay =
        document.createElement('div');

    overlay.id = 'orientationOverlay';

    overlay.innerHTML = `

        <div id="orientationText">

            Gira el dispositivo
            para jugar en horizontal

        </div>

    `;

    document.body.appendChild(overlay);

}

// =====================================================
// ENABLE OVERLAY
// =====================================================

export function enableOrientationOverlay(){

    if(!overlay) return;

    function updateOrientation(){

        const mobile =
            /Android|iPhone|iPad|iPod/i
            .test(navigator.userAgent);

        if(mobile && isPortrait()){

            overlay.style.display = 'flex';

        }else{

            overlay.style.display = 'none';

        }

    }

    updateOrientation();

    addEventListener(
        'resize',
        updateOrientation
    );

}