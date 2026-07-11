import assert from 'node:assert/strict';
import { extractFileInfo } from './telegramMedia.js';

function message(overrides: Record<string, any>) {
    return {
        id: 12873,
        date: 1783348522,
        chat: { title: '美图/频道' },
        ...overrides,
    } as any;
}

function doc(attrs: any[] = [], mimeType = 'application/octet-stream') {
    return {
        className: 'Document',
        attributes: attrs,
        mimeType,
        size: 1024,
    };
}

function main() {
    assert.deepEqual(
        extractFileInfo(message({ photo: { className: 'Photo', sizes: [{}] }, media: { className: 'MessageMediaPhoto' } })),
        { fileName: 'image_12873.jpg', mimeType: 'image/jpeg', generatedName: true }
    );

    assert.deepEqual(
        extractFileInfo(message({ video: doc([{ className: 'DocumentAttributeVideo' }], 'video/mp4'), media: { className: 'MessageMediaDocument' } })),
        { fileName: 'video_12873.mp4', mimeType: 'video/mp4', generatedName: true }
    );

    assert.deepEqual(
        extractFileInfo(message({ audio: doc([{ className: 'DocumentAttributeAudio' }], 'audio/mpeg'), media: { className: 'MessageMediaDocument' } })),
        { fileName: 'audio_12873.mp3', mimeType: 'audio/mpeg', generatedName: true }
    );

    assert.deepEqual(
        extractFileInfo(message({ voice: doc([], 'audio/ogg'), media: { className: 'MessageMediaDocument' } })),
        { fileName: 'audio_12873.ogg', mimeType: 'audio/ogg', generatedName: true }
    );

    assert.deepEqual(
        extractFileInfo(message({ document: doc([{ className: 'DocumentAttributeFilename', fileName: '原始文件.pdf' }], 'application/pdf'), media: { className: 'MessageMediaDocument' } })),
        { fileName: '原始文件.pdf', mimeType: 'application/pdf', generatedName: false }
    );

    assert.deepEqual(
        extractFileInfo(message({
            document: doc([
                { className: 'DocumentAttributeFilename', fileName: 'video_project.mov' },
                { className: 'DocumentAttributeVideo' },
            ], 'video/quicktime'),
            media: { className: 'MessageMediaDocument' },
        })),
        { fileName: 'video_project.mov', mimeType: 'video/quicktime', generatedName: false }
    );

    assert.deepEqual(
        extractFileInfo(message({
            document: doc([
                { className: 'DocumentAttributeFilename', fileName: 'file_report' },
                { className: 'DocumentAttributeVideo' },
            ], 'video/mp4'),
            media: { className: 'MessageMediaDocument' },
        })),
        { fileName: 'file_report', mimeType: 'video/mp4', generatedName: false }
    );

    assert.deepEqual(
        extractFileInfo(message({
            document: doc([
                { className: 'DocumentAttributeFilename', fileName: 'file_12873.backup.pdf' },
                { className: 'DocumentAttributeVideo' },
            ], 'application/pdf'),
            media: { className: 'MessageMediaDocument' },
        })),
        { fileName: 'file_12873.backup.pdf', mimeType: 'application/pdf', generatedName: false }
    );
}

main();
console.log('telegram media naming ok');
