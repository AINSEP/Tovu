# RESULTS-ENV — Tovu Postgres / chromium tests (2026-10-28, branch envtests = cloud/analysis-1028)

## §0 Summary
- Environment built: Node 24.22, Jini `pnpm install` + `pnpm -r build` (rc=0, no build failures), Tovu `npm install` (cookie-consent pointed locally at `file:/home/user/Jini/packages/cookie-consent`; `npm ci` can't be used because the lockfile is out of sync with that edit — local, uncommitted), `link:jini` + `@tovu/sdk` built, PostgreSQL 16 (apt) on socket `/tmp/.s.PGSQL.5432` and TCP 5432, trust auth, superuser role `la` (the tests' default user).
- Chromium: `npx playwright install chromium` is blocked (cdn.playwright.dev → 403 from the egress proxy). The image ships `/opt/pw-browsers/chromium-1243`; the repo's playwright wants build 1228. I symlinked `chromium_headless_shell-1228 → -1243` (outside the repo) and render-form-layout then passed.
- **30 files run** (25 `*.postgres.test.ts` + members dialects test (imports the `.contract`) + theme canary + migration-manifest-postgres + postgres-baseline + render-form-layout). First pass (PGHOST=/tmp): 23 passed, 7 failed.
- After one solo re-run each: **25 pass; 5 still fail.** 2 of the 7 were ENV (see §1.A), leaving 5 files:
  - STALE TEST ×3 files: `init-storage.postgres.test.ts` (2 tests), `copy-engine.postgres.test.ts` (5 tests), `runner.postgres.test.ts` (1 test)
  - STALE TEST (same cause as part of copy-engine family): `postgres-baseline.test.ts` (1 test, PGlite — no server needed; fails in any env)
  - REAL drift: `shipped-site-theme-drift.canary.test.ts` (1 test)
  → still failing: init-storage, copy-engine, runner.postgres, postgres-baseline, theme canary. (Counts: 30 run, 25 pass, 5 fail.)
- Top cause: the TS-only tables added by migrations 0021–0035 (consent, mail ledgers, domain_binding, search index, member_external_identities) are not accounted for by tests that pin the old table/migration set.

## §1 Failures
### A. ENV (resolved, not product issues)
- `tool-registrations.postgres.test.ts` (3 tests): failed only because I exported `PGHOST=/tmp`; the test expects the saved destination host `localhost` (`tool-registrations.postgres.test.ts:154`). Passes with PGHOST unset. Lesson for CI: do **not** set PGHOST for this file.
- `render-form-layout.test.ts` (3 tests): `browserType.launch: Executable doesn't exist …chromium_headless_shell-1228`. Passes (3/3) with the 1243 build symlinked as 1228. Class ENV (browser download blocked / version mismatch).

### B. STALE TEST — TS-only tables not covered by core-only catalog (group: 6 tests, 2 files)
Cause: migrations 0021–0029 create tables that exist only in migrations/`fresh-content-db.ts`, not in `schema.postgres.ts`: `domain_binding, mail_activity_attempts, mail_feedback_inbox, mail_send_ledger, mail_suppression, mail_suppression_removals, search_index_retired, search_index_state, search_index_targets, search_index_watermarks, site_consent_heads, site_consent_revisions` (+ `mail_capture` in the baseline diff).
1. `apps/website/src/features/database-transfer/__tests__/copy-engine.postgres.test.ts` — 5 tests:
   - "cross-site wipe regression…" (:163), "a schema someone else made…" (:177), "a count mismatch or rejected replacement…" (:232), "an unconfirmed first-copy plan cannot overwrite…" (via `copyInto` :108): `IncompleteTransferPlanError: incomplete transfer plan: content.db: domain_binding, content.db: mail_activity_attempts, … site_consent_revisions` thrown from `/home/user/Jini/packages/db/src/transfer/plan.ts:22`. Helper `copyInto` (test :105-110) passes `collectTransferTables()` (core tables only) while the migrated SQLite fixture now holds 12 TS-only tables; the passing helper `copyAs` (:90-96) uses `planSnapshotTables(source)`, which introspects them. Fix: use `planSnapshotTables` in `copyInto` / the other direct `runCopy` call sites.
   - "T1: the copy carries the schema's indexes…" (:342): `167 !== 139` — the copy now carries the TS-only tables' indexes, but `declaredFor(copied)` counts only core declarations (test :342, indexes assert).
2. `apps/website/src/platform/db/migrations/__tests__/postgres-baseline.test.ts:57` "applies on an empty database and matches schema.postgres.ts at head" — table-name list differs: migrated DB has the 13 TS-only tables above that `ensurePgContentSchema` (schema.postgres.ts) lacks. The sibling `runner.postgres.test.ts:78` already accounts for "TS-only" tables (`collectCoreTables().length + 15`), the baseline test's `exclude`/expected list was not updated. Runs on PGlite, so it fails regardless of environment.

### C. STALE TEST — migration head list
- `apps/website/src/platform/db/migrations/__tests__/runner.postgres.test.ts:64-83` "the content history through the current head applies on real Postgres": pinned `head` ends at `0030_mail_suppression_admin`; actual head also applies `0031_mail_activity_retention, 0032_member_signup_email, 0033_mail_activity_message, 0034_member_auth, 0035_member_external_identities` (`+` lines in the diff). Fix: extend the literal list; the table-count assertion at :84 (`+ 15`) will then also need re-checking (`member_external_identities` etc.) — it didn't get evaluated because the first assert aborts.

### D. STALE TEST — blank Postgres site now seeds the Blog page
- `apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts:80` ("--storage-env: …", expects `rows.posts` `[]`, actual `['blog']`) and the "sealed: …stays blank after boot" test (same assertion): commit `0a91f011 fix(site-dir): blank sites seed the Blog listing page` made `seed.ts:303` seed `page-blog` (slug `blog`). The SQLite sibling `init-storage.integration.test.ts` was updated (mentions blog); the Postgres one wasn't. Fix: expect `["blog"]`.

### E. REAL drift (canary doing its job)
- `apps/website/src/features/theme/__tests__/shipped-site-theme-drift.canary.test.ts` "release stock matches the tracked site reference…": `css/theme.css: stock/reference bytes drifted` (stock 81004 B vs reference 80822 B). `diff content/themes/static/tovu-theme/css/theme.css content/themes/__original-themes__/static/tovu-theme/css/theme.css`: stock lines 1576-1577 add `display: var(--jini-floating-ui-display, inline-flex);` (+ comment "Yield to consent together with chat…") and line 1583 `.made-with-corner { display: var(--jini-floating-ui-display, flex) …}`. Stock was changed in `def2c288 fix(site): chat bubble and "Made with Tovu" pill hide while the consent banner is open`; the tracked reference (`__original-themes__`) was not updated. Reconcile by promoting the change to the reference (or reverting stock).

## §2 Not run / caveats
- Everything listed in the task ran; nothing skipped. The members `.contract.ts` ran through `member-external-identities.dialects.test.ts` (pass) and `.postgres.test.ts` (pass).
- Environment edits are local/uncommitted (package.json/package-lock.json cookie-consent path; /opt/pw-browsers symlinks; PG cluster config). No product code, tests or configs were committed.
- Fixes above were not applied (report only), so the 5 failing files remain failing on the branch.
