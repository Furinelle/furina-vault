import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'signed-url-policy-test-secret-32-bytes';

const {
    SIGNED_URL_MAX_EXPIRES_IN_SECONDS,
    getSignedUrl,
} = await import('./signedUrl.js');

function expiresFrom(url: string): number {
    return Number(new URL(url, 'https://vault.example').searchParams.get('expires'));
}

test('signed URL helper enforces type-specific default lifetimes', () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
        assert.equal(
            expiresFrom(getSignedUrl('file-id', 'preview')) - Date.now(),
            SIGNED_URL_MAX_EXPIRES_IN_SECONDS.preview * 1000,
        );
        assert.equal(
            expiresFrom(getSignedUrl('file-id', 'thumbnail')) - Date.now(),
            SIGNED_URL_MAX_EXPIRES_IN_SECONDS.thumbnail * 1000,
        );
    } finally {
        Date.now = originalNow;
    }
});

test('signed URL helper clamps explicit lifetimes to the per-type maximum', () => {
    const originalNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
        const expires = expiresFrom(getSignedUrl('file-id', 'preview', 7 * 24 * 60 * 60));
        assert.equal(
            expires - Date.now(),
            SIGNED_URL_MAX_EXPIRES_IN_SECONDS.preview * 1000,
        );
    } finally {
        Date.now = originalNow;
    }
});
