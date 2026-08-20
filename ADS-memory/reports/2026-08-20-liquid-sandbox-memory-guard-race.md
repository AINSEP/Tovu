# liquid-sandbox memory-guard race — diagnosis and fix

**Date:** 2026-08-20
**Trigger:** `ADS-memory/reports/2026-08-20-quality-metrics-agent-work.md` reported 87/88 passing in a
scoped run, with the one failure being `liquid-sandbox.test.ts`'s memory-blowup test throwing
`ERR_WORKER_OUT_OF_MEMORY` instead of the asserted LiquidJS `memory alloc limit exceeded` message,
flagged honestly as an unresolved environmental flake rather than rounded to green.

## What the test proves

`src/server/http/site/__tests__/liquid-sandbox.test.ts`'s "a memory-blowup template … is
force-terminated by the worker's memory guards" test drives a template that accumulates a retained
string via `{% assign s = s | append: ... %}` across 200k iterations, and asserts the render is
force-terminated. Two independent guards exist in `renderInWorkerSandbox`
(`src/server/http/site/worker-sandbox.ts`):

- **LiquidJS's own `memoryLimit`** — a synchronous, pure-JS byte counter (`Limiter` class in
  `node_modules/liquidjs/dist/liquid.node.js:947-958`), driven by `context.memoryLimit.use(str.length)`
  calls inlined into every `append`/array/string operation (e.g. `liquid.node.js:1638-1661`). It has no
  dependency on real V8 heap state or GC timing — it only depends on how many loop iterations have
  executed. Set to `5_000_000` in `liquid-worker.ts`.
- **V8's `resourceLimits` ceiling** (`maxOldGenerationSizeMb: 32` for this test) — the real heap cap
  Node enforces on the worker thread. When crossed, Node emits `worker.once("error", …)` with
  `code: "ERR_WORKER_OUT_OF_MEMORY"` and message `"Worker terminated due to reaching memory limit: JS
  heap out of memory"` (`worker-sandbox.ts:208-210` passes this straight through unwrapped).

## Is it a real race?

Yes — both guards are real and both correctly stop the render, but the code makes no guarantee about
which one fires first. LiquidJS's counter only advances at the pace of synchronous JS execution; V8's
actual live heap can grow faster than that counter under GC pressure, because the loop's repeated
string concatenation (`s | append: …` rebuilds `s` every iteration) generates quadratic garbage that a
lagging collector may not reclaim before the next allocation. Confirmed empirically:

- Built a standalone repro (`renderLiquidInSandbox` called directly, same code path as the test) at
  `maxOldGenerationSizeMb: 18` — below the ~20-24MB worker boot floor the test's own comment already
  documents — and reliably got `ERR_WORKER_OUT_OF_MEMORY` / `"Worker terminated due to reaching memory
  limit: JS heap out of memory"` across 3/3 runs. This is the exact error shape the original quality
  sweep observed.
- At the test's actual configured `maxOldGenerationSizeMb: 32`, ran the real test 58/58 times total
  (12 sequential in isolation, then 8-way, 16-way, and 24-way parallel batches of the same test, the
  last of which drove this 8-core/16GB box to a measured load average of 74.41 — higher than the
  38-55 range logged when the original flake occurred) and LiquidJS's guard fired every time.

So at 32MB the race strongly favors LiquidJS's guard in practice, but it is not a guaranteed ordering —
consistent with a single observed `ERR_WORKER_OUT_OF_MEMORY` occurrence elsewhere in a busier,
longer-running multi-agent session than any single batch above.

## Decision: fix the assertion, not the code

Both guards genuinely protect the process (this is why V8's `resourceLimits` ceiling exists
independently — see the same test file's next test, covering a one-shot allocation that only
`resourceLimits` can catch). `renderInWorkerSandbox`'s caller treats any thrown error identically
(falls back to the built-in body — see its `@throws` doc in `worker-sandbox.ts`), so a real visitor is
protected the same way regardless of which guard fires. The original assertion
(`/memory alloc limit exceeded/`) encoded an implementation-order assumption the code never actually
guaranteed. No source file was touched — `worker-sandbox.ts`, `liquid-sandbox.ts`, and `liquid-worker.ts`
are unchanged; `resourceLimits`/`memoryLimit` values are unchanged.

**Fix:** `src/server/http/site/__tests__/liquid-sandbox.test.ts`'s memory-blowup test now asserts via a
predicate that accepts either guard's *exact* error shape (LiquidJS: message starts with
`"memory alloc limit exceeded"`, tolerating LiquidJS's own appended `", line:N, col:N"` suffix; V8:
exact message `"Worker terminated due to reaching memory limit: JS heap out of memory"` with
`code === "ERR_WORKER_OUT_OF_MEMORY"`) — not a loosened shared regex, so a message from neither guard
still fails the test.

## Verification

- Post-fix: full `liquid-sandbox.test.ts` file — 6/6 passing.
- Post-fix: the memory-blowup test alone, 12/12 sequential runs passing.
- `tsc` not run — this is a test-file-only change and `__tests__` is excluded from the project's `tsc`
  scope (`reference_tovu_tsc_excludes_tests`).

## Files changed

- `src/server/http/site/__tests__/liquid-sandbox.test.ts` (assertion + comment only)
