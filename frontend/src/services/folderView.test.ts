import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFolderViewModels, isFileViewEmpty } from './folderView';

const coverFile = {
    id: 'cover-1',
    name: 'cover.jpg',
    stored_name: 'cover.jpg',
    type: 'image' as const,
    mime_type: 'image/jpeg',
    size: '1.0 MiB',
    date: '刚刚',
    previewUrl: '/preview/cover-1',
    created_at: '2026-07-14T00:00:00.000Z',
};

test('root view renders server folder aggregations even when the root file page is empty', () => {
    const folders = buildFolderViewModels([
        {
            name: '相册',
            fileCount: 748,
            totalSizeBytes: 104351984,
            latestDate: '2026-07-14T00:00:00.000Z',
            isFavorite: true,
            coverFile,
        },
    ], { key: 'date', direction: 'desc' });

    assert.equal(folders.length, 1);
    assert.equal(folders[0].name, '相册');
    assert.equal(folders[0].fileCount, 748);
    assert.equal(folders[0].coverFile?.id, 'cover-1');
    assert.equal(folders[0].isFavorite, true);
    assert.equal(isFileViewEmpty([], folders), false);
});

test('root view is empty only when both loose files and folder aggregations are empty', () => {
    assert.equal(isFileViewEmpty([], []), true);
    assert.equal(isFileViewEmpty([coverFile], []), false);
});
