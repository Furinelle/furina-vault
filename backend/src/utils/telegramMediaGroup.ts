import { Api, TelegramClient } from 'telegram';

export interface TelegramMediaGroupDebouncer {
    bump(mediaGroupId: string): void;
    flush(mediaGroupId: string): void;
    cancel(mediaGroupId: string): void;
}

export function createTelegramMediaGroupDebouncer(options: {
    delayMs: number;
    onReady: (mediaGroupId: string) => void | Promise<void>;
}): TelegramMediaGroupDebouncer {
    const timers = new Map<string, NodeJS.Timeout>();
    const delayMs = Math.max(0, options.delayMs);

    const fire = (mediaGroupId: string) => {
        const timer = timers.get(mediaGroupId);
        if (timer) clearTimeout(timer);
        if (!timers.has(mediaGroupId)) return;
        timers.delete(mediaGroupId);
        void Promise.resolve(options.onReady(mediaGroupId)).catch(error => {
            console.error(`🤖 Telegram media group processor failed: group=${mediaGroupId}`, error);
        });
    };

    return {
        bump(mediaGroupId: string) {
            const existing = timers.get(mediaGroupId);
            if (existing) clearTimeout(existing);
            timers.set(mediaGroupId, setTimeout(() => fire(mediaGroupId), delayMs));
        },
        flush(mediaGroupId: string) {
            fire(mediaGroupId);
        },
        cancel(mediaGroupId: string) {
            const timer = timers.get(mediaGroupId);
            if (timer) clearTimeout(timer);
            timers.delete(mediaGroupId);
        },
    };
}

export interface TelegramMediaGroupItemContext {
    message: { id?: number; message?: string; text?: string; caption?: string };
    sharedCaption?: string | null;
    groupIndex?: number;
    groupSize?: number;
}

export function telegramMediaGroupQueueKey(chatId: unknown, mediaGroupId: string): string {
    return `${chatId === undefined || chatId === null ? 'unknown' : String(chatId)}:${mediaGroupId}`;
}

function firstCaptionLine(message: TelegramMediaGroupItemContext['message']): string {
    return String(message.message || message.text || message.caption || '').split(/\r?\n/)[0].trim();
}

export function annotateTelegramMediaGroup<T extends TelegramMediaGroupItemContext>(items: T[]): T[] {
    const caption = items.map(item => firstCaptionLine(item.message)).find(Boolean) || '';
    const ordered = [...items].sort((a, b) => Number(a.message.id || 0) - Number(b.message.id || 0));
    const indexByItem = new Map(ordered.map((item, index) => [item, index + 1]));
    for (const item of items) {
        item.sharedCaption = caption;
        item.groupIndex = indexByItem.get(item);
        item.groupSize = items.length;
    }
    return items;
}

export function takePendingMediaGroupSnapshot<T extends { status?: string; message: { id?: number } }>(items: T[]): T[] {
    const seen = new Set<number>();
    return items
        .filter(item => item.status === undefined || item.status === 'pending')
        .sort((a, b) => Number(a.message.id || 0) - Number(b.message.id || 0))
        .filter(item => {
            const id = Number(item.message.id || 0);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
}

type ForwardedPeerKey = string;
type ForwardedMessageKey = string;

export type ForwardedSourceMessageCache = Map<ForwardedMessageKey, Api.Message>;

interface ForwardedSourceRef {
    peer: Api.TypeEntityLike;
    peerKey: ForwardedPeerKey;
    messageId: number;
}

function peerKeyForForwardedSource(peer: unknown): string {
    if (typeof peer === 'string' || typeof peer === 'number' || typeof peer === 'bigint') return String(peer);
    const anyPeer: any = peer;
    const id = anyPeer?.channelId || anyPeer?.chatId || anyPeer?.userId || anyPeer?.id;
    if (id !== undefined && id !== null) return `${anyPeer?.className || 'peer'}:${id.toString()}`;
    return JSON.stringify(peer);
}

function forwardedSourceRef(message: Api.Message): ForwardedSourceRef | undefined {
    const fwdFrom = (message as any).fwdFrom;
    const peer = fwdFrom?.savedFromPeer || fwdFrom?.fromId;
    const rawMessageId = fwdFrom?.savedFromMsgId || fwdFrom?.channelPost;
    const messageId = Number(rawMessageId);
    if (!peer || !Number.isFinite(messageId) || messageId <= 0) return undefined;
    return { peer, peerKey: peerKeyForForwardedSource(peer), messageId };
}

function forwardedMessageCacheKey(peerKey: string, messageId: number): string {
    return `${peerKey}:${messageId}`;
}

export function getForwardedSourceLookup(cache: ForwardedSourceMessageCache | undefined, message: Api.Message): Api.Message | undefined {
    const ref = forwardedSourceRef(message);
    if (!cache || !ref) return undefined;
    return cache.get(forwardedMessageCacheKey(ref.peerKey, ref.messageId));
}

export async function prefetchForwardedSourceMessages(
    userClient: TelegramClient,
    messages: Api.Message[],
): Promise<ForwardedSourceMessageCache> {
    const grouped = new Map<string, { peer: Api.TypeEntityLike; ids: Set<number> }>();
    for (const message of messages) {
        const ref = forwardedSourceRef(message);
        if (!ref) continue;
        let group = grouped.get(ref.peerKey);
        if (!group) {
            group = { peer: ref.peer, ids: new Set<number>() };
            grouped.set(ref.peerKey, group);
        }
        group.ids.add(ref.messageId);
    }

    const cache: ForwardedSourceMessageCache = new Map();
    await Promise.all(Array.from(grouped.entries()).map(async ([peerKey, group]) => {
        const ids = Array.from(group.ids);
        try {
            const fetched = await userClient.getMessages(group.peer, { ids });
            for (const message of fetched) {
                if (message?.media) {
                    cache.set(forwardedMessageCacheKey(peerKey, message.id), message as Api.Message);
                }
            }
        } catch (error) {
            console.warn('🤖 批量预取 Telegram 转发源媒体失败:', error);
        }
    }));
    return cache;
}
