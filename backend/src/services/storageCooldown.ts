import { query } from '../db/index.js';

export const STORAGE_COOLDOWN_REASON_DAILY_UPLOAD_LIMIT = 'daily_upload_limit';
export const DEFAULT_STORAGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface StorageAccountCooldown {
    storageAccountId: string;
    provider: string;
    reason: string;
    cooldownUntil: Date;
    lastError?: string | null;
}

export async function ensureStorageCooldownSchema(): Promise<void> {
    await query(`
        CREATE TABLE IF NOT EXISTS storage_account_cooldowns (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            storage_account_id UUID REFERENCES storage_accounts(id) ON DELETE CASCADE,
            provider VARCHAR(50) NOT NULL,
            reason VARCHAR(100) NOT NULL,
            cooldown_until TIMESTAMPTZ NOT NULL,
            last_error TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(storage_account_id, provider, reason)
        )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_storage_account_cooldowns_until ON storage_account_cooldowns(cooldown_until)`);
}

export async function markStorageAccountCooldown(
    storageAccountId: string | null | undefined,
    provider: string,
    reason: string,
    cooldownUntil: Date,
    error?: string | null,
): Promise<void> {
    if (!storageAccountId) return;
    await ensureStorageCooldownSchema();
    await query(
        `INSERT INTO storage_account_cooldowns (storage_account_id, provider, reason, cooldown_until, last_error, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (storage_account_id, provider, reason)
         DO UPDATE SET cooldown_until = EXCLUDED.cooldown_until, last_error = EXCLUDED.last_error, updated_at = NOW()`,
        [storageAccountId, provider, reason, cooldownUntil, error || null],
    );
}

export async function getStorageAccountCooldown(
    storageAccountId: string | null | undefined,
    provider: string,
    reason = STORAGE_COOLDOWN_REASON_DAILY_UPLOAD_LIMIT,
): Promise<StorageAccountCooldown | null> {
    if (!storageAccountId) return null;
    await ensureStorageCooldownSchema();
    const result = await query(
        `SELECT storage_account_id, provider, reason, cooldown_until, last_error
         FROM storage_account_cooldowns
         WHERE storage_account_id = $1
           AND provider = $2
           AND reason = $3
           AND cooldown_until > NOW()
         LIMIT 1`,
        [storageAccountId, provider, reason],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
        storageAccountId: row.storage_account_id,
        provider: row.provider,
        reason: row.reason,
        cooldownUntil: new Date(row.cooldown_until),
        lastError: row.last_error,
    };
}

export async function isStorageAccountCooling(storageAccountId: string | null | undefined, provider: string): Promise<boolean> {
    return Boolean(await getStorageAccountCooldown(storageAccountId, provider));
}

export async function clearExpiredStorageCooldowns(): Promise<number> {
    await ensureStorageCooldownSchema();
    const result = await query(`DELETE FROM storage_account_cooldowns WHERE cooldown_until <= NOW()`);
    return result.rowCount || 0;
}
