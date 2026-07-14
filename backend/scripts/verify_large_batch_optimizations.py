#!/usr/bin/env python3
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
storage = root / 'src/services/storage.ts'
tg = root / 'src/services/telegramUpload.ts'

storage_text = storage.read_text()
tg_text = tg.read_text()

failures = []

def check(cond, msg):
    if not cond:
        failures.append(msg)

# 1) S3/WebDAV must stream temp files, not read entire files into Buffers.
s3_block = re.search(r'class S3StorageProvider[\s\S]*?class WebDAVStorageProvider', storage_text)
webdav_block = re.search(r'class WebDAVStorageProvider[\s\S]*?class OneDriveStorageProvider', storage_text)
check(s3_block is not None, 'S3StorageProvider block not found')
check(webdav_block is not None, 'WebDAVStorageProvider block not found')
if s3_block:
    check('fs.readFileSync(tempPath)' not in s3_block.group(0), 'S3 saveFile still reads whole file into memory')
    check('fs.createReadStream(tempPath)' in s3_block.group(0), 'S3 saveFile does not use fs.createReadStream(tempPath)')
if webdav_block:
    check('fs.readFileSync(tempPath)' not in webdav_block.group(0), 'WebDAV saveFile still reads whole file into memory')
    check('fs.createReadStream(tempPath)' in webdav_block.group(0), 'WebDAV saveFile does not use fs.createReadStream(tempPath)')

# 2) Disk watermark should pause queue globally rather than only throw synchronously.
check('acquireDiskPressureBlocker' in tg_text, 'download queue lacks disk-pressure blocker lease')
check('waitForDiskWatermark' in tg_text, 'missing waitForDiskWatermark helper')
check('TG_DISK_WATERMARK_RECHECK_MS' in tg_text, 'missing disk-watermark recheck interval')
check('磁盘空间不足：可用' in tg_text, 'missing user-facing disk pause reason')

# 3) Media group processing should avoid Promise.all(queue.files.map(...)).
check('Promise.all(queue.files.map' not in tg_text, 'media group still starts all file promises at once')
check('TG_MEDIA_GROUP_ENQUEUE_BATCH_SIZE' in tg_text, 'missing media group bounded enqueue batch size')
check('takePendingMediaGroupSnapshot' in tg_text, 'missing bounded media group snapshot processor')

# 4) Channel range should not retain full Api.Message objects for all downloadable messages long-term.
check('downloadableMessages: Array<{ message: Api.Message' not in tg_text, 'channel range still keeps full message objects in downloadableMessages')
check('DownloadableMessageRef' in tg_text, 'missing lightweight downloadable message ref type')
check('getMessages(sourceItems[0].sourceEntity as any, { ids: segmentIds })' in tg_text, 'segments are not re-fetching messages by lightweight ids')

if failures:
    print('FAIL')
    for f in failures:
        print('-', f)
    raise SystemExit(1)
print('PASS optimization static checks')
