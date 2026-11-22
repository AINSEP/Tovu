NOT READY bb684173da: 3 new red tests need owner decisions (AG-UI raw interruption text = open bug C11-agui-run-error-raw-message; AG-T0 vs tv-ag1 golden conflict; tv-own Q3 stale share case); Q4 and PLUGIN-ID-UPGRADE are PARTIAL. All 11 merges, B1 and B2 are done and pushed; worker graph 7 → 0 fails and admin 19 → 6 base-reds, but non-blocking complexity (+3), size (+1) and why-comments (+2) debt is new.

# combine-11 TOVU (2026-11-21) — `integ/merge-11-2026-11-21`

Unattended cloud run, Opus high. Base `origin/integ/merge-10-2026-11-21` `0973a5fdc8`. Jini `origin/integ/merge-11-2026-11-21` `1ac1cbbd1` (= published 0.7.3-next.2), read-only: built and linked, nothing pushed to Jini. Only `integ/merge-11-2026-11-21` was pushed (plain `git push`, after every merge and fix). No subagents, no codebase-memory tools, no force-push, no `--no-verify`, no `git pull --rebase`, no tags, no publish. `main`, `refactor/terra`, `plan/*`, `port/*` were only fetched. No `_optional = {}` pad on a surviving declaration was removed or renamed (the one merge that touched a padded signature, `reconcilePluginActivationsOnce`, keeps its pad).

**Summary.** Part A: all 11 merges landed in order, one `--no-ff` merge each, pushed after each. There were 3 textual conflicts (tv-bugs2, wip-1110, main) and 1 semantic conflict (main × the integ object-arg refactor). 4 follow-up fixes were needed, each one line or test-only. The final suite then found 23 more test files pinning the old incident-ID format (the bugs1 T3 cascade); they were repointed test-only. 55 named mutations were run in Part A, and every valid one was killed (one first attempt mutated a test file instead of production; it was redone on production and killed). `@jini-ai/*` is now `^0.7.3-next.2` in every manifest and lockfile, and `npm ci` passes in all 4 roots. Part B: **B1 done** (Postgres dialect isolation: witness → fix → mutation). **B2 done** (Recharts approval moved to the verified registry payload of 0.7.3-next.2; this also ends the owner's long-standing 13 admin base-reds). **B3 PARTIAL** (Q4 acceptance cases 1–2 only). **B4 PARTIAL** (failing upgrade proof only). Two production bugs were found and fixed on the merge (share download 403, stage-payload message). One is open: the AG-UI `RUN_ERROR` carries the raw transport text again.

## Setup
- Read first: `cloud-results/combine-10-tovu.md` (Setup), the sheets on Tovu `origin/plan/commit-plans-1120` `commit-plans/<branch>.COMMIT-PLAN.md` / `.report.md`, `r62t-bugs2.plan.md` (O1, O3), `r62t-rsy-6.plan.md` (Q4), `r62t-rsy-7.plan.md` (PARTIAL plugin ID upgrade), and `cloud-results/deps-1121-tovu.md` (deps/lockfile-1121 has no COMMIT-PLAN).
- Node 24.22.3 (`/opt/node24`), npm 11.19.1, pnpm 10.33.2 (corepack).
- Jini detached at `1ac1cbbd1`: `pnpm install --frozen-lockfile` 0, `pnpm --no-bail -r build` 0 (0 `error TS`).
- Tovu: branch created from `0973a5fdc8`. `npm ci --ignore-scripts` root/admin/desktop 0/0/0. `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` 0. `packages/contracts` tsc 0, `packages/sdk` build 0. These were re-run after merge 1 and merge 11 (lockfiles changed), including site-chat `npm ci` 0.
- PostgreSQL 16 cluster started. Role `la`, DBs `jini_chat_test_c11` (`TOVU_CHAT_TEST_POSTGRES_URL`) and `commerce_test` (`COMMERCE_PG_URL`). `PGHOST/PGUSER/PGPASSWORD` set.
- Playwright: `PLAYWRIGHT_BROWSERS_PATH=/home/user/pwb`, which symlinks `/opt/pw-browsers/*` plus `chromium{,_headless_shell}-1228 → -1243`. Nothing installed, nothing in the repo.
- `origin/refactor/terra` and `origin/main` were fetched, because why-comments needs `refactor/terra`. The first base why-comments run failed with `bad revision 'origin/refactor/terra'` and was re-run after the fetch.
- Gate set = combine-10's: size, boundaries, admin tsc, typecheck(+e2e), desktop tsc ×4, complexity, errors, worker-import-graph, typecheck:tests, hooks, typecheck:scripts, why-comments, architecture. It ran on the unmodified base first (`combine-11-tovu-base-*.txt`) and after every merge (`combine-11-tovu-m<N>-gates-vs-base.txt`). **Base = combine-10 final exactly.** The one difference: complexity is 0 on base, because combine-10's A5 had landed.
- Test runner: each test file runs alone under a 15-min watchdog, 3 in parallel (node `--test` with the root `npm test` imports; admin via `npx vitest run <file>`; desktop via its own runner).

## Part A — merges (in order; raw: `combine-11-tovu-sheet-tests.txt`, `…-mutations.txt`, `…-m<N>-gates-vs-base.txt`)

| # | branch @ SHA | merge commit | conflicts → resolution | sheet tests after merge | mutations (all must go red) | gates vs base | status |
|---|---|---|---|---|---|---|---|
| 1 | `deps/lockfile-1121` @ `e60152fb40` | `69c007249` | none | `npm ci` root/admin/desktop/site-chat 0/0/0/0; site-chat tsc 0; site-chat `npm test` 161/1. The 1 is `site-assistant-transport.test.ts`, the recorded BASE-RED (react 19.2.8 vs react-dom 19.2.7 under linked Jini) | none named | identical | DONE |
| 2 | `codex/tv-own` @ `27f4407273` | `ccebfe8a0` | none | serve-command 16/1 (the identity re-seed log case. Its default sink logged only `Error`; tv-bugs2 T-SEED-LOG fixes this, and it is **17/0 after merge 6**), archive-round-trip 3/0, push-cancellation 7/0, github-backup-secrets 1/0 | **12/12 killed**: Q3 guard off → archive warned case red; T7 cancel→not_pushed, bypass observed wrapper, rejection unsettled → push-cancellation red (2/5/1); WORKER restore each of taxonomy/forms/media → worker graph 22/4 each, SEO barrel 24/2, post barrel 23/3; T2-PREP omit `installOtlpProvider` → span case red; T2 drop `withSampleContent` → 6 red incl. AC-08; ARCH-CYCLE restore pair → `check:architecture` reports "1 pair(s) removed since baseline" again | **worker-import-graph 7 fail → 0 (26/26)** against linked Jini next.2's narrow cms exports. NEW: complexity `backup-service.ts:681 pushPlannedBackup` 11; size Worsened `backup-service.ts` 547 (baseline 535); architecture: `widgets/deps.ts → post/index.ts` replaced by 5 leaf edges, "1 pair removed" line gone (baseline pruned), propagation 3.33 → 3.26 | DONE; 2 minor gate findings LISTED |
| 3 | `codex/tv-abort` @ `361718ac0b` | `717ee6d42` | none | consent `tools.test.ts` 22/0 | **2/2**: drop draft `throwIfAborted` → "confirmed draft aborts before the first SQL write" red; drop publish one → "confirmed publication aborts…" red | = m2 | DONE |
| 4 | `codex/tv-ag1` @ `d1747c0101` | `75968833d` + fix `b4da1d7a6` | none | routes 38/0; wire golden 9/1 → **10/0** after a test-only golden fix: the new interrupt golden had `toolCallId` before `message`, but the shipped Jini drain spreads the zod-parsed marker (`message`, `toolCallId`) | **3/3**: old drain (file at `0973a5fdc8`) → interrupt golden red; no host `res.end()` → golden 7 red (5 s EOF timeouts); no `reader?.cancel()` → "Stop … calls the daemon's own /cancel" + span case red. **Minor:** that third mutation also strands the routes suite's teardown (killed by hand after the 2 reds), contrary to the sheet's claim that the cleanup prevents it | = m2 | DONE |
| 5 | `codex/tv-gate` @ `fa805fdab4` | `8162b422e` | none | CopyKeysDialog 3/0, database-recovery 63/0, execute-pull 13/0, credential-copy pins 4/0, other-site-keys 10/0 | **10/10**: A10/A18/A19 each omit confirm signal, omit execute signal (one red per case); T46 no limit, no omittedCount (other-site-keys red), GET projection removed (pins red), notice not rendered (dialog red) | + complexity `use-copy-keys.hooks.ts:24 useCopyKeys` 11 | DONE; 1 minor LISTED |
| 6 | `codex/tv-bugs2` @ `f467418cb9` (contains bugs1) | `743644fb5` + fixes `68f39046d`, `c3ac7bd03` | **`assistant-ag-ui.ts`**: tv-ag1 deleted the local `drainAgUiStream`; bugs1 T4 edited its catch to the fixed interruption sentence. Resolution: keep tv-ag1's file (the local drain no longer exists). See "Production bugs": the T4 intent now has to live in Jini's `drainRunFramesToAgUi` | serve-command **17/0**; overlay/soon-lock 1/0, 8/0; credential-warnings 4/0; share-backend 14/0; site-share 8/0; list-send-log 5/0; escape-paths 2/0; fatal-boot 8/0; core-rpc 6/0; hygiene i18n 1/0. Reds fixed: **import-errors 6/2 → 8/0** (test-only: shared `assert-admin-response.ts:39,84` still pinned v4 UUIDs. bugs1 T3 mints `ERR-XXXX-…`. Same regex as escape-paths:45; 193 importers, 14 sampled all green). **site-transfer-credential-warnings 15/1 → 16/0** (one-line production fix, see bugs). Still red: **wire golden 9/2** "a dropped daemon stream … private interruption message" (actual `'aborted'`; open bug); **vendor-neutrality 1/1**: 4 hits outside T-VENDOR's two lines (`bundled-catalog.ts:47,48,57`, `shared-owner.ts:81`, last touched 11-09/11-10). BASE-RED per deps-1121; it **meets the T-VENDOR STOP**, so it is listed | **8/8 run**: T1 shared `agentSessions` → core-rpc red; T2 `limit` not `limit+1` → list-send-log red; T3/DISK-PINS UUID minting → import-errors 4 red + escape-paths red; SEED-LOG old logger → fatal-boot red; I18N old parser → red; SZ restore 409 → credential-warnings red; SZ token predicate → site-share + credential-warnings red; SZ provider refusal removed → share-backend red. Later (trial worktree): SZ unconditional guard → credential-warnings red. **NOT RUN**: SZ static guard (the static refusal call was deleted, so there is nothing single to restore); T-VENDOR (already red on base, so a restore cannot show a change); AG-T0 packed drain (moot: tv-ag1 already uses Jini's drain); T4 (its code no longer exists) | why-comments 77 → **78** (`share-service.ts:126-131 [b3ec582b7325]`, the old acknowledge doc replaced by bugs1) | DONE; 1 bug OPEN; T-VENDOR STOP LISTED |
| 7 | `codex/tv-ci` @ `5cd9b7be07` | `2125e4295` | none | contribution 30/0, surface-adapters 20/0, desktop-release-gate 4/0 | **5/5 runnable**: T4 drop JINI picker admission; broaden to any `JINI_*` public name (surface-adapters red each); T5 drop Jini parse; drop namespace selection (contribution red 2 each); T3 drop `!inputs.dry_run` on the release job → release-gate red. **NOT RUNNABLE here**: T1 (fail root typecheck in CI), T2 (route-coverage floor job). Both need GitHub Actions | = m6 | DONE |
| 8 | `codex/tv-upg2` @ `6056cf9216` (contains tv-upg) | `a6726bd04` | none | github-commit-site 59/0, mail-provider-contribution 13/0, mail-provider-setup 8/0, portable-host-guidance 1/0, commit-site 43/0, mail-credential-cards 8/0, resolve-mailer-lifecycle 14/0, plugin-credential-cards 20/0, site-search 25/0, resend bundled-mail 28/0, federation 6/0 | **10/10**: CRED-T2 drop `Jini` candidate, drop `Tovu` candidate, historical-first, bind `describeMailProviders` directly (lifecycle red each); CRED-T3 old `Tovu Mail —` default (contribution + setup red); FED skip `await reload` (federation 2 red); GH-T1 omit predecessor / supply to all (commit-site red each); CRED-T1 drop `Jini Search —` / `Tovu Search —` candidate (site-search red each). **NOT RUN**: stale Meilisearch label in a disposable Jini manifest (needs a packed candidate) | why-comments → **79** (`site-search.ts:64-67 [096121b6167d]`, old `Tovu Search` label doc) | DONE |
| 9 | `codex/tv-howto-pages` @ `fa8ca24e51` | `1bb628299` (+ GUIDANCE.md:8 in the same commit) | none. Same commit: `content/agent-plugin-overlays/software-engineering/GUIDANCE.md:8` now reads "reuse existing content and forms, and reuse widgets for shared pieces (a contact form, a shared call to action), before proposing custom code; a page's own layout lives in its HTML." | how-tovu-works `bundled-package.test.mjs` 3/0; software-engineering package 2/0. (plugin-host.integration 22/3 was also run: identical to combine-9's base record) | **1/1**: delete "A post is a dated article…" from SKILL.md → red | = m8 | DONE |
| 10 | `port/wip-1110` @ `7d70cdf8d7` | `79fa0de32` | **`AgentPluginRow.tsx`** Soon-row switch: integ's object-arg `agentPluginToggleAriaLabel({ plugin, locale })` + wip's `agent-plugin-switch--locked` class. Both kept | locked-css 2/0, row-action-width 1/0, export-action-width 1/0, AgentPluginRow 19/0 | (no sheet) **1/1**: drop `--locked` class → AgentPluginRow 2 red | = m8 | DONE |
| 11 | `origin/main` @ `0df57a3af5` | `e73336f09` + fix `623bbbab7` | **5 manifests**: every conflicted hunk takes integ's `@jini-ai` side, and main's other edits stay (desktop `0.1.32`). Then `0.7.3-next.1 → 0.7.3-next.2` everywhere. **4 lockfiles**: integ's side, then only `@jini-ai/*` entries (and their nested children) deleted and `npm install --package-lock-only --prefer-online --ignore-scripts`. **`charts-recharts-source.ts`**: integ's 0.7.1 approval kept, then settled by B2. **`plugin-activation-polling.ts`**: main's attach-failure backoff kept, inside integ's signature `reconcilePluginActivationsOnce({ deps, attachedIds, failures = new Map() }, _optional = {})`; main's 4 test calls adapted. **Semantic**: main's new `failIfShellIsIncomplete` called `fail(string)`, while integ's `fail` takes `{ message }`. The refusal printed `''` (desktop tsc main TS2345 `stage-payload-run.ts(289,8)`). One-line fix `623bbbab7` | chat-jump css 4/0, visitor slug 2/0, gemini schemas 2/0, poll backoff 7/0, l245 5/0, source-runtime 13/0, release-gate 5/0, sdk-public-api 13/0, product-telemetry 19/0; stage-payload-run 18/1 → **19/0** after the fix; recharts-package-pin 4/4 (B2) | (no sheet; trial worktree) **2/2**: poll ignores backoff → poll test red; navigate schema without the visitor slug override → slug test red | + complexity `plugin-activation-polling.ts:46 reconcilePluginActivationsOnce` 13; desktop-tsc-main red → 0 after fix | DONE |

**Lockfile re-resolve (after merge 11):**
- `@jini-ai` entries per lock: root 37 → 35, admin 20, desktop 22 → 20, site-chat 9. All are now `0.7.3-next.2`.
- Non-Jini version diff by package path: **root 0, desktop 0**.
- admin and site-chat: hoisted `zod 3.25.76 → 4.6.7`. The next.2 packages declare zod ^4; deps-1121 noted this as pending "until 0.7.3-next.2 is published". `@ag-ui/*` and `@mcp-ui/client` keep a nested `zod 3.25.76`.
- `npm ci --ignore-scripts` 0/0/0/0.
- Pins: `sdk-public-api` `@jini-ai/core` `^0.7.3-next.2`; `product-telemetry` `@jini-ai/plugin-catalog` manifest `^0.7.3-next.2` and lock `0.7.3-next.2`. The provenance comment was extended. Both green.

## Part B

### B1 · O3 / C10-A7 — real-Postgres dialect isolation — DONE (`1baf41c6f`), raw `combine-11-tovu-b1-*.txt`
- **Reproduction:**
  - Setup: the 6 files from combine-10 A7, each as its own `node --test` process, all started at once, against one `TOVU_CHAT_TEST_POSTGRES_URL`.
  - Results: agent-session-store 18/0, chat-expiry-sweep 18/3, chat-history-store 42/6, conversation-tool-approval-store 19/5, **durable-run-store 54/12**, package-adapters 9/4. **30 failures.**
  - Evidence of truncation: the failures are row-loss and rollback assertions in tests that pass alone ("a chat expiring exactly now is swept…", "a regrant replaces the fingerprint…", "a throwing ledger write rolls back package history AND session writes", …). `chat-dialect-matrix.ts` `emptiedPostgresChatKernel()` runs `TRUNCATE ai_chat.*` on the shared DB for every make.
- **Controls alone:** durable-run-store **66/66**, package-adapters **13/13**. Both equal merge-10.
- **Selection mechanism:**
  - Constraint: the runner (`npm test`, one `node --test` with parallel file processes) has no per-process database URL, and no CI job sets the URL.
  - Fix: smallest correction in the configured real-Postgres path. `describeEachChatDialect`'s `[real postgres]` section takes a session-level `pg_advisory_lock(7402311)` on its own `pg.Client` in `before()`, and releases it first thing in `after()`.
  - Effect: sections from concurrent files run one at a time. PGlite and SQLite paths are unchanged.
- **Witness first:**
  - `chat-dialect-matrix.real-postgres-lock.test.ts` (skips without the env var): a second holder must wait while the first holds the lock.
  - Red before (`holdRealPostgresChatDatabase` export missing), green after.
- **After:** the same 6-at-once launch gives **18/0, 21/0, 48/0, 24/0, 66/0, 13/0 (190/190)**, all rc 0.
- **Mutations:**
  - No lock acquisition (shared concurrent launch restored): **39 red across all 6 files**, the original contention.
  - Lock query neutered (`SELECT 1`): witness red. The first try stranded the second client because the test did not release it on failure. The witness now releases in `finally`.
- **Teardown:** no `agent-session-store` or run-ledger pool-close timeout occurred in any run here (every process exited rc 0/1 well under the watchdog). Combine-10's 600 s hang did not reproduce.

### B2 · O1 / 1319 — Recharts published artifact — DONE (`a9bcf2a9f`), raw `combine-11-tovu-b2-recharts.txt`
- **Artifact:** `npm pack @jini-ai/provider-plugins@0.7.3-next.2` → registry `dist.integrity` `sha512-E9MHldNudsMI6Qs1Gsrbtcju5WHjX9Al+OCHvbOkkxBZSB0TptsjU90cSBTTGaZtLHlhScpiw+J/ANtqykNAew==` (matches `npm view`), shasum `6d9e5cfef5556b02cdf7f3f533daec0ddda1ea9c`, 209 entries. Resolved plugin dir `plugins/charts-recharts/0.7.3-next.2`.
- **Review:**
  - `jini.plugin.json`: id `charts-recharts`, version `0.7.3-next.2`, browserProviders unchanged (`plugin.recharts`, chart, contract 1, bar/line/pie, `client/provider.js` + `client/styles.css`).
  - Integrity map: **62 entries, every file re-hashed independently: 0 mismatches, 0 unmapped files** (63 on disk = 62 + the manifest), licenses and notices included.
  - The tarball is internally consistent, so the Tovu pin changed.
  - Diff vs the reviewed 0.7.1 approval: `client/provider.js` changed; `_jini-ai_provider-plugins/package-license.json` changed (version); `licenses/_jini-ai_ui/*` ×4 and `licenses/zod/*` ×2 are gone (the bundle no longer carries them).
  - `mount` now requires the host's `applyTheme`. Jini `packages/ui/src/features/charts/browser.ts:148` passes `applyChartTheme`.
  - The local Jini `1ac1cbbd1` build of that folder is byte-identical to the registry files (0 diff lines), so the linked tree is the same payload.
- **Changed pins:**
  - `RECHARTS_BROWSER_APPROVAL` 0.7.1 → 0.7.3-next.2 with the 62-entry map. Admission rules untouched.
  - The exact root dependency `@jini-ai/provider-plugins: "0.7.3-next.2"` and its lock entry come from the merge-11 re-resolve.
- **Tests against the installed registry artifact:** for this, root `node_modules/@jini-ai/provider-plugins` was replaced by the extracted tarball, then relinked.

  | test | before the pin | after the pin |
  |---|---|---|
  | `recharts-package-pin` | 4/4 | **8/0** |
  | `browser-provider.integration` | 3/2 | **5/0** |
  | admin `recharts-bundle-integer-ticks` | 0/13 (`t is not a function`: the test's `mount` lacked `applyTheme`) | **13/0** |

  The integer-ticks fix is test-only: both mounts pass the real `applyChartTheme`. **This clears the owner's long-standing 13 admin base-reds.**
- **Mutation:** the `client/styles.css` digest was altered → pin 6/2 ("approval equals the packaged manifest…", "every pinned file is on disk…") and admission 3/2 ("N-1 … admits the packaged provider…", "step 5: boot enables and admits…"). Restored.
- **OWED-LOCAL:** the Chrome and packaged-Electron chart looks (below).

### B3 · Q4 import history — PARTIAL (`c8686e0cb`), raw `combine-11-tovu-b3-q4-acceptance.txt`
- **Binding and consumers pinned (no STOP):** `SiteImportRegistry` (`features/site-backup/import-registry.ts`) is **not SQLite today**. It keeps one `createDurableJsonFile` per record/upload under `appData/site-imports`, and `withFileLock(.import.lock)` is the import lock. Its callers:
  - `import-backend.ts` (put/get/list/expire/exclusive/stagePath/uploadPath/saveUpload)
  - `import-backend-steps.ts`: `requireStagingBudget` `readdirSync(registry.directory)` at `:78`, `:80`; getUpload/saveUpload; `reconcileInterruptedImports` list + stagePath
  - composition `site-import-backend.ts:39` (construction)
  - 6 test files

  No unaccounted caller. The route and the list tool reach the registry only through `backend.list`.
- **Pins for the indexed store:**
  - The sheet's "existing SQLite infrastructure" does not exist for this registry. The indexed store is a **new** private SQLite file beside the JSON records, behind `SiteImportRegistry`, with the import lock unchanged.
  - The staging-budget check and the orphan sweep enumerate the same directory as history. "No history scan" therefore needs payloads moved into their own namespace first.
- **Acceptance tests written** (`import-history-retention.unit.test.ts`, mocked `Date`, real fixture):
  - **Case 1, durable replay:**
    - Setup: restart at day 31 with a new backend over the same dir.
    - Checks: same request → same importId and `ready`, no second site started; changed source → `REQUEST_CONFLICT`; another principal does not see it.
    - Result: **green** on current code, because history is never deleted today.
    - Mutation (bypass replay lookup): **red**.
  - **Case 2, expiry:**
    - Checks: replay at day 29, then at day 30 + 1 ms the terminal row is gone from the list, replay still returns it, and after day 365 the key no longer fences a different source.
    - Result: **RED as intended** ("terminal detail is gone from history after 30 days…").
- **Not done (owed):**
  - Cases 3 (backfill + interruption: origin-only key, unreadable row, active `verifying`/`creating`), 4 (no history scan), 5 (rollback/freeze) and their mutations.
  - The indexed store, backfill marker and rollback build.

  These need the design pins above, and the atomic-migration proof is a STOP item. Chrome/Electron look → OWED-LOCAL.

### B4 · PLUGIN-ID-UPGRADE — PARTIAL (`67d2846cd`), raw `combine-11-tovu-b4-plugin-id-upgrade.txt`
- **Trusted pre-rename bundle:** `@jini-ai/agent-plugins@0.7.2` (`latest`), registry `sha512-3awhB0LhIfm2YZrfjX1AIl9XLhisW1MvgiOerWHkFXuC2ybDMiTs0VVzpV6wXSWi9zI0P8BWTEdJcryYIu+t2g==`.
- **25 bundled IDs renamed `tovu/<x>` → `jini/<x>`** vs next.2: calendly, cloudflare, composio, fly, github-pages, github, google-login, google-workspace, higgsfield-media, jev, meilisearch, netlify, opentelemetry, posthog, railway, render, resend, s3-compatible, sentry, shopify, site-compliance, site-import, supabase, vercel, wordpress.
- **Failing upgrade proof** (`installed-plugin-id-upgrade.unit.test.ts`):
  - Fixture: `fixtures/pre-rename-0.7.2/cloudflare`, the tarball's folder byte for byte (`tovu/cloudflare` 0.3.3).
  - Steps: seed it → owner enables it → seed the canonical bundle (`jini/cloudflare` 0.3.4) twice.
  - **RED: canonical seeding raises no conflict and silently keeps `tovu/cloudflare`.** The upgrade never happens, which is what the maintenance step must fix.
- **Not done:**
  - The maintenance step itself: journal entry, ordered step ID, backup location.
  - Interruption rehearsal (between backup and reseed).
  - The unrelated same-slot revision case and publisher list.
  - The two mutations (skip the verified predecessor move; admit an unrelated predecessor).

  The journal/recovery pins are not settled, so this is **PARTIAL** per the dispatch.

## OWED-LOCAL checks (cannot run in the cloud)
1. **Recharts in Chrome (O1).**
   1. `npm run dev` on this branch with linked Jini `1ac1cbbd1`.
   2. Open a saved chart in admin (bar, line, pie).
   3. Confirm it renders through `plugin.recharts`: no table fallback, no `INTEGRITY_FAILED` in the server log, whole-number y ticks, and middle-dot labels that wrap at a word.
2. **Recharts in packaged Electron (O1).**
   1. `cd apps/desktop && npm run package` (unsigned).
   2. Launch the packaged app and open the same chart.
   3. Confirm the staged payload holds `node_modules/@jini-ai/provider-plugins/plugins/charts-recharts/0.7.3-next.2` and that the chart renders.
3. **Q4 import history (Chrome/Electron).** Once Q4 code exists: page the history, finish owner setup, restart, and retry the same request.
4. **Carried from the sheets:**
   - tv-abort: assistant "Save draft" and "Publish policy".
   - tv-ag1: admin canary, disconnect, Stop.
   - tv-gate: Update database / Apply pull / Restore, with Stop during approval; Use a saved key with two overflowing sources.
   - bugs1 SHARE-ZIP: warned owner GET → acknowledge → download (now 403-driven); warned provider refusal; clean public download.
   - tv-own WORKER: rendered page with SEO head and widget, static form.

## Production bugs found (also appended to `development/open-bugs.md` → "combine-11")
1. **`C11-agui-run-error-raw-message` — OPEN.**
   - Cause: bugs1 T4 replaced the raw transport text in Tovu's own `drainAgUiStream` catch with the approved interruption sentence. tv-ag1 deleted that function. Tovu now calls Jini `drainRunFramesToAgUi`, whose catch (`chat/src/core/ag-ui/event-projection.ts:280` @ `1ac1cbbd1`) writes `error.message`.
   - Witness: `assistant-ag-ui-wire.golden.test.ts` "a dropped daemon stream … private interruption message" fails with actual `'aborted'`.
   - merge-10 also sent the raw text, because T4 had not landed there. So this is the T4 fix not taking effect, not a regression vs merge-10. It is not one line: it needs a Jini change or a Tovu `write` wrapper.
2. **`C11-share-ack-403-admin` — FIXED `c3ac7bd03`** (one line): the admin opened the acknowledgement checkbox only on 409 after the server moved to 403.
3. **`C11-stage-payload-empty-refusal` — FIXED `623bbbab7`** (one line). It existed only on the merge: main's `fail(string)` against integ's `fail({ message })`.
4. **`C11-installed-plugin-id-upgrade` — OPEN** (the known PARTIAL, now with a red witness). See B4.

## Gates — base (`0973a5fdc8`) vs final
- Final gate set ran at `a9bcf2a9f`, the code tip before the B3/B4 tests and the incident-ID test repoints.
- After those test-only commits, `npm run typecheck` and `typecheck:tests` were re-run at `bb684173d`: 0 / 0 (`…-post-fix-typecheck*.txt`).
- Raw: `combine-11-tovu-base-<gate>.txt`, `combine-11-tovu-<gate>.txt`, and per merge `…-m<N>-gates-vs-base.txt`.

| gate | base | final | note |
|---|---|---|---|
| `npm run typecheck` (+e2e) | 0 | 0 | |
| `typecheck:tests` | 0 | 0 | |
| `typecheck:scripts` | exit 2, 3 errors | exit 2, same 3 | `agent-plugin-activation.ts(100,23)` TS2554, `check-size-drift.ts(9,8)` TS5097, `dev-admin-build.ts(6,12)` TS2339 (long-standing) |
| admin tsc | 0 | 0 | |
| desktop tsc preload/renderer/main/live-verify | 0/0/0/0 | 0/0/0/0 | main went to exit 2 at merge 11 (TS2345 `stage-payload-run.ts(289,8)`) and back to 0 after `623bbbab7` |
| `check:size` | exit 1 (the 4 owner-accepted lines) | exit 1, the same 4 **+ Worsened `backup-service.ts` 547 (baseline 535)** | tv-own Q3+T7; LISTED |
| `check:complexity` | **0** | **exit 1, 3 New** | `backup-service.ts:681 pushPlannedBackup` 11 (tv-own Q3), `use-copy-keys.hooks.ts:24 useCopyKeys` 11 (tv-gate T46), `plugin-activation-polling.ts:46 reconcilePluginActivationsOnce` 13 (main's backoff in integ's signature). The CI step is `continue-on-error`. LISTED, not fixed |
| `check:architecture` | exit 1 | exit 1 | Baseline line "1 pair(s) removed since baseline" is gone (tv-own pruned it). `widgets/deps.ts → post/index.ts` NEW edge replaced by 5 leaf edges (`post/contracts`, `post-read`, `post-trash`, `post-update`, `post`). Propagation 3.06 → 3.26 (base 3.33). "FAILED: 1 metric(s) regressed against a hard constraint" in both |
| `check:boundaries` | 0 errors / 111 warnings | 0 errors / 111 warnings | |
| `check:hooks` | ok | ok | |
| `check:why-comments` | 77 open | **79 open** | + `share-service.ts:126-131 [b3ec582b7325]` (bugs1), + `site-search.ts:64-67 [096121b6167d]` (upg2). LISTED |
| `worker-import-graph.test.ts` | **7/26 fail** | **0/26 (26/26 pass)** | tv-own WORKER-TOVU + Jini next.2 narrow cms exports |
| `check:errors` | passed 590 / 326 | passed 590 / 326 | |

## Tests
- **Changed files + importers** (`…-changed-tests-list.txt`, 337 node files):
  - Scope: every changed test file; tests importing a changed production module by path (stems with ≤ 30 importers); all 193 importers of the shared `assert-admin-response.ts` helper.
  - Method: each file alone, 15-min watchdog, 3 in parallel, Postgres up, browser path set.
  - Result at `a9bcf2a9f`: **4,245 pass / 32 fail in 15 files** (`…-changed-tests-per-file.txt`, `…-failing-reasons.txt`).
  - Base-diff vs the last full records (combine-9 per-file on the same tests, deps-1121):
  - **9 files identical to their base record (13 fails):** pages-update-html-auth 12/1, l244-characterization 17/4, site-backups.integration 0/1, tool-restriction-wiring 11/1, byok-message-attachments 3/2, mail-send.golden 0/1, resolve-mailer 32/1, bundled-inactive-gating 7/1, assistant-agent-plugin-preflight 3/1.
  - **4 files, the bugs1-T3 incident-ID cascade (16 fails), fixed test-only:** assert-admin-response.test (fixture IDs; exposed by my helper repoint), unexpected-route-errors, pull-submissions, pull-submissions-tw4. A wider scan of every test that pins a UUID-shaped ID (`…-incident-id-repoint.txt`) found **19 more files red for the same reason (31 fails)**, all green in combine-9. All repointed to the ERR regex and **all 23 files green** (`7267d7d4b`, `bb684173d`).
  - **NEW-RED, not fixed (3 fails, 2 files):**
    - `assistant-ag-ui-wire.golden.test.ts`, case 1: "a dropped daemon stream …" (open bug 1).
    - `assistant-ag-ui-wire.golden.test.ts`, case 2: "every payload, then end with max_tool_turns". bugs1 AG-T0 pins the old drain's `CUSTOM tovu.ext.mcp-ui` card. tv-ag1's sheet ("BREAKS") deliberately turns a valid `pendingApproval` frame into an interrupt `RUN_FINISHED`. The two merged intents contradict each other; this is owner decision 2.
    - `features/site-backup/__tests__/tool-registrations.unit.test.ts` "backup plan and push return credential warnings for the chat to show" (83/1). tv-own Q3 now refuses a push whose plan has credential warnings (`UNSAFE_FILE`). This case still expects a successful push carrying the warnings. Q3's sheet removed three such assertions and missed this one. Changing what it asserts is not a one-liner, so it is LISTED.
  - Intended reds (new acceptance and witness tests): `import-history-retention.unit.test.ts` case 2 (B3), `installed-plugin-id-upgrade.unit.test.ts` (B4).
- **Admin vitest full** (`…-admin-full.txt`): 908 files, **14,884 pass / 6 fail / 2 skipped**. The 6 are the owner's base-red set minus the 13 `recharts-bundle-integer-ticks` cases that B2 fixed: `admin-literal-copy` ×1, `credential-input-autocomplete` ×1, `dictionary-lookup-sinks` ×1, `JiniMediaPicker.hooks` ×3. Combine-10 was 19 fail / 14,865 pass.
- **Desktop `npm test`** (`…-desktop-test.txt`): main **2,218 / 2,205 pass / 3 fail / 10 skipped**. The 3 are the known root-chmod cases (site-child-registry, site-dir-store, tracked-sites). The +1 test is main's stage-payload case. Renderer + contracts (`…-desktop-renderer.txt`): **916 / 914 / 2**, the known 2 (`WorkspaceChatPane uses no raw React primitives…`, `closing the settings dropdown…`). Both halves equal combine-10.
- **Hygiene:** `git status` clean on the main tree after the suites. Scratch worktree `/home/user/trial` (detached, never pushed) was used for the extra mutations.

## Decisions needed
1. **AG-UI interruption text** (`C11-agui-run-error-raw-message`): fix it in Jini `drainRunFramesToAgUi` (fixed sentence or a host option), or with a Tovu `write` wrapper.
2. **bugs1 AG-T0 vs tv-ag1:** the "every payload" golden pins the CUSTOM mcp-ui card, while tv-ag1 deliberately interrupts on `pendingApproval`. Either repoint the golden to the interrupt, or keep the card until AG3-T's resume path lands (tv-ag1's own note).
3. **Q3 stale case** `site-backup tool-registrations` "plan and push return credential warnings": repoint to the `UNSAFE_FILE` refusal (plan keeps its warnings), or narrow Q3.
4. **T-VENDOR STOP:** 4 vendor hits in `bundled-catalog.ts:47,48,57` and `shared-owner.ts:81`. Allow-list them or scrub them.
5. **New complexity, size and why-comments debt** (listed above): accept into the baselines, or refactor.
6. **Q4 design pins** before cases 3–5: a new private SQLite file beside the JSON records; payloads moved to their own namespace; the cutover marker and rollback build.
7. **PLUGIN-ID-UPGRADE journal:** entry, ordered step ID, backup location, interruption recovery.
8. Carried from combine-10: `C9-share-zip-refusal-vs-acknowledgement`. bugs1 SHARE-ZIP has now landed with the coordinator ruling (owner download keeps acknowledgement; public and provider deliveries refuse), so this may now be closed.

## Next step
Owner decisions 1–3, then one small Tovu/Jini job for the AG-UI interruption text plus the two golden/Q3 test repoints. After that: the OWED-LOCAL Chrome/Electron chart checks, then Q4 (design pins → cases 3–5 → indexed store) and PLUGIN-ID-UPGRADE (journal pins → maintenance step → interruption rehearsal), each against its red witness committed here.

## Commits on `integ/merge-11-2026-11-21`
`69c007249` m1 · `ccebfe8a0` m2 · `717ee6d42` m3 · `75968833d` m4 · `b4da1d7a6` golden key order · `8162b422e` m5 · `743644fb5` m6 · `68f39046d` helper ERR ids · `c3ac7bd03` admin 403 · `2125e4295` m7 · `a6726bd04` m8 · `1bb628299` m9 (+GUIDANCE.md:8) · `79fa0de32` m10 · `e73336f09` m11 · `623bbbab7` stage-payload fail() · `1baf41c6f` B1 · `a9bcf2a9f` B2 · `c8686e0cb` B3 · `67d2846cd` B4 · `7267d7d4b`, `bb684173d` incident-ID repoints · report + raw outputs + open-bugs (this commit).
