import * as THREE from 'three';

/**
 * Generador procedural de texturas de mampostería poligonal ciclópea (Voronoi / dry stone)
 * inspirada en muros de piedra natural encajados.
 */

export function createPolygonalStoneTexture(width = 1024, height = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Fondo base mortero oscuro / junta profunda
    ctx.fillStyle = '#2a2d30';
    ctx.fillRect(0, 0, width, height);

    // 2. Semillas Voronoi para generar celdas poligonales encajadas
    // Mezcla de celdas grandes dominantes y celdas pequeñas de calzo intermedias
    const points = [];
    const numPoints = 140;

    // Generador pseudo-aleatorio determinista para reproducibilidad
    let seed = 4289;
    function rand() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    }

    // Cuadrícula con jitter para distribución homogénea pero orgánica
    const cols = 12;
    const rows = 12;
    const cellW = width / cols;
    const cellH = height / rows;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // No todos los puntos se crean para permitir piedras más grandes
            if (rand() > 0.12) {
                const px = (c + 0.15 + rand() * 0.70) * cellW;
                const py = (r + 0.15 + rand() * 0.70) * cellH;
                const tone = rand(); // 0 a 1
                points.push({ x: px, y: py, tone, isSmall: false });
            }
        }
    }

    // Añadir algunas piedras de calzo pequeñas en las intersecciones
    for (let i = 0; i < 28; i++) {
        points.push({
            x: rand() * width,
            y: rand() * height,
            tone: rand(),
            isSmall: true
        });
    }

    // Mapa de celdas por pixel (o por bloques para rendimiento ultrarrápido)
    const step = 2; // pixel step
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // Paleta de tonos minerales de piedra inspirados exactamente en la foto:
    // Tonos calizos blanquecinos, grises medios granito, y grises oscuros pizarra
    const palette = [
        { r: 168, g: 172, b: 176 }, // Gris claro calizo
        { r: 148, g: 153, b: 158 }, // Gris medio claro
        { r: 126, g: 132, b: 138 }, // Gris neutro granítico
        { r: 104, g: 110, b: 116 }, // Gris medio oscuro
        { r: 84,  g: 90,  b: 96 },  // Gris pizarra
        { r: 175, g: 178, b: 180 }, // Caliza blanca
        { r: 96,  g: 101, b: 107 }  // Basalto
    ];

    // Precalcular distancias Voronoi usando aproximación por saltos
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let d1 = 999999;
            let d2 = 999999;
            let bestIdx = 0;

            for (let i = 0; i < points.length; i++) {
                const pt = points[i];
                // Distancia con ligera métrica Manhattan mezclada para caras más anguladas
                const dx = Math.abs(x - pt.x);
                const dy = Math.abs(y - pt.y);
                const d = (dx * dx + dy * dy);

                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                    bestIdx = i;
                } else if (d < d2) {
                    d2 = d;
                }
            }

            const dist1 = Math.sqrt(d1);
            const dist2 = Math.sqrt(d2);
            const edgeDist = dist2 - dist1; // Distancia al borde entre piedras

            const idx = (y * width + x) * 4;
            const pt = points[bestIdx];
            const palEntry = palette[Math.floor(pt.tone * palette.length) % palette.length];

            // Si está muy cerca del borde -> Junta de mortero oscura profunda
            const JOINT_WIDTH = 4.5;
            if (edgeDist < JOINT_WIDTH) {
                // Mortero oscuro hendido
                const jointFactor = edgeDist / JOINT_WIDTH;
                const mr = 42 * jointFactor;
                const mg = 45 * jointFactor;
                const mb = 48 * jointFactor;
                data[idx] = mr;
                data[idx + 1] = mg;
                data[idx + 2] = mb;
                data[idx + 3] = 255;
            } else {
                // Dentro de la piedra:
                // Relieve abombado / facetado hacia el centro
                const bevel = Math.min(1.0, (edgeDist - JOINT_WIDTH) / 12.0);

                // Luz direccional simulada (arriba-izquierda hacia abajo-derecha)
                const nx = (x - pt.x) / (dist1 + 1);
                const ny = (y - pt.y) / (dist1 + 1);
                const light = (-nx * 0.5 - ny * 0.5) * 0.25;

                // Micro-ruido mineral de cantería
                const noise = ((x * 12.9898 + y * 78.233) % 1) * 22 - 11;

                let r = palEntry.r * (0.82 + bevel * 0.22) + light * 70 + noise;
                let g = palEntry.g * (0.82 + bevel * 0.22) + light * 70 + noise;
                let b = palEntry.b * (0.82 + bevel * 0.22) + light * 70 + noise;

                data[idx] = Math.max(0, Math.min(255, r));
                data[idx + 1] = Math.max(0, Math.min(255, g));
                data[idx + 2] = Math.max(0, Math.min(255, b));
                data[idx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);

    // Textura Three.js repetible
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.5, 1.5);
    texture.needsUpdate = true;

    // Normal / Bump map sintético derivado del relieve Voronoi
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = width;
    bumpCanvas.height = height;
    const bumpCtx = bumpCanvas.getContext('2d');
    const bumpData = bumpCtx.createImageData(width, height);

    for (let i = 0; i < data.length; i += 4) {
        const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        bumpData.data[i] = gray;
        bumpData.data[i + 1] = gray;
        bumpData.data[i + 2] = gray;
        bumpData.data[i + 3] = 255;
    }
    bumpCtx.putImageData(bumpData, 0, 0);

    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    bumpTexture.wrapS = THREE.RepeatWrapping;
    bumpTexture.wrapT = THREE.RepeatWrapping;
    bumpTexture.repeat.set(1.5, 1.5);
    bumpTexture.needsUpdate = true;

    return { map: texture, bumpMap: bumpTexture };
}
