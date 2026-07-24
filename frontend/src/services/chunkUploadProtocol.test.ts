import assert from 'node:assert/strict';
import test from 'node:test';
import {
    advanceChunkUploadProgress,
    chunkBounds,
    parseChunkUploadInit,
    runChunkUploadWorkers,
} from './chunkUploadProtocol.js';

test('client uses the server-advertised maximum chunk size and count', () => {
    const init = parseChunkUploadInit({
        uploadId: '11111111-1111-4111-8111-111111111111',
        maxChunkBytes: 32 * 1024 * 1024,
        totalChunks: 2,
    }, 50 * 1024 * 1024);

    assert.equal(init.maxChunkBytes, 32 * 1024 * 1024);
    assert.equal(init.totalChunks, 2);
    assert.deepEqual(chunkBounds(50 * 1024 * 1024, 0, init.maxChunkBytes), {
        start: 0,
        end: 32 * 1024 * 1024,
    });
    assert.deepEqual(chunkBounds(50 * 1024 * 1024, 1, init.maxChunkBytes), {
        start: 32 * 1024 * 1024,
        end: 50 * 1024 * 1024,
    });
});

test('client rejects an invalid or internally inconsistent init contract', () => {
    assert.throws(
        () => parseChunkUploadInit({ uploadId: 'upload', maxChunkBytes: 0, totalChunks: 1 }, 1),
        /初始化响应无效/,
    );
    assert.throws(
        () => parseChunkUploadInit({ uploadId: 'upload', maxChunkBytes: 4, totalChunks: 1 }, 5),
        /初始化响应无效/,
    );
});

test('chunk workers abort siblings and settle them before reporting the first failure', async () => {
    const started: number[] = [];
    const completed: number[] = [];
    let active = 0;

    await assert.rejects(
        runChunkUploadWorkers({
            totalChunks: 12,
            concurrency: 4,
            uploadChunk: async (index, signal) => {
                started.push(index);
                active += 1;
                try {
                    if (index === 0) throw new Error('simulated chunk failure');
                    await new Promise<void>((resolve, reject) => {
                        const timer = setTimeout(resolve, 100);
                        signal.addEventListener('abort', () => {
                            clearTimeout(timer);
                            reject(signal.reason);
                        }, { once: true });
                    });
                    completed.push(index);
                } finally {
                    active -= 1;
                }
            },
        }),
        /simulated chunk failure/,
    );

    assert.equal(active, 0);
    assert.equal(completed.length, 0);
    assert.ok(started.length <= 4);
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(completed.length, 0);
});

test('out-of-order cumulative server progress never double-counts completed chunks', () => {
    const first = advanceChunkUploadProgress({
        localCompletedBytes: 0,
        reportedBytes: 0,
    }, 32, 64, 128);
    assert.deepEqual(first, {
        localCompletedBytes: 32,
        reportedBytes: 64,
    });

    const second = advanceChunkUploadProgress(first, 32, 32, 128);
    assert.deepEqual(second, {
        localCompletedBytes: 64,
        reportedBytes: 64,
    });
});
