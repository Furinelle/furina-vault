import { Response } from 'express';
import { storageManager, StorageQuotaCooldownError, isStorageQuotaCooldownError } from './storage.js';
import {
    getStorageAccountCooldown,
    STORAGE_COOLDOWN_REASON_DAILY_UPLOAD_LIMIT,
    type StorageAccountCooldown,
} from './storageCooldown.js';

export interface StorageCooldownHttpErrorBody {
    error: string;
    code: 'storage_account_cooling';
    provider: string;
    reason: string;
    retryAt: string;
}

export function formatStorageCooldownNotice(cooldownUntil: Date): string {
    return [
        '⏸️ Google Drive 今日上传额度已达上限',
        '',
        '当前任务已自动暂停，预计 24 小时后继续。',
        '剩余文件不会丢失，恢复后会从未完成部分继续处理。',
        '',
        `恢复时间：${cooldownUntil.toISOString()}`,
    ].join('\n');
}

export function buildStorageCooldownHttpError(error: StorageQuotaCooldownError): { status: number; body: StorageCooldownHttpErrorBody } {
    return {
        status: 429,
        body: {
            error: error.message || 'Google Drive 今日上传额度已达上限，请稍后重试。',
            code: 'storage_account_cooling',
            provider: error.provider,
            reason: error.reason,
            retryAt: error.cooldownUntil.toISOString(),
        },
    };
}

export function sendStorageCooldownHttpError(res: Response, error: StorageQuotaCooldownError): void {
    const payload = buildStorageCooldownHttpError(error);
    res.status(payload.status).json(payload.body);
}

export async function getActiveStorageCooldown(): Promise<StorageAccountCooldown | null> {
    const provider = storageManager.getProvider();
    const activeAccountId = storageManager.getActiveAccountId();
    if (provider.name !== 'google_drive' || !activeAccountId) return null;
    return getStorageAccountCooldown(activeAccountId, provider.name, STORAGE_COOLDOWN_REASON_DAILY_UPLOAD_LIMIT);
}

export async function assertActiveStorageWritable(): Promise<void> {
    const cooldown = await getActiveStorageCooldown();
    if (!cooldown) return;
    throw new StorageQuotaCooldownError('Google Drive 今日上传额度已达上限，请等待自动恢复后再上传，或临时切换其它存储源。', {
        provider: cooldown.provider,
        reason: cooldown.reason,
        storageAccountId: cooldown.storageAccountId,
        cooldownUntil: cooldown.cooldownUntil,
    });
}

export function isStorageCooldownError(error: unknown): error is StorageQuotaCooldownError {
    return isStorageQuotaCooldownError(error);
}
