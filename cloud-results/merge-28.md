PARTIAL T 52bfc43c J d1ced6c5b | tsc 0/0/0/0 | guard 0 | suites J 72777/80 (1 new, fixed; 6 more pass alone = coverage-load flakes) T-web 21783/335 (0 new; shards 0-4 of 8) T-admin 12545/360 (1 new, fixed) desktop 2916/0 | coverage J 89.68/95.36/91.54% T-web 93.25/89.71/79.44% (5/8 shards, lower bound) T-admin 97.72/96.01/95.05% desktop 95.88/96.58/91.02% | left: website coverage shards 5,6,7 (lists below), then re-merge

# MERGE-28: verify + full coverage after the Codex 6.2 test-quality round (2026-11-27)

Unattended cloud run on Opus (high). Read `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5) first. 2 subagents used (Opus high): typecheck:tests fixes; merge-27 baseline + new-red classification for website shard 0. No codebase-memory tools, no RemoteTrigger, no `--no-verify`, no force-push, no tag/publish; `main`, `release/*`, merge-24..27 untouched. No ts-ignore/expect-error, no `as any`, no skips, no guard/baseline/ratchet/threshold/coverage-config edits, `.gitleaks.toml` and themes untouched.

## Setup (what worked)
- Node 24 (`/opt/node24/bin`), Jini `pnpm install --frozen-lockfile` + `pnpm -r build` (green, 2m48s).
- Tovu `npm ci --ignore-scripts` at root, admin, site-chat, desktop; `node node_modules/electron/install.js` (desktop); `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`; then `tsc -p` contracts and sdk (**after** link — before link, contracts fails on `extraPatterns` / `media-upload-limits` against the installed Jini copies).
- **Trap (new):** `npm ci --legacy-peer-deps` in `apps/admin` does NOT install the peer `@testing-library/dom`, so admin tsc reported 974 errors (TS2305 `screen`/`waitFor`/`fireEvent` not exported). Plain `npm ci --ignore-scripts` in admin installs it and admin tsc is 0. Drop `--legacy-peer-deps` for admin.
- hooksPath unset in this container: `npm run gates` (apps/desktop) run by hand before every Tovu push.
- Baselines for NEW-vs-merge-27: worktrees `/home/user/jini-m27` (built) and `/home/user/tovu-m27` (root/site-chat/admin installed, linked to jini-m27). Every red on this tree that is not in merge-27's red lists was rerun on the baseline, per test.

## Coverage method (and traps hit)
- Jini: per package `vitest run --coverage.enabled --coverage.all=true --coverage.reportOnFailure=true` (lcov + json-summary + json). 8 packages narrow their own coverage `include`/`exclude` (chat = `src/core/**` only, devops = `src/deploy/**` only, agent-runtime drops `src/skills`/`src/craft`, ui/db/sandbox/integrations/cookie-consent drop type-only files) — re-measured with a temporary (uncommitted, deleted) config wrapper forcing `include: src/**`, so every src file is in the denominator. commerce's node:test catalog suite (63 tests) and the agent-plugins content suite (1408 tests, `packages/agent-plugins/**/*.mjs`) measured with node coverage and merged.
- Tovu website: node:test `--experimental-test-coverage`, 8 round-robin shards of the 3392 test files in `npm test`'s globs (lists in the run, ~16 min/shard).
  - **Trap (new): without `--test-coverage-include`, every linked `../Jini/packages/*` dist (source-mapped to src) enters the coverage merge — ~4000 extra files per shard — and the shard's lcov came out EMPTY (0 bytes) after a 16-min run.** Fix: `--test-coverage-include='apps/**' 'packages/**' 'content/**' 'development/**'` plus `--test-coverage-exclude='**/node_modules/**' '**/dist/**'` (an explicit include drops node's implicit node_modules exclusion, and an explicit exclude drops the default test-file exclusion, which also fixes the `test-connection.ts` trap; test files are filtered afterwards against the source list).
  - `--test-reporter-destination=/dev/null` crashes node 24 at exit (`EINVAL fsync`) — use files.
  - node lcov emits `BRDA:undefined` / `FN:undefined` rows for some V8 blocks; kept and counted.
  - Line numbers: `--enable-source-maps`; checked every lcov (website shard 0, desktop) — no `DA` line beyond the source file's length in 2500 files. Node has no statements column (= lines).
- Tovu admin: `vitest run --coverage` (config include `src/**/*.{ts,tsx}`, all files). Desktop: `npm run build:preload`, then both `npm test` invocations with node coverage (`--test-coverage-include=src/**`).
- Child-process tests already redirect `NODE_V8_COVERAGE` (`contracts/core/__tests__/helpers/child-process-coverage-env.ts`); untouched.
- Denominator = every git-tracked source file (`.ts/.tsx/.mjs/.js/.cts/.mts`) minus tests (`__tests__`, `__mocks__`, `__measurements__`, `__fixtures__`, `*.test.*`, `*.spec.*`, `*.test-helper*`, `*.typecheck.*`, `.d.ts`): Jini `packages/*/src/**` + agent-plugins content `.mjs` (7162 files); website = `apps/website/src`, `apps/site-chat/src`, `packages/*/src` (1519); admin `apps/admin/src` (504); desktop `apps/desktop/src` (226). A file never executed is 0% on all three axes (V8 reports 0/0 blocks for it; counted as 0, not 100).
- Per-file tables: `cloud-results/coverage-28/{jini,tovu-website,tovu-admin,tovu-desktop}.tsv` (file, lines%, branches%, functions%, uncovered source line ranges, counts). Raw lcov (paths rewritten to `Jini/…`/`Tovu/…`) + json-summary under `coverage-28/raw/`. Mock-illusion lists: `coverage-28/*.mock-illusion.tsv`.

## Gates: merge-28 compared with merge-27

| gate | merge-27 | merge-28 | note / saved output |
|---|---|---|---|
| Jini `pnpm -r build` | green | **green** | Codex base built clean. |
| Jini strict typecheck (`pnpm typecheck`) | green | **green (0)** | `merge-28-jini-typecheck.txt` |
| Jini guard | 0 | **0** | `merge-28-jini-guard.txt` (only the 6 R13 SKIPPED notes) |
| Tovu root `tsc` (website) | 0 | **0** | `merge-28-tsc-website.txt` |
| Tovu admin `tsc` | 0 | **0** | `merge-28-tsc-admin.txt` (974 before the admin reinstall without `--legacy-peer-deps`; environment, not code) |
| Tovu `typecheck:tests` | 1089 | **0** | Codex left 26 (8 files); all fixed (below). `merge-28-typecheck-tests.txt` |
| Tovu `typecheck:e2e` | 0 | **0** | `merge-28-typecheck-e2e.txt` |
| desktop `npm run gates` | 6/6 | **6/6 PASS** | before the checkpoint push and before the final push. One run in between failed only its `coverage` gate ("node=1", the suite under coverage) while my red classifier ran node tests concurrently; rerun on an idle machine = 6/6 (`tests` gate passed in both). `merge-28-desktop-gates.txt` |
| Jini full suites | 72671 / 95, 0 new | **72777 / 80** | vitest 71306/80 + node:test 1471/0 (commerce catalog 63, agent-plugins content 1408). Every red rerun on the merge-27 baseline: 73 red identically there (OLD), 6 pass when rerun alone (cms pglite ×5, devops `hardwiring-node.pins` ×1 — flaky only under coverage load), **1 NEW → fixed** (admin `y5-page-editor`). merge-27's admin/cms/core/user-management "not re-tested after m26si" gap is closed. List: `merge-28-jini-reds.txt` (79 after the fix). |
| Tovu website suite | 13838 / 894 (capped at 40 min, partial) | **21783 / 335 in shards 0–4 (2120 of 3392 files)** | Each shard ≤ 18.5 min. All 335 reds checked: in merge-27's red list, or rerun per file on the merge-27 baseline → **0 NEW** (24+ only looked new because merge-27's capped run never reached those files; Postgres/Playwright files fail on both trees = ENV). Codex fixed merge-27's 415 new reds (createHash bags, publish-content bags, mutation actors): none of them is red in shards 0–4. List: `merge-28-website-reds.txt`. |
| Tovu admin suite | 12543 / 361, 2 new | **12545 / 360** | merge-27's 2 new reds fixed by Codex (api-request-shapes row, use-trash wait-for-rows). 108 failing files = merge-27's 108. 1 NEW (Codex-added assertion) → fixed. List: `merge-28-admin-reds.txt` (359 after the fix). |
| Tovu desktop suite | in gates | **2916 / 0** | both `npm test` invocations, with coverage. |

## Fixes (file: why)
### Tovu — typecheck:tests 26 → 0 (subagent, Codex-stale fixtures; no production bugs)
- `features/identity/__tests__/delete-user-service.test.ts`: used `contentKernel` without importing it (also a runtime ReferenceError).
- `features/mail/__tests__/capture-fixtures.ts`: `Db = ContentKernel` (the dialect matrix hands out a ContentKernel; sibling retention test already does) — cleared 18 errors in `clear-captured-tool.dialects.test.ts`.
- `features/media/__tests__/agent-upload-sniff.test.ts`: `InMemoryVersionedMediaRepo` (registry deps now require the versioned media repo port).
- `features/source-control/__tests__/commit-site.unit.test.ts`: captured original typed as `ExportSiteBoundFn` (full `ExportReport`), the port the commit path uses.
- `server/__tests__/assistant-ag-ui-resume.integration.test.ts`: `trashSweeper.stop({})` (required arg), as index.ts/serve-listen.ts call it.
- `server/__tests__/integration/serving-app-outbox-drain.integration.test.ts`: `assert.ok(command.run)` before calling the optional member.
- `server/inbound/admin-http/routes/system/site-shares.integration.test.ts`: backend fake gains `expiryChoices` (the list route calls it).
- `server/runtime/lifecycle/__tests__/assistant-daemon-connection.test.ts`: shared `createCapturingResponse()` instead of a two-method Response fake; body shape asserted.
### Codex test fixes found wrong (both NEW reds vs merge-27; fixed without weakening)
- Jini `packages/admin/src/pages/__tests__/y5-page-editor.test.tsx`: the added step picked the "Theme default" sentinel after a real template was chosen, but `PageEditorTemplateOptions` renders that option only while it is the current choice — jsdom fired `""` and the spy never saw the sentinel. Now asserts the real contract (sentinel option absent; "No template" → `pickerValueToChoice({value:""})` → `templateChoice ""`).
- Tovu `apps/admin/src/features/plugins/__tests__/folder-zip-port.unit.test.ts`: the added wiring check rendered `useWiredPlugins` with only `FetchQueryProvider`; `usePlugins` reads the AdminKit and threw before the assertion. Now uses the shared `render-with-jini-kits` `renderHook` (main.tsx's provider tree); the assertion (`folderZip === folderZipPort`) is unchanged and passes.
### Codex Jini production changes verified
- chat P26: empty AG-UI stream now rejects with "The assistant stopped before replying. Send your message again." (the Codex transport test passes). The **old** P26 test (`durable-run-subscription.paths.unit.test.ts`) still expects `{ runId: "ag:empty" }` and `ag-ui/interrupts.test.ts` hits the error — both red on merge-27 too; listed, not changed (owner decision 1).
- devops `SiteShareRegistryLike.get` → `null`; widget `registerCoreResolver` returns an unregister; peer destination kinds disjoint: no red in devops/cms suites attributable to them.
- cms/core `package.json`: Codex removed 5 `jini.entries` rows — they were duplicates (the same keys exist later in the same map); no behaviour change.

## Bugs found
No new production bug. Pre-existing production-pointing reds (red on merge-27 too) recorded in `development/open-bugs.md` (merge-28 section): github overlay imports a non-exported `resolveDefaultForSourceControl`; form-file-cleanup `paths[0] undefined`; `InMemorySettingsRepo.transaction` not reentrant (site-chat-selection); railway deploy-config `line.includes is not a function`; no-raw-sqlite ratchet red.

## Owner decisions needed
1. **chat P26:** production now rejects an empty AG-UI stream with the "assistant stopped" error; the P26 and interrupts tests still encode the old outcome. Confirm the error is the decided behaviour so those two tests can be updated (they are OLD reds, not touched here).
2. **Page template picker:** after choosing a real template there is no "Theme default" option to go back (only the shell filename, or "No template"). Intended?
3. **Jini package coverage configs measure a subset:** chat `src/core/**` only, devops `src/deploy/**` only, agent-runtime excludes `src/skills`/`src/craft`, several exclude type-only files. Their own reported % overstate: with every src file in the denominator chat is 99.47/98.24/98.78, agent-runtime 98.20/99.25/97.13, but devops is 75.53/87.13/80.77 (its config measures only `src/deploy/**`). Widening the configs would break their thresholds — decide.
4. **Setup docs:** drop `--legacy-peer-deps` for `apps/admin` (it skips `@testing-library/dom`).
5. Carried from merge-27, still open: `@types/react` duplication / admin tsconfig `paths` dedupe; `"tovu-peer"` constant; devops `approvalToolHandler.describe` arity; `describeApiError` raw-text tests; `createHash` placement.

## Continuation (exact)
1. Website coverage shards 5, 6, 7 (round-robin eighths of `npm test`'s 3392 files; lists saved in `coverage-28/website-shards/shard-{5,6,7}.list`). Command per shard (≤ 20 min each):
   `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --enable-source-maps --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --experimental-test-coverage --test-coverage-include='apps/**' --test-coverage-include='packages/**' --test-coverage-include='content/**' --test-coverage-include='development/**' --test-coverage-exclude='**/node_modules/**' --test-coverage-exclude='**/dist/**' --test-reporter=lcov --test-reporter-destination=shard-i.lcov --test-reporter=tap --test-reporter-destination=shard-i.tap $(cat shard-i.list)`
   then merge with `coverage-28/raw/tovu-website.lcov` (lines/functions exact; key anonymous functions by line and pair FNDA positionally — node names them `anonymous_<run index>`) and classify reds against `merge-27-website-all-reds.txt` + a merge-27 baseline rerun.
2. Owner decisions 1–3, then the OLD reds (lists in `merge-28-*-reds.txt`).
