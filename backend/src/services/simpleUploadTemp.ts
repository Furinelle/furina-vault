import fs from 'node:fs/promises';
import path from 'node:path';

export function resolveSimpleUploadTempDir(
    env: Record<string, string | undefined> = process.env,
): string {
    if (env.UPLOAD_TEMP_DIR?.trim()) return path.resolve(env.UPLOAD_TEMP_DIR);
    const uploadDir = path.resolve(env.UPLOAD_DIR || './data/uploads');
    return path.join(path.dirname(uploadDir), 'temp');
}

export async function cleanupStaleSimpleUploadTempFiles(
    tempDir: string,
    maxAgeMs: number,
): Promise<string[]> {
    const removed: string[] = [];
    const cutoff = Date.now() - maxAgeMs;
    const entries = await fs.readdir(tempDir, { withFileTypes: true }).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    });

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const filePath = path.join(tempDir, entry.name);
        const stats = await fs.lstat(filePath).catch(() => null);
        if (!stats?.isFile() || stats.isSymbolicLink() || stats.mtimeMs >= cutoff) continue;
        await fs.unlink(filePath).catch(error => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        });
        removed.push(filePath);
    }
    return removed.sort();
}
