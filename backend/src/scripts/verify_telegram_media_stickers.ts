import { extractFileInfo } from '../utils/telegramMedia.js';

function assert(condition: unknown, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

const stickerMessage = {
    id: 123,
    media: { className: 'MessageMediaDocument' },
    sticker: { className: 'Document' },
};

const result = extractFileInfo(stickerMessage as any);
assert(result === null, `expected Telegram sticker to be ignored, got ${JSON.stringify(result)}`);
console.log('telegramMedia sticker exclusion test passed');
