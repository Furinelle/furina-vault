import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleDriveStorageProvider, StorageQuotaCooldownError } from './storage.js';

async function main() {
    const tempDir = await mkdtemp(join(tmpdir(), 'tg-vault-gdrive-quota-test-'));
    const tempFile = join(tempDir, 'upload.txt');
    await writeFile(tempFile, 'demo');

    const provider = new GoogleDriveStorageProvider(
        'account-id',
        'client-id',
        'client-secret',
        'refresh-token',
        'http://localhost/callback'
    );

    (provider as any).oauth2Client = {
        getAccessToken: async () => ({ token: 'access-token', res: { data: { expiry_date: Date.now() + 3600_000 } } })
    };
    (provider as any).drive = {
        files: {
            list: async () => ({ data: { files: [{ id: 'tg-vault-folder-id' }] } }),
            create: async () => {
                const error: any = new Error('The user has exceeded their Drive upload limit. Please try again later.');
                error.code = 403;
                error.response = {
                    status: 403,
                    data: {
                        error: {
                            status: 'PERMISSION_DENIED',
                            errors: [{ reason: 'dailyLimitExceeded', message: 'The user has exceeded their Drive upload limit' }]
                        }
                    }
                };
                throw error;
            },
        },
    };

    try {
        await assert.rejects(
            () => provider.saveFile(tempFile, 'demo.txt', 'text/plain', null),
            (error: unknown) => {
                assert.ok(error instanceof StorageQuotaCooldownError, 'daily upload quota errors should use StorageQuotaCooldownError');
                assert.equal((error as StorageQuotaCooldownError).provider, 'google_drive');
                assert.equal((error as StorageQuotaCooldownError).reason, 'daily_upload_limit');
                assert.equal((error as StorageQuotaCooldownError).storageAccountId, 'account-id');
                assert.ok((error as StorageQuotaCooldownError).cooldownUntil.getTime() > Date.now() + 23 * 60 * 60 * 1000);
                return true;
            }
        );

        (provider as any).folderIdCache.clear();
        (provider as any).drive.files.create = async () => {
            const error: any = new Error('User rate limit exceeded');
            error.code = 403;
            error.response = {
                status: 403,
                data: {
                    error: {
                        status: 'RESOURCE_EXHAUSTED',
                        errors: [{ reason: 'userRateLimitExceeded', message: 'User rate limit exceeded' }]
                    }
                }
            };
            throw error;
        };

        await assert.rejects(
            () => provider.saveFile(tempFile, 'demo.txt', 'text/plain', null),
            (error: unknown) => {
                assert.ok(!(error instanceof StorageQuotaCooldownError), 'generic API rate limits must not pause uploads for 24 hours');
                assert.match((error as Error).message, /Google Drive upload failed/);
                return true;
            }
        );
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }

    console.log('google drive quota cooldown error ok');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
