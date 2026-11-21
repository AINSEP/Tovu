J4–J6 are implemented; J1–J3 stopped under the explicit unlisted-production-importer rule.

- **J1 STOPPED:** `ObservabilityPort` importer at `packages/daemon/src/tool-recovery/observability.ts:14`. No edits or tests.
- **J2 STOPPED:** `AgentRunTrackingOptions` importer at `packages/diagnostics/src/observability/tracker-types.ts:3`. No edits or tests.
- **J3 STOPPED:** `combineObservabilityPorts` importer at `packages/diagnostics/src/observability/tracker.ts:10`; J1’s carrier field is also unavailable. No edits or tests.
- **J4 done:** changed provider `otel-port.ts` and `observability-otel-operations.test.ts`. Added two success/failure cases proving one completion despite repeated `end`. Before implementation, both would lack the expected metric.
- **J5 done:** changed provider `otel-port.ts` and `observability-otel-surfaces.test.ts`. Expanded the existing table to all five statuses, preserving duration assertions and adding completion assertions. Before implementation, only duration was emitted.
- **J6 done:** changed only the region query in admin `agent-plugins.test.tsx` to `await screen.findByRole(...)`. No new case.

Tests were written before the J4/J5 production changes. **Nothing was executed**, per machine restrictions; RED expectations are inferred from source.

[COMMIT-PLAN.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-jx-engaps/COMMIT-PLAN.md) contains all six entries and pending API-baseline rows. [REFRESH.md](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-jx-engaps/REFRESH.md) lists package runs, named mutations, J6 load reproduction, and failure-output capture owed to combine.

Diff reread deletions: none. Existing pads, argument rules, dependencies, lockfiles, and `.git` remain unchanged. No commits made.
