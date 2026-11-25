// ======================================================
// REGISTRY CATALOG
// Catálogo general de objetos del Registro
// ======================================================

export const registryCatalog = {

    furnitureKey: {

        //-------------------------------------------------
        // Identificación
        //-------------------------------------------------
        id: "furnitureKey",

        type: "item",

        //-------------------------------------------------
        // Información
        //-------------------------------------------------
        title: "Llave del mueble",

        description:
            "Una llave dorada con llavero verde que te entregó Monty. Abre los cajones de la cómoda de madera.",

        //-------------------------------------------------
        // Recursos gráficos
        //-------------------------------------------------
        thumbnail:
            "assets/registry/inventory/furnitureKey.svg",

        //-------------------------------------------------
        // Comportamiento
        //-------------------------------------------------
        canOpen: false,

        canArchive: false

    },

    badgeBox: {

        //-------------------------------------------------
        // Identificación
        //-------------------------------------------------
        id: "badgeBox",

        type: "item",

        //-------------------------------------------------
        // Información
        //-------------------------------------------------
        title: "Caja de cartón",

        description:
            "Una pequeña caja de cartón cerrada con precinto. Monty te ha pedido que se la lleves tal y como está.",

        //-------------------------------------------------
        // Recursos gráficos
        //-------------------------------------------------
        thumbnail:
            "assets/registry/inventory/badgeBox.svg",

        //-------------------------------------------------
        // Comportamiento
        //-------------------------------------------------
        canOpen: false,

        canArchive: false

    },

    aspirantCard: {

        //-------------------------------------------------
        // Identificación
        //-------------------------------------------------
        id: "aspirantCard",

        type: "document",

        //-------------------------------------------------
        // Información
        //-------------------------------------------------
        title: "Carnet de Aspirante",

        description:
            "Tu primera acreditación oficial en Monteserin Academy. Descárgalo en tu dispositivo, abre su editor de imágenes y firma con un rotulador de tinta blanca en el recuadro 'Registro de Aspirante'.",

        //-------------------------------------------------
        // Recursos gráficos
        //-------------------------------------------------
        thumbnail:
            "assets/ui/ASPIRANTE.jpg",

        documentImage:
            "assets/ui/ASPIRANTE.jpg",

        downloadFilename:
            "Carnet_Aspirante_Monteserin.jpg",

        //-------------------------------------------------
        // Comportamiento
        //-------------------------------------------------
        canOpen: true,

        canArchive: true,

        isArchived: true

    },

    metalDetector: {

        id: "metalDetector",

        type: "item",

        title: "Detector de metales",

        description:
            "Dispositivo calibrado por el Señor Alto para localizar los microchips extraviados en los alrededores. Al llevarlo equipado en la mano derecha, te ayudará a rastrear señales metálicas en el suelo.",

        thumbnail:
            "assets/registry/inventory/metalDetector.svg",

        canOpen: false,

        canArchive: false,

        canEquip: true,

        equipSocket: "rightHand",

        customItemId: "item_1793626331832",

        equipTransform: {
            position: { x: -0.16, y: 0.37, z: 0.09 },
            rotation: { x: -120, y: -135, z: 20 },
            scale: 0.6
        }

    },

    microchip: {

        id: "microchip",

        type: "item",

        title: "Microchips recuperados",

        description:
            "Componentes electrónicos de precisión indispensables para activar el Sistema de Control de Tiempo de Juego. Reúne los 7 por los alrededores y entrégaselos al Señor Alto.",

        thumbnail:
            "assets/registry/inventory/microchip.svg",

        stackable: true,

        maxStack: 7,

        canOpen: false,

        canArchive: false,

        canEquip: false

    },

    visualHygieneDoc: {

        id: "visualHygieneDoc",

        type: "document",

        title: "Guía de Higiene Visual y Postural",

        description:
            "Documento oficial enviado por el Señor Alto con recomendaciones prácticas de higiene visual y buenas costumbres posturales frente a la pantalla.",

        thumbnail:
            "assets/registry/inventory/docHygiene.svg",

        documentImage:
            "assets/docs/guia-higienes-postural-2.pdf",

        downloadFilename:
            "Higiene_Visual_y_Postural_Monteserin.pdf",

        canOpen: true,

        canArchive: true

    },

    timeControlDoc: {

        id: "timeControlDoc",

        type: "document",

        title: "Sistema de Control de Tiempo",

        description:
            "Resumen explicativo enviado por el Señor Alto sobre el funcionamiento de la batería de exploración y tu nuevo Sistema de Control de Tiempo de Juego.",

        thumbnail:
            "assets/registry/inventory/docTimeControl.svg",

        documentImage:
            "assets/docs/control_tiempo.pdf",

        downloadFilename:
            "Sistema_Control_Tiempo_Monteserin.pdf",

        canOpen: true,

        canArchive: true

    }

};