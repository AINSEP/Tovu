# Agent daemon respawn/supervision — 2026-08-16

## The gap that was closed

`spawnAgentDaemon()` in `src/index.ts` was called exactly once per process boot. When the daemon
died unexpectedly, `child.on("exit")` recorded a failure reason and nothing ever started it again
— the AI assistant stayed dead for every workspace until a human restarted the whole Tovu process,
with no in-product way for a human to know how.

## What shipped

Three pieces, all backend, all landed in commit `5c1fae06`:

1. **Automatic respawn with exponential backoff** on any unexpected daemon exit.
2. **A crash-loop cap** so a genuinely broken daemon stops retrying and says why, instead of
   hammering forever.
3. **A manual restart seam** (`restartAssistantDaemon`) that works even after the cap trips — the
   piece that answers "a human's not gonna know how to restart a Node process."

The fourth item in the brief (an admin UI button) was explicitly out of scope and not built —
`apps/admin/**` belongs to another agent.

## Design

### Two new files

- **`src/assistant/daemon-respawn-policy.ts`** — pure decision logic (`createRespawnPolicy`). No
  I/O, no timers, no `child_process`. Takes `recordFailure({ isPortConflict })`, returns
  `{ action: "retry", delayMs, attempt }` or `{ action: "give-up", kind, attempts, ... }`. Fully
  unit-tested against an injected fake clock — 7 tests in
  `src/assistant/__tests__/daemon-respawn-policy.test.ts`.
- **`src/assistant/daemon-supervisor.ts`** — owns the real `child_process.spawn` (moved verbatim
  from `index.ts`'s old `spawnAgentDaemon`, same env vars / process-group detachment / stdio
  piping, just co-located so the `__dirname` join no longer needs an `"assistant"` segment), wires
  exit/error handlers to the policy above, and exposes the module-singleton wrapper
  (`startAssistantDaemon`, `restartAssistantDaemon`). 6 tests in
  `src/assistant/__tests__/daemon-supervisor.test.ts`, using a lightweight `EventEmitter`-based
  fake `SpawnedDaemonProcess` — no real OS process is ever spawned in either test file.

### Why extraction, not an inline patch

`index.ts` self-invokes `main()` at module load (see its own header), so it can never be imported
by a test — this is the same reason `boot-lifecycle.ts`/`bootstrap.ts` were already split out of
it. Separately, the old `spawnAgentDaemon` registered `process.on(SIGINT/SIGTERM/SIGHUP/"exit",
reap)` **inside itself** — harmless called once, but it would have leaked a fresh set of
process-level signal handlers on every single automatic respawn if the function were simply made
recursive in place. The real `process.on(...)` wiring now happens exactly once, in
`daemon-supervisor.ts`'s module-singleton wrapper (`startAssistantDaemon`) — the generic
`createDaemonSupervisor()` factory underneath never touches `process.on` at all, which is what
makes it safe to construct directly inside a unit test.

### Policy: backoff, crash-loop cap, EADDRINUSE

- **Backoff:** 1s, 2s, 4s, 8s, 16s, then holds at 30s.
- **Backoff index and the crash-loop cap both derive from the same 60s rolling failure window**,
  not a lifetime attempt counter. Nothing in this codebase's daemon-spawn path waits for the
  daemon to report itself healthy, so there is no "this attempt succeeded, reset the counter"
  signal to hook. A window-based count self-heals instead: one isolated crash after hours of
  healthy running always retries at the fast end of the ladder; only a genuine back-to-back crash
  burst escalates toward the cap.
- **Generic crash-loop cap:** 5 failures inside the 60s window → stop retrying, latch
  `"gave up after 5 attempts in 60s: <last reason>"`.
- **EADDRINUSE (`AGENT_DAEMON_EXIT_CODE.PORT_IN_USE`) gets its own tighter, CONSECUTIVE (not
  time-windowed) cap: 3 attempts.** A leaked port either clears within the first couple of short
  backoff delays or it doesn't; hammering it all the way up the same ladder used for a crashing
  process wastes cycles on a failure mode that backoff duration cannot fix. Gives up with an
  actionable reason naming `lsof -ti :<port> -sTCP:LISTEN`. A non-port failure resets this counter
  — it tracks "is THIS specific problem stuck," not general daemon health.

### Manual restart seam — what an admin "Restart assistant" button needs to call

```ts
import { restartAssistantDaemon } from "src/assistant"; // barrel export, ADR-009

const result = restartAssistantDaemon();
// { ok: true } — a fresh spawn attempt was started (policy reset, cap cleared)
// { ok: false, reason: "the assistant daemon was never started this process boot" }
```

No other wiring is required — it's already re-exported through `src/assistant/index.ts`'s
"Section D" barrel alongside `AGENT_DAEMON_EXIT_CODE` etc. It is synchronous and returns
immediately (does not wait for the new daemon to become healthy); the caller should treat `ok:
true` as "a restart attempt was started," not "the daemon is now confirmed healthy" — there is no
health-confirmation signal anywhere in this codebase today (see the backoff design note above), so
a route built on top of this should surface the readiness snapshot (`/readyz`,
`isAssistantDaemonKnownFailed`) separately if it wants to show live status after the click.

Internally, `restart()` kills a still-live current child **and waits for its actual exit** before
spawning the replacement — spawning immediately alongside a still-live daemon would collide on the
same port and immediately fail with the exact EADDRINUSE this supervisor otherwise guards against.
This was a real bug I found and fixed while building it, not something the brief called out
explicitly — worth flagging since it's exactly the kind of race a naive "kill then spawn" seam
would have hit the first time someone actually clicked the button.

## Comments corrected (falsified by this change)

- `src/assistant/agent-daemon-server.ts` — the `installUnhandledRejectionGuard()` rationale said a
  crash here "is not a request that gets retried... until an operator notices and restarts the
  whole Tovu process by hand." Corrected in place: the guard is still load-bearing (every crash
  still costs real availability during backoff, and a repeated crash can burn through the
  crash-loop cap), but the "no restart path at all" claim was rewritten to describe what
  `daemon-supervisor.ts` actually does now.
- `src/server/readiness-state.ts` — `clearAssistantDaemonFailure`'s doc said "There is no retry
  path today... this is a no-op on a fresh boot." Corrected to describe it running on every
  automatic respawn and the manual seam alike, not just the first boot. Also updated
  `recordAssistantDaemonFailure`'s `remediationHint` string (no test asserts the exact text —
  checked before changing it) since "restart the API process" was no longer the first thing an
  operator should try.
- Renamed every remaining `spawnAgentDaemon()` reference to `daemon-supervisor.ts`/
  `startAssistantDaemon` across the three files I own (`index.ts`, `readiness-state.ts`,
  `agent-daemon-server.ts`).

**Left un-fixed, out of my ownership scope, flagged here instead of touched:**
`src/assistant/daemon-auth.ts`, `src/features/source-control/commit-site.ts` (+ its test), and
three files under `src/server/__tests__/**` (owned by routes-coverage) still say
`spawnAgentDaemon()` in comments. Same class of staleness, same fix, different owner.

## Tests — RED confirmed before GREEN

- `daemon-respawn-policy.test.ts`: 7 tests — backoff ladder escalation and 30s cap, generic
  crash-loop trip with the distinct reason, the rolling window excluding old failures (proves the
  self-healing property), the EADDRINUSE sub-cap tripping before the generic cap would, a non-port
  failure resetting that sub-cap (adversarial case), and `reset()` clearing everything.
- `daemon-supervisor.test.ts`: 6 tests — unexpected exit → respawn; deliberate shutdown → no
  respawn (and confirms the kill signal was sent); crash-loop cap trips and latches a distinct
  reason (read back from the real `readiness-state` snapshot); manual restart spawns after the cap
  tripped; restart waits for a still-live child's actual exit before spawning the replacement;
  PORT_IN_USE gets the specific "could not bind... address already in use" message instead of a
  generic exit code.

Confirmed RED first for the policy module (`Cannot find module '../daemon-respawn-policy'`) before
writing the implementation. The supervisor tests were written against the already-implemented
module in the same pass; one of them (the port-conflict-reset test) legitimately caught a bug in
the TEST itself, not the implementation, on first run — the default crash-loop cap (5) was
tripping on total call count before the port-specific sub-cap (3) could be isolated; fixed by
raising the generic cap override in that one test.

## Evidence

```
node --import tsx --test src/assistant/__tests__/daemon-respawn-policy.test.ts \
  src/assistant/__tests__/daemon-supervisor.test.ts \
  src/server/__tests__/unit/readiness-state.unit.test.ts \
  src/assistant/__tests__/agent-daemon-installs-unhandled-rejection-guard.unit.test.ts
# 21 pass, 0 fail

npx tsc --noEmit          # clean
npx eslint <all 8 changed/created files>   # clean, no complexity warnings
```

Also ran `src/server/__tests__/routes/{readiness-routes,module-status-route}.test.ts` and
`assistant-proxy-routes.test.ts` (owned by routes-coverage, not touched, run read-only as a
regression check on `readiness-state.ts`'s doc/remediationHint changes) — 31 pass, 0 fail.

**Noise, not mine:** a scoped run of the full `src/assistant/**/*.test.ts` glob (1056 tests) shows
10 pre-existing failures in `tool-registrations.database-recovery.test.ts` (gated-mutations
authorization) and `tool-registrations.menus.test.ts` (draft/published state) — confirmed by grep
that neither file references `readiness-state`, `daemon-supervisor`, or the `assistant` barrel at
all. Consistent with concurrent uncommitted work from other agents in this same repo tonight, not a
regression from this change.

## Architecture Audit

- **Status: PASS.**
- ADR-009 (module barrel/no-deep-imports): `assistant` is a guarded module; both new exports
  (`startAssistantDaemon`, `restartAssistantDaemon`, `RestartAssistantDaemonResult`) go through
  `src/assistant/index.ts`'s existing "Section D" (Admin Daemon Proxy / Process Composition), and
  `src/index.ts` (a declared composition root) continues importing from the barrel (`./assistant`)
  exactly as it did before.
- No new cross-module dependency direction introduced: `daemon-supervisor.ts` imports
  `../server/readiness-state` — `assistant -> server` deep imports are already the established
  pattern in this file's sibling `agent-daemon-server.ts` (imports `../server/app`,
  `../server/deps`, `../server/boot/process-error-guards`).
- eslint `complexity`/`sonarjs/cognitive-complexity` (cap 15): both new files come back clean;
  largest function (`daemon-supervisor.ts`'s `restart()`) decomposed into `cancelPendingRetry`,
  `killCurrentChild`, `attemptSpawn`, `handleUnexpectedExit` as named helpers specifically to stay
  under the cap.

## Files changed

- `src/assistant/daemon-respawn-policy.ts` (new)
- `src/assistant/daemon-supervisor.ts` (new)
- `src/assistant/__tests__/daemon-respawn-policy.test.ts` (new)
- `src/assistant/__tests__/daemon-supervisor.test.ts` (new)
- `src/assistant/index.ts` (barrel — 2 new exports)
- `src/index.ts` (deleted the old inline `spawnAgentDaemon`, ~200 lines net; now calls
  `startAssistantDaemon({ workspaceId })`)
- `src/server/readiness-state.ts` (doc/remediationHint corrections only, no behavior change)
- `src/assistant/agent-daemon-server.ts` (doc corrections only, no behavior change)

Commit: `5c1fae06` on `general-work`.

## Open items / suggested next routing

- The admin "Restart assistant" button itself — needs `apps/admin/**` + whichever route file the
  team lead arbitrates with route-async-guards, calling `restartAssistantDaemon()` per the contract
  above.
- Stale `spawnAgentDaemon()` comment references in `daemon-auth.ts`, `commit-site.ts` (+ test), and
  three `server/__tests__/**` files — cosmetic only, listed above, owned by other agents/scope.
- No health-confirmation signal exists anywhere in the daemon-spawn path (flagged twice above) —
  real gap if a future feature wants to show "daemon is confirmed healthy" rather than "a
  spawn/restart attempt was started." Not built here; out of this task's scope.
