import crypto from 'node:crypto';

export type ChunkReconciliationState = 'unknown' | 'present' | 'deleted';

export interface ChunkReconciliationEvidence {
    uploadId: string;
    completionToken: string;
    provider: string;
    accountId: string | null;
    storedPath: string;
    fileId: string;
    objectState: ChunkReconciliationState;
    indexState: ChunkReconciliationState;
    reason: string;
}

interface Queryable {
    query(text: string, params?: unknown[]): Promise<unknown>;
}

export async function beginChunkCompletionReconciliation(db: Queryable, input: {
    uploadId: string;
    completionToken: string;
    provider: string;
    accountId: string | null;
}): Promise<string> {
    const operationId = crypto.randomUUID();
    await db.query(
        `INSERT INTO chunk_upload_reconciliations
         (operation_id, upload_id, completion_token, provider, account_id, object_state, index_state, reason, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'unknown','unknown','分块完成副作用进行中','pending',NOW(),NOW())`,
        [operationId, input.uploadId, input.completionToken, input.provider, input.accountId],
    );
    return operationId;
}

export async function markChunkReconciliationObjectPresent(db: Queryable, operationId: string, storedPath: string): Promise<void> {
    const result = await db.query(
        `UPDATE chunk_upload_reconciliations SET stored_path = $2, object_state = 'present', updated_at = NOW()
         WHERE operation_id = $1 AND status = 'pending'`, [operationId, storedPath],
    ) as { rowCount?: number | null };
    if (result.rowCount !== 1) throw new Error('分块完成对账 journal 对象状态更新失败');
}

export async function markChunkReconciliationIndexPresent(db: Queryable, operationId: string, fileId: string): Promise<void> {
    const result = await db.query(
        `UPDATE chunk_upload_reconciliations SET file_id = $2, index_state = 'present', updated_at = NOW()
         WHERE operation_id = $1 AND status = 'pending'`, [operationId, fileId],
    ) as { rowCount?: number | null };
    if (result.rowCount !== 1) throw new Error('分块完成对账 journal 索引状态更新失败');
}

export async function updateChunkReconciliationAfterCompensation(
    db: Queryable,
    operationId: string,
    evidence: Pick<ChunkReconciliationEvidence, 'objectState' | 'indexState' | 'reason'>,
): Promise<string> {
    const resolved = evidence.objectState === 'deleted' && evidence.indexState === 'deleted';
    const result = await db.query(
        `UPDATE chunk_upload_reconciliations
         SET object_state = $2, index_state = $3, reason = $4,
             status = CASE WHEN $5::boolean THEN 'resolved' ELSE 'pending' END,
             resolved_at = CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE operation_id = $1 AND status = 'pending'
         RETURNING operation_id`,
        [operationId, evidence.objectState, evidence.indexState, evidence.reason.slice(0, 2000), resolved],
    ) as { rowCount?: number | null };
    if (result.rowCount !== 1) throw new Error('分块完成对账 journal 补偿状态更新失败');
    return operationId;
}

export async function compensateChunkCompletionFailure(input: {
    uploadId: string;
    completionToken: string;
    provider: string;
    accountId: string | null;
    storedPath: string;
    fileId: string;
    deleteObject: () => Promise<void>;
    deleteIndex: () => Promise<boolean>;
    persist: (evidence: ChunkReconciliationEvidence) => Promise<string>;
    initialIndexState?: ChunkReconciliationState;
}): Promise<{ reconciled: boolean; operationId: string }> {
    let objectState: ChunkReconciliationState = 'present';
    let indexState: ChunkReconciliationState = input.initialIndexState || 'present';
    const errors: string[] = [];
    try {
        await input.deleteObject();
        objectState = 'deleted';
    } catch (error) {
        objectState = 'unknown';
        errors.push(`object: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        if (!(await input.deleteIndex())) throw new Error('数据库索引补偿影响 0 行');
        indexState = 'deleted';
    } catch (error) {
        indexState = 'unknown';
        errors.push(`index: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (objectState === 'deleted' && indexState === 'deleted') {
        const operationId = await input.persist({
            uploadId: input.uploadId,
            completionToken: input.completionToken,
            provider: input.provider,
            accountId: input.accountId,
            storedPath: input.storedPath,
            fileId: input.fileId,
            objectState,
            indexState,
            reason: '补偿已确认完成',
        });
        return { reconciled: true, operationId };
    }
    const operationId = await input.persist({
        uploadId: input.uploadId,
        completionToken: input.completionToken,
        provider: input.provider,
        accountId: input.accountId,
        storedPath: input.storedPath,
        fileId: input.fileId,
        objectState,
        indexState,
        reason: errors.join('; ') || '补偿结果不确定',
    });
    return { reconciled: false, operationId };
}

export async function persistChunkReconciliation(db: Queryable, evidence: ChunkReconciliationEvidence): Promise<string> {
    const operationId = crypto.randomUUID();
    await db.query(
        `INSERT INTO chunk_upload_reconciliations
         (operation_id, upload_id, completion_token, provider, account_id, stored_path, file_id,
          object_state, index_state, reason, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',NOW(),NOW())`,
        [operationId, evidence.uploadId, evidence.completionToken, evidence.provider, evidence.accountId,
            evidence.storedPath, evidence.fileId, evidence.objectState, evidence.indexState, evidence.reason.slice(0, 2000)],
    );
    return operationId;
}
