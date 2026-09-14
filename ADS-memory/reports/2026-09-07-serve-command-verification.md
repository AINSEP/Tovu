# serve-command integration suite — verification run (2026-09-07)

Programmer(Execution). Reports on the ONE bounded verification run actually performed, per the
team lead's authorization. **Process hygiene note up front:** I started the background run, said I
was "waiting," and then went idle without checking on it or reporting — that was a lapse, correctly
called out. The run itself had already finished cleanly on its own by the time I checked the output
file just now; it was not still hanging or abandoned, but I should have checked and reported the
moment it completed rather than going idle.

## 1. Which files were run

Only **one** of the three: `serve-command-boot-lifecycle.integration.test.ts`.
The other two (`serve-command.integration.test.ts`,
`serve-command-plugin-sdk-resolver.integration.test.ts`) were **not run**. No new run has been
started since this one, per instruction to report before doing anything else.

Verbatim command (run from repo root, `/Users/la/Programming/Tovu`):

```
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --experimental-test-module-mocks --test --test-timeout=120000 apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts
```

## 2. Completed, timed out, or abandoned?

**Completed.** Exit code 1. Neither individual test hit the `--test-timeout=120000` ceiling (both
finished, as failures, at ~30.1–30.4s each — well under 120s). The overall `node --test` process
exited on its own; it did not hang.

## 3. Wall clock

- Total suite duration (from the test reporter): **61.730738s** for 2 tests.
- Test 1 ("...runBootLifecycle..."): 30412.062391ms
- Test 2 ("...refuses to serve when a critical boot module genuinely rejects..."): 30157.481339ms

## 4. `pgrep -f 'tovu serve'` before/after (pids only, never `-fl`)

**Before** (baseline, checked immediately before starting the run):
```
pgrep -f "cli/main.ts serve"   -> (no output, no match)
pgrep -f "tovu serve"          -> (no output, no match)
```

**After** (checked just now, after confirming the run had finished):
```
pgrep -f "cli/main.ts serve"        -> (no output, no match)
pgrep -f "tovu serve"               -> (no output, no match)
pgrep -f "cli/main.ts init"         -> (no output, no match)
pgrep -f "apps/website/src/cli/main.ts" -> (no output, no match)
```

**Zero orphaned processes, before or after.** No new pid appeared.

## 5. Verbatim test output

```
✖ tovu serve actually runs runBootLifecycle: database-migration-reconciliation, settings, and seo all show 'ready' on the admin module-status route after boot (30412.062391ms)
✖ tovu serve refuses to serve when a critical boot module genuinely rejects: no app.listen(), no bound port, non-zero exit — not a logged-and-ignored rejection (30157.481339ms)
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61730.738007

✖ failing tests:

test at apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts:1:4032
✖ tovu serve actually runs runBootLifecycle: database-migration-reconciliation, settings, and seo all show 'ready' on the admin module-status route after boot (30412.062391ms)
  AssertionError [ERR_ASSERTION]: fixture setup: tovu init must succeed (stderr: )

  null !== 0

      at initFixture (/Users/la/Programming/Tovu/apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts:142:10)
      at TestContext.<anonymous> (/Users/la/Programming/Tovu/apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts:154:27)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1062:25)
      at Test.start (node:internal/test_runner/test:959:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:332:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: 0,
    operator: 'strictEqual'
  }

test at apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts:1:6250
✖ tovu serve refuses to serve when a critical boot module genuinely rejects: no app.listen(), no bound port, non-zero exit — not a logged-and-ignored rejection (30157.481339ms)
  AssertionError [ERR_ASSERTION]: fixture setup: tovu init must succeed (stderr: )

  null !== 0

      at initFixture (/Users/la/Programming/Tovu/apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts:142:10)
      at TestContext.<anonymous> (/Users/la/Programming/Tovu/apps/website/src/cli/__tests__/integration/serve-command-boot-lifecycle.integration.test.ts:207:27)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1062:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:752:18)
      at Test.postRun (node:internal/test_runner/test:1191:19)
      at Test.run (node:internal/test_runner/test:1119:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:332:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: 0,
    operator: 'strictEqual'
  }

[exited with code 1]
```

## The two verdicts, kept separate

### Did the hang fix work? — **Yes, on the evidence this run produced.**
The invocation completed on its own in 61.7s, well inside the 120s per-test ceiling and far inside
the 590s outer bound I set. It left **zero** orphaned `tovu serve`/`cli/main.ts` processes, before or
after. Both failures were themselves a `spawnSync` timing out and being killed (see below) — i.e.
exactly the bounded, loud, cleaned-up failure the fix is supposed to produce in place of an
indefinite, silent hang. This run did not exercise `waitForHttpReady`/`stopGracefully`/the fetch
timeouts at all (neither test got past `tovu init`, which precedes any `spawnServe` call), so it only
validates the `runCliSync` timeout half of the fix, not the HTTP-polling half.

### Did the tests pass? — **No: 0 passed, 2 failed — but this is not a clean signal on the tests' own merits.**
Both failures are identical and happen at the shared `initFixture()` step, before either test's actual
subject under test (`runBootLifecycle` wiring; critical-module-rejection behavior) ever runs. The
evidence points at a `spawnSync` timeout, not an application error:

- Both failures land at 30412ms and 30157ms — right at my new 30s default `runCliSync` timeout, not
  at any value that looks like an app-level delay.
- `stderr` is **empty** in both. A real `tovu init` failure (bad args, a thrown error, a validation
  rejection) would print something to stderr; nothing did.
- `status: null` (`null !== 0`) is exactly what Node's `spawnSync` reports when its `timeout` option
  fires and the child is killed by `SIGTERM` before it exits on its own — this file's `runCliSync`
  doesn't currently surface `result.signal` in its return value, so I can't quote it directly, but the
  combination of empty stderr + null status + timing pinned to my new default is the signature of a
  timeout-kill, not an app error.

I checked system load immediately before starting the run and again just now:

- **Before**: `load averages: 13.06 25.81 73.15` (1/5/15-min), 8 cores — `loadFactor()` (which reads
  the 1-min average) ≈ 1.6x, comfortably under its own 6x cap.
- **After**: `load averages: 139.43 117.63 103.20` — the 1-minute average alone is now ~17x the core
  count, and 49 `node` processes are currently running under this account. This session has 8 other
  named agents active concurrently.

`tovu init` is a lightweight file/DB-write operation with no server or network step; the
investigation's own baseline states a full `tovu serve` boot answers in ~2s on an idle box. A plain
`init` taking 30+ seconds does not fit an application-level explanation nearly as well as it fits
"this machine went from ~1.6x to ~17x oversubscribed while this ran." **I cannot fully rule out a
real defect in `tovu init` from this evidence alone**, but severe, currently-observed contention from
concurrent sibling agents is the far more probable cause. This result is **inconclusive** on the
actual boot-lifecycle behavior under test, not a confirmed regression.

## What's still unrun

- `serve-command.integration.test.ts` and `serve-command-plugin-sdk-resolver.integration.test.ts` —
  not started. No new run will be started until you decide how to proceed, per your instruction.
- Nothing in this run exercised the `waitForHttpReady`/`stopGracefully`/fetch-timeout half of the fix,
  since both tests failed before reaching `spawnServe`.

## Recommendation

Re-run this same file (and then the other two, one at a time) once the shared machine's load is back
near what it was before this run (1-min average in the low teens, not 100+) — the current result
can't distinguish "the fix works" from "the fix works but `tovu init` itself is currently starved by
unrelated concurrent agents." I'd also flag, for your call and not something I'll change unilaterally:
whether `runCliSync`'s new 30s default is the right number for a machine this session regularly
shares with several other agents, versus a larger default or a documented "don't run this concurrently
with other heavy agent work" precondition.
