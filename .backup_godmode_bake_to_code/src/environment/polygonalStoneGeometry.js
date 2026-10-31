import * as THREE from 'three';

/**
 * Genera una geometría 3D de piedra poligonal irregular con caras facetadas biseladas,
 * simulando las piedras de cantería encajadas de la fotografía de referencia.
 */
export function createPolygonalStoneGeometry(width = 0.6, height = 0.5, depth = 0.35, sides = 6, roundness = 0.85) {
    const shape = new THREE.Shape();
    const halfW = width * 0.5;
    const halfH = height * 0.5;

    // Vértices de polígono irregular cerrado
    const angleStep = (Math.PI * 2) / sides;
    const points = [];

    // Generador pseudo-aleatorio estable basado en dimensiones
    const seed = (width * 100 + height * 50 + depth * 25 + sides * 7);

    for (let i = 0; i < sides; i++) {
        const baseAngle = i * angleStep;
        // Jitter angular y radial para asimetría orgánica como en la foto
        const angleJitter = Math.sin(seed + i * 2.3) * (angleStep * 0.25);
        const radiusJitter = 0.78 + Math.cos(seed * 1.7 + i * 3.1) * 0.22;

        const angle = baseAngle + angleJitter;
        const radX = halfW * radiusJitter;
        const radY = halfH * radiusJitter;

        const x = Math.cos(angle) * radX;
        const y = Math.sin(angle) * radY;
        points.push(new THREE.Vector2(x, y));
    }

    // Dibujar la silueta
    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].y);
    }
    shape.closePath();

    // Extrusión con bisel generoso para simular el abultamiento y las aristas vivas
    const extrudeSettings = {
        steps: 1,
        depth: depth * 0.6,
        bevelEnabled: true,
        bevelThickness: depth * 0.25,
        bevelSize: Math.min(width, height) * 0.14,
        bevelOffset: 0,
        bevelSegments: 2
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();
    // Computar normales planas para mantener aspecto de roca tallada
    geometry.computeVertexNormals();

    return geometry;
}
