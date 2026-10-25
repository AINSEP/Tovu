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
