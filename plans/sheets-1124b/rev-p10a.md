REVISED r62t-rev-p10a: 6 SOL sheets (3 Jini / 3 Tovu), 10 OPUS sheets

Merge‑21 anchors checked against Tovu `7c87b3c3f9` and Jini `010c8cd874`. No files changed. No tests, audits, builds, installs, or type-checks ran during this revision. The test and mutation instructions below are for the builders.

`W/` means Tovu `apps/website/src/`, `A/` means Tovu `apps/admin/src/`, and `J/` means Jini `packages/`.

### Status and dispatch boundaries

- **O1, O2, O4, S1–S6 are partly done.** The sheets below cover the verified remainder, not an exhaustive audit inventory. The old `1 missing + 27 empty` translation count is not a current edit list. CLI agent-run usage plumbing remains unsheeted until its canonical usage source is verified.
- **O3 is done already and stays off by default.** The shipped vendor-neutral diagnostics bridge (`J/diagnostics/src/browser-diagnostics.ts:23–30,56–99`, mounted at `W/server/inbound/public-http/middleware/site-cookie-consent.ts:445–457`) requires explicit host enablement, metric admission and visitor consent. It installs nothing before consent and tears down on revocation. It is deliberately narrower than the plan’s provider-plugins `ObservabilityPort` adapter, reporting only one buffered navigation entry and error codes. No parallel browser adapter sheet.
- **S6 already has RowMenu keyboard and focus coverage** at `J/admin/src/react/components/RowMenu/__tests__/RowMenu.test.tsx:128–181`. The palette still lacks opener restoration. All references under `J/ui/src/renderers/`, including `SrcDocSandbox.tsx:23`, are already commit-qualified. The remaining dangling references are the `archived UI source map` matches under `J/ui/src/` and the Cloudflare assets comment identified in S6.J.
- **S7 is not sheeted.** Knip and duplication measurement are separate post-P9 work. No DNS history-window or other uncorroborated audit candidate is dispatched. No owner decision or owner-default tag is needed. The O2 counter retains `tool.id` and adds `kind`.

Build each change test-first, observe the failure, run the named mutation and restore it. Keep `_optional = {}` pads, why-comments, and wire shapes unless the sheet specifies a change. Use required hooks and injected implementation ports. Keep functions at most 80 lines and complexity at most 10. Do not add re-export shells, vendor or server-framework dependencies, or routes. Themes stay in Tovu. The 11/24 planner marks publish, deploy, import, newsletter and identity anchors as moving. Apply the changes once at the surviving owner after the corresponding handoff.

## Jini SOL

### P10-O2.J — Counter labels, drainer gauge and agent-run usage contract

**BUILDER: SOL** · Repo Jini · Before O2.T

- **Tool counter.** Change `J/daemon/src/tool-recovery/observability.ts:20–22,57–65,93–107`. Keep `withToolCallObservability(required, optional = {})` and existing span and incident behavior. Replace the `failed` metric argument with `failureKind?: "internal" | "input" | "refused"` in `recordToolCallMetrics(required, _optional = {})`. Increment exactly once for each classified case. Failed/validation or thrown `ToolInputError` → `input`. Denied or confirmation-denied → `refused`. Timeout, failed/internal or unexpected throw → `internal`. Completed and cancelled do not increment `tool.failures`. Its attributes are `{ "tool.id": toolId, kind }`, using the existing safe tool label. Leave `tool.calls` and its attributes unchanged. Update the comment at `:20` to say refusals count under `kind: "refused"` but are not failed spans or incidents.
- **Queue gauge.** Add `queueMetrics?: { readDepth(required: Record<string, never>, _optional?: Record<string, never>): Promise<number>; metric: ObservabilityPort["metric"] }` to the existing optional object of `startOutboxDrainer(required, optional = {})` at `J/infra/src/events/outbox/drainer.ts:109–123`. Use `import type` from `@jini-ai/core/contracts/observability` for `ObservabilityPort`. Infra already depends on core (`J/infra/package.json:72`). Wrap its callback as `async () => { const claimed = await processOutbox(required, policy); sampleQueueDepth(...); return claimed; }`. Make the sample fire-and-forget with `void`, guard it with an `inFlight` boolean local to that loop, and clear the guard in `finally`. Wrap both `readDepth({})` and `queueMetrics.metric({ name: "outbox.queue_depth", value }, { kind: "gauge" })` in one swallowing `try/catch`. No labels. A missing port, rejected read or failed metric must not affect settlement, cadence, `stop()` or the worker’s error sink. The claim count is not queue depth. Tovu supplies the durable read in O2.T.
- **Run outcome.** Add `usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number }` to `AgentRunTrackingOutcome` at `J/core/src/contracts/observability.ts:39`. In `J/provider-plugins/src/observability-opentelemetry/otel-port.ts:180–183`, use private `agentUsageAttributes({ usage }, _optional = {})`. Emit finite nonnegative integer token counts as `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens`, and finite nonnegative reported cost as `gen_ai.usage.cost_usd`. Preserve reported zero and omit absent or invalid fields. Do not estimate pricing. Keep the facade passing the typed outcome through.

**Tests first.**

- `J/daemon/src/tool-recovery/__tests__/observability.test.ts` — `records exactly one classified counter per non-canceled tool failure`. Cover settled and thrown cases. Update both existing counter expectations (`:95–97` and `:108–111`) to retain `tool.id` and assert the corresponding `kind`. Replace the “only timed-out increments” expectation with one increment each for timeout, denied and confirmation-denied. The denial cases must still have `failed: false` and no incident. Mutation `refused-as-internal`.
- `J/infra/src/events/outbox/__tests__/drainer-queue-depth.test.ts` (new) — `samples the durable depth after each drain without changing settlement`. Use `fixture()` and `row()` from `__tests__/fixtures.ts`. Start with two pending rows and batch size one. Override `claimPending` to shift one row per call and inject `readDepth: async () => pending.length`. Drive each drain with the fake scheduler and flush with `await vi.advanceTimersByTimeAsync(0)` after each drain. Assert gauge values `[1, 0]`. Also pin that a rejected sample does not prevent the next drain. Mutation `report-claimed-count-as-depth`.
- `J/provider-plugins/src/__tests__/observability-otel-surfaces.test.ts` — `exports only provider-reported usage on the finished agent span`. Assert exact span attributes, including reported zero and absent cost. Mutation `omit-output-token-attribute`.

**Package/API.** No new export paths. Keep `@jini-ai/daemon/tool-recovery`, `@jini-ai/infra/events/outbox`, `@jini-ai/core/contracts/observability`, and `@jini-ai/provider-plugins/observability-opentelemetry/port`. Add `.changeset/p10-o2-observability-metrics.md` with additive contract bumps for core and infra and behavior entries for daemon and provider-plugins. Refresh affected API baselines only. Preserve why-comments explaining the fixed labels, durable depth versus claimed count, and unreported versus zero usage.

### P10-S3.J — Pass a per-call abort signal to media transport

**BUILDER: SOL** · Repo Jini · Before S3.T-MEDIA

- In `J/integrations/src/media-providers/dispatch/types.ts:148`, change the engine interface to `optional?: OptionalArgs<MediaGenerationRequest> & { signal?: AbortSignal }`. In `engine.ts:141–149`, use the same type on `generate(required, optional = {})`. Build the vendor request with `const { signal, ...optionalRequest } = optional; const request = { ...required, ...optionalRequest };`. Call `signal?.throwIfAborted()` before `assertRequestShape`. In the `engineRenderContext` call pass `guardedFetch: signal === undefined ? boundGuardedFetch : bindMediaCallSignal({ guardedFetch: boundGuardedFetch, signal })`.
- Add private `bindMediaCallSignal({ guardedFetch, signal }: { guardedFetch: MediaGuardedFetch; signal: AbortSignal }, _optional = {}): MediaGuardedFetch`. Its returned function is `async (required, options) => { signal.throwIfAborted(); return guardedFetch(required, { ...options, signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal }); }`. The spread preserves `totalDeadlineMs` and `redirect`. The existing guarded transport already accepts a signal (`outbound.ts:17–20,48–63`). No replacement client or credential move.

**Test first.** In `J/integrations/src/media-providers/dispatch/__tests__/engine.test.ts`, add `media generation forwards caller abort to an in-flight guarded request and skips dispatch when already stopped`. Use the `createMediaDispatchEngine — injected guarded fetch` fixture at `:509–525`, with `createVendorAdapterRegistry()`, an OpenAI/image test adapter and `clientFixture()`. Register a renderer that calls `ctx.guardedFetch` with a vendor signal and deadline. Inject a `vi.fn` guarded fetch that records `options.signal` and resolves a 200. Assert the recorded signal aborts when the caller aborts, that the existing deadline and redirect options survive, and that a pre-aborted call makes zero fetch calls. Mutation `drop-caller-signal-from-guarded-fetch`.

**Package/API.** Keep existing `@jini-ai/integrations/media-providers` exports. Add `.changeset/p10-s3-media-call-signal.md` and refresh `api-baseline/jini-ai__integrations.json`. Why-comment that a run’s Stop signal can shorten the vendor deadline, never extend or replace it.

### P10-S2.J-MFA — Record MFA login without saving a stale user snapshot

**BUILDER: SOL** · Repo Jini · Independent of identity CAS

At `J/user-management/src/server/mfa/service.ts:71`, keep the existing session guard and replace the whole-row save with `await deps.auth.repos.users.recordLogin({ workspaceId: userRow.workspaceId, principalId: userRow.principalId, lastLoginAt: result.session.createdAt });`. At `:111`, make the same replacement using `user.workspaceId` and `user.principalId`. The port is already injected, as used at `J/user-management/src/server/auth-service.ts:154` and `server/mfa/passkey-service.ts:126`. Do not modify authorization, session issuance or recovery-code consumption.

**Test first.** Add `J/user-management/src/server/mfa/__tests__/login-record-race.test.ts` — `TOTP and recovery login update lastLoginAt without restoring the old password hash`. Use the fixture pattern from `J/user-management/src/server/__tests__/owner-mfa.test.ts:14–51`. Simulate a password reset between lookup and bookkeeping. For each successful completion, assert that the completion never calls `users.save`, calls `recordLogin` once with the matching workspace, principal and session timestamp, and leaves the newer hash intact. Keep reset/setup writes outside the spy window. Mutation `mfa-saves-stale-user-row` re-adds `save({ ...user, lastLoginAt })` instead of field bookkeeping.

No public signature or export changes. Why-comment that MFA completion owns only `lastLoginAt`.

## Tovu SOL

### P10-S1.T — Finish paging the newsletter tool and make visitor result bounds explicit

**BUILDER: SOL** · Repo Tovu · Apply the newsletter half after its extraction owner clears the file

- **Newsletter send log.** Change `W/features/newsletter/agent-tools.ts:121–130` and `W/features/newsletter/tool-registrations.ts:351–361,536`. Use `createNewsletterListSendLogHandler({ deps }: { deps: NewsletterToolDeps }, _optional = {}): ToolHandler`. At `:536`, call `createNewsletterListSendLogHandler({ deps })`. Add `decodeListCursor` and `pageFromOverfetch` to the existing `@jini-ai/core/list-page` import at `:1` (exports at `J/core/src/list-page.ts:65,124`). Remove `DEFAULT_LIST_LIMIT` at `:64` if unused. Copy `limit` and `cursor` into `inputSchema.properties` from the subscriptions schema at `agent-tools.ts:115–118`, adapting the limit description to send rows. At `:122–123`, tell callers to supply the previous `nextCursor` and stop on `null`, instead of only saying `truncated: true` means more rows exist. Keep campaign authorization and existence checks ahead of the read, along with the existing projection, PII gate and wire keys. Do not change the repo contract, pump or mounted route. After authorization and existence checks use:

  ```ts
  const { limit, cursor } = parseListPageRequest(
    { value: input },
    { defaultLimit: 100, maxLimit: 100 },
  );
  const after = cursor != null ? decodeListCursor({ cursor, shape: ["string"] }) : null;
  const afterId = after ? String(after[0]) : undefined;
  const rows = await deps.newsletterSendRepo.listByCampaign({
    workspaceId: deps.workspaceId,
    campaignId,
    afterId,
    limit: limit + 1,
  });
  const page = pageFromOverfetch({ rows, limit, positionOf: (row) => [row.id] });
  const { items, ...continuation } = listPageForModel({
    page,
    toolId: "newsletter_list_send_log",
  });
  return {
    sends: items.map(toSendLogToolView),
    ...continuation,
    truncated: continuation.nextCursor !== null,
  };
  ```

- **Visitor search.** Change `W/assistant/site/tools.ts:171–210,255–263`. Keep `search_published_entries(input: { query?: unknown }, _optional = {})`. Return `{ entries, truncated, more? }`. When truncated, `more` is `Showing N of M matching published entries. Narrow the search to see a different set.` `M` is the count **after** public-access and query filtering, never the count of hidden rows. Keep the current cap, ordering, and input schema. Update the descriptor copy to explain the new field. No rework of public route specs or visitor permissions.

**Tests first.**

- `W/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts` — `newsletter_list_send_log returns all 101 campaign rows across two pages without duplicates`. First 100, cursor, remaining row, null cursor. Include a row from another campaign that never appears. Mutation `send-log-query-without-overfetch`.
- `W/assistant/site/__tests__/tools.test.ts` — `search_published_entries says showing 20 of 101 and never counts hidden entries`. Also pin no `more` for a complete result. Mutation `report-unfiltered-total`.

No Jini API change. Why-comments should say that one extra row proves continuation and that an anonymous count must use the same visibility decision as returned rows. The saved-key picker, members and newsletter HTTP routes are not edits on this sheet. No publish-history or DNS contract work is dispatched here.

### P10-S3.T-MEDIA — Stop before paid media generation

**BUILDER: SOL** · Repo Tovu · After S3.J is available

Change `W/features/media-generation/tool-registrations.ts:120–127,156–171,456–465`. On `generateMedia?`, keep the first object for `request`, `credentials`, and the existing engine options. Change its second parameter to `optional?: { signal?: AbortSignal }`. In `defaultGenerateMedia(required, optional: { signal?: AbortSignal } = {})`, end with:

```ts
return engine.generate(
  { surface, model },
  { ...optionalRequest, ...(optional.signal ? { signal: optional.signal } : {}) },
);
```

Immediately before `const generate = routeDeps.generateMedia ?? defaultGenerateMedia`, insert `ctx.signal.throwIfAborted()`. Call `generate` with the unchanged first object and `{ signal: ctx.signal }` as the second. Keep the separate check at `:355` before the first local write. Do not add a cancellation check halfway through `uploadMedia` or change credential policy.

**Test first.** `W/features/media-generation/__tests__/tool-registrations.test.ts` — `Stop while resolving an image credential starts no paid call and saves nothing`. Defer credential resolution, abort, release the credential wait, and assert no generator or storage call. Add a subcase where a live injected generator observes the same signal on Stop. Mutations `remove-post-credential-abort-check` and `drop-signal-to-generator`.

Why-comment that waiting on credentials opens a fresh cancellation window and that a started multi-write storage sequence must not be interrupted halfway through.

### P10-S4.T — Fix the replacement audit and normalize confirmed nonliteral sites

**BUILDER: SOL** · Repo Tovu

Change `development/scripts/bug-class-audit.mjs:529–568`. Keep the syntax-only walk. Report a two-argument `.replace` or `.replaceAll` whose replacement is a nonliteral expression not established as a callable replacer. Keep direct string and no-substitution template literals, inline callbacks, unambiguously resolved local function declarations, and `const` callback bindings out of the report. Mere same-file name membership is not proof when a nearer binding shadows it. Delete `consts`, `cannotHaveDollar`, `NUMERIC_NAME` and the textual `$$$$` exemption. Update the check-6 header at `:74–79` and limits sentence at `:677` to describe the remaining literal and proven-callback exclusions, with findings described as candidates, not confirmed bugs. Do not convert methods on non-string receivers, known function replacers, or intentional literal capture substitutions.

Limit production edits to `A/features/themes/theme-preview-refresh.ts:46–49` and `A/features/themes/ThemeExplore.tsx:467`. Use callback replacements without changing the existing escaping or numeric formatting. Evaluate a computed replacement once outside the callback if it can have side effects or be used with `replaceAll`. No signature changes. Neither site is itself a user-visible corruption repro.

**Tests first.** Add `development/scripts/__tests__/bug-class-audit-replace.test.mjs` — `flags a nonliteral replacement named count but not a literal capture string or a callback`. Follow `development/scripts/__tests__/hygiene-audit-translation-entry.test.mjs:10–24`. Create the temporary fixture repo with the same `node_modules` symlink, `git init`, and `git add` for the fixture source under `apps/admin/src/` because the audit reads `git ls-files`. Invoke `node development/scripts/bug-class-audit.mjs --repo tovu=<fixture> --out <out>`. Assert exact rows in `<out>/replace-dollar-expansion.tsv` (`CHECKS` at `:620`). Positive cases are `function f(count: string) { return s.replace("x", count); }` and `s.replaceAll("x", opts.count)`. Literal `"$1"` and callbacks must not produce rows. Mutation `restore-numeric-name-exemption` re-adds the identifier/property `NUMERIC_NAME` branch and suppresses both expected rows.

Reuse the existing `$&` runtime witness in `W/features/site-backup/__tests__/share-file-policy.unit.test.ts:51–55` unchanged. Mutation `use-path-as-replacement-string` at `share-file-policy.ts:101`. Extend `A/features/themes/__tests__/theme-preview-refresh.unit.test.tsx` to pin encoded `"$&"` in the pathname and literal `"$&"` in the decoded query. Why-comment that `$&` and `$1` are instructions only in a replacement string and that a callback returns literal data.

## OPUS

### P10-O1.J — Inject the deploy observation at the real execution owner

**BUILDER: OPUS** · Repo Jini · Outcome classification and overlap with deploy extraction

Change `J/devops/src/deploy/ops-tool-contracts.ts:45–76` and `J/devops/src/deploy/ops-runner.ts:192–208`. Add optional `observeDeploy` to the existing `DeployOpsRuntime` object with signature `observeDeploy(required: { providerId?: string; work: () => Promise<DeployOpsDeployResult> }, _optional?: Record<string, never>): Promise<DeployOpsDeployResult>`. Keep `runDeploy(required, optional = {})`. Move its existing body verbatim into private `executeDeploy(required, optional = {})` so the wrapper stays under 80 lines. Invoke the hook once at `runDeploy` entry around all of `executeDeploy`, including the pre-abort and observe-only throws. Without a hook, invoke `work` once. Pass raw `input.platform` as `providerId` to the host. This is user text, not a telemetry label. O1.T maps it to a recognized ID or `"unknown"`.

The registered tool calls the Jini runner directly at `J/devops/src/deploy/ops-tools.ts:23–26,81–90`. Instrumenting only the similarly named Tovu wrapper misses it. Do not instrument status, logs, wait, list targets or secret operations. Leave dispatch acceptance and history behavior unchanged.

**Test first.** Add `J/devops/src/deploy/__tests__/deploy-observation.test.ts` — `the registered deploy invokes one injected observation and one dispatch`. Build a fake `DeployOpsRuntime` and `DeployOpsRegistrationHost` and enter through `buildDeployOpsRegistrations` and its deploy registration, exercising the actual `deployHandler`. Use `J/devops/src/deploy/__tests__/platform-bindings.ts:5` as the test host’s reachability fixture where needed. It is not a complete runtime fixture. For the runtime and registration shape use the foreign-port `wire()` fixture in `W/features/deployments/deploy-ops/__tests__/extract-s9-deploy-ports.test.ts` as a reference, adding the deploy descriptor locally in Jini. Pin normalized `started:false` as a normal return, accepted history unchanged, and observation of pre-abort and observe-only throws without dispatch. Mutation `bypass-observer-in-registered-deploy`.

**Package/API.** No new export path. Add `.changeset/p10-o1-deploy-observation-port.md` and refresh `api-baseline/jini-ai__devops.json` for the additive `@jini-ai/devops/deploy` hook. Why-comment that the operation follows dispatch acceptance, not remote deployment completion.

### P10-O1.T — Bind publish, deploy and import to P4’s operation boundary

**BUILDER: OPUS** · Repo Tovu · After O1.J, the P4 release and reporter composition, and overlapping extraction

Create a host binding `observeFeatureOperation<T>(required: { deps: { observability: Pick<ObservabilityPort, "trackOperation">; reporter: ErrorReporter }; operation: "content.publish" | "site.deploy" | "site.import"; scope: string; step: string; fallback: { message: string; action: string }; work: () => Promise<T> }, optional: { attributes?: OperationAttributes; classifyResult?: (required: { value: T }, _optional?: Record<string, never>) => "completed" | "failed" | "refused" } = {}): Promise<T>` in `W/server/runtime/composition/feature-operation.ts`. Inject bound callbacks at the existing feature inputs, not a new global or new reporter.

Use P4’s `runOperation` once. Its current implementation treats every resolved result as `completed`. For a known returned refusal or recorded failure, decorate **the same** injected operation tracker’s `end` to substitute the classified outcome and failure flag. Do not open a second tracker or turn a returned refusal into a throw. Re-throw the original thrown domain error at a legacy boundary that still owns response mapping, and verify that the existing boundary does not report it again. If P4 has not supplied that deduplication, hold rollout at that boundary. Telemetry must not change a return value, exception, or dispatch attempt.

- **Publish** — `W/features/publish-content/publish-tool.ts:67–98`, `tool-deps.ts:44`, `tool-registrations.ts:366`. Change only the boundary and its injected dependency. Use `publishContentFromTool(required: { deps: PublishContentToolDeps; principalId: string }, input: Record<string, unknown> = {})`. Label `destination.kind = "peer"`. Begin before criteria and destination resolution. Keep no-selection an ordinary no-op result. Classify policy, input and remote publish refusals through known refusal bindings, never error text.
- **Deploy** — `W/features/deployments/deploy-ops/run-ops.ts:19,100` and the `bindDeployOpsRuntime` consumed at `tool-registrations.ts:57–60`. Inject O1.J’s `observeDeploy`. Export only a provider ID recognized by the composed registry, else `"unknown"`. Never record target, ref, workflow, credential label, URL or reply body. Resolved `started:false` is `refused`, `started:true` is `completed`; thrown failures go through the existing refusal/incident classifier.
- **Import** — `W/features/site-backup/import-backend.ts:40–49,151–170,210–216` and `W/server/runtime/composition/site-import-backend.ts:23–48`. Bind the new operation around `importBackup` admission, including parsing and the exclusive check. Source kind is only `"upload"`, `"url"` or `"unknown"` if not recognized. Keep `site.import.verify` and `site.import.restore` as their existing stage diagnostics. Recorded `status:"failed"` is failed, and a replay returning a recorded view never starts a second download. Do not move stage writes, password handling, cleanup or restore ordering.

**Tests first.** Add `W/features/publish-content/__tests__/publish-tool.operation.test.ts` — `one operation per publish with outcome completed, failed or refused` (mutation `open-a-second-publish-tracker`). Extend `W/features/deployments/deploy-ops/__tests__/deploy.test.ts` — `registered deploy tracks a returned refusal without exporting target or credential text` (mutation `label-the-raw-target`). Extend `W/features/site-backup/__tests__/import-backend.unit.test.ts` — `import admission tracks a refused source once without exporting its URL` (mutation `start-import-trace-after-admission`). Include byte-equivalent results and one underlying call in each witness. Why-comment that instrumentation observes an established effect boundary without taking over its error or retry policy.

### P10-S3.T — Stop BYOK when the response closes during turn setup

**BUILDER: OPUS** · Repo Tovu · BYOK lifecycle only

Change `W/server/runtime/composition/modules/assistant-byok.ts`, `handleTurn` at `:723–796`. Add private `watchByokResponseClose({ res }: { res: Response }, _optional = {}): { abort: AbortController; dispose: () => void }`. Bind it before `resolveTurnInputsOrRespond`, account for an already destroyed response, and detach in a surrounding `finally` on every exit. On disconnect, return before starting a stream, allocating a live-tool-run entry, preparing further plugin work or calling the provider. Recheck after credentials, readiness, federation, prompt and plugin guidance. If the response closes during plugin guidance after stream start, stop before provider dispatch and run the existing cleanup. Use the same controller for provider and tool options. Keep explicit Stop handling and existing live-run cleanup. Extract setup into small helpers if needed. Do not change the shared federation boot’s lifetime or credential policy.

**Test first.** Add `W/server/runtime/composition/modules/__tests__/assistant-byok.early-disconnect.test.ts` — `closing during federation starts no paid BYOK turn`. Use a deferred fake federation and the route harness. Close before federation resolves, then release it. Assert no provider call, no stream headers and no surviving live-run entry. Parameterize the same witness over the credential wait. Mutation `attach-close-after-federation`. Run the lifecycle tests to prove cleanup and existing Stop behavior.

Why-comment that awaiting turn preparation opens a cancellation window before the stream exists.

### P10-O2.T — Supply real queue depth and reported run usage

**BUILDER: OPUS** · Repo Tovu · After O2.J · Agent usage needs source-semantics verification

- **Queue depth.** In `W/platform/db/sqlite/outbox-repo.sqlite.ts:6,45–52`, add a host read `readOutboxQueueDepth({ store, workspaceId }: { store: ContentKernel; workspaceId: string }, _optional = {}): Promise<number>`. On `OUTBOX_TABLES.outboxEvents`, count current `pending` and `processing` rows, including delayed retries, excluding `delivered` and terminal `failed`. Use the workspace predicate and an aggregate, not row materialization. `W/server/runtime/composition/site-deps/events-origin.ts:25–36` binds the read. `serving-app.ts:87–90` passes it and the existing `supportsMetric`/metric port through `W/contracts/core/events/outbox-drainer.ts:54–60` to O2.J. No gauge if the host has no read or metric admission. Do not label workspace, event, URL or payload. No schema change.
- **Usage.** The producing seams are `W/server/runtime/composition/modules/assistant-byok.ts:310–321,814–845` and `assistant-ag-ui.ts:266–290`. Jini’s `normalizeAiUsage` is at `J/core/src/contracts/ai-trace/usage.ts:39–53`. Keep one accumulator per span. Accept only normalized input/output and explicitly reported USD values, preserving known zero and keeping unknown absent. For BYOK, sum recognized usage **deltas** from the existing `onEvent`; do not derive a price. For CLI, verify which daemon frames contain deltas versus cumulative totals before binding. The AG-UI drain at `J/chat/src/core/ag-ui/event-projection.ts:266–299` currently returns only status/error. If the frame reader has no existing observer, add an injected neutral usage observer in a paired Jini change under O2.J’s API intent after the AG-UI owner clears it. Do not deserialize a second copy of the stream, double-count replayed frames, or add the same usage to the finalizer’s separate watcher span at `W/server/runtime/composition/modules/run-finalizer/entry.ts:228–240`. CLI runtime wiring is **NOT-SHEETED** beyond these anchors until a canonical usage source is verified.

**Tests first.** Add a dialect witness beside the existing outbox DB tests — `outbox queue depth counts live work in this workspace but not terminal rows`, mutation `count-terminal-rows`. Add `W/server/runtime/composition/modules/__tests__/assistant-byok-run-usage.test.ts` — `the run span sums provider usage deltas and does not invent cost`, mutation `replace-running-total-with-last-delta`. The CLI witness, once anchored, is `a replayed daemon usage frame does not inflate the run span`. Why-comment that delayed retries remain queue load and that telemetry observes reported use, not guesses.

### P10-O4.J — Add the durable outbox correlation seam

**BUILDER: OPUS** · Repo Jini · Durable metadata, failure isolation and transaction ordering

- Add `traceparent?: string` to `OperationSpanOptions` at `J/core/src/contracts/site/diagnostics-observability.ts:38`. Forward it at `J/diagnostics/src/observability/tracker.ts:32–38`. OTel already accepts the structural parent at `J/provider-plugins/src/observability-opentelemetry/otel-port.ts:143–145`. Do not add another SDK-specific API.
- Extend `trackOutboxDelivery(required: { bus: DeliveryBus; tracker: Tracker }, optional: { readParent?: (required: { event: DomainEvent }, _optional?: Record<string, never>) => string | undefined } = {})` at `J/infra/src/events/domain-outbox.ts:81–88`. Read the injected parent at delivery and pass it in trace options, never attributes. Keep subscriber invocation and errors exactly as before.
- At `J/db/src/events/outbox-repo.sql.ts:88,103–105` and `J/db/src/events/change-set-repo.sql.ts:57–85`, add an optional `prepareOutboxEvent?: (required: { event: DomainEvent }, _optional?: Record<string, never>) => DomainEvent` to both constructors’ existing options. Invoke immediately before serializing through `outboxEventValues`. Keep it in the existing write, including the co-persisted path. Do not enqueue again, change `ON CONFLICT`, or edit SQL/migrations. Preserve the original event on preparation failure. The host owns how context is obtained and what may be persisted.

**Tests first.** Extend `J/db/src/events/__tests__/{outbox,change-set}.sql.repo.dialects.test.ts` — `producer context survives durable enqueue without modifying the original envelope`, mutations `omit-direct-event-preparation` and `omit-co-persisted-event-preparation` respectively. Add `J/infra/src/events/outbox/__tests__/delivery-parent.test.ts` — `delivery passes the persisted parent in trace options and runs the subscriber once`, mutation `drop-delivery-traceparent`. Assert a failed delivery still retries using the same persisted context.

**Package/API.** No new export paths. Existing core tracker contract, `@jini-ai/diagnostics/observability`, `@jini-ai/db/events` and `@jini-ai/infra/events/domain-outbox`. Add `.changeset/p10-o4-outbox-parent.md` and refresh affected API baselines. Why-comment that async delivery cannot inherit request-local state and must not change when the transaction commits.

### P10-O4.T — Prove request-to-worker trace ancestry

**BUILDER: OPUS** · Repo Tovu · Land the witness first, then use O4.J if red

**Test first.** Extend `W/server/__tests__/integration/serving-app-outbox-drain.integration.test.ts:31–51` — `a background taxonomy subscriber span is a descendant of the producing request trace`. Use the real authenticated taxonomy route, a recording trace adapter and a durable temporary store. Wait for the request’s tracker to end before allowing the worker to deliver. Assert the worker operation has the producing span as parent and the subscriber’s child span belongs to that trace. Do not assert that two span names appeared and call it correlation. Add a legacy event with no context and prove ordinary delivery. Mutation `omit-persisted-parent-on-delivery`.

**Fix if red.** In `W/server/runtime/composition/site-deps/events-origin.ts:25–36` and the `SqliteChangeSetRepo` bindings in `site-deps/content-stores.ts:29` and `site-deps/route-deps-site-providers.ts:107`, inject the same late-read capture of `observability.activeTraceparent`. Thread the optional callback through `W/platform/db/sqlite/{outbox-repo,change-set-repo}.sqlite.ts:45,43`. Use `prepareOutboxEvent({ event }, _optional = {})` to write one host-owned reserved metadata value into a copy of the envelope, replacing rather than trusting a pre-existing value. Admit only a valid version-00 W3C traceparent with nonzero trace and span IDs. Persist no baggage, cookies, auth or arbitrary request headers. At `W/contracts/core/events/outbox-drainer.ts:54–60`, inject the parent reader, and keep the reserved transport value out of business payloads and outward webhook data. Check the co-persisted adapter with a command-path witness as well as the direct taxonomy enqueue. Leave scheduling, claims, retry, transaction boundaries and legacy rows unchanged. No migration. Why-comment that inherited timer context is neither durable nor attributable to the correct request.

### P10-S2.J — Add identity editor versions and compare-and-swap

**BUILDER: OPUS** · Repo Jini · Auth and permission-bearing records · After S1 and identity-lane handoff

- **Contracts and memory.** No versioned identity write path exists on merge‑21. Add `version: number` to `UserRecord`, `RoleRecord` and `PolicyRecord` at `J/core/src/contracts/site/user-management.ts:53,84,98` and `J/user-management/src/core/types.ts:58,89,103`. Add `save(record, { expectedVersion })` to the three repo ports in the shared contracts (`:165,188,201`) and `J/user-management/src/core/ports.ts:48,75,88`, retaining the optional compatibility object and its default on implementations. Implement versioned writes in `J/user-management/src/server/repo.memory.ts` for users, roles and policies, using the `assertVersionedWrite` implementation from `@jini-ai/core/optimistic-concurrency` (`J/core/src/optimistic-concurrency.ts:119`) through a bound `AssertVersionedWritePort`. Follow the members/webhooks CAS behavior, with SQL parity in S2.T. Keep create and seed separate from edits. Emit `version` on editable read models without emitting credential fields.
- **Service.** In `J/user-management/src/server/admin-crud-service.ts:387–455`, add `{ expectedVersion?: number }` to `updateRole` and add `expectedVersion` alongside `name` and `description` in `updatePolicy`’s existing optional object. Apply the same rule to user **profile** edits at `users.save(updated)` at `:213`. Use the caller’s basis, never replace a supplied basis with a fresh server read. Credential reset is an intentional, separate write. Do not route it through profile save or write back login bookkeeping. MFA bookkeeping is dispatched separately as S2.J-MFA.
- **HTTP and tools.** In `J/user-management/src/admin-http/routes/users/{update-role,update-policy,update-user}.ts`, accept a valid optional HTTP basis, reject malformed input, and map stale writes to `409 VERSION_CONFLICT`. Keep the existing `defineJsonRoute` specs and host authorization ports. At `J/user-management/src/server/agent-tools.ts:303` and `agent-tool-registrations.ts:592–605`, require the read basis for `identity_policy_update` and return the version from its read/list view. Apply the same rule to any identity editor tool that actually replaces an editable record. Preserve built-in and frozen refusals and ordinary legacy-client compatibility. Do not turn attachment, seed or revoke operations into edits.

**Tests first.** Add `J/user-management/src/server/__tests__/identity-edit-version.test.ts` — `two identity editors from one version cannot both save`, with role, policy and user profile fixtures. Pin malformed HTTP basis, stale HTTP basis and missing tool basis with the error naming the read tool. Mutations `substitute-fresh-server-version` and `drop-tool-basis-required`. Why-comment that a server read after the person opens the editor is not their basis.

**Package/API.** No new export-map keys. Add `.changeset/p10-s2-identity-edit-versions.md` for core contracts and user-management. Refresh both API baselines. If the identity extraction lands first, apply to the moved owner once, not to a resurrected host implementation.

### P10-S2.T — Enforce identity CAS in SQL and send loaded versions from admin

**BUILDER: OPUS** · Repo Tovu · After S2.J · No migration required

- **SQL and binding.** The merge‑21 mappers, constructors and saves are in `W/features/identity/repo.ts:99–113,152–176` and `repo.authorization.ts:11–18,54–62,75–88,125–135`. Map the existing `version`. Require `assertVersionedWrite: AssertVersionedWritePort` in the constructor args object for `SqlUserRepo`, `SqlRoleRepo` and `SqlPolicyRepo`. Forward it through `W/features/identity/repo.sqlite.ts:41–62`. Bind the core implementation at the identity composition site, `createSqliteIdentityRouteDeps` in `W/features/identity/wiring.ts:370,405–408`. Update direct constructor fixtures to pass the same port. Model the required injection on `J/integrations/src/webhooks/sql/webhook-repo.ts:62,142–145`. The conflict helper is Jini core’s `assertVersionedWrite`, not a pre-existing Tovu identity implementation.
- **Writes.** Implement `save(record, optional: { expectedVersion?: number } = {}): Promise<void>` on each owning repo. Keep the insert-new path for seed/create distinct from the versioned update at all three former upserts. For versioned edits, use a single `UPDATE` in the existing identity transaction discipline, scoped by workspace, ID or principal, and exact expected version. Write only editable fields and `version = version + 1`. On zero changed rows invoke the injected conflict helper. Never fall back to inserting or unconditionally rewriting a stale row. A profile save must not rewrite `password_hash` or `last_login_at`. Keep `recordLogin` field-specific and retain dedicated reset and revocation behavior. Migration `W/platform/db/migrations/0042_optimistic_concurrency_versions.ts:17–29` already defines `version integer NOT NULL DEFAULT 1` for `identity_users`, `roles` and `policies`. ADR‑066 is satisfied. Do not change `0042`, its checksums or snapshots.
- **Admin.** `A/features/roles/hooks/roles-dependencies.hooks.ts:24–27` forwards to the existing adapters, with Jini submission at `J/user-management/src/admin/controllers/roles.controller.ts:251,274`. Coordinate with S2.J and the admin lane so the loaded row version traverses the existing args. Do not add a host-only identity controller. Preserve typed form values on 409, offer reload and never automatically resubmit.

**Tests first.** Extend `W/features/identity/__tests__/repo.contract.test.ts` — `the second edit from the same version is refused and the first edit remains`. Run in SQLite and PGlite for role, policy and profile, and assert the old login/password snapshot cannot overwrite a newer field. Mutation `drop-version-where`. Add a host admin binding witness — `identity saves the loaded basis and preserves the draft on conflict`, mutation `omit-loaded-version-from-save`. Why-comment that the conditional `WHERE` is the lock and independent bookkeeping is not part of an editor snapshot.

### P10-S5.T — Reconcile the translation audit against the current dictionary owners

**BUILDER: OPUS** · Repo Tovu for the audit and host witness · Exact A106 dictionary edits **NOT-SHEETED**

The named ChatFab dictionaries are already translated. Do not retranslate them or move their ownership. For A106, `development/scripts/hygiene-audit.mjs:142–185,237–273` identifies blank literals/null/undefined, array gaps and missing keys, with common/same-file fallback guesses. Its old count is not an edit list. The builder should generate a fresh `i18n-missing-keys.tsv` for both merge-21 trees, then check each candidate against the **effective translator and exact UI slot**. Explicitly account for same-file fallback false negatives, short locale override tables, intentionally blank sentence fragments and moved dictionaries. Only dispatch a copy edit after naming the live key, locale, file and caller. A generic dictionary fix belongs to the moved Jini owner. Do not change a Tovu host binding to hide a missing Jini translation.

**Witness first.** At `apps/site-chat/src/__tests__/site-chat-i18n.test.ts`, add `Hindi, Urdu and Bangla launcher and panel keys resolve without an empty or English fallback`. Use `createSiteChatI18n({ document }, {})` for each language and assert the localized launcher text plus nonblank values for the public dictionary keys. Mutation `blank-urdu-launcher-label`. This is a green-on-base regression pin until mutated, not proof of a new bug. For each current audit finding, put the failing assertion in the owning feature’s dictionary test before changing copy. Use `restore-empty-locale-value` as the mutation for that key. No export or API change for the host witness. Why-comment that key presence alone does not prove the rendered label is nonblank.

### P10-S6.J — Restore command palette focus and repair dangling provenance comments

**BUILDER: OPUS** · Repo Jini

- **Focus.** Change `J/ui/src/features/command-palette/react/components/CommandPalette.hooks.ts:4–14` and `CommandPalette.tsx:7–17,32–44`. Keep `useCommandPaletteView({ cursor }: { cursor: number }, _optional = {})`. On input attachment, remember the previous focus from the input’s `ownerDocument` before focusing the input. On detach, restore the connected opener when the palette still owns focus or removal left focus on `body`. Do not steal focus from a different element the host deliberately focused. Verify the behavior with the running React/jsdom test, including commit-time ref-detach ordering. Retain active-row scrolling and the existing keyboard reducer. No new modal, global keybinding or Tab policy. RowMenu stays unchanged.
- **Required hooks.** Use `CommandPalette(required: CommandPaletteProps, _optional = {})`. Make `useWiredCommandPalette`, `useTHook` and `useCommandPaletteViewHook` required props, with type-only references and no local default implementations. Update `CommandPalette.test.tsx` and `CommandPalette.dismiss.test.tsx` in the same directory, the only in-tree palette mounts found. Inject the real wired/view hooks and the intended translator in each fixture, retaining deliberate translator overrides. No Tovu admin mount was found. Expose the real view hook from the existing command-palette barrel beside the wired hook.
- **Provenance.** Replace dangling `archived UI source map` references without deleting the reasons they document. Find the complete edit list with `git grep -n -F 'archived UI source map' HEAD -- packages/ui/src`. It includes `CommandPalette.tsx:28` and `J/ui/src/react/components/{ToggleRow.tsx:5,OptionCards.tsx:5,StatCard.tsx:4}`. At the palette comment cite `070311a07^:packages/ui/source-map.md`, section `features/command-palette/`. Use the corresponding sections for the other matches. Confirm that historical revision and the referenced sections in a full Jini clone before writing the links. The path and palette section resolved in the supplied Jini clone, but the Opus check’s shallow worktree could not resolve the commit. At `J/agent-plugins/cloudflare/lib/assets.mjs:11`, remove the dead `source-map.md` pointer and keep the native/WASM rationale at `:4`. The package has `NOTES.md`, not a source map. Leave all already-qualified references under `J/ui/src/renderers/`, including `SrcDocSandbox.tsx:23`, and the live `J/devops/source-map.md` references unchanged.

**Tests first.** Add to `J/ui/src/features/command-palette/react/components/CommandPalette.dismiss.test.tsx` — `arrows move the active option and Escape returns focus to the opener`. Open from a focused button, assert the input has focus, assert ArrowDown/ArrowUp changes `aria-selected`, press Escape, assert the palette closes, and assert focus returns to the same button. Also verify that deliberate host focus elsewhere is not reclaimed. Mutation `omit-opener-focus-on-detach`. Keep RowMenu’s existing witness unchanged.

**Package/API.** No new export-map key. Add `useCommandPaletteView` through `J/ui/src/features/command-palette/index.ts`, which the UI root already exports. Add `.changeset/p10-s6-command-palette-focus.md` and refresh `api-baseline/jini-ai__ui.json`. Flag the now-required hook props as a consumer change. Why-comment that focus must be captured before it moves and must not be reclaimed after the host has taken it elsewhere.
