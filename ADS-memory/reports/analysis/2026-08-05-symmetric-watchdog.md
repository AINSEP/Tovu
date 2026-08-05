# The Symmetric Watchdog for `src/index.ts` — Design (2026-08-05)

## Status: IMPLEMENTED and probe-verified. `src/index.ts`, `development/scripts/dev.mjs`.

Design reported to Coordinator first (Msg exchange below), one required change made before
implementation (the escape hatch + daemonization-launch-path check), then built and verified live.
See **Implementation** and **Post-approval verification** sections below for what actually shipped
and what the probes showed, including a real bug the probes caught that the design section below
did not anticipate.

Dispatched as Next Steps #4 from `ADS-memory/.local-artifacts/handoff/20260805-090128-handoff.md`:
close the still-open gap where killing Playwright's own top-level CLI process externally leaves
`src/index.ts` (the API) orphaned and self-unaware, mirroring the already-built daemon-side
watchdog (`src/assistant/agent-daemon-server.ts`'s `startParentWatchdog()`, commit `59d8c16`) one
level up.

**The brief's own framing assumed this needs the same env-var plumbing pattern as the daemon
watchdog** ("nothing hands `src/index.ts` a pid to watch... establishing what that pid even is
in every real launch context is the first open question"). Direct measurement below shows that
assumption is only TRUE for one of the four launch contexts. For the other three, `src/index.ts`
already has a reliable, zero-plumbing signal available: its own OS-level `process.ppid`. This
finding changes the shape of the fix — smaller, and stronger than a straight copy of the daemon's
pattern in one specific way (no PID-reuse blind spot for the part that uses it).

## The measured process tree per launch context

All four contexts named in the brief, inspected directly via `ps -eo pid,ppid,pgid,command`
(a small recursive `pstree.sh` helper was used throughout; see Verification below).

### 1. Playwright `webServer` — ONE hop, no env var needed

`playwright/lib/runner/index.js:841` passes `shell: true` when launching the `webServer.command`
string. Node's `child_process.spawn(cmd, {shell:true})` on POSIX runs `/bin/sh -c "<cmd>"`; for a
config command that is a single simple statement (`PORT=X TOVU_DB=memory ... node --import tsx
src/index.ts` — env-var prefix + one command, no `&&`, no pipes), the shell exec-replaces itself
into the target command instead of forking and waiting. Confirmed directly, isolated on port base
`7721` (mine, not `7621`/QA's or any committed config's reserved range):

```
35651 (npm exec playwright test ...)
  35704 (node .../playwright test ...)     <- Playwright's OWN top-level CLI process
    35707 (node --import tsx src/index.ts) <- ppid=35704 DIRECTLY, no intermediate `sh` pid
      35842 (npm exec tsx agent-daemon-server.ts)
        35874 (node .../tsx agent-daemon-server.ts)
```

`src/index.ts`'s real OS parent, in this context, already IS the exact process that Round 2/4 of
the root-cause doc killed to reproduce the still-open gap. No new plumbing needed to know which pid
to watch — it's `process.ppid`, already there.

### 2. Bare/manual `node --import tsx src/index.ts` — same one-hop shape

Launched directly from an interactive shell, the direct OS parent is that shell. Structurally
identical to case 1 (a live shell process, one hop). Terminal-close already sends `SIGHUP`, which
`spawnAgentDaemon()`'s existing signal handlers already catch and clean up on — this case was
never actually broken for a *catchable* parent death. It only had the same blind spot as case 1
for an *uncatchable* one (`kill -9` on the shell itself), and the same fix below covers it for
free, no separate code.

### 3. `npm run dev` (`tsx watch`) — MULTI-hop; the OS ppid genuinely does not help here

This is the one context where the brief's original framing is right. Confirmed by direct,
isolated reproduction (ports `7731`–`7733`, distinct from anything live or reserved; the protected
live dev tree, pids `84749`/`84779`/originally `9162` et al., was never touched — see Verification):

```
42488 (dev.mjs — the actual `npm run dev` process)
  42573 (npm exec tsx watch src/index.ts)
    42596 (node .../tsx watch src/index.ts)     <- the tsx-watch SUPERVISOR
      42597 (node ...src/index.ts)              <- the real API; ppid=42596, NOT dev.mjs
        42647 (npm exec tsx agent-daemon-server.ts)
          42721 (node .../tsx agent-daemon-server.ts)
            42723 (real daemon node)             <- listening :7733
  42657 (npm run dev -> vite) -> 42691 (vite) -> 42722 (esbuild)
```

`npx`/`tsx watch` are themselves Node-based CLI wrappers; unlike a plain shell, they do not
exec-replace — they stay alive and manage their own child. So `src/index.ts`'s real OS ppid here
is the **tsx-watch supervisor**, two hops below `dev.mjs`, and that supervisor process does **not**
die just because `dev.mjs` (its own parent) dies.

**Directly reproduced the gap this implies:** booted the isolated tree above, confirmed both ports
bound, then `kill -9` on ONLY `dev.mjs`'s own pid (mimicking, e.g., an agent's bash-tool timeout
SIGKILLing a backgrounded `npm run dev`). Two seconds later:

```
node 42597   TCP *:7731 (LISTEN)      <- API still alive, still bound, unchanged
node 42723   TCP 127.0.0.1:7733 (LISTEN)  <- daemon still alive, still bound, unchanged
42573    1 ...  npm exec tsx watch src/index.ts   <- reparented to ppid=1 (its real parent died)
```

Exactly the same shape as the Playwright CLI-kill gap, one supervisor layer up. A plain
`process.ppid` check on `src/index.ts` would never fire here, because its direct parent (the
tsx-watch supervisor) never actually dies — only a more distant ancestor does. This branch
genuinely needs the daemon's own env-var pattern, not the ppid trick.

### 4. CI — not independently verified; reasoned, and labelled as such

No CI environment was available to inspect directly. Whether case 1's exec-replace applies depends
on how the CI step is written: a single bare command as the step (or as the whole shell script)
plausibly gets the same one-hop shell-exec behavior; a chained `&&` sequence or a wrapper script
almost certainly does not, because the shell has more work queued after the target command and
cannot tail-exec-optimize away its own process. **Not claiming this is covered** — only that
shipping the ppid check does no harm if it never fires in CI, so there is no downside to leaving it
active there too.

## Node's `process.ppid` is a live signal, not a cached one — verified directly, twice

This is the load-bearing fact making case 1/2's fix free. Verified with a standalone probe
(`ppid-watch-probe.mjs`, scratchpad only, not part of the repo): a child spawned via
`spawn(cmd, {shell:true})` (mimicking Playwright's exact webServer spawn shape) logs its own
`process.ppid` every ~300ms.

- **Run 1 — coordinator exits gracefully** (`process.exit(0)`, no signal sent to the child at all):
  child's logged `ppid` flips from the coordinator's real pid to `1` on the very next poll,
  ~100-300ms later. Cross-checked against `ps` externally at the same moment: agrees.
- **Run 2 — coordinator is `kill -9`'d** (the actual shape of the still-open gap: an external,
  uncatchable kill of the top-level driver): identical result — `ppid` flips to `1` within the same
  ~300ms window, independent of *how* the parent died.

Because reparenting is permanent (the dead pid cannot come back to life under the same identity),
there is no scenario where `process.ppid` changing away from its boot-time value is a false
positive — every occurrence means the original parent is genuinely, unrecoverably gone. This has
no ambiguous-error case to misinterpret (unlike `kill(pid, 0)`'s `EPERM`-vs-`ESRCH` distinction in
the existing daemon watchdog), because it never sends a signal or makes a permission-gated syscall
at all — it only reads a value the kernel already maintains.

**Bonus property, not asked for but worth stating precisely:** this also has no PID-reuse blind
spot, unlike the daemon's existing `kill(parentPid, 0)` check. That check answers "does *a* process
with this recycled pid exist" — vulnerable if an unrelated process grabs the same pid inside the
poll window. Comparing live `process.ppid` against the value recorded at *this* process's own boot
never has that ambiguity: it is not probing an external pid's existence at all, it is reading the
kernel's own record of who this process's parent currently is. This does **not** retroactively fix
the daemon's own known limitation (out of scope, already accepted, not rebuilt here) — it only
means the new mechanism for `src/index.ts` doesn't inherit that specific weakness in the branch
where it applies.

**Not verified: Windows.** Playwright's own `attemptToGracefullyClose()` throws unconditionally on
`win32` for this exact family of behavior (`playwright/lib/runner/index.js` — see the root-cause
doc). This design inherits the same posture rather than assuming parity: POSIX-only, undocumented
Windows behavior, not tested.

## Design (pending Coordinator sign-off)

Two independent mechanisms, not one:

**A. Unconditional OS-ppid watchdog in `src/index.ts` — covers cases 1, 2, and (best-effort) 4.**
No env var, no opt-in gate, armed at true module scope as early as possible (mirrors
`startParentWatchdog()`'s own placement rationale in `agent-daemon-server.ts`):

```ts
const bootPpid = process.ppid;
setInterval(() => {
  if (process.ppid !== bootPpid) {
    console.error(`[index] parent process ${bootPpid} is gone (reparented to ${process.ppid}) — self-terminating`);
    process.exit(1); // fires the existing `process.on("exit", reap)` handler, cleaning up the daemon too
  }
}, 3_000); // same interval as the daemon's watchdog, same rationale, no new tuning needed
```

Safe to leave unconditional (never gated): in the one context where the direct parent legitimately
outlives the "real" driver (case 3, `npm run dev`), the direct ppid simply never changes, so this
never fires there — a true negative, not a wrongly-skipped case. It also does not conflict with
`tsx watch`'s own restart-on-save cycle: that delivers a real, catchable signal to the OLD process
first (already handled by the existing `SIGINT`/`SIGTERM`/`SIGHUP` handlers), and each fresh
incarnation gets its own fresh `bootPpid` at spawn — no stale state carries over.

**B. Opt-in env-var watchdog, mirroring `TOVU_PARENT_PID` exactly — needed only for case 3.**
`development/scripts/dev.mjs`'s `start()` call for the API child would need to pass e.g.
`TOVU_DEV_SUPERVISOR_PID: String(process.pid)` (dev.mjs's own pid) through to the spawn env, and
`src/index.ts` would poll `process.kill(supervisorPid, 0)` on it exactly like the daemon's existing
check (`ESRCH` confirms death, `EPERM`/other = inconclusive, skip). This is the ONLY piece that is
a genuine copy of the daemon's existing pattern — because case 3 is the only context where the
brief's original assumption (no ppid help, need explicit plumbing) actually holds.

**Recommend NOT closing the PID-reuse limitation for (B) via a start-time comparison.** Same
reasoning the existing daemon watchdog already accepted: no portable, cheap Node API exists to
read an arbitrary pid's start time (would mean shelling out to `ps` on every poll, or `/proc`
parsing that doesn't exist on macOS at all) for a benefit that's marginal given the short 3s window
and low pid-churn on a single dev machine. Documented as a known limit, not fixed, consistent with
the daemon's own precedent — not a new decision, the same one already made once.

**Scope recommendation:** (A) directly closes the brief's named gap (Next Steps #4, the
Playwright-CLI-kill scenario) with no new files besides `src/index.ts` itself, and is the
minimum needed. (B) is a real, symmetric, but separately-scoped gap discovered while answering the
brief's own "investigate all four contexts" instruction — it touches a second file
(`development/scripts/dev.mjs`) not named in the original dispatch. Proposing to build (A) as the
primary deliverable and (B) as a folded-in follow-up if the Coordinator agrees it's in scope,
per the same "ask me if it isn't small" pattern used for the IPv4/IPv6 `waitForPort` item.

## Verification method

- Playwright case: isolated real Playwright run, `BYOK_E2E_PORT_BASE=7721`, dedicated `--output`
  under this session's own scratchpad (never the shared `test-results/`), spec
  `byok-empty-key-guard.spec.ts` (fast, 2 tests, ~9.5s total) — full descendant tree captured via a
  recursive `ps`-based `pstree.sh` helper while the run was in flight (polled every 1s across two
  separate runs, once broad, once targeted after refining the grep pattern).
- `ppid`-liveness claim: standalone Node probe, run twice — once with a graceful parent exit, once
  with an actual external `kill -9` on the parent — both confirmed the child's `process.ppid` flips
  to `1` within ~300ms, cross-checked against `ps` at the same instant, not just the process's own
  self-report.
- `npm run dev` case: isolated real `dev.mjs` boot on ports `7731`-`7733` (never `3000`/`5173`/`4319`
  or `7621`), full tree captured before touching anything, then `kill -9` on only the top `dev.mjs`
  pid, re-checked via both `lsof` (port-bound truth) and `ps` (pid/ppid truth) 2s later. All
  probe-created processes cleaned up afterward; the protected live `npm run dev` tree was
  independently confirmed still alive and correctly bound to `:3000`/`:4319` throughout (its pids
  changed mid-investigation due to its own unrelated `tsx watch` restart cycle, not anything this
  investigation did — confirmed by never having sent a signal to any of the originally-listed
  protected pids).
- `npx tsc --noEmit` at repo root: not yet re-run since no production code has changed yet (design
  phase only). Will be re-run as part of Verification once (A) [and (B), if approved] land.

## Coordinator review — one required change

Coordinator independently reproduced the ppid-liveness claim before approving (own probe: `shell:
true` spawn, external SIGKILL, `44952 -> 1` in ~100ms) and confirmed the bootPpid-comparison design
(rather than testing `=== 1`) is the right call for Linux-subreaper portability.

**Required change, and the condition of approval:** "unconditional, always-on" inverts the safety
posture the daemon watchdog deliberately chose (opt-in by construction — only `spawnAgentDaemon()`
sets `TOVU_PARENT_PID`). The specific risk: **intentional daemonization** — `nohup node
src/index.ts &` followed by logout, or any double-fork pattern, deliberately outlives its parent by
design, and an unconditional ppid-comparison watchdog would misread that as an orphan and kill a
working deployment. Required before implementing:

1. Check this repo for any actual daemonizing production launch path.
2. Ship with an explicit `TOVU_DISABLE_PARENT_WATCHDOG=1` kill-switch regardless of what's found.
3. Document in-code which contexts this fires in vs. deliberately does not, per constraint 5 (write
   only what was measured) — CI marked accordingly, Windows kept "not supported".

**Daemonization search, done before implementing:** no `Dockerfile`, `docker-compose*`, systemd
`.service`, launchd `.plist`, `Procfile`, or deploy-scripts directory anywhere in the repo.
`grep`ing `nohup|daemonize|setsid` across `.ts/.js/.mjs/.sh/.yml` (excluding `node_modules`) hits
only `dev.mjs` and `src/index.ts` themselves, and both hits are these files daemonizing their OWN
children (the agent daemon / dev's API+Vite pair) — never anything daemonizing `src/index.ts`
itself. Production launch is `npm start` -> bare `node dist/src/index.js`, no wrapper
(`package.json`). **Correction to this doc's own earlier "case 4: CI, unverified" framing:**
`.github/workflows/ci.yml` never boots `src/index.ts` at all — `npm test` is the plain `node --test`
unit runner, no Playwright/e2e step exists in CI today. So case 4 isn't unverified, it's N/A: there
is nothing to watch because the file is never launched there yet.

No in-repo evidence of daemonization — but that only rules out what's committed here, not how an
operator might run this on a bare VM outside the repo. The kill-switch exists unconditionally
regardless of what this search did or didn't find, exactly as required.

## Implementation

**`src/index.ts`** — `startOwnParentWatchdog()`, armed at true module scope (before `main()`'s
slower boot work), mirrors `agent-daemon-server.ts`'s own `startParentWatchdog()` placement
rationale. Full mechanism doc is inline in the file; summary:

- `TOVU_DISABLE_PARENT_WATCHDOG=1` short-circuits the whole function (the required kill-switch).
- Records `bootPpid = process.ppid`, then immediately verifies via `kill(bootPpid, 0)` that the
  recorded parent was actually alive at that instant (see **Post-approval verification** below for
  why this exists and what it does/doesn't close).
- `TOVU_DEV_SUPERVISOR_PID`, if set, is parsed and watched via the daemon's own
  `kill(pid, 0)`/`ESRCH`-confirms-death pattern, copied as-is (including its accepted PID-reuse
  limitation — not closed here for the same reason it wasn't closed there).
- Every 3s (same interval as the daemon watchdog): self-`exit(1)` if `process.ppid` no longer
  matches `bootPpid`, or if the dev-supervisor pid is confirmed gone. `process.exit()` fires the
  existing `process.on("exit", reap)` listener for free — no separate cleanup call needed.

**`development/scripts/dev.mjs`** — the API child spawn now sets `TOVU_DEV_SUPERVISOR_PID:
String(process.pid)` alongside its existing env vars, giving `src/index.ts` the pid to watch for
the one context where its own OS ppid doesn't help (see Design section above).

**`waitForPort`'s IPv4/IPv6 item — verified, NOT fixed, and here is why.** Confirmed independently
that Vite's dev server really does bind `[::1]` only (a fresh standalone `vite --port 7741` shows
`lsof` reporting `TCP [::1]:7741 (LISTEN)`; a bare `net.connect({host:"127.0.0.1"})` gets
`ECONNREFUSED` while `host:"::1"` connects). **But `dev.mjs` has exactly one `waitForPort` call
site, and it targets `API_PORT`, not the Vite port** (`if (!(await waitForPort(API_PORT))) ...`) —
`dev.mjs` never polls Vite's readiness at all; it only orders Vite to start after the API responds.
Confirmed separately that the API's own `app.listen(port)` (no explicit host) binds `*:<port>`
(IPv6 unspecified, dual-stack) and IS reachable via a plain `127.0.0.1` connect. **There is no live
bug in `dev.mjs`'s actual code path today** — the previously-recorded finding about the IPv6-only
Vite bind is real, but it doesn't reach `dev.mjs`'s only caller of `waitForPort`. Left unfixed
rather than patched speculatively, per "verify before fixing" and this dispatch's own
systematic-debugging skill ("no fixes without root cause investigation" — there is no reproduced
root cause here to fix). Flagging as a possible defensive hardening for a *future* caller of the
same utility, not a live incident.

## Post-approval verification — probes, including one that found a real bug

**Probe 1 — isolated unit-level logic check (no tsx/app-boot overhead).** Copied the watchdog's
exact ppid-comparison logic into a standalone script, spawned via `shell:true` (mimicking
Playwright's exact shape), `kill -9`'d the parent. Result: `bootPpid` captured correctly, one tick
later `process.ppid` read `1`, self-terminate log fired, process exited. Logic confirmed correct in
isolation.

**Probe 2 — full real `src/index.ts`, kill AFTER full boot (the realistic incident shape).**
Isolated ports (7791/7793, never `7621`). Booted for real, waited for BOTH the API (`lsof` on
7791) and the agent daemon (`lsof` on 7793) to confirm listening — this run took **13s for the API,
+10s more for the daemon**, i.e. tsx's cold transform/load time is measured in double digits under
this machine's current load, not the ~5-10s dev.mjs's own comment estimates. Then `kill -9`'d only
the coordinator (mimicking an external kill of Playwright's own CLI). Result: **both the API and
the daemon were confirmed `GONE` via `ps` by t+3s, both ports confirmed freed via `lsof`**, and the
log shows the exact expected line: `[index] parent process 59487 is gone (reparented to 1) —
self-terminating`. This is the scenario every real incident in the root-cause doc actually measured
(Round 2/4 killed Playwright's CLI while its webServer was already up and serving, not while it was
still compiling) — closed, end to end, real code, not a synthetic stand-in.

**Probe 3 — a real bug, found by deliberately testing a race the design section didn't cover: kill
BEFORE the module finishes loading.** `kill -9`'d the coordinator at t=1.5s, well before the ~13-15s
this machine currently needs to load `src/index.ts`'s full import graph under `tsx`. Result (first
attempt, before a fix): **the process was still alive and unprotected at t+42s**, well past every
poll interval. Root cause, traced: no JS in this file — including `startOwnParentWatchdog()`
itself — can execute before `tsx` finishes transforming the ENTIRE import graph (ES module imports
are evaluated before the rest of the module body runs), and that transform is exactly the multi
-second-to-double-digit-second delay measured in Probe 2. If the real parent dies during that
window, `process.ppid` has ALREADY flipped to the reparent target (`1`) by the time this file's own
`const bootPpid = process.ppid` line finally executes — so `bootPpid` gets initialized to the
POST-orphan value directly, and the later comparison (`process.ppid !== bootPpid`) can never be
true again, because there is nothing left to change FROM.

**The fix implemented (the `kill(bootPpid, 0)` boot-time liveness check, described in
Implementation above) only closes part of this.** It correctly catches the narrow sub-case where
the real parent happens to die in the tiny window between this line running and the immediate
liveness check — verified: this doesn't help the Probe 3 scenario specifically, because by the time
this file's code runs at all, `bootPpid` has already been captured as `1` (the reparent target),
and `kill(1, 0)` trivially succeeds (pid 1/launchd is always alive) — the check has no way to know
`1` isn't the real, original parent once that information is already lost.

**This is a genuine, disclosed limitation, not silently swept under the "known limit" pattern:**
detection requires this file's own code to run before the module-load window ends, and nothing
placed within `src/index.ts` itself — no matter how early in the file — can execute before `tsx`
finishes loading the whole import graph. Closing it fully would need a separate, zero-import
bootstrap shim that arms a watchdog before `import()`-ing the real entry point — a bigger,
structural change to the process's own entry-point shape, not attempted here (out of the scope this
dispatch approved, and worth a deliberate decision rather than a design change buried inside this
one). **Practical mitigation, and why this was not escalated as a blocker:** every real incident
measured in the root-cause doc (Round 2/4) killed Playwright's CLI process AFTER its webServer was
already up and serving requests, not during initial compilation — the realistic trigger this
dispatch was scoped to close is the one Probe 2 confirmed fixed. The unclosed sub-case (parent dies
*during* this file's own module load) is narrower and was not part of any measured incident so far.

**Probe 4 — kill-switch.** `TOVU_DISABLE_PARENT_WATCHDOG=1`, kill parent after full boot: API
survives, unprotected, exactly as intended — log shows `[index] TOVU_DISABLE_PARENT_WATCHDOG=1 —
parent watchdog disabled`.

**Probe 5 — the `dev.mjs`/`TOVU_DEV_SUPERVISOR_PID` branch, real end-to-end.** Booted the real
`development/scripts/dev.mjs` in isolation (ports 7811-7813), waited for API + daemon both bound
(15s), `kill -9`'d only `dev.mjs`'s own pid (not the API, not the supervisor). Result: **API and
daemon both confirmed `GONE` by t+1s**, log shows `[index] dev supervisor process 62459 is gone —
self-terminating`, both ports freed. This directly closes the gap Probe/investigation earlier this
session reproduced with the *unfixed* code (API+daemon alive and bound, unchanged, 2s after killing
only `dev.mjs`) — same isolated setup, opposite result now.

**Verification housekeeping:** every probe above ran on ports in this dispatch's own range
(7721-7723, 7731-7733, 7751/7753, 7771/7773, 7781/7783, 7791/7793, 7801/7803, 7811-7813) — never
`7621` (QA's) or any committed config's reserved ports. All probe-spawned processes were confirmed
cleaned up after each run via `ps`/`lsof`; the one contamination incident (Probe 2's *first* attempt
picked up a stale leftover process from an earlier, uncleaned probe run and produced a false
negative) is recorded here rather than silently corrected, because it's the same "shared state
between runs" trap this repo's other agents hit repeatedly — the fix was to always confirm a truly
fresh spawn (track `child.pid` explicitly, confirm via `lsof`/`ps` it matches) rather than trust a
port-readiness poll that might be observing someone else's leftover process.

**`npx tsc --noEmit` (root): 0 errors**, before and after every change in this file.

**`npm run check:architecture`: still FAILS, unchanged from the pre-existing state the handoff
already bisected** (`assistant <-> db` cycle, core-size regression from uncommitted BYOK files —
neither touched by this change). This change adds zero new imports to `src/index.ts` (only
`process.kill`/`process.exit`/`console.*`/`setInterval`, all globals) and `dev.mjs` is a
`development/` script outside the production module graph this check scores — confirmed the
back-edges-into-composition-root metric is unchanged/improved (28 -> 26, matching the
already-recorded pre-existing state), not regressed by this work.

## Not yet done / open items for whoever picks this up next

- The module-load-window race (Probe 3) is disclosed above, not fixed. Closing it fully needs a
  separate zero-import entry shim — a structural change to how the process starts, deliberately not
  attempted here without a separate go-ahead.
- `waitForPort`'s IPv4/IPv6 hardening: verified NOT currently live-buggy (see Implementation
  above); a defensive dual-stack fix for the *utility function itself* (in case a future caller
  polls Vite's port) would be cheap but was not made, since there's no reproduced bug driving it.
- No changes were made to `agent-daemon-server.ts`'s existing watchdog or its accepted
  PID-reuse limitation, per explicit scope.
