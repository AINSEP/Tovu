# port/wip-1110 desktop tests, re-run 3 (tip 661a6e670, Node v24.22.2, published Jini 0.7.0)

| file | result | notes |
|---|---|---|
| apps/desktop/src/renderer/App.render.test.ts | FAIL (OOM-killed, exit 1) | 23 tests passed, then the process died at ~36 s. Peak RSS ~13.4 GB (sampled every 5 s: 0.03, 0.6, 3.1, 1.8, 2.0, 3.5, 9.0, 13.4 GB). Kernel OOM notice on a 16 GB box. Runner printed only `'test failed'` for the file. |
| apps/desktop/src/speech/preload-speech.test.ts | PASS | 7/7 |
| apps/desktop/src/renderer/ImportWebsite.render.test.ts | PASS | 10/10 |
| apps/desktop/src/renderer/use-import-handoff.hooks.render.test.ts | PASS | 5/5 |

## App.render: tests that started
The spec reporter prints a test only when it finishes, so the in-flight test is inferred from source order.

- Finished and passed: 23 tests, the last being "an import that fails after the person left the page reaches them as a toast" (line 455).
- Started, never finished (inferred): **"App: Import is a temporary tab right after All; Cancel or its close button shuts it, and success turns it into the new site's tab"** (App.render.test.ts:469). This is the test that was running when memory climbed 3.5 GB -> 9 GB -> 13.4 GB and the process was killed. Not confirmed by a per-test start event.
- Never reached: lines 509, 529, 542, 556 and any later tests.

## Failing tests (first error lines)
```
✖ src/renderer/App.render.test.ts (36312.01433ms)
  'test failed'
ℹ tests 24 / pass 23 / fail 1
```
No assertion error exists; the failure is the file-level process kill. Raw output: cloud/reports/raw/port-wip-1110-rerun3/ (memwatch.txt is the RSS sample).
