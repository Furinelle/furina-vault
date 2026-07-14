import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireStorageAccountOperationLease, withStorageAccountOperationLease } from './storageAccountOperation.js';

type Call = { text: string; params: unknown[] };

class ScriptedPool {
    readonly calls: Call[] = [];
    readonly client = {
        query: async (text: string, params: unknown[] = []) => this.reply(text, params),
        release: () => { this.released = true; this.releaseCalls += 1; },
    };
    released = false;
    releaseCalls = 0;
    private leaseReleased = false;
    private renewals = 0;

    async connect() { return this.client; }

    async query(text: string, params: unknown[] = []) { return this.reply(text, params); }

    private async reply(text: string, params: unknown[]) {
        this.calls.push({ text, params });
        if (/^BEGIN$|^COMMIT$|^ROLLBACK$/.test(text)) return { rows: [], rowCount: 0 };
        if (/SELECT id, type FROM storage_accounts/.test(text)) return { rows: [{ id: 'account-1', type: 's3' }], rowCount: 1 };
        if (/INSERT INTO storage_account_leases/.test(text)) return { rows: [{ id: 'lease-1' }], rowCount: 1 };
        if (/SET expires_at/.test(text)) { this.renewals += 1; return { rows: [], rowCount: this.leaseReleased ? 0 : 1 }; }
        if (/SET released_at/.test(text)) { this.leaseReleased = true; return { rows: [], rowCount: 1 }; }
        return { rows: [], rowCount: 0 };
    }

    renewalCount() { return this.renewals; }
}

test('cloud operation lease commits before work, renews, and releases the exact durable lease', async () => {
    const pool = new ScriptedPool();
    const lease = await acquireStorageAccountOperationLease(pool as any, 'account-1', 'web_upload', {
        ttlMs: 40,
        renewalIntervalMs: 5,
    });

    const commitIndex = pool.calls.findIndex(call => call.text === 'COMMIT');
    const insertIndex = pool.calls.findIndex(call => /INSERT INTO storage_account_leases/.test(call.text));
    assert.ok(insertIndex >= 0 && commitIndex > insertIndex);
    assert.equal(pool.releaseCalls, 1);
    assert.equal(pool.calls.filter(call => /SELECT id, type FROM storage_accounts/.test(call.text)).length, 2);

    await new Promise(resolve => setTimeout(resolve, 16));
    assert.ok(pool.renewalCount() >= 1);

    await lease.release();
    assert.equal(pool.released, true);
    assert.equal(pool.releaseCalls, 2);
    const release = pool.calls.find(call => /SET released_at/.test(call.text));
    assert.deepEqual(release?.params, ['lease-1']);
});

test('local operation does not create an account lease', async () => {
    const pool = new ScriptedPool();
    const lease = await acquireStorageAccountOperationLease(pool as any, null, 'web_upload');
    await lease.release();
    assert.equal(pool.calls.length, 0);
});

test('operation wrapper always releases the durable lease after success or failure', async () => {
    const successPool = new ScriptedPool();
    assert.equal(await withStorageAccountOperationLease(successPool as any, 'account-1', 'telegram_upload', async () => 'ok'), 'ok');
    assert.equal(successPool.calls.filter(call => /SET released_at/.test(call.text)).length, 1);

    const failedPool = new ScriptedPool();
    await assert.rejects(
        () => withStorageAccountOperationLease(failedPool as any, 'account-1', 'ytdlp_upload', async () => { throw new Error('save failed'); }),
        /save failed/,
    );
    assert.equal(failedPool.calls.filter(call => /SET released_at/.test(call.text)).length, 1);
});
