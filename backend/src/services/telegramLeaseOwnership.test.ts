import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    heartbeatTelegramDownloadRefsWithQuery,
    restoreTelegramDownloadRefsWithQuery,
    withTelegramDownloadRefLease,
    TelegramDownloadLeaseLostError,
    type TelegramJobQuery,
} from './telegramChannelJobs.js';
import { runLeaseProtectedTelegramSave } from './telegramUpload.js';

const ref = { id: 42, source: '@source', origin: 'channel' as const, leaseToken: '11111111-1111-1111-1111-111111111111' };

test('claim locks the parent before selecting children and repeats runnable guards on final CAS', () => {
    const source = fs.readFileSync(new URL('./telegramChannelJobs.ts', import.meta.url), 'utf8');
    const claim = source.slice(source.indexOf('async function claimPendingDownloadRefs'), source.indexOf('export async function restoreTelegramDownloadRefsWithQuery'));
    assert.match(claim, /WITH locked_job AS \([\s\S]*FOR UPDATE OF j[\s\S]*\), candidates AS/);
    assert.match(claim, /JOIN locked_job j ON j\.id = i\.job_id/);
    assert.match(claim, /UPDATE telegram_download_items i[\s\S]*FROM candidates c, telegram_background_jobs j/);
    assert.match(claim, /i\.id = c\.id[\s\S]*i\.status = 'pending'[\s\S]*j\.id = i\.job_id[\s\S]*j\.cancelled_at IS NULL[\s\S]*j\.paused_at IS NULL[\s\S]*j\.finished_at IS NULL/);
    assert.match(claim, /j\.status NOT IN \('cancelled', 'paused', 'cooling'\)/);
});

test('heartbeat treats a zero-row token update as immediate lease loss', async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    await assert.rejects(
        () => heartbeatTelegramDownloadRefsWithQuery(async (text, params) => {
            calls.push({ text, params });
            return { rows: [], rowCount: 0 };
        }, 'job-1', [ref]),
        TelegramDownloadLeaseLostError,
    );
    assert.match(calls[0].text, /lease_token = \$4::uuid/);
    assert.ok(calls[0].params?.includes(ref.leaseToken));
});

test('stale restore is token-scoped and cannot clear a replacement lease', async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const restored = await restoreTelegramDownloadRefsWithQuery(async (text, params) => {
        calls.push({ text, params });
        return { rows: [], rowCount: 0 };
    }, 'job-1', [ref], 'pending', 'worker paused');

    assert.equal(restored, false);
    assert.match(calls[0].text, /lease_token = \$5::uuid/);
    assert.match(calls[0].text, /lease_token = NULL/);
    assert.ok(calls[0].params?.includes(ref.leaseToken));
});

test('lease transaction refuses the external operation after ownership is lost', async () => {
    const calls: string[] = [];
    let saveCalls = 0;
    const client = {
        async query(text: string) {
            calls.push(text);
            if (/SELECT i\.id/.test(text)) return { rows: [], rowCount: 0 };
            return { rows: [], rowCount: null };
        },
        release() { calls.push('RELEASE'); },
    };

    await assert.rejects(
        () => withTelegramDownloadRefLease({ connect: async () => client } as any, 'job-1', ref, async () => {
            saveCalls += 1;
            return 'saved';
        }),
        TelegramDownloadLeaseLostError,
    );
    assert.equal(saveCalls, 0);
    assert.deepEqual(calls.filter(call => /^(BEGIN|COMMIT|ROLLBACK)$/.test(call)), ['BEGIN', 'ROLLBACK']);
});

test('lease transaction settles success before committing on the same client', async () => {
    const calls: string[] = [];
    const client = {
        async query(text: string) {
            calls.push(text);
            if (/SELECT i\.id/.test(text)) return { rows: [{ id: 'item-1' }], rowCount: 1 };
            if (/UPDATE telegram_download_items/.test(text)) return { rows: [{ status: 'success' }], rowCount: 1 };
            return { rows: [], rowCount: null };
        },
        release() { calls.push('RELEASE'); },
    };

    const result = await withTelegramDownloadRefLease({ connect: async () => client } as any, 'job-1', ref, async () => 'saved');
    assert.equal(result, 'saved');
    assert.ok(calls.indexOf('BEGIN') < calls.findIndex(call => /SELECT i\.id/.test(call)));
    assert.ok(calls.findIndex(call => /UPDATE telegram_download_items/.test(call)) < calls.indexOf('COMMIT'));
});

test('heartbeat skips a lease while its final save and settlement transaction holds the row lock', async () => {
    let heartbeatQueries = 0;
    const client = {
        async query(text: string) {
            if (/SELECT i\.id/.test(text)) return { rows: [{ id: 'item-1' }], rowCount: 1 };
            if (/UPDATE telegram_download_items/.test(text)) return { rows: [{ status: 'success' }], rowCount: 1 };
            return { rows: [], rowCount: null };
        },
        release() {},
    };
    await withTelegramDownloadRefLease({ connect: async () => client } as any, 'job-1', ref, async () => {
        await heartbeatTelegramDownloadRefsWithQuery(async () => {
            heartbeatQueries += 1;
            return { rows: [], rowCount: 0 };
        }, 'job-1', [ref]);
        return 'saved';
    });
    assert.equal(heartbeatQueries, 0);
});

test('external save completes before the final lease transaction opens', async () => {
    const calls: string[] = [];
    const result = await runLeaseProtectedTelegramSave(
        async operation => {
            calls.push('lease:begin');
            const value = await operation();
            calls.push('lease:commit');
            return value;
        },
        async () => {
            calls.push('storage:save');
            return { savedPath: 'remote/object', fileId: 'file-1' };
        },
        async () => ({ status: 'compensated' as const }),
    );

    assert.deepEqual(result, { savedPath: 'remote/object', fileId: 'file-1' });
    assert.deepEqual(calls, ['storage:save', 'lease:begin', 'lease:commit']);
});

test('validation failure after save compensates before the lease transaction may settle success', async () => {
    const calls: string[] = [];
    await assert.rejects(
        () => runLeaseProtectedTelegramSave(
            async operation => operation(),
            async () => ({ savedPath: 'remote/object', fileId: 'file-1' }),
            async persisted => { calls.push(`compensate:${persisted.savedPath}:${persisted.fileId}`); return { status: 'compensated' as const }; },
            async () => { throw new Error('cancelled before settlement'); },
        ),
        /cancelled before settlement/,
    );
    assert.deepEqual(calls, ['compensate:remote/object:file-1']);
});

test('post-save transaction failure compensates the exact index and object', async () => {
    const calls: string[] = [];
    await assert.rejects(
        () => runLeaseProtectedTelegramSave(
            async operation => {
                await operation();
                throw new Error('commit failed');
            },
            async () => ({ savedPath: 'remote/object', fileId: 'file-1' }),
            async persisted => { calls.push(`compensate:${persisted.savedPath}:${persisted.fileId}`); return { status: 'compensated' as const }; },
        ),
        /commit failed/,
    );
    assert.deepEqual(calls, ['compensate:remote/object:file-1']);
});
