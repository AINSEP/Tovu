# One error system for Tovu + Jini (design, 2026-11-16)

Design only. No source file was edited. Read against Jini `integ/wave-b-r2` @ `02edbb68` and Tovu `integ/wave-b-r2` @ `80b00f5b` (worktree), planning base `plan/terra-2026-11-15` @ `9152711d`.
Personas: software-architect (lead), programmer, security, tdd. Skills: implementation-guardrails, hexagonal-architecture, api-design, interface-design, testable-design-patterns, test-design, secure-input-handling.

Words used here:
- **Refusal**: an expected "no" (bad input, not found, conflict, not allowed). The caller can act on it. No incident.
- **Incident**: an unexpected failure. It gets an error ID, a redacted record on the server, and a tracker report.
- **Catalog**: the list of error codes a feature declares (code, HTTP status, retryable, user-safe words).

## 1. Verdict

**About 60% of the owner's error system already exists, in four unconnected pieces.** Nothing new needs inventing for the user-facing shape, the Copy-details block or the shared notice. What is missing is the one contract that ties codes to words, one incident path, and the host wiring.

The three biggest findings, each checked in code:

1. **Wave B's "originals go to a host sink" has no sink in Tovu.** Tovu calls `createConsoleLogger` 17 times in 17 files and passes the `diagnostics` sink zero times. No non-test Tovu file passes `onInternalError` (0 hits; 4 hits are tests). So an unexpected failure inside a Jini route or a Jini logger call reaches Tovu's console as a class name (`Error`) and the original is dropped. Logs are safe but useless. (§2.3)
2. **The outbox regression is real and one line.** `packages/infra/src/events/outbox/worker.ts` `recordOutcome` writes `error: describeErrorForLog({ err: error })` (commit `bc545d4d`, 2026-11-15; before it was `error.message`). `FormDeliveryError` codes are kebab-case (`rate-limited`), not in core's approved-code set, and the class is not registered, so the stored value is `Error`. `cms/src/forms/delivery/status.ts` then maps `Error` to `delivery-failed`. Every delivery failure now shows as the catch-all. (§8 step E1)
3. **The input list is stale for Tovu and too narrow for both repos.** Of 228 Tovu input rows, 150 are no longer flagged on `integ/wave-b-r2`. And the audit's two rules see only a slice of the class: a census of every `catch` shows 1,871 handlers that never read the caught value (§2.5). The gate has to cover that class, not the 369 flagged rows.

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
| 17 | IPC error shape | Jini `sidecar/src/json-ipc.ts` `jsonIpcError` → `{ code?, message }` with the raw `error.message` | Desktop/sidecar replies | Tovu desktop has 56 `ipcMain.handle` sites in 12 files and no shared error helper |

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

### 2.6 Classification of the flagged sites

`SITES.tsv` has 525 rows: the 369 sites flagged today plus the 156 input rows that are gone.

| | real | false positive | gone |
|---|---|---|---|
| Tovu | 10 | 69 | 150 |
| Jini | 180 | 110 | 6 |
| Total | **190** | **179** | 156 |

How much was checked: I read the flagged line (plus the line above, or the first lines of the catch block) for all 369 current rows, and 10 or more lines of context for 15 of them (`read_depth = context`). Seven multi-line Jini sites were not read and are marked `unclassified-swallow`. The 156 gone rows were decided by the script (same rule and file no longer flagged), not by reading. Pattern assignment is a regex pass plus 73 hand corrections (`work/classify-overrides.json`); expect some rows to move between patterns when a lane reads the full function.

Real, by pattern: best-effort cleanup 77, failure treated as "absent" 31, user sees fixed words with no ID 13, typed error or result without the cause 22, cause dropped on purpose because it may hold secrets 8, log line with fixed text 11, dropped notification / alert / write 16, other 12.
False positive, by pattern: parse refusal with specific words 82, promise marked as observed 29, queue tail 24, error-body parse 12, reload owned by a query 7, documented fallback 5, reporting path guarding itself 8, other 12.

## 3. The mechanism

Three pieces in Jini core, each a pure addition, plus host wiring. Everything else is an existing owner used as it is.

```
feature (owns codes + words)           host (owns ports)                boundary
defineErrors([...]) ──────────► createErrorCatalog({ entries })
                                createErrorReporter({ ids, clock,      route / tool / job / IPC
                                  logger, tracker, versions, catalog }) ──► describe(error, step)
                                                                           ├─ refusal  → ApiError (code, words)
                                                                           └─ incident → log + tracker + ApiError
                                                                                         (code, words, requestId, details)
client: decodeApiError → formatUserFacingError → FailureChannel → <ErrorNotice/>
```

### 3.1 Catalog (a): codes owned by features, registered through one contract

New folder `core/src/errors/` (pure; allowed in core by untangle rule B2: types, constants, pure functions, factories whose state lives in the returned object).

```ts
// core/src/errors/catalog.ts
export interface ErrorEntry {
  /** SCREAMING_SNAKE, namespaced `<DOMAIN>_<REASON>`. Generic protocol codes are reserved for core. */
  readonly code: string;
  readonly status: number;                 // HTTP status at a route boundary
  readonly retryable: boolean;
  /** Plain words: what failed. English source sentence; `{name}` placeholders only. */
  readonly message: string;
  /** Plain words: what to do next. */
  readonly action: string;
  /** Class matched with instanceof (same shape as ModelFacingErrorRule.error). Absent: matched by `code`. */
  readonly error?: abstract new (...args: never[]) => Error;
  /** Reads the placeholder values from a matched error. Values are ids and counts, never free text. */
  readonly params?: (required: { error: Error }) => Readonly<Record<string, string | number>>;
  /** 'public' may be shown to anyone; 'signed-in' only after authentication. */
  readonly audience: 'public' | 'signed-in';
  /** Appended for the model only (today's ModelFacingErrorRule.guidance). */
  readonly modelGuidance?: string;
}
export function defineErrors(required: { domain: string; entries: readonly ErrorEntry[] }, optional: Record<string, unknown> = {}): ErrorCatalogPart;
export function createErrorCatalog(required: { parts: readonly ErrorCatalogPart[] }, optional: { onDuplicate?: 'throw' | 'warn' } = {}): ErrorCatalog;
export interface ErrorCatalog {
  find(required: { error: unknown }): ErrorEntry | undefined;      // class first (newest part first), then own `code`
  byCode(required: { code: string }): ErrorEntry | undefined;
  describer: ErrorDescriber;                                        // today's createErrorDescriber, fed from the entries
  modelFacingRules(required: { domain: string }): readonly ModelFacingErrorRule[];
  sourceSentences(): readonly string[];                             // for the i18n completeness check
}
```

Rules:
- A feature exports one `ErrorCatalogPart` next to its error classes (`cms/src/forms/delivery/errors.ts` exports `formDeliveryErrors`). It imports only core. The host passes all parts to `createErrorCatalog` in its composition root. This is the "registered through one Jini contract" rule and it needs no cross-package import.
- One entry replaces three registrations: the catalog builds the describer vocabulary (label = class name given in the entry, code = `code`), the model-facing rules and the caller-safe rules. `reclassifyToolError`, `callerSafeErrorMessage` and `createErrorDescriber` keep their signatures; their rule arrays are produced by the catalog instead of written by hand.
- `statusForError` takes the catalog: `statusForError({ error }, { catalog })`. The private table stays as the generic part. A feature code no longer falls to 500 by accident.
- Duplicate code in two parts: `createErrorCatalog` throws in tests and CI (a conformance test builds the full host catalog) and warns at runtime (owner rule: production warns and never refuses to boot).
- Codes with lower-case or kebab spelling that are already persisted (`rate-limited` and the other 8 form-delivery codes) are valid `code` values for matching and storage. Only the describer's built-in set keeps the strict constant-token rule.
- No new base class. The 502 existing error classes stay; a class joins the system by being named in an entry. A new failure with no class uses `ToolInputError` or `createApiError` with a catalogued code, as today.
- Version conflicts: core ships one part (`VERSION_CONFLICT`, `VERSION_REQUIRED`) bound to `RecordVersionConflictError` / `RecordVersionRequiredError`.

### 3.2 Reporter (c): one incident path

```ts
// core/src/errors/reporter.ts
export interface ErrorReporterPorts {
  readonly ids: IdGenerator;                    // core primitive
  readonly clock: Clock;                        // core primitive
  readonly logger: Logger;                      // core primitive
  /** Structurally `Pick<ObservabilityPort, 'reportError'>`; imported from core once observability M1 moves the type. */
  readonly tracker: { reportError(report: { error: unknown; context: { operation: string; attributes?: Readonly<Record<string, string | number>> } }): unknown };
  readonly catalog: ErrorCatalog;
  readonly versions: { readonly app: string; readonly jini: string };
}
export interface ErrorReporter {
  /** Refusal → its entry. Anything else → an incident: one ID, one log record, one tracker report. Never throws. */
  describe(required: { error: unknown; step: string; fallback: { message: string; action: string } },
           optional?: { errorId?: string; exactSecrets?: readonly string[]; audience?: 'public' | 'signed-in' }): DescribedFailure;
  /** For a failure nobody will be shown (a background job, cleanup): log + tracker only. */
  record(required: { error: unknown; step: string }, optional?: { level?: 'warning' | 'error'; exactSecrets?: readonly string[] }): { errorId: string };
}
export interface DescribedFailure { readonly kind: 'refusal' | 'incident'; readonly status: number; readonly error: ApiErrorShape }
export function createErrorReporter(required: ErrorReporterPorts, optional: { redaction?: SecretRedactionOptions } = {}): ErrorReporter;
```

- `fallback` is required at every call. There is no default sentence in the reporter, so a generic message cannot come from it. Route packs get their fallback words from `describeRequestFailure` with the host's vocabulary (what Tovu does today), or pass their own.
- `step` is a fixed label (`forms:deliver`, `routes/taxonomy/list`), the same field Tovu calls `operation` and http-kit calls `logSource`.
- Existing paths become callers, not copies: http-kit `reportRouteInternalError` and Tovu `reportServerFailure` / `adminFailureResponse` each shrink to one `reporter.describe(...)` call. `reportErrorOnce` (de-duplication per request) stays in diagnostics and is what the host passes as `tracker`.
- The two port objects (`ErrorReporterPorts`, the optional `redaction`) follow the `(required, optional = {})` rule. `optional` is typed with real fields, never `Record<string, never>`.

### 3.3 What goes where (c)

| Reader | Gets | Never gets |
|---|---|---|
| **User** (refusal) | entry `message` + `action`, `code` | — |
| **User, signed in** (incident) | words from `fallback`, error ID, and the Copy-details block: ID, step, **redacted cause summary**, app + Jini version, time | secrets, raw payloads, stack beyond the summary |
| **Visitor / anonymous** (incident) | words + error ID + "Report this error ID." | cause, step internals, versions (today's `discloseDetails: false` rule in Tovu, kept) |
| **Model** (tool result) | `CODE: words. guidance` for a refusal; `Error ERR-…: <reason with secret values blanked>` for an incident (2026-09-16 decision, unchanged) | Copy-details block, stack |
| **Library console line** (Jini code with no host) | step, error ID, class label, approved or catalogued code | message, stack |
| **Host incident record** (log) | error ID, step, code/label, redacted message, redacted stack (30 lines), labels of up to 3 causes, versions, time | values matched by `redactSecrets` + host `exactSecrets`; request bodies, headers, cookies |
| **Tracker** | the same redacted record through `reportErrorOnce` | same |
| **Persisted rows** (outbox `lastError`, search index, operation rows) | catalogued code, or class label, plus error ID | any message text |

**The class-only question, resolved.** Keep class-only for the line a *library* prints on its own, because a library cannot know the host's secrets. Stop treating that line as the record. The record is written by the host's reporter, which applies the "hide secrets only" policy the owner approved on 2026-09-16 with the host's own redaction options. Two changes make this hold:

1. **The sink is required where the host composes.** `createErrorReporter` has no optional sink, and the Tovu composition root passes `diagnostics` and `onInternalError` built from it (step E3). A library default line always prints the error ID, so a line with no record is visible as such.
2. **Catalogued errors are useful in logs by construction.** A registered class logs as `FormDeliveryError(rate-limited)` instead of `Error`, with no text involved.

Redaction rules (security persona): redact whole fields before cutting them (already done in `formatUserFacingError`); never log request bodies, headers, cookies or query strings; attributes are fixed labels and ids, capped (existing `redactOperationAttributes`); `error.code` and `error.name` are attacker-writable, so only approved or catalogued values print (existing rule in `errorType`); placeholder values from `params` are passed through `redactSecrets` and capped at 128 characters; the cause summary shown to a signed-in user is the redacted first line of the message plus cause labels, capped at 4,096 characters as today.

### 3.4 The shape at every boundary (b)

One wire block everywhere: protocol `ApiError`. An incident adds a typed `details`:

```ts
// protocol/src/errors.ts (additive)
export interface ApiIncidentDetails { kind: 'incident'; step: string; action: string; cause?: string; time: string; appVersion?: string; jiniVersion?: string }
```

`requestId` stays the wire name of the error ID (it is already in `ApiError`); the UI labels it "Error ID". `details.kind: 'validation'` keeps its meaning.

| Boundary | Today | Design |
|---|---|---|
| Jini route JSON | `{ error: ApiError }` + `requestId` | same, plus `details: ApiIncidentDetails` for incidents |
| Tovu admin route JSON | flat `{ error: string, code, errorId, details.failure }` | `sendAdminFailure` answers the nested envelope. `decodeApiError` keeps reading the flat one (N-1 fixture test). One function changes on the server; 251 call sites do not |
| AG-UI / chat run events | `RunErrorPayload { message, error?: ApiError }`; several emit sites send `message` only | every emit goes through one `runError({ reporter, error, step })` helper in daemon that fills `error` with code + `requestId`; chat renders `ErrorNotice` from it |
| Agent tool results | `ToolInputError` text, or `Error ERR-…: reason` | unchanged for the model. The result keeps `errorId`; the tool card shows `ErrorNotice` built from it (the "later chat-side copy button" noted in `redaction.ts`) |
| Outbox / background jobs | `lastError: 'Error'` | store `code ?? label` and the error ID; call `reporter.record` at failure time; status views turn the code into the entry's words when read |
| Desktop IPC + sidecar | `{ code?, message: error.message }` raw | `{ ok: false, error: ApiError }` from `reporter.describe`; renderer feeds the same failure channel |
| CLI | `ValidationError` text | prints entry words; an incident prints the error ID and the path of the incident record |

N-1: decoders accept every shape that exists today for as long as a previous admin build or desktop shell can be running against a newer server. Fixtures of today's four shapes are added in E4 before any producer changes.

### 3.5 i18n (d)

Tovu's rule is `t("full English sentence")` with 21 locale blocks. The catalog fits it without a new key scheme:

- The entry's `message` and `action` are the English source sentences and are the translation keys.
- The server sends the rendered English sentence (for API clients, logs and models) **and** `code` + `params`.
- The client renders `interpolate(t(entry.message), params)`. It gets the sentence from the catalog part it imports (parts are plain data from core-only modules, so a browser bundle can import them), or falls back to the server's English text when the code is unknown to this build (older client, newer server).
- Completeness check: `catalog.sourceSentences()` must all be present in each of the 21 locale dictionaries. This extends the existing hygiene audit (`i18n-missing-keys`), which already reports 31 high-confidence gaps in Tovu.
- `ErrorNotice` already takes `t` for its own labels ("Show details", "Copy details").
- The Copy-details block stays in English on purpose: it is pasted into a GitHub issue.

Not designed here: `asPage()` in `admin-failure-channel.ts` rewrites "post" to "page" with a regex on English text. It breaks under translation. It needs a `{noun}` placeholder instead; listed as a follow-up in E10.

### 3.6 UI (e)

Reuse: `ErrorNotice` and `createFailureChannel` stay where they are (`ui/panel-kit`). Additions are small:

| Piece | Where | Note |
|---|---|---|
| `failureFromResponse({ body, status, method, route }, { vocabulary, catalog, t, versions, redaction })` | `ui/src/features/panel-kit/failure-from-response.ts` | The generic half of Tovu's `publishAdminFailure` (about 35 lines). Tovu keeps the host half: vocabulary, the signed-in check, the page/post wording |
| `useReportFailure()` hook | admin kit, chat kit, ui kit (each kit declares the slot; the host binds one channel) | Returns `report({ error, message, action, step })`. Replaces the bare fallback string in `describeApiError` for a value that is not an API error |
| `ErrorNotice` prop `disclosure: 'full' \| 'id-only'` | existing component | `id-only` is the visitor form: words + error ID, no details block |
| Chat run-failure card | `chat/src/react` | The generic part of Tovu's `AgentFailureCard` (format + notice). Tovu keeps "switch agent" |

Hooks surface failures in exactly two ways: a refusal becomes inline text next to the field or action (entry words); anything else goes to `report(...)` and the notice. A hook never stores a caught value's text in state. Components stay props-only; the copy logic is already in `ErrorNotice.hooks.ts`. Site pages (visitor) use `disclosure: 'id-only'` and Jini `jini-` prefixed classes.

### 3.7 Gate (f)

Same pattern as `check-log-safety.mjs`: ESLint, a checked-in debt list that may only shrink, `--list` for lanes. Three rules:

1. **`catch-reads-error`** (needs scope analysis, so one small custom rule, about 60 lines): a `catch` clause or a `.catch(handler)` must reference the caught value, **or** be one of the named idioms (§3.8), **or** be a pure-parse refusal: the `try` body is a single statement calling `JSON.parse`, `new URL`, `decodeURIComponent` or `TextDecoder#decode`, and the catch throws or returns. A comment no longer excuses an empty catch.
2. **`no-generic-failure-text`** (core `no-restricted-syntax` on string literals and templates): a deny-list of phrases (`unknown error`, `internal error`, `something went wrong`, `request failed`, `operation failed`, `an … error occurred`). Baseline today: 244 literals in 79 Tovu files, 76 in 54 Jini files (regex count, includes some comments-in-strings and test helpers in source folders; not hand-checked).
3. **`failure-text-from-catalog`** (core `no-restricted-syntax`): inside a `catch`, a string literal passed to `res.status(5xx).json`, to a `set*Error`/`store.set` call, or to `new Error(...)` without `{ cause }` is an error.

Where the rule file lives: Jini `scripts/eslint-rules/error-handling.mjs`, with a byte-identical copy in Tovu `development/eslint-rules/` and a hash check in Tovu CI (precedent: the meilisearch provider's checked copy; Tovu already has `development/eslint-rules/` with two local rules). Owner decision D5 if a shared lint package is preferred.

Gate limits, stated so nobody over-trusts it: it cannot tell a good sentence from a vague one outside the deny-list; it does not follow a caught value through helper functions (same limit as the log-safety gate); reading the value is not handling it. Review still owns those.

### 3.8 Named idioms (what makes the legitimate patterns pass the gate)

In `core/src/errors/idioms.ts`, pure, each under 15 lines:

| Idiom | Replaces | Sites today |
|---|---|---|
| `observed(promise)` — marks a promise handled; every awaiter still gets the rejection | `void p.catch(() => {})` | 29 |
| `afterSettled(promise)` — resolves when the promise settles and never rejects; only for a promise whose rejection another named owner already receives | queue tails (`prev.catch(() => {}).then(fn)`, `tail = run.catch(() => undefined)`), reloads a query owns, mutations that show their own error | 24 + 7 + 3 = 34 |
| `bestEffort({ step, logger }, work)` — runs cleanup; a failure is logged (class + code + step) and never thrown | `await x.close().catch(() => undefined)` | 77 + part of the 1,871 |
| `absentWhen({ codes, kinds }, work)` — returns `undefined` only for the listed codes (`ENOENT`) or classes (`SyntaxError` for an unparseable error body), rethrows the rest | `readFile(p).catch(() => null)`, `response.json().catch(() => null)`, documented fallbacks | 31 + 12 + 5 = 48 |

The 8 "reporting path guarding itself" rows (a logger or reporter that must not throw) stay as they are; their files go on the gate's short list of sanctioned modules, the same way `check-log-safety.mjs` lists the sanctioned console writers.

`bestEffort` takes a `Logger`, so a cleanup failure is no longer invisible; that is the smallest change that satisfies "never swallowed" for cleanup. Cost: one closure and one promise per call, only on paths that already await I/O; none of the listed sites is in a per-row or per-token loop (checked for the daemon stream reader and outbox worker sites; not checked for all 77).

## 4. Sweep plan (g)

Order matters only where stated. Every step compiles and passes alone. Bug fixes are red-first: write the failing test, show it red, mutate the fix to confirm the test can fail, then fix.

| Step | What | Repo | Depends on | Behaviour change | Red-first test |
|---|---|---|---|---|---|
| **E0** | Gate in WARN mode + debt baselines generated from the tree (three rules) | both | — | none | fixture tests per rule: each idiom passes, each banned shape fails |
| **E1** | Outbox regression: add optional `describeError?(required: { error }): string \| undefined` to `OutboxRetryPolicy`; worker stores `policy.describeError(...) ?? describeErrorForLog(...)` after checking the value against a bounded code shape; `formDeliveryRetryPolicy` returns the `FormDeliveryError` code; fix the stale comment in `delivery/errors.ts` | Jini infra + cms | — | yes: codes reach the user again | (1) infra: a policy returning `rate-limited` → `markFailed` gets `rate-limited`; a policy returning free text with spaces → falls back to the label. (2) cms: real worker + memory outbox + a `FormDeliveryError('rate-limited')` → `formDeliveryStatusFromOutbox` gives `rate-limited` (red today: `delivery-failed`) |
| **E2** | `core/src/errors/` catalog, reporter, idioms + recording fakes (`core/src/errors/testing.ts`) | Jini core | — | none (additions) | contract tests: unknown error → incident with ID from the fake `IdGenerator` and time from the fake `Clock`; refusal → no tracker call; reporter never throws when logger or tracker throws; a secret-shaped value in message, stack, params and step never appears in any output |
| **E3** | Host wiring: Tovu builds one catalog + one reporter in the composition root; one host logger factory replaces the 17 bare `createConsoleLogger` calls and passes `diagnostics`; `onInternalError` passed to every Jini route pack. Same in Jini `server` preset | Tovu, Jini server | E2 | yes: originals now reach the redacted host record | integration: a throwing Jini route under the Tovu app writes one incident record containing the (redacted) message and the same ID the response carries (red today: class only) |
| **E4** | One incident path: `reportRouteInternalError`, `reportServerFailure`, `adminFailureResponse` call the reporter; N-1 decoder fixtures for the four envelope shapes; `sendAdminFailure` answers the nested envelope | both | E3 | wire shape of Tovu admin errors (decoder already reads both) | characterization tests first, pinning clock and IDs: status, headers, body fields, one log line, one tracker call, order of the two sinks, sink failure does not change the answer |
| **E5** | Catalog adoption per feature (parallel, file-disjoint lanes): move each `ModelFacingErrorRule[]` / `CallerSafeErrorRule[]` / describer vocabulary into one `defineErrors`; `statusForError` reads the catalog. Order: form delivery, version conflicts, then the 18 files with rule arrays | both | E2 | status of feature codes that fell to 500 | per feature: the generated model-facing text is byte-identical to today's for every listed class (snapshot of exact strings), plus one test per code for status and retryable |
| **E6** | UI: `failureFromResponse`, `useReportFailure`, `disclosure`, chat run-failure card; sweep **W6** (13 real sites: admin security controllers, memory connectors, form editor, visitor checkout) | Jini ui/admin/chat/commerce, Tovu admin | E2, E4 | users see ID + Copy details instead of a fixed sentence | per site: the rejected port (fake of the interface) yields a notice whose copy text contains the ID, step and redacted cause; strings compared, not DOM nodes |
| **E7** | Pattern sweeps, one lane per pattern per package: **W1** idioms (88 false-positive rows, no behaviour change; the other 91 need no edit: the gate's parse-refusal rule passes 82, and 9 are payload scripts, test support or not error text), **W3** cleanup (89), **W5** absent-vs-failed (31), **W4** dropped notifications/alerts/writes (16), **W7** log text (11), **W8** cause kept (30) | both | E0, E2 | W1 none; W3/W7 add log lines; W4/W5/W8 turn a silent path into a reported or typed failure | W5 example: `lifecycle.get` rejecting with a storage error must not answer `NOT_FOUND` (red today in `daemon/src/http/remote-run-events.ts`). W4 example: a rejected `persistUserTurn` is reported and the user is told the message was not saved (red today in `chat/src/core/assistant-client/transport.ts`) |
| **E8** | Chat + tools: `runError` helper for every `lifecycle.emit({ event: 'error' })` (about 10 emit sites in `daemon/src/agent-executor`); tool card notice from `errorId` | Jini daemon/chat | E2, E6 | run errors carry code + ID | each emit site: event payload has `error.code` and `error.requestId`; the "terminal state wins" ordering in `run-output.ts` is pinned first |
| **E9** | Desktop IPC: one `handle({ channel, reporter }, fn)` wrapper for the 56 `ipcMain.handle` sites; sidecar `jsonIpcError` through the reporter | Tovu desktop, Jini sidecar | E3 | renderer gets `ApiError` instead of raw text | a throwing handler replies `{ ok: false, error }` with no raw message text and with an ID that is in the main-process record |
| **E10** | i18n: catalog sentences in the 21 admin locale blocks; completeness check; replace `asPage()` with a `{noun}` placeholder | Tovu admin | E5 | translated refusal text | check fails on a missing sentence in any locale |
| **E11** | Gate to ERROR, package by package, when that package's debt rows reach 0 | both | E7 | none | — |

The wider class (§2.5: 1,871 handlers) is not swept by row. It enters the debt list in E0 and shrinks when a file is touched, with the four idioms doing most of the work. A lane must not "fix" a parse fallback by adding a log line; the gate's parse-refusal rule already passes it.

Untangle interaction (lesson 10): E2 adds a new core folder and does not touch files owned by wave B/C lanes. E5 edits `core/src/contracts/server/api-error.ts`, in the folder lane C4 created (it is present on `integ/wave-b-r2`), and E4 edits `http-kit/src/internal-error.ts` (not in C4's listed paths, but in the same package). Both start only after wave B is merged, so they do not collide with an applier pass. E3's tracker type rides the observability design's M1 (type move to core); until M1 lands the reporter restates the one method structurally.

## 5. Rough cost

| Step | Design / review (Opus) | Build (Sonnet) |
|---|---|---|
| E0 gate | 20k | 90k |
| E1 outbox fix | 10k | 40k |
| E2 core errors | 60k | 150k |
| E3 host wiring | 30k | 120k |
| E4 one incident path + N-1 | 40k | 150k |
| E5 catalog adoption (about 20 lanes) | 40k | 500k |
| E6 UI + W6 | 40k | 250k |
| E7 pattern sweeps (265 rows) | 30k | 600k |
| E8 chat + tools | 30k | 150k |
| E9 desktop IPC | 20k | 200k |
| E10 i18n | 10k | 120k |
| **Total** | **about 330k** | **about 2.4M** |

Estimates are by analogy with the untangle lane costs in `LANES.md`, not measured. E1 can ship today on its own.

## 6. Owner practices, checked one by one

| # | Practice | Status in this design |
|---|---|---|
| 1 | DI via typed ports from the host | Reporter takes `ids`, `clock`, `logger`, `tracker`, `catalog`, `versions`; no ambient `randomUUID`/`Date`. **Existing conflict:** `http-kit/src/internal-error.ts` imports `node:crypto` `randomUUID` directly; E4 removes it |
| 2 | `(required, optional = {})`, never `?: Record<string, never>` | New signatures comply. **Existing conflict:** the files this design builds on use `_optional: Record<string, never> = {}` and `_optional?: Record<string, never>` (for example `ErrorDescriber`, `describeErrorForLog`, `statusForError`). The design does not copy that shape and does not fix it either (separate args sweep); flagged |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | Planned files: catalog ≈ 120 lines, reporter ≈ 150, idioms ≈ 60, testing ≈ 80; largest function `describe` ≈ 35 lines, split into `matchRefusal` / `buildIncident` / `deliver`. To be re-checked inside each file at build time (lesson 8) |
| 4 | Feature slicing | Codes and words live in the feature folder next to its error classes |
| 5 | No barrels / re-export shells / forwarders | `core/src/errors/` files are imported by path through one package subpath export; no index file re-exporting other modules. `reportRouteInternalError` and `reportServerFailure` keep real route-specific work (context fields, vocabulary); if either becomes a pure forwarder after E4, delete it and repoint callers |
| 6 | Why-comments move with code | E1 and E4 touch heavily commented files (`worker.ts`, `site-share-errors.ts`); lanes carry the comments and correct the one that is now false (`delivery/errors.ts`: "the outbox persists `error.message` verbatim") |
| 7 | Generic → Jini; a Jini package imports only itself + core + protocol; no vendor code in core | Catalog, reporter, idioms in core; wire type in protocol; UI in ui; no package imports another. Core restates the tracker method structurally instead of importing diagnostics. No vendor code |
| 8 | Tests: fakes of interfaces, no `vi.mock` of another package's internals, red-first + mutate | Recording fakes for `Logger`, tracker, `IdGenerator`, `Clock` ship in `core/src/errors/testing.ts`; every behaviour-changing step lists its red test |
| 9 | Errors never swallowed or generic | The point of the design. `fallback` is a required argument, so the reporter cannot emit a default sentence |
| 10 | No new eslint-disable / @ts-ignore; no silent behaviour changes | The gate has a debt list, not disables. Every behaviour change is named per step in §4. **Existing conflict:** `internal-error.ts` has two `eslint-disable-next-line no-console`; they go away when the file calls the reporter |
| 11 | Smallest change; reuse first; no abstraction with one user | No new error base class, no new UI component, no new envelope, no new sink port. New: catalog (18+ rule files and every route pack use it), reporter (2 incident paths + jobs + IPC), 4 idioms (188 flagged sites) |
| 12 | Memory / IO cost on hot paths | Catalog lookup is O(parts × entries) on the failure path only; build a `Map` by code and keep class matching to the failure path. Reporter does one log write and one tracker call per incident. `bestEffort` adds one promise per cleanup. Nothing on the success path |

## 7. Lessons applied

`LESSONS-FOR-DESIGN-BRIEFS.md` on `plan/size-designs-2026-11-16` holds **11** numbered rules, not the 22 the brief mentions; I applied the 11.

1. Real dependency graph: the catalog sits under three existing consumers (model rules, caller-safe rules, describer); the design routes them through it instead of adding a fourth list.
2. Inventory first: §2.1 lists every owner with counts before any target file is named.
3. Late-bound reads: the reporter is built in the composition root and passed as a port. E3 must not read it at module scope in the 17 logger files (today they build a logger at import time: `const consoleLogger = createConsoleLogger(...)` at top level). The lane has to move those to the composition root or pass the logger in, not swap one top-level call for another that needs ports that do not exist yet at import time.
4. Inputs, outputs, state owner: the catalog is immutable after creation; the reporter holds no state; the failure channel (existing) owns the one retained failure.
5. Migration graph: §4 gives prerequisites per step.
6. Tests that can fail: E4's characterization tests pin clock and IDs and assert order and sink-failure behaviour.
7. Distinct contracts kept: refusal vs incident, optional `cause`, `retryable` are separate fields; nothing is merged into a string.
8. Limits inside each file: see practice 3; not yet proven, to be checked at build.
9. Generic vs host: vocabulary, redaction options, versions and the signed-in check stay in Tovu.
10. Untangle lanes: see the end of §4.
11. Seams exist: `OutboxRetryPolicy` is already resolved per event by the host (`outbox-retry-policies.ts`); the admin kit already has an `ErrorNotice` slot; `development/eslint-rules/` already loads local rules.

## 8. Not verified

- Whether any Tovu path stores form-delivery `lastError` through a worker other than Jini's `processOutbox` (Tovu has its own `contracts/core/events/outbox-worker.ts`; I confirmed it passes `retryPolicyForEvent` but did not read the whole file).
- No test was run and nothing was built; every claim is from reading and counting.
- The 7 `unclassified-swallow` rows; pattern assignment for the 347 of 369 rows read at line depth only.
- The deny-list baseline (244 / 76) is a regex count.
- That browser bundles can import catalog parts without pulling server-only code: true by rule (core-only imports) but not checked per feature.
- The exact number of `lifecycle.emit({ event: 'error' })` sites (about 10 by search).
- The "13 classes / 4 wire codes" claim (§2.4).
- Cost of `bestEffort` at all 77 cleanup sites.

## 9. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Log policy: library line = class + code + ID; host record = message and stack with secrets blanked | Yes. It is the 2026-09-16 "hide secrets only" rule applied at the host, and it keeps wave B's safety for library defaults |
| D2 | One error ID format | Keep both existing formats readable; mint `ERR-XXXX-XXXX-XXXX-XXXX` for all new incidents (short, easy to spot in a pasted issue). Changing existing UUID sites is optional |
| D3 | Wire field name: keep `requestId` on the wire and show it as "Error ID", or rename to `errorId` | Keep `requestId`; a rename breaks N-1 clients for no user gain |
| D4 | Retire Tovu's flat admin envelope in E4 | Yes, with decoder fixtures for the old shape |
| D5 | Where the lint rule lives | One file in Jini with a hash-checked copy in Tovu; a shared lint package only if a third consumer appears |
| D6 | What a signed-in user sees as "cause" for an incident | The redacted first line plus cause labels (Tovu shows only "The error ID identifies the server report." except in the export pilot). This widens disclosure to signed-in admins; visitors stay ID-only |
| D7 | Ship E1 (outbox fix) alone, now | Yes |
| D8 | Sweep the wider class (1,871 handlers) by row, or let the gate ratchet it | Ratchet; sweep only the 190 real rows and the 88 idiom rows |
