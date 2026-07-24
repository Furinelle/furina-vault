import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const authSource = fs.readFileSync(new URL('../routes/auth.ts', import.meta.url), 'utf8');
const uploadSource = fs.readFileSync(new URL('../routes/upload.ts', import.meta.url), 'utf8');
const oauthSource = fs.readFileSync(new URL('../scripts/oauth_onedrive.ts', import.meta.url), 'utf8');

test('login geolocation is HTTPS opt-in and does not use the legacy cleartext provider', () => {
    assert.match(authSource, /IP_GEOLOCATION_URL/);
    assert.match(authSource, /assertPublicHttpsUrl/);
    assert.doesNotMatch(authSource, /http:\/\/ip-api\.com/);
});

test('OAuth helper never prints token fragments or provider response bodies', () => {
    assert.match(oauthSource, /ONEDRIVE_TOKEN_OUTPUT/);
    assert.match(oauthSource, /mode:\s*0o600/);
    assert.doesNotMatch(oauthSource, /access_token\.substring/);
    assert.doesNotMatch(oauthSource, /err\.response\?\.data/);
    assert.doesNotMatch(oauthSource, /res\.end\(`[^`]*\$\{error\}/);
});

test('simple upload logs omit original filenames and temporary paths', () => {
    assert.doesNotMatch(uploadSource, /Received file:\s*\$\{originalName\}/);
    assert.doesNotMatch(uploadSource, /Local temp path:\s*\$\{tempPath\}/);
});
