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

    }

};