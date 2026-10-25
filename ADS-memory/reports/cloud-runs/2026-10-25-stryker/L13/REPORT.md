# L13 — Stryker measure-only: Tovu `apps/admin` non-component logic (hooks / lib / integrations)

Report-only. No source or test edits in the repo. Run on 2026-10-25, 4 cores, Node 24.22, Stryker 9 (core + vitest-runner), typescript 5, admin's own vitest 4.1.11.

## 1. Headline
- **Stryker's vitest-runner CAN drive vitest 4.1.11** (no runner error). It needed two environment fixes (below) before the dry run was green.
- **Batch A (64 files: `src/hooks/*.ts`, `src/integrations/*.ts`, risky `src/lib/*.ts`): 2569 mutants tested of 3721 generated — 1152 were IGNORED as "static" (see §7). Killed 2181, timeout 5, survived 270, no-coverage 113. Mutation score on the tested mutants: 85.09 %.** Wall: dry run ~3 min, mutation 35 min (concurrency 4).
- **Batch B (37 lower-risk lib/theme/nav files): 979 of 1183 tested (204 static ignored); score 74.67 %, but mostly a scoping artefact for `admin-themes` — see §9.**
- **Combined: 3548 mutants tested; killed 2912 (+5 timeout), survived 440, no-coverage 191 → 82.2 % on tested mutants (1356 static mutants unmeasured).**
- Not covered at all: `src/features/**` (455 `.ts` files / 96k lines), `src/components/**/*.ts`, `App.hooks.ts`, the three big i18n tables — see §6.
- **The test set is SCOPED**: only `src/lib`, `src/hooks`, `src/integrations` tests (158 files / 2217 tests) were used to kill mutants, minus 8 files that fail on the unmodified tree here. Feature/component/App-level tests were not run, so a "survived"/"no-coverage" below may be killed by a test in `features/` or `src/__tests__/` — see §7.
- Wall total ≈ 3 h 42 m (setup 30 min; first attempt with the whole suite wasted ~1 h; second attempt wasted ~1 h on static mutants). Tokens ≈ 0.15 M.

### Setup facts (for repeating this)
1. Stryker's sandbox is `apps/admin/.stryker-tmp/sandbox-X`, two levels deeper than the app, so relative imports out of the app (`../../../website/...` in `src/lib/settings-tabs.ts`, and `vitest.config.ts` aliases to `../website`) break. Fix used: `ln -s ../../website apps/admin/.stryker-tmp/website` + `cleanTempDir: false`. (Other escapes — `deployment`, `ADS-memory` — appear only from tests; not hit by the scoped test set.)
2. Stryker aborts if ANY test fails in the dry run. On the unmodified tree the full admin suite (3357 suites / 13541 tests, 13m21s at maxWorkers=3) has 19 failing tests in 8 files (assistant-transport.ag-ui, dictionary-lookup-sinks, durable-run-subscription, untranslated-copy, AssistantDock.chat-settings, assistant-user-bubbles, consent-i18n, trash-i18n). An untracked wrapper `apps/admin/vitest.stryker.config.ts` (copy: `vitest.stryker.config.ts.txt` here) excludes them, adds `retry: 2` (one widgets-swap test flaked once in a dry run, passes alone) and 60 s timeouts. **Consequence: `lib/assistant-transport-ag-ui.ts` and `lib/durable-run-subscription.ts` score low/no-coverage only because their own test files were excluded — not a real finding.**
3. Whole-suite as test set is unusable: dry run 28 min, then 9–15 mutants/min. Scoped set: dry run 3 min, ~60 mutants/min.
4. Stryker runs "static" mutants (top-level code needing environment reload) LAST, each against ALL 2217 tests (≈2 min each). First attempt stalled on 262 of them (ETA > 2 h; SIGINT writes no report). `ignoreStatic: true` fixed it but leaves those unmeasured.
Config copy: `stryker-A2.json`, `stryker-B2.json`. Raw result (gz): `mutation-A2.json.gz`.

## 2. Suspected source bugs
None found. (No survivor pointed at behaviour contradicting the code's evident intent.) `lib/admin-draft-identity.ts` `getAdminDraftIdentity` / `setAdminDraftIdentity` with body `{}` survive — if those are real accessors, they are untested stubs (see §4).

## 3. Per-file table (worst score first; score = (killed+timeout)/(killed+timeout+survived+no-coverage); IGNORED static mutants excluded)
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| hooks/use-cms-sidebar-label-tooltips.hooks.ts | 29 | 0 | 0 | 29 | 0 | 0.0% |
| hooks/use-credential-hint.hooks.ts | 4 | 0 | 0 | 4 | 0 | 0.0% |
| lib/assistant-transport-ag-ui.ts | 40 | 0 | 5 | 35 | 0 | 0.0% |
| lib/admin-draft-identity.ts | 2 | 0 | 2 | 0 | 0 | 0.0% |
| lib/admin-boot-scope.ts | 7 | 1 | 6 | 0 | 0 | 14.3% |
| lib/queued-daemon-start.ts | 35 | 10 | 5 | 19 | 1 | 31.4% |
| hooks/use-sites-sidebar-nav.hooks.ts | 67 | 29 | 22 | 16 | 0 | 43.3% |
| lib/acceptance-cancellation.ts | 11 | 6 | 5 | 0 | 0 | 54.5% |
| hooks/use-admin-locale.hooks.ts | 14 | 9 | 5 | 0 | 0 | 64.3% |
| lib/durable-run-subscription.ts | 40 | 28 | 8 | 4 | 0 | 70.0% |
| lib/retry-unreachable.ts | 10 | 7 | 3 | 0 | 0 | 70.0% |
| lib/unchanged-save-warning.ts | 15 | 11 | 1 | 3 | 0 | 73.3% |
| hooks/use-interface-preferences.hooks.ts | 22 | 17 | 5 | 0 | 0 | 77.3% |
| lib/router.ts | 36 | 28 | 8 | 0 | 0 | 77.8% |
| hooks/use-agent-screen-context.hooks.ts | 32 | 25 | 7 | 0 | 0 | 78.1% |
| hooks/use-tovu-execution-adapters.hooks.ts | 24 | 19 | 5 | 0 | 0 | 79.2% |
| hooks/use-admin-appearance.hooks.ts | 64 | 52 | 12 | 0 | 0 | 81.3% |
| hooks/use-admin-appearance-snapshot.hooks.ts | 12 | 10 | 2 | 0 | 0 | 83.3% |
| hooks/assistant-chats-dependencies.hooks.ts | 93 | 78 | 15 | 0 | 0 | 83.9% |
| hooks/use-tovu-execution-policy.hooks.ts | 31 | 26 | 5 | 0 | 0 | 83.9% |
| hooks/use-assistant-chats.hooks.ts | 50 | 42 | 8 | 0 | 0 | 84.0% |
| lib/assistant-transport.ts | 69 | 59 | 10 | 0 | 0 | 85.5% |
| hooks/use-sidebar-empty-click-toggle.hooks.ts | 67 | 58 | 8 | 1 | 0 | 86.6% |
| lib/browser-working-directory-access.ts | 47 | 41 | 6 | 0 | 0 | 87.2% |
| lib/stored-credential-endpoint.ts | 47 | 41 | 6 | 0 | 0 | 87.2% |
| lib/tab-event-source.ts | 40 | 35 | 5 | 0 | 0 | 87.5% |
| lib/execution-settings.ts | 184 | 163 | 21 | 0 | 0 | 88.6% |
| hooks/use-dock-auto-rail.hooks.ts | 27 | 24 | 3 | 0 | 0 | 88.9% |
| lib/local-owner-signin.ts | 36 | 32 | 4 | 0 | 0 | 88.9% |
| hooks/use-list-table-cell-labels.hooks.ts | 49 | 43 | 5 | 0 | 1 | 89.8% |
| lib/slug-redirect-path.ts | 10 | 9 | 1 | 0 | 0 | 90.0% |
| lib/tovu-execution-policy.ts | 20 | 18 | 2 | 0 | 0 | 90.0% |
| hooks/use-standing-draft-autosave.hooks.ts | 10 | 9 | 1 | 0 | 0 | 90.0% |
| lib/settings-effective-reads.ts | 30 | 27 | 3 | 0 | 0 | 90.0% |
| hooks/use-external-entry-refresh.hooks.ts | 73 | 66 | 7 | 0 | 0 | 90.4% |
| hooks/admin-locale-dependencies.hooks.ts | 21 | 19 | 2 | 0 | 0 | 90.5% |
| hooks/use-admin-execution-credential.hooks.ts | 37 | 34 | 3 | 0 | 0 | 91.9% |
| lib/browser-stream.ts | 125 | 115 | 10 | 0 | 0 | 92.0% |
| lib/settings-tabs.ts | 178 | 165 | 13 | 0 | 0 | 92.7% |
| lib/api.ts | 576 | 546 | 28 | 2 | 0 | 94.8% |
| lib/server-reconnect.ts | 70 | 64 | 3 | 0 | 3 | 95.7% |
| hooks/admin-execution-credential-dependencies.hooks.ts | 22 | 22 | 0 | 0 | 0 | 100.0% |
| hooks/use-admin-document-locale.hooks.ts | 5 | 5 | 0 | 0 | 0 | 100.0% |
| hooks/use-drawer-active-item-centring.hooks.ts | 27 | 27 | 0 | 0 | 0 | 100.0% |
| hooks/use-settings-slice.hooks.ts | 10 | 10 | 0 | 0 | 0 | 100.0% |
| lib/assistant-permanent-deletes.ts | 2 | 2 | 0 | 0 | 0 | 100.0% |
| lib/boot-token-fragment.ts | 6 | 6 | 0 | 0 | 0 | 100.0% |
| lib/page-lifecycle.ts | 11 | 11 | 0 | 0 | 0 | 100.0% |
| lib/panel-access.ts | 38 | 38 | 0 | 0 | 0 | 100.0% |
| lib/publish-criteria-deep-link.ts | 4 | 4 | 0 | 0 | 0 | 100.0% |
| lib/settings-events.ts | 40 | 40 | 0 | 0 | 0 | 100.0% |
| lib/settings-refresh-bus.ts | 15 | 15 | 0 | 0 | 0 | 100.0% |
| lib/site-url.ts | 6 | 6 | 0 | 0 | 0 | 100.0% |
| lib/standing-draft-local-backup.ts | 6 | 6 | 0 | 0 | 0 | 100.0% |
| lib/typed-answer-poster.ts | 3 | 3 | 0 | 0 | 0 | 100.0% |
| lib/version-conflict.ts | 10 | 10 | 0 | 0 | 0 | 100.0% |
| hooks/use-content-refresh-subscription.hooks.ts | 6 | 6 | 0 | 0 | 0 | 100.0% |
| hooks/use-focus-trap.hooks.ts | 4 | 4 | 0 | 0 | 0 | 100.0% |

## 4. Triaged survivors (files < 80 % or ≥ 10 survivors; ≤ 10 per file; line numbers are in the source file)
Class: (a) real test gap, (b) equivalent, (c) noise. `N` = no-coverage, `S` = survived.
- **lib/admin-draft-identity.ts (0 %, 2 S)** (a) `getAdminDraftIdentity`/`setAdminDraftIdentity` bodies → `{}` survive: no assertion that set-then-get round-trips the id.
- **lib/admin-boot-scope.ts (14 %, 6 S)** (a) line 11 `queryScope: principalId === null ? "anonymous" : "principal:<id>"` — every mutation of the ternary/`{...scope}` survives: no test asserts the derived `queryScope` for anonymous vs. signed-in (this is the cache key that separates one user's queries from another's — worth a test). (c) the `createContext` default (line 5) mutants.
- **lib/queued-daemon-start.ts (31 %, 5 S + 19 N)** (a) lines 16–17: the `CHAT_RUN_BUSY` branch (retry-after-busy, `ports.wait` called with `{signal}`) is never executed by the scoped tests; lines 26–27 `schedule`/`clearTimeout` and 35–39 `wait` abort handling (`signal.aborted` → `AbortError`) likewise. Missing: busy → wait → retry test, abort-while-waiting test.
- **hooks/use-sites-sidebar-nav.hooks.ts (43 %, 22 S + 16 N)** (a) truncation detection (`scrollWidth > clientWidth`, boundary `>` vs `>=`/`<=`, line 89), `ResizeObserver` absent vs present (line 92), cleanup removing `data-cms-sites-split` (line 81) are unexercised. jsdom has no layout, so these need stubbed `scrollWidth/clientWidth`.
- **lib/acceptance-cancellation.ts (55 %, 5 S)** (a) abort wiring: `addEventListener("abort", …, { once: true })`, `finally` cleanup, and the already-aborted path (`if (signal?.aborted) await cancel()`) — no test aborts before/after the accept call.
- **hooks/use-admin-locale.hooks.ts (64 %, 5 S)** (a) the `["settings","core.language",queryScope]` key and the `subscribeToSettingsRefresh → invalidate({key:["settings"…]})` effect + deps arrays: no test that a settings refresh event re-fetches the language.
- **lib/durable-run-subscription.ts (70 %, 8 S + 4 N)** mostly env — its own unit test file is in the excluded failing set (§1). Re-measure once that test passes.
- **lib/retry-unreachable.ts (70 %, 3 S)** (a) `isUnreachable: error instanceof ApiError && error.code === API_UNREACHABLE_CODE` — no test passes a non-ApiError or a different code and expects "not unreachable".
- **lib/api.ts (94.8 %, 28 S + 2 N; but 737 of 1315 mutants IGNORED, §7)** (a) lines 2303 timeout message `DEFAULT_REQUEST_TIMEOUT_MS / 1000` (seconds shown to the user not asserted); 2355 `errorName()` type guard (`value && typeof value==="object" && "name" in value…`) — all three clauses unasserted; 2372 `if (errorName(cause)==="AbortError") throw cause` (abort must rethrow, not become a network error) unasserted; 2714–2716 `/auth/login` request shape (`method`, `JSON.stringify({username,password})`) not asserted; 3225/3231 two `POST` helpers have no tests at all (N). By mutator: ObjectLiteral 11, ConditionalExpression 15.
- **lib/execution-settings.ts (88.6 %, 21 S)** (a) `.trim()` removed at 320–322 (agent id / model / reasoning with surrounding whitespace), 226 `Boolean(apiKey.trim())` (whitespace-only key counted as set), 273/279 enum narrowing fallbacks (`local-cli|byok`, `anthropic|openai|azure|google`) — no "unknown value → fallback" test, 139/141 empty/ non-string `apiKey` parse paths, 309 max-token sentinel, 383 empty agentId → "".
- **hooks/assistant-chats-dependencies.hooks.ts (83.9 %, 15 S)** (a) in-memory chat store: `findIndex(m => m.id === message.id)` (212) and `messageCount` bump vs. replace (223) — no test appends the same message id twice / asserts count; title-update when the conversation is missing (166, 203).
- **lib/settings-tabs.ts (92.7 %, 13 S)** (a) `changed:` flags for `desktopEnabled` (126) and `wrapTabs` (342) forced true survive → no "unchanged ⇒ changed=false" case; `theme` narrowing (228); accent-color default compare (208, 216). (c) `DEFAULT_PRIVACY` / `DEFAULT_APPEARANCE` literals (147–193): telemetry default `{metrics:false,content:false}` is a privacy default — mutating to `true` survives, so no test pins "telemetry off by default" in this scope (may be pinned elsewhere).
- **lib/browser-stream.ts (92 %, 10 S)** (a) the `if (!connected || disposed || away) return` guard (85), `requested.signal.aborted` (106), `HIDDEN_GRACE_MS - (now - hiddenSince)` arithmetic (135), `dispose` idempotence (153–154) — hidden-tab grace timing is not tested at the boundary.
- **hooks/use-admin-appearance.hooks.ts (81 %, 12 S)** (a) draft-version logic (78 `draft.version <= readVersion`, 81 `> readVersion`): equal-version boundary untested; invalidate key `["settings", APPEARANCE_NAMESPACE]` untested. (c) options-object `{}` mutants (56, 58).
- Remaining files 85–90 % with < 10 survivors (summary by mutator only): hooks/use-sidebar-empty-click-toggle (8 S), use-agent-screen-context (7 S), use-tovu-execution-adapters (5), use-interface-preferences (5), use-external-entry-refresh (7), router.ts (8 S — 28 killed/36), assistant-transport.ts (10), stored-credential-endpoint (6), browser-working-directory-access (6), tab-event-source (5), local-owner-signin (4). Dominant survivor mutators overall: ConditionalExpression and ObjectLiteral/ArrayDeclaration on options and React dependency arrays (`[]` deps and `{}` options are the classic hook-test blind spot: effects not re-run on dependency change).
- 100 %: version-conflict, panel-access, settings-events, settings-refresh-bus, boot-token-fragment, site-url, page-lifecycle, typed-answer-poster, standing-draft-local-backup, publish-criteria-deep-link, assistant-permanent-deletes, use-focus-trap, use-settings-slice, use-drawer-active-item-centring and 4 more (tiny files; ≤ 40 mutants each).

## 5. No-coverage ranges (code no scoped test executes)
- hooks/use-cms-sidebar-label-tooltips.hooks.ts — 29 mutants, lines 7–33 (the whole hook: no test).
- hooks/use-credential-hint.hooks.ts — 4 mutants, lines 5–12 (whole hook).
- lib/assistant-transport-ag-ui.ts — 35 mutants, lines 54–89 (**env: its test file is in the excluded failing set**).
- lib/queued-daemon-start.ts — 19, lines 16–17, 26–27, 35–39 (busy-retry + abort).
- hooks/use-sites-sidebar-nav.hooks.ts — 16, lines 16–17, 81, 87–97 (truncation observer).
- lib/durable-run-subscription.ts — 4, lines 21, 38, 55 (**env: excluded test file**).
- lib/unchanged-save-warning.ts — 3, lines 28–29, 32.
- lib/api.ts — 2, lines 3225, 3231 (two POST helpers).
- hooks/use-sidebar-empty-click-toggle.hooks.ts — 1, line 29.
"No coverage" here means "no test in lib/hooks/integrations covers it"; a feature/App test might.

## 6. NOT RUN
- `apps/admin/src/features/**/*.ts` (455 files, ~96k lines) — **none**. `src/components/**/*.ts` (52 files), `src/App.hooks.ts` (1155 lines), `src/lib/admin-nav-i18n.ts`, `src/lib/i18n-common.ts`, `src/app-i18n.ts`, `src/lib/descriptor-i18n.ts` (i18n tables, lowest risk; deliberately dropped to fit the clock), all `.tsx`.
- 1152 static mutants of batch A ("Ignored", §7) — unmeasured, **including 737 of 1315 in `lib/api.ts`, 45 in execution-settings, 24 in settings-tabs, 23 in use-admin-execution-credential, 22 in server-reconnect, 21 in durable-run-subscription**.
- Batch B: see §9.
- The 8 test files excluded for failing on the unmodified tree (§1).

## 7. What these numbers do NOT catch
- **Scoped test set** (lib/hooks/integrations tests only; 2217 of 13541 tests): feature, component and `App` tests that exercise these modules were not run, so survivors/no-coverage may be false alarms and scores are lower bounds.
- **Static mutants ignored (`ignoreStatic`)**: 31 % of batch A's mutants (top-level constants, and — as it turns out — most code inside module-level objects/classes in `api.ts`) are unmeasured. The 85 % is the score of the *other* 69 %; do not read it as the file's score. A full measurement needs ~2 min per static mutant (hours).
- Type checks off (`disableTypeChecks`) → type-invalid mutants are not filtered/compile-errored; StringLiteral mutants excluded (error messages, endpoint paths, i18n keys, storage keys, CSS selectors are untested by this metric).
- "Killed" = some scoped test failed, not necessarily the module's own test (indirect kills). `retry: 2` in the wrapper can mask a flaky kill and can make a mutant that only fails once look killed/survived inconsistently.
- Untested inputs: mutation testing only checks the inputs the existing tests use. Real-time, layout (jsdom has none), network and browser-API behaviour is not exercised.
- `.tsx` components and `features/` untouched; no coverage of the server/website contracts these hooks call.

## 8. Top 10 tests to write first (by risk)
1. `admin-boot-scope`: `queryScope` is `"anonymous"` for `principalId===null`, `"principal:<id>"` otherwise (cross-user cache-key isolation).
2. `settings-tabs`/privacy: `DEFAULT_PRIVACY.telemetry` is `{metrics:false, content:false}`; unchanged settings ⇒ `changed:false` for `desktopEnabled`/`wrapTabs`.
3. `api.ts`: AbortError is rethrown (not converted to a network error) and `/auth/login` posts `{method:"POST", body:{username,password}}`; non-error values pass/fail `errorName()` guard; the two untested POST helpers (lines 3225/3231).
4. `queued-daemon-start`: `CHAT_RUN_BUSY` → wait → retry; abort during wait rejects with `AbortError`; timer cleared.
5. `acceptance-cancellation`: abort before and during an accept call triggers `cancel()` exactly once; listener removed in `finally`.
6. `execution-settings`: whitespace-only api key is "not set"; whitespace in agentId/model/reasoning trimmed; unknown mode/provider values fall back; empty agentId → "".
7. `retry-unreachable`: only `ApiError` with `API_UNREACHABLE_CODE` is unreachable.
8. `assistant-chats-dependencies`: appending a message with an existing id replaces it and does not bump `messageCount`; title update for a missing conversation is a no-op.
9. `use-admin-locale` / `use-admin-appearance`: a settings-refresh event re-fetches/invalidates; draft-version equal-boundary case.
10. `browser-stream`: hidden-tab grace-window boundary (`HIDDEN_GRACE_MS`), `dispose()` idempotence, aborted request signal — plus tests for the never-tested hooks `use-cms-sidebar-label-tooltips` and `use-credential-hint`.


## 9. Batch B (37 lower-risk files; 1183 mutants generated, 979 tested, 204 static IGNORED) — finished 19:42Z
Killed 731, survived 170, no-coverage 78, timeout 0 → **score 74.67 %** on tested mutants. Same scoped test set and caveats as §7.
**The low scores are dominated by `src/admin-themes/*` (registry 6 %, apply 10 %, use-admin-theme.hooks 15.5 %; 140 of the 248 non-killed mutants): its tests live in `src/admin-themes/__tests__/`, which the scoped include (lib/hooks/integrations) did not run — so this is a scoping artefact, not evidence that the theme code is untested.** Re-measure with `src/admin-themes/**` tests included. Same for `nav.ts` (61.5 %, tests in `src/__tests__`), `media-panel.ts` and `lib/visitor-tools.ts` (0 %, 3 and 2 no-coverage mutants — no scoped test touches them).
Other survivors (all small): `assistant-agents-snapshot` (9 S), `assistant-prompt-bus` (6 S), `post-title-extension` (6 S), `visible-interval` (4 S), `agent-screenshot` data-URL regex anchors (`^`/`$` removal at line 171 survive → no test feeds a malformed/prefixed data URL), `media-embed-extension.hooks` (`contentType.trim().toLowerCase()` at 61, cleanup `live=false` at 78–79, `isRef` boundary at 132).

### Batch B per-file table
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| lib/visitor-tools.ts | 2 | 0 | 0 | 2 | 0 | 0.0% |
| media-panel.ts | 3 | 0 | 0 | 3 | 0 | 0.0% |
| admin-themes/registry.ts | 16 | 1 | 11 | 4 | 0 | 6.3% |
| admin-themes/apply.ts | 29 | 3 | 23 | 3 | 0 | 10.3% |
| admin-themes/use-admin-theme.hooks.ts | 161 | 25 | 70 | 66 | 0 | 15.5% |
| nav.ts | 13 | 8 | 5 | 0 | 0 | 61.5% |
| lib/assistant-prompt-bus.ts | 23 | 17 | 6 | 0 | 0 | 73.9% |
| lib/assistant-agents-snapshot.ts | 37 | 28 | 9 | 0 | 0 | 75.7% |
| lib/chat-attachment-liveness.ts | 10 | 8 | 2 | 0 | 0 | 80.0% |
| lib/visible-interval.ts | 20 | 16 | 4 | 0 | 0 | 80.0% |
| lib/post-title-extension.ts | 38 | 32 | 6 | 0 | 0 | 84.2% |
| lib/agent-screen-context.ts | 28 | 24 | 4 | 0 | 0 | 85.7% |
| lib/ledger-slice.ts | 21 | 18 | 3 | 0 | 0 | 85.7% |
| lib/block-atom-insert.ts | 22 | 19 | 3 | 0 | 0 | 86.4% |
| lib/assistant-chats.ts | 32 | 28 | 4 | 0 | 0 | 87.5% |
| lib/stream-activity.ts | 39 | 35 | 4 | 0 | 0 | 89.7% |
| lib/playground-render-target-bus.ts | 12 | 11 | 1 | 0 | 0 | 91.7% |
| lib/media-embed-extension.hooks.ts | 69 | 64 | 5 | 0 | 0 | 92.8% |
| lib/credential-card-guidance.ts | 14 | 13 | 1 | 0 | 0 | 92.9% |
| lib/plain-text-blocks.ts | 28 | 26 | 2 | 0 | 0 | 92.9% |
| lib/content-refresh-bus.ts | 20 | 19 | 1 | 0 | 0 | 95.0% |
| lib/agent-screenshot.ts | 50 | 48 | 2 | 0 | 0 | 96.0% |
| lib/widget-embed-placement-content.ts | 26 | 25 | 1 | 0 | 0 | 96.2% |
| lib/widget-embed-extension.hooks.ts | 83 | 81 | 2 | 0 | 0 | 97.6% |
| lib/addons-routes.ts | 48 | 47 | 1 | 0 | 0 | 97.9% |
| lib/a2ui-action-poster.ts | 6 | 6 | 0 | 0 | 0 | 100.0% |
| lib/agent-pages.ts | 19 | 19 | 0 | 0 | 0 | 100.0% |
| lib/agent-screenshot-bus.ts | 8 | 8 | 0 | 0 | 0 | 100.0% |
| lib/assistant-dock-bus.ts | 20 | 20 | 0 | 0 | 0 | 100.0% |
| lib/assistant-subagents.ts | 2 | 2 | 0 | 0 | 0 | 100.0% |
| lib/credential-copy.ts | 27 | 27 | 0 | 0 | 0 | 100.0% |
| lib/escape-owned-by-inner-layer.ts | 16 | 16 | 0 | 0 | 0 | 100.0% |
| lib/external-entry-refresh.ts | 24 | 24 | 0 | 0 | 0 | 100.0% |
| lib/editor-template-options.rules.ts | 6 | 6 | 0 | 0 | 0 | 100.0% |
| lib/admin-dev-origin.ts | 4 | 4 | 0 | 0 | 0 | 100.0% |
| lib/merge-locale-overlays.ts | 3 | 3 | 0 | 0 | 0 | 100.0% |

Still NOT RUN: features/**, components/**/*.ts, App.hooks.ts, admin-nav-i18n, i18n-common, app-i18n, descriptor-i18n, all .tsx, and the static mutants (A: 1152, B: 204).

L13 DONE 2026-10-25T19:43:10Z — wall ≈ 3 h 42 m, rough tokens ≈ 0.2 M
