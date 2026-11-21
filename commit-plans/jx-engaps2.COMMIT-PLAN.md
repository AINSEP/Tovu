# J1–J3 combine handoff

Base: `codex/jx-engaps2`, supplied HEAD `0f57dce5f` (merge-9 `fb41117be` plus J4–J6). Git remains read-only; no commits. Tests were written before each sheet's production edits. No tests, builds, installs, type-checks, linters, mutations, or `api:update` were run, per machine rule. Runtime RED/GREEN remains unverified.

## J1 — done (implementation)

- Files: `packages/core/src/contracts/observability.ts`; `packages/provider-plugins/src/observability-opentelemetry/{contract,opentelemetry,otel-port}.ts`; `packages/provider-plugins/src/__tests__/observability-opentelemetry.test.ts`.
- Test: one added case compares the scoped carrier with the actual exported SDK context, checks scope exit and ended-span absence. Expected RED before J1: no carrier reader exists, so the live carrier is undefined.
- Mutation owed: replace emitted sampling flags with constant `00`; the SDK-context assertion must fail. J2's unsampled case also detects constant `01`.
- API-baseline delta: J1 row below. Look owed: none; combine owes the targeted provider tests.
- Diff re-read deletions: none; no extras found. Existing argument pads preserved. Provider test file exceeds 500 lines; continue per owner rule.

## J2 — done (implementation)

- Files: same five paths as J1; follows J1 on the supplied base.
- Tests: two valid-carrier cases (`00`/`01` flags) exercise operation and agent trackers inside a local scope, asserting remote priority, new span IDs, flags and exported remote parent IDs. Expected RED before J2: the explicit parent is ignored. Nine zero-ID/malformed/omitted cases preserve operation roots/local children and independent agent roots; these are regression witnesses, expected to pass before J2.
- Mutations owed: ignore the remote parent; accept either zero ID. Run the provider cases after each mutation.
- API-baseline delta: J2 rows below. Look owed: none; authenticated host consumer verification remains outside this dispatch.
- Diff re-read deletions: none. No global context, provider selection, dependencies, package files or lockfiles changed. Provider test file exceeds 500 lines.

## J3 — done (implementation)

- Files: `packages/diagnostics/src/observability/{fanout,hooks}.ts`; `packages/diagnostics/src/observability/__tests__/trace-correlation.unit.test.ts`; follows J1/J2 on the supplied base.
- Tests: two existing cases extended; active provider after a throwing reader reaches the hook, inactive/disabled paths yield none. Expected RED before J3: the active carrier is not forwarded. Absence assertions remain regression witnesses.
- Mutations owed: stop fan-out at the first provider; omit hook forwarding. Look owed: none; combine owes the correlation tests.
- API-baseline delta: none beyond J1. Importer findings: `REFRESH.md`. Diff re-read deletions: none. Provider order, error-context IDs and the `Tracker` interface remain unchanged.

## Core API-baseline rows for combine

Existing entry: `@jini-ai/core/contracts/observability`. Reconcile these additive declarations on the combined build; no baseline artifact was edited here.

| Sheet | Declaration | Additive member |
| --- | --- | --- |
| J1 | `ObservabilityPort` | `activeTraceparent?(): string \| undefined` |
| J2 | `AgentRunTrackingOptions` | `traceparent?: string` |
| J2 | `OperationTrackingInput` | `traceparent?: string` |

Static review: changed production functions remain within 50 lines and complexity 10; `combineObservabilityPorts` is 45 lines. No new casts, helpers, type declarations, dependencies or comments. SDK context reads/parsing are constant-size; fan-out retains O(n) provider traversal and O(1) additional state. Runtime verification and named mutations are owed to combine.
