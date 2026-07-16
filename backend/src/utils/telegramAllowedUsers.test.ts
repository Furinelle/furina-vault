import assert from 'node:assert/strict';
import {
    parseTelegramAllowedUserIds,
    serializeTelegramAllowedUserIds,
    shouldAutoAllowFirstTelegramUser,
} from './authSettings.js';

assert.deepEqual(parseTelegramAllowedUserIds('123, 456\n789'), [123, 456, 789]);
assert.deepEqual(parseTelegramAllowedUserIds('123,abc,0,-1,123'), [123]);
assert.equal(serializeTelegramAllowedUserIds([456, 123, 456]), '123,456');

assert.equal(shouldAutoAllowFirstTelegramUser([], 0), true);
assert.equal(shouldAutoAllowFirstTelegramUser([123], 0), false);
assert.equal(shouldAutoAllowFirstTelegramUser([], 1), false);

console.log('telegram allowed users helpers ok');
