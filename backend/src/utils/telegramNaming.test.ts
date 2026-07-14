import assert from 'node:assert/strict';
import { buildTelegramGeneratedFileName, applyTelegramGeneratedBaseName, isGeneratedTelegramDisplayName, resolveTelegramGeneratedFileName } from './telegramNaming.js';

function main() {
    assert.equal(isGeneratedTelegramDisplayName('image_12873.jpg', 12873), true);
    assert.equal(isGeneratedTelegramDisplayName('video_12873.mp4', 12873), true);
    assert.equal(isGeneratedTelegramDisplayName('audio_12873.ogg', 12873), true);
    assert.equal(isGeneratedTelegramDisplayName('file_12873', 12873), true);
    assert.equal(isGeneratedTelegramDisplayName('file_12873.pdf', 12873), true);
    assert.equal(isGeneratedTelegramDisplayName('image_vacation.jpg', 12873), false);
    assert.equal(isGeneratedTelegramDisplayName('video_project.mp4', 12873), false);
    assert.equal(isGeneratedTelegramDisplayName('audio_notes.ogg', 12873), false);
    assert.equal(isGeneratedTelegramDisplayName('file_report.pdf', 12873), false);

    const deterministicOptions = {
        currentFileName: 'image_12873.jpg',
        mimeType: 'image/jpeg',
        caption: '',
        messageId: 12873,
    };
    assert.equal(resolveTelegramGeneratedFileName(deterministicOptions), 'image_12873.jpg');
    assert.equal(resolveTelegramGeneratedFileName(deterministicOptions), resolveTelegramGeneratedFileName(deterministicOptions));

    assert.equal(
        resolveTelegramGeneratedFileName({
            currentFileName: 'file_12873',
            mimeType: 'application/pdf',
            caption: '报告',
            messageId: 12873,
        }),
        '报告.pdf'
    );

    assert.equal(
        buildTelegramGeneratedFileName({
            caption: '夏日壁纸\n第二行忽略',
            mimeType: 'image/jpeg',
            extension: '.jpg',
            randomSuffix: 'unused',
        }),
        '夏日壁纸.jpg'
    );

    assert.equal(
        buildTelegramGeneratedFileName({
            caption: '已有后缀.mp4',
            mimeType: 'video/mp4',
            extension: '.mp4',
            randomSuffix: 'unused',
        }),
        '已有后缀.mp4'
    );

    assert.equal(
        buildTelegramGeneratedFileName({
            caption: '已有其他后缀.txt',
            mimeType: 'video/mp4',
            extension: '.mp4',
            randomSuffix: 'unused',
        }),
        '已有其他后缀.mp4'
    );

    assert.equal(
        buildTelegramGeneratedFileName({
            caption: '___...',
            mimeType: 'image/jpeg',
            extension: '.jpg',
            randomSuffix: '12873',
        }),
        'image_12873.jpg'
    );

    assert.equal(
        applyTelegramGeneratedBaseName('video_12873.mp4', {
            caption: '',
            mimeType: 'video/mp4',
            randomSuffix: 'abc123',
        }),
        'video_abc123.mp4'
    );

    assert.equal(
        buildTelegramGeneratedFileName({
            caption: undefined,
            mimeType: 'audio/ogg',
            extension: '.ogg',
            randomSuffix: 'voiceid',
        }),
        'audio_voiceid.ogg'
    );

    assert.equal(
        buildTelegramGeneratedFileName({
            caption: undefined,
            mimeType: 'application/octet-stream',
            extension: 'bin',
            randomSuffix: 'x y',
        }),
        'file_x_y.bin'
    );
    assert.equal(
        resolveTelegramGeneratedFileName({
            currentFileName: 'image_12874.jpg',
            mimeType: 'image/jpeg',
            caption: '',
            sharedCaption: '相册标题',
            sequenceNumber: 1,
            randomSuffix: 'unused',
            messageId: 12874,
        }),
        '相册标题_01.jpg'
    );

    assert.equal(
        resolveTelegramGeneratedFileName({
            currentFileName: 'image_12874.jpg',
            mimeType: 'image/jpeg',
            caption: '',
            sharedCaption: '相册标题',
            randomSuffix: 'unused',
            messageId: 12874,
        }),
        '相册标题.jpg'
    );

    assert.equal(
        resolveTelegramGeneratedFileName({
            currentFileName: '原始文件.pdf',
            mimeType: 'application/pdf',
            caption: '',
            sharedCaption: '相册标题',
            randomSuffix: 'unused',
            messageId: 12875,
        }),
        '原始文件.pdf'
    );

    assert.equal(
        resolveTelegramGeneratedFileName({
            currentFileName: 'image_vacation.jpg',
            mimeType: 'image/jpeg',
            caption: '不应覆盖原名',
            messageId: 12875,
        }),
        'image_vacation.jpg'
    );
}

main();
console.log('telegram naming ok');
