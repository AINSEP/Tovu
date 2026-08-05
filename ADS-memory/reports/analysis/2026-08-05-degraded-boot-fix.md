# Degraded-boot defect fix — 2026-08-05

Dispatch: Programmer(Execution), `refactor/jini-admin-extraction`, HEAD `d4d8f5b` at start.

## The defect (as verified against code, not the handoff comment)

`src/assistant/agent-daemon-server.ts`'s `app.listen(port, "127.0.0.1", cb)` had no
`server.on("error", ...)` handler. On `EADDRINUSE` the underlying `http.Server` emits an
unhandled `error` event — an uncaught exception in Node — and the daemon process crashes with a
generic stack and Node's default exit code `1`.

`src/index.ts`'s `spawnAgentDaemon()` caught that via `child.on("exit", (code, signal) => { if
(code !== 0 && code !== null) console.error(...) })` and did nothing else: no retry, no readiness
signal, no effect on the main API, which is already bound and serving (it spawns the daemon from
*inside* `app.listen()`'s own callback).

The dangerous mechanism, verified against `src/server/modules/assistant.ts`: the reverse proxy
resolves `AGENT_DAEMON_URL` once and does a bare `fetch()` on every request, trusting "something
answered on the port" as proof the daemon is healthy. If `EADDRINUSE` fires because a **leaked,
orphaned daemon from a previous run** is still squatting the port — exactly the failure mode three
prior sessions' watchdog work was fighting — the fresh daemon dies, but the stale one is still
there and still answers. The proxy has no way to tell it is talking to the wrong instance. That is
the actual "silently wrong test results" mechanism, not mere silence toward unrelated routes (most
of the app, and BYOK mode specifically, never touch the daemon at all).

## Fix, four parts (approved by Coordinator, msg 2, after milestone-1 check-in)

1. **`agent-daemon-server.ts`** — capture the `http.Server` from `app.listen()`, add
   `server.on("error", ...)`. `EADDRINUSE` gets a distinct exit code
   (`AGENT_DAEMON_EXIT_CODE.PORT_IN_USE = 87`, new shared file `src/assistant/daemon-exit-codes.ts`)
   and a plain-words log line naming the port; any other bind error exits `1` with its own message.

2. **`index.ts`** — `spawnAgentDaemon()`'s exit handling no longer infers intent from the exit
   code. A new `shuttingDownDeliberately` flag is set only at the point `reap()` actually issues a
   kill (not before — if the child already died before `reap()` ran, that still counts as a
   failure). Any exit without that flag set — including a clean `code 0`, previously treated as
   fine — now calls `recordAssistantDaemonFailure(reasonCode)`, with the reason mapped from the
   exit code (`PORT_IN_USE` → "address already in use"; anything else → the generic message, now
   only used for genuinely-unknown crashes). `child.on("error", ...)` (spawn itself failing) also
   now records a failure, not just a log line.

3. **`readiness-state.ts`** — extends the existing `runBootLifecycle`/`BootResult` convention
   (already read by `/readyz` and the admin module-status route) rather than inventing a second
   readiness surface. New exports: `recordAssistantDaemonFailure(reasonCode)`,
   `isAssistantDaemonKnownFailed()`, `clearAssistantDaemonFailure()`. The daemon's entry is
   `criticality: "optional"` — visible in the snapshot, never flips the rest of the app's `ok`.
   `clearAssistantDaemonFailure()` is called at the start of every `spawnAgentDaemon()` attempt
   (currently exactly one per boot) so a future retry doesn't inherit a stuck 503 from an earlier
   attempt.

4. **`assistant.ts`** — `forwardToAgentDaemon` and `forwardAttachmentUpload` both check
   `isAssistantDaemonKnownFailed()` FIRST and return `503 {code: "AGENT_DAEMON_BOOT_FAILED"}`
   immediately, with **zero** `fetch` attempts, once our own spawn is known dead. This is what
   actually closes the stale-daemon hole: once we know our spawn failed, we stop trusting the port
   at all, regardless of what (if anything) is listening on it.

## A correction made mid-implementation

My milestone-1 message assumed `/readyz` would "carry the daemon's status" for item 4
(`daemon-ready.ts`). Verified against `src/server/routes/ops/health.ts`: `/readyz` filters to
`criticality === "critical"` failures only, by design — an existing, certified test
(`readiness-routes.test.ts`, `"/readyz 503s with only critical failures named..."`) explicitly
asserts optional-module reasonCodes/owners/remediationHints never leak through that low-trust,
unauthenticated endpoint. Adding the daemon's `reasonCode` text there would have violated that
established boundary.

Fix: `/readyz` gets exactly one new field, `assistantDaemonKnownFailed: true` — a bare boolean,
present only when true, naming no reason/owner/hint — added to both the `ready:true` and
`ready:false` response shapes. This preserves the "no optional-module detail" guarantee (a
boolean is not detail) while answering the one yes/no question `development/e2e/daemon-ready.ts`
needs, without requiring the `system.read`-gated module-status route's admin session. Confirmed
the existing three `/readyz` tests still pass unchanged (the field is omitted unless true, so no
existing `deepEqual` assertion needed updating) and added two new tests pinning the new field's
presence/absence.

## Item 4 — `daemon-ready.ts` (separate commit, destructive/adversarial e2e only, not BYOK)

`playwright.destructive.config.ts` now publishes `E2E_API_PORT` alongside the existing
`E2E_AGENT_DAEMON_PORT`. `daemon-ready.ts`'s poll loop checks `/readyz`'s new
`assistantDaemonKnownFailed` field, via a new `isDaemonKnownFailed(apiPort)`, BEFORE trusting a
bare TCP connect on every iteration — if true, throws immediately instead of polling out the full
timeout and reporting a misleading "never accepted a connection" (something DID connect; it just
isn't trustworthy). The bare TCP connect is kept as the primary "is it up" signal, since the new
`/readyz` field only ever says "known failed", never "confirmed ready" (no such confirmation
exists in production boot today).

`waitForAgentDaemon` itself memoizes its own promise at module scope by design ("the daemon boots
once per webServer") — deliberately NOT unit-tested directly, since repeated in-process calls
would return a stale cached result rather than exercise fresh state. The new decision function,
`isDaemonKnownFailed`, has no such state and is exported for test purposes and pinned directly
against a stand-in `/readyz` server in `development/e2e/__tests__/daemon-ready.unit.test.ts`.

Per the Coordinator's correction: this only benefits `destructive-path.spec.ts` (its only
consumer, confirmed by grep — `playwright.admin.config.ts`/BYOK never imports `daemon-ready.ts`).
It does not help the BYOK failures being chased elsewhere this session; it closes the same class
of defect in a suite that happens to be unrelated to that work.

## Tests added (all pass; verified they fail against pre-fix code)

- `src/server/__tests__/unit/readiness-state.unit.test.ts` — 6 cases on the new
  record/is/clear functions in isolation.
- `src/server/__tests__/assistant-proxy-routes.test.ts` — 4 new cases: 503 short-circuit on a
  passthrough route (`GET /api/runs`) and the SSE route, the dedicated attachment-upload proxy
  (separate `fetch` call site), and clear-then-recover. Each asserts `recorded.length === 0`
  against a stand-in daemon that IS healthy and listening — proving the short-circuit fires before
  any network call, not merely that the response code happens to be 503.
- `src/server/__tests__/routes/readiness-routes.test.ts` — 2 new cases: the new field appears
  (boolean only) when latched, and is omitted entirely when not (protects existing consumers from
  an unexpected key).
- `development/e2e/__tests__/daemon-ready.unit.test.ts` — 4 cases on `isDaemonKnownFailed`
  against a stand-in HTTP server (true/false/absent-field/no-network-yet/no-coercion-on
  non-boolean-truthy).

**Verification that the core pinning tests fail against today's code:** stashed only
`src/server/modules/assistant.ts` (the short-circuit) and re-ran
`assistant-proxy-routes.test.ts` — the 3 new daemon-failure tests failed with `200 !== 503` (the
stand-in daemon answered normally, exactly the silent-wrong-result shape this fix closes), all
other tests unaffected. Stash restored cleanly afterward.

Total new/changed test count run together: 33 passing (`readiness-state.unit.test.ts` (6) +
`assistant-proxy-routes.test.ts` (13, 9 pre-existing + 4 new) + `readiness-routes.test.ts` (6, 4
pre-existing + 2 new) + `server-modules.unit.test.ts` (4, pre-existing, unaffected) +
`daemon-ready.unit.test.ts` (4 new)).

## Verification

- `npx tsc --noEmit` at repo root: 0 errors, checked after every file group.
- No stray listeners: `lsof -nP -iTCP -sTCP:LISTEN` before/after showed only the owner's own live
  `npm run dev` tree (`:3000`, `:4319`) — untouched, as required. All test servers in this work
  bind to ephemeral port `0` and are closed via `t.after`.
- Scoped test runs only, never a full suite, per repo policy.

## Files changed

- `src/assistant/daemon-exit-codes.ts` (new)
- `src/assistant/agent-daemon-server.ts`
- `src/index.ts`
- `src/server/readiness-state.ts`
- `src/server/modules/assistant.ts`
- `src/server/routes/ops/health.ts`
- `src/server/__tests__/unit/readiness-state.unit.test.ts` (new)
- `src/server/__tests__/assistant-proxy-routes.test.ts`
- `src/server/__tests__/routes/readiness-routes.test.ts`
- `development/playwright.destructive.config.ts`
- `development/e2e/daemon-ready.ts`
- `development/e2e/__tests__/daemon-ready.unit.test.ts` (new)

## Residual risks / not done

- No retry logic for the daemon was added — a crashed daemon stays down for the rest of the
  process's life (unchanged from before; `clearAssistantDaemonFailure()` only prepares the ground
  for a future retry, it does not implement one).
- `AGENT_DAEMON_EXIT_CODE.PORT_IN_USE = 87` is an arbitrary but distinct, documented constant;
  not derived from any existing convention (none exists in this repo for daemon exit codes).
- `daemon-ready.ts`'s fix only reaches `destructive-path.spec.ts`; the adversarial suite's own
  `surface-abuse`/`surface-resilience` specs define their own separate `waitForDaemonReady` (per
  the Coordinator's correction) and were not touched — out of the scope given.
- Did not re-run `npm run check:architecture` (not explicitly required by the dispatch brief,
  and it is documented to have pre-existing WARNING-level findings unrelated to this change);
  the new cross-module imports (`assistant.ts` → `readiness-state.ts`, `health.ts` →
  `readiness-state.ts`) both already exist as established import directions elsewhere
  (`index.ts` and `module-status.ts` already import `readiness-state.ts`), so a new violation is
  unlikely but not independently confirmed.
