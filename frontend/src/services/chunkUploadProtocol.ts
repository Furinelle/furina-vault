export interface ChunkUploadInitContract {
    uploadId: string;
    maxChunkBytes: number;
    totalChunks: number;
}

export function parseChunkUploadInit(payload: unknown, totalSize: number): ChunkUploadInitContract {
    if (!payload || typeof payload !== 'object') throw new Error('分块上传初始化响应无效');
    const value = payload as Record<string, unknown>;
    const uploadId = typeof value.uploadId === 'string' ? value.uploadId : '';
    const maxChunkBytes = Number(value.maxChunkBytes);
    const totalChunks = Number(value.totalChunks);
    if (!uploadId || !Number.isSafeInteger(maxChunkBytes) || maxChunkBytes < 1 ||
        !Number.isSafeInteger(totalChunks) || totalChunks < 1 ||
        totalChunks !== Math.ceil(totalSize / maxChunkBytes)) {
        throw new Error('分块上传初始化响应无效');
    }
    return { uploadId, maxChunkBytes, totalChunks };
}

export function chunkBounds(totalSize: number, index: number, maxChunkBytes: number): { start: number; end: number } {
    const start = index * maxChunkBytes;
    return { start, end: Math.min(start + maxChunkBytes, totalSize) };
}

export interface ChunkUploadProgressState {
    localCompletedBytes: number;
    reportedBytes: number;
}

export function advanceChunkUploadProgress(
    state: ChunkUploadProgressState,
    completedChunkBytes: number,
    serverReceivedBytes: number,
    totalBytes: number,
): ChunkUploadProgressState {
    const localCompletedBytes = Math.min(
        totalBytes,
        state.localCompletedBytes + Math.max(0, completedChunkBytes),
    );
    return {
        localCompletedBytes,
        reportedBytes: Math.min(
            totalBytes,
            Math.max(state.reportedBytes, localCompletedBytes, Math.max(0, serverReceivedBytes)),
        ),
    };
}

function abortError(signal: AbortSignal): unknown {
    return signal.reason || new DOMException('Upload cancelled', 'AbortError');
}

export async function runChunkUploadWorkers(options: {
    totalChunks: number;
    concurrency: number;
    uploadChunk: (index: number, signal: AbortSignal) => Promise<void>;
    signal?: AbortSignal;
}): Promise<void> {
    const controller = new AbortController();
    let nextChunkIndex = 0;
    let firstError: unknown;

    const abortFromCaller = () => controller.abort(abortError(options.signal!));
    if (options.signal?.aborted) {
        abortFromCaller();
    } else {
        options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    const worker = async () => {
        while (!controller.signal.aborted) {
            const chunkIndex = nextChunkIndex++;
            if (chunkIndex >= options.totalChunks) return;
            try {
                await options.uploadChunk(chunkIndex, controller.signal);
            } catch (error) {
                if (firstError === undefined) firstError = error;
                if (!controller.signal.aborted) controller.abort(error);
                return;
            }
        }
    };

    try {
        const requestedConcurrency = Number.isSafeInteger(options.concurrency) && options.concurrency > 0
            ? options.concurrency
            : 1;
        const workerCount = Math.min(
            requestedConcurrency,
            Math.max(0, options.totalChunks),
        );
        await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
        if (firstError !== undefined) throw firstError;
        if (controller.signal.aborted) throw abortError(controller.signal);
    } finally {
        options.signal?.removeEventListener('abort', abortFromCaller);
    }
}
