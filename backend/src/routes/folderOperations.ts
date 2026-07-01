import { Router, Request, Response } from 'express';
import path from 'path';
import { query } from '../db/index.js';
import { safeUnlink } from '../utils/localPath.js';

const router = Router();

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './data/uploads');
const THUMBNAIL_DIR = path.resolve(process.env.THUMBNAIL_DIR || './data/thumbnails');
const CLOUD_SOURCES = new Set(['onedrive', 'aliyun_oss', 's3', 'webdav', 'google_drive']);

async function getCurrentStorageScope(): Promise<{ clause: string; params: any[] }> {
    const { storageManager } = await import('../services/storage.js');
    const provider = storageManager.getProvider();

    if (provider.name === 'local') {
        return { clause: "source = 'local'", params: [] };
    }

    return { clause: 'storage_account_id = $1', params: [storageManager.getActiveAccountId()] };
}

function nextParam(scope: { params: any[] }, offset: number): string {
    return `$${scope.params.length + offset}`;
}

async function removePhysicalFile(file: any) {
    if (CLOUD_SOURCES.has(file.source)) {
        const { storageManager } = await import('../services/storage.js');
        const provider = storageManager.getProvider(`${file.source}:${file.storage_account_id}`);
        await provider.deleteFile(file.path);
    } else {
        const filePath = file.path || path.join(UPLOAD_DIR, file.stored_name);
        await safeUnlink(filePath, UPLOAD_DIR);
    }

    if (file.thumbnail_path) {
        const thumbPath = path.join(THUMBNAIL_DIR, path.basename(file.thumbnail_path));
        await safeUnlink(thumbPath, THUMBNAIL_DIR);
    }
}

router.post('/batch-delete', async (req: Request, res: Response) => {
    try {
        const { fileIds = [], folderNames = [] } = req.body;

        if (!Array.isArray(fileIds) || !Array.isArray(folderNames)) {
            return res.status(400).json({ error: '参数格式错误' });
        }

        if (fileIds.length === 0 && folderNames.length === 0) {
            return res.status(400).json({ error: '请提供要删除的文件或文件夹' });
        }

        const scope = await getCurrentStorageScope();
        let filesToDelete: any[] = [];

        if (fileIds.length > 0) {
            const result = await query(
                `SELECT * FROM files WHERE ${scope.clause} AND id = ANY(${nextParam(scope, 1)})`,
                [...scope.params, fileIds]
            );
            filesToDelete = [...filesToDelete, ...result.rows];
        }

        if (folderNames.length > 0) {
            const result = await query(
                `SELECT * FROM files WHERE ${scope.clause} AND folder = ANY(${nextParam(scope, 1)})`,
                [...scope.params, folderNames]
            );
            filesToDelete = [...filesToDelete, ...result.rows];
        }

        const uniqueFiles = Array.from(new Map(filesToDelete.map(file => [file.id, file])).values());

        if (uniqueFiles.length === 0) {
            return res.json({ success: true, message: '没有发现待删除的项目' });
        }

        await Promise.all(uniqueFiles.map(async (file) => {
            try {
                await removePhysicalFile(file);
            } catch (err) {
                console.error(`删除物理文件失败 (ID: ${file.id}):`, err);
            }
        }));

        const idsToDelete = uniqueFiles.map(file => file.id);
        await query('DELETE FROM files WHERE id = ANY($1)', [idsToDelete]);

        res.json({ success: true, message: `成功删除 ${uniqueFiles.length} 个文件` });
    } catch (error) {
        console.error('批量删除失败:', error);
        res.status(500).json({ error: '批量删除失败' });
    }
});

router.patch('/rename-folder', async (req: Request, res: Response) => {
    try {
        const { oldName, newName } = req.body;

        if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
            return res.status(400).json({ error: '参数错误' });
        }

        const trimmedNew = newName.trim();
        if (trimmedNew.length === 0) {
            return res.status(400).json({ error: '文件夹名不能为空' });
        }

        if (/[\/\\:*?"<>|]/.test(trimmedNew)) {
            return res.status(400).json({ error: '文件夹名包含非法字符' });
        }

        const scope = await getCurrentStorageScope();
        const checkResult = await query(
            `SELECT COUNT(*) as cnt FROM files WHERE ${scope.clause} AND folder = ${nextParam(scope, 1)}`,
            [...scope.params, oldName]
        );
        if (parseInt(checkResult.rows[0].cnt) === 0) {
            return res.status(404).json({ error: '文件夹不存在' });
        }

        if (trimmedNew !== oldName) {
            const existResult = await query(
                `SELECT COUNT(*) as cnt FROM files WHERE ${scope.clause} AND folder = ${nextParam(scope, 1)}`,
                [...scope.params, trimmedNew]
            );
            if (parseInt(existResult.rows[0].cnt) > 0) {
                return res.status(400).json({ error: '该文件夹名已存在' });
            }
        }

        await query(
            `UPDATE files SET folder = ${nextParam(scope, 1)} WHERE ${scope.clause} AND folder = ${nextParam(scope, 2)}`,
            [...scope.params, trimmedNew, oldName]
        );

        res.json({ success: true, name: trimmedNew });
    } catch (error) {
        console.error('重命名文件夹失败:', error);
        res.status(500).json({ error: '重命名文件夹失败' });
    }
});

router.patch('/move-folder', async (req: Request, res: Response) => {
    try {
        const { oldName, newName } = req.body;

        if (!oldName || typeof oldName !== 'string') {
            return res.status(400).json({ error: '原文件夹名称不能为空' });
        }

        if (newName !== null && typeof newName !== 'string') {
            return res.status(400).json({ error: '目标文件夹名称格式错误' });
        }

        const trimmedOld = oldName.trim();
        const trimmedNew = newName ? newName.trim() : null;

        if (trimmedNew && /[\/\\:*?"<>|]/.test(trimmedNew)) {
            return res.status(400).json({ error: '目标文件夹名包含非法字符' });
        }

        const scope = await getCurrentStorageScope();
        const checkResult = await query(
            `SELECT COUNT(*) as cnt FROM files WHERE ${scope.clause} AND folder = ${nextParam(scope, 1)}`,
            [...scope.params, trimmedOld]
        );
        if (parseInt(checkResult.rows[0].cnt) === 0) {
            return res.status(404).json({ error: '原文件夹不存在' });
        }

        await query(
            `UPDATE files SET folder = ${nextParam(scope, 1)}, updated_at = NOW() WHERE ${scope.clause} AND folder = ${nextParam(scope, 2)}`,
            [...scope.params, trimmedNew, trimmedOld]
        );

        res.json({ success: true, folder: trimmedNew });
    } catch (error) {
        console.error('移动文件夹失败:', error);
        res.status(500).json({ error: '移动文件夹失败' });
    }
});

export default router;
