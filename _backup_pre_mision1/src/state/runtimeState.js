export const runtimeState = {

    // =========================
    // PLAYER
    // =========================

    player:null,

    playerHeightOffset:0,

    // =========================
    // ANIMATIONS
    // =========================

    mixer:null,

    actions:{},

    // =========================
    // INPUT TECLADO
    // =========================

    keys:{

        w:false,
        a:false,
        s:false,
        d:false

    },

    // =========================
    // INPUT MOVIL
    // =========================

    mobileInput:{

        forward:0,
        side:0

    },

    // =========================
    // CAMERA
    // =========================

    camera:{

        ax:0,
        ay:0.4,

        distance:8,
        targetDistance:8,

        minZoom:4,
        maxZoom:20

    }

};