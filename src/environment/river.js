import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { camera } from '../core/camera.js';
import { runtimeState } from '../state/runtimeState.js';
import {
    riverSpline,
    riverOutflowSpline,
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
            uDeepColor: { value: new THREE.Color(0x0284c7) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
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
        riverFadeStart: true,
        riverFadeEnd: true,
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

    // tStart=0.005 (nace adentrado dentro de la lámina del lago) a tEnd=0.98 (adentrándose en el cañón)
    const tStart = 0.005;
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
        riverFadeEnd: false, // El emisario fluye continuo por todo el cauce sin desvanecerse
        shallowColor: 0x38bdf8,
        deepColor: 0x0284c7,
        foamColor: 0xffffff,
        flowSpeed: 1.40,
        waveHeight: 0.032,
        waveFrequency: 0.21,
        opacity: 0.88,
        foamIntensity: 0.65
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

    // tStart=0.003 (profundo dentro del lago) a tEnd=0.15 (adentrado en el cauce)
    const tStart = 0.003;
    const tEnd = 0.15;

    for (let i = 0; i <= lengthSegments; i++) {
        const uFrac = i / lengthSegments;
        const t = tStart + uFrac * (tEnd - tStart);

        const centerPt = riverOutflowSpline.getPoint(t);
        const tangent = riverOutflowSpline.getTangent(t).normalize();
        const normalXZ = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        // Expansión gradual y asimétrica hacia la lámina del lago
        const intakeSpread = 1.0 + Math.pow(1.0 - uFrac, 1.3) * 1.65;
        const halfWidth = (5.5 + 0.5) * intakeSpread;

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
            uDeepColor: { value: new THREE.Color(0x0284c7) },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
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
                // Desvanecimiento suave en las riberas y extremos (suave transición sin bordes duros)
                float bankFade = smoothstep(0.0, 0.28, vUv.x) * (1.0 - smoothstep(0.72, 1.0, vUv.x));
                float flowFade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
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
                suctionStreaks = smoothstep(0.40, 0.90, suctionStreaks * (0.3 + vUv.y * 0.7));

                // Perturbación asimétrica tipo estuario (ondulaciones suaves en la entrada)
                float entryRipple = sin(length(vec2(vUv.x - 0.5, vUv.y * 0.5)) * 20.0 - uTime * 2.8) * 0.5 + 0.5;
                float rippleMask = smoothstep(0.42, 0.88, entryRipple * (1.0 - vUv.y * 0.55));

                float totalFoam = clamp(waveCurrent * 0.55 + suctionStreaks * 0.45 + rippleMask * 0.35, 0.0, 1.0);
                vec3 col = mix(uCyanColor, uFoamColor, totalFoam);

                // Opacidad natural sin desconexión visual
                float alpha = borderMask * (totalFoam * 0.72 + 0.08);
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
 * Micro-burbujas y estelas dinámicas de corriente hacia el Río 2:
 * Partículas suaves orientadas a lo largo del flujo del canal sin formas circulares forzadas.
 */
function createRiver2OutflowSplash() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const aParams = new Float32Array(count * 4);
    const aDirections = new Float32Array(count * 3);

    const center = new THREE.Vector3(112.0, -4.47, 78.0);
    const flowDir = new THREE.Vector3(0.85, 0, -0.52).normalize();

    for (let i = 0; i < count; i++) {
        const lateralOffset = (Math.random() - 0.5) * 7.5;
        const longitudinalOffset = (Math.random() - 0.5) * 8.0;

        positions[i * 3 + 0] = center.x + lateralOffset * -flowDir.z + longitudinalOffset * flowDir.x;
        positions[i * 3 + 1] = -4.47;
        positions[i * 3 + 2] = center.z + lateralOffset * flowDir.x + longitudinalOffset * flowDir.z;

        aDirections[i * 3 + 0] = flowDir.x + (Math.random() - 0.5) * 0.25;
        aDirections[i * 3 + 1] = 0.0;
        aDirections[i * 3 + 2] = flowDir.z + (Math.random() - 0.5) * 0.25;

        aParams[i * 4 + 0] = Math.random() * 8.0;
        aParams[i * 4 + 1] = 1.0 + Math.random() * 1.2;
        aParams[i * 4 + 2] = 2.0 + Math.random() * 2.8;
        aParams[i * 4 + 3] = Math.random() * Math.PI * 2.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aParams', new THREE.BufferAttribute(aParams, 4));
    geo.setAttribute('aDirection', new THREE.BufferAttribute(aDirections, 3));

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uCyanColor: { value: new THREE.Color(0x38bdf8) },
            uFoamColor: { value: new THREE.Color(0xf8fafc) }
        },
        vertexShader: `
            attribute vec4 aParams;
            attribute vec3 aDirection;
            uniform float uTime;
            varying float vAlpha;

            void main() {
                float phase = aParams.x;
                float speed = aParams.y;
                float pSize = aParams.z;

                float cycle = mod((uTime + phase) * speed, 2.5);
                float progress = cycle / 2.5;

                vec3 pos = position;
                pos += aDirection * (progress * 3.5);

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                float dist = length(mvPosition.xyz);
                float distFade = smoothstep(260.0, 40.0, dist);

                vAlpha = sin(progress * 3.14159) * 0.65 * distFade;
                gl_PointSize = pSize * (200.0 / max(dist, 1.0)) * distFade;
                gl_PointSize = clamp(gl_PointSize, 1.0, 120.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uCyanColor;
            uniform vec3 uFoamColor;
            varying float vAlpha;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                float soft = smoothstep(0.5, 0.05, dist);
                vec3 col = mix(uCyanColor, uFoamColor, 0.6);
                gl_FragColor = vec4(col, vAlpha * soft);
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
}
