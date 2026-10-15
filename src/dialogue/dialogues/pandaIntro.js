import { unlockRegistry, dismissRegistrySpotlight } from '../../ui/registry/registryUI.js';
import { addInventoryItem } from '../../ui/registry/modules/inventoryModuleV2.js';
import { gameState } from '../../state/gameState.js';

export const pandaIntroDialogue = {

    speaker: 'Panda',

    portrait: './assets/ui/portraits/panda.png',

    speakers: [
        'Panda',
        'Panda',
        'Panda',
        'Panda',
        'Panda',
        'Monty',
        'Monty',
        'Monty',
        'Monty',
        'Monty'
    ],

    pages: [

        '¡Hola! Soy el Panda que te saluda.',

        'Bienvenido a Monteserín Academy.',

        'Me alegra mucho que hayas llegado.',

        'Supongo que ya sabes que eres uno de los aspirantes a ser la nueva IA que ayude a resolver cualquier duda que tengan las personas que se acerquen a nuestra institución para informarse sobre sus opciones para solventar sus problemas de vista y/u oído.',

        'Lo cierto es que eres el primer aspirante en llegar, incluso antes de lo que esperábamos. Aún estamos acondicionando todo y terminando los preparativos... disculpa el desorden.',

        'Pero quizá puedas ayudarme a mí y al resto del equipo. Por cierto, me llamo Monty. Al resto del equipo ya les irás conociendo con total seguridad, si es que no has hablado ya con ellos.',

        'Sé que es raro un mueble solo en mitad de este entorno, pero como te digo, aún estamos en el proceso de organizarlo todo y tenerlo aquí cerca era lo más cómodo para recibir a los nuevos aspirantes.',

        'Para tu primera misión como Aspirante vas a necesitar llegar a aquel mueble y abrirlo.',

        'Toma, aquí tienes la llave. Como ya eres formalmente un Aspirante, tu interfaz ya tiene acceso al REGISTRO. Si miras en la parte inferior de la pantalla, verás que ya aparece su icono. Puedes abrirlo tocándolo o usando la tecla R.',

        'Verás que la llave ya se ha guardado en tu Inventario. Ahora úsala para abrir el mueble y recoger la caja que hay dentro. ¡Cuando la tengas, tráemela!'

    ],

    onPageChange(pageIndex) {
        if (pageIndex === 8) {
            unlockRegistry();
            addInventoryItem('furnitureKey');
            gameState.flags.hasFurnitureKey = true;
        } else if (pageIndex > 8) {
            dismissRegistrySpotlight();
        }
    },

    onComplete() {
        unlockRegistry();
        addInventoryItem('furnitureKey');
        gameState.flags.hasFurnitureKey = true;
        dismissRegistrySpotlight();
    }

};

export const montyWaitingDialogue = {

    speaker: 'Monty',

    portrait: './assets/ui/portraits/panda.png',

    pages: [

        'Recuerda usar la llave de tu Inventario para abrir el mueble que tengo detrás y traerme la caja. ¡Así podré seguir atento a los nuevos aspirantes!',

        'Puedes consultar tu Inventario en cualquier momento abriendo el REGISTRO desde la parte inferior de tu pantalla o con la tecla R.'

    ]

};

export const montyTurnInDialogue = {

    speaker: 'Monty',

    portrait: './assets/ui/portraits/panda.png',

    pages: [

        "¡Hala, mil gracias por traerme la caja! Me has echado una mano enorme. Déjame abrirla... ¡Aquí está! Este Carnet de Aspirante es para ti, tu primera acreditación oficial en Monteserin Academy.",

        "Archivar documentos suele ser opcional, pero te lo recomiendo siempre para tener acceso garantizado y no perder nada. En este caso, al ser un documento importante, el Registro lo detecta y lo archiva directamente. ¡Ah! Y si quieres, echa un ojo a los botones del Registro para ir familiarizándote con ellos.",

        "Una vez descargado el carnet en tu dispositivo, abre su editor de imágenes, usa un rotulador de tinta blanca y firma en el recuadro que pone Registro de Aspirante.",

        "De esa forma, en nuestra sede física podrás disfrutar de las ventajas que el carnet te otorga al identificarte como Aspirante. ¡Enhorabuena!"

    ]

};
