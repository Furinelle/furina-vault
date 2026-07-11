import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./telegramUpload.ts', import.meta.url), 'utf8');
assert.match(source, /waitForChannelExecutionPermission\(getExecutionControlState, signal\)/);
assert.match(source, /processFileUpload\(userClient, uploadItem, undefined, channelGroupId, getExecutionControlState\)/);
assert.match(source, /await assertActiveStorageWritable\(\)/);
assert.match(source, /storageCooldownUntil = error\.cooldownUntil/);

assert.match(source, /import \{ DownloadTaskQueue \} from '\.\/downloadTaskQueue\.js';/);
assert.doesNotMatch(source, /class BetterDownloadQueue/);
assert.match(source, /const downloadQueue = new DownloadTaskQueue/);
assert.match(source, /ensureGroup\(\{[\s\S]*kind: 'single'/);
assert.match(source, /ensureGroup\(\{[\s\S]*kind: 'album'/);
assert.match(source, /hidden: true/);
assert.match(source, /downloadQueue\.add\(groupId, taskDisplayName, queueTask/);
assert.match(source, /downloadQueue\.add\(singleGroupId, finalFileName, singleUploadTask/);
assert.match(source, /downloadQueue\.updateProgress\(taskId, downloaded, total\)/);
assert.match(source, /取消任务时回滚已保存文件失败/);
assert.match(source, /processFileUpload\(userClient, uploadItem, undefined, channelGroupId, getExecutionControlState\)/);

console.log('telegram upload task group integration ok');
