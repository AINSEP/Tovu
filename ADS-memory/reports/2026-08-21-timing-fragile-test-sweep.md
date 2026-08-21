# Repo-wide sweep: timing-fragile tests (tight-margin races, same-outcome-both-branches)

Date: 2026-08-21
Scope: `src/**/*.test.ts` (node:test suites). `development/e2e/**/*.spec.ts` (Playwright) explicitly
out of scope — different runner/timing model, not covered by this pass.

## What this sweep was looking for

1. Hardcoded small-millisecond TTL/lifetime/debounce/timeout/expiry/retry-backoff values where two
   timers could plausibly race under concurrent test-runner load.
2. **The real prize**: tests whose assertion cannot distinguish which of two racing code paths ran —
   invisible to a normal test run because both paths produce the same observable result. Only
   detectable by asking, for each timing-shaped test, "if the opposite timer won this race, would
   this assertion still pass?"
3. Sleep-based tests where the sleep is close to the threshold under test.

## Known findings (already fixed before this sweep started, verified still in place)

Both in `src/core/__tests__/tool-surface-exchanges.test.ts`, committed at `1f2d5e1f` and `19e8cb82`:

- **"the total-lifetime ceiling ends an exchange that stays busy forever"** (line 244) — originally
  `idleTtlMs:30 / maxLifetimeMs:45` with a 10ms keep-busy interval. This was the dangerous shape: both
  the IDLE and LIFETIME timers report `status: "expired"`, so a tight margin let scheduling jitter
  delay a `deliver()` past the idle deadline and silently flip which timer actually fired — the test
  stayed green while covering the wrong branch (`anonymous_7`, the lifetime timer's callback, read
  0 hits in a concurrent coverage run despite the test passing). Fixed by widening to
  `idleTtlMs:200 / maxLifetimeMs:260` with a 20ms keep-busy interval — now a 12x/13x margin instead of
  a razor's edge, and the fix comment documents the reasoning in place so it can't regress silently.
- **"the idle deadline resets on activity..."** (line 226) — originally `idleTtlMs:40` with three 25ms
  sleeps (15ms cushion; genuinely flaked under live load, `AssertionError: expected "received", got
  "expired"`). Fixed by widening to `idleTtlMs:300` with three 60ms sleeps.

I re-read both tests in full to confirm the fix is real (not just margin cosmetics) and the
explanatory comments are accurate. Nothing further to do here.

## Candidates reviewed this pass — all verified safe

Built the candidate list by grepping test files for `idleTtlMs|maxLifetimeMs|debounceMs|timeoutMs|
expiryMs|retryBackoff|backoffMs|ttlMs|staleMs|graceMs|leaseMs` and, separately, for small
(1–999ms) literal `setTimeout` delays. ~40 files matched; every one was read and checked against the
race question above. None reproduce the dangerous shape. Grouped by why they're safe:

**Deterministic fake clock, no real timer at all** — cannot race by construction:
- `src/assistant/__tests__/pending-confirmations.test.ts` — `now: () => nowMs` injected clock,
  `advance(ms)` manually bumps it. `ttlMs: DEFAULT_CONFIRMATION_TTL_MS`.
- `src/core/gated-mutations/__tests__/unit/{composition,gateway,token}.unit.test.ts` — fixed
  ISO-8601 `expiresAt`/`now` strings, no wall-clock timers.
- `src/features/deployments/static-publish/__tests__/s3-compatible-target.unit.test.ts` (the
  `if-none-match` fallback test) — `globalThis.setTimeout` is monkeypatched to fire its callback
  synchronously; there is no real timer to race.

**`idleTtlMs: 1` used to force immediate, unconditional expiry** (7 call sites: `demo-a2ui-tool.test.ts`,
`demo-choices-tool.test.ts`, `publish-agent-tools.unit.test.ts` x2, `agent-tools.delete-confirmation.test.ts`,
`tool-registrations.unit.test.ts`, plus the already-fixed file's own two `idleTtlMs: 1` tests) — no
`deliver()` or other reset ever happens in these tests, so there is nothing for the idle timer to race
against; it is the only timer in play. Not the two-timer shape.

**One borderline case, reasoned through explicitly** —
`src/server/__tests__/assistant-byok-routes.test.ts:693`,
`createSurfaceExchangeStore({ idleTtlMs: 30, maxLifetimeMs: 60 })`. Same *numbers* as the original bug
(30ms idle) but not the same defect: this test never redeems and never delivers, so nothing ever resets
the idle timer. Both timers are one-shot, scheduled at the same `open()` call; Node's timer phase fires
already-due timers in ascending order of their *scheduled* deadline, not the order the event loop
happens to catch up to them, so `idleTtlMs` (open+30) is guaranteed to fire before `maxLifetimeMs`
(open+60) regardless of scheduling jitter — there is no ordering for jitter to flip. The test also
doesn't claim to distinguish idle-vs-lifetime (unlike the fixed test, which explicitly exists to prove
the *lifetime* ceiling fires); it only asserts "some expiry ends the park," and the outer assertion
(`elapsedMs < 5_000`) has a 80x+ margin over the nominal 60ms. Verified safe; left unchanged since a
"fix" here would be cosmetic, not a correctness change.

**Bounded polls / self-correcting waits** (not a race — either converge to the same correct state or
time out loudly with a diagnostic): `forms/__tests__/submit-service.test.ts` (10ms "give the
fire-and-forget outbox a tick," but the underlying property being asserted is a real state change, not
a same-outcome branch), `routes/forms-webhook-fanout.test.ts` (same pattern, belt-and-suspenders with
an explicit `processOutbox()` drain after the tick so a short tick can't produce a false pass or fail),
`static-publish/__tests__/publish-run.unit.test.ts` ("bounded poll" loop with a 5s deadline, checks
real state each iteration), `db/__tests__/migration-manifest-postgres.test.ts`
(`waitUntilProcessDead` polls `kill(pid, 0)` up to a 2s deadline — real process state, not a race
between two internal timers).

**Load-scaled waits with documented prior-incident reasoning** —
`cli/__tests__/integration/serve-command.integration.test.ts`'s `waitForHttpReady` /
`stopGracefully`: scales the deadline by a measured `os.loadavg()` factor (1x–6x) specifically because
a starved-CI-machine timeout and a genuinely broken server produced identical output on 2026-08-19
before anyone thought to check `uptime`. This is the pattern other timing tests in this repo should
look like, not a finding.

**Deliberate one-shot delays for HTTP sequencing, not competing timers** —
`server/__tests__/assistant-ag-ui-routes.test.ts`: `setTimeout(() => req.socket.destroy(), 50)` (with
an explicit comment on why the destroy is deferred — it races the client's own header parsing if
synchronous), and two abort tests using `setTimeout(() => controller.abort(), 30)` against a mocked
daemon that holds its response for 200ms — a documented 6.7x margin, not tight. Re-verified the 200ms
hold value at the mock's definition (lines 165–174, 187–193) to confirm the margin claim in the
in-file comment is accurate.

**Diagnostic-only timing, no pass/fail depends on it** —
`server/__tests__/routes/request-cost-traversal.measurement.test.ts` — measures event-loop-block
duration and only `console.log`s the result; no assertion reads the timer delta.

**Safety-net termination guard, not a race** —
`server/routes/site/__tests__/resolve-html-format-content-markers.test.ts`'s `withTimeout` helper —
races real work against a 5000ms "did not terminate" guard per GUARD-3 test; generous margin, and a
hang produces a loud, specific failure rather than a silent wrong-branch pass.

**Explicitly does the discriminating-assertion thing right, cited as a positive example** —
`server/__tests__/routes/settings-events-id-disclosure.test.ts`: the 50ms wait is only to let an SSE
connection open before a write (ordering, not a race between two timers), and the test's own comment
at line 145-146 calls out exactly the trap this sweep is hunting for ("without this the head and our
own seq are identical and the assertion below cannot tell the two behaviours apart") and then adds
`assert.ok(globalHead > ownSeq, ...)` before the real assertion specifically to make the two outcomes
distinguishable. If the 50ms proves insufficient under load, `readFirstChangeFrameId`'s own 8000ms
deadline throws a diagnostic error with the buffered SSE content rather than passing silently.

**Config values passed through fakes, not real timers** —
`http/__tests__/client.test.ts` and `features/deployments/providers/__tests__/github.test.ts`'s
`timeoutMs` fields are asserted as plain data (e.g. "connectTimeoutMs caps a caller-supplied timeout")
against a `ScriptedTransport` fake; nothing actually sleeps.

**`Promise.race([realPromise, Promise.resolve(...)])` idiom, used repeatedly across
`tool-surface-exchanges.test.ts`, `demo-a2ui-tool.test.ts`, `demo-choices-tool.test.ts`,
`mcp-ui-tool-calls-route.test.ts`, `a2ui-actions-route.test.ts`, `agent-tools.delete-confirmation.test.ts`** —
this is deterministic, not a timing race: the second operand is already-resolved at race time, so it
always wins against a promise that is genuinely still pending. No `setTimeout` involved on either side.

## Disposition

- No new instances of the dangerous "silently covers the wrong branch" shape found.
- No production code touched.
- No test files modified this pass (the two real bugs were already fixed by a predecessor before this
  sweep started; re-verified both fixes are real and in place).
- `development/e2e/**/*.spec.ts` (Playwright, ~40+ files) was not swept — different runner, different
  timing model (real browser + real network), and a large enough surface it deserves its own pass
  rather than a rushed grep-based read here. Flagging as a gap, not a finding.

## Read/tool-call budget used for this pass

Files read: ~14. Tool calls: ~14 (mostly `grep`/`sed` via Bash plus a few `Read`s). Well under the
60-file / 150-call rotation thresholds.
