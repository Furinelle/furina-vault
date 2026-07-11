import { Api } from 'telegram';
import { getMimeTypeFromFilename, sanitizeFilename } from './telegramUtils.js';

export interface TelegramFileInfo {
    fileName: string;
    mimeType: string;
    generatedName: boolean;
}

export function getDownloadableMedia(message: Api.Message): any | null {
    if (!message.media) return null;
    const media: any = message.media;
    if (message.sticker) return null;
    if (message.document || message.photo || message.video || message.audio || message.voice) {
        return message.media;
    }
    if (media.document || media.photo) {
        return media.document || media.photo;
    }
    if (media.webpage?.document || media.webpage?.photo) {
        return media.webpage.document || media.webpage.photo;
    }
    return null;
}

export function isTelegramPhotoMedia(media: any): boolean {
    const inner = media?.photo || media;
    return media?.className === 'MessageMediaPhoto' || inner?.className === 'Photo' || Boolean(inner?.sizes);
}

export function getEstimatedFileSize(message: Api.Message): number {
    const media = getDownloadableMedia(message);
    if (isTelegramPhotoMedia(media)) {
        return 0;
    }
    const document = (media as any)?.document || media;
    if (document?.size) {
        return Number(document.size) || 0;
    }
    return 0;
}

function getDocumentFilename(document: any, fallback: string): string {
    const fileNameAttr = document.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename') as any;
    return fileNameAttr?.fileName || fallback;
}

function isGeneratedTelegramName(fileName: string, messageId: number): boolean {
    const lower = fileName.toLowerCase();
    return new RegExp(`^(?:file|video|audio|voice)_${messageId}(?:\\.[^.]+)?$`, 'i').test(lower);
}

export function extractFileInfo(message: Api.Message): TelegramFileInfo | null {
    const downloadableMedia = getDownloadableMedia(message);
    if (!downloadableMedia) return null;

    let fileName = 'unknown';
    let mimeType = 'application/octet-stream';
    let generatedName = false;

    try {
        if (message.document) {
            const doc = message.document as Api.Document;
            const fileNameAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename') as any;
            generatedName = !fileNameAttr?.fileName;
            fileName = fileNameAttr?.fileName || `file_${message.id}`;
            mimeType = doc.mimeType || getMimeTypeFromFilename(fileName);

            if (isGeneratedTelegramName(fileName, message.id)) {
                const videoAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeVideo');
                const audioAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeAudio');
                if (videoAttr) fileName = `video_${message.id}.mp4`;
                else if (audioAttr) fileName = `audio_${message.id}.mp3`;
            }
        } else if (message.photo) {
            generatedName = true;
            fileName = `image_${message.id}.jpg`;
            mimeType = 'image/jpeg';
        } else if (message.video) {
            const video = message.video as Api.Document;
            const fileNameAttr = video.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename') as any;
            generatedName = !fileNameAttr?.fileName;
            fileName = fileNameAttr?.fileName || `video_${message.id}.mp4`;
            mimeType = video.mimeType || 'video/mp4';
        } else if (message.audio) {
            const audio = message.audio as Api.Document;
            const fileNameAttr = audio.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename') as any;
            generatedName = !fileNameAttr?.fileName;
            fileName = fileNameAttr?.fileName || `audio_${message.id}.mp3`;
            mimeType = audio.mimeType || 'audio/mpeg';
        } else if (message.voice) {
            generatedName = true;
            fileName = `audio_${message.id}.ogg`;
            mimeType = 'audio/ogg';
        } else {
            const media = message.media as any;
            if (media.document && media.document instanceof Api.Document) {
                const doc = media.document;
                const fileNameAttr = doc.attributes?.find((a: any) => a.className === 'DocumentAttributeFilename') as any;
                generatedName = !fileNameAttr?.fileName;
                fileName = fileNameAttr?.fileName || `file_${message.id}`;
                mimeType = doc.mimeType || getMimeTypeFromFilename(fileName);
            } else {
                const document = (downloadableMedia as any).document || (downloadableMedia as any);
                const photo = (downloadableMedia as any).photo || (downloadableMedia as any);
                if (document?.className === 'Document' || document?.attributes) {
                    const documentFileName = getDocumentFilename(document, '');
                    generatedName = !documentFileName;
                    fileName = documentFileName || `file_${message.id}`;
                    mimeType = document.mimeType || getMimeTypeFromFilename(fileName);
                } else if (photo?.className === 'Photo' || photo?.sizes) {
                    generatedName = true;
                    fileName = `image_${message.id}.jpg`;
                    mimeType = 'image/jpeg';
                } else {
                    return null;
                }
            }
        }
    } catch (e) {
        console.error('🤖 提取文件信息出错:', e);
        return null;
    }

    return { fileName: sanitizeFilename(fileName), mimeType, generatedName };
}
