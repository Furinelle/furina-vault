import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const storageSource = fs.readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');

test('S3 client preserves R2-compatible checksum negotiation', () => {
    assert.match(storageSource, /requestChecksumCalculation:\s*'WHEN_REQUIRED'/);
    assert.match(storageSource, /responseChecksumValidation:\s*'WHEN_REQUIRED'/);
});
