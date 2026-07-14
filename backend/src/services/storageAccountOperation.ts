import type { Pool, PoolClient } from 'pg';
import { acquireStorageAccountLease, releaseStorageAccountLease } from './storageAccountLease.js';

type OperationPool = Pick<Pool, 'connect' | 'query'>;

export interface StorageAccountOperationLease {
    readonly leaseId: string | null;
    release(): Promise<void>;
}

export async function withStorageAccountOperationLease<T>(
    pool: OperationPool,
    accountId: string | null,
    purpose: string,
    operation: () => Promise<T>,
): Promise<T> {
    const lease = await acquireStorageAccountOperationLease(pool, accountId, purpose);
    let operationError: unknown;
    try {
        return await operation();
    } catch (error) {
        operationError = error;
        throw error;
    } finally {
        try {
            await lease.release();
        } catch (releaseError) {
            if (!operationError) throw releaseError;
            console.error('[StorageLease] release failed after operation failure:', releaseError);
        }
    }
}

export async function acquireStorageAccountOperationLease(
    pool: OperationPool,
    accountId: string | null,
    purpose: string,
    options: { ttlMs?: number; renewalIntervalMs?: number } = {},
): Promise<StorageAccountOperationLease> {
    if (!accountId) {
        return { leaseId: null, release: async () => undefined };
    }

    const ttlMs = options.ttlMs ?? 30 * 60 * 1000;
    const renewalIntervalMs = options.renewalIntervalMs ?? Math.max(1_000, Math.floor(ttlMs / 3));
    const setupClient = await pool.connect() as PoolClient;
    let leaseId = '';
    try {
        await setupClient.query('BEGIN');
        leaseId = await acquireStorageAccountLease(setupClient, accountId, purpose, ttlMs);
        await setupClient.query('COMMIT');
    } catch (error) {
        await setupClient.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        setupClient.release();
    }

    // Keep a database row lock for the entire external operation. This blocks account deletion
    // even if lease renewal is delayed; a process crash releases it automatically.
    const lockClient = await pool.connect() as PoolClient;
    try {
        await lockClient.query('BEGIN');
        await lockClient.query('SELECT id, type FROM storage_accounts WHERE id = $1 FOR KEY SHARE', [accountId]);
    } catch (error) {
        await lockClient.query('ROLLBACK').catch(() => undefined);
        lockClient.release();
        await releaseStorageAccountLease(pool, leaseId).catch(() => undefined);
        throw error;
    }

    let released = false;
    let renewalInFlight: Promise<void> | null = null;
    let renewalError: unknown = null;
    const renew = async () => {
        if (released) return;
        const expiresAt = new Date(Date.now() + ttlMs);
        const result = await pool.query(
            `UPDATE storage_account_leases
             SET expires_at = $2
             WHERE id = $1 AND released_at IS NULL
             RETURNING id`,
            [leaseId, expiresAt],
        );
        if ((result.rowCount || 0) !== 1) {
            throw new Error(`storage account lease ${leaseId} was lost`);
        }
    };
    const timer = setInterval(() => {
        renewalInFlight = renew().catch(error => {
            renewalError = error;
            console.error('[StorageLease] renewal failed:', error);
        });
    }, renewalIntervalMs);
    timer.unref();

    return {
        leaseId,
        release: async () => {
            if (released) return;
            released = true;
            clearInterval(timer);
            await renewalInFlight;
            let releaseError: unknown;
            try {
                await releaseStorageAccountLease(pool, leaseId);
                if (renewalError) throw renewalError;
            } catch (error) {
                releaseError = error;
            } finally {
                await lockClient.query('COMMIT').catch(async () => { await lockClient.query('ROLLBACK').catch(() => undefined); });
                lockClient.release();
            }
            if (releaseError) throw releaseError;
        },
    };
}
