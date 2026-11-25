import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const VIRTUAL_REPO_ASSETS_ID = 'virtual:repo-assets';
  const RESOLVED_VIRTUAL_REPO_ASSETS_ID = '\0' + VIRTUAL_REPO_ASSETS_ID;

  const computeSha256Short = (input: Buffer | string) =>
    crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);

  type RepoAssetHashInfo = { hash: string; size: number; mtimeMs: number };
  type PdfManifestEntry = {
    missionId: string;
    missionLabel: string;
    title: string;
    catalogId?: string;
    updatedAt: number;
    sha256?: string;
    size?: number;
  };
  type RepoModelEntry = {
    filename: string;
    assetPath: string;
    url: string;
    size: number;
    hash: string;
  };

  const scanPublicAssetsState = () => {
    const publicAssetsDir = path.resolve(__dirname, 'public/assets');
    const hashes: Record<string, RepoAssetHashInfo> = {};

    const walkAssets = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walkAssets(full);
        } else if (ent.isFile()) {
          if (/\.backup/i.test(ent.name) || ent.name === 'dev_world_versions.json' || ent.name === 'world_layout_versions.json') {
            continue;
          }
          try {
            const stat = fs.statSync(full);
            if (stat.size <= 50 * 1024 * 1024) {
              const relFromPublic = path.relative(path.resolve(__dirname, 'public'), full).replace(/\\/g, '/');
              const buf = fs.readFileSync(full);
              hashes[relFromPublic] = {
                hash: computeSha256Short(buf),
                size: stat.size,
                mtimeMs: stat.mtimeMs
              };
            }
          } catch (_) {}
        }
      }
    };

    walkAssets(publicAssetsDir);

    const docsManifestPath = path.resolve(publicAssetsDir, 'docs/docs_manifest.json');
    const docsManifest: Record<string, PdfManifestEntry> = {};
    try {
      if (fs.existsSync(docsManifestPath)) {
        const parsed = JSON.parse(fs.readFileSync(docsManifestPath, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [fname, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== 'object') continue;
            const e = entry as Record<string, unknown>;
            const info = hashes[`assets/docs/${fname}`];
            docsManifest[fname] = {
              missionId: String(e.missionId || 'unassigned'),
              missionLabel: String(e.missionLabel || 'Sin misión asignada'),
              title: String(e.title || ''),
              ...(e.catalogId ? { catalogId: String(e.catalogId) } : {}),
              updatedAt: Number(e.updatedAt || 0),
              ...(info ? { sha256: info.hash, size: info.size } : {})
            };
          }
        }
      }
    } catch (_) {}

    const modelsList: RepoModelEntry[] = Object.entries(hashes)
      .filter(([assetPath]) => assetPath.toLowerCase().startsWith('assets/models/custom/') && /\.(glb|gltf)$/i.test(assetPath))
      .map(([assetPath, info]) => {
        const filename = path.basename(assetPath);
        return {
          filename,
          assetPath,
          url: `./${assetPath}`,
          size: info.size,
          hash: info.hash
        };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));

    return {
      buildTimestamp: Date.now(),
      hashes,
      docsManifest,
      modelsList
    };
  };

  const baselineRepoAssets = scanPublicAssetsState();

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'repo-assets-manifest-plugin',
        resolveId(id) {
          if (id === VIRTUAL_REPO_ASSETS_ID) {
            return RESOLVED_VIRTUAL_REPO_ASSETS_ID;
          }
        },
        load(id) {
          if (id === RESOLVED_VIRTUAL_REPO_ASSETS_ID) {
            const snapshot = scanPublicAssetsState();
            return `
export const REPO_BUILD_TIMESTAMP = ${snapshot.buildTimestamp};
export const REPO_ASSET_HASHES = ${JSON.stringify(snapshot.hashes, null, 2)};
export const REPO_DOCS_MANIFEST = ${JSON.stringify(snapshot.docsManifest, null, 2)};
export const REPO_MODELS_LIST = ${JSON.stringify(snapshot.modelsList, null, 2)};
`;
          }
        },
        buildStart() {
          const snapshot = scanPublicAssetsState();
          const missingManifestDocs = Object.keys(snapshot.docsManifest).filter(
            (fname) => !snapshot.hashes[`assets/docs/${fname}`]
          );
          if (missingManifestDocs.length > 0) {
            this.warn(
              `[RepoAssets] docs_manifest.json referencia archivos ausentes en public/assets/docs/: ${missingManifestDocs.join(', ')}`
            );
          }
        }
      },
      {
        name: 'logo-upload-server',
        configureServer(server) {
          const readRequestBody = (
            req: import('http').IncomingMessage,
            maxBytes: number = 50 * 1024 * 1024
          ): Promise<string> => {
            return new Promise((resolve, reject) => {
              const chunks: Buffer[] = [];
              let totalBytes = 0;
              let settled = false;
              req.on('data', (chunk: Buffer | string) => {
                if (settled) return;
                const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
                totalBytes += buf.length;
                if (totalBytes > maxBytes) {
                  settled = true;
                  req.destroy();
                  reject(new Error(`Payload demasiado grande (máximo ${Math.round(maxBytes / (1024 * 1024))} MB)`));
                  return;
                }
                chunks.push(buf);
              });
              req.on('end', () => {
                if (!settled) {
                  settled = true;
                  resolve(Buffer.concat(chunks).toString('utf8'));
                }
              });
              req.on('error', (err) => {
                if (!settled) {
                  settled = true;
                  reject(err);
                }
              });
            });
          };

          server.middlewares.use('/api/repo-assets-status', (_req, res) => {
            try {
              const live = scanPublicAssetsState();
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                baseline: baselineRepoAssets,
                live
              }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: String(err) }));
            }
          });

          server.middlewares.use('/api/upload-logo', async (req, res) => {
            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const data = JSON.parse(body || '{}');
                let logoHash = '';
                let logoSize = 0;
                const publicUiDir = path.resolve(__dirname, 'public/assets/ui');
                fs.mkdirSync(publicUiDir, { recursive: true });

                if (data.cleanBase64Data) {
                  const cleanBuffer = Buffer.from(
                    data.cleanBase64Data.replace(/^data:image\/\w+;base64,/, ''),
                    'base64'
                  );
                  logoHash = computeSha256Short(cleanBuffer);
                  logoSize = cleanBuffer.length;
                  fs.writeFileSync(path.resolve(publicUiDir, 'monteserin_academy_logo_clean.png'), cleanBuffer);
                  fs.writeFileSync(path.resolve(publicUiDir, 'monteserin_academy_logo.png'), cleanBuffer);
                  fs.writeFileSync(path.resolve(publicUiDir, 'monteserin_academy_logo_trans.png'), cleanBuffer);
                  fs.writeFileSync(path.resolve(publicUiDir, 'monteserin_official_logo.png'), cleanBuffer);
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
                  fs.writeFileSync(path.resolve(publicUiDir, 'monteserin_academy_logo_raw.png'), rawBuffer);
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  message: 'Logotipo guardado en public/assets/ui/',
                  hash: logoHash,
                  size: logoSize,
                  url: './assets/ui/monteserin_academy_logo_clean.png'
                }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(err) }));
              }
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          });

          server.middlewares.use('/api/upload-carnet', async (req, res) => {
            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const data = JSON.parse(body || '{}');
                let carnetHash = '';
                let carnetSize = 0;
                if (data.carnetBase64Data) {
                  const carnetBuffer = Buffer.from(
                    data.carnetBase64Data.replace(/^data:image\/\w+;base64,/, ''),
                    'base64'
                  );
                  carnetHash = computeSha256Short(carnetBuffer);
                  carnetSize = carnetBuffer.length;
                  const publicCarnetDir = path.resolve(__dirname, 'public/assets/carnet');
                  const publicUiDir = path.resolve(__dirname, 'public/assets/ui');
                  fs.mkdirSync(publicCarnetDir, { recursive: true });
                  fs.mkdirSync(publicUiDir, { recursive: true });
                  fs.writeFileSync(path.resolve(publicCarnetDir, 'carnet_oficial.jpg'), carnetBuffer);
                  fs.writeFileSync(path.resolve(publicUiDir, 'ASPIRANTE.jpg'), carnetBuffer);
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  message: 'Carnet JPG guardado en public/assets/',
                  hash: carnetHash,
                  size: carnetSize,
                  url: './assets/ui/ASPIRANTE.jpg'
                }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(err) }));
              }
            } else {
              res.statusCode = 405;
              res.end('Method Not Allowed');
            }
          });

          server.middlewares.use('/api/upload-custom-model', async (req, res) => {
            const publicCustomDir = path.resolve(__dirname, 'public/assets/models/custom');

            if (req.method === 'GET') {
              try {
                const seen = new Map<string, { filename: string; url: string; assetPath: string; size: number; hash: string }>();
                if (fs.existsSync(publicCustomDir)) {
                  for (const entry of fs.readdirSync(publicCustomDir)) {
                    if (!/\.(glb|gltf)$/i.test(entry)) continue;
                    const fullPath = path.resolve(publicCustomDir, entry);
                    try {
                      const stat = fs.statSync(fullPath);
                      if (stat.isFile() && !seen.has(entry)) {
                        seen.set(entry, {
                          filename: entry,
                          assetPath: `assets/models/custom/${entry}`,
                          url: `./assets/models/custom/${entry}`,
                          size: stat.size,
                          hash: computeSha256Short(fs.readFileSync(fullPath))
                        });
                      }
                    } catch (_) {}
                  }
                }

                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  models: Array.from(seen.values()).sort((a, b) => a.filename.localeCompare(b.filename))
                }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const { filename, base64Data } = JSON.parse(body || '{}');
                if (!filename || !base64Data) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'filename y base64Data son requeridos' }));
                }

                const safeName = path
                  .basename(String(filename || '').trim())
                  .replace(/[^a-zA-Z0-9._-]/g, '_')
                  .replace(/^\.+/, '');
                if (!safeName || safeName === '.' || safeName === '..' || !/\.(glb|gltf)$/i.test(safeName)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'filename inválido (solo se permiten .glb o .gltf)' }));
                }
                fs.mkdirSync(publicCustomDir, { recursive: true });

                const buffer = Buffer.from(
                  base64Data.replace(/^data:.*?;base64,/, ''),
                  'base64'
                );
                const publicFilePath = path.resolve(publicCustomDir, safeName);
                fs.writeFileSync(publicFilePath, buffer);

                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  url: `./assets/models/custom/${safeName}`,
                  assetPath: `assets/models/custom/${safeName}`,
                  filename: safeName,
                  size: buffer.length,
                  hash: computeSha256Short(buffer)
                }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            if (req.method === 'DELETE') {
              const handleDeleteModel = (rawName: string) => {
                const safeName = path
                  .basename(String(rawName || '').trim())
                  .replace(/[^a-zA-Z0-9._-]/g, '_')
                  .replace(/^\.+/, '');
                if (!safeName || safeName === '.' || safeName === '..') {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'filename inválido' }));
                }
                let deleted = false;
                const p = path.resolve(publicCustomDir, safeName);
                if (fs.existsSync(p)) {
                  fs.unlinkSync(p);
                  deleted = true;
                }
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, deleted, filename: safeName }));
              };

              try {
                const parsedUrl = new URL(req.url || '', 'http://localhost');
                const queryName = parsedUrl.searchParams.get('filename');
                if (queryName) {
                  return handleDeleteModel(queryName);
                }
                const body = await readRequestBody(req);
                const parsed = JSON.parse(body || '{}');
                if (!parsed.filename) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'filename es requerido' }));
                }
                return handleDeleteModel(parsed.filename);
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          // Servidor estático directo para modelos personalizados (fuente única: public/assets/models/custom)
          server.middlewares.use('/assets/models/custom', (req, res, next) => {
            const cleanUrl = (req.url || '').split('?')[0].replace(/^\//, '');
            let decodedUrl = '';
            try {
              decodedUrl = decodeURIComponent(cleanUrl);
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Malformed model URL' }));
            }
            const safeFile = path.basename(decodedUrl);
            if (!safeFile) {
              return next();
            }
            const pubFile = path.resolve(__dirname, 'public/assets/models/custom', safeFile);
            if (fs.existsSync(pubFile)) {
              const stat = fs.statSync(pubFile);
              res.setHeader('Content-Type', safeFile.toLowerCase().endsWith('.gltf') ? 'model/gltf+json' : 'model/gltf-binary');
              res.setHeader('Content-Length', String(stat.size));
              res.setHeader('Cache-Control', 'no-cache');
              if (req.method === 'HEAD') {
                res.statusCode = 200;
                return res.end();
              }
              return fs.createReadStream(pubFile).pipe(res);
            }
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'Custom model not found', filename: safeFile }));
          });

          // ======================================================
          // GESTOR PERMANENTE DE DOCUMENTOS PDF (Fuente única: public/assets/docs)
          // ======================================================
          server.middlewares.use('/api/upload-pdf', async (req, res) => {
            const publicDocsDir = path.resolve(__dirname, 'public/assets/docs');
            const manifestFilename = 'docs_manifest.json';

            const sanitizePdfName = (rawName: string) => {
              const base = path.basename(String(rawName || '').trim());
              let clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
              clean = clean.replace(/^\.+/, '');
              if (!clean) clean = `documento_${Date.now()}.pdf`;
              if (!clean.toLowerCase().endsWith('.pdf')) {
                clean = clean.replace(/\.[^.]+$/, '') + '.pdf';
              }
              return clean;
            };

            const sanitizeMetaText = (raw: unknown, maxLen: number = 120) =>
              String(raw || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);

            const inferDefaultMeta = (fname: string) => {
              const lower = fname.toLowerCase();
              if (lower === 'higiene_visual.pdf' || lower.includes('higien')) {
                return {
                  missionId: 'mission002',
                  missionLabel: 'Misión 2: El Registro de Entrada',
                  title: 'Guía de Higiene Visual y Postural'
                };
              }
              if (lower === 'control_tiempo.pdf') {
                return {
                  missionId: 'mission002',
                  missionLabel: 'Misión 2: El Registro de Entrada',
                  title: 'Sistema de Control de Tiempo'
                };
              }
              const prefixMatch = lower.match(/^m(\d{2,3})_/);
              if (prefixMatch) {
                const num = Number(prefixMatch[1]);
                const padded = String(num).padStart(3, '0');
                return {
                  missionId: `mission${padded}`,
                  missionLabel: `Misión ${num}`,
                  title: ''
                };
              }
              return {
                missionId: 'unassigned',
                missionLabel: 'Sin misión asignada',
                title: ''
              };
            };

            const sanitizeCatalogId = (raw: unknown) =>
              sanitizeMetaText(raw, 60).replace(/[^a-zA-Z0-9_-]/g, '');

            const readDocsManifest = (): Record<string, PdfManifestEntry> => {
              const p = path.resolve(publicDocsDir, manifestFilename);
              try {
                if (fs.existsSync(p)) {
                  const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed as Record<string, PdfManifestEntry>;
                  }
                }
              } catch (_) {}
              return {};
            };

            const writeDocsManifest = (manifest: Record<string, PdfManifestEntry>) => {
              const json = JSON.stringify(manifest, null, 2) + '\n';
              fs.mkdirSync(publicDocsDir, { recursive: true });
              fs.writeFileSync(path.resolve(publicDocsDir, manifestFilename), json, 'utf8');
            };

            if (req.method === 'GET') {
              try {
                const manifest = readDocsManifest();
                const docs: Array<{
                  filename: string;
                  url: string;
                  assetPath: string;
                  size: number;
                  hash: string;
                  updatedAt: number;
                  inPublic: boolean;
                  inRepoBaseline: boolean;
                  matchesRepoHash: boolean;
                  missionId: string;
                  missionLabel: string;
                  title: string;
                  catalogId: string;
                  manifestUpdatedAt: number;
                }> = [];

                if (fs.existsSync(publicDocsDir)) {
                  for (const entry of fs.readdirSync(publicDocsDir)) {
                    if (!entry.toLowerCase().endsWith('.pdf')) continue;
                    const fullPath = path.resolve(publicDocsDir, entry);
                    try {
                      const stat = fs.statSync(fullPath);
                      if (!stat.isFile()) continue;
                      const buf = fs.readFileSync(fullPath);
                      const fileHash = computeSha256Short(buf);
                      const baselineInfo = baselineRepoAssets.hashes[`assets/docs/${entry}`];
                      const fallbackMeta = inferDefaultMeta(entry);
                      const savedMeta = manifest[entry];
                      docs.push({
                        filename: entry,
                        url: `./assets/docs/${encodeURIComponent(entry)}`,
                        assetPath: `assets/docs/${entry}`,
                        size: stat.size,
                        hash: fileHash,
                        updatedAt: stat.mtimeMs,
                        inPublic: true,
                        inRepoBaseline: Boolean(baselineInfo),
                        matchesRepoHash: Boolean(baselineInfo && baselineInfo.hash === fileHash),
                        missionId: sanitizeMetaText(savedMeta?.missionId, 60) || fallbackMeta.missionId,
                        missionLabel: sanitizeMetaText(savedMeta?.missionLabel, 120) || fallbackMeta.missionLabel,
                        title: sanitizeMetaText(savedMeta?.title, 120) || fallbackMeta.title,
                        catalogId: sanitizeCatalogId(savedMeta?.catalogId),
                        manifestUpdatedAt: Number(savedMeta?.updatedAt || 0)
                      });
                    } catch (_) {}
                  }
                }

                docs.sort((a, b) => a.filename.localeCompare(b.filename));
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  docs,
                  manifest,
                  baselineManifest: baselineRepoAssets.docsManifest
                }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const {
                  filename,
                  base64Data,
                  overwrite = false,
                  missionId,
                  missionLabel,
                  title,
                  catalogId
                } = JSON.parse(body || '{}');

                if (!filename || !base64Data) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'filename y base64Data son requeridos' }));
                }

                const safeName = sanitizePdfName(filename);
                const cleanBase64 = String(base64Data).replace(/^data:application\/pdf;base64,|^data:.*?;base64,/i, '');
                const buffer = Buffer.from(cleanBase64, 'base64');

                if (!buffer.length || buffer.length > 25 * 1024 * 1024) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'El archivo PDF está vacío o supera el límite de 25 MB.' }));
                }

                if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'El archivo seleccionado no tiene una cabecera PDF válida (%PDF-).' }));
                }

                const publicFilePath = path.resolve(publicDocsDir, safeName);
                if (!publicFilePath.startsWith(publicDocsDir + path.sep)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'Nombre de archivo no permitido.' }));
                }

                if (fs.existsSync(publicFilePath) && !overwrite) {
                  res.statusCode = 409;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    error: 'exists',
                    filename: safeName,
                    message: `Ya existe el archivo "${safeName}". Confirma si deseas reemplazarlo.`
                  }));
                }

                fs.mkdirSync(publicDocsDir, { recursive: true });
                fs.writeFileSync(publicFilePath, buffer);

                const fileHash = computeSha256Short(buffer);
                const fallbackMeta = inferDefaultMeta(safeName);
                const manifest = readDocsManifest();
                const prevMeta = manifest[safeName];
                const finalMissionId = sanitizeMetaText(missionId, 60) || prevMeta?.missionId || fallbackMeta.missionId;
                const finalMissionLabel = sanitizeMetaText(missionLabel, 120) || prevMeta?.missionLabel || fallbackMeta.missionLabel;
                const finalTitle = sanitizeMetaText(title, 120) || prevMeta?.title || fallbackMeta.title;
                const finalCatalogId = catalogId !== undefined
                  ? sanitizeCatalogId(catalogId)
                  : sanitizeCatalogId(prevMeta?.catalogId);
                const now = Date.now();

                if (finalCatalogId) {
                  for (const [k, entry] of Object.entries(manifest)) {
                    if (k !== safeName && entry?.catalogId === finalCatalogId) {
                      delete entry.catalogId;
                    }
                  }
                }

                manifest[safeName] = {
                  missionId: finalMissionId,
                  missionLabel: finalMissionLabel,
                  title: finalTitle,
                  ...(finalCatalogId ? { catalogId: finalCatalogId } : {}),
                  updatedAt: now
                };
                writeDocsManifest(manifest);

                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  filename: safeName,
                  url: `./assets/docs/${encodeURIComponent(safeName)}`,
                  assetPath: `assets/docs/${safeName}`,
                  size: buffer.length,
                  hash: fileHash,
                  updatedAt: now,
                  missionId: finalMissionId,
                  missionLabel: finalMissionLabel,
                  title: finalTitle,
                  catalogId: finalCatalogId
                }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            if (req.method === 'PATCH') {
              try {
                const body = await readRequestBody(req);
                const { filename, missionId, missionLabel, title, catalogId } = JSON.parse(body || '{}');
                if (!filename) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'filename es requerido' }));
                }
                const safeName = sanitizePdfName(filename);
                const publicFilePath = path.resolve(publicDocsDir, safeName);
                if (!fs.existsSync(publicFilePath)) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: `No existe el archivo "${safeName}" en public/assets/docs/.` }));
                }

                const fallbackMeta = inferDefaultMeta(safeName);
                const manifest = readDocsManifest();
                const prevMeta = manifest[safeName];
                const finalMissionId = sanitizeMetaText(missionId, 60) || prevMeta?.missionId || fallbackMeta.missionId;
                const finalMissionLabel = sanitizeMetaText(missionLabel, 120) || prevMeta?.missionLabel || fallbackMeta.missionLabel;
                const finalTitle = title !== undefined
                  ? sanitizeMetaText(title, 120)
                  : (prevMeta?.title || fallbackMeta.title);
                const finalCatalogId = catalogId !== undefined
                  ? sanitizeCatalogId(catalogId)
                  : sanitizeCatalogId(prevMeta?.catalogId);
                const now = Date.now();

                if (finalCatalogId) {
                  for (const [k, entry] of Object.entries(manifest)) {
                    if (k !== safeName && entry?.catalogId === finalCatalogId) {
                      delete entry.catalogId;
                    }
                  }
                }

                manifest[safeName] = {
                  missionId: finalMissionId,
                  missionLabel: finalMissionLabel,
                  title: finalTitle,
                  ...(finalCatalogId ? { catalogId: finalCatalogId } : {}),
                  updatedAt: now
                };
                writeDocsManifest(manifest);

                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  filename: safeName,
                  entry: manifest[safeName],
                  manifest
                }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            if (req.method === 'DELETE') {
              const handleDelete = (rawName: string) => {
                const safeName = sanitizePdfName(rawName);
                const publicFilePath = path.resolve(publicDocsDir, safeName);
                let deleted = false;
                if (fs.existsSync(publicFilePath)) {
                  fs.unlinkSync(publicFilePath);
                  deleted = true;
                }
                const manifest = readDocsManifest();
                if (manifest[safeName]) {
                  delete manifest[safeName];
                  writeDocsManifest(manifest);
                }
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, deleted, filename: safeName }));
              };

              try {
                const parsedUrl = new URL(req.url || '', 'http://localhost');
                const queryName = parsedUrl.searchParams.get('filename');
                if (queryName) {
                  return handleDelete(queryName);
                }

                const body = await readRequestBody(req);
                const parsed = JSON.parse(body || '{}');
                if (!parsed.filename) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ error: 'filename es requerido' }));
                }
                return handleDelete(parsed.filename);
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          // Servidor estático directo para documentos PDF/JSON (fuente única: public/assets/docs)
          server.middlewares.use('/assets/docs', (req, res, next) => {
            const cleanUrl = (req.url || '').split('?')[0].replace(/^\//, '');
            let decodedUrl = '';
            try {
              decodedUrl = decodeURIComponent(cleanUrl);
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'Malformed PDF URL' }));
            }
            const safeFile = path.basename(decodedUrl);
            if (!safeFile) {
              return next();
            }
            const pubFile = path.resolve(__dirname, 'public/assets/docs', safeFile);
            if (fs.existsSync(pubFile)) {
              const stat = fs.statSync(pubFile);
              const isJson = safeFile.toLowerCase().endsWith('.json');
              res.setHeader('Content-Type', isJson ? 'application/json; charset=utf-8' : 'application/pdf');
              if (!isJson) {
                res.setHeader('Content-Disposition', `inline; filename="${safeFile}"`);
              }
              res.setHeader('Content-Length', String(stat.size));
              res.setHeader('Cache-Control', 'no-cache');
              if (req.method === 'HEAD') {
                res.statusCode = 200;
                return res.end();
              }
              return fs.createReadStream(pubFile).pipe(res);
            }
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'PDF document not found', filename: safeFile }));
          });

          server.middlewares.use('/api/custom-items', async (req, res) => {
            const dataDir = path.resolve(__dirname, 'assets/data');
            const publicDataDir = path.resolve(__dirname, 'public/assets/data');
            const dataFile = path.resolve(dataDir, 'custom_3d_items.json');
            const publicDataFile = path.resolve(publicDataDir, 'custom_3d_items.json');

            const readItemsFromDisk = (): { items: unknown[]; updatedAt: number } => {
              const candidates = [publicDataFile, dataFile];
              for (const fPath of candidates) {
                try {
                  if (fs.existsSync(fPath)) {
                    const raw = fs.readFileSync(fPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                      const maxItemTs = parsed.reduce((acc: number, it: Record<string, unknown>) => Math.max(acc, Number(it?.updatedAt) || 0), 0);
                      return { items: parsed, updatedAt: maxItemTs };
                    }
                    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
                      return { items: parsed.items, updatedAt: Number(parsed.updatedAt || 0) };
                    }
                  }
                } catch (e) {
                  console.warn('[Server] Error leyendo custom_3d_items.json:', e);
                }
              }
              return { items: [], updatedAt: 0 };
            };

            const writeItemsToDisk = (items: unknown[], updatedAt: number = Date.now()) => {
              try {
                fs.mkdirSync(dataDir, { recursive: true });
                fs.mkdirSync(publicDataDir, { recursive: true });
                const content = JSON.stringify({ items, updatedAt }, null, 2);
                fs.writeFileSync(dataFile, content, 'utf8');
                fs.writeFileSync(publicDataFile, content, 'utf8');
                return true;
              } catch (err) {
                console.error('[Server] Error escribiendo custom_3d_items.json:', err);
                return false;
              }
            };

            if (req.method === 'GET') {
              const { items, updatedAt } = readItemsFromDisk();
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, items, updatedAt }));
            }

            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const { items: currentItems } = readItemsFromDisk();
                const { action } = payload;

                if (action === 'sync-all' && Array.isArray(payload.items)) {
                  const ts = Number(payload.updatedAt) || Date.now();
                  writeItemsToDisk(payload.items, ts);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, count: payload.items.length, updatedAt: ts }));
                }

                if (action === 'save' && payload.item) {
                  const idx = currentItems.findIndex((i: { id: string }) => i.id === payload.item.id);
                  if (idx >= 0) {
                    currentItems[idx] = payload.item;
                  } else {
                    currentItems.unshift(payload.item);
                  }
                  const ts = Date.now();
                  writeItemsToDisk(currentItems, ts);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, count: currentItems.length, updatedAt: ts }));
                }

                if (action === 'delete' && payload.id) {
                  const filtered = currentItems.filter((i: { id: string }) => i.id !== payload.id);
                  const ts = Date.now();
                  writeItemsToDisk(filtered, ts);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, count: filtered.length, updatedAt: ts }));
                }

                if (action === 'rename' && payload.id && payload.name) {
                  const target = currentItems.find((i: { id: string }) => i.id === payload.id) as { name?: string; updatedAt?: number } | undefined;
                  const ts = Date.now();
                  if (target) {
                    target.name = String(payload.name).trim();
                    target.updatedAt = ts;
                    writeItemsToDisk(currentItems, ts);
                  }
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, count: currentItems.length, updatedAt: ts }));
                }

                if (action === 'transform' && payload.id && payload.transform) {
                  const target = currentItems.find((i: { id: string }) => i.id === payload.id) as { transform?: unknown; socket?: string; scale?: number; updatedAt?: number } | undefined;
                  const ts = Date.now();
                  if (target) {
                    target.transform = payload.transform;
                    if (payload.transform.socket) target.socket = payload.transform.socket;
                    if (typeof payload.transform.scale === 'number') target.scale = payload.transform.scale;
                    target.updatedAt = ts;
                    writeItemsToDisk(currentItems, ts);
                  }
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, count: currentItems.length, updatedAt: ts }));
                }

                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Acción no reconocida' }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          server.middlewares.use('/api/world-objects', async (req, res) => {
            const dataDir = path.resolve(__dirname, 'assets/data');
            const publicDataDir = path.resolve(__dirname, 'public/assets/data');
            const dataFile = path.resolve(dataDir, 'world_placed_objects.json');
            const publicDataFile = path.resolve(publicDataDir, 'world_placed_objects.json');
            const devVersionsFile = path.resolve(dataDir, 'dev_world_versions.json');
            const MAX_VERSIONS = 15;

            const writeWorldObjectsOnly = (objects: unknown[], updatedAt: number = Date.now()) => {
              try {
                fs.mkdirSync(dataDir, { recursive: true });
                fs.mkdirSync(publicDataDir, { recursive: true });
                const content = JSON.stringify({ objects, updatedAt }, null, 2);
                fs.writeFileSync(dataFile, content, 'utf8');
                fs.writeFileSync(publicDataFile, content, 'utf8');
                return true;
              } catch (err) {
                console.error('[Server] Error escribiendo world_placed_objects.json:', err);
                return false;
              }
            };

            const writeWorldVersionsOnly = (versions: unknown[]) => {
              try {
                fs.mkdirSync(dataDir, { recursive: true });
                const capped = Array.isArray(versions) ? versions.slice(0, MAX_VERSIONS) : [];
                fs.writeFileSync(devVersionsFile, JSON.stringify(capped, null, 2), 'utf8');
                return true;
              } catch (err) {
                console.error('[Server] Error escribiendo dev_world_versions.json:', err);
                return false;
              }
            };

            const readWorldData = (): { objects: unknown[]; versions: unknown[]; updatedAt: number } => {
              let objects: unknown[] = [];
              let updatedAt = 0;
              let legacyVersions: unknown[] = [];
              let hadLegacyVersionsInPublicJson = false;

              try {
                if (fs.existsSync(dataFile)) {
                  const raw = fs.readFileSync(dataFile, 'utf8');
                  const parsed = JSON.parse(raw);
                  if (parsed && typeof parsed === 'object') {
                    objects = Array.isArray(parsed.objects) ? parsed.objects : (Array.isArray(parsed) ? parsed : []);
                    updatedAt = Number(parsed.updatedAt || Date.now());
                    if (Array.isArray(parsed.versions)) {
                      legacyVersions = parsed.versions;
                      hadLegacyVersionsInPublicJson = true;
                    }
                  }
                }
              } catch (e) {
                console.warn('[Server] Error leyendo world_placed_objects.json:', e);
              }

              let versions: unknown[] = [];
              try {
                if (fs.existsSync(devVersionsFile)) {
                  const rawV = fs.readFileSync(devVersionsFile, 'utf8');
                  const parsedV = JSON.parse(rawV);
                  if (Array.isArray(parsedV)) {
                    versions = parsedV.slice(0, MAX_VERSIONS);
                  }
                } else if (legacyVersions.length > 0) {
                  versions = legacyVersions.slice(0, MAX_VERSIONS);
                  writeWorldVersionsOnly(versions);
                }
              } catch (e) {
                console.warn('[Server] Error leyendo dev_world_versions.json:', e);
              }

              // Auto-limpiar versiones antiguas del JSON público si existían
              if (hadLegacyVersionsInPublicJson) {
                writeWorldObjectsOnly(objects, updatedAt || Date.now());
              }

              return { objects, versions, updatedAt: updatedAt || Date.now() };
            };

            if (req.method === 'GET') {
              const current = readWorldData();
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                objects: current.objects,
                versions: current.versions,
                updatedAt: current.updatedAt || 0
              }));
            }

            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const current = readWorldData();
                const { action } = payload;

                if (action === 'sync-all') {
                  const objects = Array.isArray(payload.objects) ? payload.objects : current.objects;
                  const versions = (Array.isArray(payload.versions) ? payload.versions : current.versions).slice(0, MAX_VERSIONS);
                  writeWorldObjectsOnly(objects, Date.now());
                  writeWorldVersionsOnly(versions);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, objectCount: objects.length, versionCount: versions.length }));
                }

                if (action === 'save-objects') {
                  const objects = Array.isArray(payload.objects) ? payload.objects : [];
                  writeWorldObjectsOnly(objects, Date.now());
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, objectCount: objects.length }));
                }

                if (action === 'save-versions') {
                  const versions = (Array.isArray(payload.versions) ? payload.versions : current.versions).slice(0, MAX_VERSIONS);
                  writeWorldVersionsOnly(versions);
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
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          server.middlewares.use('/api/world-layout', async (req, res) => {
            const dataDir = path.resolve(__dirname, 'assets/data');
            const publicDataDir = path.resolve(__dirname, 'public/assets/data');
            const layoutFile = path.resolve(dataDir, 'world_layout.json');
            const publicLayoutFile = path.resolve(publicDataDir, 'world_layout.json');
            const versionsFile = path.resolve(dataDir, 'world_layout_versions.json');
            const publicVersionsFile = path.resolve(publicDataDir, 'world_layout_versions.json');
            const MAX_LAYOUT_VERSIONS = 15;

            const readLayoutData = (): { layout: Record<string, unknown>; versions: unknown[] } => {
              let layout: Record<string, unknown> = {};
              let publicLayout: Record<string, unknown> = {};
              let versions: unknown[] = [];
              try {
                if (fs.existsSync(layoutFile)) {
                  layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
                }
              } catch (e) {
                console.warn('[Server] Error leyendo world_layout.json:', e);
              }
              try {
                if (fs.existsSync(publicLayoutFile)) {
                  publicLayout = JSON.parse(fs.readFileSync(publicLayoutFile, 'utf8'));
                }
              } catch (e) {
                console.warn('[Server] Error leyendo public/assets/data/world_layout.json:', e);
              }

              const localUpdated = Number(layout?.updatedAt || 0);
              const publicUpdated = Number(publicLayout?.updatedAt || 0);
              if (publicUpdated > localUpdated && Object.keys(publicLayout).length > 0) {
                layout = publicLayout;
                try {
                  fs.mkdirSync(dataDir, { recursive: true });
                  fs.writeFileSync(layoutFile, JSON.stringify(layout, null, 2), 'utf8');
                } catch (_) {}
              } else if (localUpdated > publicUpdated && Object.keys(layout).length > 0) {
                try {
                  fs.mkdirSync(publicDataDir, { recursive: true });
                  fs.writeFileSync(publicLayoutFile, JSON.stringify(layout, null, 2), 'utf8');
                } catch (_) {}
              }

              try {
                if (fs.existsSync(versionsFile)) {
                  const raw = fs.readFileSync(versionsFile, 'utf8');
                  versions = JSON.parse(raw);
                }
              } catch (_) {}
              return { layout, versions: Array.isArray(versions) ? versions.slice(0, MAX_LAYOUT_VERSIONS) : [] };
            };

            const writeLayoutData = (layout: Record<string, unknown>) => {
              try {
                fs.mkdirSync(dataDir, { recursive: true });
                fs.mkdirSync(publicDataDir, { recursive: true });
                const content = JSON.stringify(layout, null, 2);
                fs.writeFileSync(layoutFile, content, 'utf8');
                fs.writeFileSync(publicLayoutFile, content, 'utf8');
                return true;
              } catch (err) {
                console.error('[Server] Error escribiendo world_layout.json:', err);
                return false;
              }
            };

            const writeVersionsData = (versions: unknown[]) => {
              try {
                fs.mkdirSync(dataDir, { recursive: true });
                const capped = Array.isArray(versions) ? versions.slice(0, MAX_LAYOUT_VERSIONS) : [];
                const content = JSON.stringify(capped, null, 2);
                fs.writeFileSync(versionsFile, content, 'utf8');
                if (fs.existsSync(publicVersionsFile)) {
                  try { fs.unlinkSync(publicVersionsFile); } catch (_) {}
                }
                return true;
              } catch (err) {
                console.error('[Server] Error escribiendo world_layout_versions.json:', err);
                return false;
              }
            };

            if (req.method === 'GET') {
              const current = readLayoutData();
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, layout: current.layout, versions: current.versions }));
            }

            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const payload = JSON.parse(body || '{}');
                const current = readLayoutData();
                const { action } = payload;

                if (action === 'save-layout' && payload.layout) {
                  const merged = { ...current.layout, ...payload.layout, updatedAt: Date.now() };
                  writeLayoutData(merged);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, layout: merged }));
                }

                if (action === 'update-entity' && payload.category && payload.transform) {
                  const { category, entityId, transform } = payload;
                  const layout = { ...current.layout };
                  if (category === 'playerSpawn') {
                    layout.playerSpawn = transform;
                  } else {
                    if (!layout[category] || typeof layout[category] !== 'object') {
                      layout[category] = {};
                    }
                    const catObj = layout[category] as Record<string, unknown>;
                    catObj[entityId] = { ...(catObj[entityId] as Record<string, unknown> || {}), ...transform };
                  }
                  layout.updatedAt = Date.now();
                  writeLayoutData(layout);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, layout }));
                }

                if (action === 'save-versions' && Array.isArray(payload.versions)) {
                  const capped = payload.versions.slice(0, MAX_LAYOUT_VERSIONS);
                  writeVersionsData(capped);
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: true, versionCount: capped.length }));
                }

                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Acción no reconocida en /api/world-layout' }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: String(err) }));
              }
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          server.middlewares.use('/api/bake-world-to-code', async (req, res) => {
            if (req.method === 'POST') {
              try {
                const body = await readRequestBody(req);
                const { layout, placedObjects, customItems } = JSON.parse(body || '{}');
                const bakedAt = Date.now();

                // 1. Hornear DEFAULT_WORLD_LAYOUT directamente en src/systems/worldLayoutSystem.js
                const layoutPath = path.resolve(__dirname, 'src/systems/worldLayoutSystem.js');
                const bakedLayout = layout && typeof layout === 'object'
                  ? { ...layout, updatedAt: bakedAt }
                  : null;
                if (bakedLayout && fs.existsSync(layoutPath)) {
                  let content = fs.readFileSync(layoutPath, 'utf8');
                  const formattedLayout = JSON.stringify(bakedLayout, null, 4);
                  const regex = /export const DEFAULT_WORLD_LAYOUT = \{[\s\S]*?\n\};/;
                  if (!regex.test(content)) {
                    throw new Error('No se encontró el bloque DEFAULT_WORLD_LAYOUT en worldLayoutSystem.js');
                  }
                  content = content.replace(regex, `export const DEFAULT_WORLD_LAYOUT = ${formattedLayout};`);
                  fs.writeFileSync(layoutPath, content, 'utf8');
                }

                // 2. Hornear DEFAULT_PLACED_WORLD_OBJECTS + timestamp en src/systems/worldObjectsDefaults.js
                const normalizeBakedUrl = (rawUrl: unknown) => {
                  if (typeof rawUrl !== 'string') return rawUrl;
                  const t = rawUrl.trim();
                  if (t.startsWith('/assets/')) return '.' + t;
                  if (t.startsWith('assets/')) return './' + t;
                  return t;
                };
                const defaultsPath = path.resolve(__dirname, 'src/systems/worldObjectsDefaults.js');
                const objectsList = (Array.isArray(placedObjects) ? placedObjects : []).map((obj: Record<string, unknown>) =>
                  obj && typeof obj === 'object' && typeof obj.url === 'string'
                    ? { ...obj, url: normalizeBakedUrl(obj.url) }
                    : obj
                );
                const formattedObjects = JSON.stringify(objectsList, null, 4);
                const defaultsCode = `/* ======================================================
   MONTESERIN ACADEMY - DEFAULT WORLD OBJECTS MANIFEST
   Objetos y modelos 3D colocados por defecto en el escenario
   (incluye modelos .GLB, geometrías Three.js y elementos procedurales).
   Este archivo es fijado desde Modo Dios para viajar en el código a GitHub.
   ====================================================== */

export const DEFAULT_PLACED_WORLD_OBJECTS_UPDATED_AT = ${bakedAt};

export const DEFAULT_PLACED_WORLD_OBJECTS = ${formattedObjects};
`;
                fs.writeFileSync(defaultsPath, defaultsCode, 'utf8');

                // 3. Hornear DEFAULT_3D_PRESETS + timestamp en src/systems/customItemStorage.js
                const customStoragePath = path.resolve(__dirname, 'src/systems/customItemStorage.js');
                const hasCustomItems = Array.isArray(customItems);
                if (hasCustomItems && fs.existsSync(customStoragePath)) {
                  let storageContent = fs.readFileSync(customStoragePath, 'utf8');
                  const presetsRegex = /\/\/ BAKE_DEFAULT_3D_PRESETS_START[\s\S]*?\/\/ BAKE_DEFAULT_3D_PRESETS_END/;
                  if (!presetsRegex.test(storageContent)) {
                    throw new Error('No se encontraron los marcadores BAKE_DEFAULT_3D_PRESETS en customItemStorage.js');
                  }
                  const bakedPresetsBlock = `// BAKE_DEFAULT_3D_PRESETS_START
export const DEFAULT_3D_PRESETS_UPDATED_AT = ${bakedAt};

export const DEFAULT_3D_PRESETS = ${JSON.stringify(customItems, null, 4)};
// BAKE_DEFAULT_3D_PRESETS_END`;
                  storageContent = storageContent.replace(presetsRegex, bakedPresetsBlock);
                  fs.writeFileSync(customStoragePath, storageContent, 'utf8');
                }

                // 4. Escribir copias espejo limpias (SIN versions) en assets/data y public/assets/data
                const dataDir = path.resolve(__dirname, 'assets/data');
                const publicDataDir = path.resolve(__dirname, 'public/assets/data');
                fs.mkdirSync(dataDir, { recursive: true });
                fs.mkdirSync(publicDataDir, { recursive: true });

                if (bakedLayout) {
                  const lStr = JSON.stringify(bakedLayout, null, 2);
                  fs.writeFileSync(path.resolve(dataDir, 'world_layout.json'), lStr, 'utf8');
                  fs.writeFileSync(path.resolve(publicDataDir, 'world_layout.json'), lStr, 'utf8');
                }

                const oStr = JSON.stringify({ objects: objectsList, updatedAt: bakedAt }, null, 2);
                fs.writeFileSync(path.resolve(dataDir, 'world_placed_objects.json'), oStr, 'utf8');
                fs.writeFileSync(path.resolve(publicDataDir, 'world_placed_objects.json'), oStr, 'utf8');

                if (hasCustomItems) {
                  const cStr = JSON.stringify({ items: customItems, updatedAt: bakedAt }, null, 2);
                  fs.writeFileSync(path.resolve(dataDir, 'custom_3d_items.json'), cStr, 'utf8');
                  fs.writeFileSync(path.resolve(publicDataDir, 'custom_3d_items.json'), cStr, 'utf8');
                }

                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: true,
                  bakedAt,
                  message: 'Escenario, objetos y catálogo 3D horneados con éxito en el código fuente para Git',
                  npcsCount: Object.keys(bakedLayout?.npcs || {}).length,
                  objectsCount: objectsList.length,
                  customItemsCount: hasCustomItems ? customItems.length : 0
                }));
              } catch (err) {
                console.error('[Server] Error en /api/bake-world-to-code:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: String(err) }));
              }
            }

            res.statusCode = 405;
            res.end('Method Not Allowed');
          });

          server.middlewares.use('/api/generate-3d', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              return res.end('Method Not Allowed');
            }

            if (!process.env.GEMINI_API_KEY) {
              res.statusCode = 422;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ fallback: true }));
            }

            try {
              const body = await readRequestBody(req);
              const { prompt, socket = 'rightHand' } = JSON.parse(body || '{}');
              if (!prompt) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Prompt es requerido' }));
              }

              if (process.env.GEMINI_API_KEY) {
                  try {
                    const { GoogleGenAI } = await import('@google/genai');
                    const ai = new GoogleGenAI({
                      apiKey: process.env.GEMINI_API_KEY,
                      httpOptions: {
                        headers: {
                          'User-Agent': 'aistudio-build',
                        },
                      },
                    });
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
                      model: 'gemini-4-hydrogen',
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
        },
        closeBundle() {
          // Blindaje de compilación para GitHub Pages: eliminar backups y archivos de verificación
          // y enriquecer dist/assets/docs/docs_manifest.json con sha256 + size reales
          const distDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(distDir)) return;

          const pruneDir = (dir: string) => {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
              const fullPath = path.join(dir, ent.name);
              if (ent.isDirectory()) {
                pruneDir(fullPath);
              } else if (
                /\.backup/i.test(ent.name) ||
                /^verificacion_.*\.html$/i.test(ent.name) ||
                ent.name === 'dev_world_versions.json' ||
                ent.name === 'world_layout_versions.json'
              ) {
                try {
                  fs.unlinkSync(fullPath);
                } catch (_) {}
              }
            }
          };

          pruneDir(distDir);

          try {
            const snapshot = scanPublicAssetsState();
            const distManifestPath = path.resolve(distDir, 'assets/docs/docs_manifest.json');
            if (fs.existsSync(path.dirname(distManifestPath))) {
              fs.writeFileSync(distManifestPath, JSON.stringify(snapshot.docsManifest, null, 2) + '\n', 'utf8');
            }
          } catch (_) {}
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
      allowedHosts: ['.run.app'],
    },
  };
});
