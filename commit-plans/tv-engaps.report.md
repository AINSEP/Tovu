Implemented T1, T3, and T6. T2 and T4 stopped under the hard limits.

- **T1 — done:** `adopt-command.integration.test.ts` now initializes fixtures in-process and awaits all 12 calls. Existing refusal, real-serve, and database-identity cases remain. They are expected green on the base; omitting either marker removal must fail.
- **T2 — STOPPED:** required callbacks in `serve-command.integration.test.ts:595` and `:669` exceed 50 lines. No edits retained.
- **T3 — done:** changed `agent-daemon-port.ts` and its test file. Added rejection tests before validation; they are expected red against the permissive base. Scoped URL precedence remains covered. Diagnostics exclude raw values.
- **T4 — STOPPED:** `agent-daemon-server.ts:207` already has manually counted cyclomatic complexity 10. Adding a guard exceeds the limit. Removed the attempted guard and child test; both files match the base.
- **T6 — done:** `adapter.unit.test.ts` now asserts exactly one export per successful publish. Expected green on the base; the double-export mutation must fail.

T5 was skipped. Existing optional pads are unchanged; every added or changed assertion has a plain-words message.

Root `COMMIT-PLAN.md` contains one entry per sheet, mutation obligations, API deltas, look obligations, and deletions. `REFRESH.md` records importer review and combine follow-ups.

No tests, builds, installs, type-checks, linters, commits, or pushes were run. Runtime verification, mutations, paired timings, and the Electron look remain owed.
