export function getHeightAt(x,z){

    return (
        Math.sin(x*0.02)*2 +
        Math.cos(z*0.02)*2 +
        Math.sin((x+z)*0.01)*3
    );

}
