# P4 · Errors: next steps after combine-12

**Bases:** Tovu `41e948ee4`, Jini `6b8e0d48a`. `W/` = Tovu `apps/website/src/`, `J/` = Jini `packages/`.
**Leads:** `inputs/CULL.md` §1 (chosen design), §5 J-HTTP / J-IPC / T3 / T4, §6 gap 7, §7; `inputs/r62t-left.md` L3, L6, L8; `inputs/combine-12-jini.md` decisions 1–3; T4 source sheets: Tovu `origin/plan/err-design-1121:err-design/r62t-err-tovu.md` ("Execution sheets": R, A, S, B, D, C, O, I, T, H, P).
**Owner decisions (11-21 ~7:05 PM, binding):** ERR- id format after T3 reader-compat tests; delete `onInternalError` / `ToolFailureRecord` sinks **per package** as each boundary migrates; size debt repaired in place when the edited function does not grow and stays ≤ 80, else split first; **one `http.route` operation span per request, route pattern as attribute**; core changeset for the J1–J3 removals.
**Owner rules:** as in P1. Jini: no Express in core, reporter + `runOperation` stay in core, adapters in http-kit/sidecar/daemon.

## Current state (verified)
- Jini core: `J/core/src/errors/reporter.ts:158` `refusalError` (complexity 11; the redundant `own-message` line is `:163`), `runOperation` exported (combine-12 J3). ID minting `J/core/src/errors/error-id.ts:22` `mintToolErrorId` → `ERR-XXXX-XXXX-XXXX-XXXX`.
- Jini HTTP: `J/http-kit/src/adapter.ts:133–145` catch-all calls `reportRouteInternalError(…, { onInternalError: adapter?.onInternalError })`; `J/http-kit/src/internal-error.ts:1,33–38` mints a **UUID** `correlationId`. Core fetch twin: `J/core/src/contracts/server/json-route.ts:65,74` (`onInternalError` option), `:158–177` (`reportInternalError` port), catch `:191`. `J/server/src/route-host.ts:10,37` hard-binds `reportRouteInternalError`. Direct callers in daemon: `J/daemon/src/http/{model-proxy,runs,terminals}.ts`. Non-test `onInternalError` references: **92** (core 6, daemon 75, http-kit 11) — CULL said 110.
- Jini sidecar: `J/sidecar/src/json-ipc.ts:84` own `console.error` trace; `:163` `createJsonIpcServer`. Bug C112.
- Jini tool boundary: `J/daemon/src/tool-recovery/observability.ts:80` `withToolCallObservability({ inner, observability })`; reports at `:96` (throw) and `:103` (failed result) via `tracker.run(() => observability.reportError(…))`; `stack.ts:64,81,84` wires `toolFailures` (the `ToolFailureRecord` sink). Tovu supplies `toolFailures` in `W/assistant/tool-recovery-preset.ts:103–110`.
- Tovu: `W/server/inbound/shared/admin-failure.ts:54` `reportServerFailure` **already mints ERR- ids** with `mintToolErrorId` (tv-err1); it still does its own `console.error` + `tracker.error({ error: new Error(diagnostic) })` (`:61–62`). `adminFailureResponse` (`:70–79`) reports **before** the `DatabaseDiskSpaceError` 507 branch (`:78`) → bug C115. The one place a reporter can be built: `W/server/runtime/composition/app.ts:419` (`res.locals.adminFailureTracker = routeDeps.tracker`). `W/server/runtime/composition/jini-routes.ts:11,65` binds `reportRouteInternalError`.
- T391 (L3): `W/server/inbound/assistant/agent-daemon-server.ts:39` `exitDaemon`; `:48` `await registryPublication.catch(() => undefined)` still swallows. Fixture: `W/server/runtime/composition/__tests__/process-root-parity.test.ts:426` (`new Function("registryPublication", …)`).
- Tovu base gate rows from combine-12: error gate WARN 3 new/worse (`bundled-id-upgrade.ts` 5 `catch-reads-error`, `lifecycle.ts` 1, `use-page-editor.hooks.ts` 2→3) — those belong to P7-T1.

## Steps — Jini first

### P4-J1 · Jini · core changeset + `refusalError` fold (~0.5 h)
Add `.changeset/core-error-reporter-contract.md` with the exact text in `r62t-left.md` L6 (core `major`; names `ErrorReporterPorts.observability`, removed `IncidentTrackerReport` and `createRecordingTracker`, `runOperation`). Fold `reporter.ts:163` into the next line's `match.message ?? fallback.message` per L8, keep the why-comment at `:157`.
Tests first: none red for the changeset (artifact check: `pnpm api:check` must report core "breaking, covered by changeset" with **this** file — delete it → check fails). Fold: `check:complexity` row `refusalError (11)` disappears; existing `errors/__tests__/reporter.test.ts:243–283` and `catalog.test.ts` stay green. Mutation: make the catalog return the raw own-message text → reporter test must catch the disclosure.
STOP if a catalog implementation reachable by the reporter can supply `message` for `own-message`.

### P4-J2 · Jini · HTTP route boundary + one `http.route` span (J-HTTP + gap 7 HTTP slice) (~2 h; after P4-J1)
Missing piece named by CULL: the server preset has no reporter inputs. Add to `J/server/src/create-local-node-daemon.ts`'s optional config `errors?: { reporter: ErrorReporter; observability: Pick<ObservabilityPort, 'trackOperation'> }`. When supplied, `adapter.ts:133–145` and `json-route.ts:191` run the route body through `runOperation({ deps, operation: 'http.route', scope: 'http', step: 'Handle request', fallback, work, attributes: { method, route: <pattern> } })`; the adapter serializes `{ error: { code, message, requestId } }` with `requestId` = the ERR- id. When not supplied, today's `reportRouteInternalError` path is kept (no consumer breaks). `spec.ports.onError` precedence and `ClientFacingError` unchanged. Route pattern, never the raw URL, as the attribute.
Tests first: `http-kit/src/__tests__/adapter-pins.test.ts`, `adapter.test.ts`, `core/src/contracts/server/__tests__/json-route.test.ts`: `a throwing route with a reporter returns one ERR- id that matches the single report and host record`, `one http.route operation per request, attribute route is the pattern`, `refusal ends the operation as refused with no report`, `without a reporter the old path still works`. Red: no reporter input exists. Mutations: report twice; use `req.url` as the attribute; mint a second id in the adapter.
API: additive preset option. STOP if `json-route.ts` would need an Express import (it must not).

### P4-J3 · Jini · delete http-kit/core `onInternalError` sinks (~1.5 h; after P4-J2)
Per owner Q2, package by package: http-kit (11 refs) and core (6). Remove `onInternalError` options and `internal-error.ts:33–65` once `route-host.ts:37` is rebound to the reporter path; route-specific fields (`runId`) go into `attributes`. Daemon's 75 references are P4-J4.
Tests first: update the pins that asserted the callback; add `route-host serves an ERR- id from the injected reporter`. Mutation: leave a second log sink → test counting host records fails. Changeset: `@jini-ai/http-kit` major (removal), `@jini-ai/server` minor.
STOP if any Tovu file passes `onInternalError` (grep Tovu first: only `jini-routes.ts:65` binds `reportRouteInternalError`) without a replacement in the same release.

### P4-J4 · Jini · daemon routes + tool boundary (gap 7 tool slice) (~2 h; after P4-J2)
`J/daemon/src/http/{model-proxy,runs,terminals}.ts`: switch direct `reportRouteInternalError` calls to the injected reporter; delete their `onInternalError` uses (75 refs, mostly route registrars). Tool boundary per CULL §6: `withToolCallObservability({ inner, observability, reporter })`; `:96` → `reporter.record({ error, step: 'Run tool', operation: 'tool.call', tracker })`; `:103` → same with `{ errorId: readToolErrorId(result) }` so model text, host log and tracker share one id; keep `tracker.end` and metrics. Then delete the `toolFailures` (`ToolFailureRecord`) sink from `stack.ts:64–84` (owner Q2).
Tests first: decorator tests `an internal failure gives one report tagged with the result's id and end({ failed: true })`, `a ToolInputError gives zero reports`; daemon route tests `model-proxy upstream failure returns plain words and an ERR- id, no upstream text` (also closes C075's model-proxy part). Mutations: mint a new id; report inside `tracker.run` without the explicit tracker; report twice.
STOP if removing `toolFailures` breaks a consumer that is not the host record (grep Tovu `tool-recovery-preset.ts:103–110` — it must move to the reporter in P4-T3 in the same release window).

### P4-J5 · Jini · sidecar boundary (J-IPC) (~1 h; parallel with P4-J4)
`createJsonIpcServer` (`json-ipc.ts:163`) takes optional `{ observability, reporter }`; when given, handler throws go through `runOperation({ operation: 'ipc.handle', attributes: { method } })` and the wire keeps `{ code: 'HANDLER_ERROR', message, requestId }`; the `console.error` trace at `:84` goes to the injected logger. No host passes it yet — the default stays.
Tests: `a handler throw yields one report and the ERR- id in requestId`; mutation: keep the console sink as well.

**Jini release needed here** (P7-J2): P4-J1…J5 + P1/P2/P3 Jini steps. Tovu T3/T4 below consume it.

## Steps — Tovu

### P4-T1 · Tovu · T391 daemon shutdown idiom (~0.5 h; independent, no Jini release)
`agent-daemon-server.ts:48` → `await afterSettled({ promise: registryPublication })` from `@jini-ai/core/errors/idioms`; test per L3: add `afterSettled` to the `new Function` parameter list at `process-root-parity.test.ts:426`, pass a forwarding spy, assert it gets the original promise once after the store closes. Red: spy never called. Mutation: drop the await or move pointer removal before it.

### P4-T2 · Tovu · reader-compat tests, then reporter behind `reportServerFailure` (T3) (~2 h; after the Jini release)
1. Tests first (E4-T-READERS): `admin-failure-channel` reader handles flat with/without details, nested `requestId`, legacy UUID, ERR- id, missing id.
2. Build **one** reporter in `W/server/runtime/composition/app.ts` next to `:419` (ids = `mintToolErrorId` + `randomBytes`, clock, logger, observability from `routeDeps`, Tovu catalog, versions, `TOVU_ERROR_REDACTION_OPTIONS`); expose it as `res.locals.adminFailureReporter` beside the tracker.
3. `reportServerFailure` (`admin-failure.ts:54`) keeps its signature and becomes `reporter.record({ error, step: operation, operation }, { errorId })`; delete the synthetic `new Error(diagnostic)`.
4. `adminFailureResponse`: classify `DatabaseDiskSpaceError` **before** reporting (507, no incident, no id) — closes C115.
5. Rebind `jini-routes.ts:65` to the preset's reporter option from P4-J2.
Tests: `one admin failure writes one host record and one tracker report with the same ERR- id as the reply`, `disk-space refusal reports nothing`. Mutations: report twice; report before the 507 branch. The 238 calling files do not change.

### P4-T3 · Tovu · tool failures through the reporter (~1 h; after P4-T2)
`W/assistant/tool-recovery-preset.ts:103–110`: pass `reporter` to the daemon tool stack and drop `toolFailures` once Jini P4-J4 removed it. Test: `a failed site tool shows the same ERR- id to the model and in the host log`.

### P4-T4 · Tovu · err-tovu FIX sheets (T4) (~2 h per batch; R first, then parallel)
Re-anchor each sheet by `(file, rule)` on this base with `npm run check:errors -- --list`, then execute as written in `r62t-err-tovu.md`: **R** (ledger reconciliation, first), then in parallel **A** (admin picker/adapters/JSON field), **S** (Skills), **B** (daemon activation), **D** (desktop MCP host/smoke/updater), **C** (site-chat transport), **O** (background diagnostics), **I** (typed wrappers/causes), **T** (stored JSON), **H** (admin/daemon HTTP; 503 option), **P** (public HTTP with `reportServerFailure`). Size rule: repair in place if the function does not grow and stays ≤ 80; else split first (owner Q3). Batch as 3 implementers: (R+A+S+B), (D+C+O+I), (T+H+P).
Each sheet: tests first as named in the sheet; one mutation per behaviour as named; `check:errors -- --strict` shows the assigned rows gone and nothing new; `check:hooks` for A/S/B.
C overlaps P6 (site-chat transport rewrite): run **C before P6-T1** or fold C into P6-T1.

### P4-T5 · Tovu · delete Tovu-side duplicate sinks (~0.5 h; after P4-T2)
Remove remaining `console.error` + `tracker.error` pairs that P4-T2 made duplicate (grep `tracker?.error(` in `W/server/inbound`); keep why-comments.

## i18n / API / catalog
No new admin strings except T4 sheets' own (listed there, all locales). API baselines: http-kit major, server minor, daemon minor/major (removals), sidecar minor — changesets in each step. Tool catalog unchanged.

## Chrome / Electron owed
Admin: force a 500 on an admin route → the notice shows "… (error ERR-…)" and the same id is in the server log and tracker. Desktop: kill the sidecar handler → plain message with request id. T4 UI sheets (A/S/B/D) as listed in the sheet; D includes the native updater dialog.

## Dependencies / batches
- Jini batch 1: P4-J1. Batch 2 (after J1): P4-J2. Batch 3 (after J2, parallel): P4-J3, P4-J4, P4-J5.
- Tovu: P4-T1 any time. P4-T4 R then A…P any time (no Jini release needed except where a sheet names Jini `formatUserFacingError` — already published). P4-T2 → P4-T3, P4-T5 need the Jini release (P7-J2).

## Estimate
Jini ~7 h; Tovu ~4 h + T4 ~6 h (3 implementers × 2 h).
