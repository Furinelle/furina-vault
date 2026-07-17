import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

test('CORS permits the one-time destructive confirmation header', () => {
    assert.match(source, /allowedHeaders:\s*\[[^\]]*'X-Confirmation-Token'/s);
});
