/* ======================================================
   MONTESERIN ACADEMY - THREE.JS PROCEDURAL GENERATOR ENGINE
   Motor de síntesis semántica 3D Three.js de alta fidelidad.
   Arquitectura combinada (A + C):
   - Stemmer morfológico en español (diminutivos, aumentativos, plurales)
   - Diccionario curado multidominio (común, tecnológico, coloquial)
   - Ensamblador procedural de geometrías Three.js sin dependencias de API
   ====================================================== */

/**
 * Genera código Three.js procedural a partir de un texto descriptivo (prompt).
 * Intenta primero consultar el endpoint del servidor (/api/generate-3d); si no está
 * disponible (o no hay API key), ejecuta el sintetizador semántico offline integrado.
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

    // 1. Intentar endpoint de servidor si está activo con Gemini API (con timeout seguro de 4500ms;
    // sin API key responde HTTP 422 en <20ms pasando al sintetizador procedural offline).
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const response = await fetch('/api/generate-3d/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: cleanPrompt, socket: suggestedSocket }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

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
        // Fallback silencioso e instantáneo al sintetizador procedural integrado
    }

    // 2. Sintetizador semántico procedural Three.js integrado (Offline / Sin API)
    return synthesizeProceduralModel(cleanPrompt, suggestedSocket);
}

/* ======================================================
   MOTOR MORFOLÓGICO & STEMMER EN ESPAÑOL (CAPA C)
   ====================================================== */

/**
 * Normaliza el texto en español eliminando acentos, diacríticos y caracteres no alfanuméricos.
 */
function normalizeSpanish(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Reduce una palabra a su raíz léxica en español gestionando:
 * - Diminutivos (-ito, -ita, -illo, -illa, -ico, -ica, -uelo, -in)
 * - Aumentativos / despectivos (-azo, -aza, -ote, -ota, -on, -ona)
 * - Plurales regulares e irregulares (-es, -s)
 */
function stemSpanishWord(word) {
    if (!word || word.length <= 3) return word;
    let w = word;

    // Superlativos
    w = w.replace(/(isima|isimo|isimas|isimos)$/, '');

    // Diminutivos compuestos y simples
    w = w.replace(/(ecita|ecito|ecitas|ecitos)$/, '');
    w = w.replace(/(adita|adito|aditas|aditos)$/, '');
    w = w.replace(/(icita|icito|icitas|icitos)$/, '');
    w = w.replace(/(ita|ito|itas|itos|illa|illo|illas|illos|ica|ico|icas|icos)$/, '');
    w = w.replace(/(uela|uelo|uelas|uelos|in|ina|ines|inas)$/, '');

    // Aumentativos y despectivos
    w = w.replace(/(aza|azo|azas|azos|ota|ote|otas|otes|ona|on|onas|ones)$/, '');

    // Plurales
    if (w.endsWith('ces') && w.length > 4) {
        w = w.slice(0, -3) + 'z';
    } else if (w.endsWith('es') && w.length > 4) {
        w = w.slice(0, -2);
    } else if (w.endsWith('s') && !w.endsWith('is') && !w.endsWith('os') && w.length > 3) {
        w = w.slice(0, -1);
    }

    return w;
}

const SPANISH_STOP_WORDS = new Set([
    'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'con', 'en', 'por', 'para', 'y', 'o', 'al', 'a', 'su', 'sus', 'que'
]);

/**
 * Tokeniza una frase y devuelve tokens completos, lemas y comparador semántico.
 */
function analyzePromptSemantics(rawPrompt) {
    const normalized = normalizeSpanish(rawPrompt);
    const tokens = normalized.split(' ').filter(Boolean);
    const meaningfulTokens = tokens.filter(t => !SPANISH_STOP_WORDS.has(t));
    const stems = meaningfulTokens.map(stemSpanishWord);

    return {
        original: rawPrompt,
        normalized,
        tokens,
        meaningfulTokens,
        stems,
        has: (...terms) => {
            return terms.some(term => {
                const normTerm = normalizeSpanish(term);
                // 1. Frases compuestas con espacios ("detector de metales", "mesa con portatil")
                if (normTerm.includes(' ') && normalized.includes(normTerm)) return true;
                // 2. Token exacto de palabra individual ("tijeras", "mesa", "cama")
                if (tokens.includes(normTerm)) return true;
                // 3. Coincidencia por lema / raíz morfológica completa
                const termStem = stemSpanishWord(normTerm);
                return stems.some(s => s === termStem);
            });
        }
    };
}

/* ======================================================
   SINTETIZADOR PROCEDURAL SEMÁNTICO (CAPA A)
   ====================================================== */

function synthesizeProceduralModel(prompt, preferredSocket) {
    const sem = analyzePromptSemantics(prompt);
    const pal = detectPalette(sem);

    // 1. HERRAMIENTAS & INSTRUMENTOS
    // Detector de metales (incluye variantes: escaner de suelo, localizador)
    if (sem.has('detector', 'detector metales', 'escaner metales', 'localizador metales', 'detector metalico')) {
        return buildMetalDetectorModel(sem, pal, preferredSocket);
    }
    // Cazamariposas (incluye red con mango, salabre)
    if (sem.has('cazamariposa', 'caza mariposa', 'red mariposa', 'salabre', 'red mango')) {
        return buildButterflyNetModel(sem, pal, preferredSocket);
    }
    // Tijeras (incluye tijeritas, cizalla, cortaunas)
    if (sem.has('tijera', 'tijerita', 'tijeron', 'cizalla')) {
        return buildScissorsModel(sem, pal, preferredSocket);
    }
    // Herramientas de mano (linterna, llave inglesa, destornillador, martillo, pico, hacha)
    if (sem.has('linterna', 'foco mano', 'luz portatil')) {
        return buildFlashlightModel(sem, pal, preferredSocket);
    }
    if (sem.has('llave inglesa', 'llave fija', 'herramienta tuerca', 'llave fontanero')) {
        return buildWrenchModel(sem, pal, preferredSocket);
    }
    if (sem.has('destornillador', 'atornillador')) {
        return buildScrewdriverModel(sem, pal, preferredSocket);
    }
    if (sem.has('lupa', 'cristal aumento', 'lente aumento')) {
        return buildMagnifyingGlassModel(sem, pal, preferredSocket);
    }
    if (sem.has('hacha', 'alabarda', 'pico', 'martillo', 'maza')) {
        return buildAxeOrHammerModel(sem.normalized, pal, preferredSocket);
    }

    // 2. MOBILIARIO & HOGAR (Soporta composición compleja: "mesa con portátil", "mesa con flexo", etc.)
    // Mesa / Escritorio / Pupitre
    if (sem.has('mesa', 'escritorio', 'mesita', 'pupitre', 'buro', 'banco trabajo', 'mesa centro', 'mesa noche')) {
        return buildDeskOrTableModel(sem, pal, preferredSocket);
    }
    // Silla / Sillón / Butaca / Taburete / Silla gamer
    if (sem.has('silla', 'sillon', 'butaca', 'taburete', 'asiento', 'banqueta', 'silla gamer', 'silla oficina')) {
        return buildChairModel(sem, pal, preferredSocket);
    }
    // Estantería / Librería / Balda / Mueble de libros
    if (sem.has('estanteria', 'libreria', 'balda', 'estante', 'mueble libros', 'anaquel')) {
        return buildBookcaseModel(sem, pal, preferredSocket);
    }
    // Cama / Litera
    if (sem.has('cama', 'litera', 'catre', 'lecho')) {
        return buildBedModel(sem, pal, preferredSocket);
    }

    // 3. TECNOLOGÍA & HARDWARE (COMÚN, TÉCNICO Y COLOQUIAL)
    // Portátil / Laptop / Notebook / Compu portátil
    if (sem.has('portatil', 'laptop', 'notebook', 'compu portatil', 'macbook', 'ordenador portatil')) {
        return buildLaptopModel(sem, pal, preferredSocket);
    }
    // PC Sobremesa / Torre / Setup / Workstation / Server
    if (sem.has('ordenador', 'computadora', 'torre pc', 'pc gamer', 'workstation', 'servidor', 'rack', 'mainframe', 'setup')) {
        return buildDesktopPcOrServerModel(sem, pal, preferredSocket);
    }
    // Monitor / Pantalla / Display / TV / Tele
    if (sem.has('monitor', 'pantalla', 'display', 'television', 'tele', 'ultrawide')) {
        return buildMonitorModel(sem, pal, preferredSocket);
    }
    // Dron / Robot / Cuadricóptero
    if (sem.has('dron', 'drone', 'cuadricoptero', 'robot', 'androide', 'bot', 'autonoma')) {
        return buildDroneModel(sem, pal, preferredSocket);
    }
    // Antena / Parabólica / Radar
    if (sem.has('antena', 'parabolica', 'radar', 'antena satelite', 'receptor')) {
        return buildAntennaModel(sem, pal, preferredSocket);
    }

    // 4. CONTENEDORES & OBJETOS COTIDIANOS
    // Barril / Tonel / Bidón
    if (sem.has('barril', 'tonel', 'bidon', 'barril petroleo', 'barril madera')) {
        return buildBarrelModel(sem, pal, preferredSocket);
    }
    // Caja / Baúl / Cofre / Arcón
    if (sem.has('caja', 'cajon', 'baul', 'cofre', 'arcon', 'contenedor', 'caja madera', 'palet')) {
        return buildCrateOrChestModel(sem, pal, preferredSocket);
    }
    // Botella / Poción / Lata / Jarra / Taza
    if (sem.has('pocion', 'frasco', 'botella', 'elixir', 'vial', 'matraz', 'birra', 'lata', 'taza', 'vaso', 'copa')) {
        return buildPotionOrBottleModel(sem, pal, preferredSocket);
    }

    // 5. ILUMINACIÓN & ENTORNO URBANO
    // Farola / Poste de luz / Farol de parque
    if (sem.has('farola', 'poste luz', 'farol parque', 'farol calle', 'alumbrado')) {
        return buildStreetlightModel(sem, pal, preferredSocket);
    }
    // Lámpara / Flexo / Lámpara de mesa o pie
    if (sem.has('lampara', 'flexo', 'quinque', 'velador')) {
        return buildLampModel(sem, pal, preferredSocket);
    }
    // Valla / Reja / Puerta / Cartel / Poste
    if (sem.has('cartel', 'letrero', 'senal', 'poste indicativo', 'flecha madera')) {
        return buildSignpostModel(sem, pal, preferredSocket);
    }
    if (sem.has('puerta', 'porton', 'portal')) {
        return buildDoorModel(sem, pal, preferredSocket);
    }

    // 6. NATURALEZA
    if (sem.has('arbol', 'pino', 'abeto', 'palmera', 'tocon', 'arbusto')) {
        return buildTreeModel(sem, pal, preferredSocket);
    }
    if (sem.has('roca', 'piedra', 'pedrusco', 'penasco', 'meteorito')) {
        return buildRockModel(sem, pal, preferredSocket);
    }
    if (sem.has('hoguera', 'fogata', 'fuego campamento')) {
        return buildCampfireModel(sem, pal, preferredSocket);
    }

    // 7. ARMAS & EQUIPO DE AVENTURA (CLÁSICOS DEL JUEGO)
    if (sem.has('espada', 'sable', 'hoja', 'katana', 'florete', 'machete', 'daga', 'cuchillo')) {
        return buildSwordModel(sem.normalized, pal, preferredSocket);
    }
    if (sem.has('escudo', 'broquel', 'defensa', 'pantalla proteccion', 'barrera')) {
        return buildShieldModel(sem.normalized, pal, preferredSocket);
    }
    if (sem.has('antorcha', 'farol mano', 'fuego mano', 'vela', 'candil')) {
        return buildTorchModel(sem.normalized, pal, preferredSocket);
    }
    if (sem.has('baculo', 'cetro', 'varita', 'baston magico', 'orbe magico')) {
        return buildStaffModel(sem.normalized, pal, preferredSocket);
    }
    if (sem.has('radio', 'comunicador', 'walkie', 'transmisor', 'gps', 'scanner')) {
        return buildRadioModel(sem.normalized, pal, preferredSocket);
    }
    if (sem.has('mochila', 'bolsa', 'petate', 'morral', 'maleta', 'tanque oxigeno', 'propulsor', 'jetpack')) {
        return buildBackpackModel(sem.normalized, pal, preferredSocket);
    }
    if (sem.has('casco', 'yelmo', 'corona', 'tiara', 'gafas', 'visor', 'sombrero', 'lentes')) {
        return buildHelmetOrHatModel(sem.normalized, pal, preferredSocket);
    }

    // 8. FALLBACK INTELIGENTE (Nunca más esfera genérica vacía)
    return buildSmartDynamicArtifactModel(sem, pal, preferredSocket);
}

/* ======================================================
   DETECCIÓN DE PALETAS DE COLOR, MATERIALES Y ESTILOS
   ====================================================== */

export const SPANISH_COLOR_PALETTES = [
    { keys: ['azul', 'azulado', 'azulada', 'azules', 'celeste', 'turquesa', 'marino', 'cian', 'cobalto', 'zafiro'], hex: '0x2563eb', glow: '0x38bdf8' },
    { keys: ['rojo', 'rojizo', 'rojiza', 'rojizos', 'carmesi', 'rubi', 'granate', 'escarlata', 'fuego', 'sangre'], hex: '0xdc2626', glow: '0xef4444' },
    { keys: ['verde', 'verdoso', 'verdosa', 'esmeralda', 'lima', 'oliva', 'musgo', 'menta'], hex: '0x16a34a', glow: '0x4ade80' },
    { keys: ['amarillo', 'amarillento', 'amarillenta', 'oro', 'dorado', 'dorada', 'ambar'], hex: '0xeab308', glow: '0xfde047' },
    { keys: ['naranja', 'anaranjado', 'anaranjada', 'coral'], hex: '0xea580c', glow: '0xfb923c' },
    { keys: ['morado', 'purpura', 'violeta', 'lila', 'magenta'], hex: '0x9333ea', glow: '0xc084fc' },
    { keys: ['negro', 'negruzco', 'oscuro', 'carbon', 'azabache'], hex: '0x18181b', glow: '0x52525b' },
    { keys: ['blanco', 'blanquecino', 'marfil', 'nieve'], hex: '0xf8fafc', glow: '0xffffff' },
    { keys: ['gris', 'plateado', 'plateada', 'plata', 'acero', 'plomo', 'cromo', 'cromado'], hex: '0x94a3b8', glow: '0xcbd5e1' },
    { keys: ['rosa', 'rosado', 'rosada', 'fucsia'], hex: '0xec4899', glow: '0xf472b6' }
];

/**
 * Extrae un color específico asociado a ciertas partes o palabras clave dentro del prompt.
 */
function extractColorForKeywords(text, keywords, fallback) {
    if (!text) return fallback;
    const lower = text.toLowerCase();
    // 1. Buscar en cláusulas delimitadas por signos o conectores
    const clauses = lower.split(/(?:,|\.|\by\b|\bcon\b|\bpero\b|\bque\b|\bdonde\b)/);
    for (const clause of clauses) {
        const matchesKey = keywords.some(k => clause.includes(k));
        if (matchesKey) {
            for (const c of SPANISH_COLOR_PALETTES) {
                if (c.keys.some(k => clause.includes(k))) {
                    return c;
                }
            }
        }
    }
    // 2. Buscar en ventana de proximidad (45 caracteres alrededor de la palabra clave)
    for (const kw of keywords) {
        const idx = lower.indexOf(kw);
        if (idx !== -1) {
            const start = Math.max(0, idx - 45);
            const end = Math.min(lower.length, idx + kw.length + 55);
            const windowText = lower.slice(start, end);
            for (const c of SPANISH_COLOR_PALETTES) {
                if (c.keys.some(k => windowText.includes(k))) {
                    return c;
                }
            }
        }
    }
    return fallback;
}

function detectPalette(sem) {
    const text = sem.normalized;

    // Detectores de acabado
    const isChrome = sem.has('cromo', 'cromado', 'plata', 'plateado', 'plateada', 'acero brillante', 'metalico');
    const isGold = sem.has('oro', 'dorado', 'dorada', 'aureo', 'doradas');
    const isWood = sem.has('madera', 'roble', 'pino', 'caoba', 'nogal', 'rustico');
    const isNeonGamer = sem.has('gamer', 'gaming', 'cyberpunk', 'neon', 'rgb', 'futurista');
    const isRusted = sem.has('oxido', 'oxidado', 'viejo', 'antiguo', 'desgastado');

    // Paletas por tono primario
    if (sem.has('azul', 'azulado', 'azulada', 'azules', 'celeste', 'turquesa', 'marino', 'cian', 'cobalto', 'zafiro')) {
        return {
            primary: '0x2563eb',
            secondary: '0x1e293b',
            accent: isGold ? '0xf59e0b' : '0x38bdf8',
            glow: '0x60a5fa',
            metal: isChrome ? 0.85 : 0.45,
            rough: 0.25
        };
    }
    if (sem.has('rojo', 'rojizo', 'rojiza', 'rojizos', 'carmesi', 'rubi', 'fuego', 'sangre', 'lava', 'granate', 'escarlata')) {
        return {
            primary: '0xdc2626',
            secondary: isWood ? '0x5c3a21' : '0x1f2937',
            accent: isGold ? '0xf59e0b' : '0xffffff',
            glow: '0xef4444',
            metal: isChrome ? 0.85 : 0.25,
            rough: isChrome ? 0.12 : 0.45
        };
    }
    if (sem.has('verde', 'verdoso', 'verdosa', 'esmeralda', 'toxico', 'radiactivo', 'musgo', 'planta', 'lima')) {
        return {
            primary: '0x16a34a',
            secondary: isWood ? '0x4a2e18' : '0x111827',
            accent: '0x4ade80',
            glow: '0x22c55e',
            metal: isChrome ? 0.8 : 0.2,
            rough: 0.4
        };
    }
    if (sem.has('amarillo', 'amarillento', 'amarillenta', 'oro', 'dorado', 'dorada', 'ambar')) {
        return {
            primary: '0xeab308',
            secondary: '0x422006',
            accent: '0xfef08a',
            glow: '0xfde047',
            metal: isGold ? 0.9 : 0.3,
            rough: 0.25
        };
    }
    if (sem.has('naranja', 'anaranjado', 'anaranjada', 'coral')) {
        return {
            primary: '0xea580c',
            secondary: '0x292524',
            accent: '0xfb923c',
            glow: '0xf97316',
            metal: 0.35,
            rough: 0.3
        };
    }
    if (sem.has('morado', 'violeta', 'purpura', 'arcano', 'magico', 'amatista', 'lila', 'magenta')) {
        return {
            primary: '0x9333ea',
            secondary: '0x18181b',
            accent: '0xc084fc',
            glow: '0xa855f7',
            metal: 0.35,
            rough: 0.3
        };
    }
    if (sem.has('negro', 'negruzco', 'oscuro', 'sombra', 'tactico', 'carbon', 'azabache')) {
        return {
            primary: '0x18181b',
            secondary: '0x27272a',
            accent: isNeonGamer ? '0x06b6d4' : (isGold ? '0xf59e0b' : '0x71717a'),
            glow: isNeonGamer ? '0x22d3ee' : '0x3f3f46',
            metal: 0.4,
            rough: 0.35
        };
    }
    if (sem.has('blanco', 'blanquecino', 'nieve', 'puro', 'marfil', 'minimalista')) {
        return {
            primary: '0xf8fafc',
            secondary: '0xe2e8f0',
            accent: isChrome ? '0x94a3b8' : '0x38bdf8',
            glow: '0xffffff',
            metal: isChrome ? 0.8 : 0.15,
            rough: 0.25
        };
    }
    if (isWood) {
        return {
            primary: '0x6e4726',
            secondary: '0x422a16',
            accent: isChrome ? '0xe2e8f0' : (isGold ? '0xd97706' : '0x292524'),
            glow: '0xa16207',
            metal: 0.1,
            rough: 0.75
        };
    }
    if (isChrome) {
        return {
            primary: '0xf1f5f9',
            secondary: '0x334155',
            accent: '0x64748b',
            glow: '0x94a3b8',
            metal: 0.88,
            rough: 0.1
        };
    }
    if (isGold) {
        return {
            primary: '0xf59e0b',
            secondary: '0x78350f',
            accent: '0xfef08a',
            glow: '0xfbbf24',
            metal: 0.9,
            rough: 0.18
        };
    }

    // Predeterminado: Azul cian tecnológico equilibrado
    return {
        primary: '0x0284c7',
        secondary: '0x1e293b',
        accent: '0xd4af37',
        glow: '0x38bdf8',
        metal: 0.5,
        rough: 0.35
    };
}

/* ======================================================
   BUILDERS PROCEDURALES ESPECÍFICOS (THREE.JS)
   ====================================================== */

/**
 * 1. DETECTOR DE METALES (Con mástil, plato sensor, panel y soporte)
 * Soporta ensamblaje con mochila o modelo compacto de barra única en mano.
 */
function buildMetalDetectorModel(sem, pal, socket) {
    // Si el usuario especifica "una mano", "una sola mano", "una sola barra", "salo barra" (tolerancia a typo)
    // desactiva la mochila aunque aparezca alguna otra mención
    const explicitSoloBarra = sem.has(
        'una sola barra', 'sola barra', 'salo barra', 'solo barra', 'una barra', 
        'una mano', 'una sola mano', 'mano sola', 'sin mochila', 'de mano', 'solo mano'
    );
    const hasBackpack = !explicitSoloBarra && sem.has('mochila', 'bolsa', 'arnes', 'petate', 'mochila con detector', 'detector con mochila');

    // Detección contextual de color para estructura / mástil
    const structColor = extractColorForKeywords(
        sem.original || sem.normalized,
        ['estructura', 'mastil', 'barra', 'cuerpo', 'chasis', 'mango', 'tubo', 'vara', 'empunadura'],
        { hex: pal.primary !== '0x0284c7' ? pal.primary : '0x2563eb', glow: '0x38bdf8' }
    );

    // Detección contextual de color para el plato / círculo detector del suelo
    const coilColor = extractColorForKeywords(
        sem.original || sem.normalized,
        ['circulo', 'plato', 'bobina', 'disco', 'sensor', 'cabezal', 'suelo', 'escaneo', 'escanea', 'circulo detector'],
        { hex: pal.secondary !== '0x1e293b' ? pal.secondary : '0xdc2626', glow: '0xef4444' }
    );

    const accentColor = pal.accent || '0xd4af37';
    const screenGlow = structColor.glow || pal.glow;

    let code = `// Detector de Metales Ergonómico
const group = new THREE.Group();
group.name = "DetectorDeMetales";

// Materiales de alta fidelidad con soporte de colores personalizados
const shaftMat = new THREE.MeshStandardMaterial({ color: ${structColor.hex}, metalness: 0.85, roughness: 0.25 });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
const accentMat = new THREE.MeshStandardMaterial({ color: ${accentColor}, metalness: 0.4, roughness: 0.3 });
const screenMat = new THREE.MeshStandardMaterial({ color: ${screenGlow}, emissive: ${structColor.hex}, emissiveIntensity: 1.2, roughness: 0.1 });
const coilMat = new THREE.MeshStandardMaterial({ color: ${coilColor.hex}, metalness: 0.65, roughness: 0.3, emissive: ${coilColor.hex}, emissiveIntensity: 0.25 });

// 1. Mástil telescópico central con inclinación ergonómica
const shaftGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.95, 16);
const shaft = new THREE.Mesh(shaftGeo, shaftMat);
shaft.position.set(0, 0.15, -0.15);
shaft.rotation.x = 0.28; // Inclinación hacia adelante
group.add(shaft);

// 2. Empuñadura ergonómica de goma
const gripGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.18, 16);
const grip = new THREE.Mesh(gripGeo, rubberMat);
grip.position.set(0, 0.32, -0.09);
grip.rotation.x = 0.28;
group.add(grip);

// 3. Apoyabrazos en 'U' (codo / antebrazo)
const cuffGeo = new THREE.TorusGeometry(0.065, 0.014, 12, 24, Math.PI);
const cuff = new THREE.Mesh(cuffGeo, shaftMat);
cuff.position.set(0, 0.46, -0.04);
cuff.rotation.x = Math.PI / 2 + 0.28;
group.add(cuff);

// 4. Caja de control con pantalla y botonera
const boxGeo = new THREE.BoxGeometry(0.09, 0.12, 0.07);
const controlBox = new THREE.Mesh(boxGeo, accentMat);
controlBox.position.set(0, 0.24, -0.14);
controlBox.rotation.x = 0.28;
group.add(controlBox);

// Pantalla LCD digital emisiva
const screenGeo = new THREE.PlaneGeometry(0.065, 0.05);
const screen = new THREE.Mesh(screenGeo, screenMat);
screen.position.set(0, 0.25, -0.10);
screen.rotation.x = 0.28;
group.add(screen);

// Diales de ajuste
const dialGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12);
const dial1 = new THREE.Mesh(dialGeo, rubberMat);
dial1.position.set(-0.025, 0.20, -0.11);
dial1.rotation.x = Math.PI / 2 + 0.28;
group.add(dial1);
const dial2 = new THREE.Mesh(dialGeo, rubberMat);
dial2.position.set(0.025, 0.20, -0.11);
dial2.rotation.x = Math.PI / 2 + 0.28;
group.add(dial2);

// 5. Rótula inferior y Bobina / Plato sensor de búsqueda
const jointGeo = new THREE.SphereGeometry(0.024, 12, 12);
const joint = new THREE.Mesh(jointGeo, rubberMat);
joint.position.set(0, -0.28, -0.29);
group.add(joint);

// Bobina de búsqueda circular (Search Coil)
const coilRingGeo = new THREE.TorusGeometry(0.14, 0.018, 16, 32);
const coilRing = new THREE.Mesh(coilRingGeo, coilMat);
coilRing.position.set(0, -0.30, -0.29);
coilRing.rotation.x = Math.PI / 2; // Paralelo al suelo
group.add(coilRing);

// Rayos o brazos del plato sensor
const crossGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8);
const crossX = new THREE.Mesh(crossGeo, coilMat);
crossX.position.set(0, -0.30, -0.29);
crossX.rotation.z = Math.PI / 2;
group.add(crossX);
const crossZ = new THREE.Mesh(crossGeo, coilMat);
crossZ.position.set(0, -0.30, -0.29);
crossZ.rotation.x = Math.PI / 2;
group.add(crossZ);
`;

    if (hasBackpack) {
        code += `
// 6. Mochila de expedición acoplada
const bagMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.85 });
const strapMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });

const packBodyGeo = new THREE.BoxGeometry(0.24, 0.34, 0.16);
const packBody = new THREE.Mesh(packBodyGeo, bagMat);
packBody.position.set(0, 0.15, 0.28);
group.add(packBody);

// Bolsillo exterior de la mochila
const pocketGeo = new THREE.BoxGeometry(0.18, 0.16, 0.08);
const pocket = new THREE.Mesh(pocketGeo, accentMat);
pocket.position.set(0, 0.10, 0.39);
group.add(pocket);

// Cable espiral que conecta la mochila con la caja del detector
const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.10, 0.30),
    new THREE.Vector3(0.12, 0.05, 0.15),
    new THREE.Vector3(0.06, 0.15, -0.05),
    new THREE.Vector3(0, 0.20, -0.14)
]);
const cableGeo = new THREE.TubeGeometry(cableCurve, 20, 0.008, 8, false);
const cable = new THREE.Mesh(cableGeo, rubberMat);
group.add(cable);
`;
    }

    code += `\nreturn group;`;

    return {
        name: hasBackpack ? 'Detector con Mochila' : 'Detector de Metales',
        icon: '📡',
        socket: hasBackpack ? 'back' : (socket || 'rightHand'),
        explanation: 'Detector de metales ergonómico con plato de inducción, mástil regulable, pantalla LCD' + (hasBackpack ? ' y mochila de batería conectada.' : '.'),
        code
    };
}

/**
 * 2. CAZAMARIPOSAS (Mango largo, aro superior y red cónica semitransparente)
 */
function buildButterflyNetModel(sem, pal, socket) {
    const isMetalHandle = sem.has('aluminio', 'metal', 'acero', 'plata');
    const handleColor = isMetalHandle ? '0x94a3b8' : '0xa16207';

    const code = `// Cazamariposas con Red de Malla
const group = new THREE.Group();
group.name = "Cazamariposas";

// Materiales
const handleMat = new THREE.MeshStandardMaterial({ 
    color: ${handleColor}, 
    roughness: ${isMetalHandle ? '0.2' : '0.7'}, 
    metalness: ${isMetalHandle ? '0.85' : '0.05'} 
});
const rimMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
const netMat = new THREE.MeshStandardMaterial({ 
    color: ${pal.primary}, 
    wireframe: true, 
    transparent: true, 
    opacity: 0.75, 
    roughness: 0.8 
});

// 1. Mango largo esbelto
const handleGeo = new THREE.CylinderGeometry(0.012, 0.014, 1.10, 16);
const handle = new THREE.Mesh(handleGeo, handleMat);
handle.position.set(0, 0.10, 0);
group.add(handle);

// Empuñadura en la base
const gripGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.22, 16);
const grip = new THREE.Mesh(gripGeo, gripMat);
grip.position.set(0, -0.38, 0);
group.add(grip);

// Tapa inferior del mango
const capGeo = new THREE.SphereGeometry(0.018, 12, 12);
const cap = new THREE.Mesh(capGeo, rimMat);
cap.position.set(0, -0.49, 0);
group.add(cap);

// 2. Aro metálico superior (Hoop)
const rimGeo = new THREE.TorusGeometry(0.18, 0.012, 16, 32);
const rim = new THREE.Mesh(rimGeo, rimMat);
rim.position.set(0, 0.65, -0.06);
rim.rotation.x = Math.PI / 2 + 0.25;
group.add(rim);

// Conector de fijación entre aro y mástil
const collarGeo = new THREE.CylinderGeometry(0.02, 0.018, 0.06, 16);
const collar = new THREE.Mesh(collarGeo, rimMat);
collar.position.set(0, 0.62, 0);
group.add(collar);

// 3. Bolsa cónica de red de tela (colgando con gracia)
const netGeo = new THREE.ConeGeometry(0.18, 0.45, 24, 12, true);
const net = new THREE.Mesh(netGeo, netMat);
net.position.set(0, 0.48, -0.20);
net.rotation.x = -Math.PI / 2 + 0.35;
group.add(net);

// Suavizado interior de la red
const innerNetGeo = new THREE.SphereGeometry(0.07, 12, 12);
const innerNet = new THREE.Mesh(innerNetGeo, new THREE.MeshStandardMaterial({
    color: ${pal.glow},
    transparent: true,
    opacity: 0.25
}));
innerNet.position.set(0, 0.38, -0.32);
group.add(innerNet);

return group;`;

    return {
        name: 'Cazamariposas',
        icon: '🦋',
        socket: socket || 'rightHand',
        explanation: 'Cazamariposas con mango alargado, aro metálico y red de malla traslúcida flexible.',
        code
    };
}

/**
 * 3. TIJERAS (Dos hojas afiladas cruzadas, eje pivotante y ojetes ergonómicos)
 */
function buildScissorsModel(sem, pal, socket) {
    const code = `// Tijeras de Precisión
const group = new THREE.Group();
group.name = "Tijeras";

// Materiales
const steelMat = new THREE.MeshStandardMaterial({ 
    color: 0xf8fafc, 
    metalness: 0.95, 
    roughness: 0.08 
});
const pivotMat = new THREE.MeshStandardMaterial({ 
    color: 0xd4af37, 
    metalness: 0.9, 
    roughness: 0.2 
});
const handleColor = ${pal.primary};
const handleMat = new THREE.MeshStandardMaterial({ 
    color: handleColor, 
    roughness: 0.3, 
    metalness: 0.2 
});

// Eje o tornillo central pivotante
const pinGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.025, 16);
const pin = new THREE.Mesh(pinGeo, pivotMat);
pin.rotation.x = Math.PI / 2;
group.add(pin);

// --- HOJA Y ANILLA 1 (Inclinada a la izquierda) ---
const blade1Group = new THREE.Group();

// Hoja 1 afilada
const blade1Geo = new THREE.BoxGeometry(0.016, 0.22, 0.005);
const blade1 = new THREE.Mesh(blade1Geo, steelMat);
blade1.position.set(0, 0.10, 0);
blade1Group.add(blade1);

// Filo biselado
const tip1Geo = new THREE.ConeGeometry(0.016, 0.05, 4);
const tip1 = new THREE.Mesh(tip1Geo, steelMat);
tip1.position.set(0, 0.23, 0);
tip1.rotation.y = Math.PI / 4;
blade1Group.add(tip1);

// Anilla de agarre 1
const loop1Geo = new THREE.TorusGeometry(0.045, 0.010, 16, 24);
const loop1 = new THREE.Mesh(loop1Geo, handleMat);
loop1.position.set(-0.035, -0.10, 0);
blade1Group.add(loop1);

// Vástago de conexión hacia la anilla
const stem1Geo = new THREE.CylinderGeometry(0.008, 0.010, 0.10, 8);
const stem1 = new THREE.Mesh(stem1Geo, handleMat);
stem1.position.set(-0.018, -0.05, 0);
stem1.rotation.z = 0.25;
blade1Group.add(stem1);

blade1Group.rotation.z = 0.22; // Ángulo de apertura
group.add(blade1Group);

// --- HOJA Y ANILLA 2 (Inclinada a la derecha) ---
const blade2Group = new THREE.Group();

const blade2 = new THREE.Mesh(blade1Geo, steelMat);
blade2.position.set(0, 0.10, 0.006);
blade2Group.add(blade2);

const tip2 = new THREE.Mesh(tip1Geo, steelMat);
tip2.position.set(0, 0.23, 0.006);
tip2.rotation.y = Math.PI / 4;
blade2Group.add(tip2);

const loop2 = new THREE.Mesh(loop1Geo, handleMat);
loop2.position.set(0.035, -0.10, 0.006);
blade2Group.add(loop2);

const stem2 = new THREE.Mesh(stem1Geo, handleMat);
stem2.position.set(0.018, -0.05, 0.006);
stem2.rotation.z = -0.25;
blade2Group.add(stem2);

blade2Group.rotation.z = -0.22; // Ángulo de apertura simétrico
group.add(blade2Group);

return group;`;

    return {
        name: 'Tijeras',
        icon: '✂️',
        socket: socket || 'rightHand',
        explanation: 'Tijeras de acero inoxidable pulido con doble hoja afilada cruzada y mangos ergonómicos.',
        code
    };
}

/**
 * 4. ORDENADOR PORTÁTIL / LAPTOP
 */
function buildLaptopModel(sem, pal, socket) {
    const isGaming = sem.has('gamer', 'gaming', 'rgb', 'potente');
    const bodyColor = isGaming ? '0x0f172a' : '0x334155';
    const screenColor = pal.glow;

    const code = `// Ordenador Portátil Ultra Slim
const group = new THREE.Group();
group.name = "OrdenadorPortatil";

// Materiales
const chassisMat = new THREE.MeshStandardMaterial({ color: ${bodyColor}, metalness: 0.8, roughness: 0.25 });
const keyboardMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.8 });
const screenMat = new THREE.MeshStandardMaterial({ 
    color: ${screenColor}, 
    emissive: ${pal.primary}, 
    emissiveIntensity: 1.1, 
    roughness: 0.1 
});
const hingeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.1 });

// 1. Base del chasis inferior
const baseGeo = new THREE.BoxGeometry(0.38, 0.018, 0.26);
const base = new THREE.Mesh(baseGeo, chassisMat);
base.position.set(0, 0.009, 0);
group.add(base);

// Zona del teclado (rehundido)
const kbGeo = new THREE.BoxGeometry(0.32, 0.004, 0.14);
const keyboard = new THREE.Mesh(kbGeo, keyboardMat);
keyboard.position.set(0, 0.019, -0.02);
group.add(keyboard);

// Trackpad
const padGeo = new THREE.BoxGeometry(0.12, 0.002, 0.07);
const pad = new THREE.Mesh(padGeo, chassisMat);
pad.position.set(0, 0.019, 0.08);
group.add(pad);

// 2. Bisagra cilíndrica
const hingeGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.34, 16);
const hinge = new THREE.Mesh(hingeGeo, hingeMat);
hinge.position.set(0, 0.018, -0.13);
hinge.rotation.z = Math.PI / 2;
group.add(hinge);

// 3. Tapa con pantalla abierta en ángulo de ~115 grados
const lidGroup = new THREE.Group();
lidGroup.position.set(0, 0.018, -0.13);
lidGroup.rotation.x = -1.95; // Ángulo abierto

// Chasis de la tapa
const lidGeo = new THREE.BoxGeometry(0.38, 0.012, 0.26);
const lid = new THREE.Mesh(lidGeo, chassisMat);
lid.position.set(0, 0, 0.13);
lidGroup.add(lid);

// Panel de pantalla encendido
const screenGeo = new THREE.PlaneGeometry(0.34, 0.22);
const screen = new THREE.Mesh(screenGeo, screenMat);
screen.position.set(0, 0.007, 0.13);
screen.rotation.x = -Math.PI / 2;
lidGroup.add(screen);

group.add(lidGroup);

// Luz emitida por la pantalla
const light = new THREE.PointLight(${screenColor}, 1.2, 2.5);
light.position.set(0, 0.15, -0.05);
group.add(light);

return group;`;

    return {
        name: isGaming ? 'Portátil Gaming RGB' : 'Ordenador Portátil',
        icon: '💻',
        socket: socket || 'rightHand',
        explanation: 'Portátil estilizado con chasis metálico, teclado empotrado, pantalla abierta emisiva y trackpad.',
        code
    };
}

/**
 * 5. MESA / ESCRITORIO (Con soporte de objetos compuestos: "mesa con portátil", "mesa con flexo")
 */
function buildDeskOrTableModel(sem, pal, socket) {
    const hasLaptop = sem.has('portatil', 'laptop', 'ordenador', 'compu', 'pantalla');
    const hasLamp = sem.has('lampara', 'flexo', 'luz');
    const isGlass = sem.has('cristal', 'vidrio', 'transparente');

    let code = `// Mesa / Escritorio Modular
const group = new THREE.Group();
group.name = "MesaEscritorio";

// Materiales
const topMat = new THREE.MeshStandardMaterial({ 
    color: ${isGlass ? '0xe2e8f0' : (pal.secondary || '0x6e4726')}, 
    roughness: ${isGlass ? '0.05' : '0.6'}, 
    metalness: ${isGlass ? '0.1' : '0.1'},
    transparent: ${isGlass ? 'true' : 'false'},
    opacity: ${isGlass ? '0.7' : '1.0'}
});
const legMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.2 });

// 1. Tablero principal
const topGeo = new THREE.BoxGeometry(1.20, 0.05, 0.65);
const top = new THREE.Mesh(topGeo, topMat);
top.position.set(0, 0.72, 0);
group.add(top);

// 2. Cuatro patas metálicas resistentes
const legGeo = new THREE.CylinderGeometry(0.024, 0.022, 0.70, 16);
const offsets = [
    [-0.52, 0.35, -0.26],
    [0.52, 0.35, -0.26],
    [-0.52, 0.35, 0.26],
    [0.52, 0.35, 0.26]
];
offsets.forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(x, y, z);
    group.add(leg);
    // Taco de goma en la base
    const footGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12);
    const foot = new THREE.Mesh(footGeo, new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 }));
    foot.position.set(x, 0.01, z);
    group.add(foot);
});
`;

    if (hasLaptop) {
        code += `
// 3. Portátil integrado ampliado sobre el escritorio
const lapChassisMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.15 });
const lapKeyboardMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85, metalness: 0.1 });
const lapScreenMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.2 });

// Base del portátil ampliada
const lapBase = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.024, 0.40), lapChassisMat);
lapBase.position.set(0, 0.757, 0.05);
group.add(lapBase);

// Teclado integrado
const lapKeyboard = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.004, 0.17), lapKeyboardMat);
lapKeyboard.position.set(0, 0.771, 0.00);
group.add(lapKeyboard);

// Tapa y pantalla abierta ampliada
const lapLidGroup = new THREE.Group();
lapLidGroup.position.set(0, 0.769, -0.15);
lapLidGroup.rotation.x = -1.90;

const lapLid = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.016, 0.40), lapChassisMat);
lapLid.position.set(0, 0, 0.20);
lapLidGroup.add(lapLid);

const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.34), lapScreenMat);
lapScreen.position.set(0, 0.009, 0.20);
lapScreen.rotation.x = -Math.PI / 2;
lapLidGroup.add(lapScreen);

const lapScreenInner = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.34), lapScreenMat);
lapScreenInner.position.set(0, -0.009, 0.20);
lapScreenInner.rotation.x = Math.PI / 2;
lapLidGroup.add(lapScreenInner);

group.add(lapLidGroup);

// Luz del portátil iluminando el escritorio
const lapLight = new THREE.PointLight(${pal.glow}, 1.15, 2.2);
lapLight.position.set(0, 0.98, 0.02);
group.add(lapLight);
`;
    }

    if (hasLamp) {
        code += `
// 4. Flexo / Lámpara de escritorio
const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16), legMat);
lampBase.position.set(0.42, 0.75, -0.15);
group.add(lampBase);

const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 8), legMat);
lampArm.position.set(0.42, 0.92, -0.15);
lampArm.rotation.z = -0.20;
group.add(lampArm);

const shadeMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, metalness: 0.5, roughness: 0.3 });
const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.10, 16, 1, true), shadeMat);
lampShade.position.set(0.36, 1.05, -0.15);
lampShade.rotation.z = Math.PI / 4;
group.add(lampShade);

const lampLight = new THREE.PointLight(0xffedd5, 1.5, 3.0);
lampLight.position.set(0.34, 1.02, -0.15);
group.add(lampLight);
`;
    }

    code += `\nreturn group;`;

    return {
        name: hasLaptop ? 'Escritorio con Portátil' : 'Mesa de Trabajo',
        icon: '🪑',
        socket: socket || 'rightHand',
        explanation: 'Mesa robusta con tablero amplio, patas metálicas reforzadas' + (hasLaptop ? ' y ordenador portátil abierto.' : '.'),
        code
    };
}

/**
 * 6. SILLA / SILLÓN / SILLA GAMER
 */
function buildChairModel(sem, pal, socket) {
    const isGaming = sem.has('gamer', 'gaming', 'oficina');
    const seatColor = isGaming ? pal.primary : (pal.secondary || '0x422a16');

    const code = `// Silla Ergonómica
const group = new THREE.Group();
group.name = "Silla";

// Materiales
const cushionMat = new THREE.MeshStandardMaterial({ color: ${seatColor}, roughness: 0.65, metalness: 0.1 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.2 });

// 1. Asiento acolchado
const seatGeo = new THREE.BoxGeometry(0.48, 0.08, 0.46);
const seat = new THREE.Mesh(seatGeo, cushionMat);
seat.position.set(0, 0.46, 0);
group.add(seat);

// 2. Respaldo ergonómico
const backGeo = new THREE.BoxGeometry(0.44, 0.56, 0.07);
const back = new THREE.Mesh(backGeo, cushionMat);
back.position.set(0, 0.74, -0.20);
back.rotation.x = -0.08;
group.add(back);

// 3. Pistón o patas
const pistonGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.38, 16);
const piston = new THREE.Mesh(pistonGeo, frameMat);
piston.position.set(0, 0.22, 0);
group.add(piston);

// 4. Base en estrella de 5 radios
const starGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.44, 8);
for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    const arm = new THREE.Mesh(starGeo, frameMat);
    arm.position.set(Math.cos(angle) * 0.18, 0.04, Math.sin(angle) * 0.18);
    arm.rotation.y = angle;
    arm.rotation.z = Math.PI / 2;
    group.add(arm);
}

// 5. Reposabrazos
const armGeo = new THREE.BoxGeometry(0.06, 0.03, 0.32);
const armL = new THREE.Mesh(armGeo, frameMat);
armL.position.set(-0.25, 0.58, 0);
group.add(armL);
const armR = new THREE.Mesh(armGeo, frameMat);
armR.position.set(0.25, 0.58, 0);
group.add(armR);

return group;`;

    return {
        name: isGaming ? 'Silla Gamer' : 'Silla',
        icon: '🪑',
        socket: socket || 'rightHand',
        explanation: 'Silla con respaldo ergonómico, acolchado de confort, reposabrazos y base en estrella.',
        code
    };
}

/**
 * 7. ESTANTERÍA / LIBRERÍA (Con libros alineados de colores)
 */
function buildBookcaseModel(sem, pal, socket) {
    const code = `// Estantería de Madera con Libros
const group = new THREE.Group();
group.name = "Estanteria";

const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.75 });
const bookColors = [0xdc2626, 0x2563eb, 0x16a34a, 0xd97706, 0x7c3aed];

// Estructura: dos paneles verticales y panel trasero
const sideGeo = new THREE.BoxGeometry(0.04, 1.40, 0.34);
const leftSide = new THREE.Mesh(sideGeo, woodMat);
leftSide.position.set(-0.45, 0.70, 0);
group.add(leftSide);

const rightSide = new THREE.Mesh(sideGeo, woodMat);
rightSide.position.set(0.45, 0.70, 0);
group.add(rightSide);

const backGeo = new THREE.BoxGeometry(0.94, 1.40, 0.02);
const back = new THREE.Mesh(backGeo, woodMat);
back.position.set(0, 0.70, -0.16);
group.add(back);

// Baldas horizontales (4 niveles)
const shelfGeo = new THREE.BoxGeometry(0.88, 0.035, 0.32);
const shelfHeights = [0.05, 0.45, 0.85, 1.25, 1.40];
shelfHeights.forEach(h => {
    const shelf = new THREE.Mesh(shelfGeo, woodMat);
    shelf.position.set(0, h, 0);
    group.add(shelf);
});

// Libros en las baldas intermedias
[0.45, 0.85].forEach((h, level) => {
    for (let i = 0; i < 6; i++) {
        const col = bookColors[(i + level * 2) % bookColors.length];
        const bookMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
        const bWidth = 0.04 + (i % 3) * 0.01;
        const bHeight = 0.22 + (i % 2) * 0.04;
        const bookGeo = new THREE.BoxGeometry(bWidth, bHeight, 0.20);
        const book = new THREE.Mesh(bookGeo, bookMat);
        book.position.set(-0.35 + i * 0.065, h + bHeight / 2 + 0.018, 0.02);
        group.add(book);
    }
});

return group;`;

    return {
        name: 'Estantería con Libros',
        icon: '📚',
        socket: socket || 'rightHand',
        explanation: 'Estantería de madera maciza con cuatro niveles y volúmenes de libros organizados.',
        code
    };
}

/**
 * 8. PC SOBREMESA / TORRE / SERVIDOR RACK
 */
function buildDesktopPcOrServerModel(sem, pal, socket) {
    const isRack = sem.has('rack', 'servidor', 'mainframe');
    const code = isRack ? `// Servidor en Rack
const group = new THREE.Group();
group.name = "ServidorRack";

const rackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.9, roughness: 0.2 });
const unitMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.7, roughness: 0.3 });
const ledGreen = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.5 });
const ledAmber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.5 });

// Chasis del rack
const frameGeo = new THREE.BoxGeometry(0.55, 1.20, 0.50);
const frame = new THREE.Mesh(frameGeo, rackMat);
frame.position.set(0, 0.60, 0);
group.add(frame);

// 6 bahías de servidor apiladas
for (let i = 0; i < 6; i++) {
    const y = 0.18 + i * 0.17;
    const unitGeo = new THREE.BoxGeometry(0.50, 0.14, 0.48);
    const unit = new THREE.Mesh(unitGeo, unitMat);
    unit.position.set(0, y, 0.02);
    group.add(unit);

    // Luces de actividad LED
    const led1 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), ledGreen);
    led1.position.set(-0.20, y, 0.26);
    group.add(led1);
    const led2 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), ledAmber);
    led2.position.set(-0.17, y, 0.26);
    group.add(led2);
}

const rackLight = new THREE.PointLight(0x22c55e, 0.8, 2.0);
rackLight.position.set(0, 0.60, 0.30);
group.add(rackLight);

return group;` : `// Torre de Ordenador Gaming
const group = new THREE.Group();
group.name = "TorrePCGaming";

const caseMat = new THREE.MeshStandardMaterial({ color: 0x09090b, metalness: 0.85, roughness: 0.25 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, transparent: true, opacity: 0.45, roughness: 0.05 });
const rgbMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.4 });

// Chasis principal de la torre
const caseGeo = new THREE.BoxGeometry(0.22, 0.46, 0.44);
const pcCase = new THREE.Mesh(caseGeo, caseMat);
pcCase.position.set(0, 0.23, 0);
group.add(pcCase);

// Panel lateral de cristal templado
const glassGeo = new THREE.PlaneGeometry(0.40, 0.42);
const glass = new THREE.Mesh(glassGeo, glassMat);
glass.position.set(0.112, 0.23, 0);
glass.rotation.y = Math.PI / 2;
group.add(glass);

// Ventiladores frontales RGB (3 anillos circulares)
for (let i = 0; i < 3; i++) {
    const fanGeo = new THREE.TorusGeometry(0.045, 0.008, 12, 24);
    const fan = new THREE.Mesh(fanGeo, rgbMat);
    fan.position.set(0, 0.12 + i * 0.11, 0.222);
    group.add(fan);
}

// Luz interior de la torre
const pcLight = new THREE.PointLight(${pal.glow}, 1.2, 2.0);
pcLight.position.set(0, 0.23, 0);
group.add(pcLight);

return group;`;

    return {
        name: isRack ? 'Servidor Rack de Datos' : 'Torre de Ordenador',
        icon: isRack ? '🗄️' : '🖥️',
        socket: socket || 'rightHand',
        explanation: isRack ? 'Unidad de servidor profesional en rack con bahías extraíbles e indicadores LED.' : 'Torre de ordenador gaming con lateral de cristal y ventiladores frontales iluminados.',
        code
    };
}

/**
 * 9. MONITOR / PANTALLA
 */
function buildMonitorModel(sem, pal, socket) {
    const isUltraWide = sem.has('ultrawide', 'panoramica', 'curvo');
    const width = isUltraWide ? 0.72 : 0.52;

    const code = `// Monitor de Alta Resolución
const group = new THREE.Group();
group.name = "MonitorDisplay";

const frameMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.8, roughness: 0.3 });
const standMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.15 });
const displayMat = new THREE.MeshStandardMaterial({ 
    color: ${pal.glow}, 
    emissive: ${pal.primary}, 
    emissiveIntensity: 1.15, 
    roughness: 0.08 
});

// Marco del panel
const panelGeo = new THREE.BoxGeometry(${width}, 0.32, 0.025);
const panel = new THREE.Mesh(panelGeo, frameMat);
panel.position.set(0, 0.34, 0);
group.add(panel);

// Pantalla activa emisiva
const screenGeo = new THREE.PlaneGeometry(${width - 0.03}, 0.29);
const screen = new THREE.Mesh(screenGeo, displayMat);
screen.position.set(0, 0.34, 0.013);
group.add(screen);

// Soporte vertical
const standGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.26, 16);
const stand = new THREE.Mesh(standGeo, standMat);
stand.position.set(0, 0.16, -0.04);
group.add(stand);

// Base de apoyo en 'V' o rectangular
const baseGeo = new THREE.BoxGeometry(0.24, 0.014, 0.18);
const base = new THREE.Mesh(baseGeo, standMat);
base.position.set(0, 0.01, 0.02);
group.add(base);

const light = new THREE.PointLight(${pal.glow}, 1.0, 2.0);
light.position.set(0, 0.34, 0.15);
group.add(light);

return group;`;

    return {
        name: isUltraWide ? 'Monitor Panorámico Ultrawide' : 'Monitor de Pantalla',
        icon: '🖥️',
        socket: socket || 'rightHand',
        explanation: 'Monitor estilizado con marco extrafino, pie metálico y pantalla digital luminosa.',
        code
    };
}

/**
 * 10. DRON / ROBOT
 */
function buildDroneModel(sem, pal, socket) {
    const code = `// Dron Cuadricóptero Táctico
const group = new THREE.Group();
group.name = "DronCuadricoptero";

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
const rotorMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, metalness: 0.9, roughness: 0.15 });
const sensorMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.5 });

// Chasis aerodinámico central
const coreGeo = new THREE.SphereGeometry(0.09, 16, 12);
coreGeo.scale(1.2, 0.5, 1.2);
const core = new THREE.Mesh(coreGeo, bodyMat);
core.position.set(0, 0.12, 0);
group.add(core);

// Cámara frontal / sensor gimbal
const camGeo = new THREE.SphereGeometry(0.035, 12, 12);
const cam = new THREE.Mesh(camGeo, sensorMat);
cam.position.set(0, 0.10, 0.11);
group.add(cam);

// 4 brazos con motores y hélices
const armOffsets = [
    [0.15, 0.12, 0.15],
    [-0.15, 0.12, 0.15],
    [0.15, 0.12, -0.15],
    [-0.15, 0.12, -0.15]
];

armOffsets.forEach(([x, y, z]) => {
    // Brazo de fibra
    const armGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8);
    const arm = new THREE.Mesh(armGeo, bodyMat);
    arm.position.set(x / 2, y, z / 2);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z).normalize());
    group.add(arm);

    // Motor pod
    const podGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.035, 12);
    const pod = new THREE.Mesh(podGeo, bodyMat);
    pod.position.set(x, y + 0.01, z);
    group.add(pod);

    // Hélice
    const bladeGeo = new THREE.BoxGeometry(0.14, 0.004, 0.016);
    const blade = new THREE.Mesh(bladeGeo, rotorMat);
    blade.position.set(x, y + 0.03, z);
    blade.rotation.y = Math.PI / 4;
    group.add(blade);
});

// Luz de posición
const navLight = new THREE.PointLight(${pal.glow}, 1.2, 2.5);
navLight.position.set(0, 0.16, 0);
group.add(navLight);

return group;`;

    return {
        name: 'Dron Cuadricóptero',
        icon: '🛸',
        socket: socket || 'rightHand',
        explanation: 'Dron cuadricóptero con cuatro brazos de sustentación, rotor helicoidal y sensor frontal óptico.',
        code
    };
}

/**
 * 11. ANTENA / RADAR / PARABÓLICA
 */
function buildAntennaModel(sem, pal, socket) {
    const code = `// Antena Parabólica / Radar
const group = new THREE.Group();
group.name = "AntenaParabolica";

const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.2 });
const dishMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.4, roughness: 0.3 });
const glowMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.2 });

// Trípode de base
const baseGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 12);
const pole = new THREE.Mesh(baseGeo, steelMat);
pole.position.set(0, 0.22, 0);
group.add(pole);

for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.30, 8), steelMat);
    leg.position.set(Math.cos(angle) * 0.12, 0.10, Math.sin(angle) * 0.12);
    leg.rotation.y = angle;
    leg.rotation.z = 0.55;
    group.add(leg);
}

// Plato parabólico
const dishGeo = new THREE.SphereGeometry(0.24, 24, 16, 0, Math.PI * 2, 0, Math.PI / 3);
const dish = new THREE.Mesh(dishGeo, dishMat);
dish.position.set(0, 0.46, 0);
dish.rotation.x = Math.PI / 4;
group.add(dish);

// Alimentador focal central
const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.018, 0.16, 12), glowMat);
horn.position.set(0, 0.54, 0.10);
horn.rotation.x = -Math.PI / 4;
group.add(horn);

return group;`;

    return {
        name: 'Antena Parabólica',
        icon: '📡',
        socket: socket || 'rightHand',
        explanation: 'Antena de telecomunicaciones con plato receptor parabólico, mástil articulado y captador focal.',
        code
    };
}

/**
 * 12. FAROLA DE CALLE / PARQUE
 */
function buildStreetlightModel(sem, pal, socket) {
    const code = `// Farola Urbana de Iluminación
const group = new THREE.Group();
group.name = "FarolaUrbana";

const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.85, roughness: 0.3 });
const glassMat = new THREE.MeshStandardMaterial({ 
    color: 0xffedd5, 
    emissive: 0xf59e0b, 
    emissiveIntensity: 1.4, 
    transparent: true, 
    opacity: 0.85 
});

// Pedestal de forja en el suelo
const baseGeo = new THREE.CylinderGeometry(0.08, 0.14, 0.20, 16);
const base = new THREE.Mesh(baseGeo, ironMat);
base.position.set(0, 0.10, 0);
group.add(base);

// Poste esbelto vertical
const poleGeo = new THREE.CylinderGeometry(0.03, 0.045, 1.40, 16);
const pole = new THREE.Mesh(poleGeo, ironMat);
pole.position.set(0, 0.85, 0);
group.add(pole);

// Brazo curvado superior
const armGeo = new THREE.TorusGeometry(0.18, 0.022, 12, 24, Math.PI / 1.5);
const arm = new THREE.Mesh(armGeo, ironMat);
arm.position.set(0.12, 1.55, 0);
arm.rotation.z = -0.5;
group.add(arm);

// Farol / Linterna con cristal
const lanternGeo = new THREE.CylinderGeometry(0.08, 0.05, 0.18, 6);
const lantern = new THREE.Mesh(lanternGeo, glassMat);
lantern.position.set(0.24, 1.52, 0);
group.add(lantern);

// Cubierta del farol
const capGeo = new THREE.ConeGeometry(0.11, 0.08, 6);
const cap = new THREE.Mesh(capGeo, ironMat);
cap.position.set(0.24, 1.63, 0);
group.add(cap);

// Luz cálida omnidireccional
const light = new THREE.PointLight(0xf59e0b, 2.0, 6.0);
light.position.set(0.24, 1.52, 0);
group.add(light);

return group;`;

    return {
        name: 'Farola Urbana',
        icon: '🏮',
        socket: socket || 'rightHand',
        explanation: 'Farola clásica de forja con brazo decorativo superior y farol luminoso cálido.',
        code
    };
}

/**
 * 13. LÁMPARA / FLEXO
 */
function buildLampModel(sem, pal, socket) {
    const code = `// Lámpara de Mesa / Flexo
const group = new THREE.Group();
group.name = "LamparaFlexo";

const metalMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, metalness: 0.7, roughness: 0.2 });
const glowMat = new THREE.MeshStandardMaterial({ color: 0xffedd5, emissive: 0xfbbf24, emissiveIntensity: 1.6 });

// Base
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.025, 24), metalMat);
base.position.set(0, 0.012, 0);
group.add(base);

// Brazo articulado inferior
const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 12), metalMat);
arm1.position.set(0, 0.15, 0.04);
arm1.rotation.x = -0.35;
group.add(arm1);

// Brazo articulado superior
const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 12), metalMat);
arm2.position.set(0, 0.32, -0.04);
arm2.rotation.x = 0.55;
group.add(arm2);

// Campana reflectora
const shade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 24, 1, true), metalMat);
shade.position.set(0, 0.40, 0.08);
shade.rotation.x = -Math.PI / 3;
group.add(shade);

// Bombilla incandescente
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), glowMat);
bulb.position.set(0, 0.38, 0.08);
group.add(bulb);

const light = new THREE.PointLight(0xffedd5, 1.8, 3.5);
light.position.set(0, 0.38, 0.08);
group.add(light);

return group;`;

    return {
        name: 'Lámpara Flexo',
        icon: '💡',
        socket: socket || 'rightHand',
        explanation: 'Flexo de diseño articulado con base lastrada, campana reflectora y bombilla luminosa.',
        code
    };
}

/**
 * 14. BARRIL / BIDÓN
 */
function buildBarrelModel(sem, pal, socket) {
    const isOilDrum = sem.has('petroleo', 'aceite', 'metalico', 'toxico');
    const color = isOilDrum ? pal.primary : '0x6e4726';

    const code = `// Barril / Tonel Tridimensional
const group = new THREE.Group();
group.name = "Barril";

const bodyMat = new THREE.MeshStandardMaterial({ 
    color: ${color}, 
    roughness: ${isOilDrum ? '0.35' : '0.8'}, 
    metalness: ${isOilDrum ? '0.75' : '0.1'} 
});
const hoopMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.9, roughness: 0.25 });

// Cuerpo curvado del barril
const barrelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.65, 24);
const barrel = new THREE.Mesh(barrelGeo, bodyMat);
barrel.position.set(0, 0.325, 0);
group.add(barrel);

// Flejes metálicos de refuerzo (hoops)
[-0.22, -0.08, 0.08, 0.22].forEach(yOffset => {
    const ringGeo = new THREE.TorusGeometry(0.245, 0.012, 12, 24);
    const ring = new THREE.Mesh(ringGeo, hoopMat);
    ring.position.set(0, 0.325 + yOffset, 0);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
});

return group;`;

    return {
        name: isOilDrum ? 'Bidón de Combustible' : 'Barril de Madera',
        icon: '🛢️',
        socket: socket || 'rightHand',
        explanation: 'Barril cilíndrico estriado reforzado mediante aros metálicos de sujeción.',
        code
    };
}

/**
 * 15. CAJA / COFRE / BAÚL
 */
function buildCrateOrChestModel(sem, pal, socket) {
    const isChest = sem.has('cofre', 'baul', 'arcon', 'tesoro');

    const code = isChest ? `// Cofre del Tesoro con Cerrojo
const group = new THREE.Group();
group.name = "CofreTesoro";

const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });

// Cuerpo inferior del cofre
const bodyGeo = new THREE.BoxGeometry(0.50, 0.30, 0.34);
const body = new THREE.Mesh(bodyGeo, woodMat);
body.position.set(0, 0.15, 0);
group.add(body);

// Tapa abovedada semicilíndrica
const lidGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.50, 16, 1, false, 0, Math.PI);
const lid = new THREE.Mesh(lidGeo, woodMat);
lid.position.set(0, 0.30, 0);
lid.rotation.z = Math.PI / 2;
lid.rotation.x = -Math.PI / 2;
group.add(lid);

// Cerrojo frontal de oro
const lockGeo = new THREE.BoxGeometry(0.06, 0.08, 0.03);
const lock = new THREE.Mesh(lockGeo, goldMat);
lock.position.set(0, 0.25, 0.18);
group.add(lock);

return group;` : `// Caja de Madera Reforzada
const group = new THREE.Group();
group.name = "CajaMadera";

const woodMat = new THREE.MeshStandardMaterial({ color: 0x78512e, roughness: 0.85 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.8, roughness: 0.3 });

// Cubo principal
const boxGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
const box = new THREE.Mesh(boxGeo, woodMat);
box.position.set(0, 0.22, 0);
group.add(box);

// Listones diagonales de refuerzo
const braceGeo = new THREE.BoxGeometry(0.48, 0.04, 0.015);
const brace1 = new THREE.Mesh(braceGeo, trimMat);
brace1.position.set(0, 0.22, 0.225);
brace1.rotation.z = Math.PI / 4;
group.add(brace1);

return group;`;

    return {
        name: isChest ? 'Cofre de Aventuras' : 'Caja de Suministros',
        icon: isChest ? '🪙' : '📦',
        socket: socket || 'rightHand',
        explanation: isChest ? 'Cofre con tapa curva abovedada, herrajes protectores y cerradura dorada.' : 'Caja de transporte con travesaños diagonales de protección en las caras.',
        code
    };
}

/**
 * 16. HERRAMIENTAS MANUALES (LINTERNA, LLAVE INGLESA, DESTORNILLADOR, LUPA)
 */
function buildFlashlightModel(sem, pal, socket) {
    const code = `// Linterna Táctica
const group = new THREE.Group();
group.name = "LinternaTactica";

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.85, roughness: 0.3 });
const gripMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, roughness: 0.8 });
const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf8fafc, emissiveIntensity: 1.8 });

// Tubo principal
const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.26, 16), bodyMat);
tube.position.set(0, 0.13, 0);
group.add(tube);

// Empuñadura moleteada
const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 16), gripMat);
grip.position.set(0, 0.10, 0);
group.add(grip);

// Cabezal biselado
const head = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.026, 0.08, 16), bodyMat);
head.position.set(0, 0.28, 0);
group.add(head);

// Lente frontal emisiva
const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), lensMat);
lens.position.set(0, 0.321, 0);
lens.rotation.x = -Math.PI / 2;
group.add(lens);

// Foco de luz
const light = new THREE.PointLight(0xffffff, 2.0, 5.0);
light.position.set(0, 0.35, 0);
group.add(light);

return group;`;

    return {
        name: 'Linterna Táctica',
        icon: '🔦',
        socket: socket || 'rightHand',
        explanation: 'Linterna de mano con cuerpo cilíndrico estriado, cabezal reflector y haz luminoso frontal.',
        code
    };
}

function buildWrenchModel(sem, pal, socket) {
    const code = `// Llave Inglesa Ajustable
const group = new THREE.Group();
group.name = "LlaveInglesa";

const steelMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.92, roughness: 0.12 });
const dialMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.4 });

// Mango
const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.015), steelMat);
handle.position.set(0, 0.16, 0);
group.add(handle);

// Cabezal fijo
const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.025), steelMat);
head.position.set(0, 0.34, 0);
group.add(head);

// Mordaza fija y móvil
const jaw1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.02), steelMat);
jaw1.position.set(-0.03, 0.39, 0);
group.add(jaw1);

const jaw2 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.02), steelMat);
jaw2.position.set(0.03, 0.39, 0);
group.add(jaw2);

// Rosca sin fin de ajuste
const worm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.04, 12), dialMat);
worm.position.set(0, 0.32, 0.01);
worm.rotation.z = Math.PI / 2;
group.add(worm);

return group;`;

    return {
        name: 'Llave Inglesa',
        icon: '🔧',
        socket: socket || 'rightHand',
        explanation: 'Llave de acero forjado con mordaza regulable y tornillo sin fin central.',
        code
    };
}

function buildScrewdriverModel(sem, pal, socket) {
    const code = `// Destornillador Ergonómico
const group = new THREE.Group();
group.name = "Destornillador";

const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });
const gripMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, roughness: 0.4 });
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });

// Mango ergonómico estriado
const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.16, 12), gripMat);
handle.position.set(0, 0.08, 0);
group.add(handle);

// Bandas antideslizantes
for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.004, 8, 16), rubberMat);
    rib.position.set(0, 0.03 + i * 0.035, 0);
    rib.rotation.x = Math.PI / 2;
    group.add(rib);
}

// Vástago de acero
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.20, 12), steelMat);
shaft.position.set(0, 0.24, 0);
group.add(shaft);

// Punta de atornillado
const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.003), steelMat);
tip.position.set(0, 0.34, 0);
group.add(tip);

return group;`;

    return {
        name: 'Destornillador',
        icon: '🪛',
        socket: socket || 'rightHand',
        explanation: 'Destornillador de precisión con mango bimateria texturizado y punta de acero cromado.',
        code
    };
}

function buildMagnifyingGlassModel(sem, pal, socket) {
    const code = `// Lupa de Aumento
const group = new THREE.Group();
group.name = "LupaAumento";

const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.2 });
const handleMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
const lensMat = new THREE.MeshPhysicalMaterial({ 
    color: 0xffffff, 
    transparent: true, 
    opacity: 0.45, 
    roughness: 0.05, 
    transmission: 0.9 
});

// Mango
const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.20, 16), handleMat);
handle.position.set(0, 0.10, 0);
group.add(handle);

// Aro de la lente
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 16, 32), frameMat);
rim.position.set(0, 0.32, 0);
group.add(rim);

// Cristal de aumento
const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.01, 24), lensMat);
lens.position.set(0, 0.32, 0);
group.add(lens);

return group;`;

    return {
        name: 'Lupa de Mano',
        icon: '🔍',
        socket: socket || 'rightHand',
        explanation: 'Lupa con montura dorada, lente convexa de cristal transparente y mango de madera.',
        code
    };
}

/**
 * 17. ELEMENTOS DE NATURALEZA (ÁRBOL, ROCA, HOGUERA)
 */
function buildTreeModel(sem, pal, socket) {
    const code = `// Árbol Frondoso
const group = new THREE.Group();
group.name = "ArbolFrondoso";

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });
const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });

// Tronco
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.70, 12), trunkMat);
trunk.position.set(0, 0.35, 0);
group.add(trunk);

// Tres niveles de copa esférica
const foliageLevels = [
    { y: 0.75, r: 0.36 },
    { y: 0.98, r: 0.28 },
    { y: 1.18, r: 0.20 }
];
foliageLevels.forEach(({ y, r }) => {
    const fol = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), foliageMat);
    fol.position.set(0, y, 0);
    group.add(fol);
});

return group;`;

    return {
        name: 'Árbol',
        icon: '🌳',
        socket: socket || 'rightHand',
        explanation: 'Árbol orgánico con tronco leñoso cónico y copa de follaje escalonada.',
        code
    };
}

function buildRockModel(sem, pal, socket) {
    const code = `// Roca Mineral Facetada
const group = new THREE.Group();
group.name = "RocaMineral";

const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.15 });
const rockGeo = new THREE.DodecahedronGeometry(0.35, 1);
const rock = new THREE.Mesh(rockGeo, rockMat);
rock.position.set(0, 0.30, 0);
rock.scale.set(1.2, 0.8, 1.0);
group.add(rock);

return group;`;

    return {
        name: 'Roca',
        icon: '🪨',
        socket: socket || 'rightHand',
        explanation: 'Roca natural con volumen facetado irregular y superficie pétrea.',
        code
    };
}

function buildCampfireModel(sem, pal, socket) {
    const code = `// Hoguera con Brasas Encendidas
const group = new THREE.Group();
group.name = "HogueraCampamento";

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
const logMat = new THREE.MeshStandardMaterial({ color: 0x3f2314, roughness: 0.9 });
const fireMat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xef4444, emissiveIntensity: 2.0 });

// Círculo de piedras en la base
for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), stoneMat);
    stone.position.set(Math.cos(angle) * 0.22, 0.05, Math.sin(angle) * 0.22);
    group.add(stone);
}

// Leños cruzados
for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 4;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), logMat);
    log.position.set(0, 0.08, 0);
    log.rotation.y = angle;
    log.rotation.z = 0.25;
    group.add(log);
}

// Llama central estilizada
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 8), fireMat);
flame.position.set(0, 0.20, 0);
group.add(flame);

const fireLight = new THREE.PointLight(0xf97316, 2.5, 4.0);
fireLight.position.set(0, 0.25, 0);
group.add(fireLight);

return group;`;

    return {
        name: 'Hoguera de Campamento',
        icon: '🔥',
        socket: socket || 'rightHand',
        explanation: 'Hoguera con círculo perimetral de piedras, leños de madera y llama luminosa parpadeante.',
        code
    };
}

/**
 * 18. CARTELES, PUERTAS Y ENTORNO
 */
function buildSignpostModel(sem, pal, socket) {
    const code = `// Poste con Carteles Indicadores
const group = new THREE.Group();
group.name = "PosteIndicador";

const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });
const signMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });

// Poste vertical
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.20, 12), woodMat);
post.position.set(0, 0.60, 0);
group.add(post);

// Dos flechas indicadoras en diferentes direcciones
const arrow1 = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.02), signMat);
arrow1.position.set(0.12, 0.95, 0);
arrow1.rotation.y = 0.2;
group.add(arrow1);

const arrow2 = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.02), signMat);
arrow2.position.set(-0.12, 0.78, 0);
arrow2.rotation.y = -0.4;
group.add(arrow2);

return group;`;

    return {
        name: 'Poste con Señales',
        icon: '🪧',
        socket: socket || 'rightHand',
        explanation: 'Poste rústico con dos flechas indicadoras de camino en madera tallada.',
        code
    };
}

function buildDoorModel(sem, pal, socket) {
    const code = `// Puerta con Marco y Picaporte
const group = new THREE.Group();
group.name = "PuertaMadera";

const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.75 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });

// Marco exterior
const frame = new THREE.Mesh(new THREE.BoxGeometry(0.74, 1.44, 0.08), new THREE.MeshStandardMaterial({ color: 0x3f2314 }));
frame.position.set(0, 0.72, 0);
group.add(frame);

// Hoja de la puerta
const door = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.36, 0.04), woodMat);
door.position.set(0, 0.72, 0.01);
group.add(door);

// Picaporte de latón
const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 12), brassMat);
handle.position.set(0.24, 0.72, 0.05);
handle.rotation.z = Math.PI / 2;
group.add(handle);

return group;`;

    return {
        name: 'Puerta',
        icon: '🚪',
        socket: socket || 'rightHand',
        explanation: 'Puerta de madera enmarcada con picaporte dorado de latón pulido.',
        code
    };
}

function buildBedModel(sem, pal, socket) {
    const code = `// Cama con Almohada
const group = new THREE.Group();
group.name = "Cama";

const frameMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
const mattressMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
const blanketMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, roughness: 0.6 });

// Cabecero
const headboard = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.55, 0.06), frameMat);
headboard.position.set(0, 0.35, -0.65);
group.add(headboard);

// Estructura y colchón
const bed = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.25, 1.30), mattressMat);
bed.position.set(0, 0.16, 0);
group.add(bed);

// Manta / edredón
const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.69, 0.05, 0.85), blanketMat);
blanket.position.set(0, 0.28, 0.20);
group.add(blanket);

// Almohada
const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.24), mattressMat);
pillow.position.set(0, 0.32, -0.45);
group.add(pillow);

return group;`;

    return {
        name: 'Cama',
        icon: '🛏️',
        socket: socket || 'rightHand',
        explanation: 'Cama individual con cabecero de madera, colchón, almohada y edredón.',
        code
    };
}

function buildPotionOrBottleModel(sem, pal, socket) {
    const isDrink = sem.has('birra', 'lata', 'taza', 'vaso');

    if (isDrink) {
        return {
            name: 'Bebida / Lata',
            icon: '🥤',
            socket: socket || 'rightHand',
            explanation: 'Lata metálica de bebida con anillo superior de apertura.',
            code: `// Lata de Bebida
const group = new THREE.Group();
group.name = "LataBebida";

const canMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, metalness: 0.85, roughness: 0.2 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.95, roughness: 0.1 });

const can = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 24), canMat);
can.position.set(0, 0.08, 0);
group.add(can);

const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.005, 12, 24), rimMat);
topRim.position.set(0, 0.16, 0);
topRim.rotation.x = Math.PI / 2;
group.add(topRim);

return group;`
        };
    }

    return buildPotionModel(sem.normalized, pal, socket);
}

/* ======================================================
   BUILDERS PROCEDURALES CLÁSICOS (EQUIPO DE AVENTURA)
   ====================================================== */

function buildSwordModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '⚔️',
        socket: socket || 'rightHand',
        explanation: 'Espada de combate con empuñadura forjada, guarda protectora y hoja de plasma o acero templado.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "EspadaGenerada";

const steelMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95, roughness: 0.1 });
const energyMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.5, roughness: 0.2 });
const gripMat = new THREE.MeshStandardMaterial({ color: ${pal.secondary}, roughness: 0.6 });
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });

const bladeGeo = new THREE.BoxGeometry(0.045, 0.78, 0.015);
const blade = new THREE.Mesh(bladeGeo, energyMat);
blade.position.set(0, 0.44, 0);
group.add(blade);

const tipGeo = new THREE.ConeGeometry(0.038, 0.12, 4);
const tip = new THREE.Mesh(tipGeo, energyMat);
tip.position.set(0, 0.89, 0);
tip.rotation.y = Math.PI / 4;
group.add(tip);

const guardGeo = new THREE.BoxGeometry(0.24, 0.03, 0.04);
const guard = new THREE.Mesh(guardGeo, goldMat);
guard.position.set(0, 0.05, 0);
group.add(guard);

const hiltGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.18, 16);
const hilt = new THREE.Mesh(hiltGeo, gripMat);
hilt.position.set(0, -0.06, 0);
group.add(hilt);

const pommelGeo = new THREE.SphereGeometry(0.032, 16, 16);
const pommel = new THREE.Mesh(pommelGeo, goldMat);
pommel.position.set(0, -0.17, 0);
group.add(pommel);

const light = new THREE.PointLight(${pal.glow}, 1.2, 2.5);
light.position.set(0, 0.45, 0);
group.add(light);

return group;`
    };
}

function buildAxeOrHammerModel(text, pal, socket) {
    const isHammer = text.includes('martillo') || text.includes('maza');
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: isHammer ? '🔨' : '🪓',
        socket: socket || 'rightHand',
        explanation: isHammer ? 'Martillo pesado con cabeza de impacto reforzada y mango engomado.' : 'Hacha forjada con filo curvado cortante y mango de fresno reforzado.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "ArmaContundente";

const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.7 });

const handleGeo = new THREE.CylinderGeometry(0.02, 0.024, 0.75, 16);
const handle = new THREE.Mesh(handleGeo, woodMat);
handle.position.set(0, 0.20, 0);
group.add(handle);

${isHammer ? `
const headGeo = new THREE.BoxGeometry(0.18, 0.12, 0.12);
const head = new THREE.Mesh(headGeo, metalMat);
head.position.set(0, 0.54, 0);
group.add(head);

const trimGeo = new THREE.BoxGeometry(0.20, 0.14, 0.04);
const trim = new THREE.Mesh(trimGeo, goldMat);
trim.position.set(0, 0.54, 0);
group.add(trim);
` : `
const bladeGeo = new THREE.BoxGeometry(0.24, 0.20, 0.02);
const blade = new THREE.Mesh(bladeGeo, metalMat);
blade.position.set(0.10, 0.52, 0);
group.add(blade);

const spineGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12);
const spine = new THREE.Mesh(spineGeo, goldMat);
spine.position.set(0, 0.52, 0);
group.add(spine);
`}

return group;`
    };
}

function buildShieldModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🛡️',
        socket: socket || 'leftHand',
        explanation: 'Escudo protector abovedado con umbo central reforzado y bordura metálica dorada.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "EscudoGenerado";

const shieldMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, roughness: 0.35, metalness: 0.5 });
const rimMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });
const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

const plateGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24);
const plate = new THREE.Mesh(plateGeo, shieldMat);
plate.rotation.x = Math.PI / 2;
group.add(plate);

const rimGeo = new THREE.TorusGeometry(0.32, 0.025, 16, 32);
const rim = new THREE.Mesh(rimGeo, rimMat);
group.add(rim);

const bossGeo = new THREE.SphereGeometry(0.09, 16, 16);
const boss = new THREE.Mesh(bossGeo, rimMat);
boss.position.set(0, 0, 0.03);
group.add(boss);

const strapGeo = new THREE.TorusGeometry(0.10, 0.015, 8, 16, Math.PI);
const strap = new THREE.Mesh(strapGeo, handleMat);
strap.position.set(0, 0, -0.04);
group.add(strap);

return group;`
    };
}

function buildTorchModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🏮',
        socket: socket || 'rightHand',
        explanation: 'Antorcha con mango de madera tallada, cazoleta dorada y llama mágica emisiva con punto de luz real.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "AntorchaGenerada";

const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.75 });
const brassMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.85, roughness: 0.25 });
const flameMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 2.2, roughness: 0.1 });

const stickGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.65, 12);
const stick = new THREE.Mesh(stickGeo, woodMat);
stick.position.set(0, 0.10, 0);
group.add(stick);

const bowlGeo = new THREE.CylinderGeometry(0.07, 0.03, 0.10, 12);
const bowl = new THREE.Mesh(bowlGeo, brassMat);
bowl.position.set(0, 0.44, 0);
group.add(bowl);

const flameGeo = new THREE.ConeGeometry(0.065, 0.18, 12);
const flame = new THREE.Mesh(flameGeo, flameMat);
flame.position.set(0, 0.54, 0);
group.add(flame);

const light = new THREE.PointLight(0xff7700, 2.0, 4.0);
light.position.set(0, 0.55, 0);
group.add(light);

return group;`
    };
}

function buildStaffModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🔮',
        socket: socket || 'rightHand',
        explanation: 'Báculo arcano rematado con un orbe de cristal reluciente y aros de sujeción rúnicos.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "BaculoArcano";

const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.7 });
const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });
const orbMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.8, roughness: 0.1 });

const shaftGeo = new THREE.CylinderGeometry(0.02, 0.025, 1.15, 16);
const shaft = new THREE.Mesh(shaftGeo, woodMat);
shaft.position.set(0, 0.40, 0);
group.add(shaft);

const cradleGeo = new THREE.TorusGeometry(0.08, 0.015, 12, 24);
const cradle = new THREE.Mesh(cradleGeo, goldMat);
cradle.position.set(0, 1.00, 0);
cradle.rotation.x = Math.PI / 2;
group.add(cradle);

const orbGeo = new THREE.SphereGeometry(0.065, 24, 24);
const orb = new THREE.Mesh(orbGeo, orbMat);
orb.position.set(0, 1.05, 0);
group.add(orb);

const light = new THREE.PointLight(${pal.glow}, 1.5, 3.0);
light.position.set(0, 1.05, 0);
group.add(light);

return group;`
    };
}

function buildRadioModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '📻',
        socket: socket || 'back',
        explanation: 'Dispositivo transceptor militar con antena telescópica flexible, altavoz de rejilla y diales analógicos.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "RadioTransceptor";

const bodyMat = new THREE.MeshStandardMaterial({ color: ${pal.secondary}, roughness: 0.4, metalness: 0.6 });
const screenMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.2, roughness: 0.2 });
const knobMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
const antennaMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 });

const boxGeo = new THREE.BoxGeometry(0.18, 0.26, 0.10);
const box = new THREE.Mesh(boxGeo, bodyMat);
group.add(box);

const screenGeo = new THREE.PlaneGeometry(0.12, 0.08);
const screen = new THREE.Mesh(screenGeo, screenMat);
screen.position.set(0, 0.05, 0.051);
group.add(screen);

const knobGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16);
const knob1 = new THREE.Mesh(knobGeo, knobMat);
knob1.position.set(-0.04, -0.06, 0.052);
knob1.rotation.x = Math.PI / 2;
group.add(knob1);

const knob2 = new THREE.Mesh(knobGeo, knobMat);
knob2.position.set(0.04, -0.06, 0.052);
knob2.rotation.x = Math.PI / 2;
group.add(knob2);

const antGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.45, 12);
const ant = new THREE.Mesh(antGeo, antennaMat);
ant.position.set(0.06, 0.32, 0);
group.add(ant);

return group;`
    };
}

function buildBackpackModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🎒',
        socket: socket || 'back',
        explanation: 'Mochila técnica de supervivencia con múltiples compartimentos, correas reforzadas y hebillas doradas.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "MochilaSupervivencia";

const fabricMat = new THREE.MeshStandardMaterial({ color: ${pal.primary}, roughness: 0.85 });
const strapMat = new THREE.MeshStandardMaterial({ color: ${pal.secondary}, roughness: 0.9 });
const buckleMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.9, roughness: 0.2 });

const mainGeo = new THREE.BoxGeometry(0.28, 0.38, 0.18);
const mainBody = new THREE.Mesh(mainGeo, fabricMat);
group.add(mainBody);

const pocketGeo = new THREE.BoxGeometry(0.20, 0.18, 0.08);
const pocket = new THREE.Mesh(pocketGeo, fabricMat);
pocket.position.set(0, -0.06, 0.12);
group.add(pocket);

const rollGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.32, 16);
const bedroll = new THREE.Mesh(rollGeo, strapMat);
bedroll.position.set(0, 0.22, 0);
bedroll.rotation.z = Math.PI / 2;
group.add(bedroll);

const strapGeo = new THREE.BoxGeometry(0.04, 0.36, 0.015);
const strapL = new THREE.Mesh(strapGeo, strapMat);
strapL.position.set(-0.09, 0, -0.095);
group.add(strapL);

const strapR = new THREE.Mesh(strapGeo, strapMat);
strapR.position.set(0.09, 0, -0.095);
group.add(strapR);

return group;`
    };
}

function buildPotionModel(text, pal, socket) {
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: '🧪',
        socket: socket || 'rightHand',
        explanation: 'Frasco de alquimia con líquido brillante, corcho tallado y brillo mágico.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "PocionAlquimica";

const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.1 });
const liquidMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.4, roughness: 0.2 });
const corkMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 });

const bulbGeo = new THREE.SphereGeometry(0.11, 24, 24);
const bulb = new THREE.Mesh(bulbGeo, glassMat);
group.add(bulb);

const liquidGeo = new THREE.SphereGeometry(0.098, 16, 16);
const liquid = new THREE.Mesh(liquidGeo, liquidMat);
liquid.position.set(0, -0.01, 0);
group.add(liquid);

const neckGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.09, 16);
const neck = new THREE.Mesh(neckGeo, glassMat);
neck.position.set(0, 0.12, 0);
group.add(neck);

const corkGeo = new THREE.CylinderGeometry(0.032, 0.028, 0.04, 16);
const cork = new THREE.Mesh(corkGeo, corkMat);
cork.position.set(0, 0.17, 0);
group.add(cork);

const light = new THREE.PointLight(${pal.glow}, 1.0, 2.0);
group.add(light);

return group;`
    };
}

function buildHelmetOrHatModel(text, pal, socket) {
    const isCrown = text.includes('corona') || text.includes('tiara');
    return {
        name: capitalizeWords(text.slice(0, 24)),
        icon: isCrown ? '👑' : '🪖',
        socket: socket || 'head',
        explanation: isCrown ? 'Corona imperial con puntas doradas y engaste de gemas resplandecientes.' : 'Casco de combate reforzado con visor frontal y protección lateral.',
        code: `// ${capitalizeWords(text.slice(0, 30))}
const group = new THREE.Group();
group.name = "PrendaCabeza";

const goldMat = new THREE.MeshStandardMaterial({ color: ${pal.accent}, metalness: 0.95, roughness: 0.15 });
const gemMat = new THREE.MeshStandardMaterial({ color: ${pal.glow}, emissive: ${pal.primary}, emissiveIntensity: 1.6, roughness: 0.1 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.25 });

${isCrown ? `
const baseGeo = new THREE.CylinderGeometry(0.16, 0.15, 0.08, 24, 1, true);
const base = new THREE.Mesh(baseGeo, goldMat);
group.add(base);

for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    const spikeGeo = new THREE.ConeGeometry(0.03, 0.10, 4);
    const spike = new THREE.Mesh(spikeGeo, goldMat);
    spike.position.set(Math.cos(angle) * 0.155, 0.08, Math.sin(angle) * 0.155);
    group.add(spike);

    const gemGeo = new THREE.SphereGeometry(0.016, 12, 12);
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.position.set(Math.cos(angle) * 0.158, 0.04, Math.sin(angle) * 0.158);
    group.add(gem);
}
` : `
const domeGeo = new THREE.SphereGeometry(0.18, 24, 16, 0, Math.PI * 2, 0, Math.PI / 1.7);
const dome = new THREE.Mesh(domeGeo, metalMat);
group.add(dome);

const visorGeo = new THREE.BoxGeometry(0.18, 0.04, 0.08);
const visor = new THREE.Mesh(visorGeo, gemMat);
visor.position.set(0, 0.02, 0.14);
group.add(visor);
`}

return group;`
    };
}

/**
 * 19. FALLBACK INTELIGENTE DINÁMICO
 * Si ninguna regla semántica coincide, genera un pedestal de artefacto rúnico
 * o monolito tecnológico en lugar de la molesta esfera con aros.
 */
function buildSmartDynamicArtifactModel(sem, pal, socket) {
    const title = capitalizeWords(sem.original.slice(0, 24));
    return {
        name: title,
        icon: pickIconForPrompt(sem.normalized),
        socket: socket || 'rightHand',
        explanation: 'Estructura modular procedural con pedestal tallado, prisma de resonancia y luz focal.',
        code: `// ${title} (Síntesis Procedural Adaptativa)
const group = new THREE.Group();
group.name = "ObjetoSintetizado";

// Materiales principales adaptados al prompt
const mainMat = new THREE.MeshStandardMaterial({ 
    color: ${pal.primary}, 
    metalness: ${pal.metal || 0.5}, 
    roughness: ${pal.rough || 0.35} 
});
const frameMat = new THREE.MeshStandardMaterial({ color: ${pal.secondary}, metalness: 0.8, roughness: 0.2 });
const coreMat = new THREE.MeshStandardMaterial({ 
    color: ${pal.glow}, 
    emissive: ${pal.primary}, 
    emissiveIntensity: 1.2, 
    roughness: 0.15 
});

// 1. Base o pedestal sólido
const baseGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.06, 8);
const base = new THREE.Mesh(baseGeo, frameMat);
base.position.set(0, 0.03, 0);
group.add(base);

// 2. Columna central modular
const colGeo = new THREE.BoxGeometry(0.16, 0.34, 0.16);
const col = new THREE.Mesh(colGeo, mainMat);
col.position.set(0, 0.23, 0);
group.add(col);

// 3. Prisma o núcleo tallado superior
const gemGeo = new THREE.OctahedronGeometry(0.10, 0);
const gem = new THREE.Mesh(gemGeo, coreMat);
gem.position.set(0, 0.46, 0);
group.add(gem);

// 4. Luz de resonancia
const light = new THREE.PointLight(${pal.glow}, 1.2, 2.5);
light.position.set(0, 0.46, 0);
group.add(light);

return group;`
    };
}

/* ======================================================
   UTILIDADES COMPLEMENTARIAS
   ====================================================== */

function pickIconForPrompt(text) {
    const t = text.toLowerCase();
    if (t.includes('detector')) return '📡';
    if (t.includes('mariposa') || t.includes('cazamariposa')) return '🦋';
    if (t.includes('tijera')) return '✂️';
    if (t.includes('portatil') || t.includes('laptop')) return '💻';
    if (t.includes('ordenador') || t.includes('pc') || t.includes('servidor')) return '🖥️';
    if (t.includes('pantalla') || t.includes('monitor')) return '🖥️';
    if (t.includes('mesa') || t.includes('escritorio')) return '🪑';
    if (t.includes('silla') || t.includes('sillon')) return '🪑';
    if (t.includes('estanteria') || t.includes('libro')) return '📚';
    if (t.includes('dron') || t.includes('robot')) return '🛸';
    if (t.includes('farola') || t.includes('lampara')) return '🏮';
    if (t.includes('barril') || t.includes('bidon')) return '🛢️';
    if (t.includes('caja') || t.includes('cofre')) return '📦';
    if (t.includes('arbol') || t.includes('pino')) return '🌳';
    if (t.includes('roca') || t.includes('piedra')) return '🪨';
    if (t.includes('linterna') || t.includes('lupa')) return '🔦';
    if (t.includes('espada') || t.includes('sable')) return '⚔️';
    if (t.includes('escudo')) return '🛡️';
    if (t.includes('antorcha') || t.includes('fuego')) return '🔥';
    if (t.includes('baculo') || t.includes('magia')) return '🔮';
    if (t.includes('pocion')) return '🧪';
    if (t.includes('corona') || t.includes('casco')) return '👑';
    return '✨';
}

function capitalizeWords(str) {
    if (!str) return 'Objeto 3D';
    return str.split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}
