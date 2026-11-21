Programmer(Execution): **T2 STOPPED; T4 implemented, runtime verification pending.**

- **T2:** The callback at `serve-command.integration.test.ts:669–748` is exactly **80 physical lines**, triggering the coordinator’s STOP threshold. The other callback is 73 lines. No T2 code or tests changed.
- **T4:** Added private `standaloneListenerPort()` and replaced only the coercion inside `start()`. Missing → 4319, explicit `"0"` → OS-assigned, integers 1–65535 accepted; invalid values receive a fixed error naming the setting and range.
- **Test first:** Added one child-process case in `daemon-boots.integration.test.ts`. It checks bounded failure, setting/range diagnostics, no supplied-value disclosure, and no listener announcement. Expected RED before implementation because the native failure omits the setting name and prints `70000`; execution was prohibited.

Created **COMMIT-PLAN.md** and **REFRESH.md** with per-sheet disposition, base, size evidence, mutations, timing and Electron checks owed. Jini API delta: none. Test importer repoints: none. Diff re-read deletions: none.

Existing optional pads, T1/T3/T5/T6, packages and lockfiles remain unchanged. No tests, builds, installs, type-checks, linters, commits or pushes were run.
