# Cloud check run 2 — REPORT (2026-10-24/25)

Append-only run log + per-item verdicts. Protocol: RUN-PROTOCOL.md. Brief: BRIEF.md.

## 2026-10-25T04:56Z — STARTED

Host `vm`, 4 cores, Linux 6.18. Tovu branch `fu` tracking `origin/cloud/check-1024-tovu-fu-wip` @ 25804b89 (WIP 743a2216). Jini not yet cloned.
ASSUMPTION: RUN-PROTOCOL §1 says branch `refactor/jini-admin-extraction`; the brief overrides it with
`cloud/check-1024-tovu-fu-wip` (Tovu) and `cloud/check-1024-jini-guard2-wip` (Jini) — using the brief's branches.
Next: env setup (Node 24, Jini clone/build, Tovu npm ci), then item 1 password-race.

## 2026-10-25T05:04Z — PROGRESS — Item 1 password-race: FIXED

Commit: Tovu `187e1982` on `cloud/check-1024-tovu-fu-wip` (on top of Codex WIP 743a2216).

Review of Codex's change (password-auth.ts:109-152, 175-203): correct. Hash happens before the
transaction; inside `transaction` + `lockKey("trash:member:…")` (same key as repo.ts:385/418,
link-service.ts:104, unlink-identity.ts:35) it re-reads the member, rechecks the session (revoked/expired/
same id), the credential cutoff and current hash equality (salted hash ⇒ any intervening change/reset
differs), re-checks first-password inbox age, then writes hash + revocations + profile atomically.
Reset re-checks status, link cutoff and expiry. Enumeration/uniform responses untouched (route files
unchanged except the deps pass-through).

BUG found + fixed: "fails closed without transactional storage" broke memory composition —
`createApp(createRouteDeps())` has no `contentKernel`, so every /password/set and /password/reset
returned 400 `member credential transactions are unavailable` (reproduced: `[400, 400]`). Codex had
patched the createApp test to inject a SQLite kernel, hiding this. Fix: `createInMemoryCredentialLifecycle()`
(repo.memory.ts, FIFO promise-chain mutex; lockKey no-op since the mutex is global) used in app.ts when
`contentKernel` is absent, and in the unit harness. New tests: memory createApp HTTP change + concurrent
change (`[200,401]`), and a deterministic mutex unit test (verified it fails with the mutex removed;
the HTTP test alone did NOT kill that mutant).

Tests:
- Codex's 3 files baseline (before my fix): 85/85 pass (SQLite + PGlite). After: 87/87.
- All members feature tests + member route tests + public members routes: 509 run, 500 pass, 9 fail —
  all 9 are `member-external-identities.postgres.test.ts` needing a real Postgres server (ENV: no
  /tmp/.s.PGSQL.5432). Unrelated to this change.
- apps/admin vitest src/features/members/__tests__: 55/55 (vitest 4.1.11 rejects `--minWorkers`; ran with `--maxWorkers=2`).
- tsc -p tsconfig.json: 1 error, pre-existing & unrelated: oidc-deps.ts:69 `LOGIN_CANCELLED` (fixed on
  restructure branch by 2c847800, not in this branch). tsconfig.tests.json: 345 pre-existing errors, 0 in touched files.
- eslint complexity/cognitive ≤10: 0 new errors. 2 pre-existing cognitive errors in test files
  (password-auth.test.ts:216 = 11, member-password-auth.test.ts:521 = 13; both present before Codex).

Minor (LISTED, not fixed):
- resetPassword's post-hash `record.expiresAt <= committedAt` check rejects a link that expires during
  hashing even though it was already consumed while valid — harsher than needed, burns the link. Safe direction.
- Reset's `credentialsRevokedAt !== member.credentialsRevokedAt` is largely redundant with
  `resettableMember`'s `>= createdAt` cutoff check (stricter, harmless).
- Memory lifecycle has no rollback (documented): a profile conflict after setPasswordHash in memory mode
  keeps the new hash. Dev/test only.

## 2026-10-25T05:26Z — PROGRESS — Item 2 owner-store-s3: FIXED

Commits (Tovu `cloud/check-1024-tovu-fu-wip`): `c5f75f7a`, `aff01475`, `dde891fe`, `255c971c`.

Security review — all hold (read in source): secrets (put payload, passphrase, backup path) go only into
the stdin JSON (owner-store-cli.ts serializeRequest); argv = `owner-store <fixed action> --json [--site <abs>]`;
env = `buildCliEnv` over baseEnv + a scratch siteDir, nothing request-derived; errors are a fixed code→message
table (child messages/stderr discarded, stderr drained not kept); stdout capped at 1 MiB, exactly one JSON line,
version/action checked, data whitelisted field-by-field (no meta/payload crosses IPC); 64 KiB stdin cap
checked in both IPC and CLI layer; 60 s deadline + SIGKILL. IPC: same main-frame check as resources-ipc.ts:27
(`senderFrame` non-null, `parent === null`, exact sites-home file URL). Renderer gives site IDs only; main maps
to tracked canonical (realpath) dirs; the CLI realpaths consumerId/--site too (owner-store.ts:160,229), so
grant ids and startup-sync matching agree. main.ts never imports `@jini-ai/db/owner-store`; owner.db is
opened only in the CLI child. Windows: userDataDir from `app.getPath("userData")`, `path.isAbsolute` checks.

BUG found + fixed (`c5f75f7a`): export/restore awaited the native dialog INSIDE the shared `owner-store`
queue, so while a backup dialog was open every site start (`finishStartedSite` → `syncOnStart`) and every
other shared-key call blocked. Now only the CLI call is queued. New test hung (killed by the 300 s timeout)
before the fix and passes after.

Gate fixes:
- `aff01475`: the desktop pre-push complexity gate has a 9/9 ceiling; Codex's `parseReply` = 10 and
  `executeRequest` = 10 (Codex claimed "max 10", which passes the brief's ≤10 but not the repo gate).
  Extracted `singleLineJson`; dispatch via a total `Record` instead of a switch.
- `255c971c`: preload-staleness.test.ts pinned the exposed bridges to [tovuRunner, tovuVoice]; Codex missed it.
- `dde891fe`: PRE-EXISTING base failure (not Codex's): main-preview-wiring.test.ts regex expected
  `openSites.set(siteDir, { server })`, but abb14dab changed main.ts to `{ server, siteDir }`.

Tests: Codex's 5 files + preview wiring: 56/56. Full desktop `npm test`: 1766 tests, 1754 pass, 2 fail — both
PRE-EXISTING and outside this diff: `nested-sites-migration.test.ts` (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: a
parameter property in apps/website/src/platform/site-dir/local-site-supervisor.ts under Node 24 strip-only), and
site-dir-store.test.ts:538 `initSiteDir … through Tovu's actual CLI` (got `[{id:'page-blog'}]`, expected `[]`).
Desktop typecheck (preload/renderer/main/live-verify): 0 errors. eslint ≤10 on touched files: 0 errors.

PUSH NOTE: the desktop pre-push hook stays red on those 2 pre-existing tests, so `255c971c` was pushed with
`git push --no-verify` (RUN-PROTOCOL §3: never hold a commit behind an unrelated red suite). Verified the
remote head with `git ls-remote` = 255c971c.

Open items for the owner (LISTED, not fixed):
- Every site start now spawns ≥1 CLI child (`list`) before navigation, even when there are no grants.
  That's up to 60 s per call if the CLI hangs, and adds Electron-as-node spawn latency to every open.
  A cheap "any grants?" check, or running the sync after navigation, would avoid it.
- `syncOnStart` also runs for externally attached sites, so the CLI writes into a live site's DB while
  that site's server runs. This relies on SQLite busy handling; not exercised by tests.
- A timeout on `put`/`restore` SIGKILLs the child mid-write. The message tells the user to refresh, but it is
  not known whether the write committed.
- `delete.expectedRevision` is cast to number without a check in IPC. The CLI validates it, so this is fine.
- Fix the 2 pre-existing desktop test failures above; they block every desktop push via the hook.

## 2026-10-25T05:40Z — PROGRESS — Item 3 guard-2: baseline measured on Codex's f3107709

Jini `/root/Jini` @ f3107709 (over f4f01f4f): `pnpm install --frozen-lockfile` OK and `pnpm -r build` exit 0.
`pnpm guard` exit 0, zero violations. Rule tables are unchanged apart from `search: 5`. That placement is
correct: search imports `@jini-ai/core` (L0) and `@jini-ai/agent-plugins/lifecycle` (L4, contribution.ts:25),
and no package imports search. tsc --noEmit passes (0 errors) for core, platform, db, agent-runtime, daemon,
integrations, server, vibecoding, and server tsconfig.tests.json.
Vitest (`--maxWorkers=2 --minWorkers=1`; vitest 2.1.9 throws a RangeError without `--minWorkers`): 637/637 —
platform 123, agent-runtime 20, daemon 32, integrations 313, server owner-store 23, vibecoding 60, scripts layers 66.
COMPAT PROBLEM: `@jini-ai/db/owner-store` no longer exports openOwnerStore/OwnerStoreService/backup, which
Tovu's owner-store CLI imports (apps/website/src/cli/commands/owner-store.ts:7-8). Tovu also has no
`@jini-ai/server` dependency at all.
