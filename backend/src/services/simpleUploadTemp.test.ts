import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    cleanupStaleSimpleUploadTempFiles,
    resolveSimpleUploadTempDir,
} from './simpleUploadTemp.js';

test('simple upload temp directory follows the persistent upload volume', () => {
    assert.equal(
        resolveSimpleUploadTempDir({ UPLOAD_DIR: '/data/uploads' }),
        '/data/temp',
    );
    assert.equal(
        resolveSimpleUploadTempDir({ UPLOAD_DIR: '/data/uploads', UPLOAD_TEMP_DIR: '/scratch/tg-vault' }),
        '/scratch/tg-vault',
    );
});

test('stale simple-upload files are cleaned without touching active files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-vault-simple-temp-'));
    const stale = path.join(root, 'stale.tmp');
    const active = path.join(root, 'active.tmp');
    await fs.writeFile(stale, 'stale');
    await fs.writeFile(active, 'active');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await fs.utimes(stale, old, old);

    const removed = await cleanupStaleSimpleUploadTempFiles(root, 24 * 60 * 60 * 1000);
    assert.deepEqual(removed, [stale]);
    await assert.rejects(fs.stat(stale), /ENOENT/);
    assert.equal((await fs.stat(active)).isFile(), true);
    await fs.rm(root, { recursive: true, force: true });
});
