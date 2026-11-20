# Over-engineering cull: r62t-bugs2 (11-20, Opus cloud)

Input: `cull-inputs-4/r62t-bugs2.md`, which holds the Codex 6.2 sheets. Bases: Tovu merge-6 `776ce6d0f0` and Jini merge-6 `d3e78b387`. Pushed refs were read with `git show` and `git diff`. This was a read-only judgment: no tests or builds were run. **The CULL wins over the design.**

## Verdicts

| Item | Verdict | Note |
|---|---|---|
| J-401 (1271) | KEEP | Only the test changes. The red witness is the flaky `write ECONNRESET` (2 of 9 runs). |
| J-EMBED (1372) | CUT-TO | Adds the spec line (C1). |
| J-LOCK-OWNER (576) | KEEP | — |
| T-B05 (1452) | CUT-TO | Base is after `tv-rs3` only (C2). |
| T-IMPORT-ABORT (1391) | CUT-TO | Base is merge-6, and the stale comment is replaced (C3). |
| B02-R | CUT-TO | Base is merge-6, and the importer table is corrected (C4). |
| T-ANALYTICS-HOOKS (579) | KEEP | — |
| T-ANALYTICS-CONSENT (579) | NEEDS-DECISION | ND-2 |
| M5-T-SPLIT | CUT-TO | C5 |
| M5-T | CUT-TO | The receiver lives in its own function (C6). The base no longer depends on T-ANALYTICS-CONSENT. |
| 1383 | RETIRE (deviates, accepted) | Done on merge-6. Evidence below. |
| 1408 | RETIRE (deviates, accepted) | Done on merge-6. |
| 1417 | RETIRE (deviates, accepted) | Done on merge-6. |
| 1418 | RETIRE | Coordinator decision: keep the marker (`agent-daemon-run-start.ts:365–375`). |
| 155 | NEEDS-DECISION | ND-1 |
| 348 | RETIRE (deviates, accepted) | No schema change is needed, so ADR-066 does not apply. |
| 566 | RETIRE (deviates, accepted) | Done on merge-6. |
| 614 | RETIRE | The web admin does not bypass the off setting, which is the decision's own condition. |
| OWNED-ELSEWHERE / PARKED rows | KEEP as listed | None of the Jini sheets touches the 89 `ex-err-jini` files (checked). |

**Counts:** KEEP 3 · CUT-TO 6 · NEEDS-DECISION 2 · RETIRE 7 · DROP 0 · BLOCKED 0 · CLOUD 0.

### Sheets that deviate from a coordinator decision (all accepted)

The coordinator ruled YES (do the work) on these items, but Codex retired them. I confirmed each retirement from code on merge-6:

- **1383:** `/api/agents` no longer goes through the daemon. The test at `assistant-cold-start.unit.test.ts:35–55` shows it reading the local inventory. Only a known failure still returns 503 (`:51–55`). The admin page shows no notice for PARKED or UNAVAILABLE reads, but does for KNOWN_FAILED (`admin-failure-channel.assistant-cold.unit.test.ts:16–34`). The dock's STARTING label is pinned at `daemon-starting-label.integration.test.tsx:103–124`. A Chrome look of the Agent Plugins page with the dock is still owed.
- **1408:** `batch-tool-inputs.test.ts:311–356` already asserts per-item `[[0,true],[1,false],[2,true]]`, both written files, the absence of the denied file, and a valid retry.
- **1417:** Jini `automatic-use.ts:181–184` emits the deferral with a `howToLoad` pointer, and Tovu wires `formatPluginToolPointer` at `automatic-agent-plugins.ts:117`. The byte cap is unchanged. Residual risk: if the turn-1 miss came from relevance ranking rather than size, the decision does not cover it.
- **348:** `campaign-write-service.ts:118` puts `bodyJson` into the revision state, and `repo.rows.ts:102–118` projects it from `editorial_state_json`. Coverage is in `campaign-write-service.test.ts:42–48` (create, edit, revisions) and `repo.dialects.test.ts:137–145`. With no column needed, there is no migration.
- **566:** Jini `connect-card-ui.ts:93` sets `cancelLabel: "Skip"` and `:95` defines the skipped state. Tovu pins it in `connect-skip.unit.test.ts:15ff`.

## CUT text (exact)

**C1, J-EMBED:** add this edit line. In `packages/chat/docs/spec/api.spec.md:268`, replace `` `mountEmbedChat({element,widget}): {unmount({}):void}` `` with `` `mountEmbedChat({element,widget,surfaces}): {unmount({}):void}` (surfaces: ChatSurfaces, required)``. Also add `BREAKS: imperative mountEmbedChat callers must pass surfaces (no production caller in Jini or Tovu on merge-6).`

**C2, T-B05:** set the base line to `after tv-rs3 (C08-SPLIT edits :27 of the same test); tv-z4 is not needed (no site-deps change; boot-phases.ts:91 is identical on merge-6)`.

**C3, T-IMPORT-ABORT:** the base is `merge-6`, with no tv-po or tv-xd5-publish dependency. Neither branch touches `init-site.ts` or the integration test. Add: "Replace the comment at `import-creates-new-site.integration.test.ts:109–111` with the single line `// Owner 11-20: a saved-key AbortError reaches the caller unchanged; other mid-creation failures are wrapped in InternalError.`" Also add: "`cleanupFailedSite` is shared with `duplicate-site.ts:10`, so a duplicate cancellation also keeps its AbortError. This is accepted as the same fix." The complexity of `cleanupAndRethrow` goes from about 6 to 8.

**C4, B02-R:** the base is `merge-6`. None of `tv-b2`, `tv-rs3` or `tv-z1`–`tv-z5` touches the six files (checked). Replace the importer paragraph and table with:

> `index.ts:91` has **zero** importers on merge-6, `tv-b2` and `tv-rs3`. `git grep -n -F 'loadDeployOpsRegistry' -- apps development packages` finds only direct `deploy-ops/registry` imports: `route-deps-publish-credentials.ts:23` (production), `__tests__/fixtures/site-layout-context.ts:8`, `bundled-agent-plugins-dir-callers.unit.test.ts:13`, `installed-deploy-verb.test.ts:13`, and `registry.test.ts:99,157,213,229`. These need no edit. Delete the line only. The STOP is: any hit importing `loadDeployOpsRegistry` from `features/deployments` or `features/deployments/index`.

**C5, M5-T-SPLIT:** the signature is `async function dispatchBrowserAnalyticsHttp(required: { request: Request; response: Response; deps: RouteDeps; surface: 'site' | 'admin'; limiter: ReturnType<typeof createRateLimiter> }, _options = {}): Promise<void>`. Its body is `:26–34` verbatim. The handler `try` becomes `await dispatchBrowserAnalyticsHttp({ request, response, deps, surface, limiter });`. Base is merge-6; `tv-rs3` left this file unchanged.

**C6, M5-T receiver:** replace the **Receiver** bullet with:

> Do NOT add routing inside `dispatchBrowserAnalyticsHttp`. Its moved body already sits near 8 and would reach 10–12. In the handler's `try`, use `if (request.path === '/site/diagnostics') await dispatchBrowserDiagnostics({ request, response, deps, limiter }); else await dispatchBrowserAnalyticsHttp({ request, response, deps, surface, limiter });`. Add a private `async function dispatchBrowserDiagnostics(required: { request: Request; response: Response; deps: RouteDeps; limiter: ReturnType<typeof createRateLimiter> }, _options = {}): Promise<void>`, which runs four steps in order:
> 1. If `request.method !== 'POST'`, respond 404.
> 2. If `!(await collectionAllowed({ request, deps, surface: 'site' }))`, respond 403.
> 3. If the existing limiter check fails, respond 429.
> 4. Call `await deliver({ request, response, http: { path: '/_jini/browser-analytics/site', handle: input => receiveBrowserDiagnostics(input, { deps }) }, fullPath: '/_jini/browser-analytics/site/diagnostics' });`.
>
> Add `import { receiveBrowserDiagnostics } from './browser-diagnostics.js';`. STOP if the `http` literal needs a cast.

The base becomes `after M5-T-SPLIT; after T-ANALYTICS-CONSENT only if ND-2 keeps it` (the shared file is `site-cookie-consent.ts` plus `declared-consent.unit.test.ts`).

## BUGS confirmed (file:line on merge-6)

1. **1372:** `useChatPaneAgentControl.hooks.ts:244` calls `useChatSurfaces()`, which throws at `react/surfaces.tsx:56` without a provider. `mountEmbedChat` (`embed-widget/react/embed.tsx:62–65`) renders no `ChatSurfacesProvider`. `embed.test.tsx:12` mocks `ChatPane`, so the test stays green.
2. **576:** `platform/src/fs/file-lock.ts:110–111` returns `undefined` for a foreign host. `isLockStale` (`:67–70`) then evicts on age alone through `stale` at `:144–146` (callers at `:207,266`).
3. **1391:** `platform/site-dir/init-site.ts:133` wraps an AbortError in `InternalError`. The integration test pins that wrapper at `import-creates-new-site.integration.test.ts:109–117`.
4. **579 (hooks):** `analytics-providers.ts:82` always supplies `createPluginAnalyticsHooks`. `jini-adapters.ts:69,88` and `analytics-ingest.ts:110` run provider `beforeIngest` on every beacon, even when a visitor declined. Only the forwarders check consent (`:78`).
5. **1452:** `identity-settings.characterization.unit.test.ts:8,18–23` parses `../../deps.ts`, but the call is at `site-deps/boot-phases.ts:91` inside `composeSiteServicesPhase`.
6. **1271:** `tool-execution-rpc.test.ts:369–370` writes 1 MB after the server has already answered 401.

## NEEDS-DECISION

**ND-1 (155, redesign approval):** there is no trusted redesign-intent signal. `tool-registry.ts:172–179` carries none, and `file-mutation-tools.ts:29–69` sees only input and file state. The smallest trusted signal is server-known state: the first overwrite in a run of a theme that **existed before the run started** asks once, through the existing approval card, before the first edit or activation. The result would then hold per theme for that run. The cost is one card on an ordinary edit run. *Question:* is one approval per run for any existing theme acceptable, or should 155 stay PARTIAL until the run carries attachment metadata? *Recommendation:* accept the once-per-run card. It is the smallest trusted signal, and it also covers "make it look like this picture".

**ND-2 (T-ANALYTICS-CONSENT):** banner-off mode **deliberately** admits cookieless collectors that declare `supportsAnonymous` (`site-cookie-consent.ts:157`). It also runs owner-declared analytics scripts (`:271,283,307–308`). Both are pinned by `site-cookie-consent.test.ts:254–287` and `declared-consent.unit.test.ts:553`. The sheet removes that tier, after which `supportsAnonymous` is dead in Tovu. *Question:* does "keep the gate closed" cover the designed anonymous tier and the owner's declared scripts? *Recommendation:* NO, DROP this sheet. 579 asked about full forwarding, which already fails closed, and T-ANALYTICS-HOOKS closes the real bypass. If YES, keep the sheet with `BREAKS: off-mode sites lose declared analytics scripts and anonymous collectors.`

## Batches

| Job | Base | Sheets |
|---|---|---|
| `j-bg-jini` | Jini merge-6 `d3e78b387` | J-401 → J-EMBED → J-LOCK-OWNER (3 sheets, file-disjoint) |
| `j-tv-bg` | Tovu merge-6 `776ce6d0f0` + `tv-rs3` | T-B05 → T-IMPORT-ABORT → B02-R → T-ANALYTICS-HOOKS → M5-T-SPLIT → [T-ANALYTICS-CONSENT if ND-2 = YES] → M5-T (6 or 7 sheets) |

Both jobs are below the 6-sheet target (Jini 3) only because no other Jini bug sheet is in scope. Dispatch them anyway: they are bug fixes, and no other sheet is waiting.
