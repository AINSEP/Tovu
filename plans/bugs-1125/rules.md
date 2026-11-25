BUGS code rules/tech debt: 8 sheets, 9 bugs covered, 1 skipped (Source Control ProvidersTab already has required hooks on its extraction branch)

Read-only plan anchored to Tovu `6ace8e8fb2` and Jini `50f8dfcd9`, with extraction overrides below. No files changed and no tests run. Counts cover the seven requested repair areas. Higher-priority security, data-integrity, media, admin UI, and chat findings are excluded. The owner-held theme assertions and CI baseline decisions are untouched.

Write each named test before the fix and record its mutation in the builder’s uncommitted `COMMIT-PLAN.md`. Stop the individual sheet if its post-extraction anchor does not match. Move code and why-comments verbatim, preserve effect order, pass dependencies at the existing seams, and use `(required, _optional = {})` for new functions. Keep changed functions at or below 80 lines and complexity 10 without widening existing refactors. No schema migrations or theme changes are needed.

## 1. Media settings hook contract

**Bug** `ui-media-tab-hook-optional` · **BUILDER** SOL

**Root cause**  
Jini’s `MediaProvidersTab` can be constructed without `useMediaProvidersTabHook` because its prop is optional and its component supplies the real-hook default. Tovu’s `ExternalProvidersPanel` relies on that default.

**Test first** — In Jini `packages/ui/src/features/media-providers/__tests__/react/components/MediaProvidersTab.test.tsx`, add the type assertion **“requires the media-providers state hook”**. Pin `Pick<MediaProvidersTabProps, "useMediaProvidersTabHook">` to `{ useMediaProvidersTabHook: typeof useMediaProvidersTab }` using `expectTypeOf`. This is a compile-time check, not a runtime Vitest assertion. Mutation `media-providers-hook-optional` restores `?` and fails the type assertion.

**Fix and order**

1. In Jini `packages/ui/src/features/media-providers/react/components/MediaProvidersTab.tsx`, require `useMediaProvidersTabHook: typeof useMediaProvidersTab` and remove its destructuring default. Keep the hook invocation and all other props unchanged. Update the existing Jini renders to pass the real hook explicitly. Record the breaking prop in a UI release changeset.
2. In Tovu `apps/admin/src/features/media/ExternalProvidersPanel.tsx`, import the already-exported `useMediaProvidersTab` from `@jini-ai/ui` and pass it explicitly. Land with the matching Jini UI release. The Jini component and Tovu host panel stay at these paths on the checked extraction refs.

## 2. Access Tokens hook contract

**Bug** `access-tokens-hook-optional` · **BUILDER** SOL

**Root cause**  
`AccessTokensTab` owns the `useWiredOtherCredentials` default. Its production parent, `Security`, therefore does not supply the credential hook.

**Test first** — In `apps/admin/src/features/security/__tests__/AccessTokensTab.credential-flows.unit.test.tsx`, add the type assertion **“requires the other-credentials hook”**. Pin the single picked prop to `{ useOtherCredentialsHook: typeof useWiredOtherCredentials }`. Mutation `other-credentials-hook-optional` restores `?` and fails the type assertion.

**Fix and order** — After `origin/codex/tv-adm-dom2`, edit the same Tovu paths. That branch changes neighboring imports but still owns `apps/admin/src/features/security/AccessTokensTab.tsx` and `Security.tsx`. The similarly named Jini admin tab is not this caller’s destination. Require the named prop in `AccessTokensTabProps`, remove that default, and have `Security.tsx` pass `useWiredOtherCredentials` explicitly. In the existing “default hook resolution” fixture, pass the real other-credentials hook for the `other` case and keep the load-error assertions. Do not change the other hook contracts or per-store error behavior.

**Skipped Source Control ProvidersTab** — Tovu `apps/admin/src/features/source-control/ProvidersTab.tsx` is deleted by `tv-adm-dom2` (`ff47469e0d`). Its destination, Jini `packages/devops/src/source-control/react/ProvidersTab.tsx` on `adm-dom2-j` (`4221d5d79`), already requires both `useSourceControlCredentialsHook` and `useAdminLocaleHook` and has no defaults. The surviving Tovu `source-control-panel.tsx` supplies both. Land that pair and retain its existing host-level load-failure test. Do not patch the deleted leaf.

## 3. Retire the admin failure legacy sink

**Bug** `H2189` / FIX 4 step 3 · **BUILDER** SOL

**Root cause**  
`admin-failure.ts` still permits unbound calls to mint an incident ID and bypass the composed reporter through `reportToLegacySinks`. `sendAdminFailure` masks missing injection by reading untyped `res.locals`, and standalone tests still pin the retired sink.

**Test first** — In `apps/website/src/server/inbound/shared/__tests__/admin-failure.unit.test.ts`, replace the legacy-sink pin with **“a request with no bound reporter cannot reach a legacy console sink”**. A bare response must get the existing private 500 envelope with `UNAVAILABLE_ERROR_ID`, zero console calls, and zero tracker calls. Use the existing fake response and spies. Mutation `restore-unbound-legacy-sink` routes the unbound reporter breach through the retired console/tracker pair and fails the ID and sink assertions. Keep the existing normal reporter, same-error tracker skip, disk-space refusal, and reporter-breach cases.

**Fix and order**

1. Keep the lifecycle in Tovu `apps/website/src/server/inbound/shared/admin-failure.ts`. Reconcile `tv-w3-p4mounts` first. Its diagnostics fixture changes, including `unexpected-route-errors.test.ts` and `analytics-error-envelope.test.ts`, stay in Tovu and already move some cases to injected reporters. Do not repeat the landed site-share, routine store-open, or daemon tool-access reporter bindings.
2. Use the recorded FIX 4 seam `failureReporterOf({ res }, _optional = {})`, returning `Pick<ErrorReporter, "record">`. Check the response-local value at that boundary. When unbound, return the recorded `UNBOUND_FAILURE_REPORTER` whose `record` throws into the existing unavailable-ID path. Do not log or mint another ID there.
3. Make `BoundFailurePorts` the required reporter port with no legacy `tracker` member. Keep `reportServerFailure({ error, operation }, { reporter, errorId?, trackerAlreadyReported? })` with its reporter-bearing second object required. Use `adminFailureResponse({ error, reporter, trackerAlreadyReported? }, options = {})` and `sendAdminFailure({ res, error, reporter }, options = {})`. The latter keeps the existing request-admission check. Delete `reportToLegacySinks`, `mintErrorId`, `adminDiagnostic`, and their now-unused imports. Leave approved copy, status and field selection, disclosure, and existing ID correlation intact.
4. Update direct callers in the Tovu admin route/middleware boundary, public HTTP failure boundaries, and BYOK attachment failure. Pass a reporter already in scope or use `failureReporterOf({ res })` where the host owns it in response locals. Do not remove tracker use for unrelated work. Reconcile standalone fixtures in `unexpected-route-errors.test.ts`, `analytics-error-envelope.test.ts`, `observability-error-report.test.ts`, `import-errors.test.ts`, and `user-facing-failure.test.ts` with the existing recording reporter. Move the failing logger/tracker expectation to the composed reporter rather than discarding the private-envelope assertion. Land before Sheet 4’s BYOK move, which otherwise relocates the attachment call site.

## 4. Split visitor and BYOK assistant composition files

**Bugs** `site-assistant.ts` file cap (no explicit ID in the list), `g5a-byok-file-size` / `H2061` · **BUILDER** SOL

**Root cause**  
On merge-23, the Tovu visitor module is 1,026 physical lines and the BYOK module is 891. Each owns route composition, preflight, and streamed turn execution in one file.

**Test first** — Add `apps/website/src/server/runtime/composition/modules/__tests__/assistant-composition-size.test.ts` with **“visitor and BYOK composition files stay within 500 lines”**. Assert the two roots first, then add the four named destinations to the same assertion when introduced. Mutation `rejoin-assistant-composition` moves the extracted blocks back into their respective roots and trips the limit. Keep `site-chat-stream.golden.test.ts`, `site-chat-stream.ag-ui.golden.test.ts`, and `assistant-byok.inputs-pin.test.ts` as behavior pins. In particular, retain the BYOK validation-before-SSE and close-during-credential-resolution assertions. Do not rebaseline the separately reported automatic-preflight failure.

**Fix and order** — Both roots remain under `apps/website/src/server/runtime/composition/modules/`. On `tv-r2-ext-crp`, `tv-w3-ext-crp`, and `tv-w3-ext-crp2`, the visitor root stays at that path and imports `visitorAnalyticsProvenance` from its extracted Jini analytics path. Keep that import. No move of the BYOK root was found on the checked refs.

- **Visitor.** Keep `createSiteAssistantModule`, `registerSiteAssistantRoutes`, and `handleChat` in `site-assistant.ts`. Move the provider and request gates to `site-assistant-preflight.ts` — `MAX_MESSAGE_CHARS`, `DEFAULT_MODEL`, `resolveModel`, `resolveBaseUrl`, the provider/preflight/guard types, the block from `guardMessageAndRateLimit` through `runSiteAssistantPreflight`, and their why-comments. The root imports `runSiteAssistantPreflight` and `respondPublicError`. Move the SSE/writer block, `SYSTEM_PREAMBLE`, `VISITOR_MAX_OUTPUT_TOKENS`, `SiteAssistantModuleDeps`, `createSiteAssistantContext`, and `handleAdmittedChat` through `runVisitorProviderTurn` to `site-assistant-turn.ts`. Import the existing context, writer, and turn entry points directly. Repoint the provider-decision, env-fallback, and `public-site-guide.test.ts` imports that use moved exports.
- **BYOK.** Keep `createAssistantByokModule`, `byokModuleHandle`, `byokSurfaceOptions`, `lowerLocal`, and `awaitByokCleanup` in `assistant-byok.ts`. Move `ByokTurnInputs`, `resolveTurnInputsOrRespond`, `attachTurnMessagesOrRespond`, `readAttachmentRefs`, the system prompt and federation constants, `resolveByokSystemPrompt`, and `prepareByokTurnSetup` to `assistant-byok-preflight.ts`. Move `ByokTurnContext`, `LiveByokToolRun`, `rememberByokSources`, the wire helpers, usage/outcome and trace helpers, `BYOK_MAX_TOOL_TURNS`, plugin guidance, abort binding, `handleTurn`, `runWatchedByokTurn`, `traceByokTurn`, and `byokProviderTurnOptions` to `assistant-byok-turn.ts`. Use a type-only context import in preflight. Repoint moved exports in `assistant-byok-routes.test.ts`, `assistant-byok.history-and-surfaces.unit.test.ts`, `assistant-byok-turn-outcome.unit.test.ts`, `assistant-byok-usage-timer.unit.test.ts`, and `site-guide-tools.test.ts`.

Preserve existing signatures and call order at the move boundaries. No forwarding exports. Do not move Tovu route wiring, prompts, settings, or credential policy into Jini as part of the split.

## 5. Reject duplicate Jini export keys

**Bug** `O1768` · **BUILDER** SOL

**Root cause**  
Jini’s API gate calls `JSON.parse` before looking at the export map. The second entry silently replaces the first, including in the corresponding `jini.entries` isolation map.

**Test first** — Add Jini `scripts/__tests__/manifest-export-keys.unit.test.ts`, **“rejects repeated export and isolation keys in the raw manifest”**. Use raw JSON with the same subpath repeated in `exports` and `jini.entries`. Assert diagnostics name both maps, the manifest path, and the key. Use a clean control with the same subpath appearing once per map, and `types` and `import` repeated across two distinct export objects. Mutation `parse-manifest-before-duplicate-check` switches enumeration to parsed object keys and loses both errors.

**Fix and order** — In Jini `scripts/lib/package-sources.ts`, add `duplicateManifestExportKeys({ file, source }, _optional = {})` using the existing TypeScript parser dependency and the raw JSON syntax tree. Count direct properties separately in `exports` and `jini.entries`. In `scripts/check-api-surface.ts`, invoke it on the raw manifest before `JSON.parse` and fail on duplicates in both check and update modes. This uses the existing CI API gate.

At Jini merge-23, remove one identical copy in each map for `packages/core/package.json` → `./contracts/site/cms-trash`, `packages/plugins/package.json` → `./runtime/lower-tool-access`, and `packages/ui/package.json` → `./resource-monitor`. Core and plugins already have one copy per map on `w3-r2allj`, `r3-w1aj`, and `r3-w1bj`. After those land, leave their entries intact and edit only UI. Do not change effective export targets or isolation values.

## 6. Stop the routines worker on CLI shutdown

**Bug** combine-23c `routines worker not stopped on SIGTERM/SIGINT` · **BUILDER** SOL

**Root cause**  
Tovu’s CLI adds `serving.routines` to its boot-failure cleanup list, but `installShutdown` builds a separate signal-shutdown list without it. The default `index.ts` entry point already includes it.

**Test first** — In `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`, extend the existing `runServeCommand` signal case as **“SIGTERM and SIGINT stop routines once before storage closes”**. The harness already captures both signal handlers and records a mock `routines.stop`. Require exactly one invocation in the shutdown sequence and keep the existing storage/boot-work ordering assertions. Mutation `omit-routines-from-signal-shutdown` removes only the new worker entry. Do not confuse this with the separate listener-startup-failure case, which already expects routines to stop. Scope the stale BR-07 source assertion to `installShutdown` in `serve-listen.ts` if retaining that assertion.

**Fix and order** — In Tovu `apps/website/src/cli/commands/serve-listen.ts`, destructure `routines` from `serving` in `installShutdown` and place it immediately after `releaseOnShutdown` in the existing `stopServingWithinGrace` worker list, matching `apps/website/src/index.ts`. Keep all existing workers in their relative order. `tv-p411` changes the test file in place, not the production shutdown owner. Jini `packages/server/src/shutdown/close-store-on-shutdown.ts` already dispatches workers and needs no change.

**Packaged check** — On a staging build with routines enabled, start an eligible site via the packaged CLI, observe a routine worker start, then send SIGTERM and SIGINT on separate boots. Confirm the worker’s stop path runs before store close, no subsequent routine dispatch starts, and both exits are clean. Exit status alone does not prove the worker was stopped.

## 7. Make the media-provider expiry test deterministic

**Bug** combine-23c `providers-tools real-clock idleTtlMs 5 flake` · **BUILDER** SOL

**Root cause**  
The test fakes `setTimeout` but the exchange store reads real `Date.now()`. The store checks the idle deadline during send, receive, and delivery, so real elapsed time can expire a 5 ms form before the test advances its timer.

**Test first** — Strengthen **“t10 media expired form closes without saving”** in Tovu `apps/website/src/features/media-generation/__tests__/providers-tools.test.ts`. With timers frozen, make each ambient `Date.now()` read advance by more than 5 ms. The form must still open and remain pending before its controlled deadline, then expire at virtual +5 ms with `saved: false`, no saved credential, and no retained exchange. Mutation `provider-expiry-system-clock` restores `createSystemClock()` at store construction. The forced wall-clock drift makes that mutation fail without depending on machine load.

**Fix and order** — In the existing test `fixture`, create and expose an `exchangeClock` using Tovu’s `createFakeClock` from `apps/website/src/__tests__/support/fake-clock.ts`. Inject it into `createSurfaceExchangeStore` and advance it with mocked timer ticks for the two existing expiry cases, including `L241 expired`. Leave the credential clock, 5 ms TTL, production scheduler, and other outcome assertions unchanged. On `tv-w3-ext-w1x` the test stays in Tovu, but `apps/website/src/features/media-generation/providers-tools.ts` moves to Jini `packages/cms/src/media/site-generation/providers-tools.ts` on `w3-r2allj`. Keep the extraction’s host arguments and imports. Neither production path needs an edit for this flake.

## 8. Wire the committed publish candidate into connect

**Bug** `g6-publish-connect-candidate` · **BUILDER** SOL

**Root cause**  
Tovu’s manifest supplies `findPublishCandidate` to the lazy content-deps projection, while `buildPublishContentRegistrations` captures it from top-level `routeDeps`. Without a URL or an injected override, the registered connect handler therefore uses the null fallback.

**Test first** — In `apps/website/src/features/publish-content/__tests__/publish-trust-provisioning-root.test.ts`, add **“assistant connect without siteUrl uses the committed deploy candidate”**. Let `connectThroughManifest` accept the test input and keep the two existing probes explicit. Register a minimal bundled candidate declaration with `jini-deploy-configs.json`, following the fixture shape in `features/publish-trust/__tests__/candidate-declarations.contract.test.ts`. Put the declared YAML file under the test `TOVU_REPO_ROOT` with `TOVU_PUBLIC_URL: https://example.com`. Invoke the real registered handler with `{}`, with no top-level candidate override. Assert the existing fake handshake receives that origin, the peer is recorded once, and provisioning writes under the repository root, not cwd. Mutation `candidate-only-in-content-projection` drops the new top-level field and restores the false “no live site” result.

**Fix and order** — In Tovu `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`, inside `installPublishingAndPluginTools`, add `findPublishCandidate: deps.findPublishCandidate ?? getFindPublishCandidate()` to the deps passed by the existing `publishContentContributor.build` wrapper, alongside `publishTrustProvisioning`. Keep the existing lazy projection, caller override precedence, and registration order. Do not call the finder at build time. `tv-r3-w1b` changes `features/publish-content/tool-registrations.ts` and the provisioning test in place, but the feature still reads the top-level field. The checked `tv-w2all` and `tv-w3-ext-w1x` manifests also retain the same composition anchor. Jini’s `packages/cms/src/publish/content/agent-tools.ts` owns the tool catalog, not this wiring.

**Packaged check** — Open the packaged desktop app from a cwd outside a staging project with a committed deploy candidate. Invoke `publish_content_connect` without a URL against that staging destination. Confirm it selects the committed origin, records the connection in the project, and does not publish content.
