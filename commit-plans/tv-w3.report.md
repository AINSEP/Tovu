T1-perfobs is done on `codex/tv-w3`.

- Updated `tool-recovery-preset.ts` and `byok-tool-surface.ts` to forward observability and the live gate to Jini.
- Added one test in `byok-tool-surface.test.ts` covering exactly one settled `tool.call`, suppression after disabling the gate, and preserved returns. Every added assertion has a message.
- Recorded `agent-daemon-port.ts:65` as **“importer, unchanged signature”** in `REFRESH.md`; no edit needed.
- Added `COMMIT-PLAN.md` with the base, files, test, expected failure reason, and combine obligations.

Final diff review found no unrelated changes. No deletions or existing-test changes. Other sheets remain untouched.

Tests, checks, mutations, commits, and pushes were not run, as instructed. Verification remains with the combine.
