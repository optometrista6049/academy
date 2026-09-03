import * as THREE from 'three';

// ============================================================================
// SISTEMA DE TEXTURAS PROCEDURALES DE ALTA DEFINICIÓN (NORMALES Y OLEAJE)
// ============================================================================

let sharedWaterNormalMap = null;

/**
 * Genera una textura de normales de agua hiper-detallada (seamless / repetible)
 * con ondas Gerstner + micro-rugosidad física para capturar destellos y luz.
 */
function getWaterNormalTexture() {
    if (sharedWaterNormalMap) return sharedWaterNormalMap;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    // Función de elevación armónica periódica (toroidal / wrap-around perfecto)
    function heightAt(x, y) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;

        let h = 0.0;
        // Ondas principales cruzadas
        h += Math.sin(u * 2 + v * 1.5) * 0.35;
        h += Math.cos(u * 3 - v * 2) * 0.25;
        // Armónicos medios
        h += Math.sin(u * 6 + v * 4) * 0.15;
        h += Math.cos(u * 5 - v * 7) * 0.12;
        // Micro-ondulaciones de alta frecuencia
        h += Math.sin(u * 12 + v * 8) * 0.08;
        h += Math.cos(u * 9 - v * 14) * 0.05;
        return h;
    }

    const step = 1;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const xLeft = (x - step + size) % size;
            const xRight = (x + step) % size;
            const yDown = (y - step + size) % size;
            const yUp = (y + step) % size;

            const dX = (heightAt(xRight, y) - heightAt(xLeft, y)) * 1.8;
            const dY = (heightAt(x, yUp) - heightAt(x, yDown)) * 1.8;

            // Normal en espacio tangente: (-dX, -dY, 1.0) normalizada
            const len = Math.sqrt(dX * dX + dY * dY + 1.0);
            const nx = -dX / len;
            const ny = -dY / len;
            const nz = 1.0 / len;

            const idx = (y * size + x) * 4;
            // Mapear de [-1, 1] a [0, 255]
            data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
            data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
            data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;

    sharedWaterNormalMap = texture;
    return sharedWaterNormalMap;
}

// ============================================================================
// SHADERS DE AGUA DINÁMICA CON REFLEJO DE CIELO Y DESTELO SOLAR SUAVE
// ============================================================================

const waterVertexShader = `
uniform float uTime;
uniform float uFlowSpeed;
uniform float uWaveHeight;
uniform float uWaveFrequency;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vViewPosition;

float getWaveElevation(vec2 p, float time) {
    float t = time * uFlowSpeed;

    // Campo dinámico aperiódico de ráfagas de viento (agua picada no simétrica)
    float windGust = sin(p.x * 0.034 - t * 0.28 + 1.7) * cos(p.y * 0.041 + t * 0.22 + 2.8) * 0.5 + 0.5;
    float chopMultiplier = 0.75 + 0.55 * windGust;

    // 4 ondas direccionales con frecuencias no armónicas y vectores cruzados irracionales
    // Onda 1: componente principal (noreste)
    vec2 d1 = vec2(0.78, 0.62);
    float ph1 = dot(p, d1) * (uWaveFrequency * 0.85) + t * 1.35;
    float w1 = sin(ph1);

    // Onda 2: componente cruzada (noroeste)
    vec2 d2 = vec2(-0.55, 0.83);
    float ph2 = dot(p, d2) * (uWaveFrequency * 1.38) + t * 1.82;
    float w2 = cos(ph2);

    // Onda 3: componente oblicua rápida (sureste)
    vec2 d3 = vec2(0.92, -0.39);
    float ph3 = dot(p, d3) * (uWaveFrequency * 2.15) + t * 2.45;
    float w3 = sin(ph3);

    // Onda 4: micro-oleaje picado de alta frecuencia
    vec2 d4 = vec2(-0.35, -0.93);
    float ph4 = dot(p, d4) * (uWaveFrequency * 3.42) + t * 3.10;
    float w4 = cos(ph4);

    // Aguzamiento trocoidal de crestas (efecto de cresta afilada / agua picada real)
    float waveSum = (w1 * 0.44 + w2 * 0.30 + w3 * 0.17 + w4 * 0.09);
    float sharpWave = pow(abs(waveSum), 1.32) * sign(waveSum);

    return sharpWave * uWaveHeight * chopMultiplier;
}

void main() {
    vUv = uv;
    vec3 pos = position;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    float elev = getWaveElevation(worldPos.xz, uTime);
    pos.y += elev;

    vec4 finalWorldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = finalWorldPos.xyz;

    // Normales analíticas con paso simétrico de diferencias centradas (sin sesgo direccional ni bandas poligonales)
    float d = 0.35;
    float eX1 = getWaveElevation(worldPos.xz + vec2(d, 0.0), uTime);
    float eX2 = getWaveElevation(worldPos.xz - vec2(d, 0.0), uTime);
    float eZ1 = getWaveElevation(worldPos.xz + vec2(0.0, d), uTime);
    float eZ2 = getWaveElevation(worldPos.xz - vec2(0.0, d), uTime);
    vec3 waveNorm = normalize(vec3((eX2 - eX1) / (2.0 * d), 1.0, (eZ2 - eZ1) / (2.0 * d)));

    vNormal = normalize(normalMatrix * waveNorm);

    vec4 mvPosition = viewMatrix * finalWorldPos;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
}
`;

const waterFragmentShader = `
uniform float uTime;
uniform sampler2D uNormalMap;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uSkyTopColor;
uniform vec3 uSkyHorizonColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uOpacity;
uniform float uFlowSpeed;
uniform float uIsRiver;
uniform float uRiverFadeStart;
uniform float uRiverFadeEnd;
uniform float uRiverLakeStart;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vViewPosition;

// Generador pseudo-aleatorio 2D continuo sin líneas de rejilla
vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

// Red de cáusticas celulares orgánicas (Voronoi elíptico animado sin patrones ortogonales)
float voronoiCell(vec2 p, float time) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash2(n + g);
            // Trayectoria orbital asimétrica continua para cada celda
            o = 0.5 + 0.42 * sin(time + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            minDist = min(minDist, d);
        }
    }
    return sqrt(minDist);
}

// Cáusticas multi-octava con rotación irracional (elimina al 100% cualquier efecto cuadrícula)
float getOrganicCaustics(vec2 pos, float time) {
    mat2 rot38 = mat2(0.788, -0.615, 0.615, 0.788);
    vec2 p1 = pos * 0.35;
    vec2 p2 = (rot38 * pos) * 0.52 + vec2(11.37, 4.82);

    float v1 = voronoiCell(p1, time * 1.25);
    float v2 = voronoiCell(p2, time * 1.75 + 1.8);

    // Los filamentos de luz cáustica se forman en los límites celulares invertidos
    float c1 = pow(clamp(1.0 - v1, 0.0, 1.0), 3.4);
    float c2 = pow(clamp(1.0 - v2, 0.0, 1.0), 3.6);

    return (c1 + c2 * 0.72) * 1.35;
}

void main() {
    vec3 viewDir = normalize(vViewPosition);

    // Muestreo del mapa de normales en coordenadas continuas de mundo
    vec2 worldUV = vWorldPosition.xz * 0.18;
    float t = uTime * uFlowSpeed * 0.055;

    // Perturbación de micro-viento en las normales (agua picada aperiódica)
    vec2 windJitter = vec2(
        sin(worldUV.y * 4.8 - t * 3.8 + vWorldPosition.x * 0.08),
        cos(worldUV.x * 4.4 + t * 3.2 + vWorldPosition.z * 0.08)
    ) * 0.045;

    // En ríos se suma la componente de flujo a lo largo de las coordenadas UV del cauce
    vec2 flowOffset = (uIsRiver > 0.5) 
        ? vec2(0.0, vUv.y * 3.5 - t * 2.2) 
        : vec2(t * 0.65, t * 0.45);

    vec2 uv1 = worldUV + flowOffset * 0.6 + windJitter;
    vec2 uv2 = worldUV * 1.7 - flowOffset * 0.85 + vec2(1.7, 7.3) - windJitter * 1.2;
    vec2 uv3 = worldUV * 3.4 + flowOffset * 1.35 + vec2(-4.1, 2.9) + windJitter * 0.8;

    vec3 n1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
    vec3 n3 = texture2D(uNormalMap, uv3).rgb * 2.0 - 1.0;

    // Combinación de normales multiescala con micro-rugosidad líquida
    vec3 blendNormal = normalize(n1 + n2 * 0.70 + n3 * 0.35);
    vec3 normal = normalize(mix(vNormal, vec3(blendNormal.x, 1.0, blendNormal.y), 0.28));

    // Vector de reflexión especular
    vec3 reflectDir = reflect(-viewDir, normal);

    // Fresnel Físico Real de Agua (IOR = 1.333, F0 = 0.0204)
    // Vista cenital: Fresnel bajo (~2-5%), máxima transparencia hacia el lecho
    // Vista rasante: Fresnel alto (~85-95%), reflejo especular del cielo
    float NdotV = clamp(dot(normal, viewDir), 0.001, 1.0);
    float fresnel = 0.0204 + (1.0 - 0.0204) * pow(1.0 - NdotV, 4.5);

    // Reflejo del cielo (desde horizonte suave hasta el cenit)
    float skyFactor = clamp(reflectDir.y * 0.78 + 0.22, 0.0, 1.0);
    vec3 skyReflection = mix(uSkyHorizonColor, uSkyTopColor, skyFactor);

    // Trayectoria óptica a través del agua según ángulo de cámara
    float opticalPath = clamp(1.0 / NdotV, 1.0, 3.5);

    // Estimación física de profundidad y volumen de agua:
    float depthFactor;
    if (uIsRiver > 0.5) {
        // Opción 2.C: Perturbación fluida por la corriente (rompe la línea recta rígida del centro)
        float streamWiggle = sin(vUv.y * 11.0 - t * 4.2 + vWorldPosition.x * 0.14) * 0.075
                           + cos(vUv.y * 23.0 + t * 2.6 + vWorldPosition.z * 0.16) * 0.045;
        float lateralDist = abs((vUv.x + streamWiggle) - 0.5) * 2.0;
        float shoreFactor = clamp(1.0 - lateralDist, 0.0, 1.0);

        // Opción 2.A: Perfil de lecho suave en artesa (Hermite/Smoothstep tendido sin salto brusco)
        depthFactor = smoothstep(0.01, 0.95, shoreFactor);
    } else {
        float distToLakeCenter = length(vWorldPosition.xz - vec2(100.0, 100.0));
        depthFactor = clamp(1.0 - distToLakeCenter / 55.0, 0.0, 1.0);
        depthFactor = smoothstep(0.08, 0.80, depthFactor);
    }

    float effectiveDepth = clamp(depthFactor * (0.50 + 0.50 * (opticalPath - 1.0) / 2.5), 0.0, 1.0);

    // Color del cuerpo de agua con gradiente continuo de 3 paradas cromáticas:
    // Orillas someras = aguamarina cristalino puro y luminoso
    // Centro/corriente = cyan zafiro transparente y rico en matices (sin mancha negra)
    // Fosas profundas = azul zafiro puro
    vec3 midColor = mix(uShallowColor, vec3(0.065, 0.56, 0.76), 0.58);
    vec3 waterBody;

    if (uIsRiver > 0.5) {
        float midWeight = smoothstep(0.0, 0.68, effectiveDepth);
        float deepWeight = smoothstep(0.32, 1.0, effectiveDepth);
        vec3 streamBody = mix(uShallowColor, midColor, midWeight);
        streamBody = mix(streamBody, uDeepColor, deepWeight * 0.58);
        waterBody = streamBody;

        // Fusión cromática imperceptible con el lago en desembocadura y nacimiento
        float distToLake = length(vWorldPosition.xz - vec2(100.0, 100.0));
        float lakeDepth = smoothstep(0.08, 0.80, clamp(1.0 - distToLake / 55.0, 0.0, 1.0));
        float lakeEffDepth = clamp(lakeDepth * (0.50 + 0.50 * (opticalPath - 1.0) / 2.5), 0.0, 1.0);
        vec3 lakeWaterColor = mix(uShallowColor, uDeepColor, pow(lakeEffDepth, 1.15));

        // Afluente 1 desembocando en el lago (fade end)
        if (uRiverFadeEnd > 0.5 && vUv.y > 0.45) {
            float fadeToLake = smoothstep(0.45, 0.95, vUv.y);
            waterBody = mix(waterBody, lakeWaterColor, fadeToLake);
            effectiveDepth = mix(effectiveDepth, lakeEffDepth, fadeToLake);
        }
        // Emisario 2 saliendo del lago (umbral sur)
        if (uRiverLakeStart > 0.5 && vUv.y < 0.35) {
            float fadeFromLake = 1.0 - smoothstep(0.0, 0.35, vUv.y);
            waterBody = mix(waterBody, lakeWaterColor, fadeFromLake);
            effectiveDepth = mix(effectiveDepth, lakeEffDepth, fadeFromLake);
        }
    } else {
        waterBody = mix(uShallowColor, uDeepColor, pow(effectiveDepth, 1.15));
    }

    // Cáusticas solares celulares orgánicas (red aperiódica sin cuadrícula)
    vec2 causticCoord = (uIsRiver > 0.5) 
        ? vWorldPosition.xz + vec2(0.0, vUv.y * 4.0 - t * 2.5) 
        : vWorldPosition.xz;
    float caustics = clamp(getOrganicCaustics(causticCoord, uTime * 1.35), 0.0, 1.6);
    // Cáustica atenuada suavemente para proyectar filamentos de luz en el fondo sin lavar el agua a blanco
    vec3 causticLight = uSunColor * caustics * (1.0 - effectiveDepth * 0.55) * 0.16;

    // Efecto de agua picada por viento:
    // Detección de crestas con pendiente física empinada
    // En vista cenital directa (NdotV > 0.70), la cámara mira perpendicularmente hacia el lecho,
    // por lo que la espuma superficial de viento se atenúa para mantener la pureza cristalina y no empañar el agua de blanco.
    float windGust = sin(vWorldPosition.x * 0.045 - uTime * 0.35) * cos(vWorldPosition.z * 0.048 + uTime * 0.30) * 0.5 + 0.5;
    float waveSteepness = max(0.0, 1.0 - normal.y);
    float chopFoamRaw = smoothstep(0.35, 0.62, waveSteepness * (1.0 + 0.75 * windGust));
    // Atenuación en vista cenital: a 90° no blanquea la masa de agua; se aprecia en ángulos rasantes e intermedios
    float overheadViewFade = 1.0 - smoothstep(0.68, 0.96, NdotV);
    float chopFoam = chopFoamRaw * overheadViewFade * 0.40;
    vec3 whitecapColor = vec3(0.96, 0.98, 1.0);

    // Mezcla física de agua cristalina: cuerpo de agua + filamentos cáusticos + reflejo de cielo modulado por Fresnel
    vec3 finalColor = mix(waterBody + causticLight, skyReflection, fresnel * 0.85);

    // Incorporación sutil de micro-crestas de espuma de viento
    finalColor = mix(finalColor, whitecapColor, chopFoam);

    // Destello del sol (resplandor especular físico sobre micro-ondas de agua)
    vec3 lightDir = normalize(uSunDirection);
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(dot(normal, halfVec), 0.0);
    float NdotL = max(dot(normal, lightDir), 0.0);

    float specRough = pow(NdotH, 64.0) * 0.65;
    float specSharp = pow(NdotH, 320.0) * 3.5;
    // El destello solar está estrictamente gobernado por Fresnel, impidiendo que blanquee el agua cenital difusamente
    vec3 sunGlint = uSunColor * (specRough + specSharp) * (fresnel * 0.95 + 0.05 * pow(NdotH, 8.0)) * smoothstep(0.0, 0.25, NdotL);
    finalColor += sunGlint;

    // Transparencia óptica natural y cristalina:
    // En las orillas y zonas poco profundas el agua tiene alta transparencia (0.42 - 0.55)
    float baseAlpha = mix(0.42, uOpacity * 0.88, effectiveDepth);
    float alpha = mix(baseAlpha, 0.92, fresnel);

    // Desvanecimiento suave en el origen del afluente 1 (origen montañoso)
    if (uIsRiver > 0.5 && uRiverFadeStart > 0.5 && vUv.y < 0.14) {
        float riverStartFade = smoothstep(0.0, 0.14, vUv.y);
        alpha *= riverStartFade;
    }

    // Desvanecimiento suave en el extremo sumergido del afluente 1 dentro del lago (SOLO si uRiverFadeEnd > 0.5)
    if (uIsRiver > 0.5 && uRiverFadeEnd > 0.5 && vUv.y > 0.88) {
        float riverFade = 1.0 - smoothstep(0.88, 1.0, vUv.y);
        alpha *= riverFade;
    }

    gl_FragColor = vec4(finalColor, alpha);
}
`;

export function createWaterMaterial(options = {}) {
    const {
        isRiver = false,
        riverFadeStart = false,
        riverFadeEnd = false,
        riverLakeStart = false,
        shallowColor = 0x38d2d8,       // Aguamarina cristalina pura y luminosa
        deepColor = 0x0369a1,          // Azul zafiro puro y limpio
        skyTopColor = 0x1e88e5,        // Azul cenit del cielo
        skyHorizonColor = 0xe0f2fe,    // Blanco-celeste del horizonte
        sunDirection = new THREE.Vector3(0.6, 0.85, 0.3).normalize(),
        sunColor = 0xfffaed,
        flowSpeed = 1.0,
        waveHeight = 0.038,
        waveFrequency = 0.16,
        opacity = 0.80
    } = options;

    const normalTexture = getWaterNormalTexture();

    const material = new THREE.ShaderMaterial({
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        uniforms: {
            uTime: { value: 0.0 },
            uNormalMap: { value: normalTexture },
            uIsRiver: { value: isRiver ? 1.0 : 0.0 },
            uRiverFadeStart: { value: riverFadeStart ? 1.0 : 0.0 },
            uRiverFadeEnd: { value: riverFadeEnd ? 1.0 : 0.0 },
            uRiverLakeStart: { value: riverLakeStart ? 1.0 : 0.0 },
            uShallowColor: { value: new THREE.Color(shallowColor) },
            uDeepColor: { value: new THREE.Color(deepColor) },
            uSkyTopColor: { value: new THREE.Color(skyTopColor) },
            uSkyHorizonColor: { value: new THREE.Color(skyHorizonColor) },
            uSunDirection: { value: sunDirection },
            uSunColor: { value: new THREE.Color(sunColor) },
            uFlowSpeed: { value: flowSpeed },
            uWaveHeight: { value: waveHeight },
            uWaveFrequency: { value: waveFrequency },
            uOpacity: { value: opacity }
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    return material;
}

const activeWaterMaterials = new Set();

export function registerWaterMaterial(material) {
    activeWaterMaterials.add(material);
}

export function unregisterWaterMaterial(material) {
    activeWaterMaterials.delete(material);
}

/**
 * Actualiza el tiempo en los shaders de agua
 */
export function updateWaterMaterials(elapsedSeconds) {
    for (const mat of activeWaterMaterials) {
        if (mat.uniforms && mat.uniforms.uTime) {
            mat.uniforms.uTime.value = elapsedSeconds;
        }
    }
}
