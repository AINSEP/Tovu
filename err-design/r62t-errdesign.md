## 1. Verdict — ADJUST

Keep Jini’s distinction between an expected refusal and an unexpected incident. Make the existing HTTP, IPC, tool, and job boundaries use the Jini reporter, and give each failure one owner that records it and assigns its ID. Fix the reporter’s disclosure and tracker behavior before wiring it broadly. The code already has the right pieces. The problem is that several live paths still decide independently what to show, what to log, and which ID to give the user. Replacing exceptions or introducing another framework would leave those ownership decisions in place.

## 2. What works and what needs to change

**Keep scoped error bindings, operation-specific wording, and the existing response formats.** A feature can map an error class to a code in its own scope, while the catalog supplies the sentence and status for that code. That preserves feature knowledge without teaching the HTTP adapter about every domain. The disclosure code gives anonymous callers the incident ID and checks both authorization and the operation before showing an approved cause. Putting the ID in the message also lets it survive a client that rebuilds an `Error` from text. See Jini `packages/core/src/errors/catalog.ts:172–193`, `disclosure.ts:33–59`, `approved-cause.ts:23–39`, and `reporter.ts:204–211`.

**There are several live ways to handle failure today.** `describeError` in a UI action produces copy. `describeErrorForLog` produces a safe class/code label. The reporter classifies and records incidents. The idioms preserve local behavior such as waiting for a queue or falling back on an optional probe. Those are useful distinct jobs. The overlap is in the production paths that independently turn a failure into a report or a user-visible error:

| Surface | What the code does today |
|---|---|
| Jini admin and UI | The transport uses a sentinel for undecodable JSON and can emit `request failed (status)`. Form pagination stores `e.message`. `useAsyncAction` delegates wording to a callback. The TanStack mutation adapter already uses `observed` and returns the original promise to callers. `packages/admin/src/core/transport/http.ts:120–168`, `packages/admin/src/forms/react/hooks/use-form-submissions.hooks.ts:126–145`, `packages/ui/src/features/panel-kit/hooks/use-async-action.hooks.ts:22–35`, `packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx:181–188`. |
| Jini HTTP and daemon | `http-kit` has a real exception boundary, but its legacy helper mints a UUID and calls a separate sink. The tool decorator already reports through `ObservabilityPort`, so adding reporter calls above it would create two reporting opportunities. The host-tool PATH probe treats every access error as a miss. `packages/http-kit/src/adapter.ts:114–146`, `packages/http-kit/src/internal-error.ts:33–55`, `packages/daemon/src/tool-recovery/observability.ts:89–105`, `packages/daemon/src/http/host-tools.ts:126–148`. |
| Jini CMS and jobs | Form attachment cleanup replaces the original exception with a retryable `FormDeliveryError`, losing the cause. Form submission compensation keeps the original failure and logs cleanup failures separately. The outbox gate’s `.catch(() => {})` has a distinct purpose because `settleWithin` still receives the same promise. `packages/cms/src/forms/attachment-cleanup.ts:39–55`, `packages/cms/src/forms/submit-service.ts:249–284`, `packages/infra/src/events/outbox/worker.ts:361–366`. |
| Tovu website, admin, and desktop | Consent save has its own reporting guard and safe 503 wording. A website AG-UI catch sends `error.message` directly to the browser. Admin export falls back to the caught value as Copy details’ cause, while download preflight already uses narrow `orFallback` calls. Desktop version handling delegates to Jini, where the renderer loader stores the rejection’s message. `apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:95–110`, `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts:298–306`, `apps/admin/src/features/sites/site-export-error.ts:14–21`, `apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts:95–109`, `apps/desktop/src/renderer/use-app-version.hooks.ts:16–22`, Jini `packages/desktop-host/src/app-version/loader.ts:42–51`. |

**Fix three issues before making the reporter the default.**

- **Carry the next step to every audience.** `describe` requires `fallback.action`, yet the main incident message contains only `fallback.message` and the ID. Anonymous callers get no details block, so they can lose the next step entirely. Also constrain caller-facing `own-message`, sentence parameters, and `ClientFacingError` to explicitly approved public content. The current reporter forwards `own-message` and `ClientFacingError.apiError` directly, and refusal parameters use host redaction without the per-call `exactSecrets`. Keep the contract’s model-specific reason policy confined to the model adapter. Jini `packages/core/src/errors/reporter.ts:164–211`, `catalog.ts:111–115`, `disclosure.ts:46–59`. Disclosure contract `error-disclosure-contract.md:5–21`.
- **Use the existing observability port.** `trackOperation` owns the outcome and timing. `reportError` receives the incident once, ideally inside that scope. The reporter currently sends a synthetic `Error` and omits `exactSecrets` from the tracker handoff. Apply the approved ER-6 handoff to the original error and exact secrets inside the process, with label and ID at third-party export. Ensure the operator sink redacts before persisting the raw error it receives. Reusing an ID in `describe` still writes another record, so downstream adapters should forward the completed incident. Jini `packages/core/src/contracts/observability.ts:41–60,81–83`, `packages/core/src/errors/reporter.ts:114–160,196–211`. Disclosure contract `error-disclosure-contract.md:20–27`.
- **Delete duplicate reporting as each boundary switches.** Remove the UUID-and-sink body of Jini’s `reportRouteInternalError` and Tovu’s `reportServerFailure`, along with caller guards made redundant by the shared path. Keep thin serializers for existing statuses and envelopes, and keep one feature notice owner in the browser. Retire raw `error.message` and ad hoc Copy details builders from migrated paths. Keep safe log labels, compensation catches, and named fallback idioms. Jini `packages/http-kit/src/internal-error.ts:33–65`. Tovu `apps/website/src/server/inbound/shared/admin-failure.ts:53–78`, `apps/admin/src/lib/admin-failure-channel.ts:128–145,167–178`.

## 3. Alternatives considered

| Candidate | Judgment |
|---|---|
| **Result/Either throughout** | Keep the existing route `Result` for expected outcomes. A repo-wide conversion would churn signatures and callers, while rejected promises and third-party exceptions would still need boundaries. Jini’s HTTP adapter already handles both a returned `Result` and a thrown exception. `packages/http-kit/src/adapter.ts:63–77,95–109`. |
| **One boundary per transport** | Adopt this through existing entries. HTTP owns status and the response envelope, IPC preserves rejection semantics, the tool executor owns its incident, and React’s feature action or query owns async presentation. Keep local catches for retry, compensation, and genuine fallback. This gives future agents a specific place to put each decision. |
| **Typed classes plus one global mapper** | Keep existing typed domain errors and scoped bindings. A global class match would make shared classes choose one feature’s code or wording. A new class hierarchy adds migration work while scope and disclosure still need to be decided. |
| **An established library** | Keep TanStack Query where it already owns request and mutation state. It can replace duplicate loading and error state in those features. Disclosure, incident records, and IPC still belong to the existing application boundaries. `packages/ui/src/features/panel-kit/fetch-query/adapter.tanstack.tsx:181–188`. |
| **Lint instead of a ledger** | The gate already runs ESLint. Keep the ledger temporarily for adoption, fail CI on growth, then retire each clean package’s baseline. A referenced variable satisfies rule 1, parse exemptions partly trust method names, and a file/rule count can hide a new finding behind one removal. Review ownership and disclosure on changed sites. Jini `scripts/eslint-rules/errors/catch-reads-error.mjs:52–59,83–95,112–121`. Tovu `development/scripts/check-error-gate.mjs:94–128`. |

## 4. Cheapest path through the debt

The **524** figure is the merge-6 catch-only **O group**, spanning **287 file/rule entries**. Its site census is explicitly partial. At the requested merge-7 refs, the checked-in ledgers sum to **830 catch findings across 447 Jini entries** and **556 across 339 Tovu entries**. Tovu’s 556 split into website **362**, admin **108**, desktop **78**, and site-chat **8**. The other two rules account for **121** Jini and **247** Tovu findings. These are baseline totals. The ledgers store counts by file and rule, so a current semantic breakdown would require classifying the live sites. See `cull-inputs-2/designs/r62t-err-rows.md:29–32,143–178` and the two `error-gate-debt.json` files.

The older classified inventory gives a concrete breakdown for choosing batches. Its counts apply to the design’s `wave-b-r2` snapshot. See `designs/error-system/INDEX.md:19–35` and `SITES.tsv`.

| Shape | Jini | Tovu | Cheapest treatment |
|---|---:|---:|---|
| Pure parse or reviewed validator | 48 | 27 | Keep the narrow refusal. Split I/O from parsing where mixed. |
| Existing promise owner, `observed` / `afterSettled` | 19 / 15 | 20 / 7 | Mechanical once the original promise, its owner, and queue timing are confirmed. |
| Documented fallback, `orFallback` / `orFallbackSync` | 6 | 10 | Mechanical when the catch already treats every failure as the same fallback. Preserve the exact sentinel and laziness. |
| Cleanup or side task that should be visible | 80 | 9 | Use `bestEffort` where the cleanup and injected logger already fit. Review who records the rest. |
| Failed write or notification, false absence, missing ID, or lost cause | 108 | 3 | Review by operation. Preserve retry, fail-closed behavior, drafts, and uncertain outcomes. |

Reconcile live sites by file, function, and catch location. Classify each by the behavior to preserve and who owns the failure. Batch the verified mechanical edits. Migrate the rest through shared boundaries, so a single change removes repeated local handling. The outbox gate above is a direct `observed` candidate. The CMS cleanup that loses the cause needs an ownership decision even though both are catch findings.

## 5. Next steps

1. Fix the website AG-UI raw-message path using safe operation wording and the existing run failure owner.
2. Correct reporter wording, refusal disclosure, and the ER-6 handoff. Cover one anonymous incident, one approved cause, and one tracker export.
3. Wire one existing HTTP boundary to the reporter and remove its duplicate reporting body. Verify both reader directions and one record per incident.
4. Repeat at tool and IPC boundaries, then migrate browser actions through their existing notice owners. Preserve statuses, rejections, drafts, and cached views.
5. Land verified idiom batches and enforce the no-growth gate. Shrink the ledgers from measured findings and retire each baseline when its scope is clean.

Source review used Tovu `8d1a4c2742` and Jini `06559affb8`. No files changed. Counts came from the checked-in ledgers and historical inventory.
