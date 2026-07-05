#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
jobs = (root / 'src/services/telegramChannelJobs.ts').read_text()
schema = (root / 'src/db/schema.sql').read_text()
bot = (root / 'src/services/telegramBot.ts').read_text()

date_download_block = jobs[jobs.index('export async function enqueueTelegramDateDownload'):jobs.index('async function getMessagesByHashtag')]
tag_download_block = jobs[jobs.index('export async function enqueueTelegramTagDownload'):jobs.index('export async function listTelegramActiveTaskQueues')]

checks = [
    ('private invite detector', 'parseTelegramPrivateInviteHash' in jobs and 't.me/+hash' in jobs),
    ('check chat invite API', 'messages.CheckChatInvite' in jobs and 'ChatInviteAlready' in jobs),
    ('no auto join import invite', 'ImportChatInvite' not in jobs),
    ('date download resolves private invites before job creation', 'resolveTelegramSource(userClient, sourceInput)' in date_download_block and 'const source = resolved.source' in date_download_block),
    ('tag download resolves private invites before job creation', 'resolveTelegramSource(userClient, sourceInput)' in tag_download_block and 'const source = resolved.source' in tag_download_block),
    ('stable peer persistence', 'source_original' in schema and 'source_type' in schema and 'disabled_reason' in schema),
    ('subscription pause on inaccessible source', 'pauseTelegramSubscriptionForError' in jobs and 'enabled = false' in jobs and 'disabled_reason' in jobs),
    ('subscription list warning', 'disabled_reason' in bot and 'listTelegramSubscriptions(senderId, true)' in bot and 'listTelegramSubscriptions(userId, true)' in bot),
    ('explicit not joined wording', '尚未加入这个私密频道/群' in jobs),
    ('expired/invalid invite wording', '邀请链接已过期' in jobs and '邀请链接无效' in jobs),
]

failed = [name for name, ok in checks if not ok]
if failed:
    print('FAIL private invite support checks:')
    for name in failed:
        print(f'- {name}')
    raise SystemExit(1)
print('PASS private invite support checks')
