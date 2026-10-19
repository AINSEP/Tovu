# The no-raw-SQLite ratchet fails on peer-site-reads.ts (one raw PRAGMA)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`
+ a `VERDICT:` line. REUSE before you write (search for an existing mechanism first). Smallest change.
Move "why" comments with code, never delete them. Never edit raw-sqlite-baseline.json to make room for
new raw SQLite: the baseline may only shrink.

Failure (apps/website/src/platform/db/kernel/__tests__/no-raw-sqlite.boundary.test.ts):
```
✖ no new raw SQLite outside the storage kernel (ratchet: the baseline only shrinks)
  New raw SQLite outside platform/db/kernel. Use the storage kernel (run/transaction + Drizzle, dialect.ts helpers) instead.
  server/runtime/composition/peer-site-reads.ts: pragma 0 -> 1
```
Source: apps/website/src/server/runtime/composition/peer-site-reads.ts:356-357 (added in 2184d37a9):
```
chat = openChat(paths.chatDbPath, { readonly: true, fileMustExist: true });
chat.pragma('busy_timeout = 5000');
```
`openChat` defaults to `openNativeSqlite` (platform/db/kernel/drivers/sqlite.ts). Set the busy timeout
without a raw PRAGMA in this file: e.g. pass it through the open call (better-sqlite3 has a `timeout`
constructor option = busy timeout in ms; check what openNativeSqlite accepts/forwards), or reuse an
existing kernel/chat-db helper that already opens a read-only chat db with a busy timeout
(look at platform/db/sqlite/chat-db.ts openChatDb / openChatConnection first). Keep the 5000 ms value
and the read-only + fileMustExist behaviour. If a test in apps/website/src/server/runtime/composition/
__tests__ or apps/website/src/assistant/__tests__ asserts on the pragma call (grep peer-site-reads /
busy_timeout), update it to assert the new mechanism with the same strength.
