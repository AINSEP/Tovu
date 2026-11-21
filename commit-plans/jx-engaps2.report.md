J1–J3 implemented in order, with tests written before each production change. No sheets stopped.

- **J1 done:** changed core `observability.ts`, provider `contract.ts`, `opentelemetry.ts`, `otel-port.ts`, and `observability-opentelemetry.test.ts`. Added SDK carrier/lifecycle coverage; expected red beforehand because the carrier reader was absent.
- **J2 done:** changed the same files. Added remote-parent cases for sampled/unsampled flags and zero/malformed/omitted carriers. Valid-parent cases are expected red beforehand because explicit parentage was ignored; fallback cases preserve existing behavior.
- **J3 done:** changed diagnostics `fanout.ts`, `hooks.ts`, and `trace-correlation.unit.test.ts`. Extended coverage for throwing-provider recovery, hook forwarding, and inactive/disabled paths. Active forwarding is expected red beforehand because it was absent.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-jx-engaps2/COMMIT-PLAN.md) records per-sheet files, API-baseline rows, named mutations, and combine checks. [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-jx-engaps2/REFRESH.md) records the opened importers as “importer, no change needed”; no test repoints were required.

Diff re-read deletions: none. J4–J6 and existing argument pads remain unchanged. The provider test file is 704 lines, recorded as required.

No tests, builds, installs, type-checks, linters, `api:update`, or commits were run. RED/GREEN and named mutations remain owed to combine.
