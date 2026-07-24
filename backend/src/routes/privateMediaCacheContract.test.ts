import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const filesRoute = fs.readFileSync(new URL('./files.ts', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

test('authenticated and signed local media are never marked public-cacheable', () => {
    assert.doesNotMatch(filesRoute, /['"]public,\s*max-age=/);
    assert.match(filesRoute, /PRIVATE_MEDIA_CACHE_CONTROL/);
    assert.match(indexSource, /setHeaders:\s*\(_res\)\s*=>\s*\{/);
    assert.match(indexSource, /PRIVATE_MEDIA_CACHE_CONTROL/);
});
