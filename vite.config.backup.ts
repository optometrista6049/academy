import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'logo-upload-server',
        configureServer(server) {
          server.middlewares.use('/api/upload-logo', (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  if (data.cleanBase64Data) {
                    const cleanBuffer = Buffer.from(
                      data.cleanBase64Data.replace(/^data:image\/\w+;base64,/, ''),
                      'base64'
                    );
                    fs.writeFileSync(path.resolve(__dirname, 'assets/ui/monteserin_academy_logo_clean.png'), cleanBuffer);
                    fs.writeFileSync(path.resolve(__dirname, 'assets/ui/monteserin_academy_logo.png'), cleanBuffer);
                    fs.writeFileSync(path.resolve(__dirname, 'assets/ui/monteserin_academy_logo_trans.png'), cleanBuffer);
                    fs.writeFileSync(path.resolve(__dirname, 'assets/ui/monteserin_official_logo.png'), cleanBuffer);
                    try {
                      fs.mkdirSync(path.resolve(__dirname, 'src/assets/images'), { recursive: true });
                      fs.writeFileSync(path.resolve(__dirname, 'src/assets/images/monteserin_official_logo.png'), cleanBuffer);
                    } catch (_) {}
                  }
                  if (data.rawBase64Data) {
                    const rawBuffer = Buffer.from(
                      data.rawBase64Data.replace(/^data:image\/\w+;base64,/, ''),
                      'base64'
                    );
                    fs.writeFileSync(path.resolve(__dirname, 'assets/ui/monteserin_academy_logo_raw.png'), rawBuffer);
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: 'Logotipo guardado exitosamente en el servidor' }));
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: String(err) }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          });

          server.middlewares.use('/api/upload-carnet', (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  if (data.carnetBase64Data) {
                    const carnetBuffer = Buffer.from(
                      data.carnetBase64Data.replace(/^data:image\/\w+;base64,/, ''),
                      'base64'
                    );
                    fs.mkdirSync(path.resolve(__dirname, 'assets/carnet'), { recursive: true });
                    fs.mkdirSync(path.resolve(__dirname, 'public/assets/carnet'), { recursive: true });
                    fs.writeFileSync(path.resolve(__dirname, 'assets/carnet/carnet_oficial.jpg'), carnetBuffer);
                    fs.writeFileSync(path.resolve(__dirname, 'public/assets/carnet/carnet_oficial.jpg'), carnetBuffer);
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ 
                    success: true, 
                    message: 'Carnet JPG oficial guardado con total exactitud binaria',
                    url: '/assets/carnet/carnet_oficial.jpg'
                  }));
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: String(err) }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          });

          server.middlewares.use('/api/upload-custom-model', (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const { filename, base64Data } = JSON.parse(body || '{}');
                  if (!filename || !base64Data) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ error: 'filename y base64Data son requeridos' }));
                  }

                  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
                  const customDir = path.resolve(__dirname, 'assets/models/custom');
                  fs.mkdirSync(customDir, { recursive: true });

                  const buffer = Buffer.from(
                    base64Data.replace(/^data:.*?;base64,/, ''),
                    'base64'
                  );

                  const filePath = path.resolve(customDir, safeName);
                  fs.writeFileSync(filePath, buffer);

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: true,
                    url: `assets/models/custom/${safeName}`,
                    filename: safeName,
                    size: buffer.length
                  }));
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: String(err) }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          });

          server.middlewares.use('/api/custom-items', (req, res) => {
            const dataDir = path.resolve(__dirname, 'assets/data');
            const publicDataDir = path.resolve(__dirname, 'public/assets/data');
            const dataFile = path.resolve(dataDir, 'custom_3d_items.json');
            const publicDataFile = path.resolve(publicDataDir, 'custom_3d_items.json');

            const readItemsFromDisk = () => {
              try {
                if (fs.existsSync(dataFile)) {
                  const raw = fs.readFileSync(dataFile, 'utf8');
                  const parsed = JSON.parse(raw);
                  if (Array.isArray(parsed)) return parsed;
                }
              } catch (e) {
                console.warn('[Server] Error leyendo custom_3d_items.json:', e);
              }
              return [];
            };

            const writeItemsToDisk = (items: unknown[]) => {
              try {
                fs.mkdirSync(dataDir, { recursive: true });
                fs.mkdirSync(publicDataDir, { recursive: true });
                const content = JSON.stringify(items, null, 2);
                fs.writeFileSync(dataFile, content, 'utf8');
                fs.writeFileSync(publicDataFile, content, 'utf8');
                return true;
              } catch (err) {
                console.error('[Server] Error escribiendo custom_3d_items.json:', err);
                return false;
              }
            };

            if (req.method === 'GET') {
              const items = readItemsFromDisk();
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, items }));
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const currentItems = readItemsFromDisk();
                  const { action } = payload;

                  if (action === 'sync-all' && Array.isArray(payload.items)) {
                    writeItemsToDisk(payload.items);
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, count: payload.items.length }));
                  }

                  if (action === 'save' && payload.item) {
                    const idx = currentItems.findIndex((i: { id: string }) => i.id === payload.item.id);
                    if (idx >= 0) {
                      currentItems[idx] = payload.item;
                    } else {
                      currentItems.unshift(payload.item);
                    }
                    writeItemsToDisk(currentItems);
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, count: currentItems.length }));
                  }

                  if (action === 'delete' && payload.id) {
                    const filtered = currentItems.filter((i: { id: string }) => i.id !== payload.id);
                    writeItemsToDisk(filtered);
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, count: filtered.length }));
                  }

                  if (action === 'rename' && payload.id && payload.name) {
                    const target = currentItems.find((i: { id: string }) => i.id === payload.id) as { name?: string; updatedAt?: number } | undefined;
                    if (target) {
                      target.name = String(payload.name).trim();
                      target.updatedAt = Date.now();
                      writeItemsToDisk(currentItems);
                    }
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, count: currentItems.length }));
                  }

                  if (action === 'transform' && payload.id && payload.transform) {
                    const target = currentItems.find((i: { id: string }) => i.id === payload.id) as { transform?: unknown; socket?: string; scale?: number; updatedAt?: number } | undefined;
                    if (target) {
                      target.transform = payload.transform;
                      if (payload.transform.socket) target.socket = payload.transform.socket;
                      if (typeof payload.transform.scale === 'number') target.scale = payload.transform.scale;
                      target.updatedAt = Date.now();
                      writeItemsToDisk(currentItems);
                    }
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, count: currentItems.length }));
                  }

                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'Acción no reconocida' }));
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: String(err) }));
                }
              });
              return;
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          server.middlewares.use('/api/world-objects', (req, res) => {
            const dataDir = path.resolve(__dirname, 'assets/data');
            const publicDataDir = path.resolve(__dirname, 'public/assets/data');
            const dataFile = path.resolve(dataDir, 'world_placed_objects.json');
            const publicDataFile = path.resolve(publicDataDir, 'world_placed_objects.json');

            const readWorldData = (): { objects: unknown[]; versions: unknown[]; updatedAt?: number } => {
              try {
                if (fs.existsSync(dataFile)) {
                  const raw = fs.readFileSync(dataFile, 'utf8');
                  const parsed = JSON.parse(raw);
                  if (parsed && typeof parsed === 'object') {
                    return {
                      objects: Array.isArray(parsed.objects) ? parsed.objects : (Array.isArray(parsed) ? parsed : []),
                      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
                      updatedAt: parsed.updatedAt || Date.now()
                    };
                  }
                }
              } catch (e) {
                console.warn('[Server] Error leyendo world_placed_objects.json:', e);
              }
              return { objects: [], versions: [], updatedAt: Date.now() };
            };

            const writeWorldData = (data: { objects: unknown[]; versions: unknown[]; updatedAt?: number }) => {
              try {
                fs.mkdirSync(dataDir, { recursive: true });
                fs.mkdirSync(publicDataDir, { recursive: true });
                const content = JSON.stringify(data, null, 2);
                fs.writeFileSync(dataFile, content, 'utf8');
                fs.writeFileSync(publicDataFile, content, 'utf8');
                return true;
              } catch (err) {
                console.error('[Server] Error escribiendo world_placed_objects.json:', err);
                return false;
              }
            };

            if (req.method === 'GET') {
              const current = readWorldData();
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, objects: current.objects, versions: current.versions }));
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const current = readWorldData();
                  const { action } = payload;

                  if (action === 'sync-all') {
                    const objects = Array.isArray(payload.objects) ? payload.objects : current.objects;
                    const versions = Array.isArray(payload.versions) ? payload.versions : current.versions;
                    writeWorldData({ objects, versions, updatedAt: Date.now() });
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, objectCount: objects.length, versionCount: versions.length }));
                  }

                  if (action === 'save-objects') {
                    const objects = Array.isArray(payload.objects) ? payload.objects : [];
                    writeWorldData({ objects, versions: current.versions, updatedAt: Date.now() });
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, objectCount: objects.length }));
                  }

                  if (action === 'save-versions') {
                    const versions = Array.isArray(payload.versions) ? payload.versions : current.versions;
                    writeWorldData({ objects: current.objects, versions, updatedAt: Date.now() });
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: true, versionCount: versions.length }));
                  }

                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'Acción no reconocida' }));
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: String(err) }));
                }
              });
              return;
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          server.middlewares.use('/api/generate-3d', async (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const { prompt, socket = 'rightHand' } = JSON.parse(body || '{}');
                  if (!prompt) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ error: 'Prompt es requerido' }));
                  }

                  if (process.env.GEMINI_API_KEY) {
                    try {
                      const { GoogleGenAI } = await import('@google/genai');
                      const ai = new GoogleGenAI({});
                      const systemInstruction = `Eres un experto programador de Three.js para un videojuego 3D.
Tu objetivo es generar código JavaScript puro para Three.js que construya un objeto 3D a escala real métrica (entre 0.15m y 0.70m de tamaño, adecuado para que un robot lo sostenga en la mano o lleve en la espalda).

REGLAS DE CÓDIGO THREE.JS:
1. El código se ejecuta dentro de una función con argumento 'THREE'.
2. NO uses imports ni require.
3. El código DEBE retornar siempre una instancia de THREE.Group o THREE.Object3D (ej: return group;).
4. Usa THREE.Group(), geometrías estándar (BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, ConeGeometry, etc.).
5. Usa THREE.MeshStandardMaterial con color, metalness, roughness, emissive, emissiveIntensity.
6. Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "name": "Nombre corto del objeto (max 25 caracteres)",
  "icon": "Un único emoji representativo (ej: ⚔️, 🛡️, 🏮, 🔮, 📻, 🎒)",
  "socket": "${socket}",
  "code": "El código JS que crea los meshes, los añade a un THREE.Group() y hace return group;",
  "explanation": "Breve explicación del modelo"
}`;

                      const result = await ai.models.generateContent({
                        model: 'gemini-3.8-flash',
                        contents: `Genera el modelo 3D Three.js para el prompt: "${prompt}". Socket sugerido: ${socket}.`,
                        config: {
                          systemInstruction,
                          responseMimeType: 'application/json'
                        }
                      });

                      const parsed = JSON.parse(result.text || '{}');
                      if (parsed && parsed.code) {
                        res.setHeader('Content-Type', 'application/json');
                        return res.end(JSON.stringify(parsed));
                      }
                    } catch (geminiErr) {
                      console.warn('[Vite API] Gemini call error:', geminiErr);
                    }
                  }

                  res.statusCode = 422;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ fallback: true }));
                } catch (err) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: String(err) }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
