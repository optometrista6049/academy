import * as THREE from 'three';

import { scene } from '../core/scene.js';

import { WORLD_SIZE } from '../core/config.js';

import {
    getHeightAt,
    LAKE_CENTER_X,
    LAKE_CENTER_Z,
    getLakeBasinRadius,
    getShoreRatio,
    LAKE_WATER_Y
} from './terrainHeight.js';
import { getRiverInfo, RIVER_HALF_WIDTH, RIVER_BANK_WIDTH } from './riverPath.js';
import { getBridgeApproachFactor } from '../environment/bridgeSystem.js';

// ======================================================
// GEOMETRY
// ======================================================

const geo = new THREE.PlaneGeometry(
    WORLD_SIZE,
    WORLD_SIZE,
    280,
    280
);

geo.rotateX(-Math.PI / 2);

const pos = geo.attributes.position;

// Aplicar alturas primero
for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = getHeightAt(x, z);
    pos.setY(i, h);
}

// Calcular normales precisas para conocer la inclinación (pendiente) en cada vértice
geo.computeVertexNormals();
const normals = geo.attributes.normal;

const colors = [];

// ======================================================
// HELPERS
// ======================================================

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

function smootherstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0.0, 1.0);
}

function blendColor(c1, c2, t) {
    const clampedT = clamp(t, 0.0, 1.0);
    return new THREE.Color(
        lerp(c1.r, c2.r, clampedT),
        lerp(c1.g, c2.g, clampedT),
        lerp(c1.b, c2.b, clampedT)
    );
}

// ======================================================
// NOISE & DOMAIN WARPING (Curvas suaves sin líneas rectas)
// ======================================================

function rawNoise2D(nx, nz) {
    const a = Math.sin(nx * 1.37 + nz * 0.91 + 1.4);
    const b = Math.cos(nx * 0.83 - nz * 1.51 + 2.7);
    const c = Math.sin((nx + nz) * 1.15 + a * 0.5);
    return (a + b + c) / 3.0; // Rango aprox -1 a 1
}

function fbmNoise2D(nx, nz) {
    let total = 0;
    let amp = 0.52;
    let freq = 1.0;
    for (let o = 0; o < 4; o++) {
        total += rawNoise2D(nx * freq, nz * freq) * amp;
        freq *= 2.07;
        amp *= 0.46;
    }
    return total;
}

// Domain Warping: perturba fuertemente las coordenadas para crear curvas sinuosas, meandros y manchas redondeadas
function warpedNoise2D(x, z, scale, warpStrength = 36.0) {
    const qx = fbmNoise2D(x * scale * 0.6 + 12.4, z * scale * 0.6 - 7.1);
    const qz = fbmNoise2D((x - 48.3) * scale * 0.6, (z + 82.5) * scale * 0.6);

    const rx = (x + qx * warpStrength) * scale;
    const rz = (z + qz * warpStrength) * scale;

    return fbmNoise2D(rx, rz);
}

// ======================================================
// PALETA BIOMAS ORGÁNICOS (Ricos en Rocas, Tierras, Arenas y Vegetación)
// ======================================================

// Arenas, riberas y lechos secos (tonos más cálidos, apagados y terrosos, sin amarillos chillones/blanquecinos)
const sandWet = new THREE.Color(0x765e38);        // Arena húmeda / limo
const sandDry = new THREE.Color(0xa9905d);        // Arena cálida apagada / gravilla
const sandDust = new THREE.Color(0x9a8355);       // Polvo arcilloso suave
const sandGravel = new THREE.Color(0x8c7853);     // Grava arenosa suave

// Tierras, humus, senderos y arcillas (ricos en transiciones orgánicas)
const dirtHumus = new THREE.Color(0x422f1a);      // Humus fértil oscuro
const dirtClay = new THREE.Color(0x694b2e);       // Arcilla marrón templada
const dirtRedClay = new THREE.Color(0x784e30);    // Arcilla rojiza natural
const dirtDrySoil = new THREE.Color(0x86704d);    // Tierra compacta / camino
const dirtLoam = new THREE.Color(0x564127);       // Tierra vegetal franca
const dirtMossy = new THREE.Color(0x505732);      // Tierra con musgo / transición bosque

// Rocas, granito, losas y pedregales
const rockGranite = new THREE.Color(0x686660);    // Granito gris neutro
const rockLight = new THREE.Color(0x827e74);      // Roca caliza clara erosionada
const rockDark = new THREE.Color(0x44423e);       // Roca profunda / sombra
const rockMossy = new THREE.Color(0x5a6048);      // Piedra con líquenes / musgo
const rockGravel = new THREE.Color(0x726b5c);     // Cascajo y grava suelta
const rockSlate = new THREE.Color(0x504f4a);      // Pizarra / roca compacta
const snowPeak = new THREE.Color(0xf2f7fa);       // Nieve de alta cumbre

// Vegetación templada, bosque y riberas húmedas (amplia transición con tierras)
const grassDeep = new THREE.Color(0x284724);      // Bosque umbrío / sotobosque
const grassMeadow = new THREE.Color(0x3f6e33);    // Pradera suave y natural
const grassForestFloor = new THREE.Color(0x4b6630); // Suelo de bosque con acículas
const grassSunlit = new THREE.Color(0x5d7f3a);    // Césped templado
const grassDry = new THREE.Color(0x747e3c);       // Hierba seca / pastizal árido
const grassWetland = new THREE.Color(0x345b2b);   // Hierba ribereña húmeda / juncal
const mossWaterEdge = new THREE.Color(0x475e2b);  // Musgo de orilla inundable

// ======================================================
// TERRAIN COLORING (Mezcla Continua Ponderada por Biomas)
// ======================================================

for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // Normal e inclinación (pendiente)
    const ny = normals.getY(i);
    const slope = 1.0 - ny; // 0 = plano horizontal, >0.15 ladera, >0.35 acantilado

    // 1. Ruido fractal continuo y sinuoso (Domain Warping multiescala)
    const warpMacro = warpedNoise2D(x, z, 0.012, 48.0);         // Macro flujo geológico (~80m)
    const warpMeso = warpedNoise2D(x + 51.3, z - 73.1, 0.032, 26.0); // Meso biomas (~30m)
    const warpMicro = rawNoise2D(x * 0.15, z * 0.15);           // Micro detalle granular (~6m)

    // ----------------------------------------------------
    // 2. CÁLCULO DE PESOS DE BIOMAS (Splatting Continuo)
    // ----------------------------------------------------

    // A. BIOMA ROCOSO / PEDREGOSO
    // - Afloramientos geológicos en praderas y valles
    const rockVessels = smootherstep(0.24, 0.70, warpedNoise2D(x * 1.2 - 110.0, z * 1.2 + 85.0, 0.022, 35.0));
    // - Zona Central de Rocas en (66, 9) y alrededores (78, 14): Núcleo geológico muy rico y visible
    const distToRocksCenter = Math.hypot(x - 67.0, z - 9.5);
    // Efecto geológico masivo en radio de hasta 45 metros con bordes sinuosos
    const rockSanctuaryCore = 1.0 - smootherstep(5.0, 22.0, distToRocksCenter + warpMeso * 12.0);
    const rockSanctuaryAura = 1.0 - smootherstep(18.0, 44.0, distToRocksCenter + warpMacro * 16.0);
    // - Rocas en laderas empinadas y cumbres altas
    const slopeRock = smootherstep(0.09, 0.30, slope);
    const highAltitudeRock = smootherstep(4.8, 9.2, y + warpMacro * 3.0);

    let wRock = (
        rockVessels * 0.40 +
        rockSanctuaryCore * 0.95 +
        rockSanctuaryAura * 0.45 +
        slopeRock * 0.85 +
        highAltitudeRock * 0.75
    );

    // B. BIOMA ARENOSO / GRAVILLA (Acotado a orillas de agua, cuencas y pequeños lechos)
    // - Distancia polar a la orilla del lago para zonificación de ribera
    const dxLake = x - LAKE_CENTER_X;
    const dzLake = z - LAKE_CENTER_Z;
    const distLakeCenter = Math.hypot(dxLake, dzLake);
    const thetaLake = Math.atan2(dzLake, dxLake);
    const basinRadius = getLakeBasinRadius(thetaLake);
    const shoreRadius = basinRadius * getShoreRatio(thetaLake);
    const distFromWaterEdge = distLakeCenter - shoreRadius; // <0 sumergido, 0 orilla, >0 tierra firme

    // Zona de rompiente inmediata (0 a 3m sobre el agua / lecho sumergido)
    const waterEdgeWetSand = (1.0 - smootherstep(-2.0, 4.0, distFromWaterEdge)) * smootherstep(-7.0, -2.5, y);
    // Calas arenosas orgánicas con ruido (evita que toda la ribera sea 100% igual)
    const sandyCoveNoise = smootherstep(0.40, 0.75, warpedNoise2D(x * 1.3 - 40.0, z * 1.3 + 50.0, 0.035, 18.0));
    const shoreBeach = waterEdgeWetSand * (0.50 + sandyCoveNoise * 0.70);

    // - Pequeños claros de arena/grava acotados en el resto del mapa
    const sandPlains = smootherstep(0.44, 0.80, warpedNoise2D(z * 1.15 - 80.0, x * 1.15 + 90.0, 0.022, 28.0));
    // - Arena y polvo fino en el halo de las rocas centrales
    const rockSandHalo = rockSanctuaryAura * (1.0 - rockSanctuaryCore) * 0.45;

    let wSand = (
        shoreBeach * 0.75 +
        sandPlains * 0.30 +
        rockSandHalo * 0.35
    );

    // C. BIOMA TERROSO / ARCILLOSO / HUMUS DE BOSQUE Y HUMEDAL
    // - Suelo fértil, arcilla, humus y suelo de bosque repartido ampliamente
    const earthPlains = smootherstep(0.08, 0.52, warpedNoise2D(x * 1.05 + 60.0, z * 1.05 - 60.0, 0.024, 30.0));
    const dirtRoads = smootherstep(0.24, 0.68, warpedNoise2D(z * 0.95 + 15.0, (x + z) * 0.65, 0.035, 20.0));
    const transitionalEarth = smootherstep(-1.5, 4.0, y + warpMeso * 2.0) * (1.0 - smootherstep(5.5, 8.5, y));
    
    // Limo y tierra húmeda de ribera alrededor del lago (2m a 16m del borde del agua)
    const lakeShoreHumus = (1.0 - smootherstep(1.0, 18.0, Math.abs(distFromWaterEdge))) * smootherstep(-4.6, 1.0, y);

    let wEarth = (
        earthPlains * 0.85 +
        dirtRoads * 0.60 +
        transitionalEarth * 0.55 +
        lakeShoreHumus * 0.70 +
        rockSanctuaryAura * 0.45
    );

    // D. BIOMA VEGETAL / HIERBA, SOTOBOSQUE Y VEGETACIÓN RIBEREÑA HÚMEDA
    // - Humedad y fertilidad: aumentada orgánicamente cerca del lago y del río
    const lakeMoistureBonus = (1.0 - smootherstep(0.0, 32.0, Math.max(0.0, distFromWaterEdge))) * 0.45;
    const moisture = clamp(0.40 + warpMacro * 0.45 + warpMeso * 0.25 + lakeMoistureBonus, 0.0, 1.0);
    const lushPockets = smootherstep(0.25, 0.72, moisture);
    // La vegetación abarca valles y llanuras medias
    const altitudeGrass = smootherstep(-3.8, 0.5, y) * (1.0 - smootherstep(4.5, 7.5, y));
    const slopePenalty = 1.0 - smootherstep(0.07, 0.24, slope);

    // Hierba y juncos que crecen vigorosamente en la orilla húmeda del lago (llegando a 1.5m del agua)
    const lakeRiparianGrass = (1.0 - smootherstep(1.5, 25.0, Math.max(0.0, distFromWaterEdge))) * 
                              smootherstep(-4.4, 0.0, y) * 
                              (0.6 + 0.4 * warpMicro);

    let wGrass = (lushPockets * altitudeGrass * slopePenalty * 0.90) + (lakeRiparianGrass * 0.95);

    // E. CORREDOR DE LOS RÍOS (Lecho arenoso, guijarros y ribera frondosa)
    const inRiverBBox1 = (x >= 120 && x <= 275 && z >= 115 && z <= 275);
    const inRiverBBox2 = (x >= 15 && x <= 200 && z >= -285 && z <= 95);
    if (inRiverBBox1 || inRiverBBox2) {
        const river = getRiverInfo(x, z);
        if (river && river.active && river.distance < (river.bankWidth + 5.0)) {
            const hw = river.halfWidth || RIVER_HALF_WIDTH;
            const bw = river.bankWidth || RIVER_BANK_WIDTH;

            const riverBedMask = 1.0 - smootherstep(hw * 0.35, hw * 1.1, river.distance);
            const riverBankMask = 1.0 - smootherstep(hw * 0.9, bw * 1.15, river.distance);

            wSand += riverBedMask * 1.40;
            wRock += riverBedMask * 0.70;
            wEarth += riverBankMask * 0.85;
            wGrass += riverBankMask * 0.60;
        }
    }

    // F. CAMINO Y ACCESOS A LOS PUENTES (Suelo apisonado, gravilla y piedra)
    const bridgeApproach = getBridgeApproachFactor(x, z);
    if (bridgeApproach > 0.0) {
        wEarth += bridgeApproach * 1.6;
        wSand += bridgeApproach * 0.8;
        wRock += bridgeApproach * 0.9;
        wGrass *= (1.0 - bridgeApproach * 0.85);
    }

    // ----------------------------------------------------
    // 3. NORMALIZACIÓN DE PESOS (Garantiza difuminado perfecto)
    // ----------------------------------------------------
    // Garantizamos que en cualquier elevación o loma intermedia siempre haya sustrato vegetal/tierra
    // evitando sumas nulas que generaban artefactos oscuros
    const rawWeight = wRock + wSand + wEarth + wGrass;
    if (rawWeight < 0.35) {
        const deficit = 0.35 - rawWeight;
        wGrass += deficit * 0.70;
        wEarth += deficit * 0.30;
    }

    const totalWeight = wRock + wSand + wEarth + wGrass;
    const nRock = wRock / totalWeight;
    const nSand = wSand / totalWeight;
    const nEarth = wEarth / totalWeight;
    const nGrass = wGrass / totalWeight;

    // ----------------------------------------------------
    // 4. COLOR DE CADA COMPONENTE CON MICRO-VARIACIÓN
    // ----------------------------------------------------

    // Color del Bioma Rocoso
    const graniteMix = blendColor(rockGranite, rockLight, 0.5 + warpMicro * 0.3);
    const mossOrGravel = blendColor(rockMossy, rockGravel, 0.5 + warpMeso * 0.3);
    const baseRockColor = blendColor(graniteMix, mossOrGravel, 0.4 + warpMacro * 0.3);
    // Si la altura es muy alta, añadir nieve en cumbre
    const snowFactor = smootherstep(7.8, 11.5, y + warpMacro * 2.0);
    const finalRockColor = blendColor(baseRockColor, snowPeak, snowFactor);

    // Color del Bioma Arenoso (tonos cálidos y orgánicos sin blanco chillón)
    const goldenSand = blendColor(sandDry, sandDust, 0.5 + warpMicro * 0.25);
    const wetOrGravelSand = blendColor(sandWet, sandGravel, smootherstep(0.0, -5.0, y));
    const finalSandColor = blendColor(goldenSand, wetOrGravelSand, smootherstep(0.5, -3.0, y));

    // Color del Bioma Terroso (humus rico, tierra arcillosa y parches musgosos)
    const clayMix = blendColor(dirtClay, dirtRedClay, 0.5 + warpMeso * 0.3);
    const humusMix = blendColor(dirtHumus, dirtLoam, moisture);
    const soilWithMoss = blendColor(humusMix, dirtMossy, moisture * 0.6);
    const drySoilMix = blendColor(clayMix, dirtDrySoil, 0.4 + warpMicro * 0.3);
    const finalEarthColor = blendColor(soilWithMoss, drySoilMix, 0.50);

    // Color del Bioma Vegetal (pradera natural, sotobosque, y vegetación ribereña húmeda)
    const meadowMix = blendColor(grassMeadow, grassSunlit, 0.5 + warpMicro * 0.25);
    const forestFloorMix = blendColor(grassDeep, grassForestFloor, moisture);
    const deepOrDryGrass = blendColor(forestFloorMix, grassDry, 1.0 - moisture);
    const standardGrass = blendColor(meadowMix, deepOrDryGrass, 0.40);
    // Tonalidad más verde-musgosa y fresca para zonas de ribera húmeda
    const riparianWetGrass = blendColor(grassWetland, mossWaterEdge, 0.5 + warpMicro * 0.3);
    const wetGrassFactor = (1.0 - smootherstep(0.0, 24.0, Math.max(0.0, distFromWaterEdge))) * smootherstep(-4.5, 0.5, y);
    const finalGrassColor = blendColor(standardGrass, riparianWetGrass, wetGrassFactor * 0.75);

    // ----------------------------------------------------
    // 5. SUMA PONDERADA CONTINUA (Cero aristas, transiciones 100% orgánicas)
    // ----------------------------------------------------
    const finalR = (
        finalRockColor.r * nRock +
        finalSandColor.r * nSand +
        finalEarthColor.r * nEarth +
        finalGrassColor.r * nGrass
    );
    const finalG = (
        finalRockColor.g * nRock +
        finalSandColor.g * nSand +
        finalEarthColor.g * nEarth +
        finalGrassColor.g * nGrass
    );
    const finalB = (
        finalRockColor.b * nRock +
        finalSandColor.b * nSand +
        finalEarthColor.b * nEarth +
        finalGrassColor.b * nGrass
    );

    colors.push(finalR, finalG, finalB);
}

// ======================================================
// APPLY COLORS
// ======================================================

geo.setAttribute(

    'color',

    new THREE.Float32BufferAttribute(colors,3)

);

geo.computeVertexNormals();

// ======================================================
// MATERIAL
// ======================================================

const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: false
});

// ======================================================
// MESH
// ======================================================

const terrain = new THREE.Mesh(

    geo,
    material

);

terrain.receiveShadow = true;

scene.add(terrain);