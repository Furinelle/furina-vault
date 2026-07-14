import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChunkUploadInit, chunkBounds } from './chunkUploadProtocol.js';

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
