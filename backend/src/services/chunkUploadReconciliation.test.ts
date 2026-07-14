import assert from 'node:assert/strict';
import test from 'node:test';
import {
    beginChunkCompletionReconciliation,
    markChunkReconciliationIndexPresent,
    markChunkReconciliationObjectPresent,
    compensateChunkCompletionFailure,
    persistChunkReconciliation,
} from './chunkUploadReconciliation.js';

test('completion side effects are journaled before save and each durable state transition', async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const db = { query: async (text: string, params?: unknown[]) => { calls.push({ text, params }); return { rows: [], rowCount: 1 }; } };
    const operationId = await beginChunkCompletionReconciliation(db, {
        uploadId: '11111111-1111-4111-8111-111111111111',
        completionToken: '22222222-2222-4222-8222-222222222222',
        provider: 's3', accountId: null,
    });
    await markChunkReconciliationObjectPresent(db, operationId, 'bucket/key');
    await markChunkReconciliationIndexPresent(db, operationId, '44444444-4444-4444-8444-444444444444');
    assert.match(calls[0].text, /INSERT INTO chunk_upload_reconciliations/);
    assert.deepEqual(calls[0].params?.slice(1), [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', 's3', null,
    ]);
    assert.match(calls[1].text, /object_state = 'present'/);
    assert.match(calls[2].text, /index_state = 'present'/);
});

test('failed object compensation persists durable reconciliation identity and evidence', async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const db = {
        query: async (text: string, params?: unknown[]) => {
            calls.push({ text, params });
            return { rows: [], rowCount: 1 };
        },
    };

    const operationId = await persistChunkReconciliation(db, {
        uploadId: '11111111-1111-4111-8111-111111111111',
        completionToken: '22222222-2222-4222-8222-222222222222',
        provider: 's3',
        accountId: '33333333-3333-4333-8333-333333333333',
        storedPath: 'bucket/key',
        fileId: '44444444-4444-4444-8444-444444444444',
        objectState: 'present',
        indexState: 'deleted',
        reason: 'provider timeout',
    });

    assert.match(operationId, /^[0-9a-f-]{36}$/);
    assert.match(calls[0].text, /INSERT INTO chunk_upload_reconciliations/);
    assert.deepEqual(calls[0].params?.slice(1), [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        's3',
        '33333333-3333-4333-8333-333333333333',
        'bucket/key',
        '44444444-4444-4444-8444-444444444444',
        'present',
        'deleted',
        'provider timeout',
    ]);
});

test('completion compensation persists exact partial outcome when either cleanup fails', async () => {
    const evidence: any[] = [];
    const result = await compensateChunkCompletionFailure({
        uploadId: '11111111-1111-4111-8111-111111111111',
        completionToken: '22222222-2222-4222-8222-222222222222',
        provider: 's3',
        accountId: null,
        storedPath: 'bucket/key',
        fileId: '44444444-4444-4444-8444-444444444444',
        deleteObject: async () => { throw new Error('object timeout'); },
        deleteIndex: async () => true,
        persist: async value => { evidence.push(value); return 'operation-1'; },
    });
    assert.deepEqual(result, { reconciled: false, operationId: 'operation-1' });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].objectState, 'unknown');
    assert.equal(evidence[0].indexState, 'deleted');
    assert.match(evidence[0].reason, /object timeout/);
});

test('completion compensation resolves the existing journal when both cleanups are confirmed', async () => {
    let persisted = false;
    const result = await compensateChunkCompletionFailure({
        uploadId: '11111111-1111-4111-8111-111111111111',
        completionToken: '22222222-2222-4222-8222-222222222222',
        provider: 'local', accountId: null, storedPath: 'file', fileId: '44444444-4444-4444-8444-444444444444',
        deleteObject: async () => undefined,
        deleteIndex: async () => true,
        persist: async evidence => {
            persisted = true;
            assert.equal(evidence.objectState, 'deleted');
            assert.equal(evidence.indexState, 'deleted');
            return 'operation-1';
        },
    });
    assert.deepEqual(result, { reconciled: true, operationId: 'operation-1' });
    assert.equal(persisted, true);
});
