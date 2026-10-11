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
let springSplashPoints = null;
let springFoamMesh = null;
let estuarySplashPoints = null;
let estuaryFoamMesh = null;
let springPosition = new THREE.Vector3();
let estuaryPosition = new THREE.Vector3();

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
