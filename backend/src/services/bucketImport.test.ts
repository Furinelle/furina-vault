import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    normalizeBucketObjectForImport,
    runBucketImport,
    type BucketImportPage,
} from './bucketImport.js';

const schema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const storageRoute = fs.readFileSync(new URL('../routes/storage.ts', import.meta.url), 'utf8');

test('bucket object identity is enforced by PostgreSQL and inserts are conflict-safe', () => {
    assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_files_account_path_unique[\s\S]*storage_account_id,\s*path/);
    assert.match(storageRoute, /ON CONFLICT \(storage_account_id, path\)[\s\S]*DO NOTHING/);
});

test('bucket import rejects keys that cannot be represented safely in the files schema', () => {
    assert.equal(normalizeBucketObjectForImport({ key: '_backups/db.dump', size: 1 }), null);
    assert.equal(normalizeBucketObjectForImport({ key: 'folder/', size: 0 }), null);
    assert.equal(normalizeBucketObjectForImport({ key: `folder/${'x'.repeat(256)}`, size: 1 }), null);
    assert.equal(normalizeBucketObjectForImport({ key: `${'x'.repeat(256)}/file.txt`, size: 1 }), null);
    assert.equal(normalizeBucketObjectForImport({ key: 'bad/../file.txt', size: 1 }), null);
    assert.deepEqual(
        normalizeBucketObjectForImport({ key: 'photos/2026/image.jpg', size: 42 }),
        {
            name: 'image.jpg',
            storedName: 'image.jpg',
            path: 'photos/2026/image.jpg',
            folder: 'photos/2026',
            size: 42,
        },
    );
});

test('bucket import consumes one bounded page at a time and remains retry-safe', async () => {
    const pages = new Map<string | undefined, BucketImportPage>([
        [undefined, {
            objects: [
                { key: 'a.txt', size: 1 },
                { key: '_backups/db.dump', size: 2 },
            ],
            nextContinuationToken: 'next',
        }],
        ['next', {
            objects: [
                { key: 'folder/b.txt', size: 3 },
                { key: `${'x'.repeat(256)}.txt`, size: 4 },
            ],
        }],
    ]);
    const batches: string[][] = [];

    const result = await runBucketImport({
        listPage: async token => pages.get(token)!,
        insertBatch: async records => {
            batches.push(records.map(record => record.path));
            return records.filter(record => record.path !== 'a.txt').length;
        },
    });

    assert.deepEqual(batches, [['a.txt'], ['folder/b.txt']]);
    assert.deepEqual(result, {
        scanned: 4,
        imported: 1,
        skipped: 1,
        excluded: 2,
    });
});
