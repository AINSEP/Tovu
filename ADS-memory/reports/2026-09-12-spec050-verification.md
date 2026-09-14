# SPEC-050 (core.site.title) Verification Report

- Agent: TestRunner(Execution)
- Date: 2026-09-12
- Commits verified: `dfec609f` (Step 1), `b68c9de7` (fix to Step 1), `33d45292` (Step 2)
- Spec: `ADS-memory/specs/050-core-site-title/feature.spec.md` v0.2.0 APPROVED

## 1. Commit hygiene

`git show 33d45292 -- apps/website/src/server/inbound/public-http/routes/site/pages.ts` contains
exactly one hunk (10 lines, +9/-1), purely site-title wiring: adds `preservationStore`,
`workspaceRepo`, `siteDisplayName` to the `resolveSiteTitleForRender` call. No media-work hunks.

Working tree's current uncommitted diff on the same file (`pages.ts`) is unrelated media work
(renaming `collectImageAssetIds` -> `collectMediaRefAssetIds`, adding `media` node type and
`contentType` resolution) — not site-title, and not mixed into the commit.

`git diff | grep -il "site-title\|siteTitle\|resolveSiteTitle"` across the entire working tree:
no matches. No leftover uncommitted site-title work.

**Verdict: clean.**

## 2. Tests (run individually, `env -u TOVU_ADMIN_PASSWORD node --import tsx --test
--experimental-test-module-mocks <file>`, from repo root)

| File | Pass/Total |
|---|---|
| `features/settings/__tests__/site-title.test.ts` | 16/16 |
| `features/settings/__tests__/site-title-preservation-store.contract.test.ts` | 6/6 |
| `platform/db/__tests__/site-title-preexisting-marker-migration.test.ts` | 4/4 |
| `.../routes/site/__tests__/integration/site-title.integration.test.ts` | 8/8 |
| `.../routes/site/__tests__/integration/site-title-preservation.integration.test.ts` | 5/5 |
| `server/__tests__/routes/seo-site-serving.test.ts` | 7/7 |
| `server/__tests__/site-assistant-routes.test.ts` | 7/7 |
| `server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts` | 4/4 |
| `server/__tests__/integration/hydrate-blob-store-boot.integration.test.ts` | 2/2 |
| `server/__tests__/integration/hydrate-content-db-boot.integration.test.ts` | 2/2 |

**Total: 61/61 pass, 0 failures, no flakes observed.**

## 3. Spec trace (AC/REQ -> real assertion)

Solidly covered with real HTTP/SQLite assertions: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06,
AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-15, AC-16, AC-17, AC-18; INV-01, INV-02,
INV-06. INV-04 (single `<title>`) covered implicitly via the `assertSingleTitle` helper used
throughout. INV-03 (no user-layer resolution) is true by construction — `resolveSiteTitle` calls
`getEffective` with no `principalId` (`site-title.ts:240-243`) — but no test threads a principal
through to prove a regression would be caught.

**Gaps:**

- **AC-14 is only partially tested, and the existing test would still pass with the REQ-08 bug
  present.** Spec requires: an invalid write (`""`, `"   "`, 201 chars) is *rejected* with a
  validation error, and the *previous* stored title keeps rendering. The actual test
  (`site-title.integration.test.ts:141-155`, named "AC-14 subset") never checks the write's HTTP
  status, and asserts the *no-owner-title fallback* renders (`IN_MEMORY_WORKSPACE_NAME`) — not the
  previous value ("My Site" from the prior successful write in the same test). This matches the
  commit message's own disclosure: "Out of scope and unchanged: REQ-08/AC-14 write-time
  rejection." Disclosed, not hidden — but AC-14 as specced is not met.
- **AC-19** (Liquid `{{ site.title }}` with an owner-set title, through a templated preview) has
  no test in any of the 3 commits. Pre-existing Liquid tests (`liquid-sandbox.test.ts`,
  `render-handlebars.test.ts`) hardcode `ctx.siteTitle` directly and predate this feature; none
  exercises the real resolver's owner-set path through a templated preview.

## 4. Mutation testing

Environment note: `development/scripts/mutation-sweep.mjs` spawns `node --import tsx --test`
without unsetting `TOVU_ADMIN_PASSWORD` and without `--experimental-test-module-mocks`. With
`TOVU_ADMIN_PASSWORD` set (as it was in this shell), the baseline fails on AC-15/AC-16 (401 vs
200, `loginAsOwner`). Ran the whole script under `env -u TOVU_ADMIN_PASSWORD`; baseline then
went green (the `--experimental-test-module-mocks` flag turned out not to be needed for these
particular files — no `t.mock.module` usage in them).

**`site-title.ts`** (8 mutants generated): 6 killed, 2 SURVIVED. Both read and judged:
- `:150` `if (pendingWorkspaceIds.length === 0) return result;` — pure perf shortcut. Removing it
  still yields the identical `result` object, because the subsequent `for` loop over an empty
  array is a no-op. Not a coverage gap.
- `:244` `if (resolved === null) return LEGACY_SITE_TITLE;` — equivalent mutant. Removing it makes
  `resolved.sourceLayer` throw on `null`, caught by the enclosing `try/catch` (`:249-253`), which
  *also* returns `LEGACY_SITE_TITLE`. No test can distinguish the two code paths because both
  produce the same observable output.

**`site-title-preservation.sqlite.ts`**: 0 mutants generated. The file is pure Drizzle
query-builder chains (`select().from().where().orderBy().all()`) with no `if` guards or `??`
fallbacks — the sweep's regex-based mutators (guard-never-fires, drop-nullish-default) have
nothing to target. This is a tool blind spot for this file's style, reported as **N/A**, not as a
pass. The only evidence for this file is the 6/6 contract-test pass from section 2.

**Race guard, hand-mutated** (the sweep's regex can't reorder statements): swapped the order of
the marker-read (`deps.preservationStore.isPending`) and the value-read (`getEffective`) in
`resolveSiteTitle` (`site-title.ts:239-240`). Ran the one targeted test
(`REQ-07: the pending marker is read before the value...` in `site-title.test.ts`) — went RED:
`actual: 'My Site'` vs `expected: 'Tovu Demo Site'`. Confirms the read-order guard is load-bearing
and is caught by the existing test. File restored immediately after
(`cp scratch/site-title.orig.ts site-title.ts`); confirmed via `git diff --stat` (empty) both after
this hand-mutation and after the automated sweep completed.

## 5. Postgres gap

Confirmed: no `drizzle-kit` config for Postgres exists (only
`apps/website/src/platform/db/drizzle.config.ts`, `dialect: "sqlite"`), no `.sql` migration tree
for Postgres anywhere in the repo, and no composition-root wiring
(`grep` for `createPostgresRouteDeps`/`postgres://`/`DATABASE_URL` outside test fixtures and
`platform/db/migration/pg-fixture.ts` returns nothing). The NC-3 marker-population logic lives
entirely inside the raw SQLite migration file
(`platform/db/drizzle/0063_site_title_preexisting_workspaces.sql`:
`INSERT INTO site_title_preexisting_workspaces SELECT id FROM workspaces`). `schema.postgres.ts`
only carries the generated table DDL, used by drift/parity tests against a throwaway live Postgres
— never populated with data.

**What a pre-existing Postgres site's title would become:** the table would exist but stay empty
forever (`listPendingWorkspaceIds()` returns `[]`), so no workspace is ever pinned — every
Postgres-backed workspace (old or new) falls straight to the NC-2 display-name default. That is
exactly the "silent flip" the Wiring Order (REQ-10) exists to prevent, but only for a dialect that
is not wired to anything live.

**Is Postgres a real deployment target today?** No. `deployment_model.md` (superseded note, dated
after the base file, citing `development/docs/deployment/deployment-constraints.md`): "Postgres
has NO runtime driver at all" — no composition root boots against Postgres in production.
Independently confirmed by the grep above. This is a latent gap in dormant code, not a production
risk today.

## 6. Architecture delta

`npx tsx development/scripts/check-architecture.ts` (no `--update`, baseline untouched):

```
module API surface (files exposed) regressed: 231 -> 269
back-edges into composition root regressed: 0 -> 1
module cycles: +2 pair(s) (assistant<->server, features/post<->platform); largest SCC 0 -> 8
WARNING (non-blocking): propagation cost (runtime-only) 2.05 -> 2.22
WARNING (non-blocking): bidirectional hub count 152 -> 177
improved: propagation cost (all-import) 13.17 -> 12.96
check:architecture -- FAILED: 3 metric(s) regressed against a hard constraint.
```

**Attribution of the +38 API-surface regression:** the metric counts distinct files reached by a
deep import that bypasses the target module's own `index.ts`. `features/settings/index.ts` does
not re-export `site-title.ts` or `site-title-preservation.sqlite.ts` (both new files from
`33d45292`), so every external caller reaches them directly. Confirmed 5 non-test external
importers: `platform/db/schema.ts`, `server/runtime/composition/app.ts`,
`server/runtime/composition/deps.ts`,
`server/inbound/public-http/routes/site/pages.ts`, `server/routes/types.ts`. That is **+2 of the
38** directly attributable to these 3 commits.

The remaining **+36**, plus both new module-cycle pairs (`assistant<->server`,
`features/post<->platform`) and the new back-edge into the composition root, are **not**
attributable to spec-050 — neither cycle touches `features/settings` or `platform/db`. The
working tree carries dozens of unrelated modified files (per `git status`):
`agent-plugins/activation.ts` + `tool-registrations.ts`, `forms/tool-registrations.ts`,
`post/agent-tools.ts`, `widgets/resolver-service.ts`, `media-repo.sqlite.ts`,
`EmbedInsertControl`, `assistant/tool-registrations.ts`. `check-architecture --list` only
aggregates deep-import counts per target module, not per-file names, so a full file-by-file
accounting of the other 36 was not possible without a historical checkout (not attempted — would
require a worktree or destructive checkout in a shared tree). The spec-050 portion (+2) is
directly confirmed by import-graph inspection; the rest is pre-existing/concurrent branch growth.

## 7. REQ-08/AC-14 write paths

Jini's schema validator (`Jini/packages/cms/src/settings/settings.ts:103-108`) only checks
`typeof value === "string"` for a string-typed definition; its own comment for the `"json"` case
(`:115-117`) states the design intent explicitly: shape/length validation beyond `typeof` is "the
registering feature's own write-path job."

Write paths for `core.site.title` found (all funnel into the same Jini `set()` chokepoint):

1. `apps/website/src/server/inbound/admin-http/routes/settings/set.ts:76` — generic
   `PUT /api/admin/v1/workspaces/:workspaceId/settings/value`, Tovu-owned.
   `parseSetRequestFields` (`set.ts:30-49`) validates field *presence* only, never shape, before
   calling `set()`.
2. `apps/website/src/features/settings/tool-registrations.ts:44` (`contributeSettingsTools()`) —
   wraps Jini's own generic agent tool `buildSettingsRegistrations`
   (`Jini/packages/cms/src/settings/tool-registrations.ts:194`). The tool logic itself is
   Jini-owned; only its contribution into Tovu's assistant catalog is Tovu code. No extra
   validation.
3. `site-title.ts`'s `pinOneWorkspace` (system pin) also writes through `set()`, but writes the
   fixed 14-char literal — not an owner-facing path, not a REQ-08 concern.

No raw-repo write bypass exists (`grep` for `saveWorkspaceValue` outside `repo.sqlite.ts`'s own
implementation finds nothing).

**Answer:** yes — path 1 (`set.ts:76`) is fully Tovu-owned and is the correct, minimal insertion
point: a `namespace === "core.site" && key === "title"` branch there, trimming and length-checking
`valueJson` before calling `set()`, would satisfy REQ-08/AC-14 with zero Jini changes. Path 2 is
harder: it is Jini's generic tool wholesale; enforcing this there needs either a Jini change or a
dedicated Tovu-owned site-title agent tool built to replace/supplement it for this one setting.

## Context use

Ran the full 7-task verification (10 individual test-file runs, 2 mutation sweeps, 1 hand-mutation,
1 architecture run, plus code reading across ~8 source/test files and one Jini file) in a single
continuous session. Did not approach a context size requiring rotation.
