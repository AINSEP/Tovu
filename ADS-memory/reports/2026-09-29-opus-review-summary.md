# Opus 5.5 high review of 962f928fb..HEAD + Jini/kUInetic — summary (2026-09-29)

Nine read-only opus-high reviewers (model verified claude-opus-5-5 in every transcript). Excluded: theme sync-originals commits 5179f6f32, 0925ef1e9, c52b8d547 and the 11 Codex-fixed issues.
Totals: critical 0, high 2, medium 13, low ~55. Detail reports: `2026-09-29-opus-review-p{1,1b,2,2b,3,4,4b,5,6}-*.md`.

## High
- H1 p5: `features/webhooks/site-key-ensure.ts:202-209` (+ `site-token.ts:190`) — the "key-dependent data exists" check only scans `<site>/content.db`; PGlite/Postgres sites lose all sealed values (incl. the Postgres connection string) if the key file is lost.
- H2 p4: `features/settings/repo.ts:77` — bare coercer tag written into jsonb `coercion_json`; every settings retype fails on Postgres/PGlite; SQLite→Postgres copy of settings fails too.

## Medium
- p1 M2: Postgres pool has no `'error'` listener (`kernel/drivers/postgres.ts:27`) — dropped idle connection crashes the process.
- p1 M3 (plausible): hidden connection-string prompt ignores Ctrl-D / Ctrl-C (`tovu init --storage postgres`, `tovu storage move`).
- p1 M4 (architecture): `platform/site-dir/boot-site-dir.ts:8`, `init-site.ts:19-21` import server composition + a features internal.
- p1 M1 → LOW after p1b: agent CLIs do not inherit `TOVU_PG_SOCKET`; owner should still ignore the env var (2-line fix).
- p2 M1: publish-credentials `store.ts:276` / source-control `store.ts:244` duplicate-label check is SQLite-only → raw 500 on Postgres.
- p2 M2: `drizzle.database-journal.config.ts` + `db:generate:database-journal` point at a schema with no Drizzle tables → generate would drop the journal tables (unverified).
- p2b M1: database introspection adapter reads `__drizzle_migrations` only → on Postgres/PGlite shows 78 pending, ledger unreadable, drift "unknown".
- p3 M1: `trash/table-adapter.ts:190-257` (+ `adapters/user.ts`) hide/unhide UPDATE has no version check; lock not taken by other writers.
- p3 M2: `post/tool-registrations.ts:521-537` excerpt ignores `bodyFormat` → HTML pages get empty excerpt.
- p3 M3 (impact unproven): `newsletter/repo.ts:480` `saveBatch` N round trips in one tx (ADR-067 §6).
- p4 M1 (plausible): plugin data-module DDL plan outside tx, no lock; concurrent boots on one Postgres → "relation already exists".
- p4 M2 (latent, no prod caller): lipay refund double-count.
- p5 M1: `trust.ts` `isWriteShapedName` misses acronym-leading names (SQLQuery, GraphQLMutation) → approval skipped.
- p5 M2 (fails safe): approval fingerprint includes connection label → rename voids Always-allow.
- p6 M1 (release): Tovu 5c4c93ed0 relies on unpublished Jini devops fix 28f67f9a; Jini devops committed version 0.3.0 < published 0.3.1 — needs a bump above 0.3.1 and a Tovu range bump, or production Cloudflare serves `/_headers` publicly and applies no headers.

## Notable lows
- p1b L1: run finalizer lost its exit flush — quiet run + API stop loses last text/tool-call start.
- p6 L1: theme cloak (d2b0f234a) only in `sites/tovu-dev/themes/static/tovu-theme`; missing from the 3 other copies.
- Many list methods lack ORDER BY on Postgres (post, identity, webhooks, commerce price flip, taxonomy/forms/redirects admin lists).
- forms/entries unique-violation mapping regressions (500 instead of 409; wrong "in the Trash" message).
- `Sqlite*` class names now engine-agnostic; three cloned credential-set repos; several stale comments.
