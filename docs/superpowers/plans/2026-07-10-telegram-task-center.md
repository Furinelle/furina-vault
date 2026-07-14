# Telegram Task Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a human-friendly Telegram `/tasks` task center with selectable single-send, album, and channel jobs plus real per-task start, pause, resume, and cancel controls.

**Architecture:** Extract the in-memory file scheduler into a focused `DownloadTaskQueue` module that owns task-group metadata, scheduling, and group-level control. Adapt its group snapshots and persistent channel jobs into a shared pure task-center view model, while keeping Telegram rendering/callback I/O in `telegramCommands.ts`.

**Tech Stack:** TypeScript 6, Node.js 22-compatible ESM, Node built-in `assert`, `tsx`, GramJS, PostgreSQL, esbuild, Docker Compose.

## Global Constraints

- A normal send is one task group; a Telegram album is one task group; a persistent channel job is one task group.
- New tasks start automatically.
- Pause stops new files in the selected group but lets already-running files finish.
- Start on a waiting task performs a one-time stable priority promotion without preempting active files.
- Cancel only removes/aborts files from the selected task group.
- `/tasks` shows non-terminal work only; no history ledger.
- Persistent channel jobs remain database-backed and restart-recoverable; ordinary sends/albums remain in memory.
- Preserve current hidden slash-command compatibility and do not expose manual control commands in the new task center.
- Keep Telegram callback payloads under 64 bytes and validate authenticated user plus task ownership.
- Preserve the existing uncommitted album naming/media-group work; do not push GitHub without explicit permission.

---

## File Map

- Create `backend/src/services/downloadTaskQueue.ts`: pure grouped queue, scheduler, snapshots, ownership, and group controls.
- Create `backend/src/services/downloadTaskQueue.test.ts`: behavioral RED/GREEN tests for scheduling and isolation.
- Create `backend/src/services/telegramTaskCenter.ts`: pure task-center view model, pagination, text rendering, and button descriptors.
- Create `backend/src/services/telegramTaskCenter.test.ts`: list/detail/confirm/pagination/control-layout tests.
- Modify `backend/src/services/telegramUpload.ts`: replace embedded `BetterDownloadQueue`, register single/album groups, pass group IDs for every file, and expose grouped controls/snapshots.
- Modify `backend/src/services/telegramChannelJobs.ts`: include title/folder/current-file fields needed by the common task detail adapter.
- Modify `backend/src/services/telegramCommands.ts`: replace current `/tasks` output and `ctq_*` callbacks with task-center navigation/control callbacks.
- Modify `backend/src/services/telegramBot.ts`: route `tc_*` callbacks and preserve old callback paths.
- Modify `backend/scripts/verify_telegram_task_queue_status.py`: assert the new task-center route and removal of old noisy rendering.
- Modify `backend/package.json`: add explicit task-center test command if useful for repeatable verification.

### Task 1: Group-aware in-memory scheduler

**Files:**
- Create: `backend/src/services/downloadTaskQueue.ts`
- Create: `backend/src/services/downloadTaskQueue.test.ts`

**Interfaces:**
- Produces `DownloadTaskQueue`, `DownloadTaskGroupInput`, `DownloadTaskGroupSnapshot`, `DownloadTaskQueueSnapshot`, and `DownloadTaskGroupControlResult`.
- Core methods: `ensureGroup(input)`, `add(groupId, fileName, execute, totalSize)`, `getSnapshot()`, `getGroup(id)`, `prioritizeGroup(id, scope)`, `pauseGroup(id, scope)`, `resumeGroup(id, scope)`, `cancelGroup(id, scope)`, `pauseAll()`, `resumeAll()`, `forceStopAll()`, `retryFailed()`, `setMaxConcurrent()`.

- [ ] **Step 1: Write the failing grouping and automatic-start test**

Create tests that instantiate a queue with `maxConcurrent: 1`, register one single group and one album group, enqueue controlled promises, and assert snapshots contain two groups with correct total/active/pending counts and that the first file starts automatically.

- [ ] **Step 2: Run RED**

Run: `npx tsx src/services/downloadTaskQueue.test.ts`

Expected: FAIL because `downloadTaskQueue.ts` or exported interfaces do not exist.

- [ ] **Step 3: Implement minimal queue/group registration and snapshots**

Implement a scheduler that stores `queue`, `active`, `history`, and a `Map<string, DownloadTaskGroupRecord>`. Aggregate snapshots from live file records; keep terminal group metadata only long enough to settle promises and omit terminal groups from the active snapshot.

- [ ] **Step 4: Run GREEN**

Run the same test and expect the grouping/automatic-start assertions to pass.

- [ ] **Step 5: Add a failing priority test**

Enqueue groups A, B, C behind one blocker, call `prioritizeGroup('C')`, release the blocker, and assert C starts next while C's internal file order remains stable.

- [ ] **Step 6: Implement one-time stable priority promotion**

Stable-partition pending tasks so the selected group's tasks move before other pending tasks without reversing either partition.

- [ ] **Step 7: Add failing pause/resume tests**

Assert pause enters `pausing` while a file is active, starts no second file from that group, transitions to `paused` when its active file settles, and resume only re-enables that group.

- [ ] **Step 8: Implement group pause/resume and system-pause precedence**

Skip paused/pausing groups during scheduling. Keep global/system pause independent so `resumeGroup` cannot clear disk-pressure/global suspension.

- [ ] **Step 9: Add failing cancellation/ownership/idempotency tests**

Assert cancellation removes only the selected group's pending items, aborts only its active controllers, repeated cancel is harmless, and mismatched chat/user scope returns `forbidden` without mutation.

- [ ] **Step 10: Implement cancellation and ownership checks**

Set `cancelling` before mutation, settle removed pending promises, abort matching active tasks, finalize as cancelled after active tasks leave, and return explicit `ok | not_found | forbidden | terminal` results.

- [ ] **Step 11: Run full scheduler test**

Run: `npx tsx src/services/downloadTaskQueue.test.ts`

Expected: output `download task queue ok`, exit 0.

### Task 2: Pure task-center presentation model

**Files:**
- Create: `backend/src/services/telegramTaskCenter.ts`
- Create: `backend/src/services/telegramTaskCenter.test.ts`

**Interfaces:**
- Consumes `DownloadTaskGroupSnapshot` and persistent channel job rows.
- Produces `TaskCenterItem`, `TaskCenterPage`, `TaskCenterButton`, `buildTaskCenterPage(items, page)`, `buildTaskCenterDetail(item)`, `buildTaskCancelConfirm(item, page)`, and callback parse/build helpers.

- [ ] **Step 1: Write failing list-page tests**

Use fixtures for running, waiting, pausing, paused, cooling, and channel items. Assert a six-item page, concise two-line rows, status totals, clamped page number, numbered selection buttons, pagination, and refresh callback payloads.

- [ ] **Step 2: Run RED**

Run: `npx tsx src/services/telegramTaskCenter.test.ts`

Expected: FAIL because the task-center module does not exist.

- [ ] **Step 3: Implement list model and callback codec**

Use callbacks shaped like `tc_l_<page>`, `tc_d_<kind>_<id>_<page>`, `tc_a_<action>_<kind>_<id>_<page>`, and keep identifiers/payloads below 64 bytes.

- [ ] **Step 4: Run list tests GREEN**

Run the test and expect list assertions to pass.

- [ ] **Step 5: Add failing detail/action tests**

Assert waiting shows prioritize, running shows finish-current-file pause, pausing hides duplicate pause, paused shows resume, all live states show cancel, and all details show back/refresh. Assert system reasons/current filename/target folder/time are rendered.

- [ ] **Step 6: Implement detail and button descriptors**

Keep Telegram classes out of this module; return plain `{ text, data }` rows for the adapter.

- [ ] **Step 7: Add failing cancellation-confirm and terminal/expired tests**

Assert confirm/back controls, no direct destructive action from detail, and terminal items are absent from list builders.

- [ ] **Step 8: Implement confirm page and item adapters**

Map ordinary queue snapshots and channel rows to the shared states and labels.

- [ ] **Step 9: Run task-center tests**

Run: `npx tsx src/services/telegramTaskCenter.test.ts`

Expected: output `telegram task center ok`, exit 0.

### Task 3: Integrate task groups into ordinary sends and albums

**Files:**
- Modify: `backend/src/services/telegramUpload.ts`
- Test: `backend/src/services/downloadTaskQueue.test.ts`

**Interfaces:**
- Consumes `DownloadTaskQueue` from Task 1.
- Exposes `listDownloadTaskGroups(chatId?, userId?)`, `prioritizeDownloadTaskGroup`, `pauseDownloadTaskGroup`, `resumeDownloadTaskGroup`, and `cancelDownloadTaskGroup` for the Bot command adapter.

- [ ] **Step 1: Add a failing integration/static assertion**

Extend the scheduler test or a focused verifier to assert `telegramUpload.ts` passes a group ID to every `downloadQueue.add` call and no longer defines `class BetterDownloadQueue` inline.

- [ ] **Step 2: Run RED**

Run the focused test/verifier and expect failure against the current embedded queue.

- [ ] **Step 3: Replace the embedded queue with the extracted module**

Preserve existing global stats, retry, disk-pressure, progress update, and force-stop wrappers so unrelated code keeps compiling.

- [ ] **Step 4: Register one group per single message**

Build a short group ID from chat/message identity, set kind `single`, title to canonical file name, and scope to message chat/user. Pass that group ID into the queued single-file task.

- [ ] **Step 5: Register one group per album snapshot**

Use the existing chat-scoped media-group key as group identity input, title from shared caption/folder fallback, total from snapshot, and pass the same group ID to each `processFileUpload` call.

- [ ] **Step 6: Pass group context through `processFileUpload`**

Add group ID to the function signature/queue metadata and use it in `downloadQueue.add(groupId, taskDisplayName, queueTask)`.

- [ ] **Step 7: Keep channel files out of duplicate ordinary `/tasks` rows**

Allow `downloadTelegramChannelRange` to enqueue with an internal/non-visible group keyed by job ID or mark those queue tasks hidden, because the persistent channel job is the task-center source of truth.

- [ ] **Step 8: Run scheduler tests and backend build**

Run:

```bash
npx tsx src/services/downloadTaskQueue.test.ts
npm run build
```

Expected: test exits 0 and esbuild emits both bundles with exit 0.

### Task 4: Task-center Telegram UI and callbacks

**Files:**
- Modify: `backend/src/services/telegramChannelJobs.ts`
- Modify: `backend/src/services/telegramCommands.ts`
- Modify: `backend/src/services/telegramBot.ts`
- Modify: `backend/scripts/verify_telegram_task_queue_status.py`
- Test: `backend/src/services/telegramTaskCenter.test.ts`

**Interfaces:**
- Consumes pure pages/button rows from Task 2 and ordinary queue controls from Task 3.
- Produces `handleTaskCenterCallback(client, update, data)` and updated `handleTasks(message)`.

- [ ] **Step 1: Write failing verifier assertions**

Update the Python verifier to require `handleTaskCenterCallback`, `tc_` routing, list/detail/confirm text, queue-group controls, channel controls, ownership checks, and absence of old `buildTasksReport`/direct per-row destructive UI from `/tasks`.

- [ ] **Step 2: Run RED**

Run: `python3 scripts/verify_telegram_task_queue_status.py`

Expected: FAIL because new handlers/routes are absent.

- [ ] **Step 3: Add fields to channel active-task query**

Return `folder_override`, user-visible mode details from `options`, and a current file name subquery/aggregate where available. Keep terminal filtering unchanged.

- [ ] **Step 4: Replace `/tasks` rendering**

Fetch ordinary group snapshots scoped to chat/user plus active channel jobs for user, adapt them, sort active before waiting/paused and newest activity within state, then reply with page 0 and converted GramJS markup.

- [ ] **Step 5: Implement navigation callbacks**

Parse `tc_*`, authenticate, refetch current item state on every click, enforce ordinary ownership/channel user ownership, edit the same message, and treat `MESSAGE_NOT_MODIFIED` as success.

- [ ] **Step 6: Implement controls**

Route ordinary start/pause/resume/cancel to Task 3 functions; route channel controls to existing DB functions. Make cancel a two-step confirmation and refresh/clamp the originating page after terminal mutation.

- [ ] **Step 7: Keep legacy commands and old task-card callbacks compatible**

When an ID identifies a new ordinary group, old `/task_* <id>` handlers act on that group. Existing global no-ID semantics and existing task-card callbacks remain operational.

- [ ] **Step 8: Route callbacks in `telegramBot.ts`**

Route `tc_` before legacy `ctq_`/`tq_` paths and export/import the new handler.

- [ ] **Step 9: Run UI tests, verifier, and build**

Run:

```bash
npx tsx src/services/telegramTaskCenter.test.ts
python3 scripts/verify_telegram_task_queue_status.py
npm run build
```

Expected: both tests/verifier exit 0; esbuild succeeds.

### Task 5: Regression verification and live deployment

**Files:**
- Verify all changed backend sources and current uncommitted album tests.
- Deploy with `/www/wwwroot/tg-vault/docker-compose.yml`.

**Interfaces:**
- No new interfaces; this task proves the complete artifact.

- [ ] **Step 1: Run focused and existing TypeScript tests**

Run every `backend/src/**/*.test.ts` through `npx tsx`, including the pre-existing uncommitted media-group/naming tests, and inspect every exit code.

- [ ] **Step 2: Run static verifiers**

Run `python3 scripts/verify_telegram_task_queue_status.py` plus existing relevant Telegram media/private-invite/large-batch verifiers.

- [ ] **Step 3: Run clean backend build and diff checks**

Run:

```bash
npm run build
git diff --check
git status --short --branch
```

Expected: build and diff check exit 0; status shows intended files plus the user's pre-existing work.

- [ ] **Step 4: Build and recreate backend container**

Run from the project directory:

```bash
docker compose build backend
docker compose up -d --force-recreate backend
```

Expected: `tg-vault-backend` recreated and running.

- [ ] **Step 5: Verify live service**

Run:

```bash
curl -fsS http://127.0.0.1:51947/health
docker compose ps backend
docker compose logs --tail=200 backend
```

Expected: health endpoint succeeds, container state is Up, logs include Telegram Bot startup and contain no startup exception, callback registration error, SQL error, or unhandled rejection.

- [ ] **Step 6: Verify deployed artifact contains the task center**

Search inside the backend container's built `dist/index.js` for the task-center callback prefix and key Chinese labels, and verify callback payload examples are below 64 bytes through the pure task-center test.

- [ ] **Step 7: Review final diff and report without pushing**

Separate the task-center files from the pre-existing album/media naming work in the summary. Do not push or open a PR.
