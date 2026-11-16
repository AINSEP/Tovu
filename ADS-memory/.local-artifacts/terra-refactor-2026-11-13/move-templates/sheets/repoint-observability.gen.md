id: RP-observability-1   (skeleton by make-sheet.py; judgment fields are TODO(judge))
feature: website/platform/observability
tovu_file: apps/website/src/platform/observability/index.ts | blob df06112f5fa300071224ef1bd8d9350d1931f134
symbol_map:
  - instrumentStorageKernel -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - isNoopObservabilityPort -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - trackFetch -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - trackHttpClient -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - AgentRunStatus -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - ObservabilityConfig -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - ObservabilityConfigDisabled -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - ObservabilityConfigEnabled -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - ObservabilityPort -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - RequestTracker -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - RequestTrackingInput -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - RequestTrackingOptions -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - RequestTrackingOutcome -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
  - createNoopObservabilityPort -> @jini-ai/diagnostics/observability | packages/diagnostics/package.json:17 has exports key ./observability
jini_why: TODO(judge)   # pointer only | already on Jini declaration | MOVE {comment} -> {jini file}
comments_in_file: 66 code-free comment line(s) to preserve
census_cmd: rg -n --no-heading -e '["'][^"']*observability(/index)?(\.[jt]sx?)?[\"']' apps content development --glob '!**/node_modules/**'  # then resolved against apps/website/src/platform/observability/index.ts  # plus ./ and ../ index specifiers inside apps/website/src/platform/observability
importers (27 prod, 27 test; resolved to this file):
  - apps/website/src/contracts/core/events/__tests__/outbox-drainer.test.ts:8 | static | "#src/platform/observability/index"
  - apps/website/src/features/credential-safety/__tests__/disk-server.fixture.ts:9 | static | "../../../platform/observability/index.js"
  - apps/website/src/features/custom-credentials/credential-ports.ts:14 | static | "../../platform/observability/index.js"
  - apps/website/src/features/custom-credentials/tool-registrations.ts:32 | static | "../../platform/observability/index.js"
  - apps/website/src/features/deployments/deploy-targets/host-kit.ts:17 | static | "#src/platform/observability/index"
  - apps/website/src/features/deployments/publish-agent-tools.ts:67 | static | "#src/platform/observability/index"
  - apps/website/src/features/deployments/publish-tool-deps.ts:13 | static | "#src/platform/observability/index"
  - apps/website/src/features/deployments/static-publish/__tests__/publish-operation.unit.test.ts:5 | static | "#src/platform/observability/index"
  - apps/website/src/features/deployments/static-publish/adapter.ts:11 | static | "#src/platform/observability/index"
  - apps/website/src/features/deployments/static-publish/verify.ts:4 | static | "#src/platform/observability/index"
  - ... 44 more; the full list is in the sidecar <sheet>.census.txt (same format)
path_literals (rg -F "observability/index", not already importers):
  - development/todos.md:2119:**PARTLY DONE 2026-10-04:** gap 1 built — DB (storage kernel), outbound (guarded HTTP clients) and agent-run (finalizer) spans through the Jini port, nested under the request
  - apps/website/src/__tests__/no-first-party-require.boundary.test.ts:48:// Empty since provider wave 2 (2026-10-25). Its one entry was `platform/observability/index.ts` →
  - apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json:49:    {"vendor":"opentelemetry","path":"apps/website/src/platform/observability/index.ts","count":2,"reason":"Ope
baselines (json files naming the path): apps/website/src/features/deployments/deploy-targets/__tests__/vendor-exceptions.json
comment_refs: TODO(judge)
