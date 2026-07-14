import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relative: string) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Telegram, yt-dlp, web and chunk permanent writes all hold account operation leases', () => {
    const upload = read('../routes/upload.ts');
    const chunks = read('../routes/chunkedUpload.ts');
    const telegram = read('./telegramUpload.ts');
    const ytdlp = read('./ytDlpDownload.ts');
    assert.match(upload, /acquireStorageAccountOperationLease\(pool, activeAccountId, 'web_upload'/);
    assert.match(upload, /await storageLease\?\.release\(\)/);
    assert.match(chunks, /acquireStorageAccountOperationLease\(pool, session\.targetAccountId, 'chunk_completion'/);
    assert.match(chunks, /await storageLease\?\.release\(\)/);
    assert.equal((telegram.match(/withStorageAccountOperationLease\(pool, activeAccountId, 'telegram_upload'/g) || []).length, 2);
    assert.match(ytdlp, /withStorageAccountOperationLease\(pool, activeAccountId, 'ytdlp_upload'/);
});

test('Telegram job target snapshot and storage switch participate in account row locking transactions', () => {
    const jobs = read('./telegramChannelJobs.ts');
    const storage = read('./storage.ts');
    assert.match(jobs, /await lockStorageAccountForUse\(client, target\.accountId\)/);
    assert.match(jobs, /INSERT INTO telegram_background_jobs[\s\S]*await client\.query\('COMMIT'\)/);
    assert.match(storage, /switchStorageToLocalWithClient/);
    assert.match(storage, /switchStorageAccountWithClient/);
    assert.match(storage, /await client\.query\('BEGIN'\)[\s\S]*await client\.query\('COMMIT'\)/);
});
