import { unlockRegistry, dismissRegistrySpotlight } from '../../ui/registry/registryUI.js';

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

        'Si te parece, podrías empezar ayudándome a buscar una caja en ese mueble que está tras de mí y, por favor, cuando la encuentres tráemela. Así yo puedo estar atento por si algún otro aspirante aparece.',

        'Como ya eres formalmente un Aspirante, tu interfaz ya tiene acceso al REGISTRO. Si miras en la parte inferior de la pantalla, verás que ya aparece su icono. Puedes abrirlo tocándolo o usando la tecla R de tu teclado.',

        'Ahí dentro se organizan tu Inventario, tu Diario y tus documentos. Recuerda tu objetivo ahora es ir a aquel mueble y recoger una caja que hay allí. Al cogerla, tu sistema la sumará a tu Inventario para que me la puedas traer, no te preocupes por llevarla encima, en cuanto la recojas, quedará guardada en tu Inventario.'

    ],

    onPageChange(pageIndex) {
        if (pageIndex === 8) {
            unlockRegistry();
        } else if (pageIndex > 8) {
            dismissRegistrySpotlight();
        }
    },

    onComplete() {
        unlockRegistry();
        dismissRegistrySpotlight();
    }

};

export const montyWaitingDialogue = {

    speaker: 'Monty',

    portrait: './assets/ui/portraits/panda.png',

    pages: [

        'Recuerda: busca la caja en el mueble que tengo aquí detrás y tráemela. ¡Así puedo seguir atento a la llegada de otros aspirantes!',

        'Puedes consultar tu Inventario en cualquier momento abriendo el REGISTRO desde la parte inferior de tu pantalla o con la tecla R.'

    ]

};
