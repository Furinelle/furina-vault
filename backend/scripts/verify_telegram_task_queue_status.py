from pathlib import Path

root = Path(__file__).resolve().parents[1]
jobs = (root / 'src/services/telegramChannelJobs.ts').read_text()
commands = (root / 'src/services/telegramCommands.ts').read_text()
bot = (root / 'src/services/telegramBot.ts').read_text()
upload = (root / 'src/services/telegramUpload.ts').read_text()
center = (root / 'src/services/telegramTaskCenter.ts').read_text()
queue = (root / 'src/services/downloadTaskQueue.ts').read_text()

checks = [
    ('listTelegramActiveTaskQueues', jobs),
    ('finished_at IS NULL', jobs),
    ('cancelled_at IS NULL', jobs),
    ('pending_count', jobs),
    ('downloading_count', jobs),
    ('current_file_name', jobs),
    ('folder_override', jobs),
    ('j.params', jobs),
    ('class DownloadTaskQueue', queue),
    ('prioritizeGroup', queue),
    ('pauseGroup', queue),
    ('resumeGroup', queue),
    ('cancelGroup', queue),
    ("kind: 'single'", upload),
    ("kind: 'album'", upload),
    ('hidden: true', upload),
    ('listDownloadTaskGroups', upload),
    ('pauseChannelExecutionGroup', upload),
    ('cancelChannelExecutionGroup', upload),
    ('buildTaskCenterPage', center),
    ('buildTaskCenterDetail', center),
    ('buildTaskCancelConfirm', center),
    ('parseTaskCenterCallback', center),
    ('暂停任务', center),
    ('优先开始', center),
    ('handleTaskCenterCallback', commands),
    ('buildTaskCenterPage', commands),
    ('cancelDownloadTaskGroup', commands),
    ('cancelTelegramBackgroundJob', commands),
    ('FOR UPDATE OF i SKIP LOCKED', jobs),
    ('taskCenterCardOwners', commands),
    ('pendingTaskCenterCancels', commands),
    ('forceStopDownloadTasksForScope', commands),
    ('getExecutionControlState', upload),
    ('下载任务已取消', bot),
    ("data.startsWith('tc_')", bot),
    ('handleTaskCenterCallback', bot),
    ('buildChannelTaskQueueReport', commands, False),
    ('buildTasksKeyboard', commands, False),
    ('buildTasksReport(status.active, status.pending)', commands, False),
    ('最近完成', commands, False),
]

missing = []
for check in checks:
    if len(check) == 2:
        needle, haystack = check
        should_exist = True
    else:
        needle, haystack, should_exist = check
    present = needle in haystack
    if present != should_exist:
        missing.append(("missing" if should_exist else "unexpected") + f": {needle}")

if missing:
    raise SystemExit('Telegram task center verification failed: ' + ', '.join(missing))
print('Telegram task center verifies selectable list/detail/confirm controls and active-only queues')
