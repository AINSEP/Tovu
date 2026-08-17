# Jini Failure-Mode Adversarial Audit — 2026-08-16

**Subject:** `/Users/la/Programming/Jini` (read-only audit; no source edited)
**Agent:** Software Architect, adversarial mode
**Trigger:** Tovu shipped a bug where a missing encryption key made an async Express handler throw → unhandled rejection → the whole daemon process died (Express 4 does not catch async-handler rejections; no process-level guard existed). This audit asks: what else of that shape is lurking in Jini, and is Jini's failure behavior designed or accidental?

**Scope note:** `packages/http-kit` and `packages/server` were being actively edited by `jini-async-sweep` during this audit. Files there were read for evidence but not analyzed as a final state — anything cited from those two packages should be re-verified once that work lands.

---

## Headline: ranked findings

Ranked by exploitability × blast radius, not by how alarming the code looks.

### 1. `createLocalNodeDaemon` registers no OS signal handlers — SIGTERM bypasses every graceful-shutdown path
**File:** `packages/server/src/create-local-node-daemon.ts` (the whole `stop()` function, lines 364–405; confirmed absent: no `process.on('SIGTERM'|'SIGINT', ...)` anywhere in `packages/server/src`, `packages/daemon/src`, or `packages/cli/src`)

**Trigger:** Anything that sends the daemon process `SIGTERM` — a container runtime stopping the container, a process manager restarting the service, an operator running `kill <pid>` — the ordinary way any long-lived Unix daemon is stopped.

**Observable outcome:** Node's default `SIGTERM` behavior is immediate process exit. `stop()` — which closes the HTTP listener, disposes every composed feature (e.g. an in-flight OAuth loopback listener), removes the discovery record (`daemon.json`), and cleanly closes the two sqlite handles — is only reachable by an explicit in-process call to `daemon.stop()` or by `POST /api/daemon/shutdown`. Neither fires on a signal. Result: a stale discovery record pointing at a dead PID, sqlite handles not explicitly closed, in-flight runs never finalized.

**What else could cause the same outcome:** A hard crash (OOM-kill, `SIGKILL`) looks identical from the outside — a dead process with a stale registry file. The distinguishing evidence here isn't the artifact, it's the code: I grepped for `SIGTERM` handling and confirmed zero exists in the library path, so this isn't a hypothetical race, it's a structurally guaranteed gap on the single most common shutdown signal.

**Confirming evidence this is a known-good, just-not-adopted pattern:** `examples/reference-web/src/daemon.ts:670-673` does exactly the right thing — `process.once('SIGTERM', () => { void daemon.stop().finally(() => process.exit(0)); })`. That proves the correct pattern is understood, but it lives in an example app, not in `createLocalNodeDaemon` itself or as an exported helper (e.g. `installGracefulShutdown(daemon)`). Every real host has to remember to do this itself; nothing enforces or defaults it.

**Confidence:** High (structural — verified by absence, not inference). **Untested:** whether Tovu's own daemon-spawning code independently wires `SIGTERM` → `stop()`. That's Tovu's code, out of scope for this Jini-only, read-only dispatch — worth checking as a direct follow-up.

---

### 2. Zero timeout/AbortSignal on any of 67 raw `fetch()` call sites
**Files (representative, not exhaustive):** `packages/devops/src/deploy/{vercel,netlify,cloudflare-pages,github-pages}.ts`, `packages/registry/src/github-client.ts`, `packages/agent-runtime/src/providers/{elevenlabs,model-catalog,connection-test}.ts`, `packages/integrations/src/media-providers/dispatch/{vendor-adapter,openai-compatible,providers/openrouter,providers/openai}.ts`, `packages/memory/src/llm-provider.ts`

**Trigger:** Any of these outbound calls hits a remote endpoint that accepts the TCP connection but never responds (a stalled load balancer, a provider having a bad day, a firewall black-holing the request) — no attacker required, this is a routine internet failure mode.

**Observable outcome:** The `await fetch(...)` never resolves and never rejects. Whatever awaits it — a deploy-status poll, a provider connection test, a media-provider dispatch — hangs indefinitely. `packages/platform/src/http.ts` has exactly one timeout-aware helper, `waitForHttpOk` (a *polling* loop with its own `timeoutMs`), and it is not used by any of these 67 sites; each calls the global `fetch` directly with no `signal`. This is precisely the shape called out in the brief: a hang is worse than a crash because nothing alerts. It does not take down the daemon process (Node's event loop keeps serving other requests) — the blast radius is the one hung request/operation and, for deploy polling, an operator staring at a stuck UI with no error and no way to know why.

**What else could cause the same outcome:** A slow-but-eventually-responding remote (not actually infinite) would look identical for a while — the difference only shows up after the request has hung far longer than any reasonable operation should take. I did not reproduce a live hang (would require a black-holing endpoint); this finding is a direct code-level confirmation (grep for `signal:` near all 67 `fetch(` call sites returned zero matches) rather than an inferred suspicion.

**Confidence:** High for "no timeout exists at these call sites" (grep-verified). Medium for real-world impact — deploy/provider flows are user-initiated and bounded by the human giving up, not by an unattended background loop, so this is a UX/observability gap more than a daemon-killer.

---

### 3. `runs` Map in `run-lifecycle.ts` never evicts a completed run
**File:** `packages/daemon/src/run-lifecycle.ts:447` (`const runs = new Map<string, RunRecord>();`), and the only `runs.delete()` call at line 492 — which fires solely on the failed-durable-start rollback path (see the file's own comment at line 540).

**Trigger:** Normal operation of a long-lived daemon: every run that successfully starts (success, failure, or cancellation — all terminal states) stays in the in-memory `runs` Map for the rest of the process's life. No LRU, no TTL, no cap.

**Observable outcome:** Slow, unbounded memory growth proportional to total runs ever started since the daemon booted, not to runs currently active. Each `RunRecord` is not huge (status object, a few now-empty `Set`s, an optional `terminalEndEntry` — full event history lives in the durable sqlite event log, not in this record), so this is a slow leak, not a fast one — but it is a genuine "map that only grows" of the exact shape the brief asked about, and it compounds with daemon uptime rather than resetting per session.

**What else could cause the same outcome:** General memory growth could come from many places; I isolated this one specifically by tracing every `.set`/`.delete` on the `runs` Map and finding the delete path is single-purpose (rollback only), not a general cleanup.

**Confidence:** High that no eviction exists (grep + read verified). Medium on real-world severity — depends entirely on how many runs a given deployment accumulates before its next restart, which I did not measure.

---

### 4. One route in the "raw `app.get`" family has no enclosing try/catch — `registerRunEventStream`
**File:** `packages/http-kit/src/runs.ts:294-303`

```ts
export function registerRunEventStream(app: Express, deps: RunHttpDeps): void {
  app.get(RUN_EVENTS_ROUTE_PATH, async (req: Request, res: Response) => {
    const runId = req.params.runId;
    if (typeof runId !== 'string' || runId.length === 0) { ... return; }
    await handleRunEventStreamRequest(res, runId, requestedAfterCursor(req), deps);
  });
}
```

**Trigger:** Anything that makes `requestedAfterCursor(req)` or the small amount of `handleRunEventStreamRequest` code that runs *before* its own internal `try` (creating the SSE channel, registering the close callback) throw synchronously.

**Observable outcome:** Because this is an `async` Express 4 handler with nothing awaiting or catching it at the mount site, a synchronous throw here becomes an unhandled promise rejection with — per Finding 1's confirmation — no process-level handler anywhere in the daemon/HTTP path. Daemon dies, taking every other in-flight run and connection with it.

**Why this is ranked below the others, adversarially:** I tried to find a live throw path and mostly failed. `createSseChannel` (`packages/http-kit/src/sse.ts:135-232`) is a pure synchronous constructor with no throw sites under normal conditions. `requestedAfterCursor` (`sse.ts:235-243`) just reads `req.get`/`req.query` — safe against a real Express `Request`. And critically, `RunLifecycle`'s own event fan-out (`run-lifecycle.ts:466-474`, `notifySubscribers`) already wraps every subscriber callback in try/catch-and-swallow *by design*, specifically so a broken SSE writer can't propagate up through the lifecycle — so even a throwing `channel.enqueue` during live event delivery is caught upstream, not here. **This is a latent gap, not a live one**, today.

**Why it's still worth flagging:** It is the *one* member of its own pattern-family without the belt-and-suspenders its siblings have. `registerRunStreamRoute` (`packages/http-kit/src/run-stream.ts:131-146`) — structurally the AG-UI-encoder twin of this exact route — wraps its whole body in try/catch specifically to guard this class of bug. `attachments.ts`'s hand-mounted POST/DELETE routes (`packages/http-kit/src/attachments.ts:952-974`) do the same, with a comment that says outright: *"nothing else stood between that throw and an unhandled rejection with no process-level guard anywhere in this package's path"* — a direct, contemporaneous acknowledgment of precisely the failure class this audit exists to find, written because `isLocalSameOrigin` throwing on a malformed `JINI_ALLOWED_ORIGINS` entry was a **real regression that actually happened** (referenced test exists for it). `registerRunEventStream` didn't get the same one-line defensive wrap its two siblings did. The cost of closing this gap is a three-line try/catch; the cost of leaving it open is that the next refactor of `requestedAfterCursor` or `createSseChannel` that introduces a synchronous throw — the same way the origin-guard regression did for attachments — has zero net under it.

**Confidence:** High on the structural gap (no try/catch, verified by reading). Low on live exploitability today (adversarial attempt to find a throw path came back empty).

---

## Designed this way — deliberate, not defects

This codebase is *unusually* self-aware about the exact failure class this audit was sent to find. Every one of the following is evidence of intent, not accident:

- **`create-local-node-daemon.ts`'s `POST /api/daemon/shutdown` handling** (lines 341-352): the route answers before shutdown begins, so nothing can await the shutdown promise. The code explicitly names the trap — *"Dropping it with a bare `void` turned any shutdown failure into a process-level unhandled rejection — which on Node's default policy terminates the very process this was trying to shut down gracefully"* — and reports the failure through `console.error` instead. A paired test (`packages/server/src/__tests__/create-local-node-daemon.test.ts:1307-1344`) asserts `unhandledRejection` is never fired for this path. This reads as a direct fix for a previously-real incident, not speculative hardening.

- **`mountJsonRoute` (`packages/http-kit/src/adapter.ts:57-122`)** is a comprehensive, deliberate generic wrapper: every route defined through `defineJsonRoute`/`mountJsonRoute` gets a full try/catch/finally, a SEC-005-aware error sink (never leaks `error.message` — a driver/DB/credential string — to the caller; correlates via a `requestId` instead), and client-disconnect detection wired to `res`'s `'close'` event rather than `req`'s, with an explicit comment explaining why `req`'s fires falsely on every POST. This is the majority of the JSON API surface, and it is solid.

- **`run-lifecycle.ts`'s `notifySubscribers`** (lines 459-474) isolates each subscriber's throw individually, citing a **prior code review finding** (`CR-R1` in `Jini/ADS-memory/reports/code-review/CR-backend-coverage-push-2026-07-20.md`) — this exact bug class (one broken SSE consumer taking down run delivery for everyone) was found and fixed before this audit, not discovered here.

- **`agent-executor.ts`** registers empty `child.on('error', () => {})` handlers on every spawned agent-CLI child process (lines 1642, 1647, 1834-1835, 1977-1978). This is the *correct* defensive idiom — Node's `EventEmitter` throws synchronously if an `'error'` event has no listener, so a `ChildProcess` with no `'error'` handler is itself a crash vector on spawn failure. SIGTERM→SIGKILL escalation across a spawned child's full descendant process tree is implemented (`stopProcesses`, referenced ~line 700) for cleanup/cancellation.

- **`sidecar/json-file.ts`** writes the daemon discovery record via temp-file-then-`rename` (lines 27-34) — a real atomic-write pattern — and `daemon-registry.ts`'s own doc explicitly reasons about "a process that was killed mid-write despite the atomic-rename writer" as a read-time case to handle. Crash-safety here was designed, not assumed.

- **`desktop-host/src/logging.ts`'s `installFatalExceptionHandlers`** (lines 114-151) is the *only* process-level `uncaughtException`/`unhandledRejection` handler in the repo, and it is **not** a catch-and-continue mechanism. It logs, then deliberately re-throws via `setImmediate` after removing itself — explicitly to "let Node's default crash path (and Electron's native error dialog) take over" — except for one named harmless macOS `EINVAL` socket-option error, which is genuinely swallowed. This directly answers the audit's central question for the Electron shell specifically: **crash-then-let-the-shell's-supervisor-restart is the explicit, documented, intended architecture there.** It is not a gap; it's a choice, and a correctly-implemented one (self-detaching before re-throw specifically to avoid an infinite handler loop).

**The gap is what this pattern doesn't cover.** The same "log then let the process die" philosophy that's correct for the Electron shell has no equivalent for the bare daemon core when it isn't run inside `desktop-host` — nothing there logs *why* it's dying before Node's default stderr-dump-and-exit takes over. That's not necessarily wrong (whatever spawns the daemon may capture its stderr), but it means the daemon's own resilience is a **patchwork of manually-applied, well-reasoned local guards** (mountJsonRoute, attachments.ts, notifySubscribers, agent-executor's `child.on('error')`) rather than one systemic decision. Finding 4 is the shape of what falls through that patchwork: everywhere the team explicitly thought about this bug class, they fixed it, sometimes citing a real incident that already happened. The one place they didn't is still standing.

---

## Minor / context, not ranked as a defect

**`.rebuild.lock`** (untracked, root of the Jini repo, timestamp Aug 11 — five days stale as of this audit): grepped for `rebuild.lock` / `rebuild\.lock` across every `.ts`/`.js`/`.mjs`/`.sh`/`.json` file in the repo (excluding `node_modules`) — **zero references**. No code path creates, checks, or removes it. This is not a lock file the daemon's own crash-recovery logic depends on; it reads as tooling residue (a manual `touch`, or an external build/rebuild script run outside this session) rather than a Jini defect. Flagging its existence per the brief, but there is nothing in Jini's own source that owns it.

---

## What I could not test, and why

- **Whether SIGTERM-mid-run actually corrupts state in practice** (Finding 1): traced from source, not empirically reproduced — the dispatch rules for this audit prohibit killing processes I didn't start, and there was no already-running daemon instance of mine to signal.
- **Whether Tovu (or any other real Jini host) independently wires `SIGTERM` → `daemon.stop()`** the way `examples/reference-web/src/daemon.ts` does: that's Tovu's code, out of scope for a Jini-only read-only dispatch. This is the single highest-value follow-up.
- **A live hang reproduction for Finding 2**: would require standing up a black-holing HTTP endpoint and driving a real deploy/provider call against it; confirmed the code-level absence of any timeout instead.
- **Real-world memory-growth rate for Finding 3**: no production run-volume data available to estimate how many runs accumulate before this becomes operationally visible.
- **The current state of `packages/http-kit` and `packages/server`**: `jini-async-sweep` was actively editing both during this audit (confirmed via `git status` at the start). Everything cited from those two packages reflects a snapshot mid-edit elsewhere in the repo (not files I touched) and should be re-checked once that work lands — it's plausible some of the above is already being addressed there.
- **The idempotency index's own full lifecycle** in `run-lifecycle.ts` beyond the one `.delete()` site found — not fully traced end to end.

---

## Bottom line

Jini's HTTP/daemon core is **better hardened against "async throw kills the process" than the average codebase this size** — multiple sites show direct, dated evidence of the team finding and fixing this exact bug class before, including one citation of a prior code-review finding and one regression test asserting `unhandledRejection` never fires. But that hardening is achieved through repeated, manual, per-site patching rather than one systemic guarantee (no process-level `unhandledRejection`/`uncaughtException` handler exists anywhere outside the Electron shell, and that shell's handler is a log-then-crash safety net, not a catch-and-continue one). The most consequential concrete gap found is structural rather than in application logic: **the graceful-shutdown path the team built carefully is not wired to the OS signal that actually stops a daemon in production.**
