/* ======================================================
   MONTESERIN ACADEMY - REPOSITORY ASSET RESOLVER
   Fuente única de verdad (public/assets/) con hash por contenido
   generado automáticamente en cada dev/build (GitHub Pages anti-caché).
   ====================================================== */

import {
    REPO_BUILD_TIMESTAMP,
    REPO_ASSET_HASHES,
    REPO_DOCS_MANIFEST,
    REPO_MODELS_LIST
} from 'virtual:repo-assets';

export function normalizeRepoAssetPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    const trimmed = rawPath.trim();
    if (!trimmed || /^(https?:|data:|blob:)/i.test(trimmed)) return '';
    const clean = trimmed.split('#')[0].split('?')[0];
    return clean.replace(/^\.?\//, '');
}

export function getRepoBuildTimestamp() {
    return Number(REPO_BUILD_TIMESTAMP) || 0;
}

export function getRepoAssetHashInfo(rawPath) {
    const norm = normalizeRepoAssetPath(rawPath);
    if (!norm || !REPO_ASSET_HASHES) return null;
    if (REPO_ASSET_HASHES[norm]) return REPO_ASSET_HASHES[norm];
    const lower = norm.toLowerCase();
    for (const [k, v] of Object.entries(REPO_ASSET_HASHES)) {
        if (k.toLowerCase() === lower) return v;
    }
    return null;
}

export function getRepoAssetHashesMap() {
    return { ...(REPO_ASSET_HASHES || {}) };
}

export function getRepoBaselineDocsManifest() {
    const out = {};
    Object.entries(REPO_DOCS_MANIFEST || {}).forEach(([k, v]) => {
        if (v && typeof v === 'object') {
            out[k] = { ...v };
        }
    });
    return out;
}

export function getRepoBaselineModelsList() {
    return Array.isArray(REPO_MODELS_LIST)
        ? REPO_MODELS_LIST.map((m) => ({ ...m }))
        : [];
}

/**
 * Convierte cualquier ruta relativa del proyecto (ej. "assets/ui/ASPIRANTE.jpg")
 * en una URL relativa con hash de contenido (?v=<sha256>) para anular cachés en GitHub Pages.
 */
export function resolveVersionedAssetUrl(rawPath, overrideToken = '') {
    if (!rawPath || typeof rawPath !== 'string') return '';
    const trimmed = rawPath.trim();
    if (!trimmed || /^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;

    const clean = trimmed.split('#')[0].split('?')[0];
    const hashInfo = getRepoAssetHashInfo(clean);
    const versionToken = String(overrideToken || hashInfo?.hash || REPO_BUILD_TIMESTAMP || '');
    const relativePath = clean.startsWith('./')
        ? clean
        : (clean.startsWith('/') ? `.${clean}` : `./${clean}`);

    return versionToken ? `${relativePath}?v=${encodeURIComponent(versionToken)}` : relativePath;
}

/**
 * Consulta el estado actual en disco en tiempo de ejecución (solo dev server Vite)
 * para detectar diferencias respecto al snapshot compilado del repositorio.
 */
export async function fetchLiveRepoAssetsStatus() {
    try {
        const res = await fetch(`/api/repo-assets-status?v=${Date.now()}`, { cache: 'no-store' });
        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || !ctype.includes('application/json')) return null;
        const data = await res.json();
        return data && data.success ? data : null;
    } catch {
        return null;
    }
}
