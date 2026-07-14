import assert from 'node:assert/strict';
import {
    annotateTelegramMediaGroup,
    createTelegramMediaGroupDebouncer,

    getForwardedSourceLookup,
    prefetchForwardedSourceMessages,
    takePendingMediaGroupSnapshot,
    telegramMediaGroupQueueKey,
} from './telegramMediaGroup.js';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDebouncerWaitsForQuietWindow() {
    const fired: string[] = [];
    const debouncer = createTelegramMediaGroupDebouncer({ delayMs: 30, onReady: (id: string) => { fired.push(id); } });

    debouncer.bump('album-1');
    await sleep(20);
    debouncer.bump('album-1');
    await sleep(20);
    assert.deepEqual(fired, []);

    await sleep(25);
    assert.deepEqual(fired, ['album-1']);
}

async function testDebouncerCanFlushImmediately() {
    const fired: string[] = [];
    const debouncer = createTelegramMediaGroupDebouncer({ delayMs: 1000, onReady: (id: string) => { fired.push(id); } });

    debouncer.bump('album-2');
    debouncer.flush('album-2');

    assert.deepEqual(fired, ['album-2']);
    await sleep(20);
    assert.deepEqual(fired, ['album-2']);
}

async function testAnnotatesStableCaptionAndIndexesForAlbumSizes() {
    for (const size of [2, 3, 4, 9, 10]) {
        const items = Array.from({ length: size }, (_, index) => ({
            message: { id: 100 + index, message: index === size - 1 ? 'album title\nbody' : '' },
        }));

        annotateTelegramMediaGroup(items);

        assert.deepEqual(items.map(item => (item as any).groupIndex), Array.from({ length: size }, (_, index) => index + 1));
        assert.deepEqual(items.map(item => (item as any).groupSize), Array(size).fill(size));
        assert.deepEqual(items.map(item => (item as any).sharedCaption), Array(size).fill('album title'));
    }
}

async function testAnnotatesMixedMediaInTelegramMessageOrder() {
    const items: Array<{ message: { id: number; caption: string }; mimeType: string; groupIndex?: number; groupSize?: number; sharedCaption?: string | null }> = [
        { message: { id: 12, caption: '' }, mimeType: 'video/mp4' },
        { message: { id: 10, caption: '' }, mimeType: 'image/jpeg' },
        { message: { id: 11, caption: 'mixed album' }, mimeType: 'audio/ogg' },
    ];

    annotateTelegramMediaGroup(items);

    assert.deepEqual(items.map(item => item.groupIndex), [3, 1, 2]);
    assert.deepEqual(items.map(item => item.groupSize), [3, 3, 3]);
    assert.deepEqual(items.map(item => item.sharedCaption), ['mixed album', 'mixed album', 'mixed album']);
}

async function testQueueKeySeparatesChatsWithSameGroupedId() {
    assert.notEqual(telegramMediaGroupQueueKey('chat-1', 'group-9'), telegramMediaGroupQueueKey('chat-2', 'group-9'));
    assert.equal(telegramMediaGroupQueueKey('chat-1', 'group-9'), 'chat-1:group-9');
}

function testPendingSnapshotSkipsProcessedAndDuplicateMessages() {
    const items = [
        { status: 'success', message: { id: 1 } },
        { status: 'pending', message: { id: 3 } },
        { status: 'pending', message: { id: 2 } },
        { status: 'pending', message: { id: 3 } },
        { status: 'queued', message: { id: 4 } },
    ];
    assert.deepEqual(takePendingMediaGroupSnapshot(items).map(item => item.message.id), [2, 3]);
}

async function testForwardedSourceLookupUsesOneFetchPerPeer() {
    const peerA = { className: 'PeerChannel', channelId: { toString: () => '100' } };
    const peerB = { className: 'PeerChannel', channelId: { toString: () => '200' } };
    const messages = [
        { id: 1, fwdFrom: { savedFromPeer: peerA, savedFromMsgId: 101 } },
        { id: 2, fwdFrom: { savedFromPeer: peerA, savedFromMsgId: 102 } },
        { id: 3, fwdFrom: { savedFromPeer: peerB, savedFromMsgId: 201 } },
        { id: 4, fwdFrom: { savedFromPeer: peerA } },
    ] as any[];
    const calls: Array<{ peer: any; ids: number[] }> = [];
    const client = {
        async getMessages(peer: any, options: { ids: number[] }) {
            calls.push({ peer, ids: options.ids });
            return options.ids.map(id => ({ id, media: `media-${id}` }));
        },
    } as any;

    const cache = await prefetchForwardedSourceMessages(client, messages);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => call.ids), [[101, 102], [201]]);
    assert.equal(getForwardedSourceLookup(cache, messages[0])?.id, 101);
    assert.equal(getForwardedSourceLookup(cache, messages[1])?.id, 102);
    assert.equal(getForwardedSourceLookup(cache, messages[2])?.id, 201);
    assert.equal(getForwardedSourceLookup(cache, messages[3]), undefined);
}

async function main() {
    await testDebouncerWaitsForQuietWindow();
    await testDebouncerCanFlushImmediately();
    await testAnnotatesStableCaptionAndIndexesForAlbumSizes();
    await testAnnotatesMixedMediaInTelegramMessageOrder();
    await testQueueKeySeparatesChatsWithSameGroupedId();
    testPendingSnapshotSkipsProcessedAndDuplicateMessages();
    await testForwardedSourceLookupUsesOneFetchPerPeer();
}

main().then(() => console.log('telegram media group ok'));
