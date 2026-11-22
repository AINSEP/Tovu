# combine-5 TOVU (2026-11-19) — `integ/merge-5-2026-11-19`

Unattended run. Node 24.22.3 (`~/.local/node24`), pnpm 10.33.2 (corepack). No subagents, no codebase-memory tools, nothing pushed to Jini, `main` / `refactor/terra` / `plan/*` untouched, no force-push. Tovu: `npm ci --ignore-scripts` (root + `apps/admin`), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs`, `packages/contracts` + `packages/sdk` built. Base = `origin/integ/merge-4-2026-11-18` (`9a59aba89`). Final Tovu HEAD **`5a72fae00`** (pushed).

## Jini built against (LOCAL ONLY, not pushed)

No `origin/integ/merge-5-2026-11-19` in Jini, so local branch `integ/merge-5-local` from `origin/integ/merge-4-2026-11-18`, all 29 listed branches merged in order (`codex/jini-wave-a3` does not exist). **Final local Jini HEAD `074857a89`.** `pnpm install --frozen-lockfile` refused (lockfile `@jini-ai/http-kit` specifier `workspace:^` vs manifests `workspace:*`) → `pnpm install --no-frozen-lockfile`, lock change committed locally (`873821f04`).

| Jini conflict | resolution |
|---|---|
| wc-fix-jini2 `devops/coverage/integrity.ts` | both: restored why-comments + merge-4 args signatures |
| jini-szcx / jini-fsplit2 / fs-j-daemon / dx-events / dx-hstore / ext-j2 / ext-r11b2: `size-/complexity-/injection-/log-safety-debt.json` | 3-way JSON merge (entry removed by either side stays removed; both changed → lower) |
| jini-fsplit2 `daemon/http/attachments.ts` (split) vs szcx (edits) | split taken, szcx hunks re-applied into `disk-attachment-store.ts` |
| **fs-j-daemon split `attachments.ts` a second, different way** (8 other modules) | fsplit2's split kept (already merged + szcx re-applied); fs-j-daemon's **tool-executor** split taken; its 8 `attachment-*` modules dropped |
| dx-events `agent-executor/events.ts` (deleted by split) | split taken; merge-4 args edits re-applied (`createModelReceiptTracker({}, …)`, `errorMessage({ err })`, `writePromptToStdin({…})`, …) |
| dx-hstore `mcp/federation/hosted/store.ts` | split taken; 14/14 merge-4 hunks re-applied into the split files |
| cookie-consent-cloud `client/runtime.ts` | object-args `purge({ doc }, { storage })` + merge-4's `onState({ state, purge })` |
| admin-j4-inject Playground/Security pages | j4's `TabbedPageProps` + merge-4's injected hook (flat prop); dropped the components' `_optional` 2nd param |
| rf2-a13 `useDismissOnOutsideOrEscape` / `dom-subscriptions` | object args + rf2-a13's `escapeCapture` option |
| **ex-log** (65 conflict hunks; 351 files) | merged as its 3 commits: (1) hook-injection commit — 26 files keep merge-4's hooks-a/b injection; (2) hardwiring; (3) log-safety — import/arg combos by hand; `editor-serialization`, `use-settings-slice`, `resolver-service` keep merge-4's split (see Jini fix) |
| ext-j2 `http-kit/settings/stream.ts`, `scripts/lib/self-test.ts` | ext-j2's paths + merge-4 logger; self-test: merge-4's split + ext-j2's flipped R2 fixture (and its expectation, which ext-j2 forgot) |
| ext-r11b2 `mcp/core/config.ts`, `tokens.ts` | ext-r11b2's required `files` port + merge-4's injectable `report` |

Jini fix commits (local): `9516208a4` — ex-log imported `createConsoleLogger`/`Logger` from the `@jini-ai/core` root (not exported there) in 31 files → `@jini-ai/core/primitives`; agentic `log-safety-f.test` sat outside the DOM tsconfig (moved under `core/dom/__tests__`) and `ambiguousHandleError` was lost to one of its two callers; platform `directory-workspace` used `report` out of scope after the split; cms taxonomy imported types from the pre-split `write-service`; ui exactOptional + a duplicated `useAgentHandleHook` prop in `TabStrip`; `editor-serialization` takes ex-log's `report` **but keeps the fallback reason text** (ex-log had made it generic). `074857a89` — **real Jini bug**: ex-log made `createConsoleMailProvider` require a `preview` callback, but `agent-plugins/lifecycle/mail/catalog.ts` still called it `({ clock }, { log })` → TypeError on every mail-catalog load; the catalog now passes a preview built on its `log`.
Jini build: production code compiles; **104 type errors remain in Jini test files** added by the untested branches (mostly ex-log `log-safety-*` tests: `toHaveBeenCalledExactlyOnceWith`, missing `vi`, stale shapes). Because those failed `tsc`, the `&&` post-build steps were skipped; I ran them by hand (`agent-plugins` cloudflare bundle, `ui`/`chat` css, `mcp` chmod, `agentic` dom build) — missing `cloudflare/lib/cms-forms.mjs` had failed 30+ Tovu deployment tests.

## Tovu per branch (all `origin/codex/*` unless named)

| branch | merge | conflicts → resolution | red found | fix | status |
|---|---|---|---|---|---|
| tv-cx | `d6a71a8df` | complexity debt (3-way) | — | — | merged |
| tv-szfn | `5533060c1` | size debt | 4 view hooks called directly (check:hooks); 3 were pure pass-throughs of an already-injected hook | `c66e82613`, `8b1e089ee` (pass-throughs removed; onboarding one injected) | merged+fixed |
| tv-fsplit2 | `4aaeb18b2` | Collections.tsx / Roles.tsx (fsplit2 file split vs szfn function split): split taken, szfn hunks re-applied into the new modules; theme test imports | `renderNewContentTypeFields` left behind in Collections; use-roles/use-site-transfer past max-lines; desktop index.ts +2 lines; clipboard typing; moved error/arch debt | `c66e82613` | merged+fixed |
| tv-wc-debt-jini2 | `a889a98cd` | — | — | — | merged |
| wave4/admin-j4-inject | `a49947c80` | widgets-swap test: `ui:` + object `defaultWidgetConfig` | — (admin tsc 15→0 with it) | — | merged |
| tv-a03f4 | `7a5c9f14a` | — | its new test used old positional `registerMcpUiToolCallsRoute` | `ba9175303` | merged+fixed |
| tv-s7b | `406eb74ef` | — | `expectedVersion` now required: 2 test callers + a stub that dropped it; 8 why-comments it rewrote (design reversal) | `ba9175303` | merged+fixed |
| tv-rf-d03 | `ece05dd89` | — | 3 why-comments (code moved to `@jini-ai/devops`) | `ba9175303` (allow-listed with reasons) | merged |
| tv-ext-u2 | `8dab29a56` | members split was already in merge-4 (refresh-u2, same U2c-1): merge-4's split kept, U2a taken; write-path baseline ours | dangling `ConsoleMailerAdapter` export; #107 preview (below); 5 why-comments of the deleted adapter | `ba9175303`, `d5457b756` | merged+fixed |
| tv-split3 | `c0f4e538e` | use-roles / use-site-transfer: split3's planned split replaced my ad-hoc group-1 split | file-tree-policy split exposed a new publish-content module (+2 cross-feature edges, API surface ↑); catch-reads-error re-key | `f62b1cb9a` (**file-tree-policy split dropped**, file back to pre-split, within budget) | merged, 1 file dropped |
| tv-arch-l09a | `3e529c1cf` | 11 files of import blocks (split files vs arch-120 repoints): splits kept, repoints re-applied (`NO_THEME_ID`/`themeIdCandidates`→contracts, `renderHtmlMenu`→platform/html, cover-image, PostKind, taxonomy ports); webmcp strip moved + tv-cx split re-applied | type-pin test on removed alias; explore.ts +1 line; moved debt | `e539472ae` | merged+fixed; **API-surface regression open** |
| tv-deps-r | `4bb6b15be` | deps.ts: phase split taken, merge-4 edits re-applied | extracted phases referenced `executeCommand`/`createSite` never imported, `selection` typed optional; 4 tests typed paths as `URL` | merge commit, `1f4f2c419` | merged+fixed |
| tv-dx-dock | `94e89e3cf` | AssistantDock.hooks.tsx modify/delete: 14-module split taken, edits re-applied | 1 test on old `subscribeToContentRefresh` shape; `useExecutionConfig` complexity 10 | merge commit, `e571440dd` | merged+fixed |
| tv-dx-post | `6b8f07d45` | 17 files: post.ts split taken, every later edit re-applied hunk-by-hunk; tool-registrations keeps fsplit2's split | imports of moved symbols; widgets/deps would add 4 cross-feature edges into post internals (now via the post barrel) | merge commit, `e571440dd` | merged+fixed |
| tv-dx-scope3 | `0d9d93a0f` | agent-daemon-scope.ts: split kept; fn-web-b's edits had been dropped at merge-4, nothing left to re-apply | **`agent-daemon-scope-http.ts` did not parse** (`resolvePrincipal` lost its `}`); `resolveAttachmentRunFields` complexity 15 (8 per-field port defaults) | merge commit, `e571440dd` (spread defaults) | merged+fixed |
| tv-ex-err | `74675c203` | update-check-now reporter (extracted by tv-cx) now carries `errorDetails`; h4 test object-args | 2 tests on old `register(app, …)`; 2 rewritten why-comments | `acd985b07` | merged+fixed |
| tv-ex-hw | `f1f9a0045` | roles-dependencies (fake store removed) / use-roles (split3 kept, port repoint + `listRoles({})` re-applied) | 1 why-comment | `acd985b07` | merged |
| tv-th-redo | `ec7032ce8` | MediaPickerDialog: HEAD's ErrorNotice kept | — | — | merged; **check:hooks ok, hook debt 198 → 41** |
| tv-d0c-w1 | `1b07a35eb` | — | zod lockfile | `f9772ea7c` (`npm install --package-lock-only`, root + apps/desktop: 3+6 lines, no hand edits) | merged |
| codex/tv-wave-a3 | — | does not exist on origin | — | — | skipped |

Cross-cutting fix `e2e2c83e0` (BASE-red against the merged Jini, which broke **module loading** for every test that imports the assistant/settings graph): daemon auth middlewares moved to `@jini-ai/http-kit/middleware`; settings express split into `@jini-ai/core/settings` + `@jini-ai/http-kit/settings`; ext-j2's required `reportInternalError` on delegated/run route deps; `RunStatus.state`; recovery `{ report }`.

## Real production bugs found
1. **Consent validation refused every enabled policy** (`PRIVACY_LINK_REQUIRED`): Tovu called cookie-consent's `safeHref(url)` positionally after cookie-consent-cloud made it `safeHref({ url })`. Failing tests: the existing consent readiness/publication suite (`not ok 44, 60–68, 94–130, 144` in the group-1 run). Fixed `e2e2c83e0`.
2. **#107 console mail**: ex-log made `createConsoleMailProvider` require a host preview. Tovu's memory composition now wires one (`logConsoleMail`: full body, so sign-in links stay usable); tv-ext-u2's own test (`server-modules.unit.test`, "logs the full sign-in link") is the failing→passing test. Jini's own catalog had the same break (Jini bug above).
3. **Delegated-route error paths crashed** (`deps.reportInternalError is not a function`) in 12 test harnesses hidden behind `as never` — the combine-4 cast trap again; production wiring (`jini-routes.ts`) was correct. Fixed `f561995bd`/`5a72fae00`.
4. dx-scope3 shipped a file that does not parse; deps-r shipped phases referencing out-of-scope names (both compile-time, fixed in the merges).

## Gates — base vs final (Tovu root; admin = `cd apps/admin && npx tsc --noEmit -p .`)

BASE = `origin/integ/merge-4-2026-11-18` linked to the merged Jini, before any merge. FINAL = `5a72fae00`, same commands.

| gate | BASE | FINAL |
|---|---|---|
| `npm run typecheck` | exit 2, 41 errors | **exit 0** |
| `npm run typecheck:tests` | exit 2, 73 | **exit 0** |
| `npm run typecheck:scripts` | exit 2, 42 | exit 2, the 3 base-red only (agent-plugin-activation TS2554, check-size-drift TS5097, dev-admin-build TS2339) |
| `npm run check:size` | ok, 135 debt entries | ok, **83** |
| `npm run check:complexity` | ok, 40 | ok, **16** |
| `npm run check:errors` | passed, 805 findings / 478 entries | passed, 739 / 423 |
| `npm run check:hooks` | ok (198 entries) | ok (**41**) |
| `npm run check:why-comments` | ok | ok (+25 allow-list entries, each with a reason: code deleted or contract reversed by the branch) |
| admin tsc | exit 2, 15 | **exit 0** |
| `npm run check:architecture` | exit 1, base-red (1 hard metric) | exit 1: **+1 hard regression — module API surface 821 → 831** (base 815). One re-keyed base-red line (`widgets/deps -> post/post.ts` now `-> post/index.ts`). Propagation (runtime) 3.24 vs base 3.19, non-blocking. |

## Tests
- Node `--test` (`--test-concurrency=2/3`, deviation from 1 for time) in throw-away worktrees. Group 1 scoped (640 files) and a full since-base scoped run (1994 files; stopped by its 25-min cap after **11,013 results, 10,914 ok**). Every non-Postgres failure re-run; then the 17 still-failing files run against a **true merge-4 base** (merge-4 Tovu + a merge-4 Jini build in `/home/user/Jini-m4`): 9 files / 22 tests already fail there (typed-tools ×13 — its source-reader harness is out of sync with the scope split; batch-tool-inputs; import-local-file-search; vendor/boundary/allowlist pins; publish-run).
- **New failures still open (fail on merge-5, pass on merge-4), 9 tests / 8 files** — log/expectation changes from the untested ex-log/ex-err/dx branches, not triaged for time: `api-connections/surface-connections.unit` (×2, log text now generic), `deploy-ops/deploy.test` + `extract-s9-deploy-ports` (history-port failure now logs `'Error'`), `extract-s9-g-deploy` (golden HTML differs), `assistant/moved-tools.golden` (catalog bytes 755906 → 755641), `assistant/content-target-inputs` ("page writes … version": `written` undefined — check against S7b), `members/write-service` (shard C attempts), `publish-trust/frozen-values.pins`.
- Postgres-backed suites: environment (no server), not counted. Admin vitest for the full range was cut by the 30-min background limit (not reported); admin tsc is green.
- Extras: (1) refresh-bk characterization tests now pin current behaviour — `import-creates-new-site` 5/5, `saved-keys-round-trip` 4/4 (`ef2e79a0b`; the older-Library-shape case is currently *refused*, renamed to say so). (2) Jini still has the positional AdminKit media-providers rules port → `jini-kits.ts` adapter lambdas kept. (3) `batch-tool-inputs` root cause: Jini's `createChainedBatchHandler` reports items as `{ index, ok, result }`; test fixed (`58bd48219`). Its second case expects a batch with a refused item to **reject**, but the chain returns per-item failures — owner call. `import-local-file-search`: still failing at merge-4 and merge-5, not root-caused.

## Skipped / dropped
- `codex/tv-wave-a3`, `codex/jini-wave-a3`: not on origin.
- tv-split3: file-tree-policy split (architecture). tv-szfn: 3 pass-through view hooks removed. Jini: fs-j-daemon's competing `attachment-*` split; ex-log's hook-injection commit on 26 files (merge-4 already injected them); ex-log's log-safety edits on `use-settings-slice` (it would log the error object the comment says may hold secrets) and `resolver-service` (split collided).

## Decisions needed
1. **Module API surface (hard ratchet) 821 → 831**: arch-120 moves 12 files into `contracts/core` (counted as a module) and the fsplit2 static-render split exposes 6 theme files. Exempt `contracts/` from the metric, or `--update` the baseline? Not laundered here.
2. Push the Jini merge: redo the 29 merges + `9516208a4` + `074857a89` as `integ/merge-5`, then fix the 104 Jini test-file type errors from ex-log (they also make `tsc && post-step` builds skip their post-steps).
3. Batch partial-failure contract (reject vs per-item results) — `batch-tool-inputs` case 2.
4. ex-log replaced specific log text with generic messages in several places (`editor-serialization` reason restored here); owner rule says errors never generic — review the other log-safety rewrites.
5. 9 new test failures above: update expectations to the new log-safe output, or treat as regressions.

## Next step
Owner: decisions 1 and 3. Then push Jini `integ/merge-5`, run the full (non-scoped) Tovu node + admin suites with Postgres, and triage the 9 new failures plus the typed-tools source-reader harness.
