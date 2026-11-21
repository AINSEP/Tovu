# J1–J3 importer refresh

Targeted sheet-symbol lookups used `git grep -n -F '<symbol>' -- apps/ development/ packages/`. The production importers below were opened; none needs an edit for optional additions and none re-declares the changed core interface. No test-only repoints were needed.

| Sheet | Importer | Finding |
| --- | --- | --- |
| J1 | `packages/daemon/src/tool-recovery/observability.ts:14` | importer, no change needed; consumes existing `Pick` slices only. |
| J1 | `packages/daemon/src/tool-recovery/stack.ts:47` | importer, no change needed; accepts and forwards an optional supplied port. |
| J1 | `packages/diagnostics/src/observability/instrumentation.ts:2` | importer, no change needed; uses existing DB/outbound methods. |
| J1 | `packages/diagnostics/src/observability/report-error.ts:4` | importer, no change needed; consumes error admission and uses ports as weak-map keys. |
| J1/J2 | `packages/diagnostics/src/observability/tracker-types.ts:3` | importer, no change needed; references core types, intersects agent options, and keeps its separate `Tracker` interface unchanged. |
| J1/J3 | `packages/diagnostics/src/observability/tracker.ts:10` | importer, no change needed; calls fan-out unchanged and constructs the separate `Tracker` facade, not a re-declared `ObservabilityPort`. |
| J1 | `packages/http-kit/src/observability.ts:3` | importer, no change needed; consumes `Pick<ObservabilityPort, 'trackRequest'>`. |
| J1 | `packages/provider-plugins/src/observability-sentry/sentry.ts:39` | importer, no change needed; its port spreads the shared noop and overrides existing methods. |

`packages/diagnostics/src/observability/{ports,node}.ts` were also opened: their existing structural span/scope types remain assignable because the provider-local `TraceSpanPort.traceparent` is optional. No re-declaration of the changed core interface exists there; no scope edit is needed.

All additions stay within the named sheet files. J4–J6 and the trace host half were not edited. Coordinator must run the targeted suites, named mutations and combined core API-baseline reconciliation recorded in `COMMIT-PLAN.md`.
