# serve-command integration suite hang — investigation report (2026-09-07)

Code Inspection(Execution): investigation only, per dispatch. No tests run, no server started, no
files modified, no git state changed. `AI-Dev-Shop/agents/code-inspection/skills.md` loaded first,
as required.

## Scope read

- `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts` (modified,
  uncommitted)
- `apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts`
  (modified, uncommitted)
- `apps/website/src/cli/__tests__/integration/serve-command-plugin-sdk-resolver.integration.test.ts`
  (modified, uncommitted)
- `apps/website/src/cli/__tests__/helpers/remove-fixture-tree.ts` (new, untracked)
- `apps/website/src/cli/__tests__/integration/zzz-debug-cr-r04-2.test.ts` (new, untracked — a debug
  probe)
- `apps/website/src/cli/commands/serve.ts` (implementation)
- `apps/website/src/server/runtime/lifecycle/daemon-supervisor.ts` (implementation)
- `apps/website/src/cli/main.ts` (implementation)

## 1. Root cause

I cannot prove a single deterministic root cause by reading alone — the failure is a hang under
concurrency, not a static defect that always fires. What I *can* prove by reading is that this test
suite contains **two independent, unbounded-wait code paths**, either of which is sufficient on its
own to produce exactly the observed symptom (0.0% CPU, state `S`, indefinite, with a live orphaned
`tovu serve` process left behind because the hang happens before the test's own `finally`/cleanup
ever runs). I'm presenting both as proven structural defects; which one (or both) actually fired in
the specific 64-minute run is a hypothesis, clearly labeled as such.

### 1a. PROVEN: unbounded `fetch()` — no timeout anywhere in any of the three files

Every `fetch()` call in all three files — inside `waitForHttpReady()`'s polling loop and in every
post-ready assertion fetch (login, module-status, plugin-route probes, welcome-page checks) — is a
bare `await fetch(url)` with no `AbortSignal`/timeout. Confirmed by grep across all three files:
zero hits for `AbortSignal`/`AbortController` anywhere in the suite.

Example, `serve-command.integration.test.ts:121-139` (`waitForHttpReady`):

```ts
while (Date.now() < deadline) {
  if (exited) throw new Error(...);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);   // <-- no timeout/signal
    void res.text();
    return;
  } catch {
    await new Promise((r) => setTimeout(r, 150));
  }
}
```

The outer `while (Date.now() < deadline)` loop is **only re-checked between fetch attempts**. If a
spawned `tovu serve` process ever accepts the TCP connection but never completes the HTTP response
(a genuine app-level stall — e.g. contention on a synchronous `better-sqlite3` call, or a promise in
the boot-readiness chain that never settles under load), the single in-flight `fetch()` call never
resolves or rejects, so the deadline is never re-evaluated. `loadFactor()`'s scaling (up to 6x) is
irrelevant here — it protects against a *slow* server, not a server that never answers a request it
already accepted. This is present, unchanged, in all three files (`serve-command.integration.test.ts`,
`serve-command-boot-lifecycle.integration.test.ts:87-107`,
`serve-command-plugin-sdk-resolver.integration.test.ts:89-109`) — none of the three diffs touched
this function.

This exactly matches the observed behavior: the hang is inside the test's own `try` block, so the
`finally` block's `stopGracefully(child)` (which sends SIGTERM) is **never reached** — which is why
the real `tovu serve` child process is left running as an orphan, in turn leaving its own spawned
agent-daemon child running too.

### 1b. PROVEN: unbounded `spawnSync` — 8 of 9 `runCliSync` call sites pass no timeout

`runCliSync` (`serve-command.integration.test.ts:88-91`) forwards its optional `timeoutMs` straight
into `spawnSync`'s `timeout` option, which Node defaults to "no timeout" when `undefined`. Every
call site except one omits it:

```
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:174  runCliSync(["init", ...])                          — no timeout
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:183  runCliSync(["serve", dir, "--port", badPort])       — no timeout
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:209  runCliSync(["serve", dir, "--port", ...], {}, 60_000) — HAS a 60s timeout
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:231  runCliSync(["serve", dir])                          — no timeout
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:248  runCliSync(["serve", dir])                          — no timeout
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:264  runCliSync(["serve", dir])                          — no timeout
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:278  runCliSync(["serve", dir, "--port", String(port)]) — no timeout
apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts:402  runCliSync(["serve", dir, "--workspace", ...])      — no timeout
```

`spawnSync` with no timeout is a **hard, synchronous OS wait** (`waitpid`) on the whole test process
— not an async promise something else could race or that a `--test-timeout` flag could preempt via
the event loop, since the event loop isn't running during a blocked `spawnSync`. This is the single
best match for "0.0% CPU, state S" of the *whole* process: if any of these "should exit almost
instantly with a validation/error exit code" invocations ever fails to reach `main.ts`'s
`process.exit(outcome.exitCode)` (`cli/main.ts:41`) — e.g. because `await
runProductionReadinessGateOrExit()` (`serve.ts:238`) or some other awaited step ahead of the throw
stalls under the same kind of contention as 1a — the parent test process blocks forever with no
mechanism to intervene.

### 1c. Documented, pre-existing, ALREADY-ACKNOWLEDGED gap: the daemon grandchild can outlive its own kill signal

`helpers/remove-fixture-tree.ts:32-40` (part of the uncommitted WIP, written by whoever last touched
this) states as an established fact, not a hypothesis:

> `spawnRealDaemonProcessFor` launches the daemon as `spawn("npx", [...], { detached: true })` in a
> dev/test tree, so `shutdownAssistantDaemon()` signals the `npx` wrapper and the `tsx` grandchild
> can outlive it — an orphan holding the served site's SQLite files open ... indefinitely. That is a
> real (pre-existing, out-of-scope here) process-lifecycle gap.

I traced this independently in `daemon-supervisor.ts`: `killCurrentChild()` (line 257-270) does send
a process-group kill (`process.kill(-pid, "SIGTERM")`), which is the correct mechanism *if* `npx`
and its `tsx` grandchild share `pid`'s process group. The daemon-supervisor file's own header
(`daemon-supervisor.ts:366-370`) documents that `stdio` was deliberately changed away from
`"inherit"` specifically to fix an earlier, similar "Playwright-teardown hang" — so this class of bug
has already been fought once in this exact file. Whether the `npx` re-exec still preserves the
process group on this machine's npm/npx version is not provable by reading; I did not find a
counter-example, but this is exactly the kind of thing that only manifests under real process-tree
inspection, which the task instructions forbid me from running. Treat 1c as **corroborating, not the
primary mechanism** — it explains the *duplicate agent daemon* symptom on its own (independent of
whether the test runner itself hangs), but the report's own header calls it out as already scoped as
"out of scope, pre-existing" — the removeFixtureTree retry loop is a workaround for it, not a fix.

### Why "multiple files in one `node --test` invocation" is a plausible amplifier, not a separate cause

`node --test file1 file2 file3` runs the three files concurrently (separate isolates/subprocesses).
Each file spawns many real `tovu serve` processes (each of which spawns its own real agent-daemon
grandchild). Running all three concurrently multiplies CPU/IO/SQLite-lock contention at exactly the
moment 1a/1b's unbounded waits become live — a slow response under contention is harmless with a
timeout; without one, the same contention converts a slow response into a permanent hang. This is
consistent with, but not proof of, the reported trigger.

## Live orphan check (read-only)

I searched running processes for `serve-command`, `tovu serve`, or `cli/serve`-related commands —
**none found currently running.** The three-attempts-ago hang is not still live in this process
table. I did find one unrelated, long-idle test process that is NOT part of this investigation and
is not one of the three suites in scope, flagged for the owner's own attention, not touched:

```
PID 69648  (started 01-22:53:57, state S, 0.0% CPU)
node --import tsx --experimental-test-module-mocks apps/website/src/server/inbound/admin-http/__tests__/admin-dev-proxy.test.ts
  └─ PID 69680  esbuild --service=0.28.1 --ping
```

This is a *different* test file (`admin-dev-proxy.test.ts`), not one of the three in scope, and has
been sitting idle for over a day. I have not touched it; flagging only per the "report PIDs, owner
cleans up" instruction.

## 2. Recommendation

**Fix, not quarantine** — the suite's own design intent (real spawned processes, real ports, no
mocking, explicitly justified in the file's own header comments) is sound and deliberate; the gap is
narrowly the missing timeouts, not the approach. Concretely, in order of leverage:

1. **Bound every `fetch()` in the polling loop and in the ready-state assertions** with
   `AbortSignal.timeout(N)` (Node has this built in — no new dependency). Minimum viable fix: just
   `waitForHttpReady`'s internal fetch, e.g. `fetch(url, { signal: AbortSignal.timeout(2000) })`,
   letting the existing `catch` treat a timeout exactly like a connection-refused and retry — the
   outer deadline loop then actually gets to re-check on schedule. Apply identically in all three
   files (they currently carry three independent copies of the same function — the debug file
   shows a fourth; consolidating this into a shared test helper alongside the new
   `helpers/remove-fixture-tree.ts` would also close the "three hand-copies" duplication these files
   already have).
2. **Give `runCliSync` a real default timeout** instead of `undefined` — e.g. `timeoutMs = 30_000`
   as the parameter default in the signature at `serve-command.integration.test.ts:88` — so a
   `spawnSync` call can never block the whole process indefinitely. The one call site that already
   passes `60_000` explicitly should stay as-is (it deliberately needs more room for a real boot).
3. **Add a safety-net global bound**: run this suite (or all of `node --test`) with Node's built-in
   `--test-timeout=<ms>` flag so any single test that still manages to hang is force-failed rather
   than wedging the whole invocation — this doesn't fix the root cause but converts "hangs for 64
   minutes and orphans processes" into "fails after N seconds," which is the harm this dispatch
   exists to stop.
4. **Split the invocation** (run each of the three files as its own `node --test <file>` process,
   sequentially or with limited concurrency) as an immediate, zero-code-change mitigation while 1-3
   are implemented — it directly reduces the contention window that turns 1a/1b from "theoretically
   possible" into "actually observed," without waiting on the code fix.
5. Independently of the hang: consider whether `finish()` in `serve.ts:369-390` should wait for
   `shutdownAssistantDaemon()`'s kill to actually land (or at least for the daemon's own `exit`
   event) before `process.exit(0)` tears down the parent — right now the daemon kill is fire-and-forget
   before the parent disappears, which is the direct cause of the `removeFixtureTree.ts`-documented
   ENOTEMPTY race and, per that file's own doc, the wider "grandchild can outlive its parent"
   gap (1c). This is a real product-code defect, not just a test-flakiness issue, but it's larger in
   scope than "make these tests stop hanging" — flagging for a separate fix, not bundling it in.

## 3. Verdict on the uncommitted WIP

- **`apps/website/src/cli/__tests__/helpers/remove-fixture-tree.ts` — KEEP / commit.** Well-scoped,
  well-documented, addresses a real and correctly-diagnosed race (ENOTEMPTY from a daemon grandchild
  still writing under a fixture tree being removed), retries only the one error code it should,
  bounded budget, rethrows everything else, follows the repo's own stated precedent
  (`server/__tests__/helpers/http-test-server.ts`). Not implicated in the hang itself — it replaces a
  synchronous `fs.rmSync` with a bounded (≤10s) retrying version, strictly safer than what it
  replaced.

- **The three modified test files — KEEP / commit.** Every diff hunk in all three is the identical,
  mechanical substitution `fs.rmSync(parent, { recursive: true, force: true })` →
  `removeFixtureTree(parent)`, adopting the new helper. Confirmed via full `git diff` on all three —
  no other lines changed. This is low-risk, consistent with the helper above, and not itself a
  contributor to the hang (the hang mechanisms in §1 predate this change and are untouched by it).

- **`apps/website/src/cli/__tests__/integration/zzz-debug-cr-r04-2.test.ts` — DELETE, do not keep as
  a file, but recover one idea from it first.** This is a stale, ad-hoc debug scratch copy of the
  *entire* `serve-command.integration.test.ts` (~600 lines duplicated) predating the
  `removeFixtureTree` adoption (it still calls raw `fs.rmSync` throughout), with `[DBG] console.error`
  instrumentation added to exactly one test (`CR-R04/CR-R01`, lines ~409-446) and one experimental
  change: guarding `stopGracefully(child)` behind `if (child.exitCode === null && !child.killed)`
  instead of calling it unconditionally in `finally`. That guard is a real, worthwhile fix for a
  real (if secondary — bounded at ≤60s, not the source of a 64-minute hang) defect: the current real
  file's CR-R04 test (`serve-command.integration.test.ts:423-424`) still calls
  `await stopGracefully(child);` unconditionally in `finally`, which — if the child already exited
  (e.g. `waitForHttpReady` threw "server process exited early") — sends a no-op SIGTERM to a dead
  process and then waits out `stopGracefully`'s own exit-event timeout for nothing. Recommend:
  port that same exitCode/killed guard into the real `serve-command.integration.test.ts`'s CR-R04
  `finally` block (and consider the same guard everywhere else `stopGracefully` is called
  unconditionally in a `finally`, in all three files), then delete `zzz-debug-cr-r04-2.test.ts`
  entirely — it should never be committed as-is: leaving a second, stale full copy of this suite
  inside `__tests__/integration/` means a future unscoped `node --test` over that directory picks it
  up too, doubling the exact resource contention this whole investigation is about.

## Constraints honored

No test in `serve-command*` was run. No `tovu serve` or server was started. No file was modified. No
git state (add/stash/commit/checkout/restore) was touched. No process was killed; the one idle,
out-of-scope process found (PID 69648) is reported, not acted on.
