# One error system for Tovu + Jini (design, revision 2, 2026-11-16)

Design only. No source file was edited. Read against Jini `integ/wave-b-r2` @ `02edbb68` and Tovu `integ/wave-b-r2` @ `80b00f5b` (worktree).
Personas: software-architect (lead), security, programmer, tdd. Skills: implementation-guardrails, hexagonal-architecture, api-design, testable-design-patterns, test-design, secure-input-handling, security-review.

Revision 2 answers the Codex judge report (`CODEX-JUDGE.md`: 2 blockers, 11 majors, 1 minor). Every finding was checked in the code before it was accepted. Sections 3 to 9 are rewritten; section 2.1 to 2.5 is the verified inventory from revision 1 and is unchanged.

Words used here:
- **Refusal**: an expected "no" (bad input, not found, conflict, not allowed). The caller can act on it. No incident.
- **Incident**: an unexpected failure. It gets an error ID, a record on the server, and a tracker report.
- **Sentence**: the plain words for one error code (what failed, what to do), with its HTTP status.
- **Binding**: "in this scope, this error class means this code". A relation, not a table.

## Judge response

Result: **14 of 14 findings accepted** (one with a corrected premise, two wider than the judge found), **0 rebutted**. Blockers left: **0**. I looked for grounds to rebut each one and did not find any that survived a read of the code.

`J` = Jini `packages/`, `T` = Tovu worktree root. "Verified" names the lines I read myself.

| # | Finding | Verified at | Verdict | Fix (where) |
|---|---|---|---|---|
| 1 | **Blocker.** Redaction was used as if it were permission to disclose | J `core/src/user-facing-error.ts:23-25` ("Callers own disclosure policy: redaction does not make private backend facts public-safe"); J `core/src/redact.ts:14-18` (does not detect names, addresses, business secrets); T `site-share-errors.ts:74-83` (`cause: context.cause ?? "The error ID identifies the server report."`, only the export pilot passes a cause) | Accepted | No error text reaches a caller unless the owner of that operation approved it for callers authorised for that operation (§3.3). Default cause in Copy details is a fixed sentence plus a listed class/code label. The "never bodies or query strings" claim for the host record is withdrawn and replaced with what is true. Tests use ordinary private prose, not token shapes |
| 2 | **Blocker.** Global class-first lookup cannot represent real ownership | J `cms/src/forms/delivery/errors.ts:8-10,32-47` (one class, 9 codes); T `members/tool-registrations.ts:186` and `post/tool-registrations.ts:305` (same `ForbiddenError`, two codes); T `pages/tool-registrations.ts:742` (two classes, one code); J `model-facing-tool-errors.ts:79-81` (`forbiddenRule`) | Accepted | The catalog is two relations: sentences keyed by code (one definition per code) and bindings grouped by scope (ordered, first match wins, aliases legal, optional discriminant). Lookup always names a scope. Contract cases for all three relationships (§3.1) |
| 3 | Catalog adoption loses model-facing explanations | J `model-facing-tool-errors.ts:108-115` (`rule.message ?? err.message`); T `members/write-service.ts:98,165` (two different messages from one class); T `members/types.ts:251` (empty subclass) | Accepted | A binding states its text mode explicitly: `own-message` (today's default), `fixed` (today's `message` override) or `sentence`. Generated rules are field-for-field today's rules. E5 tests list several construction sites per class (§3.1, §4 E5) |
| 4 | Lower-case codes contradict the reused describer | J `model-facing-tool-errors.ts:237-238` (`CONSTANT_TOKEN`), `:431-434` (`createErrorDescriber` throws on any other shape) | Accepted | Catalog codes are constant tokens, full stop. The nine kebab form-delivery codes stay a ledger vocabulary owned by cms and never enter the describer. A total `Record` maps each to a catalog code. Approval stays by listing (§3.1) |
| 5 | E4 breaks incident-detail readers before E6; N-1 checked one direction | T `apps/admin/src/lib/admin-failure-channel.ts:26-47` and `apps/admin/src/features/sites/site-export-error.ts:25-31` (both read `details.failure`); T `site-share-errors.ts:116-123` (`field`, extra `details`) | Accepted | Tovu's flat envelope and `details.failure` are **kept**. D4 (retire the flat envelope) is withdrawn. Jini route errors keep their shape too; no incident block is added to the wire. Readers change before producers. Frozen copies of today's readers run against new responses (§3.4, §4 E4) |
| 6 | The host catalog never reaches the route status owner | J `core/src/contracts/server/json-route.ts:149-150`; J `http-kit/src/adapter.ts:65,108,130`; J `http-kit/src/origin.ts:16`; six sites in J `daemon/src/http/` | Accepted, premise corrected | The judge names `jsonRoute` as the real owner. At this ref `jsonRoute` has **no non-test caller** (word search over both repos). The production owners are `mountJsonRoute` (83 calls in 19 daemon files, 2 in Tovu) and the daemon HTTP files. The finding holds for all of them. A typed `statusFor` goes on the existing `RouteHostContext`; every one of the 11 call sites reads it in one green step (§3.4, §4 E5a) |
| 7 | Incident metadata never reaches chat | J `chat/src/core/run-events/entry.ts:689-693`, `assistant-client/ag-ui-transport.ts:74-80`, `transport.ts:45`; also found: J `assistant-client/transport.ts:425,476`, `durable-run-subscription.ts:47`, `embed-widget/transports/fetch-sse.ts:165`; T `assistant-ag-ui.ts:376-380` (drops `payload.error`), `:560` (sends raw `error.message` to the browser), `:661` ("assistant failed") | Accepted, wider | E8 covers both transports, the host AG-UI bridge, the failure contract, the saved status event and the notice. The ID also rides inside the words, so a consumer that rebuilds `new Error(message)` still keeps it (§3.4, §4 E8) |
| 8 | E9 changed Electron rejection semantics; wrong sidecar branch | T `apps/desktop/src/renderer/use-app-version.hooks.ts:31-36`; 61 `ipcRenderer.invoke` forwards in `preload.mts`; J `sidecar/src/json-ipc.ts:305-324` (frame parse, uses `jsonIpcError`) and `:352-368` (handler failure, already `HANDLER_ERROR` + `requestId`) | Accepted | A failing handler still **rejects**. The wrapper records the incident and rethrows safe words with the ID. Bridge types, preload and the 16 structured `ok: false` owners are untouched. The two sidecar branches are migrated separately (§3.4, §4 E9) |
| 9 | E1 callback unsafe and uncontained | J `model-facing-tool-errors.ts:242-244` ("approved by listing, never by shape"); J `infra/src/events/outbox/worker.ts:37-57,79-87` (existing containment), `:272` (sequential batch loop) | Accepted | The policy declares a closed list of codes; the worker stores a value only if it is on that list. A throwing policy is contained with the existing `reportPolicyFailure` and falls back to the class label. Tests: code-shaped canary, throw, unknown code, next row in the batch (§4 E1) |
| 10 | Persisted error ID has no storage or sweep design | J `infra/src/events/outbox/ports.ts:12,27`; J `core/src/contracts/events/ports.ts:100,129-135`; T `jini-outbox-adapter.ts:18-25`; J `cms/src/forms/delivery/status.ts:44`; J `worker.ts:119-136` (no log on an ordinary failure) | Accepted | No schema change and nothing appended to `lastError`. The correlation key is what the row already stores: row ID + attempt number. The worker logs each ordinary failure once with that key (step E1). Status views show the row ID as the reference (§3.3) |
| 11 | FP rows wrong; the parse exception cannot pass its own population; rule conflict | J `agent-runtime/src/providers/response-text.ts:13-21`; J `provider-plugins/src/payments-stripe/http.ts:46-57`; T `SharedKeys.hooks.ts:134-137`, `byok-meta-tool-result.ts:89-94`, `consent/config.ts:75-80`, `backstop-service.ts:115-116` | Accepted, wider | All 179 FP rows re-read from the complete try/catch with a syntax-tree script. **10 rows moved to real.** The exemption is redefined and was run against every row it claims (§2.6, §3.7). One precedence order for the three rules |
| 12 | W1 cannot keep documented fallbacks | T `site-transfer-dependencies.hooks.ts:95,98,102`; T `assistant-run-finalizer.ts:430`; T `owner-store.ts:226` | Accepted | New idiom `orFallback`: any failure gives the stated fallback, unchanged. `absentWhen` (which rethrows) leaves W1 and is used only where the change is intended (W5) (§3.8) |
| 13 | i18n wire contract and browser catalog ownership unfinished | J `protocol/src/errors.ts:32-38,81-87` (no `params`); T `post/tool-registrations.ts:299-305` (bindings import server classes) | Accepted | Parameters travel in `details.params`. Sentences live in a data-only file the browser imports; class bindings live in a separate server file. A guard rule and a bundle check prove it (§3.5) |
| 14 | Minor. Idiom signatures and the E1 test broke owner rules | J `cms/src/forms/delivery/errors.ts:38-41` (constructor takes one object) | Accepted | Every new function takes `(required, optional = {})`. The cms test uses its own error and a fake boundary; the infra test uses a fake policy (§3.8, §4 E1) |

What the judge's five recurring classes changed in the design:

1. **Redaction is not permission.** Disclosure is decided by audience and by the operation owner's approval. Redaction runs after that, as a second layer.
2. **Registrations are relations.** Sentences and bindings are separate; lookup is scoped.
3. **Compatibility both ways.** Each wire change lists old reader × new response and new reader × old response, with a test for each.
4. **Lint exemptions need executable examples.** `work/fp-recheck.cjs` is the exemption's prototype. It was run on all 369 current rows.
5. **Correlation must survive a rebuilt `Error`.** The error ID is part of the words; the typed fields are an addition, not the only carrier.

## 1. Verdict

**About 60% of the owner's error system already exists, in four unconnected pieces.** Nothing new needs inventing for the user-facing shape, the Copy-details block or the shared notice. What is missing is one contract that ties codes to words, one incident path, the host wiring, and a disclosure rule that is stated once.

The three biggest findings, each checked in code:

1. **Wave B's "originals go to a host sink" has no sink in Tovu.** Tovu calls `createConsoleLogger` 17 times in 17 files and passes the `diagnostics` sink zero times. No non-test Tovu file passes `onInternalError`. An unexpected failure inside a Jini route reaches Tovu's console as a class name and the original is dropped. (§2.3)
2. **The outbox regression is real.** `infra/src/events/outbox/worker.ts` `recordOutcome` writes `describeErrorForLog({ err })`. `FormDeliveryError` codes are kebab-case and not in the approved set, so the stored value is `Error`, and `status.ts` maps that to `delivery-failed`. The same function never logs the original error at all. (§4 E1)
3. **The gate has to cover a class, not a list.** 1,871 handlers never read the caught value (§2.5). After the re-check, 200 of the 369 flagged sites are real, and 7 of the sites first labelled "parse refusal" were hiding a failed read of a stream, a file, stdin or a provider.

## 2. Current state (verified)

### 2.1 Existing owners

| # | Owner | Where | What it does | Uses (non-test) |
|---|---|---|---|---|
| 1 | Wire envelope | Jini `protocol/src/errors.ts`: `ApiError { code, message, details?, retryable?, requestId? }`, `createApiError`, `decodeApiError`, 17 `GENERIC_ERROR_CODES` | The JSON error shape of Jini routes; decoder accepts the nested and the legacy flat shape | `createApiError(` Jini 75 calls / 23 files, Tovu 1 |
| 2 | Code → HTTP status | Jini `core/src/contracts/server/api-error.ts`: private `ERROR_STATUS_BY_CODE` (23 codes), `statusForError`, `validationError` | A closed table. Any feature code not in it answers **500** | `statusForError(` Jini 12 |
| 3 | User-facing shape | Jini `core/src/user-facing-error.ts`: `UserFacingError { message, action, step, cause, errorId?, appVersion?, jiniVersion?, time?, copyText }`, `formatUserFacingError`, `describeRequestFailure` | Exactly the owner's shape: plain words + Copy details, redacted and bounded | `formatUserFacingError(` Jini 1, Tovu 10 |
| 4 | Shared UI | Jini `ui/src/features/panel-kit/ErrorNotice.tsx` (+ `.hooks.ts`), `failure-channel.ts` (`createFailureChannel`) | Notice with "Show details" + "Copy details"; one retained failure per host | `<ErrorNotice` Jini 1, Tovu 14; admin kit has an `ErrorNotice` slot |
| 5 | Tovu admin client path | Tovu `apps/admin/src/lib/admin-failure-channel.ts`: `publishAdminFailure`, `publishLocalAdminFailure` | Builds the notice from a failed response or a local failure | 2 + 3 calls |
| 6 | Tovu server incident path | Tovu `apps/website/src/server/inbound/admin-http/routes/system/site-share-errors.ts`: `reportServerFailure`, `adminFailureResponse`, `sendAdminFailure` | Redacts, logs, reports to the tracker under one error ID, answers a flat envelope `{ error: "<words> (error <id>)", code, errorId, details: { failure } }` | `sendAdminFailure(` 251 calls / 213 files; `reportServerFailure(` 11 |
| 7 | Jini route incident path | Jini `http-kit/src/internal-error.ts`: `reportRouteInternalError` | Fresh correlation ID, host sink `onInternalError` or a class-only console line, answers `INTERNAL_ERROR` + `requestId` | 6 calls / 4 files; `onInternalError` named 82 times / 22 files |
| 8 | Model-facing tool errors | Jini `core/src/model-facing-tool-errors.ts`: `ModelFacingErrorRule` (thrown), `CallerSafeErrorRule` (returned), `reclassifyToolError`, `withModelFacingErrors` | Per-domain allowlist: error class → stable code prefix + safe words | rule arrays in 4 Jini + 14 Tovu files; `new ToolInputError(` Jini 244, Tovu 493 |
| 9 | Log vocabulary | same file: `describeErrorForLog`, `describeErrorParts`, `createErrorDescriber({ codes, classes })`, `LOGGABLE_ERROR_CODES` | Class label + approved constant code, never a message | `describeErrorForLog(` Jini 81, Tovu 94; `createErrorDescriber(` 1 |
| 10 | Logger | Jini `core/src/primitives/logger.ts`: `Logger`, `createConsoleLogger`, `LogDiagnosticsSink` | Console line with safe meta; originals only to an optional host sink | see finding 1 |
| 11 | Redaction | Jini `core/src/redact.ts` (`redactSecrets`, `formatErrorForLog`), `diagnostics/src/core/secrets-only.ts` (`redactSecretShapes`), `diagnostics/src/observability/errors.ts` (`describeReportedError`), `report-error.ts` (`redactedError`) | Secret-shape and exact-secret redaction of message + stack | `redactSecrets(` Jini 61, Tovu 12; `formatErrorForLog(` Jini 3, Tovu 43 |
| 12 | Tracker port | Jini `diagnostics/src/observability/ports.ts` `ObservabilityPort.reportError`, `report-error.ts` `reportErrorOnce`, `Tracker.error` | One redacted report per failure per port | `tracker.error(` Tovu 16; `reportErrorOnce(` Jini 2 |
| 13 | Tool failure IDs | Jini `daemon/src/tool-recovery/redaction.ts`: `mintToolErrorId` (`ERR-XXXX-XXXX-XXXX-XXXX`), `redactFailedResult` | Owner decision 2026-09-16 "hide secrets only": the reason stays visible, secret values are blanked, an ID is minted | one decorator |
| 14 | Admin transport error | Jini `admin/src/core/transport/errors.ts`: `AdminApiError`, `describeApiError`; Tovu `apps/admin/src/lib/api.ts`: `ApiError`, `describeApiError` | Panel-level fallback text | `describeApiError(` Jini 36, Tovu 174; `AdminApiError` 150 refs / 49 files |
| 15 | Domain error classes | everywhere | `class X extends …Error` | Jini 333 / 187 files, Tovu 169 / 102 files |
| 16 | Log-safety gate | Jini `scripts/check-log-safety.mjs` + `log-safety-debt.json` (132 entries) | Ratchet: no raw caught value in a log sink | CI |
| 17 | IPC error shape | Jini `sidecar/src/json-ipc.ts`: a bad frame answers `jsonIpcError` → `{ code?, message }` with the raw `error.message` (`:305-324`); a handler failure already answers `HANDLER_ERROR` + `requestId` with the text "internal error" (`:352-368`) | Desktop/sidecar replies | Tovu desktop has 56 `ipcMain.handle` sites in 12 files and no shared error helper |

### 2.2 Things that conflict today

- **Two envelopes.** Jini: `{ error: { code, message, requestId } }`. Tovu admin: flat `{ error: string, code, errorId, details.failure }`. `decodeApiError` reads both.
- **Three ID formats.** `requestId` (UUID, Jini routes), `errorId` (UUID, Tovu), `ERR-XXXX-XXXX-XXXX-XXXX` (tool failures). `formatUserFacingError` already keeps both shapes unredacted.
- **Three log policies.** (A) class only: `describeErrorForLog` (wave B). (B) hide secrets only: `formatErrorForLog` / `redactedError` (Tovu incident path, tracker, tools; owner decision 2026-09-16). (C) raw: Tovu still has 54 `console.warn/error(..., error)` calls in 40 files that pass the caught value as-is (Jini: 0). Jini's log-safety gate forbids (B) inside log calls, which is what pushed the outbox to (A).
- **Three per-domain registrations of the same fact.** "This class is safe and its code is X" is written separately for the model (`ModelFacingErrorRule`), for returned results (`CallerSafeErrorRule`) and for logs (`createErrorDescriber`). The file's own comment records that two of them drifted until 2026-09-18.
- **Two `describeApiError` with different fallbacks.** Jini admin: a non-`AdminApiError` shows the fallback text and logs class only. Tovu admin: any `Error` shows its own `message`. Neither gives an error ID or Copy details.
- **A documented decision to keep:** `admin/src/core/transport/errors.ts` says there is deliberately no shared code → message table, because `RESOURCE_CONFLICT` means three different things in three domains. The catalog below respects this: words belong to a feature's own namespaced code, never to a shared generic code.

### 2.3 Wiring gaps (finding 1 in detail)

| Seam | Jini default | Tovu wiring found | Effect |
|---|---|---|---|
| `createConsoleLogger({ prefix }, { diagnostics })` | console line: class + approved code | 17 calls, 0 with `diagnostics` | original dropped |
| route packs' `onInternalError` | console line: class + correlation ID | 0 non-test references | original dropped |
| Tovu's own admin routes | — | `sendAdminFailure` (redacted text to console + tracker) | works |

Not verified: a spread object could carry `onInternalError` under another name; I searched for the identifier only.

### 2.4 Conflict classes

The brief cites "13 error classes / 4 wire codes" from the lost-updates design. I could not find that design on the fetched branches, and I could not reproduce the count. A name search finds 32 classes named `*Conflict*`/`*Stale*`/`*Revision*` (Jini 22, Tovu 10) and about 20 distinct conflict wire codes (`VERSION_CONFLICT`, `RESOURCE_CONFLICT`, `PLAN_STALE`, `SLUG_CONFLICT`, …). The generic owner already exists: Jini `core/src/optimistic-concurrency.ts` (`RecordVersionConflictError`, `VERSION_CONFLICT_CODE`, `versionConflictRule`). The catalog treats version conflicts as one generic entry owned by core; the lost-updates design decides which classes fold into it.

### 2.5 Size of the class (new measurement)

Fresh run of `development/scripts/owner-rules-audit.mjs` on `integ/wave-b-r2`, and a read-only census (`work/catch-census.cjs`, TypeScript syntax tree, non-test source):

| | Tovu | Jini |
|---|---|---|
| Input rows (`errors-*.tsv`) | 228 | 293 |
| Flagged today by the audit (swallowed + generic) | 79 (46 + 33) | 290 (180 + 110) |
| Input rows no longer flagged | 150 | 6 |
| `catch` clauses, total | 1,808 | 1,843 |
| …that never read the caught value | 588 | 940 |
| — empty with a comment (the audit excuses these) | 162 | 216 |
| — throw a new error without the cause | 61 | 85 |
| — return a fallback value | 292 | 498 |
| `.catch(fn)` handlers that ignore the error | 96 of 288 | 247 of 327 |

The census file set differs slightly from the audit's (it skips `content/` and `sites/`), so totals are within about 2% of each other, not identical. "Never reads the value" is not the same as "wrong": most `JSON.parse` fallbacks are fine. It is the population the gate must look at.

### 2.6 Classification of the flagged sites (re-checked in revision 2)

`SITES.tsv` has 525 rows: the 369 sites flagged today plus the 156 input rows that are gone.

| | real | false positive | gone |
|---|---|---|---|
| Tovu | 12 | 67 | 150 |
| Jini | 188 | 102 | 6 |
| Total | **200** | **169** | 156 |

How it was checked this time: `work/fp-recheck.cjs` parses each file and reads the **whole** `try` block and `catch` block, or the receiver and handler of a `.catch(...)`. All 179 rows that revision 1 called false positive were re-read that way (`read_depth = ast`); I then read the source of every row the script could not pass (26 rows) and of every `.catch` row whose receiver was a fresh call instead of a held promise. The 190 rows revision 1 called real were run through the same script only as a cross-check: none of them passes the exemption. They keep revision 1's read depth. The 156 gone rows were decided by script.

**10 rows moved from false positive to real:**

| Site | Revision 1 said | What the whole try/catch does | Step |
|---|---|---|---|
| J `agent-runtime/src/providers/response-text.ts:19` | parse refusal | reads an async stream and checks a byte limit; any read failure becomes fixed words with no cause | W8 |
| J `provider-plugins/src/payments-stripe/http.ts:54` | parse refusal | catches the provider HTTP send and returns an "unknown" payment outcome; the transport error is never recorded. The unknown outcome is correct and stays; the missing record is the defect | W8 |
| J `agent-plugins/s3-compatible/targets/s3-compatible.mjs:414` | parse refusal | `JSON.parse(await resp.text())`: a failed body read is reported as "not valid JSON" | W8 |
| J `agent-plugins/src/lifecycle/host-tools/identity.ts:55` | parse refusal | `JSON.parse(await readText(...))`: a missing or unreadable file and a bad manifest give the same words | W8 |
| T `apps/website/src/cli/commands/agent-plugin-tokens.ts:50`, `init.ts:145` | parse refusal | `JSON.parse(await read())`: a failed stdin read is reported as bad JSON | W8 |
| J `agent-plugins/src/lifecycle/provider-contribution.ts:97` | parse refusal | calls a plugin-supplied parser; any throw becomes "its parser failed" with no cause | W8 |
| J `chat/src/react/hooks/useComposerHistory.hooks.ts:112` | queue tail | the `.catch` also covers `storage.write(...)`: a failed history write is dropped | W4 |
| J `daemon/src/remote-tool-executor.ts:198` | queue tail | the `.catch` also covers `emitSurface(...)`: a failed surface emit is dropped | W4 |
| J `daemon/src/http/frontend-request-route.ts:54` | expected refusal | any failure of the host's `resolveOwner` answers 403. Failing closed is right and stays; a storage failure is never recorded | W5 |

Real, by step: W3 cleanup 89, W4 dropped notification / alert / write 18, W5 absent-vs-failed 32, W6 fixed words with no ID 13, W7 log line with fixed text 11, W8 cause dropped 37.
False positive, by outcome: 39 observed promise, 22 queue tail, 15 fallback on any failure, 1 sync fallback (all W1, 77 rows); 65 parse refusals that pass the exemption as they are; 10 parse refusals that pass once their project validator is listed; 5 sanctioned reporting modules; 3 reporter guards that E4 removes; 5 standalone skill scripts outside the gate; 2 plugin payloads that cannot import the idioms; 2 test support.

### 2.7 Facts found while verifying the judge report

- **Status owners.** `statusForError` is called at 11 places and none passes anything but the error: `http-kit/src/adapter.ts:65,108,130`, `http-kit/src/origin.ts:16`, six in `daemon/src/http/`, and `json-route.ts:150`. `jsonRoute` itself has no non-test caller on this ref.
- **Chat rebuilds the error at six places** (finding 7 row above). The existing formatter already recovers an `ERR-XXXX-XXXX-XXXX-XXXX` ID from a cause's text (`user-facing-error.ts:36`), which is what makes "ID inside the words" a working floor.
- **Tovu's AG-UI bridge sends a raw `error.message` to the browser** at `assistant-ag-ui.ts:560`. That is a disclosure today, independent of this design.
- **Electron already serialises only the message of a rejected `invoke`.** Any typed field on a thrown error is lost between main and renderer, so the ID must be in the text there too.
- **Some plugin payloads import `@jini-ai/*` and some do not** (`vercel.mjs`, `s3-compatible.mjs` do; `github.mjs`, `google-workspace/lib/auth.mjs` and the web-clone skill scripts do not). The gate cannot assume the idioms are importable everywhere (decision D9).

## 3. The mechanism

Small pure additions in Jini core, plus host wiring. Everything else is an existing owner used as it is.

```
feature (owns words)          feature server side (owns classes)      host (owns ports + policy)
errors.sentences.ts ─┐        errors.bindings.ts ─┐
  defineErrorSentences│         defineErrorScope   ├─► createErrorCatalog({ sentences, scopes })
                      └────────────────────────────┘   createErrorReporter({ ids, clock, logger, tracker, catalog, versions })
boundary (route / tool / job / IPC / run):  reporter.describe({ error, step, scope, fallback }, { audience, approvedCause })
   ├─ refusal  → code + sentence (+ params)                       no incident
   └─ incident → one ID, one host record, one tracker report      caller gets words + ID (+ details only if authorised)
client: decodeApiError → formatUserFacingError → FailureChannel → <ErrorNotice/>
```

### 3.1 Catalog: two relations, scoped lookup

Folder `core/src/errors/` (pure: types, constants, pure functions, factories whose state lives in the returned object). No index file.

**Relation 1: sentences, keyed by code. One definition per code.**

```ts
// core/src/errors/sentences.ts — the only module a *.sentences.ts file may import
export interface ErrorSentence {
  readonly status: number;            // HTTP status at a route boundary
  readonly retryable: boolean;
  readonly message: string;           // what failed. English source; `{name}` placeholders only
  readonly action: string;            // what to do next
  readonly audience: 'anyone' | 'authorized';
}
export interface ErrorSentenceSet { readonly domain: string; readonly codes: Readonly<Record<string, ErrorSentence>> }
export interface ErrorSentenceOptions { /* none yet; a named interface, never Record<string, never> */ }
export function defineErrorSentences(required: { domain: string; codes: Readonly<Record<string, ErrorSentence>> }, optional: ErrorSentenceOptions = {}): ErrorSentenceSet;
```

- A code is a constant token (`[A-Z][A-Z0-9_]{0,63}`, the describer's existing `CONSTANT_TOKEN`) and starts with its set's domain prefix. Generic protocol codes are defined only in core's own set.
- Two sets defining the same code is an error: a conformance test that builds the full host catalog throws; at runtime the catalog warns and keeps the first (owner rule: production warns and never refuses to boot).
- `RESOURCE_CONFLICT` and the other shared generic codes get **no** sentence from a feature. This keeps the decision recorded in `admin/src/core/transport/errors.ts` (the same generic code means different things per domain).

**Relation 2: bindings, grouped by scope. Many-to-many on purpose.**

```ts
// core/src/errors/bindings.ts — server side; imports the feature's error classes
export type ErrorText =
  | { readonly mode: 'own-message' }                    // publish the error's own message (today's rule with no `message`)
  | { readonly mode: 'fixed'; readonly text: string }   // publish this text instead (today's `message` override)
  | { readonly mode: 'sentence'; readonly params?: (required: { error: Error }) => Readonly<Record<string, string | number>> };
export type ErrorBinding =
  | { readonly error: ErrorClass; readonly code: string; readonly text: ErrorText; readonly guidance?: string; readonly label?: string }
  | { readonly error: ErrorClass; readonly codes: readonly string[]; readonly text: ErrorText; readonly label?: string;
      readonly codeOf: (required: { error: Error }) => string | undefined };   // class + discriminant
export interface ErrorScope { readonly scope: string; readonly bindings: readonly ErrorBinding[] }
export function defineErrorScope(required: { scope: string; bindings: readonly ErrorBinding[] }, optional: ErrorScopeOptions = {}): ErrorScope;
```

```ts
// core/src/errors/catalog.ts
export interface ErrorCatalog {
  /** Bindings of ONE scope, in order, first match wins. Never searches another scope. */
  match(required: { error: unknown; scope: string }): ErrorMatch | undefined;
  sentence(required: { code: string }): ErrorSentence | undefined;
  statusFor(required: { error: { readonly code: string } }): number | undefined;
  modelFacingRules(required: { scope: string }): readonly ModelFacingErrorRule[];
  callerSafeRules(required: { scope: string }): readonly CallerSafeErrorRule[];
  describerVocabulary(): ErrorDescriberVocabulary;       // input for the unchanged createErrorDescriber
  sourceSentences(): readonly string[];                  // for the i18n completeness check
}
export function createErrorCatalog(required: { sentences: readonly ErrorSentenceSet[]; scopes: readonly ErrorScope[] }, optional: { onDuplicate?: 'throw' | 'warn' } = {}): ErrorCatalog;
```

Lookup rules, in order:

1. The caller always names the scope. A tool registration passes its domain (as each `withModelFacingErrors({ rules })` call is per domain today). A route pack passes its pack's scope. There is no global search, so the same `ForbiddenError` is `MEMBERS_FORBIDDEN` in scope `members` and `CONTENT_POST_FORBIDDEN` in scope `content-post`.
2. Inside a scope, bindings are tried in the order written and the first `instanceof` match wins. This is today's rule-array rule, unchanged (subclass before superclass). `createErrorCatalog` rejects a scope in which a superclass is listed before its subclass (the later binding could never match).
3. Two bindings in one scope may name the same code. `PageNotFoundError` and `PostNotFoundError` both map to `PAGES_NOT_FOUND` in scope `pages`. Aliases are legal; only duplicate *sentence definitions* are an error.
4. A discriminant binding calls `codeOf` and accepts the result only if it is in the binding's own `codes` list. A throw from `codeOf`, or a value not on the list, means "no match" and the failure is an incident.
5. An arbitrary error is **never** matched by its own `.code` property: that field is caller-writable (the describer's existing rule). Only an already-classified carrier (`ClientFacingError.apiError.code`, built by our own code) is looked up by code.
6. No match means incident.

Contract cases that ship with E2 (the three relationships the judge named, plus order):

| Case | Expectation |
|---|---|
| `FormDeliveryError` built with each of its 9 ledger codes, scope `forms-delivery` | 9 distinct catalog codes; an unlisted ledger code gives no match |
| one `ForbiddenError` instance, scopes `members`, `content-post`, `unknown-scope` | `MEMBERS_FORBIDDEN`, `CONTENT_POST_FORBIDDEN`, no match |
| `PageNotFoundError` and `PostNotFoundError`, scope `pages` | both `PAGES_NOT_FOUND` |
| `PostVersionConflictError` (subclass of `PostConflictError`), scope `content-post` | the version-conflict code, with its guidance; swapping the two bindings makes `createErrorCatalog` throw |
| an `Error` whose `code` property is set to a real catalog code | no match |

**Model-facing text survives adoption (finding 3).** `modelFacingRules({ scope })` returns, for each class→code binding, exactly `{ error, code, message?, guidance? }`: `own-message` gives no `message` (so `reclassifyToolError` publishes `err.message`, as today), `fixed` gives `message: text`. `reclassifyToolError`, `callerSafeErrorMessage` and `withModelFacingErrors` are not touched. Migration of a rule array is therefore one-to-one: a rule without `message` becomes `text: { mode: 'own-message' }`, a rule with `message` becomes `text: { mode: 'fixed', text }`. `sentence` mode is opt-in for a class that later gets structured fields; it is not needed for adoption. Discriminant bindings are not model-facing today (form delivery is not a tool) and `modelFacingRules` skips them.

What a **user** sees for an `own-message` binding: the translated sentence for the code, then the server's English message as the specific reason. The reason line is not translatable. That is today's behaviour for those messages, kept, and listed as decision D11.

**Lower-case codes (finding 4).** The nine kebab codes in `cms/src/forms/delivery/errors.ts` are a ledger vocabulary: they are what `lastError` stores and what `safeFormDeliveryErrorCode` validates. They stay exactly that. cms adds one total table, checked by the compiler:

```ts
const FORM_DELIVERY_CATALOG_CODE: Record<FormDeliveryErrorCode, string> = { 'rate-limited': 'FORM_DELIVERY_RATE_LIMITED', /* …all 9 */ };
// binding: { error: FormDeliveryError, codes: Object.values(FORM_DELIVERY_CATALOG_CODE), codeOf: ({ error }) => FORM_DELIVERY_CATALOG_CODE[(error as FormDeliveryError).code], text: { mode: 'sentence' } }
```

`createErrorDescriber` is not changed and never receives a kebab value. Its vocabulary from the catalog is the constant-token codes plus the bound classes. Approval stays by listing.

No new base class. The existing error classes stay; a class joins the system by being named in a binding. Version conflicts: core ships one sentence set (`VERSION_CONFLICT`, `VERSION_REQUIRED`) and each domain binds its own conflict class to it, as `versionConflictRule` does today.

### 3.2 Reporter: one incident path

```ts
// core/src/errors/reporter.ts
export interface ErrorReporterPorts {
  readonly ids: IdGenerator; readonly clock: Clock; readonly logger: Logger;   // core primitives
  /** Structurally Pick<ObservabilityPort, 'reportError'>; core does not import diagnostics. */
  readonly tracker: { reportError(report: { error: unknown; context: { operation: string; attributes?: Readonly<Record<string, string | number>> } }): unknown };
  readonly catalog: ErrorCatalog;
  readonly versions: { readonly app: string; readonly jini: string };
}
export interface ErrorReporter {
  /** Refusal → its sentence. Anything else → an incident: one ID, one host record, one tracker report. Never throws. */
  describe(required: { error: unknown; step: string; scope: string; fallback: { message: string; action: string } },
           optional?: { errorId?: string; audience?: ErrorAudience; approvedCause?: ApprovedCause; exactSecrets?: readonly string[] }): DescribedFailure;
  /** A failure nobody is shown (job, cleanup, IPC handler): host record + tracker only. Never throws. */
  record(required: { error: unknown; step: string }, optional?: { errorId?: string; level?: 'warning' | 'error'; exactSecrets?: readonly string[] }): { errorId: string };
}
export type ErrorAudience = 'anonymous' | 'signed-in' | 'authorized';
export interface DescribedFailure { readonly kind: 'refusal' | 'incident'; readonly status: number; readonly error: ApiError; readonly failure?: UserFacingError }
export function createErrorReporter(required: ErrorReporterPorts, optional: { redaction?: SecretRedactionOptions } = {}): ErrorReporter;
```

- `fallback` is required at every call, so the reporter has no default sentence and cannot emit a generic one.
- `audience` defaults to `'anonymous'`. `'signed-in'` means an authenticated principal and is what Tovu's `discloseDetails` means today (`site-share-errors.ts:108`). `'authorized'` means the boundary's permission check **for this operation** has also passed. A Jini route pack always answers at the anonymous tier, as it does today.
- The reporter does not format IDs; the host's `ids` port returns them. Hosts mint the existing `ERR-XXXX-XXXX-XXXX-XXXX` format with `mintToolErrorId({ randomHex })` (`daemon/src/tool-recovery/redaction.ts:48`), which is already pure and takes its randomness as a port. It moves to core with its comment so host and daemon share one owner. The reason for one format is functional, not cosmetic: `formatUserFacingError` already finds that shape inside a cause's text, so the ID survives any consumer that keeps only a message string (decision D2).
- The words an incident returns are `"<fallback.message> (error <ID>)"`. This is Tovu's existing convention (`site-share-errors.ts:88`).
- Existing paths become callers: `reportRouteInternalError` (http-kit) and `reportServerFailure` / `adminFailureResponse` (Tovu) call the reporter and keep their own route-specific work. `reportErrorOnce` stays in diagnostics and is what the host passes as `tracker`.

### 3.3 Disclosure: who may read what

The rule, stated once: **redaction removes known secret shapes; it does not decide who may read a fact.** An error message can quote a draft, a customer note or a URL with a query string, and the redactor will not see it (the judge's three canaries pass through unchanged; `redact.ts` says so itself). So no error text is shown to a caller because it was redacted. It is shown only when the owner of that operation approved it for callers who are authorised for that operation.

```ts
// core/src/errors/approved-cause.ts
export interface ApprovedCause { readonly step: string; readonly cause: unknown }   // branded; built only by approveCause
/** Called by the feature that owns `step`. Means: "a caller authorised for this step may read this failure's redacted cause." */
export function approveCause(required: { step: string; cause: unknown }, optional: ApproveCauseOptions = {}): ApprovedCause;
```

The reporter puts a cause into the caller's details only when all three hold: `audience` is `'authorized'`, an `approvedCause` was passed, and its `step` equals the step being described. This is the export pilot's existing behaviour (`SiteShareExportFailure`, `shareFailureOptions`) made into the one way to do it. Redaction still runs on an approved cause, as a second layer.

A type alone does not stop a route from approving its own errors, so `approveCause` has a caller allowlist: a `scripts/guard.ts` rule lists the files that may import it (one today: the site-export feature). Adding a caller is a reviewed diff with the operation owner's reason beside it.

| Reader | Gets | Never gets |
|---|---|---|
| **User** (refusal) | sentence `message` + `action`, `code`, and the own-message reason where the binding says so | — |
| **User, signed in** (incident) | fallback words, error ID, and Copy details: ID, step, **cause summary**, app + Jini version, time. The cause summary is the fixed sentence "The error ID identifies the server report." This is exactly what Tovu sends today | any error message, stack, payload text or label |
| **User, authorised for the operation** (incident) | the same, and the cause summary also carries the listed label (`Error(SQLITE_BUSY)`: class label and code, both approved by listing). An approved cause replaces the fixed sentence | any error message, stack or payload text that no operation owner approved |
| **Visitor / anonymous** (incident) | words + error ID + "Report this error ID." | details, step internals, versions, labels (today's `discloseDetails: false`, kept) |
| **Model** (tool result) | `CODE: text. guidance` for a refusal. For an incident, today's `Error ERR-…: <reason with secret values blanked>` (owner decision 2026-09-16) | Copy details, stack |
| **Library console line** (Jini code with no host) | step, error ID, class label, listed code | message, stack |
| **Host incident record** (operator only) | error ID, step, code/label, message and stack (30 lines) with secret shapes and the host's exact secrets blanked, labels of up to 3 causes, versions, time | values matched by `redactSecrets` + host `exactSecrets` |
| **Tracker** | the same record through `reportErrorOnce` (what Tovu sends today) | same |
| **Persisted rows** (outbox `lastError`, operation rows) | a code from the owner's closed list, or the class label. Nothing else | any message text, any ID appended to the code |

Three honest limits, each with a decision:

- The host incident record **can** contain private text that an error message quoted (a draft line, a query string). Revision 1 claimed it could not; that claim is withdrawn. What is true: the reporter attaches no request body, header, cookie or query string of its own, and the record is never returned to a caller. It is an operator-only store under the host's diagnostic policy.
- The tracker is a third party in some deployments and receives that same text today. Unchanged here; decision D10.
- The model path shows a reason with secret values blanked. That is the same class of risk and an existing owner decision. Unchanged here; decision D12.

Other rules kept from revision 1: redact whole fields before cutting them; attributes are fixed labels and IDs, capped; `error.code` and `error.name` are caller-writable, so only listed values print; placeholder values from `params` are IDs and counts, passed through `redactSecrets` and capped at 128 characters.

**The class-only question, resolved.** Keep class-only for the line a library prints on its own, because a library cannot know the host's secrets. That line is not the record. The record is written by the host's reporter. `createErrorReporter` has no optional sink, the Tovu composition root passes `diagnostics` and `onInternalError` built from it (E3), and a bound class logs as `FormDeliveryError` with its listed code instead of `Error`.

**Persisted correlation (finding 10).** A persisted row stores no error ID. The correlation key is what the row already has: its row ID and attempt count. At each ordinary delivery failure the worker writes one log entry through its existing `report` helper with `{ outboxId, attempt, lastError }` and the original error (which the host sink receives). A status view shows the row ID as the reference in Copy details and "attempt N" in the step. No schema change, no adapter change, `lastError` stays an exact code, and legacy rows read as before.

### 3.4 The shape at every boundary

Two wire envelopes stay (Jini nested, Tovu admin flat). What is unified is the decoded shape (`DecodedApiError` → `UserFacingError`) and the one function that builds it on the client.

No new incident block goes on the wire. Revision 1 added a typed `details` to Jini route errors; that is withdrawn, because a Jini route cannot know the caller's tier and the client can build the same block itself (below). The only protocol addition is for i18n:

```ts
// protocol/src/errors.ts (additive; ApiError itself is unchanged)
/** Interpolation values for a refusal's sentence: `details.params`, a sibling key legal beside any `kind`. */
export function readErrorParams(required: { details: unknown }, optional: ReadErrorParamsOptions = {}): Readonly<Record<string, string | number>>;
```

| Boundary | Today | Design | Old reader × new response | New reader × old response |
|---|---|---|---|---|
| Tovu admin route JSON | flat `{ error, code, errorId, details.failure }` | **unchanged shape.** Only the inside of `reportServerFailure` / `adminFailureResponse` changes (they call the reporter) | identical bytes for the same input; pinned by characterization tests | n/a |
| Jini route JSON | `{ error: ApiError }` + `requestId` | **unchanged shape.** `reportRouteInternalError` calls the reporter; the answer is still `INTERNAL_ERROR` + `requestId`. The client builds Copy details from what it knows: the request (step), the ID, its own app and Jini versions, the time it got the answer, and the fixed cause sentence. Tovu's `publishAdminFailure` already does this for responses without `details.failure` | identical bytes | n/a |
| HTTP status of a refusal | closed table; a feature code answers 500 | `RouteHostContext.statusFor?` (typed, optional); all 11 `statusForError` call sites use `routeStatus({ error }, { host })` = `host?.statusFor?.({ error }) ?? statusForError({ error })` | n/a | a host that passes nothing gets today's table |
| AG-UI / chat run events | `RunErrorPayload { message, error? }`; several emitters send `message` only; six consumers rebuild a plain `Error` | emitters use one `runError(...)` helper that fills `error` (code, `requestId`, incident details) and puts the ID in `message`. Consumers build one typed `RunFailure` through one function. The saved status event keeps the ID and the failure fields | an old client shows `message`, which now ends in `(error ERR-…)` | a new client reading an old frame gets a `RunFailure` with no ID and shows the words |
| Agent tool results | `ToolInputError` text, or `Error ERR-…: reason` | unchanged for the model. The tool card builds `ErrorNotice` from the existing `errorId` | n/a | n/a |
| Outbox / background jobs | `lastError: 'Error'`; original never logged | `lastError` = a code from the policy's closed list, else the class label; one log entry per failure keyed by row ID + attempt | status view reads an exact code, as today | legacy `Error` rows map to `delivery-failed`, as today |
| Electron IPC | a throwing handler rejects with its raw message | a throwing handler **still rejects**; the message is now the fallback words + `(error ERR-…)`; the incident is recorded in main. Bridge types, preload and the 16 `ok: false` sites (7 files) unchanged | a renderer `catch` runs exactly as before and shows safe words | n/a |
| Sidecar JSON IPC | frame-parse reply carries the raw `SyntaxError` message; handler failure is already `HANDLER_ERROR` + `requestId` | two separate changes: the parse refusal answers a fixed `BAD_FRAME` sentence; the handler incident goes through an injected reporter port and keeps its code and `requestId` | a peer reading `{ code?, message, requestId? }` is unaffected | n/a |
| CLI | `ValidationError` text | prints sentence words; an incident prints the error ID and where the record is | n/a | n/a |

Chat detail (finding 7). `chat/src/core/run-failure.ts` holds `class RunFailure extends Error { readonly apiError?: DecodedApiError }` and `runFailureFromPayload({ payload })`. `RunHandlers.onError` keeps its type (`(err: Error) => void`), so its 55 references compile unchanged. The six rebuild sites call the one function. The status event becomes `{ kind: 'status', label, code?, failure? }` where `failure` is the ID, step, time and versions (five short strings per failed run in the saved transcript). The clean-abort path (`RUN_ERROR` with `code: "abort"`) is pinned by a test before anything else moves. One `RUN_ERROR` event carries all of its own metadata, so correctness does not depend on how the stream is cut into network chunks. `runError` takes the run's audience: a visitor run (site chat, embed widget) gets words and the ID only.

How AG-UI carries the `ApiError`: in the event's standard pass-through field `rawEvent`. **Not verified**: that the pinned AG-UI encoder and validator keep `rawEvent` on a `RUN_ERROR` (dependencies were not installed in this run). E8's first test is that round trip. If the field is stripped, the ID still arrives because it is in `message`; step, time and versions then come from a `CUSTOM` event written just before `RUN_ERROR`, held in the existing translation state and applied when `RUN_ERROR` arrives.

Electron detail (finding 8). `handleIpc({ channel, handler, reporter, fallback })` registers `ipcMain.handle(channel, …)`, awaits the handler, and on a throw calls `reporter.record` and throws `new Error("<fallback.message> (error <ID>)")`. A handler that returns `{ ok: false, … }` is passed through. Before the 56 sites are wrapped, E9 lists every renderer `catch` (37 today) that matches on message text; any such site is migrated to a structured result first, in its own commit.

### 3.5 i18n

Tovu's rule is `t("full English sentence")` with 21 locale blocks.

- **Owner of the words.** A feature's `errors.sentences.ts` holds its sentence set and imports only `core/src/errors/sentences`. The admin bundle imports these files. Class bindings live in `errors.bindings.ts`, which imports the classes and is server-only.
- **Proof that a sentences file is browser-safe.** Two checks, both in E5: (1) a `scripts/guard.ts` rule: a `*.sentences.ts` file has exactly one import, type-only or not (banning all others makes the rule independent of each package's `verbatimModuleSyntax` setting); (2) a build check that bundles every sentences file for the browser with Node built-ins marked as errors.
- **Wire.** The server sends the rendered English `message` (for API clients, logs and models), the `code`, and `details.params` when the sentence has placeholders. `readErrorParams` accepts only string and number values and at most 16 keys.
- **Client.** `interpolate(t(sentence.message), params)` when this build knows the code; otherwise the server's English text. An old client ignores `details.params` and shows the English text.
- **Completeness.** Every string from `catalog.sourceSentences()` must be present in each of the 21 dictionaries. The check is built from the sentence files the admin bundle actually imports, not from a hand list.
- The Copy-details block stays in English on purpose: it is pasted into an issue.

Follow-up kept from revision 1: `asPage()` in `admin-failure-channel.ts` rewrites "post" to "page" by regex on English text. It needs a `{noun}` placeholder (E10).

### 3.6 UI

Reuse: `ErrorNotice` and `createFailureChannel` stay in `ui/panel-kit`.

| Piece | Where | Note |
|---|---|---|
| `failureFromResponse({ body, status, method, route }, { vocabulary, catalog, t, versions, redaction })` | `ui/src/features/panel-kit/failure-from-response.ts` | The generic half of Tovu's `publishAdminFailure`. Uses `details.failure` when the response has it and otherwise builds the block from the request, the ID and the client's own versions. Tovu keeps the host half: vocabulary, the signed-in check, the page/post wording |
| `useReportFailure()` | admin kit, chat kit, ui kit (each declares the slot; the host binds one channel) | Returns `report({ error, message, action, step })` |
| `ErrorNotice` prop `disclosure: 'full' \| 'id-only'` | existing component | `id-only` is the visitor form |
| Chat run-failure card | `chat/src/react` | Built from a `RunFailure` or a saved status event; Tovu keeps "switch agent" |

A hook surfaces a failure in exactly two ways: a refusal becomes inline text next to the field or action; anything else goes to `report(...)` and the notice. A hook never stores a caught value's own text in state.

### 3.7 Gate

Same pattern as `check-log-safety.mjs`: ESLint, a checked-in debt list that may only shrink, `--list` for lanes. Three rules in three files (`scripts/eslint-rules/errors/*.mjs`, each under 150 lines), with one precedence order.

**Rule 1, `catch-reads-error`.** A `catch` clause or a `.catch(handler)` must reference the caught value, or be a call to a named idiom (§3.8), or be a **pure-parse refusal**:

- the `try` block has no `await`, `yield` or `for await`; and
- every call or `new` in it is on the rule's list: the built-in parsers and decoders (`JSON.parse`, `new URL`, `decodeURIComponent`, `atob`, `TextDecoder#decode`, …), built-in string / array / regex methods by member name, bare `new Error()` used to jump to the catch, or a function on the gate's **`pureHelpers` list**; and
- the `catch` block is not empty.

`pureHelpers` is a checked-in list of `{ name, module }` pairs. The rule resolves the identifier's import and compares the module path, so a different function with the same name does not qualify. A helper is added by review (synchronous, no I/O). The ten entries needed today: `addMoney`, `parseRequestUrl`, `redactJsonResponseBody`, `fromBase64Url`, `resolveSameOriginPath`, `redactAdminRunContextRef`, `isLoopbackHost`, `resolveBindHost`, `isLocalAdminUrl`, `readPickedFolders`. A comment no longer excuses an empty catch.

**Rule 2, `no-generic-failure-text`.** A deny-list of phrases in string literals and templates (`unknown error`, `internal error`, `something went wrong`, `request failed`, `operation failed`, `an … error occurred`). Baseline: 244 literals in 79 Tovu files, 76 in 54 Jini files (regex count, not hand-checked).

**Rule 3, `failure-text-from-catalog`.** Inside a `catch`, a string literal passed to `res.status(5xx).json`, or to a `set*Error` / `store.set` call, is an error. `new X("…")` without `{ cause }` is an error **unless** the same catch hands the caught value to `reporter.record`, `reporter.describe`, a logger call or an idiom. That exception is the deliberate "record privately, throw sanitised" shape (8 real rows drop the cause on purpose because it can hold secrets).

**Precedence.** (1) A file on the sanctioned-module list (the reporter, the logger, the five reporting modules in `SITES.tsv`) is skipped by all three rules. (2) A pure-parse refusal satisfies rule 1 **and** rule 3's cause clause (the only cause is a `SyntaxError` that quotes the input, and dropping it is the safe choice); rule 2 still applies to its words. (3) Everything else gets all three.

**Executable examples (finding 11).** `work/fp-recheck.cjs` implements the pure-parse test. Run on the tree: of the 82 rows revision 1 called parse refusals, **65 pass unchanged**, 10 pass once the helper above is listed, and 7 fail because they are not parse refusals (now real). Of the 200 real rows, **0 pass**. The three sites the judge named pass (`SharedKeys.hooks.ts:137`, `byok-meta-tool-result.ts:93`, `consent/config.ts:79`), and `backstop-service.ts:116` passes rules 1 and 3 through precedence step 2. E0 copies those 75 sites and the 7 failures into the rule's fixture tests before any baseline is generated. Limits of the prototype: it lists built-in methods by member name without type information, and it does not implement rules 2 and 3; those two were checked by reading, not by running.

**Scope.** The gate covers `packages/*/src` and `apps/*/src`. Standalone skill scripts (`agent-runtime/src/skills/**/scripts/**`) run in a user's project with no reporter and no core import; they are outside the gate (5 rows). Plugin payloads that cannot import core (2 rows) stay on the debt list until decision D9.

Where the rule files live: Jini `scripts/eslint-rules/errors/`, with byte-identical copies in Tovu `development/eslint-rules/` and a hash check in Tovu CI (decision D5).

Gate limits, stated so nobody over-trusts it: it cannot tell a good sentence from a vague one outside the deny-list; it does not follow a caught value through helper functions; reading the value is not handling it; member names are not types. Review still owns those.

### 3.8 Named idioms

In `core/src/errors/idioms.ts`, pure, each under 15 lines, each `(required, optional = {})`:

| Idiom | Contract | Replaces | Rows |
|---|---|---|---|
| `observed({ promise })` | marks a promise handled; every awaiter still gets the rejection. Returns nothing | `void p.catch(() => {})`, reloads a query owns, mutations that show their own error | 39 |
| `afterSettled({ promise })` | resolves when the promise settles, never rejects. Only for a promise whose rejection another named owner already receives | queue tails (`prev.catch(() => {}).then(fn)`) | 22 |
| `orFallback({ work, fallback, step }, { observe })` | runs `work`; on **any** failure returns `fallback`. `step` is a fixed label naming the optional probe. `observe`, when given, receives the error | optional probes, error-body parses, documented fallbacks: `fetch(...).catch(() => null)`, `response.json().catch(() => null)` | 15 |
| `orFallbackSync({ work, fallback, step }, { observe })` | the same for a synchronous `work` | browser storage that may throw | 1 |
| `bestEffort({ work, step, logger })` | runs cleanup; a failure is logged (class + code + step) and never thrown | `await x.close().catch(() => undefined)` | 89 (W3) |
| `absentWhen({ work, codes, kinds })` | returns `undefined` only for the listed codes (`ENOENT`) or classes, **rethrows the rest** | `readFile(p).catch(() => null)` where a real failure must not look like "absent" | 32 (W5) |

`orFallback` exists because of finding 12: an optional HEAD probe, a daemon status probe and a legacy-store dry run all mean "any failure is no answer", and `absentWhen` would have turned them into thrown errors. `orFallback` returns exactly what the site returns today. It is not a way back to silent swallowing: the call names its step, the gate's `--list` prints every use, and a site where a failure should be visible belongs in W5, not here.

`bestEffort` takes a `Logger`, so a cleanup failure is no longer invisible. Cost: one closure and one promise per call, on paths that already await I/O.

## 4. Sweep plan

Every step compiles and passes alone. Bug fixes are red-first: write the failing test, show it red, mutate the fix to confirm the test can fail, then fix. Tests use fakes of interfaces from the package under test.

| Step | What | Repo | Needs | Behaviour change | Tests (red-first where a bug) |
|---|---|---|---|---|---|
| **E0** | Gate in WARN mode. Three rules with fixture tests built from real sites (75 passing parse refusals, 7 failing ones, one site per idiom, the `backstop-service` precedence case), then debt baselines | both | — | none | each fixture is a copied real site; the combined rule set is run on it |
| **E1** | Outbox. (a) `OutboxRetryPolicy.failureCodes?: { codes: readonly string[]; codeOf(required: { error }): string \| undefined }`. The worker stores `codeOf(...)` only if it is in `codes`; anything else, and any throw (reported with the existing `reportPolicyFailure`), stores the class label. (b) one `report(...)` call per ordinary failure with `{ outboxId, attempt, lastError }`. (c) `formDeliveryRetryPolicy` declares the nine ledger codes. (d) correct the comment in `delivery/errors.ts` | Jini infra + cms | — | codes reach the status view again; one new log entry per failed delivery | **infra**, fake policy + memory outbox: listed code stored; code-shaped canary not on the list → label; `codeOf` throws → label, policy failure reported, **the next row in the same batch is still processed**; ordinary failure logs once with row ID and attempt. **cms**, own error + fake boundary: `new FormDeliveryError({ code: 'rate-limited', retryable: true })` → `codeOf` gives `rate-limited`; unknown code → `delivery-failed`; `formDeliveryStatusFromOutbox` on a row with `lastError: 'rate-limited'` gives `rate-limited` |
| **E2** | `core/src/errors/`: sentences, bindings, catalog, reporter, approved cause, idioms, recording fakes (`testing.ts`); move `mintToolErrorId` to core (1 caller) | Jini core | — | none | the five catalog contract cases (§3.1); reporter: unknown error → incident with ID from the fake `IdGenerator` and time from the fake `Clock`; refusal → no tracker call; never throws when logger or tracker throws. **Disclosure**: the canaries "Private draft body: Acme merger closes Friday", "customer memo: violet-unlisted-passphrase" and a URL with a private query string, thrown as `error.message`, appear in **no** caller-visible output for `anonymous` or `signed-in`, nor for `authorized` without an approved cause, nor with an approved cause for a different step; they appear only for `authorized` with a matching approved cause. The class/code label appears only for `authorized` |
| **E3** | Host wiring: one catalog + one reporter in the Tovu composition root; one host logger factory replaces the 17 bare `createConsoleLogger` calls and passes `diagnostics`; `onInternalError` passed to every Jini route pack. Same in Jini `server` | Tovu, Jini server | E2 | originals now reach the host record | a throwing Jini route under the Tovu app writes one incident record with the same ID the response carries (red today: class only). The 17 loggers are built at import time today; the lane moves construction into the composition root or passes the logger in |
| **E4** | One incident path. First: characterization tests of today's Tovu responses (clock and IDs pinned): plain incident, anonymous, export pilot, `field: "message"`, extra `details`, `DatabaseDiskSpaceError`, a cause that already holds an ERR ID. Then `reportRouteInternalError`, `reportServerFailure`, `adminFailureResponse` call the reporter. Remove the 3 reporter guards that the never-throws contract makes dead | both | E3, E6a | none on the wire; IDs become ERR format (D2) | characterization suite stays identical except the ID format. **Old reader × new response**: frozen copies of today's `approvedFailure` and `exportFailureFields` (taken at `80b00f5b`) are fed the new responses and give the same fields as before. **New reader × old response**: fixtures of today's four shapes, including a UUID error ID |
| **E5a** | `RouteHostContext.statusFor`; `routeStatus` used at all 11 `statusForError` call sites; fakes updated | Jini core, http-kit, daemon | E2 | none until a host passes a resolver | through `mountJsonRoute` with a fake host: a handler returning a feature refusal answers that sentence's status (red today: 500); no host resolver → today's table |
| **E5** | Catalog adoption per feature (file-disjoint lanes): each rule array becomes one scope; each feature gets `errors.sentences.ts`. Order: form delivery, version conflicts, then the 18 files with rule arrays. Guard rule + browser bundle check for sentences files | both | E2, E5a | status of feature codes that fell to 500 | per feature: for every bound class, the exact model-facing string for **each distinct construction site** found by search (`MemberValidationError`: the invalid-email and blank-name messages), compared with a snapshot taken before the lane; one test per code for status and retryable |
| **E6a** | `failureFromResponse` (both envelopes, with or without `details.failure`); `useReportFailure`; `disclosure` prop | Jini ui, Tovu admin | E2 | none (readers only) | flat envelope with details, flat without, nested with `requestId`, no ID at all: each gives the expected notice text |
| **E6** | Chat run-failure card; sweep **W6** (13 real sites) | Jini ui/admin/chat/commerce, Tovu admin | E6a, E4 | users see ID + Copy details instead of a fixed sentence | per site: a rejected fake port yields a notice whose copy text contains the ID and step and does **not** contain the canary text |
| **E7** | Pattern sweeps, one lane per pattern per package: **W1** idioms (77 rows, no behaviour change), **W3** cleanup (89), **W5** absent-vs-failed (32), **W4** dropped notification / alert / write (18), **W7** log text (11), **W8** cause kept (37) | both | E0, E2 | W1 none; W3/W7 add log lines; W4/W5/W8 turn a silent path into a recorded or typed failure | W1: each migrated site's return value on rejection is asserted equal to today's. W5: `lifecycle.get` rejecting with a storage error must not answer `NOT_FOUND`. W8: a failed stdin read in `init` is not reported as "expects a JSON object". Stripe: the outcome is still `unknown` and the transport error is recorded once |
| **E8** | Chat. Pin clean abort and "terminal state wins" first. `runError` helper for the 12 `event: 'error'` emits in daemon; `RunFailure` + `runFailureFromPayload` at the six rebuild sites; status event keeps `failure`; Tovu's AG-UI bridge forwards `payload.error` and stops sending raw `error.message` | Jini daemon/chat, Tovu website/admin | E2, E6 | run errors carry code + ID; `assistant-ag-ui.ts:560` no longer discloses a raw message | one chain test per transport: fake emitter → real encoder → real decoder → `onError` receives a `RunFailure` with the ID → status event → saved → reloaded → notice copy text has ID and step. A consumer that does `new Error(err.message)` still yields the ID |
| **E9** | Electron: inventory of renderer catches that match on text; `handleIpc` for the 56 `ipcMain.handle` sites. Sidecar: parse refusal and handler incident, separately | Tovu desktop, Jini sidecar | E3 | renderer sees safe words + ID instead of a raw message | a throwing handler **rejects**; the rejection text has no raw message and has an ID that is in the main-process record; `getAppVersion` still resolves a string; an `ok: false` owner is passed through. Sidecar: a bad frame gets the fixed sentence and no input echo; a handler throw keeps `HANDLER_ERROR` + `requestId` |
| **E10** | i18n: sentences in the 21 locale blocks; completeness check; `details.params`; `{noun}` placeholder instead of `asPage()` | Tovu admin, Jini protocol | E5 | translated refusal text | check fails on a missing sentence in any locale; an old client fixture ignores `details.params` |
| **E11** | Gate to ERROR, package by package, when that package's debt rows reach 0 | both | E7 | none | — |

The wider class (§2.5: 1,871 handlers) is not swept by row. It enters the debt list in E0 and shrinks when a file is touched.

Untangle interaction: E2 adds a new core folder. E5a edits `core/src/contracts/server/` (the folder lane C4 created) and `http-kit`; E4 edits `http-kit/src/internal-error.ts`. All start only after wave B is merged. Debt entries are path-keyed: a lane that moves a file moves its debt rows in the same commit.

## 5. Rough cost

| Step | Design / review (Opus) | Build (Sonnet) |
|---|---|---|
| E0 gate (3 rules, real-site fixtures) | 30k | 150k |
| E1 outbox fix + failure log | 15k | 70k |
| E2 core errors (two relations, reporter, disclosure tests) | 80k | 220k |
| E3 host wiring | 30k | 120k |
| E4 one incident path, both-direction fixtures | 40k | 140k |
| E5a status resolver | 15k | 80k |
| E5 catalog adoption (about 20 lanes, sentences + bindings) | 50k | 600k |
| E6a + E6 UI + W6 | 40k | 260k |
| E7 pattern sweeps (264 rows) | 30k | 600k |
| E8 chat end to end | 40k | 280k |
| E9 Electron + sidecar | 30k | 250k |
| E10 i18n | 10k | 130k |
| **Total** | **about 410k** | **about 2.9M** (2.88M summed) |

By analogy with the untangle lane costs, not measured. Revision 1 said 330k + 2.4M; the difference is the work the judge showed was missing (status threading, chat consumers, both-direction fixtures, sentences/bindings split). E1 can ship on its own.

## 6. Owner practices, checked one by one

| # | Practice | Status | Conflict flagged |
|---|---|---|---|
| 1 | DI via typed ports | Reporter takes `ids`, `clock`, `logger`, `tracker`, `catalog`, `versions`. `statusFor` is a typed field on the existing host context. The sidecar gets its reporter as an option | **Existing:** `http-kit/src/internal-error.ts` imports `randomUUID` directly; E4 removes it. Tovu's `reportServerFailure` defaults `errorId = randomUUID()`; E4 replaces the default with the reporter's ID port |
| 2 | `(required, optional = {})` | Every new function, including all six idioms (revision 1's positional idioms were wrong) | **Existing:** the files built on use `_optional: Record<string, never> = {}` (`describeErrorForLog`, `statusForError`, `createErrorDescriber`, `FormDeliveryError`). Not copied, not fixed here (separate args sweep) |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | Planned: sentences ≈ 60 lines, bindings ≈ 70, catalog ≈ 160 (`match` split into `matchBinding` / `resolveCode` / `resolveText`), reporter ≈ 170 (`describe` split into `refusal` / `incident` / `disclose`), approved-cause ≈ 30, idioms ≈ 80, each lint rule < 150. To be re-checked inside each file at build time | **Existing:** `worker.ts` `recordOutcome` is near the limit; E1 adds a separate `failureLabel` function instead of growing it |
| 4 | Feature slicing | Sentences and bindings live in the feature folder next to its error classes | — |
| 5 | No barrels / shells / forwarders | `core/src/errors/` has no index file. If `reportRouteInternalError` or `reportServerFailure` becomes a pure forwarder after E4, delete it and repoint callers | **Existing:** `core/src/primitives/index.ts` is a barrel; not touched |
| 6 | Why-comments move with code | E1 and E4 touch heavily commented files; lanes carry the comments, move the ERR-ID comment with the mint function, and correct the one that is now false (`delivery/errors.ts`: "the outbox persists `error.message` verbatim") | — |
| 7 | Generic → Jini; a Jini package imports only itself + core + protocol | Catalog, reporter, idioms in core; wire types in protocol; UI in ui. cms mirrors the retry-policy type structurally, as it does today. Host policy (audience, vocabulary, approved causes, redaction options, versions) stays in Tovu | — |
| 8 | Tests use fakes of interfaces; red-first + mutate | Recording fakes ship in `core/src/errors/testing.ts`. Revision 1's cms test used the real infra worker; it is replaced (E1) | — |
| 9 | Errors never swallowed or generic | `fallback` is a required argument. `orFallback` is the one place a failure becomes a value, and it is named, labelled and listed | **Tension, flagged:** `orFallback` without `observe` discards the error by design. It is limited to optional probes; decision D8 |
| 10 | No new eslint-disable / @ts-ignore; no silent behaviour changes | The gate has a debt list, not disables. Every behaviour change is named per step | **Existing:** `internal-error.ts` has two `eslint-disable-next-line no-console`; they go when the file calls the reporter |
| 11 | Smallest change; reuse first | No new base class, UI component, envelope or sink port. Revision 2 **removes** a change revision 1 proposed (retiring the flat envelope) and keeps rejection semantics in Electron | — |
| 12 | Memory / IO cost | Catalog: one `Map` by code, per-scope arrays; matching runs on the failure path only. Reporter: one log write and one tracker call per incident. E1: one log entry per failed delivery, bounded by batch size. Chat: five short strings per failed run in the saved transcript. Nothing on a success path | — |

## 7. Lessons applied (all 24)

1. Dependency graph: the catalog sits under three consumers (model rules, caller-safe rules, describer); it feeds them and does not add a fourth list.
2. Inventory first: §2.1 and §2.7 list owners and consumers with counts. E9 inventories renderer catches before wrapping.
3. Late-bound reads: the 17 loggers are built at import time; E3 must not replace them with a reporter read at module scope.
4. Inputs, outputs, state owner: catalog immutable after creation; reporter stateless; the failure channel owns the one retained failure.
5. Migration graph: §4 lists prerequisites; readers (E6a) land before producers (E4).
6. Tests that can fail: disclosure tests use private prose; E1 tests the next row in the batch; E4 pins clock and IDs.
7. Distinct contracts: refusal, incident, optional probe (`orFallback`), absent (`absentWhen`) and uncertain payment outcome are separate and stay separate.
8. Limits inside files: practice 3.
9. Generic vs host: audience, approved causes and vocabulary stay in Tovu.
10. Untangle lanes: end of §4; debt rows follow moved files.
11. Seams exist: `RouteHostContext`, `reportPolicyFailure`, the admin kit's `ErrorNotice` slot and `development/eslint-rules/` all exist today. TypeScript for the prototype was found and used; the ESLint rule runner was not exercised.
12. Port bindings behave, not just type-check: `failureCodes` returns a value that is checked against a list; the E1 test passes a real policy through the worker, not a structurally similar object.
13. Security gates across the chain: `audience` is set only after authentication and the operation's permission check; the E2 tests fail if either condition is removed.
14. Streaming lifecycle: E8 pins clean abort and terminal ordering before changing emitters.
15. Owner constraints as acceptance criteria: the two gate scope exclusions are recorded as decision D9 and their rows are counted, not dropped.
16. / 17. Concurrency and no-op: not in scope; E1 adds no write on the success path and no extra row write on failure.
18. Transport write is not a consumer transaction: one `RUN_ERROR` event carries its own metadata.
19. A shared name is not a correlation ID: persisted rows are correlated by row ID + attempt, not by code.
20. Explicit absence checks: `statusFor` returning `undefined` means "use the table"; a status of `0` is never treated as absent.
21. Redundant guards: the three reporter guards are removed only after the never-throws contract is tested.
22. Import classification: the sentences guard bans all imports but one, type-only included.
23. Configured ≠ demonstrated: the AG-UI `rawEvent` carrier is not assumed; its round trip is E8's first test, with a stated fallback.
24. The five error-system classes: see "Judge response".

## 8. Not verified

- Nothing was built and no test was run. Dependencies are not installed in this checkout.
- That the AG-UI encoder keeps `rawEvent` on `RUN_ERROR` (§3.4).
- Rules 2 and 3 of the gate were not prototyped; only rule 1's parse exemption was run.
- The prototype approves built-in methods by member name, without types.
- The 190 rows revision 1 called real keep its read depth (line or 10-line context); 7 are still `unclassified-swallow`.
- Whether each of the six daemon `statusForError` sites has the host context in reach (the http-kit sites do).
- How many places build a `RouteHostContext` in Tovu.
- Which renderer catches match on message text (E9's first task).
- That every `own-message` binding's construction sites build messages from fixed text and the caller's own input. Each rule array's doc says so today; E5 lanes re-read them.
- The deny-list baseline (244 / 76) is a regex count.
- The "13 classes / 4 wire codes" claim from the lost-updates design (§2.4).
- The estimates in §5.

## 9. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Log policy: library line = class + listed code + ID; host record = message and stack with secrets blanked, operator-only | Yes |
| D2 | One error ID format | Mint `ERR-XXXX-XXXX-XXXX-XXXX` for every new incident. It is the only format the formatter can recover from plain text, which the chat and Electron paths rely on. Existing UUID IDs stay readable |
| D3 | Wire field name | Keep `requestId` (Jini) and `errorId` (Tovu flat envelope) as they are; show both as "Error ID" |
| D4 | Retire Tovu's flat admin envelope | **Withdrawn. Keep it.** Two shipped readers depend on `details.failure` |
| D5 | Where the lint rules live | Jini, with hash-checked copies in Tovu; a shared lint package only if a third consumer appears |
| D6 | What a user sees as "cause" | Signed in: the fixed sentence, as today. Authorised for the operation: also the listed class/code label. Message text only where the operation's owner approved it (the export pilot today). Revision 1's "redacted first line for every signed-in user" is withdrawn |
| D7 | Ship E1 alone, now | Yes |
| D8 | Sweep the wider class by row, or ratchet | Ratchet. `orFallback` without `observe` is allowed for optional probes only |
| D9 | Gate scope for code that cannot import core | Exclude standalone skill scripts (5 rows). For plugin payloads (2 rows) either allow a core import or accept permanent debt rows |
| D10 | The tracker receives message text with secrets blanked | Keep as today; if the tracker is a third party, switch it to label + ID only |
| D11 | Own-message reasons shown to users are English only | Accept for adoption; structured variants per domain later |
| D12 | The model sees an incident's reason with secret values blanked (2026-09-16) | Unchanged here; same class of risk as D6, worth a second look |
