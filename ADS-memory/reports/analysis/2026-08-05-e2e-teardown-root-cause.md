# E2E Teardown Hang — Root Cause (2026-08-05)

## Status: mechanism CONFIRMED. Both original suspects are REFUTED. Fix + hardening shipped.
## A second, separate, still-OPEN gap identified below (external-kill-of-CLI leak) — not fixed.

## Confirmed root cause

Playwright's default `webServer` teardown (`playwright/lib/runner/index.js:812-862`,
playwright-core `coreBundle.js` `launchProcess`/`killProcess`) does **not** send a catchable
signal to the webServer process unless `webServer.gracefulShutdown` is set in the config.
`development/playwright.admin.config.ts` does not set it on either `webServer` entry.

Concretely: `teardown()` calls `gracefullyClose()`, which calls
`options.attemptToGracefullyClose()`. In `playwright/lib/runner/index.js:842-847`:

```js
attemptToGracefullyClose: async () => {
  if (process.platform === "win32") throw new Error(...);
  if (!this._options.gracefulShutdown) throw new Error("skip graceful shutdown");
  ...
}
```

With no `gracefulShutdown` configured, this throws immediately. `gracefullyClose()` catches
that and calls `killProcess()`, which (POSIX) does:

```js
process.kill(-spawnedProcess.pid, "SIGKILL")
```

**SIGKILL cannot be caught.** `src/index.ts`'s `process.on("SIGTERM"/"SIGINT"/"SIGHUP", ...)`
handlers — and even the `process.on("exit", reap)` handler — never run. This was proven with
direct instrumentation (see Evidence below): zero `[DEBUG-REAP] reap() called` log lines
appeared across a full Playwright run, even though the test itself completed in 44.6s.

Separately, and just as important: `-spawnedProcess.pid` only kills **Playwright's own**
process group for the webServer command. `spawnAgentDaemon()` in `src/index.ts` deliberately
spawns the daemon chain (`npx -> tsx -> node agent-daemon-server.ts`) with `detached: true`,
putting it in a **separate** process group specifically so `reap()` can target it independently
(this was the 2026-08-04 D10-era fix, documented in the comment above `spawnAgentDaemon`).
That means Playwright's blunt group-SIGKILL of its own webServer process **never reaches the
daemon subtree at all** — confirmed via `ps`: the daemon's `npx` process (pid 66175 in the run
below) had `ppid=1` (reparented to launchd) after the webServer process was gone, i.e. it was
never touched by Playwright's kill.

The daemon subtree was spawned with `stdio: "inherit"`, so it shares the same pipe file
descriptors Playwright's `launchProcess()` set up to capture the webServer's stdout/stderr
(`stdio: "pipe"` server-side, since the config passes `stdio: "stdin"` which maps to the
`["pipe","pipe","pipe"]` branch in `launchProcess`). Because the orphaned daemon subtree still
holds the write end of that pipe open, `spawnedProcess.once("close", ...)` in
`playwright-core/lib/coreBundle.js` never fires (Node's `'close'` event needs the process to
exit **and** all stdio streams to close). `killProcess()`'s caller awaits exactly that via
`waitForCleanup`, so Playwright's teardown — and the whole test run — hangs forever with no
result printed. This is the actual "prints no result" symptom from the dispatch brief.

## Why the brief's two suspects are wrong

- **Prime suspect** (guard tests the wrong/direct child, not the grandchild): irrelevant.
  `reap()` never runs at all under Playwright's default teardown, so which PID the guard checks
  never comes into play. (The guard/kill logic itself was independently verified correct — see
  manual repro below: `process.kill(-child.pid, "SIGTERM")` **does** successfully kill the whole
  daemon group when the API process actually receives a catchable signal.)
- **Secondary suspect** (`process.kill(-child.pid, ...)` with `child.pid` possibly `undefined`):
  real tsc defect (confirmed, `src/index.ts:213`, `TS18048`), but not the cause of the observed
  hang — `child.pid` is defined in every run observed; this only matters in the (unexercised)
  edge case where `spawn()` itself failed to allocate a pid.

## Evidence

### 1. Manual repro — SIGTERM delivered directly to the API process WORKS

```
PORT=6821 TOVU_DB=memory JINI_AGENT_DAEMON_PORT=6823 node --import tsx src/index.ts &
# API pid 61832, npx pid 61871 (pgid=61871, own group per detached:true), daemon node pid 61945 (pgid=61871 — same group)
kill -TERM 61832
```
Result: `[DEBUG-REAP] reap() called: child.pid=61871 exitCode=null signalCode=null` then
`process.kill(-61871, SIGTERM) succeeded`. All three processes (API, npx, daemon node) exited
cleanly, port 6823 freed immediately. **This confirms the reap()/group-kill logic itself is
correct** — the bug is entirely about not receiving a catchable signal in the Playwright path.

### 2. Real Playwright run — the actual hang, instrumented

```
npx playwright test --config=development/playwright.admin.config.ts development/e2e/byok-google-tool-schema.spec.ts
```
- Test ran and finished: `✘ 1 [chromium] › ... (44.6s)`
- `/tmp/pw-run.log` contains exactly one `[DEBUG-REAP]` line for the whole run:
  `[WebServer] [DEBUG-REAP] spawned direct child pid=66175` — **no `reap() called` line ever
  appears**, confirming the signal handlers never fired.
- 6+ minutes after the test finished, the Playwright process (pid 66053) was still alive at
  0% CPU (`ps -o pid,etime,pcpu,stat`: `06:19 0.0 S`) — genuinely stuck, not slow.
- The daemon subtree was still alive and orphaned:
  ```
  66175     1 66175 npm exec tsx .../agent-daemon-server.ts   <- ppid=1, reparented to launchd
  66212 66175 66175 node .../tsx/agent-daemon-server.ts
  66233 66212 66175 node .../agent-daemon-server.ts            <- still LISTENing on :6423
  ```

### 3. Playwright source, confirming the SIGKILL-only default path

`node_modules/playwright/lib/runner/index.js:842-848` and
`node_modules/playwright-core/lib/coreBundle.js` (`killProcess()`):
```js
attemptToGracefullyClose: async () => {
  if (process.platform === "win32") throw new Error(...);
  if (!this._options.gracefulShutdown) throw new Error("skip graceful shutdown");
  ...
}
// caught by gracefullyClose()'s .catch(() => killProcess())
process.kill(-spawnedProcess.pid, "SIGKILL")
```
`grep -n "gracefulShutdown" development/playwright.admin.config.ts` — no match. Neither
`webServer` entry configures it.

### Incidental corroborating evidence

The environment already contained multiple pre-existing orphaned daemon chains, still bound
to ports, from earlier (unrelated) sessions/runs — consistent with this being a
long-standing, reproducible leak, not a one-off flake.

## Fix implemented (2026-08-05)

Two changes, since no in-process (`src/index.ts`-only) fix can intercept SIGKILL:

1. **`development/playwright.admin.config.ts`**: added `gracefulShutdown: { signal: "SIGTERM",
   timeout: 5_000 }` to both `webServer` entries. Makes Playwright send a real, catchable SIGTERM
   to `-launchedProcess.pid` before ever falling back to SIGKILL, giving `src/index.ts`'s existing
   (and verified-correct, see Evidence #1 above) `reap()` logic a chance to run and kill the
   daemon's separate process group.
2. **`src/index.ts`**: fixed `TS18048` at (former) line 213 properly — `child.pid` is captured
   once into a local `pid` right after spawn and `reap()` now guards on `pid === undefined`
   instead of computing `-child.pid` (which would have been `-undefined` = `NaN`, throwing inside
   the `try` and silently falling through to the weaker single-process fallback). Also documented,
   on the existing `detached: true` comment, why the daemon's separate process group — necessary
   for the pre-existing tsx-watch/`child.kill()` scenario — is exactly what shields it from
   Playwright's own group-SIGKILL, and how the config change closes that gap.
3. Removed all temporary `[DEBUG-REAP]` instrumentation added during diagnosis.

### Verification

- `npx tsc --noEmit` at repo root: **0 errors** (was 1, `TS18048` at `src/index.ts:213`).
- Manual repro re-run against the fixed code (same shape as the brief's repro):
  ```
  PORT=6821 TOVU_DB=memory JINI_AGENT_DAEMON_PORT=6823 node --import tsx src/index.ts &
  kill -TERM <api_pid>
  ```
  Result: API process gone, daemon process gone, port 6823 free — all within ~2s, no orphans.
- Real payoff test: `npx playwright test --config=development/playwright.admin.config.ts
  development/e2e/byok-google-tool-schema.spec.ts` — previously hung indefinitely (confirmed
  stuck 6+ min at 0% CPU with zero result printed, see Evidence #2). **After the fix: the process
  exited cleanly after 65s and printed a full result** (1 failed — an unrelated, pre-existing
  product-level assertion failure in the test itself, `expect.poll(...).toBeGreaterThan(0)` timing
  out waiting for the deputy to receive a request; not a teardown/hang issue and out of scope for
  this task). `lsof -i :6421 -i :6422 -i :6423` after the run: empty — no orphaned processes, no
  ports left bound.

### Scope note

The dispatch environment had significant pre-existing cross-session process contamination
(multiple orphaned daemon chains from earlier sessions, plus at least one concurrent/leftover full
-suite Playwright run occupying the same default ports mid-diagnosis) — all identified and cleared
before each verification step so results reflect only this fix's behavior, not contamination.
Several of the orphans found already bound to the suite's default ports are themselves further
live corroboration of the same root cause on unrelated prior runs.

## Round 2 (same day): field evidence from qa-byok-specs + coordinator hardening question

`qa-byok-specs` independently reported a related-looking incident: killed its own Playwright
wrapper mid-suite with an external timeout; the API, daemon, and vite children all stayed bound
"for at least several seconds" then were "gone on a follow-up check" — plus an unconfirmed,
self-flagged-as-uncertain observation of what looked like an API restart. The coordinator asked me
to weigh this against direct measurement rather than accept it, and separately asked a judgment
question: would giving the daemon its own stdio (instead of `stdio: "inherit"`) prevent an orphan
from ever hanging a parent's `close` event again — cheap defense-in-depth if it doesn't cost the
daemon's logs.

### What I actually measured (isolated repro, `BYOK_E2E_PORT_BASE=6921` to avoid qa-byok-specs'
### live concurrent run on the default ports)

Sent `SIGTERM` directly to Playwright's own top-level CLI process (the `node .../playwright test`
process itself, not its webServer child) mid-run, then polled every few seconds for 30+ seconds:

- The top-level process died immediately (as expected — no handler for a bare `SIGTERM`).
- The webServer (`node --import tsx src/index.ts`) and the daemon (`agent-daemon-server.ts`) were
  **still fully alive and bound, unchanged, 30+ seconds later** — zero self-cleanup observed.

**This contradicts qa-byok-specs' "gone within several seconds" report as I reproduced it.**
Mechanism: killing the top-level CLI process directly does not run Playwright's own `teardown()`
at all (that only runs on normal completion or Playwright's own internal signal handling of
whatever it actually installs a handler for) — so `attemptToGracefullyClose()` /
`gracefulShutdown` (this fix) never even gets invoked in this scenario. It bypasses the fix
entirely, at an earlier point than the bug this dispatch was scoped to. I can't rule out
qa-byok-specs hit a genuinely different trigger (a different kill target, a version/timing
difference, or the "several seconds" read on a process that was already mid-exit for an unrelated
reason) — flagging the discrepancy rather than asserting their report is wrong. Their secondary
"restart" observation (same PID via `ps aux`, shorter `etime` than expected) is most consistent
with ordinary OS PID reuse being misread as a restart, but I did not have a live instance to
confirm that explanation either.

**Conclusion: this is a second, separate, still-open gap** — an external kill of Playwright's own
CLI process (e.g. an enclosing timeout wrapper, which is exactly what qa-byok-specs was doing)
leaks the daemon with no fix in place. It is what produced the `EADDRINUSE`/degraded-boot
symptom the coordinator flagged in COORD-1. Not fixed here — flagged as a named follow-up below.

### Hardening implemented: daemon gets its own stdio, not `"inherit"`

Changed `spawnAgentDaemon()` in `src/index.ts`: `stdio: "inherit"` → `stdio: ["ignore", "pipe",
"pipe"]`, with `child.stdout.pipe(process.stdout)` / `child.stderr.pipe(process.stderr)` added
immediately after spawn to preserve the daemon's existing log visibility (verified: `[agent-daemon]
listening on ...` still appears in the parent's own output).

**Why:** `"inherit"` meant the daemon subtree shared this process's actual stdout/stderr file
descriptors — under Playwright, those ARE the pipe `launchProcess()` reads from to know when the
webServer child has fully closed. An orphaned daemon (from ANY cause, including the still-open gap
above) would keep that pipe's write end open forever, which is what turns "a daemon leaked" into
"an unrelated future process hangs waiting for a `close` event that will never fire" — the exact
mechanism behind the original bug this dispatch was scoped to fix.

**Verified directly**, not just reasoned about: wrote a small standalone probe
(`development/scripts/scratch-close-event-probe.mjs`, deleted after use — not part of the repo)
that spawns the webServer via a real `stdio: "pipe"` (mimicking Playwright's own
`launchProcess()`), waits on the child's `"close"` event, then sends `SIGKILL` directly to the API
process — bypassing `reap()` entirely, the worst case, deliberately chosen to still leak the
daemon. Result:
```
[probe] t=6503ms — sending SIGKILL directly to API pid=86326
[probe] t=6527ms — CLOSE event fired (code=null signal=SIGKILL)
```
`close` fired in 24ms. The daemon was confirmed still alive and still bound to its port at that
moment (the leak is real and NOT fixed by this change, as expected) — but it no longer had any
ability to block the probe's own `close` wait. This directly confirms the claim with evidence
rather than inference: **the stdio change closes the "orphan hangs an unrelated future process"
failure mode, but does not close the leak itself.** A genuine fix for the leak (daemon survives
regardless of what killed its parent, or why) needs the daemon to detect its own parent's death
independently — e.g. a watchdog in `agent-daemon-server.ts` polling `process.kill(parentPid, 0)`
— which is a change to a different file, out of this dispatch's scope, and is recorded as a named
follow-up rather than implemented here.

**Verification of the hardening itself:** `npx tsc --noEmit` — 0 errors. Manual SIGTERM repro
(daemon owns its own stdio now) — API + daemon both exit cleanly within ~2s, port freed, log
output still relayed correctly. Real Playwright spec (`byok-google-tool-schema.spec.ts`, isolated
port range `BYOK_E2E_PORT_BASE=6921` to avoid colliding with qa-byok-specs' concurrent live run) —
terminated cleanly in 50s, full result printed, zero orphaned processes or bound ports afterward.

## Named follow-ups (not fixed here, flagging for deliberate triage)

1. **Daemon survives when its parent is killed by anything that never runs `reap()`** — confirmed
   two independent ways this can happen: Playwright's own SIGKILL-only default teardown (fixed by
   `gracefulShutdown`) and an external kill of Playwright's top-level CLI process itself (NOT
   fixed — see Round 2 above). The stdio hardening stops the leaked daemon from hanging anyone
   else's teardown, but the leak — and the resulting `EADDRINUSE` on the next boot — is still
   real. Needs a parent-death watchdog in `src/assistant/agent-daemon-server.ts` (not `src/index.ts`)
   to close for good.
2. **Degraded boot on daemon start failure** (flagged by the coordinator from qa-byok-specs'
   incident, not investigated by me — out of scope for this dispatch): when `spawnAgentDaemon()`'s
   daemon fails to bind because of `EADDRINUSE` (e.g. from follow-up #1's leak), `src/index.ts`
   logs `"[index] agent daemon exited unexpectedly"` via the `child.on("exit", ...)` handler and
   the API **keeps serving anyway** — no fatal path, no readiness-state signal. That turns a
   leaked port into silently-wrong test results (requests to the assistant surface presumably fail
   or no-op with no loud signal) instead of a loud, attributable failure. Worth a deliberate
   decision on whether that should become a hard failure or a visible degraded-mode signal in
   `readiness-state`.
