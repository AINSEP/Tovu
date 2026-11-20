# combine-6 TOVU (2026-11-20) — `integ/merge-6-2026-11-19`

Unattended cloud run. Node 24.22.3 (`~/.local/node24`), pnpm 10.33.2 (corepack). No subagents, no codebase-memory tools, nothing pushed to Jini, `main` / `refactor/terra` / `plan/*` untouched, no force-push, no `--no-verify`. Branch created from `origin/integ/merge-5-2026-11-19` (`0c0f54a0a`).

**Summary: 9 of 11 listed branches merged; tv-xd5-render and tv-xd5-publish aborted (they import Jini subpaths that Jini merge-6 does not export: design-level, needs a Jini commit). Group 0 done except 2 combine-5 failures that need a Jini fix. Final: typecheck 0, typecheck:tests 0, admin tsc 0, size/complexity/hooks ok; typecheck:scripts = the 3 base-red only; architecture: the API-surface hard regression is gone (831 → 705, baseline 821), only the base-red cross-feature-edge set remains (no new edge); why-comments red with 50 open blocks; error gate WARN with 2 new entries.**

## Setup
- Jini: `origin/integ/merge-6-2026-11-19` = `d3e78b387`, `pnpm install --frozen-lockfile` 0, `pnpm --no-bail -r build` 0 (0 `error TS`). No local Jini changes.
- Tovu: `npm ci --ignore-scripts` (root, apps/admin, apps/desktop), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (it linked apps/desktop too), `packages/contracts` + `packages/sdk` built.
- `origin/refactor/terra` had to be fetched for `check:why-comments` (it diffs against it).
- Tests ran in throw-away worktrees (`git worktree`, `node_modules` symlinked to the main tree) so merges could continue: node `--test --test-concurrency=2`, admin `vitest run --maxWorkers=2`.

## Relink merge-5 → Jini merge-6 (`75a004488`, `d74d4d92e`)
- `npm run typecheck` / `typecheck:tests`: 0 / 0 straight away. Admin tsc: 20 errors →
  - consent React moved to `@jini-ai/cookie-consent/react`; admin had no cookie-consent dependency → added (`npm install`, lockfile in `75a004488`; that commit also carries the consent import repoints, staged by the checkout below). `ConsentLookFields` now requires the host light palette: tv-xd2-admin's consent hunks taken early (identical lines, so its later merge was clean); `use-consent-page.hooks.ts` keeps merge-5's version with only the import path changed.
  - `jini-kits.ts`: AdminKit media-providers rules port is one-object (Jini `721ac2a4`) → adapter lambdas dropped (= group 0 d).
- Relink breakage left BASE-RED (not fixed, see "Decisions"): 9 admin vitest tests (6 ag-ui transport, 1 literal-copy, 1 credential autocomplete, 1 dictionary sinks) and desktop tsc (renderer 3, main 11), all failing identically on the relinked base.

## Group 0
| item | result | commit |
|---|---|---|
| (a) module API surface | `contracts/` exempt from the metric (one constant + why-comment in `check-architecture.ts`); fsplit2's 6 exposed files (`static-render-{collections,content,menus,previews}`, `static-template-{choice,resolution}`) reached through the theme barrel again (+2 barrel exports). No `--update`. 831 → 704 (baseline 821). Runtime propagation (non-blocking warning) 3.24 → 3.32 from the barrel's value imports. | `9deb21240` |
| (b) batch-tool-inputs case 2 | test rewritten to per-item results (refused item fails in its own result; later items still run; retry asserts `result.path`). No code change. 15/15. | `35d4eee75` |
| (d) media-providers lambdas | dropped | `d74d4d92e` |
| (e) typed-tools harness | eval sandbox lacked `executorDefinitionPolicies` (scope split moved it to its own module) → bound in the fixture. 13/13 (were 0/13). | `45e0f5010` |

### (c) the 9 combine-5 failures
| test | verdict | how |
|---|---|---|
| content-target-inputs "page writes … version" | stale test | S7b made `expectedVersion` required; the wrong-kind call was refused by input validation (so `output` undefined). Call now carries it. `021334df6` |
| deploy-ops/deploy.test | stale test | Jini deploy-ops logs the error **class** after the line (log-safe, specific). Expectation names it. `021334df6` |
| extract-s9-deploy-ports | stale test | same. `021334df6` |
| extract-s9-g-deploy golden | stale recording | the only diff (verified byte-for-byte against a fresh recording) is that same log line + ` Error`; recording + sha re-pinned with a why-comment. `021334df6` |
| members/write-service shard C | test bug (added untested by tv-ext-u2) | the 6th "verification" is the refused code's dummy-hash verify (deliberate timing parity in `member-challenge.ts`). Test now asserts the stored code hash is never verified after exhaustion and exactly one dummy verify happens. `021334df6` |
| publish-trust/frozen-values.pins | test bug | regex also matched the `readonly kind: "tovu-peer"` type line; value lines only. `021334df6` |
| surface-connections ×2 | **OPEN — Jini fix needed** | Jini ex-log made `agent-plugins/admin-surfaces/connections/connections.ts:131` log `'Desktop sign-in did not complete.'`: the plugin id and the error class are both gone (default console logger drops `{ error }`). Owner rule = restore specific text; must happen in Jini (`desktop sign-in for '<pluginId>' did not complete: <class(code)>`). Tovu cannot inject it (the reporter never receives the plugin id). |
| assistant/moved-tools.golden (catalog bytes 755906 → 755641) | **OPEN** | all 328 names and every per-tool section still match; only the full-catalog byte total moved (-265). Not isolated (needs a merge-4 build to diff the catalog). |

## Per branch (origin/codex/*)
| # | branch (tip) | merge | conflicts → resolution | red found | fix | status |
|---|---|---|---|---|---|---|
| 1 | tv-wave-a3 `c34c5c270` | `fe5edd801` | size-debt.json: 3-way per key (removed by either side stays removed; both changed → lower) | `post-tool-duplicate` typed `PostRecord` (createPost needs `PublicPostKind`); admin test imported `AccessTokenRow` from split `rules.ts`; **dev-auth.ts 507 / assistant-byok.ts 533 code lines: new max-lines violations**; 12 stale complexity entries it fixed but didn't delete; `ownedRunOrNull(run, principalId, workspaceId)` positional; my 0b comment rewrite | `9daff5a27`: types fixed; **dev-auth.ts + assistant-byok.ts kept at their pre-merge versions** (and their 3 function-debt rows restored) instead of splitting further; stale rows deleted; helper takes one object; comment allow-listed | merged; 2 files' split dropped |
| 2 | tv-xd-lockfile `020386fd3` | `e01af18b6` | 7 import blocks: credential-copy from `@tovu/contracts` (xd-lockfile) + operator-locale from merge-5's `#src/contracts/core/operator-locale` (arch-l09a); admin `rules.ts` kept wave-a3's split, its import applied to the split `access-token-rows.ts` | none (no lockfile change despite the name) | in the merge | merged |
| 3 | tv-xd2-admin `2aec2e87b` | `0031d9943` | ThemePreviewReloadButton deleted vs modified | the new `ThemePreviewReloadControl.tsx` imports `@jini-ai/cms/themes/react`, which Jini merge-6 removed (cms forbids react) | **Tovu's reload control kept** (button, hook, tests, hook-debt row); xd2's control file dropped. PublishRunResult → `@jini-ai/devops/deploy/react`: admin had no devops dep → `b142f627a` (lockfile) | merged; reload control stays in Tovu |
| 4 | tv-xd5-desktop `33c81690e` (incl. xd2/3/4) | `5ace7e36c` | 7 files. `project-ipc.ts` was split into 9 modules on merge-5: xd5's 42 hunks replayed into the split files by script, 3 import hunks by hand; AssistantDock.hooks.tsx (split): visible-interval repoint applied to `composer-discovery.hooks.ts`; find-query-scheduler (now `@jini-ai/ui/core`) repointed in the split find-bar files; tests keep split imports + Jini owners | split-file imports the replay missed; `recordSiteClosed` untyped arrow (implicit any); site-history-menu test on Jini's menu union; 112 why-comment blocks of whole files moved to Jini | `0746d5ac7`; **L8b.1 gate F6** `84563f1c3`: `@jini-ai/ui` devDependencies → dependencies (npm install; npm also bumped the lock to 0.7.2 for agentic/platform/ui/ui-kit) | merged; desktop tsc = base (pre 0, renderer 3, main 11, live-verify 0) |
| 5 | tv-xd5-render `af7ba5ab0` | **aborted** | 7 conflicts resolved, then typecheck: imports `@jini-ai/cms/presentation/html`, `/presentation/page-head`, `/forms/result-query`, `/forms/result-flash`, `@jini-ai/http-kit/range` — the source files exist in Jini merge-6 but the package.json `exports` entries do not | design-level (Jini half incomplete) | — | **not merged** |
| 6 | tv-xd5-publish `23c00b5bc` | **aborted** | 13 conflicts; prechecked imports: `@jini-ai/cms/themes/preview/refresh`, `@jini-ai/devops/backup/plan-store`, `@jini-ai/devops/backup/push-jobs` not exported by Jini merge-6 (files exist) | design-level | — | **not merged** |
| 7 | tv-ext-assistant `b17df641c` | `fa728d65d` | external-mcp-probe imports: credential-copy from `@tovu/contracts` + `createFetchMcpHttpExchange` from `@jini-ai/mcp/federation` | — | — | merged |
| 8 | tv-ext-web `32278af79` | `07ad2b75c` | none | 1 new error-gate entry (`failure-text-from-catalog` stdin-input.ts) | open | merged |
| 9 | tv-ext-admin `89cb9bd72` | `fb1ddd27d` | none | — | — | merged |
| 10 | tv-ext-desktop `bee1daa56` | `655d73902` | none | — | — | merged |
| 11 | tv-ext-cms2 `3057963c4` (incl. tv-ext-cms) | `7091708c1` | none | (also tv-ext-desktop / tv-xd-lockfile: undeclared runtime deps → `a0dbfebe3`) trash-item-tool: Jini `EntitySnapshotRow.version` optional vs port's required; `scripts/forms-maintenance.ts` imported the deleted entry-refs repo; desktop e2e fixture imported deleted `remove-site-tree` (xd5-desktop) | `2221462ae` | merged |

Per-merge gates: run after every merge for 1–4; for group 3 (7–11) once after the group (tool budget), all fixed in `2221462ae`.

## Real production bugs found
1. **tv-xd2-admin would not have built**: its reload control imported a Jini subpath that Jini merge-6 deleted. Kept Tovu's control.
2. **tv-wave-a3 duplicate-post typing**: the extracted `createDuplicatePost` widened the source to `PostRecord` (kind `PostKind`) while `createPost` requires a public kind; compile error, fixed by typing the param as the `PublicPostRecord` the reader returns.
3. **tv-xd5-desktop**: `recordSiteClosed` adapter in `main/index.ts` was an untyped arrow (implicit any: would have failed `tsc -p tsconfig.main.json`); e2e fixture imported a deleted module.
4. **tv-ext-cms2**: `scripts/forms-maintenance.ts` imported a deleted repo (module-load crash of the maintenance script) and `trash-item-tool` failed `tsc`.
5. **Jini (not fixable here)**: ag-ui transport now rejects with a generic `'The agent run stream stopped with an error (<class>)…'` **without `{ cause }` and without the HTTP status** (6 admin tests); admin-surfaces sign-in failure log lost plugin id and class (2 node tests); 8 Jini subpaths have files but no `exports` (blocks xd5-render/publish).
6. **Packaged desktop would miss two runtime packages** (`@jini-ai/user-management`, `@jini-ai/platform` via `@tovu/contracts`): caught by the desktop hoisting test, fixed in `a0dbfebe3`.

## Gates — base vs final (Tovu root; admin = `cd apps/admin && npx tsc --noEmit -p .`)
BASE = `d74d4d92e` (merge-5 relinked to Jini merge-6). FINAL = `2221462ae` (later commits: `a0dbfebe3` deps/lockfiles only, this report).

| gate | BASE | FINAL |
|---|---|---|
| `npm run typecheck` | exit 0 | **exit 0** |
| `npm run typecheck:tests` | exit 0 | **exit 0** |
| `npm run typecheck:scripts` | exit 2, the 3 base-red (agent-plugin-activation TS2554, check-size-drift TS5097, dev-admin-build TS2339) | exit 2, identical 3 lines |
| `npm run check:size` | ok, 83 debt entries | ok, **71** |
| `npm run check:complexity` | ok, 16 entries | ok, **4** |
| `npm run check:architecture` | exit 1: API surface 821 → 831 + cross-feature edges (base-red) | exit 1: **API surface improved 821 → 705**; cross-feature-edge lines identical to base (no new edge); runtime propagation warning 3.24 → 3.32 (non-blocking) |
| `npm run check:errors` | passed, 739 findings / 423 entries | passed (WARN mode), **2 new entries**: `catch-reads-error` apps/desktop/src/tovu-server.ts (xd5-desktop), `failure-text-from-catalog` apps/website/src/cli/commands/stdin-input.ts (ext-web) — open |
| `npm run check:hooks` | ok, 41 | ok |
| `npm run check:why-comments` | ok (after fetching origin/refactor/terra) | **exit 1: 50 open blocks** (+113 allow-listed: 112 whole-file moves to Jini, each naming the deleting commit; 1 my 0b rewrite) |
| admin tsc | exit 0 (after relink fix) | **exit 0** |
| desktop `tsc -p tsconfig.{preload,renderer,main,live-verify}.json` | 0 / 3 / 11 / 0 | 0 / 3 / 11 / 0 (same lines) |

Open why-comment blocks (lost from files that still exist; need the comment moved or a reason): desktop `tovu-server.ts` 11, website `assistant/byok-credential.ts` 10, `features/trash/trash-item-tool.ts` 8, desktop `site-dir-store.ts` 5, `form-delivery.ts` 2, desktop `project-ipc.ts` 2, `desktop-user-data-dir.ts` 2, and 1 each in `entry-refs-repo.sqlite.ts`, `cli/commands/init.ts`, `cli/commands/agent-plugin-tokens.ts`, `assistant/index.ts`, `site-history-menu.test.ts`, `use-live-views.hooks(.test).ts`, `project-ipc.test.ts`, `main/windows/site-window.ts`, admin `lib/local-owner-signin.ts`. Full list: `npm run check:why-comments`.

## Tests
- Group 0: the 9 combine-5 files 135/144 → 7 fixed (138/138 on the fixed set); batch 15/15; typed-tools 13/13.
- tv-wave-a3 scoped (594 files: changed tests + `__tests__` next to changed sources + importers): 6188 tests, 6119 pass, 57 fail. All 35 non-Postgres failures (24 files) fail identically on the relinked base (`d74d4d92e`): **0 new**. The rest are Postgres suites (no server).
- Admin vitest, groups 1–2 areas (security, lib, deployment, consent, themes): 4113/4122; the 9 failures are base-red (relink, above).
- Desktop: smoke gate suites + project-ipc/add-site/shutdown/history-menu/project-wiring **331/331**. A packaged-app smoke (real Electron binary) is impossible here: `npm ci --ignore-scripts`, no Electron binary, headless container.
- **FULL node suite** (`npm test` globs, `--test-concurrency=2`, worktree at `2221462ae`): **stopped by the run's time budget, PARTIAL**: 30,569 top-level ok / 214 not ok; 97 failing files, 28 of them Postgres suites (no server). The 69 non-Postgres failing files are listed in `cloud-results/combine-6-tovu-full-suite-failing-files.txt`; there was no time to diff them against base (the scoped wave-a3 run and the admin/desktop runs were base-diffed: 0 new).
- **Admin vitest FULL** (HEAD `2221462ae`): 14,857 pass / 25 fail / 2 skipped, 6 files: all base-red (re-run on the relinked base: same files fail; JiniMediaPicker.hooks ×3 + recharts-bundle-integer-ticks ×13 fail there too: 16/26).
- **Desktop `npm test` FULL**: 2161 pass / 48 fail; base 47 fail. The 1 new one, `jini-mcp-peers.test` "runtime source imports declare their packages instead of relying on hoisting", was a **real packaging bug** (failing test first): `desktop-auth.ts` imports `@jini-ai/user-management` (tv-ext-desktop) and `packages/contracts/src/credential-copy.ts` imports `@jini-ai/platform` (tv-xd-lockfile), neither declared → both declared via `npm install` (desktop/admin/root locks), `a0dbfebe3`; 8/8.

## Skipped and why
- **tv-xd5-render, tv-xd5-publish**: aborted (Jini merge-6 lacks their export entries, above). Their xd2/3/4 rounds are inside them, so none of the render/publish extraction is on this branch.
- tv-wave-a3's function splits of `dev-auth.ts` and `assistant-byok.ts` (file-size regressions).
- tv-xd2-admin's `ThemePreviewReloadControl` (Jini removed the cms React control).
- Per instructions not merged: codex/tv-ext-rs-c, tv-rs-e, tv-split, tv-dh, claude/uiux-split, codex/tv-xd3-*, ex-env*, chat-deps.

## Decisions needed
1. **Jini exports for xd5-render/publish**: add `exports` (+ jini runtime metadata) for `cms/presentation/html`, `cms/presentation/page-head`, `cms/forms/result-query`, `cms/forms/result-flash`, `cms/themes/preview/refresh`, `http-kit/range`, `devops/backup/plan-store`, `devops/backup/push-jobs` in Jini, then merge both branches (combine-7).
2. **Jini ag-ui transport error**: keep `{ cause }` and the HTTP status (`HTTP 502`) in the wrapped error, or accept the generic text and update the 6 admin tests.
3. **Jini admin-surfaces sign-in log**: restore plugin id + class/code (2 Tovu tests).
4. 50 open why-comment blocks: move them with the code or give reasons.
5. dev-auth.ts / assistant-byok.ts: split into sibling modules (they still carry 3 function-debt rows), or accept.
6. moved-tools golden catalog bytes (-265): re-record or investigate.
7. Relink base-red: desktop tsc renderer 3 / main 11 (`desktop-resources.ts` ProcessSnapshot args, `site-backend.ts` TServer, `smoke-packaged-chat-gate`, `App.tsx` trailing-comma TS1013), admin literal-copy (collections placeholders), credential-input autocomplete, dictionary sinks (posts-i18n).

## Next step
Re-run the full node suite to completion (it needed > 1.5 h at concurrency 2 here) and diff its 69 non-Postgres failing files against `d74d4d92e`.
Owner: decision 1 (Jini exports), then combine-7 merges tv-xd5-render + tv-xd5-publish (+ the deferred tv-ext-rs-c, tv-rs-e, tv-split, tv-dh, uiux-split) and clears the 50 why-comment blocks + 2 error-gate entries.
