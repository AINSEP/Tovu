Nine sheets are ready to batch. Six fit a file-disjoint Tovu job. The three Jini sheets and the final M5-T sheet need additional sheets to meet the six-sheet minimum. The redesign approval fix is partial because the current write boundary cannot identify a redesign from trusted run data.

I reviewed Tovu merge-6 `776ce6d0f` and Jini merge-6 `d3e78b387` with targeted reads of the pushed refs. I changed no files and ran no tests, builds, or mutations. The dispatch clone lacked `AI-Dev-Shop/`, as expected under the peer bootstrap. `c-tv-rs3/REFRESH.md` was absent. Its executor report and `COMMIT-PLAN.md` both record zero refresh entries.

## Disposition

Paths below use `W = apps/website/src`, `A = apps/admin/src`, `R = W/server/runtime/composition`, and `P = packages`. Line anchors refer to merge-6 unless a pushed ref is named.

| ID | Disposition | Evidence or reason |
|---|---|---|
| 1271 / J-401 | READY-FOR-CODEX | The early-401 test still streams the large payload after the server can close the connection. `P/daemon/src/http/__tests__/tool-execution-rpc.test.ts:335–375`. |
| 1452 / T-B05 | READY-FOR-CODEX | `tv-rs3:f064021231` changes the neighboring declaration-order case and leaves the stale URL and phase name at `R/site-deps/__tests__/identity-settings.characterization.unit.test.ts:8,18–23`. `tv-z4` places the call at `R/site-deps/boot-phases.ts:91`. |
| 1372 / J-EMBED | READY-FOR-CODEX | `P/chat/src/embed-widget/react/embed.tsx:62–65` creates a root missing the provider required by the real pane. |
| 1383 | RETIRE | `assistant-cold-start.unit.test.ts:35–55` pins passive local inventory and the failed-start response. `A/lib/__tests__/admin-failure-channel.assistant-cold.unit.test.ts:16–38` pins quiet cold reads and an actionable known-failure notice. The existing dock startup label is exercised at `A/components/AssistantDock/__tests__/daemon-starting-label.integration.test.tsx:103–124`. Verify Agent Plugins and the dock together in Chrome after `tv-z2`. |
| 1391 / T-IMPORT-ABORT | READY-FOR-CODEX | `W/platform/site-dir/init-site.ts:116–133` wraps the restore cancellation after cleanup. The import integration test currently expects that wrapper. |
| 1408 | RETIRE | `W/assistant/__tests__/batch-tool-inputs.test.ts:311–356` already asserts ordered per-item outcomes, two written files, no denied file, and a valid retry. |
| 1417 | RETIRE | `P/agent-plugins/src/lifecycle/automatic-use.ts:178–185` already emits a short deferred-load instruction. `W/features/agent-plugins/automatic-agent-plugins.ts:116–125` supplies the formatter and `bundled-catalog.ts:152–153` names `load_agent_plugin`. `jb2:c39b5bbdd` retains that instruction and tests explicit full retrieval at its combined 24 KiB query boundary. This round makes no cap edit. |
| 1418 | RETIRE | Owner explicitly kept `<<SUBAGENT_DISPATCH>>` to suppress AI-Dev-Shop bootstrap inside product chat. `W/server/inbound/assistant/agent-daemon-run-start.ts:365–375`. |
| 155 | PARTIAL | Activation already requires approval. Existing-theme file writes still use a direct chain, and trusted redesign intent is missing from the inspected execution context. See the remaining-work section. |
| 348 | RETIRE | Create and update forward `bodyJson` to the campaign owner. `W/features/newsletter/campaign-write-service.ts:118` puts it in the campaign state used for revisions. `repo.ts:30` and `repo.rows.ts:102–118` project the persisted document from the latest revision. Create, update, and dialect tests already cover round trips. Existing revision storage meets the persistence requirement without an ADR-066 migration. |
| 566 | RETIRE | `W/features/agent-plugins/__tests__/unit/connect-skip.unit.test.ts:15–46,49ff` pins the visible Skip action, the bound dismissal outcome, and continuation for OAuth and API connections. `P/agent-plugins/src/connect/connect-card-ui.ts:84–98` renders it. |
| 576 / J-LOCK-OWNER | READY-FOR-CODEX | Base U6 already guards a known live local PID. `P/platform/src/fs/file-lock.ts:110–114,144–146` can still evict a fully identified foreign owner from age alone because its liveness is unknown. |
| 579 / T-ANALYTICS-HOOKS | READY-FOR-CODEX | Full-consent forwarding already fails closed. The plugin `beforeIngest` hook enters the beacon binding unconditionally through `R/analytics-providers.ts:82`. |
| 579 / T-ANALYTICS-CONSENT | READY-FOR-CODEX | Off mode still admits anonymous-capable vendor collectors at `site-cookie-consent.ts:149–160` and directly emits declared analytics scripts at `:271,283`. |
| 614 | RETIRE | `A/site-section-availability.hooks.ts:95–99,200–207` requires the server flag and redirects with it off. `A/__tests__/unit/app-sites-section-visibility.unit.test.tsx:313–328` pins the web-admin case. The guard survives `tv-z2`. |
| B02-R | READY-FOR-CODEX | The second stop came from the remaining barrel edge. The `tv-b2` symbol inventory shows every caller already points directly to the registry. Delete the export as part of the redesigned sheet. |
| M5-T-SPLIT | READY-FOR-CODEX | A verbatim extraction gives the routing changes a function budget. |
| M5-T | READY-FOR-CODEX | The site-only cull remains open after `tv-rs3`. Follow the split and the consent fix, which shares its file and test. |
| hygiene-a | OWNED-ELSEWHERE hygiene-a | Active cloud cull. |
| hygiene-b | OWNED-ELSEWHERE hygiene-b | Active cloud cull. |
| practice | OWNED-ELSEWHERE practice | Active cloud cull. |
| launch-44-41 | OWNED-ELSEWHERE `jy-*`, `tv-y1`, `tv-y2` | Existing execution lanes. |
| ACP-3/4/5 | OWNED-ELSEWHERE ACP redo | Existing redo lane. |
| RT-J3 | OWNED-ELSEWHERE RT-J3 | Existing lane. |
| Tier-2 class tokens | PARKED | Later per screen. |
| todos L | PARKED | Owner hold. |
| 424 UI functions over 50 lines | PARKED | Tabled by the owner. |
| fn50 / c6fix sizing | OWNED-ELSEWHERE fn50 / c6fix | Existing lanes. |
| coverage | OWNED-ELSEWHERE coverage | Existing lane. |
| mutation-testing program | OWNED-ELSEWHERE mutation testing | The mutations below are individual regression witnesses. |
| Held error files | OWNED-ELSEWHERE `ex-err-jini` | Prescribed diff reports 89 files. None of the Jini sheets edits one of them. |

## Common job brief

Copy this block into each job.

> Preserve behavior except for the named fix. Put the failing witness first. Apply `(required, optional = {})` to new public functions, with framework-dictated signatures exempt. Keep functions at most 50 lines and complexity at most 10. Record files over 500 lines in root `COMMIT-PLAN.md` and continue. Keep hooks injected as props, vendor code in provider packages, and server frameworks outside Jini domain code. New Jini code carries no Tovu names. Use no re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`.
>
> Edit only the named files and declarations. Move statements and why-comments verbatim in existing order. Add only named helpers, ports, options, tests, and mutations. Keep the diff minimal. Re-read the diff and list removed extraneous changes in `COMMIT-PLAN.md`.
>
> Stop the affected sheet for a missing declaration, an unlisted production importer, a required cast, or a function limit violation. Use `git grep -n -F '<symbol>' -- apps/ development/ packages/` for importer checks. Record unlisted test importers needing only the same repoint in `REFRESH.md`. Continue independent sheets.
>
> Keep `.git` read-only. Use no other repository-wide scans, codebase-memory-mcp, tests, builds, installs, type checks, or linters. Record base, touched files, red witnesses, cloud mutations, debt, look owed, deletions, and stop reasons in root `COMMIT-PLAN.md`. Cloud runs verification. Lockfiles, new dependencies, and new packages go to Opus Cloud.

Unlisted accounting is zero. An in-place edit retains its existing import lines. New and changed imports are identified below.

## Jini sheets

### J-401 · Jini merge-6 · 1.2k tokens

- **Test first.** In `P/daemon/src/http/__tests__/tool-execution-rpc.test.ts:366–375`, require an unauthenticated 401 and zero executor calls using the existing raw helper. Send JSON headers declaring the large body and omit the body argument. Keep the authenticated request with the actual body as the 413 control. The original flaky red is `write ECONNRESET`. Mutation moves authentication after the body read. The unauthenticated status assertion or existing deadline must fail.
- **Edit.** At `:370`, use `headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }`. The helper at `:335–349` already ends the request. Only the test changes. No import or export changes.
- **STOP** if the combined harness drains the unauthenticated request before replying or the helper no longer passes explicit headers.

### J-EMBED · Jini merge-6 · 2.4k tokens

- **Test first.** Add `P/chat/src/embed-widget/react/__tests__/embed-surfaces.test.tsx`. Use the real `ChatPane`, an open session with the existing minimal widget inputs, and `import { fakeChatSurfaces } from '../../../react/__tests__/fake-chat-surfaces.js';`. Mount into a supplied DOM element, assert the real composer and the dialog render, and verify unmount empties the element. Render the same widget via direct React under the existing provider and assert the composer renders without an added widget prop. Mutation removes the provider from the imperative mount. The real pane must fail to mount.
- **Edit.** In `P/chat/src/embed-widget/react/embed.tsx:62–65`, add required `surfaces: ChatSurfaces` to the existing first bag and render `<ChatSurfacesProvider surfaces={surfaces}><EmbedChatWidget {...widget} /></ChatSurfacesProvider>`. Add `import { ChatSurfacesProvider, type ChatSurfaces } from '../../react/surfaces.js';` and use that line in the real test too, with `../../../react/surfaces.js` as its relative path. The new test imports `import { EmbedChatWidget, mountEmbedChat } from '../embed.js';`.
- **Importer.** The only source caller found is the mocked composition test at `react/__tests__/embed.test.tsx:94`. Retain `import { EmbedChatWidget, mountEmbedChat } from '../embed.js';`, add the same `fakeChatSurfaces` import as above, and change the call to `mountEmbedChat({ element, widget, surfaces: fakeChatSurfaces() })`. The existing `./react/embed` export entry stays in place. Update the checked API signature for that entry if combine tracks declarations. **API break:** imperative callers must supply `surfaces`. Chrome owes open, close, and unmount.
- **STOP** if the real embed requires another host port to render its existing embed variant, or any production importer is discovered.

### J-LOCK-OWNER · Jini merge-6 · 2.5k tokens

- **Test first.** In `P/platform/src/fs/__tests__/file-lock.agent-plugins.test.ts:188–209`, extend U7 to cover an aged, fully parseable foreign holder in both adapters. Reuse the deterministic elapsed-time and sleep pattern from U6 at `:157–185`, with finite `staleMs`. Assert timeout, matching bytes, zero local liveness probes, and zero critical-section calls. Keep U3/U4 as the proven-dead controls and U6 as the live-local control. Mutation restores the age-only decision for an identified owner with unknown liveness. The aged foreign case must fail.
- **Edit.** In private `stale` at `P/platform/src/fs/file-lock.ts:144–146`, return false first when `unchanged(observed, current)` fails. Compute `const alive = ownerAlive(current, s);`. Return false when `current.holder !== undefined && alive !== false`. Pass `ownerAlive: alive` to the existing `isLockStale` call, keeping its other arguments. Both removal paths already call this function at `:207,266`. Age recovery continues for an unidentified record such as an empty lock.
- **Existing age witness.** In `P/platform/src/fs/__tests__/file-lock.test.ts:141–165`, use literal `"unidentified-holder"` as `holderBytes` so refreshing the mtime between inspections still exercises the age branch. Retain the inode, bytes, timeout, and read-count assertions. Change the existing description of the fixture to match. Mutation drops the unchanged check and must still fail this test. The lifecycle copy of U6 at `P/agent-plugins/src/lifecycle/__tests__/unit/exclusive-file-lock.unit.test.ts:145–164` already asserts the correct outcome. No import, export, or API row changes.
- **STOP** if a pushed successor already changes recognized-owner eviction, or the regression requires adjusting liveness probes or recovery for partial records. This sheet interprets proof of death as applying to fully identified holders.

## Tovu sheets

### T-B05 · after `tv-z4` and `tv-rs3` · 0.9k tokens

- **Test first.** Use the existing red placement case at `R/site-deps/__tests__/identity-settings.characterization.unit.test.ts:18–23`. Mutation restores the old source and function target.
- **Edit.** At `:8` use `const DEPS = new URL("../boot-phases.ts", import.meta.url);`. At `:18–19` name and inspect `composeSiteServicesPhase`. Keep the assertion that `composeSitePluginRuntime` immediately precedes the call. Retain the `tv-rs3` assertions at `:27–28`, including `startPersistentSiteSettings` declaration order. Only the test changes.
- **STOP** if `R/site-deps/boot-phases.ts:90–92` has a different phase or predecessor.

### T-IMPORT-ABORT · merge-6, after `tv-po` and `tv-xd5-publish` for the import fixture chain · 1.9k tokens

- **Test first.** In `W/features/site-backup/__tests__/integration/import-creates-new-site.integration.test.ts:91–128`, change the saved-key abort rejection predicate to require `error === abort`. In the collision case require `error instanceof Error`, `error.name === "InternalError"`, and the existing `initSite: failed while creating …: EEXIST` pattern. Keep the stage and allocation removal, failed row, source-site assertions, and non-abort notice case at `:133ff`. Mutation removes the abort pass-through.
- **Edit.** In `W/platform/site-dir/init-site.ts:116–133`, add `if (err instanceof Error && err.name === "AbortError") throw err;` immediately after successful cleanup and before current error classification. Keep the existing cleanup-error branch and the outer-DB cleanup at `:145–147`. This preserves the original cancellation object through the import backend’s existing rollback and rethrow.
- **Importers.** `cleanupAndRethrow` is called locally at `:147` and imported by `platform/site-dir/__tests__/integration/init-site-branches.integration.test.ts:12`. `duplicate-site.ts:10` imports the shared `cleanupFailedSite`. Existing imports remain. The neighboring saved-keys round-trip suite exercises notices and excluded keys, so cancellation coverage stays in the fixture that actually throws `AbortError`.
- **STOP** if the combined wrapper has moved, abort escapes before cleanup, or cleanup failure would be lost. Cloud verifies the existing desktop cancellation path.

### B02-R · after `tv-b2` and `tv-rs3` · 3.2k tokens

- **Witnesses first.** Reuse `W/assistant/__tests__/declared-tool-keywords.contract.test.ts:36–37`, `W/cli/__tests__/unit/deploy-config-command.unit.test.ts:125`, `W/features/deployments/deploy-ops/__tests__/registry.test.ts:138,207`, and `W/server/inbound/assistant/__tests__/assistant-runtime-guidance.unit.test.ts:202–204`. The cull witnesses are optional vocabulary, fallback target help, continued credential creation, active route availability, and a denied failed capability probe. Restore each original catch for its error-ledger mutation.
- **Delete the barrel edge.** Delete exactly `export { loadDeployOpsRegistry } from "./deploy-ops/registry.js";` at `W/features/deployments/index.ts:91`. The following is the complete checked `tv-b2` inventory of actual callers of this declaration. Their final import lines are already direct.

  | Importer under `W` | Exact line to retain |
  |---|---|
  | `server/runtime/composition/site-deps/route-deps-publish-credentials.ts:23` | `import { loadDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";` |
  | `__tests__/fixtures/site-layout-context.ts:8` | `import { loadDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";` |
  | `server/__tests__/unit/bundled-agent-plugins-dir-callers.unit.test.ts:13` | `import { loadDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";` |
  | `features/deployments/deploy-ops/__tests__/installed-deploy-verb.test.ts:13` | `import { loadDeployOpsRegistry } from "../registry.js";` |
  | `features/deployments/deploy-ops/__tests__/registry.test.ts:99,157,213,229` | `const { loadDeployOpsRegistry } = await import("../registry.js");` |

- **Carry the exact culled error edits.** In `W/assistant/tool-search-keywords.ts:27–36`, bind `const listSources = optional.sources;`, return the existing keywords if absent, and set `const sources = orFallbackSync({ work: () => listSources({ ...required, filename: 'plugin.json' }), fallback: [], step: 'List tool keyword manifests' });`. Wrap the original per-source body with `orFallbackSync`, `undefined`, and `'Read tool keyword manifest'`. In `W/cli/commands/deploy-config.ts:80–84`, wrap the existing help computation with `orFallbackSync`, `undefined`, and `'Read deployment target help'`, then use lazy `?? formatTargetOptionHelp({ ids: [] })`. In `W/features/custom-credentials/tool-registrations.ts:295–305`, individually await `orFallback` around each original loop with `undefined` and the steps `'Read hosting credential choices'` and `'Read source-control credential choices'`. In `W/features/deployments/deploy-ops/registry.ts:58–64,91–94`, use `orFallbackSync` around bundled parse with `[]` and `'Read bundled deployment operations'`; use awaited `orFallback` around `readTrustedPluginFile` with `""` and `'Read inactive deployment operations'`. In `W/server/inbound/assistant/assistant-runtime-guidance.ts:153–165`, return `orFallback` around the existing probe with `false` and `'Probe assistant Chrome capability'`.
- **Imports and debt.** Use exact named imports from `@jini-ai/core/errors/idioms`, `orFallbackSync` in keyword search and deploy help, `orFallback` in credentials and runtime guidance, and both in the registry. Keep other callers on the same declarations. Expected `catch-reads-error` shrink is B169 −2, B172 −1, B199 −2, B203 −2, C392 −1. Cloud supplies the already-planned core artifact if required.
- **STOP** if anyone imports the deleted symbol through the barrel on the combined base, if parsing enters the inactive file-read fallback, or if a fallback swallows a primary action.

### T-ANALYTICS-HOOKS · Tovu merge-6 · 2.8k tokens

- **Test first.** Extend `W/server/inbound/public-http/routes/site/__tests__/analytics-ingest.test.ts:36,349` using its actual route fixture. With a denying gate, assert 204, one accepted first-party hit, and zero plugin hook calls. With an allowing gate, assert the hook runs. Extend the policy-off case in `R/__tests__/analytics-providers.unit.test.ts:128–165` to exercise the new gate with an actual Express request presenting a previously issued choice. Assert false after the existing policy flips off. Mutations bypass hook suppression in the route and return true from the composed gate.
- **Edit.** Add `vendorHooksAllowed?: (required: { request: Request }) => Promise<boolean>` to `AnalyticsIngestRouteDeps<Request>` at `W/features/analytics/jini-adapters.ts:39–48`. Name `skipHooks?: boolean` in `createAnalyticsIngestBinding`’s existing options at `:64–69` and read `const hooks = optional.skipHooks ? undefined : host.hooks;`. In `R/analytics-providers.ts:66–83`, return `Pick<AnalyticsIngestRouteDeps<Request>, "forwarders" | "hooks" | "vendorHooksAllowed">` and bind `vendorHooksAllowed` to the existing `readSiteVisitorConsent` check for `analyticsLevel === 'full'`. In `W/server/inbound/public-http/routes/site/analytics-ingest.ts:109–111`, pass `skipHooks: (await deps.vendorHooksAllowed?.({ request: req })) === false` to the existing binding. An absent port preserves explicit hook behavior for other callers.
- **Importers.** `R/http-app/visitor-submit.ts:9,61` already spreads the composed fields. `W/features/analytics/index.ts:64` already exports the type and binding. The adapter tests at `features/analytics/__tests__/jini-adapters{.unit,}.test.ts:4` keep their local imports. No package entry changes.
- **STOP** if a gate failure can prevent first-party ingest or suppression would require a second consent owner.

### T-ANALYTICS-CONSENT · Tovu merge-6 · 2.8k tokens

- **Test first.** In `W/server/inbound/public-http/middleware/__tests__/site-cookie-consent.test.ts:254–288`, require 403 and zero vendor calls for both ways to disable the banner, including when the request presents a previous choice cookie. Keep the anonymous state assertion and the independent full-consent control at `:361–375`. In `declared-consent.unit.test.ts:95–107,553–573`, assert that off-mode managed and authored-static construction omit an analytics-labeled declaration and its export asset, while retaining ordinary and functional scripts. Mutations restore anonymous collector admission and direct emission of analytics declarations.
- **Edit.** In `site-cookie-consent.ts:155–158`, use `if (!state.allowed[category]) return denied;`. Anonymous state already sets `allowed.analytics` to false. In the same file name one private predicate `runsWithConsentOff({ script }: { script: DeclaredScript })` returning `!script.consent?.includes('analytics')`. Use it in both off-mode branches at `:271,283` and the off-mode export projection at `:304–308`. Preserve enabled-policy rendering, non-analytics declarations, and first-party state. Update the existing collector rationale at `:146–148` to match the gate.
- **Imports and look.** The edits use the existing `DeclaredScript` type and the existing middleware imports in both tests. No external or package API change. Chrome owes a previously consenting tab after policy is turned off.
- **STOP** if the combined host uses anonymous mode for a separate enabled-policy vendor flow, or if enforcing the setting requires rewriting arbitrary authored HTML. The script change applies to declared analytics scripts.

### M5-T-SPLIT · after `tv-rs3` · 1.2k tokens

- **Witness first.** Reuse `R/__tests__/browser-analytics-http.unit.test.ts:10–48`. Mutation omits the limiter or origin refusal and must fail the existing case.
- **Edit.** In `R/browser-analytics-http.ts:25–35`, move the existing try body `:26–34` verbatim into private async `dispatchBrowserAnalyticsHttp({ request, response, deps, surface, limiter })`. Use the existing `Request`, `Response`, `RouteDeps`, `'site' | 'admin'`, and `ReturnType<typeof createRateLimiter>` types. Replace the try body with an awaited call. Leave surface rejection, cache header, catch, and raw-parser mount where they are. The inner function receives the later M5 routing. Existing importers at `R/http-app/public-middleware.ts:25` and `R/__tests__/browser-analytics-http.unit.test.ts:8` retain their import statements.
- **STOP** if statement order, middleware fall-through, the 502 boundary, or limiter identity changes.

### M5-T · after M5-T-SPLIT and T-ANALYTICS-CONSENT · 6.8k tokens

The normative edit is the site-only `M5-T` cull and its collector-source excerpt in `origin/plan/culls-1120:cull-outputs/j-tv-rs3-DRAFT.md`. Apply it to the extracted dispatch body.

- **Tests first.** Extend `R/__tests__/browser-analytics-http.unit.test.ts:10–48` for default-off, missing metrics capability, successful full consent, anonymous and withdrawn consent, foreign origin, rate exhaustion, non-POST, media type, 256-byte limit, malformed data, extra keys, strings, and bounds. Assert zero metrics for every refusal. Extend `W/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts` using its managed `/assets` fixture at `:31,69–80` and static construction fixtures at `:553–582`, including the live loader at `site-cookie-consent.ts:342–365`. Check bridge presence when enabled and omission when off or exporting. Add `R/__tests__/browser-diagnostics.unit.test.ts` against the returned module for one buffered navigation, error codes 1 and 2, and disposal. Mutations bypass enablement or admission, accept an extra key, emit navigation twice, or mount the bridge unconditionally.
- **Receiver.** At the moved `R/browser-analytics-http.ts:26–34`, exact `/site/diagnostics` takes the special path and skips vendor lookup. Any method other than POST returns 404. Share `collectionAllowed` and the limiter with the existing vendor dispatch. Supply `deliver` with `http: { path: '/_jini/browser-analytics/site', handle: input => receiveBrowserDiagnostics(input, { deps }) }`. Add `import { receiveBrowserDiagnostics } from './browser-diagnostics.js';`.
- **Host.** Create `R/browser-diagnostics.ts` with exactly four exports, `browserDiagnosticsEnabled`, `receiveBrowserDiagnostics`, `siteBrowserDiagnosticsBridge`, and `siteBrowserDiagnosticsModule`. Use `import { getEffective } from '@jini-ai/core/settings';`, `import { orFallback, orFallbackSync } from '@jini-ai/core/errors/idioms';`, and `import { TELEMETRY_CONSENT } from './telemetry-consent.js';` for the named cull operations. Enable only on `supportsMetric === true` and a request-time setting value of `true`. Failed reads deny. Use 404, 415, 413, 400, and 204 as specified by the cull. Accept exactly one key, finite `0 < navigationMs <= 600_000` or `errorKind` of 1 or 2. Use `deps.observability.metric` with fixed site labels and metrics `browser.navigation.duration`, `browser.error`, and `browser.unhandled_rejection`. Keep the collector source private. The returned module installs once on full consent via `api.subscribe` and immediate `api.get()`, sends same-origin JSON with the installation abort signal and handled fetch rejection, and disposes the observer and listeners on withdrawal or unmount.
- **Public wiring.** In `site-cookie-consent.ts:264,290,447`, extend the existing narrow dependency shape with optional `settingsRepo`, `workspaceId`, and `observability` for diagnostics. At `:447–450` add the bridge to the existing live plugin payload. At `:423–445` serve `/_jini/browser-analytics/site/diagnostics.js` with `private, no-store` after the enable check. Add `import { browserDiagnosticsEnabled, siteBrowserDiagnosticsBridge, siteBrowserDiagnosticsModule } from '../../../runtime/composition/browser-diagnostics.js';`. The new collector test imports `import { siteBrowserDiagnosticsModule } from '../browser-diagnostics.js';`. The existing site-consent and public middleware imports remain.
- **Look and STOP.** Chrome owes managed pages, live authored-static pages, and both site-chat boots. Check zero listeners, observers, and requests before admission, collection after admission, and disposal on withdrawal. STOP if the current effective consent subscription or site metrics port is unavailable, if a second consent store is needed, or if the contribution would have to enter `deps.browserAnalytics`. M5-J is dropped by the cull. This is a Tovu-only job.

## Batch order

Each proposed job has one branch. The only shared-file sequence is the intentional M5 predecessor across jobs.

| Order | Branch | Base and sheet order | Executor tokens |
|---|---|---|---:|
| 1 | `codex/bugs2-jini` | Jini merge-6. `J-401 → J-EMBED → J-LOCK-OWNER`. Hold for three more file-disjoint sheets. | 6.1k |
| 2 | `codex/bugs2-tovu` | Tovu merge-6 incorporating `tv-z4`, `tv-rs3`, `tv-b2`, `tv-po`, and `tv-xd5-publish`. `T-B05 → T-IMPORT-ABORT → B02-R → T-ANALYTICS-HOOKS → T-ANALYTICS-CONSENT → M5-T-SPLIT`. | 12.8k |
| 3 | `codex/bugs2-tovu-m5` | After `codex/bugs2-tovu`, specifically its consent and split sheets. `M5-T`. Hold for five more file-disjoint sheets. | 6.8k |

## Partial

**155:** `W/assistant/__tests__/tool-approval-policy.test.ts:75–87` pins approval before `theme_set_active`. The remaining gap is before the first edit. `W/features/theme/file-mutation-tools.ts:29–69` passes only tool input and the prepared file state into the direct chain. `P/core/src/tool-registry.ts:172–179` supplies no trusted redesign-intent field, and `P/core/src/approval-batch-chain.ts:69–101` has no approval phase for the chain. `tv-xd5-publish:7167a14396` changes the file adapters and retains this distinction. The missing design input is an existing trusted carrier that identifies both the redesign and the original theme. The red witness should send the same write through an ordinary edit and a reference-led redesign, then prove that refusal leaves the original bytes and active theme intact. A blanket card for ordinary existing-file edits would exceed the coordinator’s decision.
