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
    float t1 = time * uFlowSpeed * 1.4;
    float t2 = time * uFlowSpeed * 1.0;
    float t3 = time * uFlowSpeed * 1.8;

    float w1 = sin(p.x * uWaveFrequency * 0.8 + p.y * uWaveFrequency * 0.5 + t1);
    float w2 = cos(p.x * uWaveFrequency * -0.6 + p.y * uWaveFrequency * 0.9 + t2);
    float w3 = sin((p.x + p.y) * uWaveFrequency * 1.5 + t3);

    return (w1 * 0.50 + w2 * 0.35 + w3 * 0.15) * uWaveHeight;
}

void main() {
    vUv = uv;
    vec3 pos = position;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    float elev = getWaveElevation(worldPos.xz, uTime);
    pos.y += elev;

    vec4 finalWorldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = finalWorldPos.xyz;

    float d = 0.3;
    float eX = getWaveElevation(worldPos.xz + vec2(d, 0.0), uTime);
    float eZ = getWaveElevation(worldPos.xz + vec2(0.0, d), uTime);
    vec3 waveNorm = normalize(vec3((elev - eX) / d, 1.0, (elev - eZ) / d));

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

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vViewPosition;

void main() {
    vec3 viewDir = normalize(vViewPosition);

    // Muestreo del mapa de normales en tres capas animadas
    float t = uTime * uFlowSpeed * 0.05;
    vec2 uvScale = uIsRiver > 0.5 ? vec2(vUv.x * 2.5, vUv.y * 12.0) : vWorldPosition.xz * 0.15;

    vec2 uv1 = uvScale + vec2(t * 0.8, t * 0.5);
    vec2 uv2 = uvScale * 1.6 - vec2(t * 0.6, -t * 0.7);
    vec2 uv3 = uvScale * 3.2 + vec2(-t * 0.4, t * 0.9);

    vec3 n1 = texture2D(uNormalMap, uv1).rgb * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormalMap, uv2).rgb * 2.0 - 1.0;
    vec3 n3 = texture2D(uNormalMap, uv3).rgb * 2.0 - 1.0;

    // Combinación de normales multiescala suave
    vec3 blendNormal = normalize(n1 + n2 * 0.75 + n3 * 0.4);

    // Normal en espacio de vista/mundo
    vec3 normal = normalize(mix(vNormal, vec3(blendNormal.x, 1.0, blendNormal.y), 0.40));

    // Vector de reflexión de la vista respecto a la normal del agua
    vec3 reflectDir = reflect(-viewDir, normal);

    // Efecto Fresnel físico (Schlick approximation)
    float NdotV = max(dot(normal, viewDir), 0.0);
    float fresnel = 0.04 + (1.0 - 0.04) * pow(1.0 - NdotV, 4.0);

    // Reflejo continuo del cielo (desde horizonte hasta cenit)
    float skyFactor = clamp(reflectDir.y * 0.85 + 0.15, 0.0, 1.0);
    vec3 skyReflection = mix(uSkyHorizonColor, uSkyTopColor, skyFactor);

    // Resplandor del sol sobre el agua
    vec3 lightDir = normalize(uSunDirection);
    vec3 halfVec = normalize(lightDir + viewDir);
    float NdotH = max(dot(normal, halfVec), 0.0);
    float NdotL = max(dot(normal, lightDir), 0.0);

    float specTight = pow(NdotH, 128.0) * 2.5;
    float specBroad = pow(NdotH, 24.0) * 0.6;
    float sunGlintStrength = (specTight + specBroad) * smoothstep(0.0, 0.3, NdotL);
    vec3 sunGlint = uSunColor * sunGlintStrength;

    // Color del cuerpo de agua (gradiente de profundidad translúcido)
    vec3 waterBody = mix(uShallowColor, uDeepColor, 0.45);

    // Mezcla física: refracción del fondo + reflexión del cielo por Fresnel
    vec3 finalColor = mix(waterBody, skyReflection, fresnel * 0.85);

    // Añadir el resplandor solar
    finalColor += sunGlint;

    // Opacidad de la masa de agua
    float alpha = mix(uOpacity * 0.88, uOpacity, fresnel * 0.4);

    // Nacimiento del afluente en la montaña (vUv.y < 0.22):
    // Borboteo turbulento con dominancia de azul zafiro, turquesa caribeño, micro-ondas concéntricas y finas crestas blancas
    if (uIsRiver > 0.5 && vUv.y < 0.24) {
        float headwaterFactor = 1.0 - smoothstep(0.0, 0.24, vUv.y);

        // Múltiples frecuencias de ebullición y ondas de borbotón
        float boil1 = sin(vUv.x * 24.0 + uTime * 7.5) * cos(vUv.y * 38.0 - uTime * 9.0);
        float boil2 = cos(vUv.x * 36.0 - uTime * 11.0) * sin(vUv.y * 26.0 + uTime * 6.5);
        float boilCombined = (boil1 + boil2 * 0.65) * 0.5 + 0.5;

        // Ondas concéntricas de perturbación en el punto de aterrizaje (vUv.y ≈ 0.16 a 0.22)
        vec2 impactCenter = vec2(0.5, 0.17);
        vec2 deltaUv = (vUv - impactCenter) * vec2(2.5, 1.0);
        float distToImpact = length(deltaUv);
        float impactRipples = sin(distToImpact * 45.0 - uTime * 12.0) * exp(-distToImpact * 8.0);
        boilCombined += impactRipples * 0.28;

        // Paleta en 3 capas cromáticas saturadas:
        vec3 deepSpringBlue = vec3(0.02, 0.40, 0.72); // Azul zafiro / cobalto (#0369a1)
        vec3 turquoiseFoam  = vec3(0.08, 0.75, 0.92); // Turquesa / cian vibrante (#06b6d4)
        vec3 whiteCap       = vec3(0.95, 0.99, 1.0);  // Cresta de espuma blanca fina

        // Gradiente cromático: predomina el azul profundo y turquesa
        vec3 surgeColor = mix(deepSpringBlue, turquoiseFoam, smoothstep(0.15, 0.60, boilCombined));
        // El blanco solo entra en las crestas más altas del borbotón
        surgeColor = mix(surgeColor, whiteCap, smoothstep(0.72, 0.96, boilCombined) * 0.65 * headwaterFactor);

        float blendIntensity = clamp(headwaterFactor * 1.2, 0.0, 1.0);
        finalColor = mix(finalColor, surgeColor, blendIntensity * 0.95);
        alpha = mix(alpha, 1.0, headwaterFactor);
    }

    // Desvanecimiento suave en la unión río-lago para evitar oscurecimiento
    if (uIsRiver > 0.5 && vUv.y > 0.78) {
        float riverFade = 1.0 - smoothstep(0.78, 0.98, vUv.y);
        alpha *= riverFade;
    }

    gl_FragColor = vec4(finalColor, alpha);
}
`;

export function createWaterMaterial(options = {}) {
    const {
        isRiver = false,
        shallowColor = 0x22d3ee,       // Turquesa luminoso cristalino
        deepColor = 0x0369a1,          // Azul océano limpio
        skyTopColor = 0x1e88e5,        // Azul cenit del cielo
        skyHorizonColor = 0xe0f2fe,    // Blanco-celeste del horizonte
        sunDirection = new THREE.Vector3(0.6, 0.85, 0.3).normalize(),
        sunColor = 0xfffaed,
        flowSpeed = 1.0,
        waveHeight = 0.05,
        waveFrequency = 0.14,
        opacity = 0.86
    } = options;

    const normalTexture = getWaterNormalTexture();

    const material = new THREE.ShaderMaterial({
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        uniforms: {
            uTime: { value: 0.0 },
            uNormalMap: { value: normalTexture },
            uIsRiver: { value: isRiver ? 1.0 : 0.0 },
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
