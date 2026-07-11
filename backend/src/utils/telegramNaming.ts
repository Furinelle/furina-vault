import path from 'path';
import crypto from 'crypto';
import { getFileType, sanitizeFilename } from './telegramUtils.js';

export interface TelegramGeneratedNameOptions {
    caption?: string | null;
    mimeType?: string | null;
    extension?: string | null;
    randomSuffix?: string;
    sequenceNumber?: number;
}

export interface ResolveTelegramGeneratedNameOptions {
    currentFileName: string;
    mimeType?: string | null;
    caption?: string | null;
    sharedCaption?: string | null;
    randomSuffix?: string;
    sequenceNumber?: number;
    messageId?: number;
}

function normalizeExtension(extension?: string | null): string {
    if (!extension) return '';
    const trimmed = extension.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

function extensionFromMimeType(mimeType?: string | null): string {
    if (!mimeType) return '';
    const extensions: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'audio/mpeg': '.mp3',
        'audio/ogg': '.ogg',
        'audio/wav': '.wav',
        'application/pdf': '.pdf',
        'text/plain': '.txt',
        'application/zip': '.zip',
    };
    return extensions[mimeType.toLowerCase()] || '';
}

function fallbackPrefix(mimeType?: string | null): string {
    const type = getFileType(mimeType || '');
    const map: Record<string, string> = {
        image: 'image',
        video: 'video',
        audio: 'audio',
        document: 'document',
    };
    return map[type] || 'file';
}

function firstCaptionLine(caption?: string | null): string {
    return (caption || '').split(/\r?\n/)[0]?.trim() || '';
}

function replaceCaptionExtension(fileName: string, extension: string): string {
    if (!extension) return fileName;
    const captionExtension = path.extname(fileName);
    if (!captionExtension) return `${fileName}${extension}`;
    if (captionExtension.toLowerCase() === extension.toLowerCase()) return fileName;
    return `${fileName.slice(0, -captionExtension.length)}${extension}`;
}

export function isGeneratedTelegramDisplayName(fileName: string, messageId?: number): boolean {
    if (messageId === undefined) return false;
    const base = path.basename(fileName).toLowerCase();
    const escapedMessageId = String(messageId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^(?:image|video|audio|voice|file)_${escapedMessageId}(?:\\.[^.]+)?$`, 'i').test(base);
}

function hasMeaningfulBaseName(fileName: string): boolean {
    const base = path.extname(fileName) ? fileName.slice(0, -path.extname(fileName).length) : fileName;
    return /[\p{L}\p{N}]/u.test(base);
}

function appendSequenceNumber(fileName: string, sequenceNumber?: number): string {
    if (sequenceNumber === undefined) return fileName;
    const sequence = String(sequenceNumber).padStart(2, '0');
    const existingExtension = path.extname(fileName);
    const base = existingExtension ? fileName.slice(0, -existingExtension.length) : fileName;
    return `${base}_${sequence}${existingExtension}`;
}

export function buildTelegramGeneratedFileName(options: TelegramGeneratedNameOptions): string {
    const ext = normalizeExtension(options.extension);
    const captionLine = firstCaptionLine(options.caption);
    if (captionLine) {
        const captionName = sanitizeFilename(captionLine);
        if (hasMeaningfulBaseName(captionName)) {
            const nameWithExtension = replaceCaptionExtension(captionName, ext);
            return appendSequenceNumber(nameWithExtension, options.sequenceNumber);
        }
    }

    const suffix = sanitizeFilename(options.randomSuffix || crypto.randomBytes(4).toString('hex')).replace(/\s+/g, '_');
    return appendSequenceNumber(`${fallbackPrefix(options.mimeType)}_${suffix}${ext}`, options.sequenceNumber);
}

export function resolveTelegramGeneratedFileName(options: ResolveTelegramGeneratedNameOptions): string {
    if (!isGeneratedTelegramDisplayName(options.currentFileName, options.messageId)) {
        return options.currentFileName;
    }
    return buildTelegramGeneratedFileName({
        caption: firstCaptionLine(options.caption) || firstCaptionLine(options.sharedCaption),
        mimeType: options.mimeType,
        extension: path.extname(options.currentFileName) || extensionFromMimeType(options.mimeType),
        randomSuffix: options.messageId === undefined ? options.randomSuffix : String(options.messageId),
        sequenceNumber: options.sequenceNumber,
    });
}

export function applyTelegramGeneratedBaseName(originalFileName: string, options: Omit<TelegramGeneratedNameOptions, 'extension'>): string {
    return buildTelegramGeneratedFileName({ ...options, extension: path.extname(originalFileName) });
}
