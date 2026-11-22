// ======================================================
// DIÁLOGOS DE SEÑOR ALTO · MISIÓN 2
// Registro de entrada, Detector de metales y 7 microchips
// ======================================================

export const altoMission2IntroDialogue = {

    speaker: 'Señor Alto',

    portrait: './assets/ui/portraits/alto.png',

    pages: [

        '¡Hola! Te doy la bienvenida. Veo que traes la copia de tu Carnet de Aspirante. ¡Muchas gracias! Dame un segundo para escanearla directamente desde tu Inventario y formalizar tu registro en el sistema de entrada.',

        'Mientras el sistema procesa la información, ¿te importaría echarme una mano? Durante la mudanza se nos cayeron unos microchips muy importantes por esta zona y necesitamos recuperarlos.',

        'Toma este Detector de metales. Al llevarlo equipado, emitirá una señal cuando te acerques a algún chip en el suelo. Hay 7 microchips perdidos en los alrededores. En cuanto los encuentres todos, vuelve a hablar conmigo. ¡Buena suerte!'

    ]

};

export const altoMission2WaitingDialogue = {

    speaker: 'Señor Alto',

    portrait: './assets/ui/portraits/alto.png',

    pages: [

        'Recuerda usar el Detector de metales por los alrededores. En cuanto reúnas los 7 microchips en tu Inventario, avísame'

    ]

};

export const altoMission2TurnInDialogue = {

    speaker: 'Señor Alto',

    portrait: './assets/ui/portraits/alto.png',

    pages: [

        '¡Excelente trabajo! Has encontrado los 7 microchips. Te agradezco enormemente la ayuda, ahora mismo los coloco en su sitio.',

        'Estos microchips eran indispensables para activar tu Sistema de Control de Tiempo de Juego. A partir de este momento, queda integrado de forma automática entre los sistemas propios de tu interfaz de Aspirante, tal y me ocurrió con el Registro.',

        'Para que conozcas a fondo cómo cuidarte mientras juegas y aprendes con nosotros, te acabo de enviar dos documentos a tu Registro: uno sobre higiene visual y buenas costumbres posturales, y otro con el resumen explicativo de tu nuevo sistema de control de tiempo.',

        'Puedes consultarlos o archivarlos cuando quieras en la sección de Registro. Tu registro de entrada ha quedado completado con éxito. ¡Sigue explorando la Academia a tu ritmo!'

    ]

};
