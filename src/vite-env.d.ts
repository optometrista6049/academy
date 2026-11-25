/// <reference types="vite/client" />

declare module 'virtual:repo-assets' {
    export interface RepoAssetHashInfo {
        hash: string;
        size: number;
        mtimeMs?: number;
    }

    export interface RepoDocManifestEntry {
        missionId: string;
        missionLabel: string;
        title: string;
        catalogId?: string;
        updatedAt: number;
        sha256?: string;
        size?: number;
    }

    export interface RepoModelEntry {
        filename: string;
        assetPath: string;
        url: string;
        size: number;
        hash: string;
    }

    export const REPO_BUILD_TIMESTAMP: number;
    export const REPO_ASSET_HASHES: Record<string, RepoAssetHashInfo>;
    export const REPO_DOCS_MANIFEST: Record<string, RepoDocManifestEntry>;
    export const REPO_MODELS_LIST: RepoModelEntry[];
}
