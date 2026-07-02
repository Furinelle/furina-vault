import path from 'path';
import { query } from '../db/index.js';
import { safeUnlink } from './localPath.js';

export const CLOUD_SOURCES = new Set(['onedrive', 'aliyun_oss', 's3', 'webdav', 'google_drive']);

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './data/uploads');
const THUMBNAIL_DIR = path.resolve(process.env.THUMBNAIL_DIR || './data/thumbnails');

export interface StorageScope {
    clause: string;
    params: any[];
}

export async function getCurrentStorageScope(): Promise<StorageScope> {
    const { storageManager } = await import('../services/storage.js');
    const provider = storageManager.getProvider();

    if (provider.name === 'local') {
        return { clause: "source = 'local'", params: [] };
    }

    return { clause: 'storage_account_id = $1', params: [storageManager.getActiveAccountId()] };
}

export function nextParam(scope: StorageScope, offset: number): string {
    return `$${scope.params.length + offset}`;
}

export async function getScopedFileById(id: string): Promise<any | null> {
    const scope = await getCurrentStorageScope();
    const result = await query(
        `SELECT * FROM files WHERE ${scope.clause} AND id = ${nextParam(scope, 1)}`,
        [...scope.params, id]
    );
    return result.rows[0] || null;
}

export async function removePhysicalFile(file: any): Promise<void> {
    if (CLOUD_SOURCES.has(file.source)) {
        const { storageManager } = await import('../services/storage.js');
        const provider = storageManager.getProvider(`${file.source}:${file.storage_account_id}`);
        await provider.deleteFile(file.path);
    } else {
        const filePath = file.path || path.join(UPLOAD_DIR, file.stored_name);
        await safeUnlink(filePath, UPLOAD_DIR);
    }

    if (file.thumbnail_path) {
        const thumbPath = path.join(THUMBNAIL_DIR, path.basename(file.thumbnail_path));
        await safeUnlink(thumbPath, THUMBNAIL_DIR);
    }
}

export async function updateScopedFileById(id: string, setSql: string, values: any[]): Promise<number> {
    const scope = await getCurrentStorageScope();
    const idParam = nextParam(scope, values.length + 1);
    const result = await query(
        `UPDATE files SET ${setSql} WHERE ${scope.clause} AND id = ${idParam}`,
        [...scope.params, ...values, id]
    );
    return result.rowCount || 0;
}
