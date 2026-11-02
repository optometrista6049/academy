/* ======================================================
   MONTESERIN ACADEMY - THREE.JS PROCEDURAL GENERATOR ENGINE
   Motor de síntesis de modelos 3D Three.js a partir de prompts
   Soporta conexión con API de IA (Gemini) y síntesis procedural
   inteligente offline basada en vocabulario semántico 3D.
   ====================================================== */

/**
 * Genera código Three.js procedural a partir de un texto descriptivo (prompt).
 * Intenta primero consultar el endpoint del servidor (/api/generate-3d); si no está
 * disponible o da error, ejecuta el sintetizador procedural avanzado integrado.
 *
 * @param {string} prompt Descripción del objeto deseado
 * @param {string} suggestedSocket Socket sugerido (rightHand, leftHand, back, head)
 * @returns {Promise<{ name: string, icon: string, socket: string, code: string, explanation: string }>}
 */
export async function generateThreeModelFromPrompt(prompt, suggestedSocket = 'rightHand') {
    const cleanPrompt = (prompt || '').trim();
    if (!cleanPrompt) {
        throw new Error('Por favor ingresa una descripción o prompt para el modelo 3D.');
    }

    // 1. Intentar endpoint de servidor si está activo
    try {
        const response = await fetch('/api/generate-3d', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: cleanPrompt, socket: suggestedSocket })
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.code) {
                return {
                    name: data.name || capitalizeWords(cleanPrompt.slice(0, 30)),
                    icon: data.icon || pickIconForPrompt(cleanPrompt),
                    socket: data.socket || suggestedSocket,
                    code: data.code,
                    explanation: data.explanation || 'Modelo generado con éxito mediante Gemini AI.'
                };
            }
        }
    } catch (_) {
        // Fallback silencioso al sintetizador procedural integrado
    }

    // 2. Sintetizador procedural semántico Three.js de alta fidelidad
    return synthesizeProceduralModel(cleanPrompt, suggestedSocket);
}

/**
 * Sintetizador semántico procedural que construye código Three.js
 * totalmente válido y estéticamente pulido a escala real.
 */
function synthesizeProceduralModel(prompt, preferredSocket) {
    const lower = prompt.toLowerCase();

    // Detección de paleta de colores
    const palette = detectPalette(lower);

    // Detección de categoría / tipo de objeto
    if (matchAny(lower, ['espada', 'sable', 'hoja', 'katana', 'florete', 'machete', 'daga', 'cuchillo'])) {
        return buildSwordModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['hacha', 'alabarda', 'pico', 'martillo', 'maza'])) {
        return buildAxeOrHammerModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['escudo', 'broquel', 'defensa', 'pantalla', 'barrera'])) {
        return buildShieldModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['antorcha', 'farol', 'linterna', 'fuego', 'vela', 'candil', 'lampara'])) {
        return buildTorchModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['baculo', 'cetro', 'varita', 'baston', 'orbe', 'cristal', 'magia'])) {
        return buildStaffModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['radio', 'comunicador', 'walkie', 'transmisor', 'radar', 'gps', 'scanner', 'dispositivo'])) {
        return buildRadioModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['mochila', 'bolsa', 'petate', 'morral', 'maleta', 'tanque', 'propulsor', 'jetpack'])) {
        return buildBackpackModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['pocion', 'frasco', 'botella', 'elixir', 'vial', 'matraz'])) {
        return buildPotionModel(lower, palette, preferredSocket);
    }
    if (matchAny(lower, ['casco', 'yelmo', 'corona', 'tiara', 'gafas', 'visor', 'sombrero', 'lentes'])) {
        return buildHelmetOrHatModel(lower, palette, preferredSocket);
    }

    // Modelo versátil de artefacto rúnico / tecnológico
    return buildGenericArtifactModel(lower, palette, preferredSocket);
}

function matchAny(text, keywords) {
    return keywords.some(k => text.includes(k));
}

function detectPalette(text) {
    if (text.includes('azul') || text.includes('cian') || text.includes('hielo') || text.includes('plasma')) {
        return { primary: '0x0284c7', glow: '0x38bdf8', secondary: '0x1e293b', accent: '0xd4af37' };
    }
    if (text.includes('rojo') || text.includes('fuego') || text.includes('carmesi') || text.includes('lava')) {
        return { primary: '0xef4444', glow: '0xf97316', secondary: '0x1c1917', accent: '0xd4af37' };
    }
    if (text.includes('verde') || text.includes('esmeralda') || text.includes('acido') || text.includes('naturaleza')) {
        return { primary: '0x10b981', glow: '0x34d399', secondary: '0x064e3b', accent: '0xd4af37' };
    }
    if (text.includes('morado') || text.includes('violeta') || text.includes('purpura') || text.includes('arcano')) {
        return { primary: '0x8b5cf6', glow: '0xc084fc', secondary: '0x3b0764', accent: '0xd4af37' };
    }
    if (text.includes('oro') || text.includes('dorad') || text.includes('sagrado') || text.includes('sol')) {
        return { primary: '0xd4af37', glow: '0xfef08a', secondary: '0x1f2937', accent: '0xf59e0b' };
    }
    // Default Monteserín Academy (Esmeralda + Oro + Grafito)
    return { primary: '0x1b4332', glow: '0x52b788', secondary: '0x111827', accent: '0xd4af37' };
}

function buildSwordModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '⚔️',
        socket: 'rightHand',
        explanation: 'Espada de combate con empuñadura ergonómica, guarda protectora y hoja reflectante.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "EspadaGenerada";

// 1. Empuñadura
const gripGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.22, 16);
const gripMat = new THREE.MeshStandardMaterial({ color: ${pal.secondary}, metalness: 0.7, roughness: 0.4 });
const grip = new THREE.Mesh(gripGeo, gripMat);
grip.position.y = -0.11;
group.add(grip);

// 2. Pomo
const pommelGeo = new THREE.SphereGeometry(0.035, 16, 16);
const pommelMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });
const pommel = new THREE.Mesh(pommelGeo, pommelMat);
pommel.position.y = -0.22;
group.add(pommel);

// 3. Guarda
const guardGeo = new THREE.BoxGeometry(0.20, 0.035, 0.055);
const guard = new THREE.Mesh(guardGeo, pommelMat);
group.add(guard);

// 4. Hoja
const bladeGeo = new THREE.BoxGeometry(0.048, 0.75, 0.015);
const bladeMat = new THREE.MeshStandardMaterial({
    color: ${pal.primary},
    emissive: ${pal.glow},
    emissiveIntensity: 0.8,
    metalness: 0.6,
    roughness: 0.2
});
const blade = new THREE.Mesh(bladeGeo, bladeMat);
blade.position.y = 0.38;
group.add(blade);

// 5. Punta de la espada
const tipGeo = new THREE.ConeGeometry(0.024, 0.12, 4);
tipGeo.rotateY(Math.PI / 4);
const tip = new THREE.Mesh(tipGeo, bladeMat);
tip.position.y = 0.81;
group.add(tip);

// 6. Luz suave de energía
const light = new THREE.PointLight(${pal.glow}, 1.2, 3.5);
light.position.y = 0.45;
group.add(light);

return group;`
    };
}

function buildAxeOrHammerModel(text, pal, socket) {
    const isHammer = text.includes('martillo') || text.includes('maza');
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: isHammer ? '🔨' : '🪓',
        socket: 'rightHand',
        explanation: isHammer ? 'Martillo de guerra pesado con cabeza maciza y remates metálicos.' : 'Hacha de combate con doble filo aerodinámico y mango reforzado.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "${isHammer ? 'Martillo' : 'Hacha'}";

// Mango
const shaftGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.68, 16);
const shaftMat = new THREE.MeshStandardMaterial({ color: 0x271911, roughness: 0.6, metalness: 0.2 });
const shaft = new THREE.Mesh(shaftGeo, shaftMat);
group.add(shaft);

// Refuerzos dorados
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });
[-0.2, 0.0, 0.24].forEach(y => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 18), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
});

${isHammer ? `
// Cabeza del Martillo
const headGeo = new THREE.BoxGeometry(0.18, 0.14, 0.14);
const headMat = new THREE.MeshStandardMaterial({ color: ${pal.secondary}, metalness: 0.85, roughness: 0.25 });
const head = new THREE.Mesh(headGeo, headMat);
head.position.y = 0.32;
group.add(head);

// Placas de impacto
const faceGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.03, 16);
faceGeo.rotateZ(Math.PI / 2);
[-0.10, 0.10].forEach(x => {
    const face = new THREE.Mesh(faceGeo, goldMat);
    face.position.set(x, 0.32, 0);
    group.add(face);
});
` : `
// Hoja del Hacha
const bladeGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.03, 16, 1, false, -Math.PI / 2, Math.PI);
const bladeMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, metalness: 0.85, roughness: 0.25 });
const blade = new THREE.Mesh(bladeGeo, bladeMat);
blade.rotation.z = Math.PI / 2;
blade.position.set(0.12, 0.28, 0);
group.add(blade);
`}

return group;`
    };
}

function buildShieldModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🛡️',
        socket: 'leftHand',
        explanation: 'Escudo protector templado con marco envolvente y núcleo de protección.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "EscudoGenerado";

// Placa del Escudo
const shieldGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.024, 32);
const shieldMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, metalness: 0.6, roughness: 0.3 });
const shield = new THREE.Mesh(shieldGeo, shieldMat);
shield.rotation.x = Math.PI / 2;
group.add(shield);

// Borde exterior
const rimGeo = new THREE.TorusGeometry(0.285, 0.02, 16, 32);
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.92, roughness: 0.2 });
const rim = new THREE.Mesh(rimGeo, goldMat);
group.add(rim);

// Núcleo central
const bossGeo = new THREE.SphereGeometry(0.08, 18, 18);
const boss = new THREE.Mesh(bossGeo, goldMat);
boss.position.z = 0.025;
group.add(boss);

// Gema brillante
const gemGeo = new THREE.OctahedronGeometry(0.045);
const gemMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.glow}, emissiveIntensity: 1.2 });
const gem = new THREE.Mesh(gemGeo, gemMat);
gem.position.z = 0.08;
group.add(gem);

// Agarre
const handleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.24, 12);
const handleMat = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
const handle = new THREE.Mesh(handleGeo, handleMat);
handle.position.z = -0.05;
group.add(handle);

return group;`
    };
}

function buildTorchModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🏮',
        socket: 'rightHand',
        explanation: 'Antorcha de iluminación con mango de madera, brasero dorado y llama luminiscente.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "Antorcha";

// Mango
const shaftGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.45, 16);
const shaftMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });
const shaft = new THREE.Mesh(shaftGeo, shaftMat);
group.add(shaft);

// Cabezal / Brasero dorado
const bowlGeo = new THREE.CylinderGeometry(0.08, 0.035, 0.12, 16);
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.25 });
const bowl = new THREE.Mesh(bowlGeo, goldMat);
bowl.position.y = 0.24;
group.add(bowl);

// Llama estilizada brillante
const flameGeo = new THREE.ConeGeometry(0.065, 0.18, 16);
const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffedd5,
    emissive: 0xf97316,
    emissiveIntensity: 2.0,
    roughness: 0.1,
    transparent: true,
    opacity: 0.95
});
const flame = new THREE.Mesh(flameGeo, flameMat);
flame.position.y = 0.38;
group.add(flame);

// Luz cálida dinámica
const fireLight = new THREE.PointLight(0xf97316, 1.8, 6.0);
fireLight.position.y = 0.42;
group.add(fireLight);

return group;`
    };
}

function buildStaffModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🔮',
        socket: 'rightHand',
        explanation: 'Báculo arcano estilizado con orbe mágico radiante y soporte ceremonial.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "BaculoArcano";

// Mástil
const shaftGeo = new THREE.CylinderGeometry(0.02, 0.026, 1.15, 16);
const shaftMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.3 });
const shaft = new THREE.Mesh(shaftGeo, shaftMat);
shaft.position.y = 0.12;
group.add(shaft);

// Corona dorada
const crownGeo = new THREE.CylinderGeometry(0.08, 0.03, 0.14, 6);
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.95, roughness: 0.2 });
const crown = new THREE.Mesh(crownGeo, goldMat);
crown.position.y = 0.70;
group.add(crown);

// Orbe resplandeciente
const orbGeo = new THREE.SphereGeometry(0.085, 24, 24);
const orbMat = new THREE.MeshStandardMaterial({
    color: ${pal.glow},
    emissive: ${pal.primary},
    emissiveIntensity: 1.6,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.90
});
const orb = new THREE.Mesh(orbGeo, orbMat);
orb.position.y = 0.82;
group.add(orb);

// Luz mágica
const staffLight = new THREE.PointLight(${pal.glow}, 1.6, 5.0);
staffLight.position.y = 0.85;
group.add(staffLight);

return group;`
    };
}

function buildRadioModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '📻',
        socket: 'back',
        explanation: 'Transmisor y receptor táctico con diales, antena y pantalla informativa.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "DispositivoTactico";

// Chasis
const bodyGeo = new THREE.BoxGeometry(0.15, 0.24, 0.075);
const bodyMat = new THREE.MeshStandardMaterial({ color: ${pal.secondary}, roughness: 0.4, metalness: 0.5 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
group.add(body);

// Pantalla
const screenGeo = new THREE.PlaneGeometry(0.10, 0.065);
const screenMat = new THREE.MeshStandardMaterial({
    color: ${pal.glow},
    emissive: ${pal.primary},
    emissiveIntensity: 0.9
});
const screen = new THREE.Mesh(screenGeo, screenMat);
screen.position.set(0, 0.05, 0.039);
group.add(screen);

// Antena
const antennaGeo = new THREE.CylinderGeometry(0.006, 0.009, 0.36, 12);
const antennaMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
const antenna = new THREE.Mesh(antennaGeo, antennaMat);
antenna.position.set(0.05, 0.28, 0);
group.add(antenna);

// Diales dorados
const dialMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });
[-0.035, 0.035].forEach((x, i) => {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 16), dialMat);
    dial.position.set(x, -0.06, 0.038);
    dial.rotation.x = Math.PI / 2;
    group.add(dial);
});

return group;`
    };
}

function buildBackpackModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🎒',
        socket: 'back',
        explanation: 'Mochila de transporte con bolsillos utilitarios y correas reforzadas.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "Mochila";

// Cuerpo
const packGeo = new THREE.BoxGeometry(0.34, 0.42, 0.18);
const packMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, roughness: 0.8, metalness: 0.1 });
const pack = new THREE.Mesh(packGeo, packMat);
group.add(pack);

// Bolsillo exterior
const pocketGeo = new THREE.BoxGeometry(0.25, 0.20, 0.08);
const pocket = new THREE.Mesh(pocketGeo, packMat);
pocket.position.set(0, -0.07, 0.13);
group.add(pocket);

// Correas doradas
const strapMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.85, roughness: 0.3 });
[-0.09, 0.09].forEach(x => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.43, 0.19), strapMat);
    strap.position.x = x;
    group.add(strap);
});

return group;`
    };
}

function buildPotionModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🧪',
        socket: 'rightHand',
        explanation: 'Frasco de alquimia con líquido brillante, corcho sellado y marco protector.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "Pocion";

// Botella esférica de cristal
const flaskGeo = new THREE.SphereGeometry(0.12, 24, 24);
const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6
});
const flask = new THREE.Mesh(flaskGeo, glassMat);
group.add(flask);

// Líquido interior brillante
const liquidGeo = new THREE.SphereGeometry(0.105, 20, 20);
const liquidMat = new THREE.MeshStandardMaterial({
    color: ${pal.primary},
    emissive: ${pal.glow},
    emissiveIntensity: 1.4,
    roughness: 0.2
});
const liquid = new THREE.Mesh(liquidGeo, liquidMat);
group.add(liquid);

// Cuello del frasco
const neckGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16);
const neck = new THREE.Mesh(neckGeo, glassMat);
neck.position.y = 0.14;
group.add(neck);

// Tapón de corcho
const corkGeo = new THREE.CylinderGeometry(0.038, 0.034, 0.05, 16);
const corkMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 });
const cork = new THREE.Mesh(corkGeo, corkMat);
cork.position.y = 0.19;
group.add(cork);

// Luz suave
const light = new THREE.PointLight(${pal.glow}, 1.2, 3.0);
group.add(light);

return group;`
    };
}

function buildHelmetOrHatModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '👑',
        socket: 'head',
        explanation: 'Tocado / Accesorio para la cabeza con corona protectora y gemas rúnicas.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "AccesorioCabeza";

// Corona perimetral dorada
const ringGeo = new THREE.CylinderGeometry(0.16, 0.17, 0.07, 32, 1, true);
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.95, roughness: 0.2 });
const ring = new THREE.Mesh(ringGeo, goldMat);
group.add(ring);

// Puntas triangulares
for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spikeGeo = new THREE.ConeGeometry(0.03, 0.08, 4);
    const spike = new THREE.Mesh(spikeGeo, goldMat);
    spike.position.set(Math.cos(angle) * 0.16, 0.065, Math.sin(angle) * 0.16);
    group.add(spike);
}

// Gema frontal resplandeciente
const gemGeo = new THREE.OctahedronGeometry(0.04);
const gemMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.5 });
const gem = new THREE.Mesh(gemGeo, gemMat);
gem.position.set(0, 0.01, 0.165);
group.add(gem);

return group;`
    };
}

function buildGenericArtifactModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '✨',
        socket: socket || 'rightHand',
        explanation: 'Artefacto multidimensional con núcleo de cristal, anillos giratorios y acabado dorado.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "ArtefactoGenerado";

// Núcleo central
const coreGeo = new THREE.DodecahedronGeometry(0.10);
const coreMat = new THREE.MeshStandardMaterial({
    color: ${pal.glow},
    emissive: ${pal.primary},
    emissiveIntensity: 1.4,
    roughness: 0.1,
    metalness: 0.3
});
const core = new THREE.Mesh(coreGeo, coreMat);
group.add(core);

// Anillo orbital dorado 1
const ring1Geo = new THREE.TorusGeometry(0.16, 0.015, 12, 32);
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.92, roughness: 0.2 });
const ring1 = new THREE.Mesh(ring1Geo, goldMat);
ring1.rotation.x = Math.PI / 4;
group.add(ring1);

// Anillo orbital dorado 2
const ring2Geo = new THREE.TorusGeometry(0.19, 0.015, 12, 32);
const ring2 = new THREE.Mesh(ring2Geo, goldMat);
ring2.rotation.y = Math.PI / 3;
group.add(ring2);

// Luz del núcleo
const light = new THREE.PointLight(${pal.glow}, 1.5, 4.0);
group.add(light);

return group;`
    };
}

function pickIconForPrompt(text) {
    const t = text.toLowerCase();
    if (t.includes('espada') || t.includes('sable')) return '⚔️';
    if (t.includes('escudo')) return '🛡️';
    if (t.includes('antorcha') || t.includes('fuego')) return '🏮';
    if (t.includes('baculo') || t.includes('cetro') || t.includes('magia')) return '🔮';
    if (t.includes('radio') || t.includes('radar')) return '📻';
    if (t.includes('mochila')) return '🎒';
    if (t.includes('pocion')) return '🧪';
    if (t.includes('corona') || t.includes('casco')) return '👑';
    if (t.includes('hacha') || t.includes('martillo')) return '🔨';
    return '✨';
}

function capitalizeWords(str) {
    if (!str) return 'Objeto 3D';
    return str.split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}
