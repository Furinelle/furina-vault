import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
    finalizeSubscriptionJobInTransaction,
    type FinalizeSubscriptionJobInput,
} from './telegramChannelJobs.js';

const input: FinalizeSubscriptionJobInput = {
    jobId: 'job-1', subscriptionId: 'sub-1', status: 'completed', safeAdvanceId: 42,
    enqueuedCount: 3, skippedCount: 0, error: null,
};

function fakePool(options: { parentRows: number; cursorRows?: number; cursorError?: Error }) {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
        async query(text: string, params?: unknown[]) {
            calls.push({ text, params });
            if (/UPDATE telegram_background_jobs/.test(text)) {
                return { rows: options.parentRows ? [{ id: 'job-1' }] : [], rowCount: options.parentRows };
            }
            if (/UPDATE telegram_channel_subscriptions/.test(text)) {
                if (options.cursorError) throw options.cursorError;
                return { rows: options.cursorRows === 0 ? [] : [{ id: 'sub-1' }], rowCount: options.cursorRows ?? 1 };
            }
            return { rows: [], rowCount: null };
        },
        release() { calls.push({ text: 'RELEASE' }); },
    };
    return { pool: { connect: async () => client }, calls };
}

test('parent terminal CAS loss rolls back without advancing cursor', async () => {
    const { pool, calls } = fakePool({ parentRows: 0 });
    assert.equal(await finalizeSubscriptionJobInTransaction(pool as any, input), false);
    assert.equal(calls.filter(call => /UPDATE telegram_channel_subscriptions/.test(call.text)).length, 0);
    assert.deepEqual(calls.filter(call => /^(BEGIN|COMMIT|ROLLBACK)$/.test(call.text)).map(call => call.text), ['BEGIN', 'ROLLBACK']);
});

test('cursor failure rolls back parent terminal update', async () => {
    const { pool, calls } = fakePool({ parentRows: 1, cursorError: new Error('cursor unavailable') });
    await assert.rejects(() => finalizeSubscriptionJobInTransaction(pool as any, input), /cursor unavailable/);
    assert.deepEqual(calls.filter(call => /^(BEGIN|COMMIT|ROLLBACK)$/.test(call.text)).map(call => call.text), ['BEGIN', 'ROLLBACK']);
});

test('parent terminal state and monotonic cursor commit together', async () => {
    const { pool, calls } = fakePool({ parentRows: 1, cursorRows: 1 });
    assert.equal(await finalizeSubscriptionJobInTransaction(pool as any, input), true);
    assert.deepEqual(calls.filter(call => /^(BEGIN|COMMIT|ROLLBACK)$/.test(call.text)).map(call => call.text), ['BEGIN', 'COMMIT']);
    const cursor = calls.find(call => /UPDATE telegram_channel_subscriptions/.test(call.text));
    assert.match(cursor?.text || '', /GREATEST\(last_message_id, \$1\)/);
    assert.match(cursor?.text || '', /id = \$2/);
    assert.match(cursor?.text || '', /enabled = true/);
});

test('recovery reuses atomic subscription finalization and never advances cursor separately', () => {
    const source = fs.readFileSync(new URL('./telegramChannelJobs.ts', import.meta.url), 'utf8');
    const recovery = source.slice(source.indexOf('async function recoverTelegramJob'), source.indexOf('export async function repairTelegramJobInvariantsWithQuery'));
    assert.match(recovery, /finalizeSubscriptionJobInTransaction\(/);
    assert.doesNotMatch(recovery, /UPDATE telegram_channel_subscriptions/);
});
