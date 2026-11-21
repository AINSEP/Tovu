**Two sheets are ready. The HTTP sheet is blocked by the explicit `ex-err-jini` hold.** The held branch touches `packages/http-kit/src/internal-error.ts` and its direct test. Removing only the adapter’s call would leave the duplicate UUID-and-sink body in place.

Anchors use Tovu merge-7 `8d1a4c2742` and Jini merge-7 `06559affb8`. The fetched Tovu merge-7 ref is newer than the requested SHA. The AG-UI module and its route test have the same contents at both. Jini merge-7 still has the synthetic tracker carrier, so the reporter sheet starts with the scoped `jz2-a` delta from `af7df23b6`. No files changed and no tests ran.

## Disposition

| ID | Disposition | Reason |
|---|---|---|
| ERFIX-T1 | READY-FOR-CODEX | The AG-UI read catch at `assistant-ag-ui.ts:302` can use Tovu’s existing server failure owner and preserve the failed run outcome. |
| ERFIX-J2 | READY-FOR-CODEX | The reporter, catalog and existing provider adapters have the seams required for disclosure, ID reuse and ER-6. |
| E4-J-TRACKER carrier | RETIRE | The original-error and `exactSecrets` handoff is implemented on `origin/codex/jz2-a` at `af7df23b6`. Incorporate those hunks in ERFIX-J2. |
| ERFIX-J3 | NEEDS-DECISION | **May `ex-err-jini` hand off `http-kit/src/internal-error.ts` and its direct test to this job?** Recommend yes. Keep the rest of the held branch held and use the acceptance criteria below to finish the single-boundary migration. |
| Held HTTP and protocol files | OWNED-ELSEWHERE `ex-err-jini` | The merge-base diff lists 89 files. Relevant to this round are `http-kit/src/internal-error.ts`, `http-kit/src/__tests__/internal-error.test.ts`, `protocol/src/errors.ts` and `protocol/src/__tests__/errors.test.ts`. The held HTTP hunk changes log copy. It leaves the reporting body in place. |
| Hygiene-a/b and practice | OWNED-ELSEWHERE cloud cull | Outside this dispatch. |
| Launch-44-41 | OWNED-ELSEWHERE `jy-*`, `tv-y1`, `tv-y2` | No repeated sheets. |
| ACP-3/4/5 redo | OWNED-ELSEWHERE ACP redo | Outside this dispatch. |
| RT-J3 | OWNED-ELSEWHERE RT-J3 | Outside this dispatch. |
| Tier-2 Tovu-styled class tokens | PARKED | Per-screen work. |
| `todos.md` §L | PARKED | Owner hold. |
| 424 UI functions over 50 lines | PARKED | Tabled. |
| fn50 and c6fix | OWNED-ELSEWHERE fn50 and c6fix | Size and complexity work. |
| Coverage | PARKED | Outside this dispatch. |
| Mutation testing program | PARKED | Only the named regression mutations below are owed. |

## Rules to carry into both job briefs

Preserve behavior except where the sheet names a correction. Write the named failing tests first. Use `(required, optional = {})` for new functions. Framework-dictated signatures are exempt. Inject hooks as props. Use existing ports. Keep vendor code in provider packages, framework code at the transport edge and product names out of Jini.

Make the smallest named diff. Move code and its why-comments verbatim when a sheet calls for a move. Add no unlisted helpers, wrappers, ports, types, options, fallbacks, validation, comments, dependencies, re-export shells, suppressions or casts. Write only the named tests. Re-read the diff and list deletions in root `COMMIT-PLAN.md`.

Stop the affected sheet if a declaration is missing, a cast is needed, an unlisted production importer appears in the exact-symbol check, or an edited function exceeds 50 lines or complexity 10. An unlisted test importer needing the same repoint goes in `REFRESH.md`. Record files over 500 lines and continue. Use targeted reads only. Keep `.git` read-only. Run no tests, builds, installs, type-checks, linters or codebase-memory tools. Cloud owns execution of the named tests and mutations, generated baseline updates and any package or lockfile changes.

## ERFIX-J2 · Reporter disclosure and tracker handoff

**Jini · 16k executor tokens.** Base merge-7, after the E4-J-TRACKER reporter and reporter-test hunks from `origin/codex/jz2-a`. Apply only those hunks if the branch has yet to be combined. The other listed post-merge-7 branches have no substantive overlapping edits in the sheet files.

### Tests first

| Existing file and base anchor | Case and mutation |
|---|---|
| `packages/core/src/errors/__tests__/reporter.test.ts:50,141,160,200` | Update the incident message expectations to include the next step before `(error ID)`. At `:200`, assert the same message format for all three audiences and no details block for anonymous. Mutation: omit `fallback.action`. |
| `reporter.test.ts:63` | Record an original error, then describe it using the returned ID. Assert one ID, one host record and one tracker handoff, and that the next independent incident gets the next fixture ID. Mutation: call `recordIncident` again on describe. |
| `reporter.test.ts:78,222` | Keep the `jz2-a` original-object identity and per-call `exactSecrets` assertions. Assert the logger receives the scrubbed diagnostic as its only cause-bearing field. Extend the approved-cause case with an ordinary per-call secret and assert the authorized caller still sees the approved sentence with the secret removed. Mutations: restore the raw logger argument, restore `trackerCarrier`, or omit exact secrets from disclosure. |
| `reporter.test.ts:231,244,249,256,264` | Pin the approved catalog wording for `own-message`, fixed text and `ClientFacingError`. Put private prose in the carrier’s message and details and assert neither is published. Preserve a registered refusal’s status and lack of ID. Assert that an authorized-only sentence uses the boundary fallback for other audiences. In the quota case, use one declared placeholder that contains an exact secret, one undeclared private field and the existing numeric counts. Assert redaction in the rendered sentence and `details.params`, omission of the undeclared field and preservation of the counts. Mutations: forward the carrier, use `error.message`, use host-only redaction or serialize all params. |
| `packages/core/src/errors/__tests__/catalog.test.ts:110,130,191` | Assert an `own-message` match has no public message and a caller-safe rule falls back for that class. Keep the existing model assertions at `:171–188`. Mutations: return `String(error.message)` or put the own-message binding back into `callerSafeRules`. |
| `packages/provider-plugins/src/__tests__/observability-sentry.test.ts:201` | Using the existing recording transport, add one reporter-tagged incident with private prose and an exact-secret canary in its original message and stack. Assert one Sentry error event containing the label and ID, with neither canary nor exception stack frames. Mutation: send it through `sanitizedError`. |
| `packages/provider-plugins/src/__tests__/observability-otel-operations.test.ts:149` | Add one tagged report inside an active operation. Assert one exception event with the reporter label and ID, without the original message or stack. Mutation: omit the ID from the active-span event. |

### Source edits

1. In `packages/core/src/errors/catalog.ts`, change `resolveText:111` so `own-message` returns its mode without reading the caught value’s message. At `createErrorCatalog:191`, emit caller-safe rules for fixed bindings only. Keep `modelFacingRules:186` using the existing `ruleBindings`. Adjust the `ErrorMatch:13` and binding documentation in `catalog.ts:164` to describe the two policies. A registered `sentence.params` callback is the operation owner’s approval of its projected values. Only parameters named by that sentence’s placeholders are eligible for publication.

2. In `packages/core/src/errors/reporter.ts`, edit `refusalError:170`, `redactedParams:164` and `refusal:182`. Use the fixed binding text or the catalog sentence permitted for the audience, plus its next step. Where no permitted sentence supplies a next step, use the operation’s fallback action. Where no permitted text is available, use the fallback message and action. Pass the host and per-call redaction policy to the refusal path. Filter exported params to placeholders in the approved message or action. Redact each full value before the existing 128-character cap, including the string form of a numeric value if it matches a secret. Keep unaffected numbers as numbers. A `ClientFacingError` supplies a code to look up, with a catalog sentence or a recognized existing status mapping as the classification. Build a fresh refusal from approved text. Drop the carried message, details, retryability and request ID. Use catalog retryability when available. An unrecognized carrier code takes the incident path.

3. Edit `describeFailure:196` so the incident message is the redacted `fallback.message` and `fallback.action`, followed by `(error ID)`. Keep `requestId` equal to that ID. When `DescribeFailureOptions.errorId` is supplied, treat it as an already-recorded incident. Build the disclosure with that ID and the existing safe label calculation, without calling `recordIncident`, the ID port, the logger or the tracker. Keep `record()` as the entry point for an owner that has preallocated an ID and still needs to write its first record. At `disclosure.ts:9,46`, document the anonymous wire contract. Keep the existing approved-cause step and audience checks and pass the merged redaction policy into the existing formatter.

4. Use `jz2-a`’s `IncidentTrackerReport`, `reportToTracker` and `recordIncident` handoff. Delete `trackerCarrier`. Pass the original thrown value and the per-call `exactSecrets` to the in-process port with `attributes.errorId` and `attributes.label`. In `recordIncident`, remove the raw `error` field from the logger options. The already-redacted, capped `meta.diagnostic` retains the message and stack for the operator record.

5. At the two existing provider boundaries, use the string `label` and `errorId` pair already supplied by the reporter. In `packages/provider-plugins/src/observability-sentry/sentry.ts:129`, send tagged incidents through the existing client and active scope with an explicit Sentry event whose exception type is the label and whose value is the ID. Use the same consent and export gate. For untagged reports, retain the existing `captureException(sanitizedError(...))` path. In `packages/provider-plugins/src/observability-opentelemetry/otel-port.ts:152`, use the reporter label as the exception type for tagged reports and attach the ID to the exception event, including when the span is already active. Preserve existing untagged reporting and trace attribution.

**Imports and exports.** No repoints. `reporter.ts:24` becomes `import { interpolateSentence, isErrorCodeToken } from './sentences.js';` for the carrier code check before the existing status lookup. Add `captureEvent` to the existing named `@sentry/node` import in `sentry.ts:36`. The catalog/reporter tests retain their relative imports, the existing reporter test helper at `errors/testing.ts:9` retains its import, and the provider tests use their current transport fixtures. Keep the existing `@jini-ai/core/errors/catalog`, `/reporter`, `/disclosure` and `/testing` subpaths. No manifest edits.

**Debt and verification.** Note `api-baseline/jini-ai__core.json` for the tracker type delta and let cloud reconcile it. Preserve the existing catch debt at Sentry and OTel. No injection-debt changes or Chrome/Electron look. Consumer adoption of the changed packages is **after lockfile release**.

**STOP.** Stop if a live importer relies on the removed `ErrorMatch.message` for `own-message`, a `describe({…}, {errorId})` call uses a preallocated ID as its first record, or the provider export sends raw cause fields on a tagged incident. Keep the model path out of the caller disclosure change.

**BREAKS:** `describe` with a supplied ID no longer writes a record. `own-message` is model-only, and reporter-handled `ClientFacingError` no longer forwards its prebuilt text and details. Logger consumers get the redacted diagnostic instead of the original error object.

## ERFIX-T1 · AG-UI stream read failure

**Tovu · 5k executor tokens.** Base `8d1a4c2742`. The six listed post-merge-7 Tovu branches have no changes to the sheet files or the existing failure owner. This sheet uses a Jini subpath already imported on the Tovu base and has no dependency on ERFIX-J2.

**Test first.** Extend `apps/website/src/server/__tests__/assistant-ag-ui-routes.test.ts:621`, using the existing `socket-reset-mid-stream` script at `:145` and the observability injection at `:295–296`. Keep the status 200 and existing event order, including the closing text event and exactly one `RUN_ERROR`. Assert the exact safe wording below and one `ERR-XXXX-XXXX-XXXX-XXXX` suffix. Capture the `assistant.run` report with the existing observability fixture and assert exactly one report carrying that same ID. Keep the failed-span and real error-type assertions at `:970`. Mutations: restore the raw catch text, omit the failure-owner call, or substitute a different response ID.

**Source.** In `apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts`, pass `deps.tracker` through the existing `AgUiFrameContext:181` at its construction in `handleAgUiRun:389`. In `drainAgUiStream:302–306`, replace the raw-message event with a call to `reportServerFailure({ error, operation: "assistant.run" }, { tracker: ctx.tracker, errorId })` and serialize the owner’s returned ID. Mint the supplied ID once with `mintToolErrorId({ randomHex: ({ bytes }) => randomBytes(bytes).toString("hex") })`. Keep the existing segment close, response end and `{ status: "failed", error }` outcome. The catch’s message is:

> The connection to the assistant closed before the reply finished. Check the conversation before trying again. If it happens again, report this error ID. (error ERR-XXXX-XXXX-XXXX-XXXX)

**Imports and callers.** Replace the Node import at `assistant-ag-ui.ts:47` with `import { randomBytes, randomUUID } from "node:crypto";`. Add `import { mintToolErrorId } from "@jini-ai/core/errors/error-id";` and `import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";`. The existing owner is `admin-failure.ts:53`. The only `drainAgUiStream` call is the one at `:389`. The module consumers at `http-app/mount-assistant.ts:12,93`, `assistant-ag-ui-routes.test.ts:289,304` and `assistant-ag-ui-wire.golden.test.ts:119,128` retain their imports. No export or manifest changes.

**Debt and verification.** Keep or reduce the `catch-reads-error` row for `assistant-ag-ui.ts` at `development/scripts/error-gate-debt.json:2198`. Cloud should reconcile the row from measured results. Chrome after combine: interrupt the upstream read during an authenticated assistant turn and check the notice for the next step and the report ID. No Electron look.

**STOP.** Stop if the stream-read path already records the same failure when marking the span outcome, the shared owner cannot carry the same ID into both sinks, or landing requires rewriting another terminal branch. Keep this sheet scoped to the daemon stream-read exception.

## ERFIX-J3 · HTTP acceptance criteria pending handoff

**Jini · after ERFIX-J2 and the `ex-err-jini` handoff.** Keep `packages/http-kit/src/adapter.ts:114` as the exception boundary and `response.ts:19` as the serializer. Preserve `spec.ports.onError` precedence, existing refusal statuses and `{ error: { code, message, requestId } }` for an unexpected failure. The migrated path should send the reporter’s 500, `INTERNAL_ERROR`, operation wording and ID. The reporter owns the one record. The shared helper’s UUID-and-sink implementation at `internal-error.ts:33–65` must be removed in that same change.

Before dispatch, pin the production reporter wiring and the disposition of the other live helper callers. `packages/server/src/route-host.ts:10,37` passes the helper to the daemon route host, and core’s `json-route.ts:260–277` calls the injected equivalent. Tovu’s settings adapter at `routes/settings/shared.ts:225–230` supplies its own `onError`, so it cannot witness the default exception migration. The verified call sites do not support adding an optional reporter field with no production caller.

Use `packages/http-kit/src/__tests__/adapter-pins.test.ts:193` and `adapter.test.ts:114–136` for the 500 and one-record witness. Exercise both reader directions there, leaving the held protocol files alone:

- **Old reader × new response.** Feed the actual adapter response into `decodeApiError` from `@jini-ai/protocol`. Assert the decoded code, wording and `requestId`. Assert that reconstructing a plain `Error` from its message still lets the existing `formatUserFacingError` recover the same ID. Assert that the host record carries that ID exactly once. Mutations: omit `requestId`, omit the ID in the words, or invoke both report paths.
- **New reader × old response.** Feed the decoder the frozen legacy nested fixture from `adapter-pins.test.ts:202–204`, including its UUID `requestId` and message without an embedded ID. Assert the UUID, code and text are preserved. Mutation: require the new ERR format when decoding `requestId`.

**After lockfile release.** Tovu’s `apps/website/src/server/inbound/shared/__tests__/observability-middleware.test.ts:223–255` pins the old UUID, copy and stderr output. Include its compatibility update in the release combine if the default path it exercises is migrated. Jini cloud owns reconciliation of the `no-generic-failure-text` debt for `internal-error.ts` and the HTTP API baseline if the exported contract changes.

**BREAKS:** The migrated endpoint’s `requestId` changes from UUID to `ERR-…`, and its message now includes the ID. Any consumer requiring UUID syntax or exact legacy text needs the release compatibility update.

## Batches

| Order | Codex job and branch | Base and execution order | Estimated tokens |
|---|---|---|---:|
| 1 | Jini `codex/jini-errfix1` | Merge-7 → scoped `jz2-a` E4-J-TRACKER hunks → ERFIX-J2 → ERFIX-J3 once dispatchable. Keep ERFIX-J3 pending in this job until the hold and production wiring are resolved. | 16k ready |
| 2 | Tovu `codex/tv-errfix1` | `8d1a4c2742` → ERFIX-T1. No Jini package bump required for this sheet. | 5k |

**Partial:** ERFIX-J3 still needs the held-file handoff and a named production composition that can supply the reporter while preserving the shared helper’s other callers. The status, envelope, record-count and reader checks above are ready to carry into that sheet.

## COORDINATOR ADDENDUM (owner design input 11-20 ~6:40 PM; the cull and executors apply it)
1. The reporter takes the operation tracker EXPLICITLY: `reporter.describe({ error, step, fallback, operation })`, and reports via `observability.reportError` with that operation's trace ids. No reliance on an implicit `run()` scope for linking.
2. Each transport boundary is ONE named, exported function with injected deps (`{ observability, reporter }`), e.g. http-kit `runOperation(required, deps)`; route handlers stay plain `work` functions. Test the boundary once with fakes: exactly one report, `end({ outcome: 'failed', failed: true })`, safe words + `ERR-` ID in the body, a secret from the error message never in the body.
3. Dependency direction (owner 11-20): the REPORTER depends on `ObservabilityPort` (never the reverse; adapters hold no error policy). `reportError` receives the finished incident: the ORIGINAL error (stack/grouping, redacted in-process per ER-6) + context `{ operation, trace: operation's trace ids, incidentId, label }`. `ErrorReport.context` has no incident-ID field today (`packages/core/src/contracts/observability.ts:57`): add `incidentId` (or a fixed attribute key) so the tracker, the server log and the user see the SAME ID; update the vendor adapters' mapping and their tests.
