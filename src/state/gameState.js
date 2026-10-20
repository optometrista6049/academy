export const gameState = {

    version:1,

    player:{

        x:0,
        y:0,
        z:0

    },

    quests:{},

    flags:{

        metPanda:false,
        registryUnlocked:false

    },


    inventory:[],

    dialogueIndices:{
        panda:0,
        alto:0,
        telerin:0,
        teleron:0
    },

    npcRelations:{},

    discoveredLocations:[],

    playTime:0,

    sessionControl:{
        enabled:false,
        totalMinutesPlayed:0,
        todayMinutesPlayed:0,
        consumedSeconds:0,
        cooldownUntil:null,
        lastActiveTimestamp:null
    }
};