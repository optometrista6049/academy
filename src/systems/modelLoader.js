import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../core/scene.js';
import { getHeightAt } from '../terrain/terrainHeight.js';

export function loadModel(
    url,
    x,
    z,
    desiredHeight = 2,
    onLoaded = null
){
    const loader = new GLTFLoader();

    // Normalizar y generar rutas candidatas de fallback para asegurar compatibilidad
    const cleanUrl = url.replace(/^\.\//, ''); // quitar ./ inicial
    const fileName = cleanUrl.split('/').pop();
    
    const candidateUrls = [
        url,                                            // original
        cleanUrl,                                       // sin ./
        '/' + cleanUrl,                                 // absoluta
        'assets/models/npc/' + fileName,                // subcarpeta npc
        'assets/models/' + fileName,                    // carpeta raíz models
        'assets/models/npc/' + fileName.toLowerCase(),  // minúsculas
        'assets/models/' + fileName.toLowerCase()       // minúsculas raíz
    ];

    // Eliminar duplicados manteniendo orden
    const uniqueCandidates = [...new Set(candidateUrls)];

    function tryLoad(index) {
        if (index >= uniqueCandidates.length) {
            console.error(`[ModelLoader] ERROR CRÍTICO: No se pudo cargar el modelo '${url}' después de intentar todas las rutas:`, uniqueCandidates);
            return;
        }

        const currentUrl = uniqueCandidates[index];

        loader.load(
            currentUrl,
            function(gltf){
                console.log(`[ModelLoader] Modelo cargado con éxito: ${currentUrl}`);
                const model = gltf.scene;

                // =========================
                // AUTO SCALE
                // =========================
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);

                const scale = desiredHeight / (size.y || 1);
                model.scale.setScalar(scale);

                // recalcular box
                box.setFromObject(model);
                const groundOffset = -box.min.y;

                // =========================
                // POSITION
                // =========================
                model.position.x = x;
                model.position.z = z;
                model.position.y =
                    getHeightAt(x,z)
                    + groundOffset;

                // =========================
                // SHADOWS
                // =========================
                model.traverse((child)=>{
                    if(child.isMesh){
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                scene.add(model);

                if(onLoaded){
                    onLoaded(
                        model,
                        gltf,
                        groundOffset
                    );
                }
            },
            undefined,
            function(error){
                console.warn(`[ModelLoader] Falló la carga en '${currentUrl}', probando siguiente ruta candidata...`);
                tryLoad(index + 1);
            }
        );
    }

    tryLoad(0);
}