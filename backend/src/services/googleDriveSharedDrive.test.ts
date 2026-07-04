import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleDriveStorageProvider } from './storage.js';

type CallRecord = { method: string; params: any };

async function main() {
    const tempDir = await mkdtemp(join(tmpdir(), 'tg-vault-gdrive-test-'));
    const tempFile = join(tempDir, 'upload.txt');
    await writeFile(tempFile, 'demo');

    const provider = new GoogleDriveStorageProvider(
        'account-id',
        'client-id',
        'client-secret',
        'refresh-token',
        'http://localhost/callback',
        'shared-drive-id'
    );

    const calls: CallRecord[] = [];
    const createdIds = ['tg-vault-folder-id', 'nested-folder-id', 'uploaded-file-id'];
    let createIndex = 0;

    (provider as any).oauth2Client = {
        getAccessToken: async () => ({ token: 'access-token', res: { data: { expiry_date: Date.now() + 3600_000 } } })
    };
    (provider as any).drive = {
        files: {
            list: async (params: any) => {
                calls.push({ method: 'files.list', params });
                return { data: { files: [] } };
            },
            create: async (params: any) => {
                calls.push({ method: 'files.create', params });
                return { data: { id: createdIds[createIndex++] } };
            },
            get: async (params: any) => {
                calls.push({ method: 'files.get', params });
                return { data: { size: '123', webViewLink: 'https://drive.google.com/file/d/uploaded-file-id/view' } };
            },
            delete: async (params: any) => {
                calls.push({ method: 'files.delete', params });
                return { data: {} };
            },
        },
        permissions: {
            create: async (params: any) => {
                calls.push({ method: 'permissions.create', params });
                return { data: {} };
            },
        },
    };

    try {
        await provider.saveFile(tempFile, 'demo.txt', 'text/plain', 'nested');
        await provider.getFileSize('uploaded-file-id');
        await provider.createShareLink('uploaded-file-id');
        await provider.deleteFile('uploaded-file-id');
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }

    const sharedDriveMethods = new Set(['files.list', 'files.create', 'files.get', 'files.delete', 'permissions.create']);
    const relevantCalls = calls.filter(call => sharedDriveMethods.has(call.method));
    assert.ok(relevantCalls.length > 0, 'expected Google Drive API calls to be captured');

    for (const call of relevantCalls) {
        assert.equal(call.params.supportsAllDrives, true, `${call.method} should support all drives`);
    }

    const listCalls = calls.filter(call => call.method === 'files.list');
    for (const call of listCalls) {
        assert.equal(call.params.includeItemsFromAllDrives, true, 'folder lookup should include shared drive items');
        assert.equal(call.params.corpora, 'drive', 'folder lookup should search within the configured shared drive');
        assert.equal(call.params.driveId, 'shared-drive-id', 'folder lookup should target the configured shared drive ID');
    }
    assert.match(listCalls[0].params.q, /'shared-drive-id' in parents/, 'top-level folder lookup should use shared drive ID as parent');
    assert.match(listCalls[1].params.q, /'tg-vault-folder-id' in parents/, 'nested folder lookup should use parent folder ID');

    const firstFolderCreate = calls.find(call => call.method === 'files.create')!;
    assert.deepEqual(firstFolderCreate.params.resource.parents, ['shared-drive-id'], 'top-level TG Vault folder should be created in shared drive root');

    console.log('google drive shared drive options ok');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
