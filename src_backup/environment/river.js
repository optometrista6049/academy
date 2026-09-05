import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { camera } from '../core/camera.js';
import { runtimeState } from '../state/runtimeState.js';
import {
    riverSpline,
    riverOutflowSpline,
    river3Spline,
    RIVER_HALF_WIDTH
} from '../terrain/riverPath.js';
import { createWaterMaterial, registerWaterMaterial } from './waterSystem.js';
import { addCollidable, cameraObstacles } from '../entities/collisions.js';

let riverMesh = null;
let riverMaterial = null;
let springSplashPoints = null;
let springFoamMesh = null;
let estuarySplashPoints = null;
let estuaryFoamMesh = null;
let springPosition = new THREE.Vector3();
let estuaryPosition = new THREE.Vector3();

// Río 2: Emisario Sur & Ensenada con Niebla de Montaña
let river2Mesh = null;
let river2Material = null;
let river2OutflowFoamMesh = null;
let river2OutflowRocksGroup = null;
let river2OutflowSplashPoints = null;
let river2OutflowPosition = new THREE.Vector3(112, -4.5, 77);
let ensenadaFoamMesh = null;
let ensenadaMistPoints = null;
let ensenadaMistSheet = null;
let ensenadaPosition = new THREE.Vector3(50, -6.3, -250);

// Río 3: Emisario Oeste hacia la Cueva Suroeste (-214, -233)
let river3Mesh = null;
let river3Material = null;
let river3OutflowFoamMesh = null;
let river3OutflowRocksGroup = null;
let river3OutflowSplashPoints = null;
let river3OutflowPosition = new THREE.Vector3(42, -4.5, 103.5);
let river3MeanderGroup = null;
let river3MeanderPosition = new THREE.Vector3(-96.0, -5.1, -34.5);
let caveStructureGroup = null;
let caveMistPoints = null;
let cavePosition = new THREE.Vector3(-214, -5.84, -233);

/**
 * Sistema de partículas GPU volumétrico multi-bloque en el nacimiento (Montaña):
 * Idéntico a la desembocadura con 3 capas de partículas:
 * 1. Chorro longitudinal a lo largo del flujo del río montaña abajo.
 * 2. Abanico transversal en expansión lateral entre las rocas del cauce.
 * 3. Micro-bruma ascendente y vapor flotante.
 */
function createSpringSplash(tStart, tEnd, tangentDir, normalDir) {
    const count = 280;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aSpringParams = new Float32Array(count * 4); // x: phase, y: speed, z: size, w: type (0: flow, 1: fan, 2: mist)
    const aDirections = new Float32Array(count * 3);

    const lateralExtent = RIVER_HALF_WIDTH * 2.0;

    for (let i = 0; i < count; i++) {
        const tSpan = Math.random();
        const t = tStart + tSpan * (tEnd - tStart);
        const basePt = riverSpline.getPoint(t);

        const spreadMultiplier = 1.0 + tSpan * 0.35;
        const lateralOffset = (Math.random() - 0.5) * lateralExtent * spreadMultiplier;
        const forwardOffset = (Math.random() - 0.5) * 2.0;

        positions[i * 3 + 0] = basePt.x + normalDir.x * lateralOffset + tangentDir.x * forwardOffset;
        positions[i * 3 + 1] = basePt.y + 0.05;
        positions[i * 3 + 2] = basePt.z + normalDir.z * lateralOffset + tangentDir.z * forwardOffset;

        if (i < 120) {
            // Capa 1: Corriente longitudinal turbulenta siguiendo el cauce montaña abajo
            const dirSpread = (Math.random() - 0.5) * 0.6;
            const dirX = tangentDir.x + normalDir.x * dirSpread;
            const dirY = tangentDir.y;
            const dirZ = tangentDir.z + normalDir.z * dirSpread;
            const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1.0;

            aDirections[i * 3 + 0] = dirX / len;
            aDirections[i * 3 + 1] = dirY / len;
            aDirections[i * 3 + 2] = dirZ / len;

            aSpringParams[i * 4 + 0] = Math.random() * 8.0;
            aSpringParams[i * 4 + 1] = 1.3 + Math.random() * 1.5;
            aSpringParams[i * 4 + 2] = 3.2 + Math.random() * 3.4;
            aSpringParams[i * 4 + 3] = 0.0;
        } else if (i < 210) {
            // Capa 2: Abanico transversal en expansión lateral entre las rocas
            const fanAngle = (Math.random() - 0.5) * Math.PI * 0.85;
            const dirX = Math.cos(fanAngle) * tangentDir.x - Math.sin(fanAngle) * tangentDir.z;
            const dirY = tangentDir.y * 0.5;
            const dirZ = Math.sin(fanAngle) * tangentDir.x + Math.cos(fanAngle) * tangentDir.z;
            const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1.0;

            aDirections[i * 3 + 0] = dirX / len;
            aDirections[i * 3 + 1] = dirY / len;
            aDirections[i * 3 + 2] = dirZ / len;

            aSpringParams[i * 4 + 0] = Math.random() * 8.0;
            aSpringParams[i * 4 + 1] = 1.0 + Math.random() * 1.3;
            aSpringParams[i * 4 + 2] = 3.6 + Math.random() * 3.8;
            aSpringParams[i * 4 + 3] = 1.0;
        } else {
            // Capa 3: Micro-bruma ascendente y vapor flotante
            aDirections[i * 3 + 0] = 0;
            aDirections[i * 3 + 1] = 1.0;
            aDirections[i * 3 + 2] = 0;

            aSpringParams[i * 4 + 0] = Math.random() * 8.0;
            aSpringParams[i * 4 + 1] = 0.45 + Math.random() * 0.45;
            aSpringParams[i * 4 + 2] = 9.0 + Math.random() * 7.5;
            aSpringParams[i * 4 + 3] = 2.0;
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSpringParams', new THREE.BufferAttribute(aSpringParams, 4));
    geo.setAttribute('aDirection', new THREE.BufferAttribute(aDirections, 3));

    const springMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uDeepColor: { value: new THREE.Color(0x0369a1) },
            uCyanColor: { value: new THREE.Color(0x38d2d8) },
            uFoamColor: { value: new THREE.Color(0xf8fafc) }
        },
        vertexShader: `
            attribute vec4 aSpringParams;
            attribute vec3 aDirection;
            uniform float uTime;
            varying float vAlpha;
            varying float vProgress;
            varying float vType;

            void main() {
                float phase = aSpringParams.x;
                float speed = aSpringParams.y;
                float pSize = aSpringParams.z;
                float pType = aSpringParams.w;
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

    registerWaterMaterial(springMat);
    springSplashPoints = new THREE.Points(geo, springMat);
    springSplashPoints.renderOrder = 25;
    springSplashPoints.frustumCulled = false;
    scene.add(springSplashPoints);
}

/**
 * Malla Decal de espuma procedural en el nacimiento (Montaña):
 * Se adapta a la cota del lecho del afluente (siguiendo el spline),
 * recreando la efervescencia y ondas animadas idénticas a la desembocadura.
 */
function createSpringFoamDecal(tStart, tEnd) {
    const lengthSegments = 32;
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

        // En el cañón de la montaña el ancho se mantiene ajustado al cauce rocoso
        const spreadFactor = 1.0 + uFrac * 0.35;
        const halfWidth = (RIVER_HALF_WIDTH + 0.35) * spreadFactor;

        for (let j = 0; j <= widthSegments; j++) {
            const vFrac = j / widthSegments;
            const across = (vFrac - 0.5) * 2.0;

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            const vy = centerPt.y + 0.02; // Apenas 2cm por encima de la lámina de agua del río

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
                float flowFade = smoothstep(0.0, 0.20, vUv.y) * (1.0 - smoothstep(0.80, 1.0, vUv.y));
                float borderMask = bankFade * flowFade;

                // Ondas turbulentas de corriente rápida
                vec2 flowUV1 = vec2(vUv.x * 4.0, vUv.y * 7.0 - uTime * 1.6);
                vec2 flowUV2 = vec2(vUv.x * 6.0 + 0.4, vUv.y * 10.0 - uTime * 2.2);

                float w1 = sin(flowUV1.x * 6.28 + sin(flowUV1.y * 3.14)) * 0.5 + 0.5;
                float w2 = cos(flowUV2.x * 6.28 + cos(flowUV2.y * 3.14)) * 0.5 + 0.5;
                float waveNoise = smoothstep(0.32, 0.82, (w1 + w2) * 0.5);

                // Anillos de dispersión y burbujas
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
    springFoamMesh = new THREE.Mesh(geo, foamMat);
    springFoamMesh.renderOrder = 10;
    springFoamMesh.frustumCulled = false;
    scene.add(springFoamMesh);
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
            uDeepColor: { value: new THREE.Color(0x0369a1) },
            uCyanColor: { value: new THREE.Color(0x38d2d8) },
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
            uDeepColor: { value: new THREE.Color(0x0369a1) },
            uCyanColor: { value: new THREE.Color(0x38d2d8) },
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
        riverFadeStart: true,
        riverFadeEnd: true,
        shallowColor: 0x38d2d8, // Aguamarina cristalina pura y luminosa
        deepColor: 0x0369a1,    // Azul zafiro puro y limpio
        flowSpeed: 1.35,        // Corriente fluida y natural
        waveHeight: 0.038,
        waveFrequency: 0.16,
        opacity: 0.80
    });
    registerWaterMaterial(riverMaterial);

    riverMesh = new THREE.Mesh(geometry, riverMaterial);
    riverMesh.receiveShadow = true;
    riverMesh.renderOrder = 2;
    riverMesh.frustumCulled = false;
    scene.add(riverMesh);

    // Nacimiento del afluente en la montaña: Manto de partículas y decal de espuma con el efecto de desembocadura (t=0.16 a t=0.26)
    const tSpringStart = 0.16;
    const tSpringEnd = 0.26;
    const pStartSpring = riverSpline.getPoint(tSpringStart);
    const pEndSpring = riverSpline.getPoint(tSpringEnd);

    springPosition.set(
        (pStartSpring.x + pEndSpring.x) * 0.5,
        (pStartSpring.y + pEndSpring.y) * 0.5,
        (pStartSpring.z + pEndSpring.z) * 0.5
    );

    const tangentSpring = riverSpline.getTangent(tSpringStart).normalize();
    const normalSpring = new THREE.Vector3(-tangentSpring.z, 0, tangentSpring.x).normalize();

    createSpringFoamDecal(tSpringStart, tSpringEnd);
    createSpringSplash(tSpringStart, tSpringEnd, tangentSpring, normalSpring);

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

    // ======================================================
    // RÍO 2: EMISARIO SUR (Nace en lago 112,77 -> Ensenada 69.59,-233)
    // ======================================================
    createRiver2Mesh();
    createRiver2OutflowRocks();
    createRiver2OutflowDecal();
    createRiver2OutflowSplash();
    createEnsenadaFoamDecal();
    createEnsenadaMistAndFog();
    createEnsenadaMistSheet();

    // ======================================================
    // RÍO 3: AFLUENTE/EMISARIO OESTE (Nace en lago 42, 103.5 -> Cueva -214, -233)
    // ======================================================
    createRiver3Mesh();
    createRiver3OutflowRocks();
    createRiver3OutflowDecal();
    createRiver3OutflowSplash();
    createRiver3MeanderRocks();
    createRiver3CaveMouth();
}

/**
 * Malla de agua del Río 2 (Emisario Sur):
 * Fluye desde el borde del lago en (112, 77) con cota -4.5m, serpenteando por
 * (182, 10), (159, -80), (151, -156) hasta desembocar en la ensenada montañosa en (69.59, -233).
 * A partir de t=0.72 el cauce se ensancha naturalmente en una ensenada abierta entre los farallones.
 */
function createRiver2Mesh() {
    const lengthSegments = 240;
    const widthSegments = 14;
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const normals = [];
    const indices = [];

    // tStart=0.040 (nace exactamente en el umbral de las piedras deflectoras, sin invadir el lago) a tEnd=0.98
    const tStart = 0.040;
    const tEnd = 0.98;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFraction = i / lengthSegments;
        const t = tStart + uFraction * (tEnd - tStart);

        const centerPt = riverOutflowSpline.getPoint(t);
        const tangent = riverOutflowSpline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Ensanchamiento natural en la ensenada montañosa
        let deltaSpread = 1.0;
        if (t > 0.70) {
            deltaSpread = 1.0 + Math.pow((t - 0.70) / 0.30, 1.2) * 1.5;
        }
        // Ancho base del agua aumentado a 5.5m (11m de cauce total)
        const halfWidth = (5.5 + Math.sin(t * 14.0) * 0.35) * deltaSpread;

        for (let j = 0; j <= widthSegments; j++) {
            const vFraction = j / widthSegments;
            const across = (vFraction - 0.5) * 2.0;

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            const vy = centerPt.y;

            positions.push(vx, vy, vz);
            uvs.push(vFraction, uFraction); // UVs normalizadas sin sobrepasar 1.0
            normals.push(0, 1, 0);
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

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    river2Material = createWaterMaterial({
        isRiver: true,
        riverFadeStart: false, // El emisario no se desvanece a transparente: fluye continuo desde la lámina del lago
        riverFadeEnd: false, // El emisario fluye continuo por todo el cauce sin desvanecerse
        riverLakeStart: true, // Fundido cromático continuo con la masa del lago en el nacimiento
        shallowColor: 0x38d2d8, // Aguamarina cristalina pura y luminosa
        deepColor: 0x0369a1,    // Azul zafiro puro y limpio
        flowSpeed: 1.35,
        waveHeight: 0.038,
        waveFrequency: 0.16,
        opacity: 0.80
    });
    registerWaterMaterial(river2Material);

    river2Mesh = new THREE.Mesh(geometry, river2Material);
    river2Mesh.receiveShadow = true;
    river2Mesh.renderOrder = 2;
    river2Mesh.frustumCulled = false;
    scene.add(river2Mesh);
}

/**
 * Rocas naturales deflectoras y escolleras en la salida del lago hacia el Río 2:
 * Conjunto de peñascos y cantos rodados orgánicos colocados a los flancos y en el umbral
 * de la desembocadura para crear un estrechamiento natural, con colisión física.
 */
function createRiver2OutflowRocks() {
    river2OutflowRocksGroup = new THREE.Group();

    // Material de roca idéntico al del resto del mundo (MeshStandardMaterial rugoso y natural)
    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.08
    });

    const rockShades = [0x545454, 0x606060, 0x6c6c6c, 0x787878, 0x5e5a56];
    const dodecGeo = new THREE.DodecahedronGeometry(1, 0);
    const icosaGeo = new THREE.IcosahedronGeometry(1, 0);

    // Definición de rocas estratégicas en las márgenes y centro-lateral del umbral (110.5, 78.5)
    // Coordenadas locales adaptadas al relieve de la orilla (-4.5m lámina de agua)
    const rockDefinitions = [
        // Flanco izquierdo (orilla este/norte del estrechamiento)
        { x: 107.8, y: -4.3, z: 82.2, scaleX: 2.3, scaleY: 1.6, scaleZ: 2.1, rotY: 0.4, geo: 0 },
        { x: 109.2, y: -4.2, z: 84.5, scaleX: 1.7, scaleY: 1.3, scaleZ: 1.9, rotY: 1.2, geo: 1 },
        { x: 105.4, y: -4.0, z: 81.0, scaleX: 2.8, scaleY: 2.1, scaleZ: 2.4, rotY: 2.1, geo: 0 },
        { x: 112.5, y: -4.35, z: 85.0, scaleX: 1.4, scaleY: 1.0, scaleZ: 1.3, rotY: 0.8, geo: 1 },

        // Flanco derecho (orilla oeste/sur del estrechamiento)
        { x: 108.2, y: -4.3, z: 74.5, scaleX: 2.4, scaleY: 1.7, scaleZ: 2.2, rotY: 1.8, geo: 0 },
        { x: 106.0, y: -4.0, z: 73.0, scaleX: 3.0, scaleY: 2.2, scaleZ: 2.6, rotY: 0.5, geo: 1 },
        { x: 110.8, y: -4.35, z: 72.8, scaleX: 1.6, scaleY: 1.1, scaleZ: 1.5, rotY: 2.5, geo: 0 },
        { x: 113.8, y: -4.4, z: 71.5, scaleX: 1.3, scaleY: 0.9, scaleZ: 1.2, rotY: 1.1, geo: 1 },

        // Rocas sumergidas / deflectores de umbral (rompen la corriente en el centro sin taponar)
        { x: 111.8, y: -4.62, z: 79.2, scaleX: 1.8, scaleY: 0.8, scaleZ: 1.6, rotY: 0.9, geo: 1 },
        { x: 114.2, y: -4.68, z: 77.0, scaleX: 1.5, scaleY: 0.75, scaleZ: 1.4, rotY: 2.3, geo: 0 },
        { x: 116.5, y: -4.72, z: 75.8, scaleX: 1.3, scaleY: 0.65, scaleZ: 1.2, rotY: 1.5, geo: 1 }
    ];

    rockDefinitions.forEach((def, index) => {
        const mat = rockMaterial.clone();
        mat.color.setHex(rockShades[index % rockShades.length]);

        const mesh = new THREE.Mesh(def.geo === 0 ? dodecGeo : icosaGeo, mat);
        mesh.position.set(def.x, def.y, def.z);
        mesh.scale.set(def.scaleX, def.scaleY, def.scaleZ);
        mesh.rotation.set(0.15, def.rotY, 0.1);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.renderOrder = 3;

        river2OutflowRocksGroup.add(mesh);
        cameraObstacles.push(mesh);

        // Si la roca sobresale del agua, registrar colisión para el jugador
        if (def.y > -4.5) {
            addCollidable({
                position: new THREE.Vector3(def.x, def.y, def.z),
                userData: { radius: Math.max(def.scaleX, def.scaleZ) * 0.8 }
            });
        }
    });

    scene.add(river2OutflowRocksGroup);
}

/**
 * Decal de estuario orgánico y corriente natural para la salida del Lago hacia el Río 2:
 * Sustituye el remolino artificial por un sistema asimétrico de corrientes, vetas de agua
 * acelerada y olas de transición que funden imperceptiblemente el lago con el río.
 */
function createRiver2OutflowDecal() {
    const lengthSegments = 40;
    const widthSegments = 20;
    const geo = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const indices = [];

    // tStart=0.026 (umbral de aproximación en las rocas) a tEnd=0.105 (primeros rápidos del canal)
    const tStart = 0.026;
    const tEnd = 0.105;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFrac = i / lengthSegments;
        const t = tStart + uFrac * (tEnd - tStart);

        const centerPt = riverOutflowSpline.getPoint(t);
        const tangent = riverOutflowSpline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Expansión suave hacia el umbral de las rocas cubriendo la totalidad del ancho del río y orillas
        const intakeSpread = 1.05 + Math.pow(1.0 - uFrac, 1.2) * 0.45;
        const halfWidth = 6.4 * intakeSpread;

        for (let j = 0; j <= widthSegments; j++) {
            const vFrac = j / widthSegments;
            const across = (vFrac - 0.5) * 2.0;

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            // Altura sutilmente por encima de la lámina (-4.5m) para evitar z-fighting
            const vy = centerPt.y + 0.022;

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
            uDeepColor: { value: new THREE.Color(0x0369a1) },
            uCyanColor: { value: new THREE.Color(0x38d2d8) },
            uFoamColor: { value: new THREE.Color(0xffffff) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            void main() {
                vUv = uv;
                vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
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
            varying vec3 vWorldPos;

            void main() {
                // Desvanecimiento orgánico amplio en las riberas para cubrir los márgenes completos hasta la orilla
                float bankFade = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
                float flowFade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
                float borderMask = bankFade * flowFade;

                // Ondas longitudinales orgánicas de corriente convergente
                float timeFlow = uTime * 1.6;
                vec2 flowUV1 = vec2(vUv.x * 4.2 + sin(vUv.y * 3.14) * 0.3, vUv.y * 7.0 - timeFlow);
                vec2 flowUV2 = vec2(vUv.x * 6.5 - sin(vUv.y * 4.2) * 0.25, vUv.y * 11.5 - timeFlow * 1.45);

                float w1 = sin(flowUV1.x * 6.28 + sin(flowUV1.y * 3.14)) * 0.5 + 0.5;
                float w2 = cos(flowUV2.x * 6.28 + cos(flowUV2.y * 3.14)) * 0.5 + 0.5;
                float waveCurrent = smoothstep(0.35, 0.85, (w1 + w2) * 0.5);

                // Estelas orgánicas en V provocadas por la atracción hacia el canal
                float vPattern = abs(vUv.x - 0.5) * 2.0;
                float suctionStreaks = sin(vPattern * 14.0 - vUv.y * 16.0 + uTime * 2.2) * 0.5 + 0.5;
                suctionStreaks = smoothstep(0.38, 0.88, suctionStreaks * (0.35 + vUv.y * 0.65));

                // Remolinos y corrientes curvadas asimétricas en la captación
                vec2 centerDiff = vec2(vUv.x - 0.5, vUv.y - 0.20);
                float rDist = length(centerDiff);
                float swirlAngle = atan(centerDiff.y, centerDiff.x) + rDist * 5.0 - uTime * 1.8;
                float swirlLines = sin(swirlAngle * 3.0) * 0.5 + 0.5;
                float swirlFoam = smoothstep(0.42, 0.85, swirlLines * smoothstep(0.55, 0.05, rDist));

                // Perturbación asimétrica en el paso del umbral
                float entryRipple = sin(length(vec2(vUv.x - 0.5, vUv.y * 0.5)) * 20.0 - uTime * 2.8) * 0.5 + 0.5;
                float rippleMask = smoothstep(0.40, 0.86, entryRipple * (1.0 - vUv.y * 0.55));

                float totalFoam = clamp(waveCurrent * 0.52 + suctionStreaks * 0.44 + swirlFoam * 0.38 + rippleMask * 0.28, 0.0, 1.0);
                float foamFactor = smoothstep(0.16, 0.78, totalFoam);

                // Decal 100% de espuma pura y efervescente (sin fondo oscuro que manche el lago)
                vec3 col = mix(vec3(0.72, 0.94, 1.0), uFoamColor, foamFactor);

                // La transparencia es nula donde no hay espuma, evitando cualquier mancha o lengua sobre el agua
                float alpha = borderMask * foamFactor * 0.84;
                gl_FragColor = vec4(col, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(foamMat);
    river2OutflowFoamMesh = new THREE.Mesh(geo, foamMat);
    river2OutflowFoamMesh.renderOrder = 10;
    river2OutflowFoamMesh.frustumCulled = false;
    scene.add(river2OutflowFoamMesh);
}

/**
 * Sistema de partículas GPU volumétrico multi-capa en el nacimiento del Río 2 (Salida del Lago):
 * Resuelve la delimitación artificial y cubre la transición cromática con 4 capas orientadas:
 * 1. Chorro longitudinal acelerado que sigue la corriente hacia el cauce del río (Capa 0).
 * 2. Abanico transversal convergente en forma de embudo natural que capta el agua del lago (Capa 1).
 * 3. Salpicaduras dinámicas y crestas de espuma blanca en los peñascos y deflectores rocosos (Capa 2).
 * 4. Micro-bruma ascendente y vaho suspendido sobre la superficie para coherencia en todo ángulo cenital y rasante (Capa 3).
 * Distribución orgánica continua a lo largo del spline con caída suave (sin bordes delimitados) e invarianza de cámara 3D.
 */
function createRiver2OutflowSplash() {
    const count = 1180;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aParams = new Float32Array(count * 4); // x: phase, y: speed, z: size, w: type (0: flow, 1: fan, 2: rock splash, 3: mist)
    const aDirections = new Float32Array(count * 3);
    const aFalloff = new Float32Array(count); // Suavizado orgánico perimetral (elimina bordes delimitados)

    // Coordenadas de las rocas en el umbral y orillas por donde pasa el agua y salpica
    const rockPositions = [
        new THREE.Vector3(111.8, -4.5, 79.2),
        new THREE.Vector3(114.2, -4.5, 77.0),
        new THREE.Vector3(116.5, -4.5, 75.8),
        new THREE.Vector3(108.2, -4.4, 74.5),
        new THREE.Vector3(107.8, -4.4, 82.2),
        new THREE.Vector3(110.8, -4.45, 72.8),
        new THREE.Vector3(109.2, -4.35, 84.5),
        new THREE.Vector3(112.5, -4.4, 85.0),
        new THREE.Vector3(105.4, -4.2, 81.0),
        new THREE.Vector3(106.0, -4.2, 73.0),
        new THREE.Vector3(104.2, -4.3, 76.5),
        new THREE.Vector3(115.2, -4.35, 87.5),
        new THREE.Vector3(118.5, -4.4, 73.2),
        new THREE.Vector3(109.8, -4.3, 87.0)
    ];

    // Rango concentrado en el umbral rocoso y boca de aceleración del cauce
    const tStartSpline = 0.026;
    const tEndSpline = 0.088;

    for (let i = 0; i < count; i++) {
        if (i < 420) {
            // ============================================================
            // CAPA 0: Corriente longitudinal turbulenta (Chorros hacia el río)
            // ============================================================
            const tSpan = Math.random();
            const t = tStartSpline + tSpan * (tEndSpline - tStartSpline);
            const centerPt = riverOutflowSpline.getPoint(t);
            const tangent = riverOutflowSpline.getTangent(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            // Embudo orgánico ensanchado para cubrir toda la lámina de agua hasta las orillas
            const funnelSpread = 1.10 + Math.pow(1.0 - tSpan, 1.2) * 0.85;
            const halfW = 6.4 * funnelSpread;

            // Muestreo triangular centrado en el lecho con extensión completa a riberas
            const u = Math.random() + Math.random() - 1.0;
            const lateralOffset = u * halfW;
            const forwardOffset = (Math.random() - 0.5) * 1.8;

            positions[i * 3 + 0] = centerPt.x + normal.x * lateralOffset + tangent.x * forwardOffset;
            positions[i * 3 + 1] = centerPt.y + 0.035;
            positions[i * 3 + 2] = centerPt.z + normal.z * lateralOffset + tangent.z * forwardOffset;

            const dirSpread = (Math.random() - 0.5) * 0.38;
            const dirX = tangent.x + normal.x * dirSpread;
            const dirZ = tangent.z + normal.z * dirSpread;
            const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1.0;

            aDirections[i * 3 + 0] = dirX / len;
            aDirections[i * 3 + 1] = 0.0;
            aDirections[i * 3 + 2] = dirZ / len;

            aParams[i * 4 + 0] = Math.random() * 8.0;
            aParams[i * 4 + 1] = 1.3 + Math.random() * 1.5;
            aParams[i * 4 + 2] = 3.6 + Math.random() * 3.4;
            aParams[i * 4 + 3] = 0.0; // Tipo 0: Flujo longitudinal

            const edgeFade = 1.0 - Math.min(Math.max((Math.abs(u) - 0.78) / 0.22, 0.0), 1.0);
            const endFade = Math.min(Math.max(tSpan / 0.10, 0.0), 1.0) * (1.0 - Math.min(Math.max((tSpan - 0.82) / 0.18, 0.0), 1.0));
            aFalloff[i] = edgeFade * endFade;

        } else if (i < 760) {
            // ============================================================
            // CAPA 1: Abanico transversal convergente desde el umbral
            // ============================================================
            const tSpan = Math.random() * 0.75;
            const t = tStartSpline + tSpan * (tEndSpline - tStartSpline);
            const centerPt = riverOutflowSpline.getPoint(t);
            const tangent = riverOutflowSpline.getTangent(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            const funnelSpread = 1.15 + Math.pow(1.0 - tSpan, 1.2) * 0.95;
            const halfW = 6.8 * funnelSpread;

            const u = Math.random() + Math.random() - 1.0;
            const lateralOffset = u * halfW;
            const forwardOffset = (Math.random() - 0.5) * 2.0;

            positions[i * 3 + 0] = centerPt.x + normal.x * lateralOffset + tangent.x * forwardOffset;
            positions[i * 3 + 1] = centerPt.y + 0.040;
            positions[i * 3 + 2] = centerPt.z + normal.z * lateralOffset + tangent.z * forwardOffset;

            // Ángulos convergentes orientados hacia el centro del cauce
            const fanAngle = -u * Math.PI * 0.35 + (Math.random() - 0.5) * 0.30;
            const cosA = Math.cos(fanAngle);
            const sinA = Math.sin(fanAngle);
            const dirX = cosA * tangent.x - sinA * tangent.z;
            const dirZ = sinA * tangent.x + cosA * tangent.z;

            aDirections[i * 3 + 0] = dirX;
            aDirections[i * 3 + 1] = 0.0;
            aDirections[i * 3 + 2] = dirZ;

            aParams[i * 4 + 0] = Math.random() * 8.0;
            aParams[i * 4 + 1] = 1.1 + Math.random() * 1.3;
            aParams[i * 4 + 2] = 3.8 + Math.random() * 3.8;
            aParams[i * 4 + 3] = 1.0; // Tipo 1: Abanico convergente

            const edgeFade = 1.0 - Math.min(Math.max((Math.abs(u) - 0.80) / 0.20, 0.0), 1.0);
            const endFade = 1.0 - Math.min(Math.max((tSpan / 0.75 - 0.75) / 0.25, 0.0), 1.0);
            aFalloff[i] = edgeFade * endFade;

        } else if (i < 1040) {
            // ============================================================
            // CAPA 2: Salpicaduras dinámicas y crestas blancas vivas en ROCAS Y ORILLAS
            // ============================================================
            const rock = rockPositions[(i - 760) % rockPositions.length];
            const angleAroundRock = Math.random() * Math.PI * 2.0;
            const distFromRock = 0.20 + Math.random() * 1.55;

            positions[i * 3 + 0] = rock.x + Math.cos(angleAroundRock) * distFromRock;
            positions[i * 3 + 1] = -4.5 + 0.040;
            positions[i * 3 + 2] = rock.z + Math.sin(angleAroundRock) * distFromRock;

            const flowDir = new THREE.Vector3(0.85, 0, -0.52).normalize();
            const sprayAngle = (Math.random() - 0.5) * Math.PI * 0.90;
            const cosS = Math.cos(sprayAngle);
            const sinS = Math.sin(sprayAngle);
            const spX = cosS * flowDir.x - sinS * flowDir.z + (Math.random() - 0.5) * 0.35;
            const spZ = sinS * flowDir.x + cosS * flowDir.z + (Math.random() - 0.5) * 0.35;
            const len = Math.sqrt(spX * spX + spZ * spZ) || 1.0;

            aDirections[i * 3 + 0] = spX / len;
            aDirections[i * 3 + 1] = 1.0; // Impulso vertical para el arco de salpicadura
            aDirections[i * 3 + 2] = spZ / len;

            aParams[i * 4 + 0] = Math.random() * 8.0;
            aParams[i * 4 + 1] = 1.5 + Math.random() * 1.6; // Dinámica efervescente viva
            aParams[i * 4 + 2] = 3.2 + Math.random() * 3.4; // Gotas y crestas luminosas
            aParams[i * 4 + 3] = 2.0; // Tipo 2: Salpicadura en rocas y orillas

            aFalloff[i] = 1.0; // Plena nitidez e intensidad focal en los peñascos y orillas

        } else {
            // ============================================================
            // CAPA 3: Micro-bruma ascendente y vapor suspendido (Volumétrico)
            // ============================================================
            const tSpan = Math.random();
            const t = tStartSpline + tSpan * (tEndSpline - tStartSpline);
            const centerPt = riverOutflowSpline.getPoint(t);
            const tangent = riverOutflowSpline.getTangent(t).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            const funnelSpread = 1.15 + Math.pow(1.0 - tSpan, 1.2) * 0.85;
            const halfW = 6.5 * funnelSpread;

            const u = Math.random() + Math.random() - 1.0;
            const lateralOffset = u * halfW;
            const forwardOffset = (Math.random() - 0.5) * 2.2;

            positions[i * 3 + 0] = centerPt.x + normal.x * lateralOffset + tangent.x * forwardOffset;
            positions[i * 3 + 1] = centerPt.y + 0.045;
            positions[i * 3 + 2] = centerPt.z + normal.z * lateralOffset + tangent.z * forwardOffset;

            aDirections[i * 3 + 0] = (Math.random() - 0.5) * 0.4;
            aDirections[i * 3 + 1] = 1.0;
            aDirections[i * 3 + 2] = (Math.random() - 0.5) * 0.4;

            aParams[i * 4 + 0] = Math.random() * 8.0;
            aParams[i * 4 + 1] = 0.55 + Math.random() * 0.45; // Flotación lenta
            aParams[i * 4 + 2] = 9.5 + Math.random() * 7.0;  // Gotículas de vapor suaves
            aParams[i * 4 + 3] = 3.0; // Tipo 3: Micro-bruma volumétrica

            const edgeFade = 1.0 - Math.min(Math.max((Math.abs(u) - 0.78) / 0.22, 0.0), 1.0);
            const endFade = Math.min(Math.max(tSpan / 0.12, 0.0), 1.0) * (1.0 - Math.min(Math.max((tSpan - 0.82) / 0.18, 0.0), 1.0));
            aFalloff[i] = edgeFade * endFade;
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aParams', new THREE.BufferAttribute(aParams, 4));
    geo.setAttribute('aDirection', new THREE.BufferAttribute(aDirections, 3));
    geo.setAttribute('aFalloff', new THREE.BufferAttribute(aFalloff, 1));

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uCyanColor: { value: new THREE.Color(0x38d2d8) },
            uFoamColor: { value: new THREE.Color(0xf8fafc) }
        },
        vertexShader: `
            attribute vec4 aParams;
            attribute vec3 aDirection;
            attribute float aFalloff;
            uniform float uTime;
            varying float vAlpha;
            varying float vProgress;
            varying float vType;

            void main() {
                float phase = aParams.x;
                float speed = aParams.y;
                float pSize = aParams.z;
                float pType = aParams.w;
                vType = pType;

                float cycleDuration = (pType > 2.5) ? 2.6 : ((pType > 1.5) ? 1.15 : 1.4);
                float cycle = mod((uTime + phase) * speed, cycleDuration);
                float progress = cycle / cycleDuration;
                vProgress = progress;

                vec3 pos = position;

                if (pType > 2.5) {
                    // Capa 3: Micro-bruma ascendente que se eleva y flota suavemente
                    pos.y += progress * 1.8;
                    pos.x += sin(progress * 2.8 + phase) * 0.7;
                    pos.z += cos(progress * 2.8 + phase) * 0.7;
                } else if (pType > 1.5) {
                    // Capa 2: Salpicaduras en las rocas con arco parabólico
                    float sprayDist = progress * 1.9;
                    pos.x += aDirection.x * sprayDist;
                    pos.z += aDirection.z * sprayDist;
                    pos.y += sin(progress * 3.14159) * 0.48 - (progress * progress * 0.18);
                } else if (pType > 0.5) {
                    // Capa 1: Abanico radial convergente
                    float fanDist = progress * 2.8;
                    pos.x += aDirection.x * fanDist;
                    pos.z += aDirection.z * fanDist;
                    pos.y += sin(progress * 3.14159) * 0.12;
                } else {
                    // Capa 0: Chorro longitudinal turbulento hacia el cauce
                    float flowDist = progress * 3.6;
                    pos.x += aDirection.x * flowDist;
                    pos.z += aDirection.z * flowDist;
                    pos.y += sin(progress * 3.14159) * 0.10;
                }

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                // Distancia esférica 3D: garantiza presencia consistente en cualquier ángulo de cámara
                float dist = length(mvPosition.xyz);
                float distFade = smoothstep(280.0, 45.0, dist);

                float baseAlpha = (pType > 2.5) ? 0.58 : ((pType > 1.5) ? 0.98 : 0.88);
                vAlpha = sin(progress * 3.14159) * baseAlpha * aFalloff * distFade;

                gl_PointSize = pSize * (270.0 / max(dist, 1.0)) * distFade;
                gl_PointSize = clamp(gl_PointSize, 1.0, 175.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uCyanColor;
            uniform vec3 uFoamColor;
            varying float vAlpha;
            varying float vProgress;
            varying float vType;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                if (vType > 2.5) {
                    // Micro-bruma translúcida suave
                    float softMist = smoothstep(0.5, 0.0, dist);
                    vec3 mistCol = mix(uCyanColor, uFoamColor, 0.80);
                    gl_FragColor = vec4(mistCol, vAlpha * softMist * 0.70);
                } else if (vType > 1.5) {
                    // Salpicadura de roca: blanca brillante, viva y contrastada
                    float softSplash = smoothstep(0.5, 0.08, dist);
                    vec3 splashCol = mix(uCyanColor, uFoamColor, 0.92);
                    gl_FragColor = vec4(splashCol, vAlpha * softSplash);
                } else {
                    // Corriente / abanico: turquesa espumoso a blanco
                    float soft = smoothstep(0.5, 0.05, dist);
                    vec3 col = mix(uCyanColor, uFoamColor, smoothstep(0.08, 0.50, vProgress) * 0.85);
                    gl_FragColor = vec4(col, vAlpha * soft);
                }
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(mat);
    river2OutflowSplashPoints = new THREE.Points(geo, mat);
    river2OutflowSplashPoints.renderOrder = 25;
    river2OutflowSplashPoints.frustumCulled = false;
    scene.add(river2OutflowSplashPoints);
}

/**
 * Decal de espuma en la Ensenada del Río 2 (zona 69.59, -233 hacia las montañas):
 * Cubre la bahía ensanchada con ondas de agua y espuma efervescente.
 */
function createEnsenadaFoamDecal() {
    const lengthSegments = 38;
    const widthSegments = 16;
    const geo = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const indices = [];

    const tStart = 0.75;
    const tEnd = 0.97;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFrac = i / lengthSegments;
        const t = tStart + uFrac * (tEnd - tStart);

        const centerPt = riverOutflowSpline.getPoint(t);
        const tangent = riverOutflowSpline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const deltaSpread = 1.0 + Math.pow(uFrac, 1.2) * 1.5;
        const halfWidth = (5.5 + 0.6) * deltaSpread;

        for (let j = 0; j <= widthSegments; j++) {
            const vFrac = j / widthSegments;
            const across = (vFrac - 0.5) * 2.0;

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            const vy = centerPt.y + 0.02;

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
                float bankFade = smoothstep(0.0, 0.26, vUv.x) * (1.0 - smoothstep(0.74, 1.0, vUv.x));
                float flowFade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
                float borderMask = bankFade * flowFade;

                vec2 flowUV1 = vec2(vUv.x * 4.0, vUv.y * 7.0 - uTime * 1.5);
                vec2 flowUV2 = vec2(vUv.x * 6.0 + 0.4, vUv.y * 9.5 - uTime * 2.0);

                float w1 = sin(flowUV1.x * 6.28 + sin(flowUV1.y * 3.14)) * 0.5 + 0.5;
                float w2 = cos(flowUV2.x * 6.28 + cos(flowUV2.y * 3.14)) * 0.5 + 0.5;
                float waveNoise = smoothstep(0.35, 0.82, (w1 + w2) * 0.5);

                float ring = sin(vUv.y * 10.0 - uTime * 2.5 + (vUv.x - 0.5) * (vUv.x - 0.5) * 8.0) * 0.5 + 0.5;
                float deltaRipples = smoothstep(0.40, 0.88, ring);

                float totalFoam = clamp(waveNoise * 0.70 + deltaRipples * 0.60, 0.0, 1.0);
                vec3 col = mix(uCyanColor, uFoamColor, totalFoam);

                float alpha = borderMask * (totalFoam * 0.75 + 0.10);
                gl_FragColor = vec4(col, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(foamMat);
    ensenadaFoamMesh = new THREE.Mesh(geo, foamMat);
    ensenadaFoamMesh.renderOrder = 10;
    ensenadaFoamMesh.frustumCulled = false;
    scene.add(ensenadaFoamMesh);
}

/**
 * Sistema de Niebla Volumétrica de la Ensenada y Garganta Montañosa:
 * Genera un velo atmosférico cinematográfico reforzado con 4 capas de 760 partículas:
 * 1. Bruma densa rasante sobre la lámina de agua de la ensenada.
 * 2. Volutas de niebla rodante entre los farallones del cañón.
 * 3. Manto permanente con suelo de opacidad en la garganta profunda para que NUNCA se abra o desaparezca.
 * 4. Vaho ascendente a lo largo de los acantilados del cañón.
 */
function createEnsenadaMistAndFog() {
    const count = 760;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aFogParams = new Float32Array(count * 4); // x: phase, y: speed, z: size, w: layer
    const aDriftDir = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        if (i < 240) {
            // Capa 1: Bruma baja rasante sobre el agua de la ensenada (t=0.68 a 0.99 del río)
            const tSpan = Math.random();
            const t = 0.68 + tSpan * 0.31;
            const pt = riverOutflowSpline.getPoint(t);
            const tan = riverOutflowSpline.getTangent(t).normalize();
            const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

            const spread = (Math.random() - 0.5) * 34.0;
            positions[i * 3 + 0] = pt.x + norm.x * spread + (Math.random() - 0.5) * 6.0;
            positions[i * 3 + 1] = pt.y + 0.35 + Math.random() * 2.6;
            positions[i * 3 + 2] = pt.z + norm.z * spread + (Math.random() - 0.5) * 6.0;

            aDriftDir[i * 3 + 0] = tan.x * 0.7 + (Math.random() - 0.5) * 0.3;
            aDriftDir[i * 3 + 1] = 0.15;
            aDriftDir[i * 3 + 2] = tan.z * 0.7 + (Math.random() - 0.5) * 0.3;

            aFogParams[i * 4 + 0] = Math.random() * 12.0;
            aFogParams[i * 4 + 1] = 0.30 + Math.random() * 0.35;
            aFogParams[i * 4 + 2] = 24.0 + Math.random() * 28.0;
            aFogParams[i * 4 + 3] = 0.0;
        } else if (i < 480) {
            // Capa 2: Volutas de niebla rodante entre los farallones del cañón (x: 18..82, z: -232..-285)
            const cx = 18 + Math.random() * 64;
            const cz = -232 - Math.random() * 45;
            const cy = -5.5 + Math.random() * 9.0;

            positions[i * 3 + 0] = cx;
            positions[i * 3 + 1] = cy;
            positions[i * 3 + 2] = cz;

            aDriftDir[i * 3 + 0] = -0.35 + (Math.random() - 0.5) * 0.4;
            aDriftDir[i * 3 + 1] = 0.25;
            aDriftDir[i * 3 + 2] = -0.55 + (Math.random() - 0.5) * 0.35;

            aFogParams[i * 4 + 0] = Math.random() * 12.0;
            aFogParams[i * 4 + 1] = 0.22 + Math.random() * 0.30;
            aFogParams[i * 4 + 2] = 32.0 + Math.random() * 32.0;
            aFogParams[i * 4 + 3] = 1.0;
        } else if (i < 660) {
            // Capa 3: Manto permanente denso al fondo de la garganta montañosa (z: -255 a -310)
            const cx = 10 + Math.random() * 70;
            const cz = -255 - Math.random() * 50;
            const cy = -4.0 + Math.random() * 18.0;

            positions[i * 3 + 0] = cx;
            positions[i * 3 + 1] = cy;
            positions[i * 3 + 2] = cz;

            aDriftDir[i * 3 + 0] = (Math.random() - 0.5) * 0.3;
            aDriftDir[i * 3 + 1] = 0.12;
            aDriftDir[i * 3 + 2] = -0.35;

            aFogParams[i * 4 + 0] = Math.random() * 12.0;
            aFogParams[i * 4 + 1] = 0.16 + Math.random() * 0.22;
            aFogParams[i * 4 + 2] = 46.0 + Math.random() * 42.0;
            aFogParams[i * 4 + 3] = 2.0;
        } else {
            // Capa 4: Vaho ascendente en las paredes del cañón
            const cx = 20 + Math.random() * 60;
            const cz = -240 - Math.random() * 45;
            const cy = 2.0 + Math.random() * 20.0;

            positions[i * 3 + 0] = cx;
            positions[i * 3 + 1] = cy;
            positions[i * 3 + 2] = cz;

            aDriftDir[i * 3 + 0] = (Math.random() - 0.5) * 0.2;
            aDriftDir[i * 3 + 1] = 0.45;
            aDriftDir[i * 3 + 2] = (Math.random() - 0.5) * 0.2;

            aFogParams[i * 4 + 0] = Math.random() * 12.0;
            aFogParams[i * 4 + 1] = 0.20 + Math.random() * 0.25;
            aFogParams[i * 4 + 2] = 30.0 + Math.random() * 25.0;
            aFogParams[i * 4 + 3] = 3.0;
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aFogParams', new THREE.BufferAttribute(aFogParams, 4));
    geo.setAttribute('aDriftDir', new THREE.BufferAttribute(aDriftDir, 3));

    const mistMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uFogColor: { value: new THREE.Color(0xf0fdfa) },
            uCyanMist: { value: new THREE.Color(0xbae6fd) },
            uSkyMist: { value: new THREE.Color(0xe0f2fe) }
        },
        vertexShader: `
            attribute vec4 aFogParams;
            attribute vec3 aDriftDir;
            uniform float uTime;
            varying float vAlpha;
            varying float vLayer;

            void main() {
                float phase = aFogParams.x;
                float speed = aFogParams.y;
                float pSize = aFogParams.z;
                float layer = aFogParams.w;
                vLayer = layer;

                float cycleDuration = 7.5;
                float cycle = mod((uTime + phase) * speed, cycleDuration);
                float progress = cycle / cycleDuration;

                vec3 pos = position;

                // Deriva ondulante natural de niebla
                pos += aDriftDir * (progress * 8.5);
                pos.x += sin(uTime * 0.35 + phase) * 2.8;
                pos.y += sin(uTime * 0.25 + phase * 1.3) * 1.0;
                pos.z += cos(uTime * 0.30 + phase) * 2.2;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float dist = length(mvPosition.xyz);

                // Desvanecimiento suave en cercanía y lejanía (hasta 360m)
                float distFade = smoothstep(360.0, 70.0, dist) * smoothstep(6.0, 18.0, dist);

                // Capa profunda (layer 2) con suelo permanente de visibilidad (NUNCA se abre a 0)
                float cycleFade = (layer > 1.5 && layer < 2.5)
                    ? (0.38 + 0.62 * sin(progress * 3.14159))
                    : sin(progress * 3.14159);

                float baseAlpha = (layer > 2.5) ? 0.42 : ((layer > 1.5) ? 0.58 : ((layer > 0.5) ? 0.52 : 0.64));
                vAlpha = cycleFade * baseAlpha * distFade;

                gl_PointSize = pSize * (320.0 / max(dist, 1.0)) * distFade;
                gl_PointSize = clamp(gl_PointSize, 4.0, 360.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uFogColor;
            uniform vec3 uCyanMist;
            uniform vec3 uSkyMist;
            varying float vAlpha;
            varying float vLayer;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                // Suavidad esférica algodonosa tipo nube
                float soft = smoothstep(0.5, 0.0, dist);
                soft = soft * soft * (3.0 - 2.0 * soft);

                vec3 col = (vLayer > 1.5) ? mix(uFogColor, uSkyMist, 0.5) : mix(uCyanMist, uFogColor, 0.65);
                gl_FragColor = vec4(col, vAlpha * soft);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(mistMat);
    ensenadaMistPoints = new THREE.Points(geo, mistMat);
    ensenadaMistPoints.renderOrder = 30;
    ensenadaMistPoints.frustumCulled = false;
    scene.add(ensenadaMistPoints);
}

/**
 * Lámina continua horizontal de niebla rodante en la Ensenada:
 * Manto geométrico continuo situado a cota baja sobre el agua del cañón.
 * Garantiza que en vistas cenitales o giros de cámara el cañón conserve
 * una cobertura constante e infranqueable de niebla, evitando que "se abra".
 */
function createEnsenadaMistSheet() {
    const geo = new THREE.PlaneGeometry(85.0, 95.0, 32, 32);
    geo.rotateX(-Math.PI / 2);

    const sheetMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uFogColor: { value: new THREE.Color(0xf0fdfa) },
            uCyanMist: { value: new THREE.Color(0xbae6fd) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform float uTime;

            void main() {
                vUv = uv;
                vec3 pos = position;
                // Leve ondulación vertical procedural para dar volumen tridimensional
                pos.y += sin(pos.x * 0.08 + uTime * 0.4) * 0.45 + cos(pos.z * 0.08 + uTime * 0.3) * 0.45;
                vec4 worldPos = modelMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uFogColor;
            uniform vec3 uCyanMist;
            varying vec2 vUv;
            varying vec3 vWorldPos;

            void main() {
                // Desvanecimiento suave en los cuatro bordes
                float edgeX = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.78, 1.0, vUv.x));
                float edgeY = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
                float borderMask = edgeX * edgeY;

                // Ondas procedurales de niebla rodante
                vec2 uv1 = vUv * 3.2 + vec2(uTime * 0.025, uTime * 0.018);
                vec2 uv2 = vUv * 5.2 - vec2(uTime * 0.018, -uTime * 0.030);

                float n1 = sin(uv1.x * 6.28 + sin(uv1.y * 3.8)) * 0.5 + 0.5;
                float n2 = cos(uv2.x * 4.8 + cos(uv2.y * 6.28)) * 0.5 + 0.5;
                float fogDensity = smoothstep(0.25, 0.85, (n1 + n2) * 0.5);

                vec3 col = mix(uCyanMist, uFogColor, fogDensity * 0.65 + 0.35);
                float alpha = borderMask * (fogDensity * 0.44 + 0.28);
                gl_FragColor = vec4(col, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(sheetMat);
    ensenadaMistSheet = new THREE.Mesh(geo, sheetMat);
    ensenadaMistSheet.position.set(48.0, -3.7, -260.0);
    ensenadaMistSheet.renderOrder = 28;
    ensenadaMistSheet.frustumCulled = false;
    scene.add(ensenadaMistSheet);
}

/**
 * LOD Inteligente para todos los efectos fluviales:
 * 1. Nacimiento del Río 1 (Montaña)
 * 2. Desembocadura del Río 1 (Lago)
 * 3. Salida del Lago / Nacimiento Río 2 (112, 77)
 * 4. Ensenada y Niebla del Cañón Río 2 (69.59, -233)
 */
export function updateRiver(delta) {
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const maxDistSq = 90000; // 300m
    const maxEnsenadaDistSq = 122500; // 350m para mantener visible la niebla en lontananza

    // 1. LOD del Nacimiento Río 1 (Montaña)
    if (springSplashPoints) {
        const dxSpring = camX - springPosition.x;
        const dzSpring = camZ - springPosition.z;
        const distSqSpring = dxSpring * dxSpring + dzSpring * dzSpring;
        const springVisible = distSqSpring < maxDistSq;

        if (springSplashPoints.visible !== springVisible) springSplashPoints.visible = springVisible;
        if (springFoamMesh && springFoamMesh.visible !== springVisible) {
            springFoamMesh.visible = springVisible;
        }
    }

    // 2. LOD de la Desembocadura Río 1 (Estuario en el Lago)
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

    // 3. LOD de la Salida del Lago / Nacimiento Río 2 (112, 77)
    if (river2OutflowFoamMesh) {
        const dxOutflow = camX - river2OutflowPosition.x;
        const dzOutflow = camZ - river2OutflowPosition.z;
        const distSqOutflow = dxOutflow * dxOutflow + dzOutflow * dzOutflow;
        const outflowVisible = distSqOutflow < maxDistSq;

        if (river2OutflowFoamMesh.visible !== outflowVisible) {
            river2OutflowFoamMesh.visible = outflowVisible;
        }
        if (river2OutflowRocksGroup && river2OutflowRocksGroup.visible !== outflowVisible) {
            river2OutflowRocksGroup.visible = outflowVisible;
        }
        if (river2OutflowSplashPoints && river2OutflowSplashPoints.visible !== outflowVisible) {
            river2OutflowSplashPoints.visible = outflowVisible;
        }
    }

    // 4. LOD de la Ensenada y Niebla de Montañas Río 2
    if (ensenadaMistPoints) {
        const dxEnsenada = camX - ensenadaPosition.x;
        const dzEnsenada = camZ - ensenadaPosition.z;
        const distSqEnsenada = dxEnsenada * dxEnsenada + dzEnsenada * dzEnsenada;
        const ensenadaVisible = distSqEnsenada < maxEnsenadaDistSq;

        if (ensenadaMistPoints.visible !== ensenadaVisible) {
            ensenadaMistPoints.visible = ensenadaVisible;
        }
        if (ensenadaFoamMesh && ensenadaFoamMesh.visible !== ensenadaVisible) {
            ensenadaFoamMesh.visible = ensenadaVisible;
        }
        if (ensenadaMistSheet && ensenadaMistSheet.visible !== ensenadaVisible) {
            ensenadaMistSheet.visible = ensenadaVisible;
        }
    }

    // 5. LOD de la Salida del Lago / Nacimiento Río 3 (42, 103.5)
    if (river3OutflowFoamMesh) {
        const dxOutflow3 = camX - river3OutflowPosition.x;
        const dzOutflow3 = camZ - river3OutflowPosition.z;
        const distSqOutflow3 = dxOutflow3 * dxOutflow3 + dzOutflow3 * dzOutflow3;
        const outflow3Visible = distSqOutflow3 < maxDistSq;

        if (river3OutflowFoamMesh.visible !== outflow3Visible) {
            river3OutflowFoamMesh.visible = outflow3Visible;
        }
        if (river3OutflowRocksGroup && river3OutflowRocksGroup.visible !== outflow3Visible) {
            river3OutflowRocksGroup.visible = outflow3Visible;
        }
        if (river3OutflowSplashPoints && river3OutflowSplashPoints.visible !== outflow3Visible) {
            river3OutflowSplashPoints.visible = outflow3Visible;
        }
    }

    // 6. LOD de las Rocas y Ribera del Meandro del Río 3 (-96, -34.5)
    if (river3MeanderGroup) {
        const dxM = camX - river3MeanderPosition.x;
        const dzM = camZ - river3MeanderPosition.z;
        const distSqM = dxM * dxM + dzM * dzM;
        const meanderVisible = distSqM < maxDistSq;

        if (river3MeanderGroup.visible !== meanderVisible) {
            river3MeanderGroup.visible = meanderVisible;
        }
    }

    // 7. LOD de la Cueva de Desembocadura del Río 3 (-214, -233)
    if (caveStructureGroup) {
        const dxCave = camX - cavePosition.x;
        const dzCave = camZ - cavePosition.z;
        const distSqCave = dxCave * dxCave + dzCave * dzCave;
        const caveVisible = distSqCave < maxEnsenadaDistSq;

        if (caveStructureGroup.visible !== caveVisible) {
            caveStructureGroup.visible = caveVisible;
        }
        if (caveMistPoints && caveMistPoints.visible !== caveVisible) {
            caveMistPoints.visible = caveVisible;
        }
    }
}

// =========================================================================
// RÍO 3: IMPLEMENTACIONES DE AGUA, NACIMIENTO EN LAGO Y CUEVA SUBTERRÁNEA
// =========================================================================

/**
 * Malla de agua continua del Río 3 (Emisario Oeste):
 * Recorre desde la orilla oeste del lago en (42, 103.50) con cota -4.5m,
 * pasando por (-24, 102), (-92, 78.50), (-141.94, 0.75), (-152.48, -99.90)
 * hasta desembocar en la gran caverna montañosa en (-214, -233).
 */
function createRiver3Mesh() {
    const lengthSegments = 260;
    const widthSegments = 14;
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const normals = [];
    const indices = [];

    // Arranca en la orilla del lago en t=0.038 y se adentra hasta t=0.985 en el corazón de la cueva
    const tStart = 0.038;
    const tEnd = 0.985;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFraction = i / lengthSegments;
        const t = tStart + uFraction * (tEnd - tStart);

        const centerPt = river3Spline.getPoint(t);
        const tangent = river3Spline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Ancho base del agua con modulación orgánica y leve estrechamiento para penetrar en la cueva
        let halfWidth = 5.2 + Math.sin(t * 15.0) * 0.25;

        // Suavizado continuo en el meandro (-91.5, -34.0) para prevenir compresión en la orilla interior
        const distToMeander = Math.hypot(centerPt.x - (-91.5), centerPt.z - (-34.0));
        if (distToMeander < 20.0) {
            const meanderEase = 1.0 - (distToMeander / 20.0);
            halfWidth -= meanderEase * 0.45;
        }

        // Ensanchamiento orgánico desde x: -174.01, z: -179.13 (t > 0.785) para ocupar todo el ancho del cañón y la entrada a la cueva
        if (t > 0.785) {
            const caveT = Math.min((t - 0.785) / 0.09, 1.0);
            const expandSmooth = caveT * caveT * (3.0 - 2.0 * caveT);
            halfWidth = 5.2 + expandSmooth * 4.6; // Se ensancha progresivamente hasta 9.8m (~19.6m de ancho total)
        }

        for (let j = 0; j <= widthSegments; j++) {
            const vFraction = j / widthSegments;
            const across = (vFraction - 0.5) * 2.0;

            const vx = centerPt.x + normalXZ.x * (across * halfWidth);
            const vz = centerPt.z + normalXZ.z * (across * halfWidth);
            const vy = centerPt.y;

            positions.push(vx, vy, vz);
            uvs.push(vFraction, uFraction);
            normals.push(0, 1, 0);
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

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    river3Material = createWaterMaterial({
        isRiver: true,
        riverFadeStart: false,
        riverFadeEnd: true,
        riverLakeStart: true,
        shallowColor: 0x38d2d8,
        deepColor: 0x0369a1,
        flowSpeed: 1.30,
        waveHeight: 0.036,
        waveFrequency: 0.16,
        opacity: 0.80
    });
    registerWaterMaterial(river3Material);

    river3Mesh = new THREE.Mesh(geometry, river3Material);
    river3Mesh.receiveShadow = true;
    river3Mesh.renderOrder = 2;
    river3Mesh.frustumCulled = false;
    scene.add(river3Mesh);
}

/**
 * Rocas naturales deflectoras en la salida oeste del lago hacia el Río 3:
 * Enmarcan el nacimiento en (42, 103.50) con cantos rodados y peñascos ribereños.
 */
function createRiver3OutflowRocks() {
    river3OutflowRocksGroup = new THREE.Group();

    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.08
    });

    const rockShades = [0x545454, 0x606060, 0x6c6c6c, 0x787878, 0x5e5a56];
    const dodecGeo = new THREE.DodecahedronGeometry(1, 0);
    const icosaGeo = new THREE.IcosahedronGeometry(1, 0);

    const rockDefinitions = [
        // Flanco norte (orilla derecha del nacimiento)
        { x: 44.5, y: -4.3, z: 108.5, scaleX: 2.2, scaleY: 1.5, scaleZ: 2.0, rotY: 0.3, geo: 0 },
        { x: 42.0, y: -4.1, z: 110.2, scaleX: 2.6, scaleY: 2.0, scaleZ: 2.4, rotY: 1.1, geo: 1 },
        { x: 38.5, y: -4.25, z: 107.8, scaleX: 1.6, scaleY: 1.2, scaleZ: 1.8, rotY: 1.9, geo: 0 },
        { x: 34.8, y: -4.35, z: 108.5, scaleX: 1.4, scaleY: 0.9, scaleZ: 1.3, rotY: 0.6, geo: 1 },

        // Flanco sur (orilla izquierda del nacimiento)
        { x: 45.2, y: -4.3, z: 98.6, scaleX: 2.3, scaleY: 1.6, scaleZ: 2.1, rotY: 1.6, geo: 0 },
        { x: 41.8, y: -4.0, z: 96.8, scaleX: 2.8, scaleY: 2.1, scaleZ: 2.5, rotY: 0.4, geo: 1 },
        { x: 37.5, y: -4.25, z: 98.2, scaleX: 1.7, scaleY: 1.1, scaleZ: 1.6, rotY: 2.4, geo: 0 },
        { x: 33.5, y: -4.38, z: 99.0, scaleX: 1.3, scaleY: 0.85, scaleZ: 1.2, rotY: 1.2, geo: 1 },

        // Deflectores de umbral sumergidos en el canal
        { x: 40.2, y: -4.62, z: 104.2, scaleX: 1.6, scaleY: 0.75, scaleZ: 1.5, rotY: 0.8, geo: 1 },
        { x: 36.8, y: -4.68, z: 102.8, scaleX: 1.4, scaleY: 0.70, scaleZ: 1.3, rotY: 2.1, geo: 0 },
        { x: 32.2, y: -4.72, z: 103.5, scaleX: 1.2, scaleY: 0.60, scaleZ: 1.1, rotY: 1.4, geo: 1 }
    ];

    rockDefinitions.forEach((def, index) => {
        const mat = rockMaterial.clone();
        mat.color.setHex(rockShades[index % rockShades.length]);

        const mesh = new THREE.Mesh(def.geo === 0 ? dodecGeo : icosaGeo, mat);
        mesh.position.set(def.x, def.y, def.z);
        mesh.scale.set(def.scaleX, def.scaleY, def.scaleZ);
        mesh.rotation.set(0.12, def.rotY, 0.08);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.renderOrder = 3;

        river3OutflowRocksGroup.add(mesh);
        cameraObstacles.push(mesh);

        if (def.y > -4.5) {
            addCollidable({
                position: new THREE.Vector3(def.x, def.y, def.z),
                userData: { radius: Math.max(def.scaleX, def.scaleZ) * 0.8 }
            });
        }
    });

    scene.add(river3OutflowRocksGroup);
}

/**
 * Decal de estuario orgánico para la salida del Lago hacia el Río 3:
 * Proporciona continuidad de corriente y espuma translúcida en la transición lago-río.
 */
function createRiver3OutflowDecal() {
    const lengthSegments = 40;
    const widthSegments = 20;
    const geo = new THREE.BufferGeometry();

    const positions = [];
    const uvs = [];
    const indices = [];

    const tStart = 0.015;
    const tEnd = 0.095;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFrac = i / lengthSegments;
        const t = tStart + uFrac * (tEnd - tStart);

        const centerPt = river3Spline.getPoint(t);
        const tangent = river3Spline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const halfW = 6.4;

        for (let j = 0; j <= widthSegments; j++) {
            const vFrac = j / widthSegments;
            const across = (vFrac - 0.5) * 2.0;

            const vx = centerPt.x + normalXZ.x * (across * halfW);
            const vz = centerPt.z + normalXZ.z * (across * halfW);
            const vy = centerPt.y + 0.025;

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
            uFoamColor: { value: new THREE.Color(0xf1f9fb) },
            uCurrentColor: { value: new THREE.Color(0xb8f0f4) },
            uDeepColor: { value: new THREE.Color(0x0284c7) },
            uOpacity: { value: 0.38 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uFoamColor;
            uniform vec3 uCurrentColor;
            uniform vec3 uDeepColor;
            uniform float uOpacity;
            varying vec2 vUv;

            float hash21(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            void main() {
                float v = vUv.x;
                float u = vUv.y;

                float streamCoord = v * 7.5 + sin(u * 10.0 - uTime * 2.8) * 0.45;
                float streaks = sin(streamCoord * 3.14159) * 0.5 + 0.5;
                streaks = pow(streaks, 2.2);

                float flow1 = sin(u * 28.0 - uTime * 4.2 + v * 5.0);
                float flow2 = cos(u * 42.0 - uTime * 5.8 - v * 7.0);
                float wavelets = (flow1 * 0.5 + flow2 * 0.5) * 0.5 + 0.5;

                float noise = hash21(vec2(floor(v * 36.0), floor(u * 60.0 - uTime * 3.2)));
                float foamBits = step(0.68, noise) * wavelets;

                float longFade = smoothstep(0.0, 0.22, u) * smoothstep(1.0, 0.65, u);
                float bankFade = smoothstep(0.0, 0.12, v) * smoothstep(1.0, 0.88, v);
                float centerWeight = 1.0 - abs(v - 0.5) * 1.6;
                centerWeight = clamp(centerWeight, 0.0, 1.0);

                float totalEffect = (streaks * 0.55 + wavelets * 0.30 + foamBits * 0.45) * longFade * bankFade;
                vec3 finalCol = mix(uCurrentColor, uFoamColor, smoothstep(0.35, 0.85, totalEffect));

                float alpha = totalEffect * uOpacity * (0.65 + centerWeight * 0.35);
                gl_FragColor = vec4(finalCol, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(foamMat);
    river3OutflowFoamMesh = new THREE.Mesh(geo, foamMat);
    river3OutflowFoamMesh.renderOrder = 10;
    river3OutflowFoamMesh.frustumCulled = false;
    scene.add(river3OutflowFoamMesh);
}

/**
 * Partículas de corriente y salpicaduras en el umbral del Río 3
 */
function createRiver3OutflowSplash() {
    const count = 480;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aParams = new Float32Array(count * 4);
    const aDirections = new Float32Array(count * 3);
    const aFalloffs = new Float32Array(count);

    const tStart = 0.025;
    const tEnd = 0.088;

    for (let i = 0; i < count; i++) {
        const uFrac = Math.random();
        const t = tStart + uFrac * (tEnd - tStart);

        const basePt = river3Spline.getPoint(t);
        const tangent = river3Spline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const lateralSpread = (Math.random() - 0.5) * 6.8;
        const forwardOffset = (Math.random() - 0.5) * 1.8;

        positions[i * 3 + 0] = basePt.x + normalXZ.x * lateralSpread + tangent.x * forwardOffset;
        positions[i * 3 + 1] = basePt.y + 0.04;
        positions[i * 3 + 2] = basePt.z + normalXZ.z * lateralSpread + tangent.z * forwardOffset;

        const dirX = tangent.x + normalXZ.x * (Math.random() - 0.5) * 0.4;
        const dirY = 0.05 + Math.random() * 0.15;
        const dirZ = tangent.z + normalXZ.z * (Math.random() - 0.5) * 0.4;
        const len = Math.hypot(dirX, dirY, dirZ) || 1.0;

        aDirections[i * 3 + 0] = dirX / len;
        aDirections[i * 3 + 1] = dirY / len;
        aDirections[i * 3 + 2] = dirZ / len;

        aParams[i * 4 + 0] = Math.random() * 8.0;
        aParams[i * 4 + 1] = 1.1 + Math.random() * 1.4;
        aParams[i * 4 + 2] = 2.8 + Math.random() * 3.2;
        aParams[i * 4 + 3] = i < 280 ? 0.0 : 1.0;

        aFalloffs[i] = 1.0 - Math.abs(lateralSpread / 6.8);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aParams', new THREE.BufferAttribute(aParams, 4));
    geo.setAttribute('aDirection', new THREE.BufferAttribute(aDirections, 3));
    geo.setAttribute('aFalloff', new THREE.BufferAttribute(aFalloffs, 1));

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uCyanColor: { value: new THREE.Color(0x38d2d8) },
            uFoamColor: { value: new THREE.Color(0xf8fafc) }
        },
        vertexShader: `
            attribute vec4 aParams;
            attribute vec3 aDirection;
            attribute float aFalloff;
            uniform float uTime;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                float phase = aParams.x;
                float speed = aParams.y;
                float pSize = aParams.z;

                float cycle = fract((uTime * speed + phase) * 0.28);
                vProgress = cycle;

                vec3 pos = position + aDirection * (cycle * 3.2);
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float dist = length(mvPosition.xyz);
                float distFade = smoothstep(260.0, 45.0, dist);

                vAlpha = sin(cycle * 3.14159) * 0.85 * aFalloff * distFade;
                gl_PointSize = pSize * (260.0 / max(dist, 1.0)) * distFade;
                gl_PointSize = clamp(gl_PointSize, 1.0, 160.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uCyanColor;
            uniform vec3 uFoamColor;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                float soft = smoothstep(0.5, 0.05, dist);
                vec3 col = mix(uCyanColor, uFoamColor, smoothstep(0.1, 0.6, vProgress) * 0.85);
                gl_FragColor = vec4(col, vAlpha * soft);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(mat);
    river3OutflowSplashPoints = new THREE.Points(geo, mat);
    river3OutflowSplashPoints.renderOrder = 25;
    river3OutflowSplashPoints.frustumCulled = false;
    scene.add(river3OutflowSplashPoints);
}

/**
 * Desembocadura del Río 3: Gran Caverna Subterránea (-214, -233).
 * Inspirada en la composición monumental de la referencia:
 * - Gran arco abovedado con paredes rocosas estratificadas y repisas de musgo.
 * - Cortina densa de lianas colgantes estilizadas cayendo hacia el agua.
 * - Salientes y bancos de ribera que flanquean la entrada del río.
 * - Bruma mística esmeralda y suave contraluz etéreo interior.
 */
function createRiver3CaveMouth() {
    caveStructureGroup = new THREE.Group();

    // Materiales estilizados y orgánicos coherentes con el juego (flatShading)
    const caveDarkRockMat = new THREE.MeshStandardMaterial({
        color: 0x2e3336,
        roughness: 0.92,
        metalness: 0.08,
        flatShading: true
    });

    const caveMossRockMat = new THREE.MeshStandardMaterial({
        color: 0x334236,
        roughness: 0.88,
        metalness: 0.10,
        flatShading: true
    });

    const wetMossLedgeMat = new THREE.MeshStandardMaterial({
        color: 0x2d4f35,
        roughness: 0.82,
        metalness: 0.12,
        flatShading: true
    });

    const bankFernMat = new THREE.MeshStandardMaterial({
        color: 0x40916c,
        roughness: 0.88,
        side: THREE.DoubleSide
    });

    const dodecGeo = new THREE.DodecahedronGeometry(1, 1);
    const icosaGeo = new THREE.IcosahedronGeometry(1, 0);

    // Centro del umbral de la cueva
    const cx = -214.0;
    const cy = -5.84;
    const cz = -233.0;

    // Vector dirección hacia el interior de la cueva: normalizado con precisión
    const rawFwdX = -0.46;
    const rawFwdZ = -0.88;
    const fwdLen = Math.hypot(rawFwdX, rawFwdZ);
    const forwardX = rawFwdX / fwdLen;
    const forwardZ = rawFwdZ / fwdLen;
    // Vector transversal hacia el flanco derecho (perpendicular al cauce):
    const rightX = -forwardZ;
    const rightZ = forwardX;

    // 1. Muros y farallones rocosos que enmarcan la boca de la cueva (separados para dejar 14.6m de vano libre)
    // El canal de agua tiene ~10.4m de ancho (halfWidth = 5.2m).
    // Los pilares se ubican en distSide = +-13.5m con radio ~5.5m para que sus bordes interiores queden en +-7.5m,
    // garantizando una apertura de túnel completamente diáfana por la que el río y la luz penetran libremente.
    const cavePillars = [
        // Flanco Izquierdo (Este del cañón)
        { distFwd: -20, distSide: -15.5, h: 22, r: 6.5, yOff: 5.0, mat: caveDarkRockMat },
        { distFwd: -10, distSide: -14.2, h: 24, r: 6.2, yOff: 6.0, mat: caveMossRockMat },
        { distFwd: -1,  distSide: -13.2, h: 26, r: 5.8, yOff: 7.0, mat: caveDarkRockMat }, // Muro frontal izquierdo
        { distFwd: 8,   distSide: -13.6, h: 28, r: 6.2, yOff: 7.5, mat: caveMossRockMat },
        { distFwd: 18,  distSide: -14.0, h: 29, r: 6.6, yOff: 8.0, mat: caveDarkRockMat },
        { distFwd: 28,  distSide: -14.5, h: 30, r: 7.0, yOff: 8.5, mat: caveDarkRockMat },

        // Flanco Derecho (Oeste del cañón)
        { distFwd: -20, distSide: 15.5,  h: 22, r: 6.5, yOff: 5.0, mat: caveDarkRockMat },
        { distFwd: -10, distSide: 14.2,  h: 24, r: 6.2, yOff: 6.0, mat: caveMossRockMat },
        { distFwd: -1,  distSide: 13.2,  h: 26, r: 5.8, yOff: 7.0, mat: caveDarkRockMat }, // Muro frontal derecho
        { distFwd: 8,   distSide: 13.6,  h: 28, r: 6.2, yOff: 7.5, mat: caveMossRockMat },
        { distFwd: 18,  distSide: 14.0,  h: 29, r: 6.6, yOff: 8.0, mat: caveDarkRockMat },
        { distFwd: 28,  distSide: 14.5,  h: 30, r: 7.0, yOff: 8.5, mat: caveDarkRockMat }
    ];

    cavePillars.forEach(p => {
        const px = cx + forwardX * p.distFwd + rightX * p.distSide;
        const pz = cz + forwardZ * p.distFwd + rightZ * p.distSide;
        const py = cy + p.yOff;

        const pillar = new THREE.Mesh(dodecGeo, p.mat);
        pillar.position.set(px, py, pz);
        pillar.scale.set(p.r * 1.1, p.h, p.r * 1.1);
        pillar.rotation.set(0.10, Math.random() * Math.PI * 2, 0.08);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        caveStructureGroup.add(pillar);
        cameraObstacles.push(pillar);

        addCollidable({
            position: new THREE.Vector3(px, py, pz),
            userData: { radius: p.r * 1.0 }
        });
    });

    // 2. Repisas rocosas salientes con musgo en las paredes del cañón (fuera del cauce del río)
    const mossyLedges = [
        // Repisas pared izquierda
        { distFwd: -3, distSide: -8.8, y: cy + 4.2, sx: 4.0, sy: 1.6, sz: 3.8 },
        { distFwd: 5,  distSide: -9.2, y: cy + 6.8, sx: 4.4, sy: 1.8, sz: 4.2 },
        { distFwd: 14, distSide: -9.5, y: cy + 8.2, sx: 4.8, sy: 2.0, sz: 4.6 },
        // Repisas pared derecha
        { distFwd: -3, distSide: 8.8,  y: cy + 4.4, sx: 4.0, sy: 1.6, sz: 3.8 },
        { distFwd: 5,  distSide: 9.2,  y: cy + 7.0, sx: 4.4, sy: 1.8, sz: 4.2 },
        { distFwd: 14, distSide: 9.5,  y: cy + 8.4, sx: 4.8, sy: 2.0, sz: 4.6 }
    ];

    mossyLedges.forEach(l => {
        const lx = cx + forwardX * l.distFwd + rightX * l.distSide;
        const lz = cz + forwardZ * l.distFwd + rightZ * l.distSide;

        const ledge = new THREE.Mesh(dodecGeo, wetMossLedgeMat);
        ledge.position.set(lx, l.y, lz);
        ledge.scale.set(l.sx, l.sy, l.sz);
        ledge.rotation.set(0.08, Math.random() * Math.PI * 2, 0.08);
        ledge.castShadow = true;
        ledge.receiveShadow = true;
        caveStructureGroup.add(ledge);
    });

    // 3. Gran Bóveda Abovedada Monumental (Arco ojival natural alto que abraza todo el vano sin taparlo)
    const archKeystones = [
        // Arco frontal exterior (umbral alto en ojiva a 13.5m sobre el agua)
        { distFwd: -2.0, distSide: -9.5, y: cy + 9.6,  sx: 4.8, sy: 3.6, sz: 4.5 },
        { distFwd: -1.5, distSide: -5.0, y: cy + 12.2, sx: 4.6, sy: 3.5, sz: 4.6 },
        { distFwd: -1.0, distSide: 0.0,  y: cy + 13.6, sx: 5.6, sy: 3.8, sz: 5.2 }, // Clave superior central del arco
        { distFwd: -1.5, distSide: 5.0,  y: cy + 12.2, sx: 4.6, sy: 3.5, sz: 4.6 },
        { distFwd: -2.0, distSide: 9.5,  y: cy + 9.6,  sx: 4.8, sy: 3.6, sz: 4.5 },

        // Bóveda profunda interior (techo continuado hacia el corazón de la caverna)
        { distFwd: 7.0,  distSide: 0.0,  y: cy + 13.8, sx: 16.0, sy: 4.5, sz: 10.0 },
        { distFwd: 17.0, distSide: 0.0,  y: cy + 13.2, sx: 17.0, sy: 5.0, sz: 11.5 },
        { distFwd: 27.0, distSide: 0.0,  y: cy + 12.5, sx: 18.0, sy: 5.5, sz: 12.5 }
    ];

    archKeystones.forEach(k => {
        const kx = cx + forwardX * k.distFwd + rightX * k.distSide;
        const kz = cz + forwardZ * k.distFwd + rightZ * k.distSide;

        const archMesh = new THREE.Mesh(dodecGeo, caveDarkRockMat);
        archMesh.position.set(kx, k.y, kz);
        archMesh.scale.set(k.sx, k.sy, k.sz);
        archMesh.rotation.set(Math.random() * 0.20, Math.random() * Math.PI * 2, Math.random() * 0.20);
        archMesh.castShadow = true;
        archMesh.receiveShadow = true;
        caveStructureGroup.add(archMesh);
        cameraObstacles.push(archMesh);
    });

    // 4. Salientes y bancos de ribera en los laterales exteriores (orillas ampliadas para dejar >20.0m libres al río ensanchado)
    const bankPromontories = [
        // Banco rocoso izquierdo (zócalo lateral en distSide = -10.5 a -11.2m)
        { distFwd: -4.0, distSide: -10.8, y: cy - 0.1, sx: 3.2, sy: 1.4, sz: 3.6 },
        { distFwd: 0.0,  distSide: -10.5, y: cy - 0.2, sx: 3.0, sy: 1.2, sz: 3.2 },
        { distFwd: 4.0,  distSide: -10.2, y: cy - 0.2, sx: 2.8, sy: 1.1, sz: 3.0 },
        // Banco rocoso derecho (zócalo lateral en distSide = +10.5 a +11.2m)
        { distFwd: -4.0, distSide: 10.8,  y: cy - 0.1, sx: 3.2, sy: 1.4, sz: 3.6 },
        { distFwd: 0.0,  distSide: 10.5,  y: cy - 0.2, sx: 3.0, sy: 1.2, sz: 3.2 },
        { distFwd: 4.0,  distSide: 10.2,  y: cy - 0.2, sx: 2.8, sy: 1.1, sz: 3.0 }
    ];

    bankPromontories.forEach(bp => {
        const bpx = cx + forwardX * bp.distFwd + rightX * bp.distSide;
        const bpz = cz + forwardZ * bp.distFwd + rightZ * bp.distSide;

        const bankMesh = new THREE.Mesh(icosaGeo, wetMossLedgeMat);
        bankMesh.position.set(bpx, bp.y, bpz);
        bankMesh.scale.set(bp.sx, bp.sy, bp.sz);
        bankMesh.rotation.set(0.08, Math.random() * Math.PI * 2, 0.08);
        bankMesh.receiveShadow = true;
        caveStructureGroup.add(bankMesh);

        // Matas de helechos sobre las repisas rocosas laterales
        const fern = new THREE.Mesh(icosaGeo, bankFernMat);
        fern.position.set(bpx, bp.y + bp.sy * 0.45, bpz);
        fern.scale.set(1.3, 0.7, 1.3);
        fern.rotation.set(0.1, Math.random() * Math.PI * 2, 0.1);
        caveStructureGroup.add(fern);
    });

    // 5. Abismo y fondo interior de la caverna (telón sombrío que absorbe la luz en el extremo)
    const abyssMat = new THREE.MeshBasicMaterial({
        color: 0x051310, // Tono verde bosque muy oscuro y atmosférico
        side: THREE.BackSide
    });
    const abyssGeo = new THREE.SphereGeometry(18, 16, 16, 0, Math.PI);
    const abyssMesh = new THREE.Mesh(abyssGeo, abyssMat);
    abyssMesh.position.set(
        cx + forwardX * 32.0,
        cy + 7.0,
        cz + forwardZ * 32.0
    );
    abyssMesh.rotation.y = Math.atan2(forwardX, forwardZ);
    caveStructureGroup.add(abyssMesh);

    // 6. Luces místicas esmeralda suaves (interior de la cueva y umbral exterior)
    const caveGlowLight = new THREE.PointLight(0x2dd4bf, 2.8, 45, 1.2);
    caveGlowLight.position.set(
        cx + forwardX * 14.0,
        cy + 4.8,
        cz + forwardZ * 14.0
    );
    caveStructureGroup.add(caveGlowLight);

    // Luz ambiental esmeralda suave en el umbral del cañón, centrada en el spline del río (t = 0.86)
    const glowSplinePt = river3Spline.getPoint(0.86);
    const forwardGlowLight = new THREE.PointLight(0x34d399, 2.2, 38, 1.2);
    forwardGlowLight.position.set(glowSplinePt.x, glowSplinePt.y + 3.2, glowSplinePt.z);
    caveStructureGroup.add(forwardGlowLight);

    // 7. Sistema de Niebla y Humo Esmeralda Volátil (idéntico al de la Ensenada pero de tono esmeralda y menor opacidad)
    // Se distribuye rigurosamente centrado a lo largo del spline del río (t: 0.77 a 0.98)
    const count = 680;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aFogParams = new Float32Array(count * 4); // x: phase, y: speed, z: size, w: layer
    const aDriftDir = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const tSpan = Math.random();
        const t = 0.77 + tSpan * 0.21;
        const pt = river3Spline.getPoint(t);
        const tan = river3Spline.getTangent(t).normalize();
        const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

        if (i < 260) {
            // Capa 0: Bruma baja rasante sobre el agua y la entrada, desbordando suavemente las orillas
            const spread = (Math.random() - 0.5) * 26.0;
            positions[i * 3 + 0] = pt.x + norm.x * spread + (Math.random() - 0.5) * 4.0;
            positions[i * 3 + 1] = pt.y + 0.35 + Math.random() * 2.2;
            positions[i * 3 + 2] = pt.z + norm.z * spread + (Math.random() - 0.5) * 4.0;

            aDriftDir[i * 3 + 0] = tan.x * 0.6 + (Math.random() - 0.5) * 0.25;
            aDriftDir[i * 3 + 1] = 0.12;
            aDriftDir[i * 3 + 2] = tan.z * 0.6 + (Math.random() - 0.5) * 0.25;

            aFogParams[i * 4 + 0] = Math.random() * 12.0;
            aFogParams[i * 4 + 1] = 0.28 + Math.random() * 0.30;
            aFogParams[i * 4 + 2] = 26.0 + Math.random() * 24.0;
            aFogParams[i * 4 + 3] = 0.0;
        } else if (i < 500) {
            // Capa 1: Volutas de niebla rodante a media altura en la garganta y boca de la cueva
            const spread = (Math.random() - 0.5) * 28.0;
            positions[i * 3 + 0] = pt.x + norm.x * spread + (Math.random() - 0.5) * 5.0;
            positions[i * 3 + 1] = pt.y + 1.8 + Math.random() * 5.2;
            positions[i * 3 + 2] = pt.z + norm.z * spread + (Math.random() - 0.5) * 5.0;

            aDriftDir[i * 3 + 0] = tan.x * 0.35 + (Math.random() - 0.5) * 0.35;
            aDriftDir[i * 3 + 1] = 0.22;
            aDriftDir[i * 3 + 2] = tan.z * 0.35 + (Math.random() - 0.5) * 0.35;

            aFogParams[i * 4 + 0] = Math.random() * 12.0;
            aFogParams[i * 4 + 1] = 0.22 + Math.random() * 0.28;
            aFogParams[i * 4 + 2] = 32.0 + Math.random() * 28.0;
            aFogParams[i * 4 + 3] = 1.0;
        } else {
            // Capa 2: Vaho etéreo ascendente en paredes de roca y cúpula cavernosa
            const spread = (Math.random() - 0.5) * 32.0;
            positions[i * 3 + 0] = pt.x + norm.x * spread + (Math.random() - 0.5) * 6.0;
            positions[i * 3 + 1] = pt.y + 3.5 + Math.random() * 9.5;
            positions[i * 3 + 2] = pt.z + norm.z * spread + (Math.random() - 0.5) * 6.0;

            aDriftDir[i * 3 + 0] = (Math.random() - 0.5) * 0.25;
            aDriftDir[i * 3 + 1] = 0.38;
            aDriftDir[i * 3 + 2] = (Math.random() - 0.5) * 0.25;

            aFogParams[i * 4 + 0] = Math.random() * 12.0;
            aFogParams[i * 4 + 1] = 0.18 + Math.random() * 0.22;
            aFogParams[i * 4 + 2] = 36.0 + Math.random() * 30.0;
            aFogParams[i * 4 + 3] = 2.0;
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aFogParams', new THREE.BufferAttribute(aFogParams, 4));
    geo.setAttribute('aDriftDir', new THREE.BufferAttribute(aDriftDir, 3));

    const mistMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uEmeraldMist: { value: new THREE.Color(0x34d399) },
            uMintMist: { value: new THREE.Color(0x6ee7b7) },
            uDeepEmerald: { value: new THREE.Color(0x10b981) }
        },
        vertexShader: `
            attribute vec4 aFogParams;
            attribute vec3 aDriftDir;
            uniform float uTime;
            varying float vAlpha;
            varying float vLayer;

            void main() {
                float phase = aFogParams.x;
                float speed = aFogParams.y;
                float pSize = aFogParams.z;
                float layer = aFogParams.w;
                vLayer = layer;

                float cycleDuration = 7.5;
                float cycle = mod((uTime + phase) * speed, cycleDuration);
                float progress = cycle / cycleDuration;

                vec3 pos = position;

                // Deriva ondulante natural de humo/niebla
                pos += aDriftDir * (progress * 7.5);
                pos.x += sin(uTime * 0.35 + phase) * 2.5;
                pos.y += sin(uTime * 0.25 + phase * 1.3) * 0.9;
                pos.z += cos(uTime * 0.30 + phase) * 2.0;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float dist = length(mvPosition.xyz);

                // Desvanecimiento suave en cercanía y lejanía (hasta 360m)
                float distFade = smoothstep(360.0, 60.0, dist) * smoothstep(5.0, 16.0, dist);

                float cycleFade = sin(progress * 3.14159);
                // Opacidad moderada y sutil: menos opaca que la desembocadura de la ensenada
                float baseAlpha = (layer > 1.5) ? 0.20 : ((layer > 0.5) ? 0.24 : 0.28);
                vAlpha = cycleFade * baseAlpha * distFade;

                gl_PointSize = pSize * (300.0 / max(dist, 1.0)) * distFade;
                gl_PointSize = clamp(gl_PointSize, 4.0, 320.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uEmeraldMist;
            uniform vec3 uMintMist;
            uniform vec3 uDeepEmerald;
            varying float vAlpha;
            varying float vLayer;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                // Suavidad esférica algodonosa tipo nube
                float soft = smoothstep(0.5, 0.0, dist);
                soft = soft * soft * (3.0 - 2.0 * soft);

                // Gradación de color esmeralda etéreo según la capa de altura
                vec3 col = (vLayer > 1.5)
                    ? mix(uEmeraldMist, uMintMist, 0.45)
                    : mix(uDeepEmerald, uEmeraldMist, 0.55);

                gl_FragColor = vec4(col, vAlpha * soft);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    registerWaterMaterial(mistMat);
    caveMistPoints = new THREE.Points(geo, mistMat);
    caveMistPoints.renderOrder = 30;
    caveMistPoints.frustumCulled = false;
    caveStructureGroup.add(caveMistPoints);

    scene.add(caveStructureGroup);
}

/**
 * Rocas fluviales y vegetación de ribera en el meandro del Río 3 (-96.0, -34.5):
 * Decoración natural de depósito ribereño en la orilla interior de la curva.
 */
function createRiver3MeanderRocks() {
    river3MeanderGroup = new THREE.Group();

    const rockMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.08,
        flatShading: true
    });

    const mossyRockMat = new THREE.MeshStandardMaterial({
        color: 0x3d4a3d,
        roughness: 0.84,
        metalness: 0.10,
        flatShading: true
    });

    const fernMat = new THREE.MeshStandardMaterial({
        color: 0x3f8a65,
        roughness: 0.86,
        side: THREE.DoubleSide
    });

    const dodecGeo = new THREE.DodecahedronGeometry(1, 0);
    const icosaGeo = new THREE.IcosahedronGeometry(1, 0);

    const rockShades = [0x565854, 0x626660, 0x4e524b, 0x686c65];

    // Conjunto armónico de rocas redondeadas en la orilla interior del meandro
    const rockDefs = [
        // Roca principal de orilla (parte superior emergente y base en agua)
        { x: -95.6, y: -5.05, z: -34.2, sx: 2.1, sy: 1.35, sz: 1.9, rotY: 0.6, mossy: true },
        // Rocas de apoyo hacia el norte de la orilla interior
        { x: -96.4, y: -4.95, z: -32.2, sx: 1.8, sy: 1.45, sz: 1.7, rotY: 1.4, mossy: false },
        { x: -95.1, y: -5.18, z: -31.4, sx: 1.3, sy: 0.95, sz: 1.2, rotY: 2.1, mossy: true },
        // Rocas de apoyo hacia el sur de la orilla interior
        { x: -95.2, y: -5.15, z: -36.4, sx: 1.9, sy: 1.20, sz: 1.8, rotY: 0.9, mossy: true },
        { x: -96.2, y: -4.98, z: -37.8, sx: 1.6, sy: 1.30, sz: 1.5, rotY: 1.8, mossy: false },
        // Guijarros y cantos rodados de lecho bajo el talud
        { x: -94.6, y: -5.35, z: -34.8, sx: 1.1, sy: 0.65, sz: 1.0, rotY: 0.3, mossy: true },
        { x: -94.8, y: -5.32, z: -33.2, sx: 0.9, sy: 0.55, sz: 0.85, rotY: 2.4, mossy: false }
    ];

    rockDefs.forEach((def, index) => {
        const mat = (def.mossy ? mossyRockMat : rockMat).clone();
        if (!def.mossy) {
            mat.color.setHex(rockShades[index % rockShades.length]);
        }

        const mesh = new THREE.Mesh(index % 2 === 0 ? dodecGeo : icosaGeo, mat);
        mesh.position.set(def.x, def.y, def.z);
        mesh.scale.set(def.sx, def.sy, def.sz);
        mesh.rotation.set(0.08, def.rotY, 0.06);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.renderOrder = 3;

        river3MeanderGroup.add(mesh);
        cameraObstacles.push(mesh);

        if (def.sy > 1.0) {
            addCollidable({
                position: new THREE.Vector3(def.x, def.y, def.z),
                userData: { radius: Math.max(def.sx, def.sz) * 0.75 }
            });
        }
    });

    // Helechos y plantas de ribera emergiendo entre las grietas de las piedras
    const fernSpots = [
        { x: -96.8, y: -4.75, z: -33.5 },
        { x: -96.5, y: -4.80, z: -35.8 },
        { x: -95.8, y: -4.90, z: -38.2 }
    ];

    fernSpots.forEach(s => {
        const fern = new THREE.Mesh(icosaGeo, fernMat);
        fern.position.set(s.x, s.y, s.z);
        fern.scale.set(0.9, 0.55, 0.9);
        fern.rotation.set(0.15, Math.random() * Math.PI * 2, 0.15);
        river3MeanderGroup.add(fern);
    });

    scene.add(river3MeanderGroup);
}
