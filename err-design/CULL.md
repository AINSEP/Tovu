CULL COMPLETE

# Error-system design cull (Tovu + Jini), 2026-11-21

Code checked against **Jini `origin/integ/merge-11-2026-11-21` @ `1ac1cbbd`** and **Tovu `origin/integ/merge-10-2026-11-21` @ `0973a5fdc`**. This was read-only: no code edits, builds, installs or tests. Every file:line below was re-read on those two refs. Where an input's anchor had drifted, the corrected line is given and the input's number is noted as stale.

Facts that changed the picture since the inputs were written:

- **`createErrorReporter` has no production caller in either repo.** The only users are `core/src/errors/testing.ts:60` and `reporter.test.ts`. (`http-kit/src/settings/stream.ts:137` is an unrelated module-local function with the same name.) The reporter's ports can therefore change shape without breaking any consumer.
- **`jz2-a` has landed** in Jini merge-11 (`c52c3bae`, combine-8). That brings in E4-J-TRACKER (`reporter.ts:114–131` hands the original error and `exactSecrets` to the tracker), E6a-J-NOTICE (`ErrorNotice.tsx:10,22,28`) and E9-J-FRAME (`json-ipc.ts:299` `BAD_FRAME`).
- **TV-ES1 has landed** in Tovu merge-10 (`Login.tsx:52`, `OwnerRecoverySignIn.tsx:26` pass `disclosure="id-only"`). **D02 has landed** (`desktop-memory-sampler.ts` and `desktop-resources.ts` import the idioms).
- `ErrorReport.context` already has `trace?: TraceIds` (`core/src/contracts/observability.ts:57`). It has no incident-ID field, and `OperationTracker` (`:51`) cannot report its own trace IDs.
- Live violations of the owner's rule against generic text: sidecar `json-ipc.ts:343` `"internal error"`; protocol `errors.ts:92,114` `'request failed'`; admin transport `http.ts:128` `` `request failed (${status})` ``; Tovu `assistant-ag-ui.ts:405` `"assistant failed"`; Tovu `media-rendition.ts:609,712` `"internal error"`.
- The disclosure contract (`error-disclosure-contract.md`, cited by errdesign and errfix1) is **not in any attached repo**. ER-6 was applied as the inputs quote it.

---

## 1. The chosen design: one reporter, one named boundary per entry point

**Types (Jini `@jini-ai/core`)**

```ts
// contracts/observability.ts
interface OperationTracker extends TrackerScope { end(o): void; traceIds?(): TraceIds | undefined }   // + traceIds
interface ErrorReport { error: unknown; context: { operation: string; attributes?; level?; trace?: TraceIds;
  incidentId?: string; label?: string } }                                                          // + incidentId, label

// errors/reporter.ts  (ports: tracker → observability; IncidentTrackerReport deleted)
interface ErrorReporterPorts { ids; clock; logger; observability: Pick<ObservabilityPort,'reportError'>; catalog; versions }
describe(required: { error; step; scope; fallback: { message; action }; operation: string; tracker: OperationTracker },
         optional?: { errorId?; audience?; approvedCause?; exactSecrets? }): DescribedFailure
record(required: { error; step; operation: string; tracker?: OperationTracker },
       optional?: { errorId?; level?; exactSecrets?; tracker?: 'report' | 'skip' }): { errorId }
// the boundary, exported from the same module:
runOperation<T>(required: { deps: { observability: Pick<ObservabilityPort,'trackOperation'>; reporter: ErrorReporter };
  operation: string; scope: string; step: string; fallback; work: () => Promise<T>; attributes? },
  optional?: DescribeFailureOptions): Promise<{ ok: true; value: T } | { ok: false; failure: DescribedFailure }>
```

**Who owns what**

| Owner | Does | Never does |
|---|---|---|
| **Boundary** `runOperation` (core) | Opens one `trackOperation({ name: operation })`, runs `work` inside it, calls the reporter **once** on throw, then ends the tracker: `{ outcome: 'completed', failed: false }`, `{ outcome: 'failed', failed: true }` for an incident, or `{ outcome: 'refused', failed: false }` for a refusal. Returns a failure value. | Know any wire format. |
| **Reporter** (core) | Classifies: a catalog-bound error is a refusal (code and words, no ID, no report); anything else is an incident. For an incident it does four things: mints one ID; writes one host record to the logger (redacted diagnostic only); makes one `observability.reportError({ error: <original>, context: { operation, level, incidentId, label, trace: tracker.traceIds?.() } })` call; and returns the words `fallback.message fallback.action (error ERR-…)`. It depends on `ObservabilityPort`. | End the tracker. Rely on the implicit `run()` scope. |
| **Transport adapter** (thin, per entry point) | Serializes the failure value. HTTP: status plus `{ error: { code, message, requestId } }`, in http-kit `adapter.ts` (Express) and core `json-route.ts` (fetch). Sidecar IPC: `{ code, message, requestId }`. AG-UI: one `RUN_ERROR`. CLI: exit code. Electron IPC: rejection text that keeps the ID. Tool: daemon tool decorator. | Mint IDs or write records. |
| **Vendor adapter** (provider-plugins) | Export policy only. A report tagged with `incidentId` exports exception type = `label` and value = `incidentId`, with stack frames and the message line removed. An untagged report keeps today's `sanitizedError` path. | Classify, choose wording, or depend on the reporter. |
| **Host composition** | Builds **one** reporter (`ids` = `mintToolErrorId` + `randomBytes`, clock, logger, observability, catalog, versions, redaction) and injects `{ observability, reporter }` into each boundary once, at the root. | Pass per-route ports. |

**Data flow:** throw → boundary catch → `reporter.describe` → refusal, or incident (ID → redacted host record → one `reportError` with the original error and `{ operation, trace, incidentId, label }`) → boundary ends the tracker → adapter serializes. The user, the host log and the tracker see **the same `ERR-…` ID**.

**Placement.** The reporter, `runOperation`, the contracts, the http-kit/sidecar/daemon adapters and the vendor export rules live in **Jini**. Core is the lowest layer, so nothing sits above domains, and there is no Express in core. **Tovu** owns catalog bindings and product words, composition wiring, and the AG-UI, CLI and desktop IPC adapters. Tovu's `reportServerFailure` (`apps/website/src/server/inbound/shared/admin-failure.ts:53`) keeps its signature and becomes a thin wrapper over `reporter.record`, so its 238 calling files do not change.

---

## 2. KEEP / CHANGE / DROP for every proposal

Disposition key: **RETIRED** = the work has already landed on the checked ref. **OUT** = not error design; it belongs to another job.

### r62t-errdesign (verdict ADJUST)

| Proposal | Verdict | Reason |
|---|---|---|
| Verdict ADJUST: keep refusal/incident split, one owner per failure | KEEP | This is the basis of §1. |
| Fix next-step wording, ID reuse, ER-6 before broad wiring | KEEP | Becomes sheet J2. |
| Delete duplicate reporting as each boundary switches (`internal-error.ts:33–65`, Tovu `reportServerFailure`) | KEEP | Sheets J-HTTP and T3. |
| Result/Either everywhere; global class mapper; new library | DROP | Agrees with errdesign's own rejection. |
| Lint plus no-growth ledger, retired per clean package | KEEP | Gate stays; E11 below. |
| Next steps 1–5 | KEEP | Order follows §5. |

### r62t-errfix1 and its addendum

| Proposal | Verdict | Reason |
|---|---|---|
| ERFIX-T1 AG-UI read catch | CHANGE | Still live at `assistant-ag-ui.ts:302–305`. Re-anchor: the `drainAgUiStream` call is at `:389`. Also fix the same file's outer catch `:401–405` (raw `console.error`, generic `"assistant failed"`). Sheet T1. |
| ERFIX-J2: incident words carry `fallback.action` | KEEP | `reporter.ts:201` still omits the action. |
| ERFIX-J2: `describe` with a supplied ID does not re-record | KEEP | `reporter.ts:195` records again, which is two records per incident. |
| ERFIX-J2: `own-message` is model-only | KEEP | `catalog.ts:114` and `reporter.ts:166` publish raw `error.message` to callers. |
| ERFIX-J2: per-call `exactSecrets` in refusal redaction | KEEP | `reporter.ts:183` passes host redaction only. |
| ERFIX-J2: logger stops receiving the raw `error` | KEEP | `reporter.ts:150` passes `error` next to the redacted `diagnostic`. |
| ERFIX-J2: rebuild `ClientFacingError` from the catalog, dropping its text | DROP | A `ClientFacingError` is our own code's deliberately classified carrier, and http-kit `adapter.ts:128–131` and `json-route.ts:265` send it verbatim by design. Rebuilding it adds a second policy (owner: keep it simple). |
| ERFIX-J2: filter `details.params` to placeholders | DROP | errfix1 itself says a registered `sentence.params` callback is the owner's approval of its values. Redaction plus the 128-char cap stays. |
| ERFIX-J2: Sentry/OTel tagged export with no stack frames | CHANGE | The owner addendum requires the original error for stack and grouping. Export frames **with the message line removed**, type = label, value = ID. |
| E4-J-TRACKER carrier retirement | RETIRED | Landed via `jz2-a` (`reporter.ts:114–131`). |
| Pass `exactSecrets` to the tracker (jz2-a) | CHANGE → remove | Tagged reports never export message text, so per-call secrets have nothing to protect at the adapter. `ErrorReport` has no `exactSecrets` field, and the Sentry adapter ignores it today. Host-record redaction keeps them. |
| ERFIX-J3 HTTP acceptance (envelope, both reader directions, one record) | CHANGE | The tests and contract are kept. The implementation becomes the injected boundary, not an extra callback field. Sheet J-HTTP (PARTIAL). |
| Addendum 1: reporter takes the operation tracker explicitly | KEEP | `describe({ …, operation, tracker })`. This needs `OperationTracker.traceIds?()`. |
| Addendum 2: one named boundary per transport, injected `{ observability, reporter }`, tested once with fakes | KEEP (shape adjusted) | `runOperation({ deps, … }, optional = {})`: deps go inside `required`, because the args rule is unchanged. Test in sheet J3. |
| Addendum 3: reporter → `ObservabilityPort`; `reportError` gets original + `{ operation, trace, incidentId, label }`; `incidentId` on the report | KEEP | Sheets J1 and J2. |

### r62t-err-sys (E0–E11)

| Proposal | Verdict | Reason |
|---|---|---|
| E0, E1, E2 | RETIRED | Gate rules, outbox codes and core `errors/` are all present on merge-11. |
| E3-J-SERVER, E3-T-HOST | CHANGE | Become J-HTTP and T3 (host builds one reporter). PARTIAL: the preset has no logger, catalog or observability ports (`server/src/create-local-node-daemon.ts` has none; `route-host.ts:37` hard-binds `reportRouteInternalError`). |
| E4-J-TRACKER | RETIRED | `jz2-a`. |
| E4-J-HTTP | CHANGE | No longer held (ex-err-jini DROP). Folded into J-HTTP. |
| E4 route-seam decision (ID-returning callback on `RouteHostContext`) | DROP | Superseded by the injected boundary. Adding an optional field with no production caller was already rejected by errfix1. |
| E4-T-PINS | RETIRED | err3 culled it. The existing-ID and 507 cases move into T3's tests. |
| E4 disk-space 507 decision | KEEP err3's resolution | A refusal has zero incidents and no ID; keep the 507, code and words. Live at `admin-failure.ts:77`. |
| E4-T-READERS, E4-T-BOUNDARY | KEEP (PARTIAL) | Reader-compatibility tests (`apps/admin/src/lib/admin-failure-channel.ts:128–145`) land before the producer moves from UUID to ERR. Part of T3. |
| E5a-J-CORE, E5a-J-HTTP, E5a-J-DAEMON (`statusFor` resolver on routes) | DROP | No host passes a catalog to routes. Thrown refusals get catalog status through the reporter inside the boundary. Returned `Result` refusals keep `statusForError` until a real host needs a mapping. |
| E5-J-GUARD | RETIRED | Culled by err3. |
| E5-J-FORMS/VERSION/RULES, E5-T-* | KEEP (PARTIAL) | Feature-by-feature catalog bindings after J-HTTP has a live catalog. |
| E6a-J-NOTICE | RETIRED | `ErrorNotice.tsx:10`. |
| E6a-J-READER/HOOKS, E6a-T-READER, E6-J-CARD/W6, E6-T-W6 | KEEP (PARTIAL) | Blocked on live producers (J-HTTP, T3). |
| E7 shared implementation | RETIRED | Idioms at `core/src/errors/idioms.ts`. Row work is in J6, J7 and T2. |
| E8-J-DAEMON/CHAT, E8-T-AGUI | KEEP (PARTIAL) | Blocked on the AG-UI chain. T1 is the interim fix. |
| E9-J-FRAME | RETIRED | `json-ipc.ts:299`. |
| E9-J-HANDLER | CHANGE | Becomes the sidecar IPC boundary through `runOperation`. PARTIAL (host binding). Its generic text is fixed now in J4. |
| E9 size prerequisite decision | KEEP (yes) | Sheet J5 (E9-J-SPLIT). |
| E9-T-INVENTORY | RETIRED → folded | Into E9-T-IPC (err3). |
| E9-T-IPC | KEEP (PARTIAL) | 61 raw `ipcMain.handle(` registrations across 8 desktop files (22 in `project-ipc.ts`, 18 in `workspace-chat-ipc.ts`) and no wrapper. Inventory first. |
| E10-J-PARAMS | CHANGE | No longer held. PARTIAL until E5 sentences exist. |
| E10-T-I18N | KEEP (PARTIAL) | |
| E11-J/T | KEEP (blocked) | Fold shrink-only `--update` protection into the first package activation (err3). |
| Batch reservations `codex/jini-error-system-1` and `codex/tv-error-system-1` | DROP | Replaced by §5. |

### r62t-err3

| Proposal | Verdict | Reason |
|---|---|---|
| Disposition table | KEEP, except as changed above | |
| E9-J-SPLIT | KEEP | Sheet J5. Re-anchored: `createJsonIpcServer` now starts at `json-ipc.ts:163`. err3's `:188–389` is the pre-jz2-a numbering, so apply by contents. |
| O126, O133, O134, O308, O397, U550 roster | KEEP | Sheet J6. Catch lines verified: `tool-call-detail.ts:92`, `tool-output.ts:18`, `bounded-json.ts:33`, `use-members.hooks.ts:164`. |
| D02-SPLIT, D02 | RETIRED | Landed on Tovu merge-10. |
| TV-ES1 | RETIRED | Landed on Tovu merge-10. |
| "No optional pads" brief rule | CHANGE | Owner rule: the args rule is unchanged and existing `_optional = {}` pads are **never removed**. |
| PARTIAL 241 O keys | KEEP (PARTIAL) | They need live boundaries. |
| E-V-J/T FFmpeg env | OUT | Env slice. |

### r62t-census2

| Proposal | Verdict | Reason |
|---|---|---|
| O93, O178, O245, O248, O302, O314, O423, O485 | KEEP | Sheet J7. Catch lines verified on merge-11: `run-output.ts:88`, `supervisor.ts:153`, plus the other six files, which still lack the idioms import. |
| BLOCKED-E3/E6 keys | KEEP (PARTIAL) | They wait for J-HTTP and T3. |
| O274, O322 | KEEP (PARTIAL) | As stated. |

### r62t-keepstd

| Proposal | Verdict | Reason |
|---|---|---|
| O121 | KEEP | Into J6. `fanout.ts:9–13` verified. |
| T167, T195, T197, T243, T321, T326, T391, T459 | KEEP | Sheet T2. Catch lines verified on merge-10, e.g. `visitor-tool-budgets.ts:52`, `provider-selection.ts:83`, `settings.ts:42`, `repo.memory.ts:62`, `journal-kernel.ts:86,112`. Tovu already resolves `@jini-ai/core/errors/idioms` (the desktop imports it), so no lock wait. |
| RETIRE list (J02–J06, A2/A5/B5, err-rows A/D/C/B) | KEEP (RETIRED) | |
| B02, C08, T226, T454 | KEEP (PARTIAL) | Size first. |
| `bestEffort` example for `submit-service.ts` | DROP | O178's sheet keeps the existing warning text. |

### r62t-err-rows

| Proposal | Verdict | Reason |
|---|---|---|
| A01–A07, D01, D03–D06, C01–C05, C07, B01–B06, J01–J06 | RETIRED | Per err3 and keepstd (tv-z2…z5, rs3-jini, jz2-b). |
| D02 | RETIRED | Landed. |
| PARTIAL groups (A copy/mixed, B, C mixed, Jini U/W) | KEEP (PARTIAL) | Blocked on boundaries. |
| Combine rule: `--update` only with zero New/Worse | KEEP | |

### r62t-err-tovu (ledger triage)

| Proposal | Verdict | Reason |
|---|---|---|
| R (ledger reconcile) | KEEP | Cloud combine step. |
| A, S, B, D, C, I, T | CHANGE (PARTIAL) | Row numbers come from ledger `2d82735a6`. Re-anchor by `(file, rule)` on merge-10 before dispatch. The edits themselves are sound. |
| O (background diagnostics) | KEEP | Private diagnostics, not incidents. No reporter dependency. |
| H, P (admin/public HTTP using `reportServerFailure`) | CHANGE | Re-anchor. They may land before T3; once T3 switches the wrapper body, their IDs become ERR automatically. |
| KEEP lists | KEEP | |
| NEEDS-DECISION: size-debt rows | → owner Q3 | |
| NEEDS-DECISION: copy/disclosure, client recovery, headless recovery | KEEP the recommendations | They match §1: operation words + ID, one record at the boundary, keep drafts and caches. No separate decision needed. |
| "Approve a Jini typed port for common fallback/observation" | DROP | The idioms already exist (`core/src/errors/idioms.ts`). |

### r62t-breaks

| Proposal | Verdict | Reason |
|---|---|---|
| B1–B3, O1–O9, P1–P2, C7, A1 | OUT | Persisted-data and identity cutover, not error design. Leave them with their existing owner. Its "no unused parameter pads" brief rule must read "never remove existing pads". |

### designgaps-coordinator-notes

| Proposal | Verdict | Reason |
|---|---|---|
| Gap 1 feature-module deps | OUT (consistent) | Boundaries take `{ observability, reporter }` built once at the root, which matches the feature-module shape. |
| Gap 7 waits for the reporter handoff | KEEP | See §6. |
| Gap 5 struck; args rule unchanged | KEEP | |

---

## 3. Conflicts between inputs, and how they were resolved

1. **Tracker export.** errfix1 wanted no stack frames; the owner addendum wants the original error for stack and grouping. **Resolved:** the port receives the original error. A tagged export sends frames without the message line, with type = label and value = ID. Grouping works and no message text leaves the process.
2. **Boundary signature.** The owner's example was `runOperation(required, deps)`; the unchanged args rule is `(required, optional = {})`. **Resolved:** `runOperation({ deps, … }, optional = {})`.
3. **HTTP seam.** err-sys and err3 proposed an additive ID-returning callback on `RouteHostContext`. errfix1 rejected adding an optional field with no production caller. The owner asked for an injected boundary. **Resolved:** an injected boundary, wired by the preset in the same job (J-HTTP).
4. **`ClientFacingError`.** errfix1 rebuilds it from the catalog; errdesign and the http-kit code treat it as a pre-classified safe carrier. **Resolved:** keep it as-is, which is simpler and already the rule in two adapters.
5. **`exactSecrets` to the tracker.** jz2-a (E4-J-TRACKER) added it; ER-6 says to export only label and ID. **Resolved:** remove it from the port handoff (tagged reports carry no message). The host record keeps per-call redaction.
6. **Pads.** err3 and breaks said "no optional pads"; errfix1 and owner rules say use `(required, optional = {})` and never remove pads. **Resolved:** owner rule.
7. **E5a status resolver.** err-sys said ready; err3 said blocked on the first live resolver. **Resolved:** DROP. The boundary path covers thrown refusals.
8. **O178 idiom.** keepstd illustrated `bestEffort`; census2 used `orFallback` with the existing warning text. **Resolved:** census2, which preserves the text.
9. **Tool reporting.** Tools currently report twice: `tool-recovery/redaction.ts:123` mints an ID and reports a `ToolFailureRecord`, and `observability.ts:97,103` calls `reportError` again with no ID, inside an implicit `tracker.run`. **Resolved:** the decorator becomes the tool boundary and reuses the redaction layer's ID (§6).

---

## 4. `codex/ex-err-jini` (`b79994b9c`): verdict **DROP**

Evidence:

- It is **one commit**, titled "test(errors): Jini error-gate S1-S5 characterization tests (WIP: S0 stopped, do not merge alone)". Its body says "local, untested (cloud test-and-fix run verifies)". No such run exists on the branch.
- Its base is `d37821a4` (combine-3-fix), **413 commits behind** merge-11. It changes **89 files** (+902/−228).
- `git merge-tree --write-tree HEAD origin/codex/ex-err-jini` on merge-11 reports **8 content conflicts**: `core/src/fetch/__tests__/cache-edges.unit.test.ts`, `daemon/src/run-lifecycle.ts`, `db/src/kernel/pglite/driver.ts`, `mcp/src/core/tokens.ts`, `mcp/src/federation/reload.ts`, `oauth/src/loopback-receiver.ts`, `ui/src/features/browser-chrome/dependencies.ts`, `ui/src/features/command-palette/dependencies.ts`. `run-lifecycle.ts` alone has changed by −997/+84 lines across those three files since the base.
- Its error-design content is small and superseded:
  - The `internal-error.ts` hunk only rewords two `console.error` lines, and J-HTTP deletes that body.
  - The protocol hunk changes the `'request failed'` default. That rewording is redone cleanly in J4.
  - The rest are scattered catch-site edits plus characterization tests across about 30 packages, all untested.
- **Rebase-then-merge** would mean hand-resolving 8 conflicts in an untested WIP that its author marked "do not merge alone". That is costlier than re-sheeting the 2 relevant hunks.

**Action:** release the hold on all 89 files now. Leave the branch unmerged; deleting it is the owner's call. Live catch sites it touched go back to the census pool by `(file, rule)`.

---

## 5. Executor sheets (one Codex job each; Jini first)

**Brief rules for every sheet.** Tests first; behavior identical except for the named change. New functions take `(required, optional = {})`; never remove an existing `_optional = {}` pad; framework signatures are exempt. Hooks are injected as props. No vendor code in core. No new packages or dependencies. No `eslint-disable`, `@ts-ignore`, `as any` or `as never`. Functions ≤ 50 lines (80 is a STOP), complexity ≤ 10. Keep why-comments verbatim. Words are plain: what failed + what to do + the ID; never generic. STOP the sheet on a missing declaration, an unlisted production importer (`git grep -n -F '<symbol>' -- packages/ apps/ development/`), a needed cast, or a size/complexity breach. Cloud runs the tests and named mutations and reconciles API baselines and ledgers.

### J1 · Jini · contract + vendor export · READY · ~8k

- **Tests first.**
  - `provider-plugins/src/__tests__/observability-sentry.test.ts`, after the case at `:201`: report `{ error: new Error('secret canary-XYZ'), context: { operation: 'site.export', incidentId: 'ERR-1111-2222-3333-4444', label: 'TypeError' } }`. Assert one event with exception type `TypeError`, value `ERR-1111-2222-3333-4444`, and stack frames present; assert no `canary-XYZ` anywhere in the event. Mutations: send `sanitizedError` for tagged reports; drop frames; keep the message line.
  - `observability-otel-operations.test.ts` (353 lines; add beside the existing operation cases): a tagged report inside an active operation gives one `exception` event with `exception.type` = label and the ID attribute, and no message. Mutation: omit the ID.
  - One case per tracker implementation: `traceIds()` returns the span's IDs for OTel and Sentry, and `undefined`/absent for the noop. Mutation: return the active scope's IDs instead of the tracker's own.
- **Edits.**
  - `core/src/contracts/observability.ts:51`: add `traceIds?(): TraceIds | undefined` to `OperationTracker`.
  - `:57`: add `incidentId?: string; label?: string` to `ErrorReport.context`.
  - `provider-plugins/src/observability-sentry/sentry.ts:129–144`: tagged branch. Add `captureEvent` to the existing `@sentry/node` import at `:36`. Also its operation tracker at `:159`: `traceIds`.
  - `observability-opentelemetry/otel-port.ts:143` (`traceIds` from the span context) and `:153` (tagged event).
  - `diagnostics/src/observability/fanout.ts:126`: the first defined `traceIds` among live trackers.
- **STOP** if a tracker implementation cannot reach its span context without a cast.

### J2 · Jini · reporter corrections + port swap · READY · ~16k (after J1)

- **Tests first** (`core/src/errors/__tests__/reporter.test.ts`, lines on merge-11):
  - `:50`, `:163`, `:203`: incident words are `fallback.message fallback.action (error ERR-…)`, with the same format for all three audiences and no details block for anonymous. Mutation: omit `fallback.action`.
  - `:63`: describe with a supplied `errorId` gives zero new host records and zero reports. Mutation: call `recordIncident` again.
  - `:78`: the logger gets the redacted `diagnostic` and **no** raw `error`. The report gets the original object and `{ operation: <fixed label>, incidentId, label, trace }` from the fake tracker's `traceIds`. Mutations: pass `error` to the logger; send `step` as `operation`; read `activeTraceIds` instead of the tracker.
  - `:247`: an `own-message` match publishes the fallback words, not the error's message. Mutation: `String(error.message)`.
  - `:252`: a per-call exact secret inside a sentence param is blanked. Mutation: host-only redaction.
  - `catalog.test.ts`: `callerSafeRules` excludes `own-message` bindings, and the model rules keep them. Mutation: put it back.
- **Edits.**
  - `reporter.ts`: `ErrorReporterPorts.tracker` (`:37`) becomes `observability: Pick<ObservabilityPort,'reportError'>`, imported from `../contracts/observability.js`. Delete `IncidentTrackerReport` (`:26–30`).
  - `describe`/`record` signatures as in §1. `reportToTracker` (`:114`) sends `context: { operation, level, incidentId, label, trace }`, with no `attributes.errorId` and no `exactSecrets`.
  - `recordIncident` (`:150`) drops `error` from the logger call. `describeFailure` (`:195`) skips `recordIncident` when `optional.errorId` is set; the message at `:201` gains the action. `refusal` (`:183`) passes the call's `exactSecrets`. `refusalError` (`:166`) treats `own-message` as fallback.
  - `catalog.ts:114` and `:191`: own-message becomes model-only.
  - `testing.ts:21`: `createRecordingTracker` becomes `createRecordingObservability` (`reportError` plus `trackOperation` with a fake `traceIds`). Its 2 test importers stay relative.
- **BREAKS:** reporter port renamed; `IncidentTrackerReport` removed; `describe` with an ID no longer records; `own-message` is model-only. There are no production callers (verified).
- **STOP** if any non-test importer of `reporter.ts` or `testing.ts` appears.

### J3 · Jini · the boundary `runOperation` · READY · ~4k (after J2)

- **Tests first.** New `core/src/errors/__tests__/boundary.test.ts`, with fakes only:
  - An incident gives exactly one `reportError`, one `end({ outcome: 'failed', failed: true })`, a result message with plain words + action + `ERR-` ID, and a secret from the error message never in the message.
  - A refusal gives zero reports and `end({ outcome: 'refused', failed: false })`.
  - Success gives `end({ outcome: 'completed', failed: false })` and the value.
  - Mutations: call describe twice; end with `failed: false` on an incident; put `error.message` in the words; skip `end`.
- **Edit.** Add `runOperation` (≤ 25 lines) to `core/src/errors/reporter.ts`, exported through the existing `@jini-ai/core/errors/reporter` subpath, so there is no manifest edit.

### J4 · Jini · generic words out · READY · ~3k (independent)

- **Tests first.**
  - `sidecar/src/__tests__/json-ipc.contract.test.ts:224,230` and `index.test.ts:670`: expect the new handler words. `HANDLER_ERROR` and `requestId` are unchanged.
  - `protocol/src/__tests__/errors.test.ts`: add one default-fallback case.
  - Mutations: restore `"internal error"` / `'request failed'`.
- **Edits.**
  - `sidecar/src/json-ipc.ts:343` message: "The sidecar could not finish this request. Try again, and report the request ID if it keeps failing."
  - `protocol/src/errors.ts:92,114` default: "The server did not give a reason for this response. Check whether the change was saved before trying again."
- **STOP** if a production consumer matches either old string (none found in Tovu or Jini production code).
- PARTIAL remainder, needing test anchors: admin `core/transport/http.ts:128`; Tovu `media-rendition.ts:609,712`; Tovu `use-local-sites.hooks.ts:58` `"Request failed"`.

### J5 · Jini · E9-J-SPLIT · READY · ~5k (independent)

err3's sheet as written, re-anchored: `createJsonIpcServer` starts at `json-ipc.ts:163`; apply by contents. The witnesses are the same (`json-ipc.contract.test.ts` success, handler failure, BAD_FRAME, idle, byte cap, second frame; `index.test.ts` UTF-8). Zero ledger delta.

### J6 · Jini · idioms batch A · READY · ~6k (independent)

err3's O126, O133, O134, O308, O397 and U550-roster sheets, plus keepstd O121, verbatim. Their anchors re-verified on merge-11.

### J7 · Jini · idioms batch B · READY · ~7k (independent)

census2's O93, O178, O245, O248, O302, O314, O423 and O485, verbatim. The "after jz2-a" prerequisites are satisfied (it is merged).

### J-HTTP · Jini · route boundary · PARTIAL (after J3)

**Missing:**
1. The server preset has no logger, catalog or observability inputs (`create-local-node-daemon.ts`). A config shape is needed so the preset builds one reporter.
2. Disposition of the 110 non-test `onInternalError` references, including daemon `model-proxy.ts`, `runs.ts` and `terminals.ts`, which call `reportRouteInternalError` directly. See owner Q2.

**Acceptance is ready (errfix1 J3):**
- The exception paths in http-kit `adapter.ts:114–147` and core `json-route.ts:260–278` run through `runOperation` with operation `http.route` and attributes `{ method, route: path }`.
- `spec.ports.onError` precedence and `ClientFacingError` stay as they are.
- `internal-error.ts:33–65` (the UUID and sink body) is deleted in the same change, and `server/src/route-host.ts:37` is rebound.
- Witnesses: `adapter-pins.test.ts`, `adapter.test.ts`, and the two-direction `decodeApiError`/`formatUserFacingError` reader tests.

### J-IPC · Jini · sidecar handler boundary · PARTIAL (after J3, J5)

Missing: the real host that supplies `{ observability, reporter }` to `createJsonIpcServer` (today only the sidecar export, its tests and docs reference it).

### T1 · Tovu · AG-UI failure words · READY · ~5k (independent of Jini)

errfix1's T1 as written, plus two corrections:
- **Anchors:** catch at `assistant-ag-ui.ts:302–305`; `AgUiFrameContext` at `:181`; the `drainAgUiStream` call at `:389`; `node:crypto` import at `:47`.
- **Additional edit** to the outer catch at `:401–405`: replace `console.error(…, error)` and the `tracker.error` call with one `reportServerFailure({ error, operation: "assistant.run" }, { tracker: routeDeps.tracker })`. Replace `"assistant failed"` with "The assistant stopped before it finished replying. Check the conversation, then try again and report this error ID if it repeats. (error <id>)".

Tests: `assistant-ag-ui-routes.test.ts:621` (case), `:145` (script), `:296` (injection). Add one case for headers-sent-then-throw. Mutations: errfix1's, plus restoring `"assistant failed"` and double-reporting.

### T2 · Tovu · keepstd idioms · READY · ~6k (independent)

keepstd's T167, T195, T197, T243, T321, T326, T391 and T459, verbatim. Anchors verified on merge-10.

### T3 · Tovu · `reportServerFailure` → reporter · PARTIAL (after the Jini release with J1–J3)

1. Reader-compatibility tests first (E4-T-READERS: `admin-failure-channel.ts:128–145`; flat with and without details, nested `requestId`, UUID, missing ID).
2. Build one reporter in website composition (where `res.locals.adminFailureTracker` is bound) with `TOVU_ERROR_REDACTION_OPTIONS`.
3. The body of `admin-failure.ts:53–63` becomes `reporter.record({ error, step: operation, operation }, { errorId })`, which deletes `randomUUID` and the synthetic `new Error(diagnostic)`.
4. `:77`: the 507 disk-space refusal gets no incident or ID.
5. `jini-routes.ts:11,65` is rebound after J-HTTP.

Missing: the exact composition file and line for step 2, and the Tovu catalog source.

### T4 · Tovu · err-tovu FIX sheets · PARTIAL

Re-anchor A, S, B, D, C, I, T, H and P by `(file, rule)` on merge-10 first. The source plans are kept.

### Order

**Wave 1, in parallel:** J1, J4, J5, J6, J7, T1, T2. **Then** J2 → J3 → Jini release → J-HTTP, J-IPC, gap 7 → T3 → T4 and the E5/E6/E8/E9-T/E10 partials.

---

## 6. Gap 7: operation tracking at boundaries · PARTIAL

Gap 7 **is** the adoption of `runOperation` (J3) at each entry point. J-HTTP and J-IPC already cover HTTP and sidecar. The remaining first slice is the **tool boundary**.

**Shape (decided).** In `daemon/src/tool-recovery/observability.ts:80–108`, `withToolCallObservability` takes `{ inner, observability, reporter }`.
- **Throws:** replace `tracker.run(() => observability.reportError(…))` at `:97` with `reporter.record({ error, step: 'Run tool', operation: 'tool.call', tracker })`.
- **Failed results** (`:103`): call the same `record` with `{ errorId: readToolErrorId(result) }`. This reuses the ID that the inner redaction layer (`redaction.ts:123`) already minted and wrote into the model text, so the model, the host log and the tracker share one ID.
- Keep the existing `tracker.end` and metrics.

**Tests (ready to write):** extend the decorator's existing tests:
- An internal failure gives one report, tagged with the result's ID, and `end({ failed: true })`.
- A `ToolInputError` gives zero reports.
- Mutations: mint a new ID; report inside `tracker.run` without the explicit tracker; report twice.

**What blocks READY:**
1. J2 and J3 must land.
2. Who consumes the `ToolFailureRecord` that `redaction.ts` reports (`deps.toolFailures`), and whether that sink is deleted once the reporter writes the host record (owner Q2 applies).
3. Composition `stack.ts:86` must pass the reporter. The assistant tool stack's host must have one, so this depends on T3 for Tovu.

---

## 7. Owner questions

1. **Change the ID format on Tovu replies from UUID to `ERR-…`?** This affects every `sendAdminFailure`/`reportServerFailure` reply, and any consumer that requires UUID syntax breaks. **Recommend yes**, after T3's reader-compatibility tests. One format lets the user, the host log and the tracker share the ID, and `formatUserFacingError` recovers only the ERR form.
2. **Delete the per-pack `onInternalError` sinks (110 references) and the tool `ToolFailureRecord` sink as each boundary migrates?** **Recommend yes, per package.** Once the reporter writes the host record they become a second reporting path, which errdesign already calls duplicate. Route-specific fields such as `runId` go into `attributes` instead.
3. **err-tovu size-debt rows (files over 500 lines or functions over 50):** repair in place, or split first? **Recommend in place** when the edited function does not grow and stays ≤ 80; split first otherwise.
4. **One operation span per HTTP route under the request span?** It costs one extra span per request, but it is what gives `reportError` explicit trace IDs (`RequestTracker` exposes none). **Recommend yes**, with the operation name fixed at `http.route` and the route pattern as an attribute, so cardinality stays bounded.
