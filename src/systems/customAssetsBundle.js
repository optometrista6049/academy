/* ======================================================
   MONTESERIN ACADEMY - REPOSITORY ASSETS METADATA FACADE
   Sustituye al antiguo bundle Base64 gigante (Opción 1):
   Todos los binarios viven únicamente en public/assets/ y Vite los
   empaqueta con su hash de contenido vía virtual:repo-assets.
   Se mantienen estos exports por compatibilidad ligera.
   ====================================================== */

import {
    REPO_BUILD_TIMESTAMP,
    REPO_DOCS_MANIFEST,
    REPO_MODELS_LIST,
    REPO_ASSET_HASHES
} from 'virtual:repo-assets';

export const CUSTOM_ASSETS_BUNDLE_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CUSTOM_ASSETS_BUNDLE_UPDATED_AT = REPO_BUILD_TIMESTAMP;

export const BUNDLED_CUSTOM_MODELS_META = Object.fromEntries(
    (REPO_MODELS_LIST || []).map((m) => [
        m.filename,
        { filename: m.filename, size: Number(m.size || 0), hash: m.hash || '', skippedOversize: false }
    ])
);

export const BUNDLED_CUSTOM_DOCS_META = Object.fromEntries(
    Object.entries(REPO_ASSET_HASHES || {})
        .filter(([assetPath]) => assetPath.toLowerCase().startsWith('assets/docs/') && assetPath.toLowerCase().endsWith('.pdf'))
        .map(([assetPath, info]) => {
            const fname = assetPath.split('/').pop() || assetPath;
            return [
                fname,
                { filename: fname, size: Number(info?.size || 0), hash: info?.hash || '', skippedOversize: false }
            ];
        })
);

// Ya no duplicamos binarios gigantes en JS: Vite sirve/copia los reales desde public/assets/
export const BUNDLED_CUSTOM_MODELS = {};
export const BUNDLED_CUSTOM_DOCS = {};

export function getBundledCustomModelDataUri() {
    return null;
}

export function getBundledCustomDocDataUri() {
    return null;
}

export function getBundledCustomDocsList() {
    const manifest = REPO_DOCS_MANIFEST || {};
    return Object.keys(BUNDLED_CUSTOM_DOCS_META)
        .map((fname) => {
            const meta = BUNDLED_CUSTOM_DOCS_META[fname] || {};
            const mEntry = manifest[fname] || {};
            return {
                filename: fname,
                url: `./assets/docs/${encodeURIComponent(fname)}`,
                assetPath: `assets/docs/${fname}`,
                size: Number(meta.size || 0),
                hash: meta.hash || mEntry.sha256 || '',
                updatedAt: Number(mEntry.updatedAt || CUSTOM_ASSETS_BUNDLE_UPDATED_AT || 0),
                manifestUpdatedAt: Number(mEntry.updatedAt || 0),
                missionId: mEntry.missionId || 'unassigned',
                missionLabel: mEntry.missionLabel || 'Sin misión asignada',
                title: mEntry.title || '',
                catalogId: mEntry.catalogId || '',
                inPublic: true,
                inRepo: true
            };
        })
        .sort((a, b) => a.filename.localeCompare(b.filename));
}
