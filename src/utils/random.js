const params = new URLSearchParams(window.location.search);

const seed = parseInt(params.get('seed')) || 1234;

function seededRandom(s){

    return function(){

        s = Math.sin(s) * 10000;

        return s - Math.floor(s);
    };
}

export const rand = seededRandom(seed);
