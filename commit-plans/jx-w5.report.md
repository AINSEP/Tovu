Both sheets implemented; no STOP conditions encountered.

- **GATE-ABORT-J — done.** Changed the gateway and its test file. Added three tests covering abort before save, abort before redemption, and completion after redemption. The first two target missing checks; the third guards existing behavior against the named mutation.
- **tv-rjk T2-J — done.** Changed core identity JS/declarations/tests and the named plugin-host files. Added three tests for legacy opt-in, current-key precedence, and null-current refusal. Legacy opt-in targets missing behavior; the others guard against the named mutations. Catalog importer recorded as **“importer, unchanged.”**

Existing option pads were preserved. Diff re-read found no incidental edits or deletions.

[COMMIT-PLAN.md](COMMIT-PLAN.md) lists every touched file, API deltas, mutations and browser look owed. [REFRESH.md](REFRESH.md) records importer and host-bag findings.

No tests, builds, type-checks, linters or commits ran, per machine rule. Red/green and mutation execution remain with combine.
