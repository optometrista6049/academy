import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { camera } from '../core/camera.js';
import { runtimeState } from '../state/runtimeState.js';
import {
    riverSpline,
    RIVER_HALF_WIDTH
} from '../terrain/riverPath.js';
import { createWaterMaterial, registerWaterMaterial } from './waterSystem.js';

let riverMesh = null;
let riverMaterial = null;
let springMesh = null;
let sprayPoints = null;
let landingSplashPoints = null;
let estuarySplashPoints = null;
let estuaryFoamMesh = null;
let springPosition = new THREE.Vector3();
let estuaryPosition = new THREE.Vector3();

/**
 * Crea el brote volumétrico de manantial que brota de la montaña
 * sellando todo el ancho del afluente con ondas y espuma con matices azulados.
 */
function createSpringSurge(p0, tangent0, normal0) {
    const uSegments = 18;
    const vSegments = 16;
    const positions = [];
    const uvs = [];
    const indices = [];

    // Dimensiones ampliadas del brote para cubrir todo el ancho del cauce (~11.0m de envergadura)
    const halfW = RIVER_HALF_WIDTH * 1.5;  // ~5.7m (11.4m de ancho total)
    const heightArch = 2.8;                // Altura máxima del arco de agua
    const reachForward = 5.4;              // Longitud hacia el cauce
    const reachInside = 3.6;               // Penetración profunda dentro de la roca de la montaña

    for (let i = 0; i <= uSegments; i++) {
        const u = i / uSegments; // 0: dentro de la montaña, 1: unión con la superficie del río

        // Perfil parabólico de caída del agua
        const forward = -reachInside + u * (reachInside + reachForward);
        const yDrop = (1.0 - u) * (1.0 - u) * heightArch;

        for (let j = 0; j <= vSegments; j++) {
            const v = j / vSegments; // 0 a 1
            const lateral = (v - 0.5) * 2.0; // -1 a 1

            // Anchura acampanada que se ensancha suavemente al descender
            const currentHalfW = halfW * (0.75 + u * 0.38);
            // Bóveda convexa transversal con ligera modulación asimétrica natural
            const asymmetricFactor = 1.0 + Math.sin(lateral * 3.14159 * 2.0) * 0.08;
            const arch = Math.cos(lateral * Math.PI * 0.5) * 0.55 * (1.0 - u * 0.45) * asymmetricFactor;

            const px = p0.x + tangent0.x * forward + normal0.x * (lateral * currentHalfW);
            const py = p0.y + yDrop + arch;
            const pz = p0.z + tangent0.z * forward + normal0.z * (lateral * currentHalfW);

            positions.push(px, py, pz);
            uvs.push(v, u);
        }
    }

    const vertsPerRow = vSegments + 1;
    for (let i = 0; i < uSegments; i++) {
        for (let j = 0; j < vSegments; j++) {
            const a = i * vertsPerRow + j;
            const b = (i + 1) * vertsPerRow + j;
            const c = (i + 1) * vertsPerRow + (j + 1);
            const d = i * vertsPerRow + (j + 1);

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const springMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uFoamColor: { value: new THREE.Color(0xf0fdfa) },
            uTurquoiseColor: { value: new THREE.Color(0x06b6d4) },
            uDeepColor: { value: new THREE.Color(0x0369a1) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform float uTime;

            void main() {
                vUv = uv;
                vec3 pos = position;

                // Vetas de corriente turbulenta entrelazadas y pulsaciones orgánicas
                float strand1 = sin(uv.x * 16.0 + uv.y * 8.0 - uTime * 6.5) * 0.07;
                float strand2 = cos(uv.x * 24.0 - uv.y * 12.0 + uTime * 8.2) * 0.05;
                float surge = sin(uv.y * 14.0 - uTime * 7.5) * 0.09 + (strand1 + strand2) * (1.0 - uv.y * 0.3);
                pos += normal * surge;

                vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uFoamColor;
            uniform vec3 uTurquoiseColor;
            uniform vec3 uDeepColor;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                    u.y
                );
            }

            void main() {
                // Vetas longitudinales de agua viva que se entrelazan de forma natural
                vec2 flowUv1 = vec2(vUv.x * 6.0 + sin(vUv.y * 4.0 + uTime) * 0.15, vUv.y * 14.0 - uTime * 4.6);
                vec2 flowUv2 = vec2(vUv.x * 10.0 + 0.4, vUv.y * 22.0 - uTime * 6.8);
                vec2 microUv = vec2(vUv.x * 18.0 - 0.2, vUv.y * 32.0 - uTime * 9.0);

                float n1 = noise(flowUv1);
                float n2 = noise(flowUv2);
                float n3 = noise(microUv) * 0.4;
                float strands = (n1 * 0.6 + n2 * 0.4 + n3);

                // Estructura de color rica y cristalina
                vec3 col = mix(uDeepColor, uTurquoiseColor, smoothstep(0.18, 0.62, strands));
                // Espuma blanca solo en filamentos rápidos y crestas finas
                float foamFilament = smoothstep(0.68, 0.92, strands);
                col = mix(col, uFoamColor, foamFilament * 0.65);

                // Bordes laterales suaves y fundido orgánico inferior
                float edgeX = smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
                float fadeBottom = smoothstep(1.0, 0.65, vUv.y);

                // Opacidad natural del agua cristalina
                float alpha = (0.94 + foamFilament * 0.06) * edgeX * (0.58 + fadeBottom * 0.42);

                gl_FragColor = vec4(col, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    registerWaterMaterial(springMaterial);
    springMesh = new THREE.Mesh(geo, springMaterial);
    springMesh.frustumCulled = false;
    scene.add(springMesh);
}

/**
 * Sistema de partículas GPU de salpicaduras / spray en la salida de la roca
 */
function createSpringSpray(p0, tangent0, normal0) {
    const count = 64;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aParams = new Float32Array(count * 4); // x: phase, y: speed, z: size, w: lateralSpread

    // Anchura de dispersión generosa de orilla a orilla (~10m)
    const lateralExtent = RIVER_HALF_WIDTH * 2.5;

    for (let i = 0; i < count; i++) {
        positions[i * 3 + 0] = p0.x;
        positions[i * 3 + 1] = p0.y;
        positions[i * 3 + 2] = p0.z;

        aParams[i * 4 + 0] = Math.random() * 10.0;                       // phase
        aParams[i * 4 + 1] = 1.3 + Math.random() * 1.5;                  // speed
        aParams[i * 4 + 2] = 3.2 + Math.random() * 2.8;                  // size generoso
        aParams[i * 4 + 3] = (Math.random() - 0.5) * lateralExtent;      // dispersión que cubre todo el ancho
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aParams', new THREE.BufferAttribute(aParams, 4));

    const sprayMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uTangent: { value: tangent0 },
            uNormal: { value: normal0 },
            uDeepColor: { value: new THREE.Color(0x0284c7) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
            uWhiteColor: { value: new THREE.Color(0xf0fdfa) }
        },
        vertexShader: `
            attribute vec4 aParams;
            uniform float uTime;
            uniform vec3 uTangent;
            uniform vec3 uNormal;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                float phase = aParams.x;
                float speed = aParams.y;
                float pSize = aParams.z;
                float spread = aParams.w;

                // Ciclo continuo de 1.6 segundos por partícula
                float cycle = mod((uTime + phase) * speed, 1.6);
                float progress = cycle / 1.6; // 0.0 a 1.0
                vProgress = progress;

                // Trayectoria parabólica hacia el frente y hacia arriba
                vec3 pos = position;
                pos += uNormal * spread;
                pos += uTangent * (progress * 5.2 + 0.2);
                // Arco de salto en Y
                pos.y += sin(progress * 3.14159) * 2.6 - (progress * progress * 0.6);

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float dist = length(mvPosition.xyz);

                // LOD integrado en Shader: atenuación suave por distancia a cámara (hasta 240m)
                float distFade = smoothstep(240.0, 50.0, dist);
                vAlpha = sin(progress * 3.14159) * 0.88 * distFade;

                gl_PointSize = pSize * (240.0 / max(dist, 1.0)) * distFade;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uDeepColor;
            uniform vec3 uCyanColor;
            uniform vec3 uWhiteColor;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;
                float soft = smoothstep(0.5, 0.08, dist);

                // Matices: de azul zafiro/cian a gotas efervescentes
                vec3 pCol = mix(uDeepColor, uCyanColor, smoothstep(0.0, 0.45, vProgress));
                pCol = mix(pCol, uWhiteColor, smoothstep(0.70, 0.95, vProgress) * 0.5);

                gl_FragColor = vec4(pCol, vAlpha * soft);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(sprayMat);
    sprayPoints = new THREE.Points(geo, sprayMat);
    sprayPoints.renderOrder = 20;
    sprayPoints.frustumCulled = false;
    scene.add(sprayPoints);
}

/**
 * Sistema de partículas GPU de impacto y rebote de agua en el lecho del río
 * donde rompe el chorro del manantial, incluyendo micro-bruma y salpicaduras vivas.
 */
function createLandingSplash(p0, tangent0, normal0) {
    const count = 96; // 64 salpicaduras balísticas + 32 de micro-bruma suspendida
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aSplashParams = new Float32Array(count * 4); // x: phase, y: speed, z: size, w: angle

    // Punto central de impacto del chorro sobre la lámina del río (~4.8m hacia delante)
    const landingX = p0.x + tangent0.x * 4.8;
    const landingY = p0.y - 0.15;
    const landingZ = p0.z + tangent0.z * 4.8;

    const lateralExtent = RIVER_HALF_WIDTH * 2.3;

    for (let i = 0; i < count; i++) {
        // Dispersión a lo ancho de la zona de choque
        const lateralOffset = (Math.random() - 0.5) * lateralExtent;
        const forwardOffset = (Math.random() - 0.5) * 2.8;

        positions[i * 3 + 0] = landingX + normal0.x * lateralOffset + tangent0.x * forwardOffset;
        positions[i * 3 + 1] = landingY;
        positions[i * 3 + 2] = landingZ + normal0.z * lateralOffset + tangent0.z * forwardOffset;

        const isMist = i >= 64; // Las últimas 32 son micro-bruma suave
        aSplashParams[i * 4 + 0] = Math.random() * 8.0;                                   // Phase
        aSplashParams[i * 4 + 1] = isMist ? 0.6 + Math.random() * 0.5 : 1.4 + Math.random() * 1.8; // Speed
        aSplashParams[i * 4 + 2] = isMist ? 6.5 + Math.random() * 5.0 : 2.5 + Math.random() * 2.6; // Size
        aSplashParams[i * 4 + 3] = isMist ? -1.0 : Math.random() * Math.PI * 2.0;         // Angle (<0 indica bruma)
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSplashParams', new THREE.BufferAttribute(aSplashParams, 4));

    const splashMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uDeepColor: { value: new THREE.Color(0x0284c7) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
            uFoamColor: { value: new THREE.Color(0xf0fdfa) },
            uMistColor: { value: new THREE.Color(0xbbf7d0) } // Matiz de agua clara
        },
        vertexShader: `
            attribute vec4 aSplashParams;
            uniform float uTime;
            varying float vAlpha;
            varying float vProgress;
            varying float vIsMist;

            void main() {
                float phase = aSplashParams.x;
                float speed = aSplashParams.y;
                float pSize = aSplashParams.z;
                float angle = aSplashParams.w;

                bool isMist = angle < -0.5;
                vIsMist = isMist ? 1.0 : 0.0;

                float cycleDuration = isMist ? 2.4 : 1.1;
                float cycle = mod((uTime + phase) * speed, cycleDuration);
                float progress = cycle / cycleDuration;
                vProgress = progress;

                vec3 pos = position;

                if (isMist) {
                    // Bruma ascendente lenta y expansión suave
                    pos.y += progress * 1.8;
                    pos.x += sin(progress * 4.0 + phase) * 0.8;
                    pos.z += cos(progress * 4.0 + phase) * 0.8;
                } else {
                    // Salto balístico rápido y radial de las gotas
                    float radDist = progress * 1.9;
                    pos.x += cos(angle) * radDist;
                    pos.z += sin(angle) * radDist;
                    pos.y += sin(progress * 3.14159) * 1.5 - (progress * progress * 0.4);
                }

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float dist = length(mvPosition.xyz);

                float distFade = smoothstep(240.0, 50.0, dist);
                float baseAlpha = isMist ? 0.35 : 0.88;
                vAlpha = sin(progress * 3.14159) * baseAlpha * distFade;

                gl_PointSize = pSize * (220.0 / max(dist, 1.0)) * distFade;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uDeepColor;
            uniform vec3 uCyanColor;
            uniform vec3 uFoamColor;
            varying float vAlpha;
            varying float vProgress;
            varying float vIsMist;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                if (vIsMist > 0.5) {
                    // Micro-neblina con contorno sumamente difuso
                    float softMist = smoothstep(0.5, 0.0, dist);
                    vec3 mistCol = mix(uCyanColor, uFoamColor, 0.4);
                    gl_FragColor = vec4(mistCol, vAlpha * softMist * 0.4);
                } else {
                    // Gotículas brillantes
                    float soft = smoothstep(0.5, 0.05, dist);
                    vec3 col = mix(uCyanColor, uDeepColor, smoothstep(0.2, 0.8, vProgress));
                    col = mix(col, uFoamColor, smoothstep(0.0, 0.3, vProgress) * (1.0 - smoothstep(0.3, 0.7, vProgress)) * 0.45);
                    gl_FragColor = vec4(col, vAlpha * soft);
                }
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(splashMat);
    landingSplashPoints = new THREE.Points(geo, splashMat);
    landingSplashPoints.renderOrder = 20;
    landingSplashPoints.frustumCulled = false;
    scene.add(landingSplashPoints);
}

/**
 * Sistema de partículas GPU volumétrico multi-bloque en la desembocadura:
 * Despliega 3 capas ortogonales de partículas:
 * 1. Chorro longitudinal a lo largo del flujo del río hacia el lago.
 * 2. Abanico transversal en expansión lateral sobre el delta del lago.
 * 3. Micro-bruma ascendente y vapor suspendido.
 * Emplea distancia esférica invariante para mantener presencia total en cualquier rotación de cámara.
 */
function createEstuarySplash(pStart, pEnd, tangentDir, normalDir) {
    const count = 280;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aEstuaryParams = new Float32Array(count * 4); // x: phase, y: speed, z: size, w: type (0: flow, 1: fan, 2: mist)
    const aDirections = new Float32Array(count * 3);    // Vector unitario de impulso específico

    const lateralExtent = RIVER_HALF_WIDTH * 2.2;

    for (let i = 0; i < count; i++) {
        const tSpan = Math.random();
        const baseX = pStart.x + (pEnd.x - pStart.x) * tSpan;
        const baseZ = pStart.z + (pEnd.z - pStart.z) * tSpan;

        const spreadMultiplier = 1.0 + tSpan * 0.45;
        const lateralOffset = (Math.random() - 0.5) * lateralExtent * spreadMultiplier;
        const forwardOffset = (Math.random() - 0.5) * 2.5;

        positions[i * 3 + 0] = baseX + normalDir.x * lateralOffset + tangentDir.x * forwardOffset;
        positions[i * 3 + 1] = -4.5;
        positions[i * 3 + 2] = baseZ + normalDir.z * lateralOffset + tangentDir.z * forwardOffset;

        if (i < 120) {
            // Capa 1: Corriente longitudinal turbulenta
            const dirSpread = (Math.random() - 0.5) * 0.6;
            const dirX = tangentDir.x + normalDir.x * dirSpread;
            const dirZ = tangentDir.z + normalDir.z * dirSpread;
            const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1.0;

            aDirections[i * 3 + 0] = dirX / len;
            aDirections[i * 3 + 1] = 0;
            aDirections[i * 3 + 2] = dirZ / len;

            aEstuaryParams[i * 4 + 0] = Math.random() * 8.0;
            aEstuaryParams[i * 4 + 1] = 1.3 + Math.random() * 1.5;
            aEstuaryParams[i * 4 + 2] = 3.2 + Math.random() * 3.4;
            aEstuaryParams[i * 4 + 3] = 0.0; // Tipo longitudinal
        } else if (i < 210) {
            // Capa 2: Abanico transversal en expansión radial en el estuario
            const fanAngle = (Math.random() - 0.5) * Math.PI * 0.85;
            const dirX = Math.cos(fanAngle) * tangentDir.x - Math.sin(fanAngle) * tangentDir.z;
            const dirZ = Math.sin(fanAngle) * tangentDir.x + Math.cos(fanAngle) * tangentDir.z;

            aDirections[i * 3 + 0] = dirX;
            aDirections[i * 3 + 1] = 0;
            aDirections[i * 3 + 2] = dirZ;

            aEstuaryParams[i * 4 + 0] = Math.random() * 8.0;
            aEstuaryParams[i * 4 + 1] = 1.0 + Math.random() * 1.3;
            aEstuaryParams[i * 4 + 2] = 3.6 + Math.random() * 3.8;
            aEstuaryParams[i * 4 + 3] = 1.0; // Tipo abanico transversal
        } else {
            // Capa 3: Micro-bruma ascendente y vapor flotante
            aDirections[i * 3 + 0] = 0;
            aDirections[i * 3 + 1] = 1.0;
            aDirections[i * 3 + 2] = 0;

            aEstuaryParams[i * 4 + 0] = Math.random() * 8.0;
            aEstuaryParams[i * 4 + 1] = 0.45 + Math.random() * 0.45;
            aEstuaryParams[i * 4 + 2] = 9.0 + Math.random() * 7.5;
            aEstuaryParams[i * 4 + 3] = 2.0; // Tipo bruma
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aEstuaryParams', new THREE.BufferAttribute(aEstuaryParams, 4));
    geo.setAttribute('aDirection', new THREE.BufferAttribute(aDirections, 3));

    const estuaryMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uDeepColor: { value: new THREE.Color(0x0284c7) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
            uFoamColor: { value: new THREE.Color(0xf8fafc) }
        },
        vertexShader: `
            attribute vec4 aEstuaryParams;
            attribute vec3 aDirection;
            uniform float uTime;
            varying float vAlpha;
            varying float vProgress;
            varying float vType;

            void main() {
                float phase = aEstuaryParams.x;
                float speed = aEstuaryParams.y;
                float pSize = aEstuaryParams.z;
                float pType = aEstuaryParams.w;
                vType = pType;

                float cycleDuration = (pType > 1.5) ? 2.8 : ((pType > 0.5) ? 1.4 : 1.1);
                float cycle = mod((uTime + phase) * speed, cycleDuration);
                float progress = cycle / cycleDuration;
                vProgress = progress;

                vec3 pos = position;

                if (pType > 1.5) {
                    // Bruma flotante y suave que se eleva
                    pos.y += progress * 2.5;
                    pos.x += sin(progress * 3.5 + phase) * 1.1;
                    pos.z += cos(progress * 3.5 + phase) * 1.1;
                } else if (pType > 0.5) {
                    // Abanico transversal
                    float fanSpan = progress * 2.6;
                    pos += aDirection * fanSpan;
                    pos.y += sin(progress * 3.14159) * 1.25 - (progress * progress * 0.3);
                } else {
                    // Chorro longitudinal
                    float flowSpan = progress * 3.2;
                    pos += aDirection * flowSpan;
                    pos.y += sin(progress * 3.14159) * 1.1 - (progress * progress * 0.25);
                }

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                // Distancia esférica 3D: invariante absoluta ante cualquier ángulo o giro de cámara
                float dist = length(mvPosition.xyz);

                float distFade = smoothstep(280.0, 50.0, dist);
                float baseAlpha = (pType > 1.5) ? 0.65 : 0.95;
                vAlpha = sin(progress * 3.14159) * baseAlpha * distFade;

                gl_PointSize = pSize * (260.0 / max(dist, 1.0)) * distFade;
                gl_PointSize = clamp(gl_PointSize, 1.0, 180.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uDeepColor;
            uniform vec3 uCyanColor;
            uniform vec3 uFoamColor;
            varying float vAlpha;
            varying float vProgress;
            varying float vType;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                if (vType > 1.5) {
                    float softMist = smoothstep(0.5, 0.0, dist);
                    vec3 mistCol = mix(uCyanColor, uFoamColor, 0.75);
                    gl_FragColor = vec4(mistCol, vAlpha * softMist * 0.75);
                } else {
                    float soft = smoothstep(0.5, 0.04, dist);
                    vec3 col = mix(uCyanColor, uFoamColor, smoothstep(0.05, 0.40, vProgress));
                    col = mix(col, uDeepColor, smoothstep(0.60, 1.0, vProgress) * 0.30);
                    gl_FragColor = vec4(col, vAlpha * soft);
                }
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(estuaryMat);
    estuarySplashPoints = new THREE.Points(geo, estuaryMat);
    estuarySplashPoints.renderOrder = 25;
    estuarySplashPoints.frustumCulled = false;
    scene.add(estuarySplashPoints);
}

/**
 * Malla Decal de espuma procedural en la superficie del estuario:
 * Se extiende justo en la cota del agua (Y = -4.48m) cubriendo la unión del afluente con el lago
 * con olas animadas de efervescencia y desvanecimiento suave hacia las orillas y el interior del lago.
 */
function createEstuaryFoamDecal(tStart, tEnd) {
    const lengthSegments = 36;
    const widthSegments = 16;
    const geo = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= lengthSegments; i++) {
        const uFrac = i / lengthSegments;
        const t = tStart + uFrac * (tEnd - tStart);

        const centerPt = riverSpline.getPoint(t);
        const tangent = riverSpline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Expansión orgánica en embudo del delta hacia el lago
        const spreadFactor = 1.0 + uFrac * 1.25;
        const halfWidth = (RIVER_HALF_WIDTH + 0.6) * spreadFactor;

        for (let j = 0; j <= widthSegments; j++) {
            const vFrac = j / widthSegments;
            const across = (vFrac - 0.5) * 2.0;

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            const vy = -4.48; // Apenas 2cm por encima del plano del lago (-4.5m)

            positions.push(vx, vy, vz);
            uvs.push(vFrac, uFrac);
        }
    }

    const vertsPerRow = widthSegments + 1;
    for (let i = 0; i < lengthSegments; i++) {
        for (let j = 0; j < widthSegments; j++) {
            const a = i * vertsPerRow + j;
            const b = (i + 1) * vertsPerRow + j;
            const c = (i + 1) * vertsPerRow + (j + 1);
            const d = i * vertsPerRow + (j + 1);

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    const foamMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uDeepColor: { value: new THREE.Color(0x0284c7) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
            uFoamColor: { value: new THREE.Color(0xffffff) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uFoamColor;
            uniform vec3 uCyanColor;
            uniform vec3 uDeepColor;
            varying vec2 vUv;

            void main() {
                // Desvanecimiento suave en los bordes laterales y en extremos
                float bankFade = smoothstep(0.0, 0.28, vUv.x) * (1.0 - smoothstep(0.72, 1.0, vUv.x));
                float flowFade = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
                float borderMask = bankFade * flowFade;

                // Ondas turbulentas de corriente rápida
                vec2 flowUV1 = vec2(vUv.x * 4.0, vUv.y * 7.0 - uTime * 1.6);
                vec2 flowUV2 = vec2(vUv.x * 6.0 + 0.4, vUv.y * 10.0 - uTime * 2.2);

                float w1 = sin(flowUV1.x * 6.28 + sin(flowUV1.y * 3.14)) * 0.5 + 0.5;
                float w2 = cos(flowUV2.x * 6.28 + cos(flowUV2.y * 3.14)) * 0.5 + 0.5;
                float waveNoise = smoothstep(0.32, 0.82, (w1 + w2) * 0.5);

                // Anillos de dispersión y burbujas del estuario
                float ring = sin(vUv.y * 12.0 - uTime * 2.8 + (vUv.x - 0.5) * (vUv.x - 0.5) * 10.0) * 0.5 + 0.5;
                float deltaRipples = smoothstep(0.38, 0.88, ring * (1.0 - vUv.y * 0.4));

                float totalFoam = clamp(waveNoise * 0.75 + deltaRipples * 0.65, 0.0, 1.0);
                vec3 col = mix(uCyanColor, uFoamColor, totalFoam);

                float alpha = borderMask * (totalFoam * 0.80 + 0.10);
                gl_FragColor = vec4(col, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(foamMat);
    estuaryFoamMesh = new THREE.Mesh(geo, foamMat);
    estuaryFoamMesh.renderOrder = 10;
    estuaryFoamMesh.frustumCulled = false;
    scene.add(estuaryFoamMesh);
}

export function createRiver() {
    const lengthSegments = 160;
    const widthSegments = 12;
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const normals = [];
    const indices = [];

    // Tramos a lo largo del spline (desde t=0.0 dentro de las montañas hasta t=0.865 sumergiéndose limpiamente bajo el lago)
    const tStart = 0.0;
    const tEnd = 0.865;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFraction = i / lengthSegments;
        const t = tStart + uFraction * (tEnd - tStart);

        const centerPt = riverSpline.getPoint(t);
        const tangent = riverSpline.getTangent(t).normalize();

        // Vector normal perpendicular a la dirección del flujo en el plano XZ
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Ancho del agua con ensanchamiento suave en la llegada al lago
        const deltaSpread = t > 0.75 ? 1.0 + (t - 0.75) * 1.5 : 1.0;
        const halfWidth = (RIVER_HALF_WIDTH + 0.4 + Math.sin(t * 18.0) * 0.25) * deltaSpread;

        for (let j = 0; j <= widthSegments; j++) {
            const vFraction = j / widthSegments; // 0 (orilla izquierda) a 1 (orilla derecha)
            const across = (vFraction - 0.5) * 2.0; // -1 a +1

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            // La lámina de agua se mantiene a la altura de cota del spline
            const vy = centerPt.y;

            positions.push(vx, vy, vz);
            uvs.push(vFraction, uFraction); // UV normalizadas (0.0 en origen, 1.0 en desembocadura)
            normals.push(0, 1, 0);
        }
    }

    // Caras triangulares de la malla en cinta
    const vertsPerRow = widthSegments + 1;
    for (let i = 0; i < lengthSegments; i++) {
        for (let j = 0; j < widthSegments; j++) {
            const a = i * vertsPerRow + j;
            const b = (i + 1) * vertsPerRow + j;
            const c = (i + 1) * vertsPerRow + (j + 1);
            const d = i * vertsPerRow + (j + 1);

            indices.push(a, b, d);
            indices.push(b, c, d);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    riverMaterial = createWaterMaterial({
        isRiver: true,
        shallowColor: 0x38bdf8, // Turquesa cristalino luminoso
        deepColor: 0x0284c7,    // Azul fresco y fluido
        foamColor: 0xffffff,
        flowSpeed: 1.45,        // Corriente más rápida en el río
        waveHeight: 0.035,
        waveFrequency: 0.22,
        opacity: 0.88,
        foamIntensity: 0.70     // Espuma en los rápidos del afluente
    });
    registerWaterMaterial(riverMaterial);

    riverMesh = new THREE.Mesh(geometry, riverMaterial);
    riverMesh.receiveShadow = true;
    riverMesh.renderOrder = 2;
    riverMesh.frustumCulled = false;
    scene.add(riverMesh);

    // Nacimiento visible del afluente en la base de las montañas perimetrales (t ≈ 0.16 -> X ≈ 246, Z ≈ 246)
    const tSpring = 0.16;
    const p0 = riverSpline.getPoint(tSpring);
    springPosition.copy(p0);

    const tangent0 = riverSpline.getTangent(tSpring).normalize();
    const normal0 = new THREE.Vector3(-tangent0.z, 0, tangent0.x).normalize();

    createSpringSurge(p0, tangent0, normal0);
    createSpringSpray(p0, tangent0, normal0);
    createLandingSplash(p0, tangent0, normal0);

    // Desembocadura del afluente en el lago: Manto de partículas y decal de espuma que abarca desde la unión (t=0.76) hasta el interior del lago (t=0.88)
    const tEstuaryStart = 0.76;
    const tEstuaryEnd = 0.88;
    const pStartEstuary = riverSpline.getPoint(tEstuaryStart);
    const pEndEstuary = riverSpline.getPoint(tEstuaryEnd);
    pStartEstuary.y = -4.5;
    pEndEstuary.y = -4.5;

    // Posición central de referencia para el LOD
    estuaryPosition.set(
        (pStartEstuary.x + pEndEstuary.x) * 0.5,
        -4.5,
        (pStartEstuary.z + pEndEstuary.z) * 0.5
    );

    const tangentEstuary = new THREE.Vector3(
        pEndEstuary.x - pStartEstuary.x,
        0,
        pEndEstuary.z - pStartEstuary.z
    ).normalize();
    const normalEstuary = new THREE.Vector3(-tangentEstuary.z, 0, tangentEstuary.x).normalize();

    createEstuaryFoamDecal(tEstuaryStart, tEstuaryEnd);
    createEstuarySplash(pStartEstuary, pEndEstuary, tangentEstuary, normalEstuary);
}

/**
 * LOD Inteligente Dual (Nacimiento + Desembocadura):
 * Cada extremo evalúa la distancia a la cámara activa.
 * Umbral generoso de 300 metros (300^2 = 90000) para garantizar que los efectos nunca se apaguen
 * inesperadamente durante giros o rotaciones de cámara.
 */
export function updateRiver(delta) {
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const maxDistSq = 90000; // 300m

    // 1. LOD del Nacimiento (Montaña)
    if (springMesh && sprayPoints) {
        const dxSpring = camX - springPosition.x;
        const dzSpring = camZ - springPosition.z;
        const distSqSpring = dxSpring * dxSpring + dzSpring * dzSpring;
        const springVisible = distSqSpring < maxDistSq;

        if (springMesh.visible !== springVisible) springMesh.visible = springVisible;
        if (sprayPoints.visible !== springVisible) sprayPoints.visible = springVisible;
        if (landingSplashPoints && landingSplashPoints.visible !== springVisible) {
            landingSplashPoints.visible = springVisible;
        }
    }

    // 2. LOD de la Desembocadura (Estuario en el Lago)
    if (estuarySplashPoints) {
        const dxEstuary = camX - estuaryPosition.x;
        const dzEstuary = camZ - estuaryPosition.z;
        const distSqEstuary = dxEstuary * dxEstuary + dzEstuary * dzEstuary;
        const estuaryVisible = distSqEstuary < maxDistSq;

        if (estuarySplashPoints.visible !== estuaryVisible) {
            estuarySplashPoints.visible = estuaryVisible;
        }
        if (estuaryFoamMesh && estuaryFoamMesh.visible !== estuaryVisible) {
            estuaryFoamMesh.visible = estuaryVisible;
        }
    }
}
