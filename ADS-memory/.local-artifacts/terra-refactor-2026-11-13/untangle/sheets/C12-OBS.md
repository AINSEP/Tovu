# C12-OBS — observability contract into core (O/DESIGN M1)

Sheet written 2026-11-16 (plan/wave-c, unattended cloud planning run). Source design: `../observability/DESIGN.md` §2.1, §2.2 (the "moved verbatim" part only) and §4 row M1. Census base: Jini `refactor/terra` + a **local integration view** of wave B (`integ-view` = `refactor/terra` + `-X ours` merges of `wave-b/{C2,C3a,C3b,C4,C5,C7,C8,C9a,C9-ui,C11-ids,C11a}`, all 11 merged); Tovu `refactor/terra`. Guards below are blobs on that view (first 12 hex): **re-guard on the real merged wave-B tip before dispatch**, because `-X ours` is only an approximation.

Owner rules that apply: move + delete, **no shells, forwarders or aliases**; core has zero dependencies and no module state (L6); `(required, optional)` args; tests in a Jini package import only `/testing` and `/conformance` from other packages (core is base, so core's main subpath is fine).

**Behaviour change: none** (pure type move + one value move). M2 (facade, composer, recording fake, `Tracker` deletion) is a separate lane and is **not** in this sheet.

## 0. Placement

| | |
|---|---|
| Wave | C, after the wave-B cloud run **and** after C8's B1 applier rows are merged (C8 edits the same `ports.ts`/`index.ts`/`otel.ts`/provider `contract.ts`) |
| Size | Sonnet ~60k for the lane hand edits + one applier pass (151 scripted rows, ~20k) + MANUAL ~10k = **~90k** |
| Order | after C6, C11b and P-ZOD (it touches none of their files; order is only for one-applier-at-a-time). Independent of C9b/c. |
| TSV | `C12-OBS.repoint.tsv`: 165 rows (151 scripted to core, 1 KEEP, 2 DROP, 13 MANUAL, 1 C-lane) in 130 files (39 Jini, 91 Tovu) |
| Census | `scripts/census/c12-obs.json` (moves) + `c12-obs-restate.json` (the C8 OTel restatement) → `repoint-post.py scripts/census/c12-obs.post.json`; raw in `scripts/census/c12-obs.raw.tsv` |

## 1. What moves (exact names)

NEW `packages/core/src/contracts/observability.ts` (universal). Every name moves **verbatim with its doc comment** (no shape change in M1; the M3 fields `usage`, `parent`, `root`, `activeCarrier`, `browserObservability` are NOT added here).

From `diagnostics/src/observability/ports.ts` (`176e9848dee5`), 27 names:
`RequestTrackingInput`, `RequestTrackingOptions`, `RequestTrackingOutcome`, `TrackerScope`, `RequestTracker`, `DbQueryTrackingInput`, `DbQueryTrackingOutcome`, `DbQueryTracker`, `OutboundCallTrackingInput`, `OutboundCallTrackingOutcome`, `OutboundCallTracker`, `AgentRunTrackingInput`, `AgentRunTrackingOptions`, `AgentRunStatus`, `AgentRunTrackingOutcome`, `AgentRunTracker`, `OperationAttributes`, `OperationTrackingInput`, `OperationTrackingOutcome`, `OperationTracker`, `TraceIds`, `ErrorReport`, `CrashUpload`, `MetricInput`, `MetricOptions`, `ObservabilityPort`, `ObservabilityAdapter`.
- The file's header comment ("Consumers speak in request lifecycle terms…") moves with them; leave a one-line pointer comment in `ports.ts` only if the remaining names need the context.
- **Stays** in `ports.ts` (per O/DESIGN §4 "old file keeps only…"): `RequestObservation` (now `extends` the core `RequestTrackingOutcome`), `RequestLogPort`, `RequestMetricsPort`, `RequestIdGenerator`, `TraceSpanPort`, `SpanScopePort`. `ports.ts` gets `import type { RequestTrackingOutcome, TraceIds } from '@jini-ai/core/contracts/observability';`.

From `diagnostics/src/observability/noop.ts` (`195da886c3d8`): `createNoopObservabilityPort`, `isNoopObservabilityPort`. `noop.ts` is **deleted** (`git rm`).
- **L6 fix (required, not optional):** today's `NOOP_PORTS = new WeakSet` + `.add(port)` is module state the base-purity gate reports as `mutable NOOP_PORTS` (`scripts/lib/base-purity.ts:89`). In core it becomes one frozen `NOOP_PORT` built at module load; `createNoopObservabilityPort(_required)` returns it and `isNoopObservabilityPort({…})` is `port === NOOP_PORT`. Keep the existing doc comments ("Creates disabled telemetry; every request shares one frozen tracker without allocation." / "True for a port this module built…").
  - Observable difference: two calls now return the same object. `rg` over Jini packages/examples and Tovu found no caller that mutates the port or asserts distinct identity. **STOP** if the lane finds one.
  - Keep the positional signature `isNoopObservabilityPort(port)` unchanged (pure move; the `(required, optional)` reshape is M2's, together with its 30+ call sites).

From `analytics/src/product/index.ts` (`a8b747389984`): `ProductEventProperties`, `ProductEvent`, `ProductIdentity`, `ProductAiGeneration`, `ProductAnalyticsPort`, `ProductAnalyticsAdapter`.
From `analytics/src/product/browser.ts` (`bb36f5fe158c`): `BrowserAnalyticsContribution` (the port's `browserAnalytics?` returns it, so it must move with the port; its inline `import('./browser.js').BrowserAnalyticsContribution` becomes a plain reference).
- **Stay** in analytics: `createNoopProductAnalytics`, `isNoopProductAnalytics`, `ProductAnalyticsConsent*`, guards, fan-out, `createAiGenerationSink`, `BrowserAnalyticsMode`, `BrowserAnalyticsConsent`, the browser renderers (O/DESIGN §2.1: "guards + fan-out stay in analytics").
- `analytics/product/index.ts` imports the moved types it still uses from core; its `export type { … BrowserAnalyticsContribution } from './browser.js'` loses that name (DROP row).

**Not moved in M1:** `tracker-types.ts`, `Tracker`, `createNoopTracker`, `createTracker` (deleted by M2, not moved), `TraceSpanPort`/`SpanScopePort` (diagnostics-internal SPI), `config.ts`, `otel.ts` helpers, `fanout.ts`, `hooks.ts`, `instrumentation.ts`, `report-error.ts`.

## 2. Steps (lane hand edits)

1. Write `core/src/contracts/observability.ts` (moved code, §1). Imports: none (all names self-contained; `ProductEventProperties` is local).
2. In `ports.ts`, delete the 27 moved declarations; add the core type import. In `noop.ts`: `git rm`. In analytics `product/index.ts`/`browser.ts`: delete the 7 declarations and import the ones still used from core.
3. Delete the three restatements (O/DESIGN §4 "import from core (restatements deleted)"):
   - daemon `tool-recovery/observability.ts` (`009d368dc51d`): delete `ToolCallObservability` and the local `Attributes` alias; the decorator's required object becomes `observability: Pick<ObservabilityPort, 'trackOperation' | 'reportError'>` with `import type { ObservabilityPort } from '@jini-ai/core/contracts/observability'`. Rewrite the file's header sentence "The port is taken structurally ({@link ToolCallObservability}), not imported: this package does not depend on `@jini-ai/diagnostics`…" to say the port type now comes from core, which keeps the daemon free of diagnostics. Its 2 test importers (`__tests__/observability.test.ts:4,13`, `forced-confirmation-forwarding.test.ts:11,25`) type their fakes as `Pick<ObservabilityPort, 'trackOperation' | 'reportError'>`; their `reportError` fakes return `void`, which the port's `boolean | void | Promise<…>` accepts. (Lane hand edits: the names are deleted, not moved, so they are not TSV rows.) Check `daemon/src/tool-recovery/index.ts`/`daemon/src/index.ts` for a `ToolCallObservability` re-export and drop it.
   - http-kit `observability.ts` (`53efb9b78a27`): delete `HttpRequestObservabilityPort`; both functions take `observability: Pick<ObservabilityPort, 'trackRequest'>`. No other importer (rg).
   - provider-plugins `observability-opentelemetry/contract.ts` (`c3b9898ac004`): delete `TraceIds`, `AgentRunStatus`, `RequestTracker`, `ObservabilityPort` (and its private `TrackerScope`/`OperationAttributes` helpers if nothing else in the file uses them) and import them type-only from core. The OTel-only shapes (`TraceSpanPort`, `TracerPort`, `SpanScopePort`, `TracerProviderPort`, `ExporterFactory`, `TracerProviderFactory`, `ObservabilityConfigEnabled`, `ObservabilityHelpers`) stay restated (Q6: provider-local). Its one importer (`otel-port.ts:7`) is the last TSV row.
4. `git mv diagnostics/src/__tests__/observability-noop.test.ts core/src/contracts/__tests__/observability-noop.test.ts`; import `../observability.js` (C-lane row). Add one case: `createNoopObservabilityPort({}) === createNoopObservabilityPort({})` and `isNoopObservabilityPort` is true for it and false for a hand-built port.
5. `.changeset/core-observability-contract.md`: core minor (new subpath), diagnostics + analytics major (names removed from their subpaths), daemon/http-kit patch (types only).

## 3. Coordinator-only

- `core/package.json` (`cb0e21d24eb2`): `exports["./contracts/observability"]` (`types`/`import`/`default` → `./dist/contracts/observability.*`) and `jini.entries["./contracts/observability"] = "universal"`; `core/README.md` row.
- **No `/testing` subpath in M1.** The prompt asked for `contracts/observability/testing`; O/DESIGN §2.3 puts `createRecordingObservability` (a fake of the M2 **facade**) there, and the facade does not exist until M2. The census found no existing shared fake of `ObservabilityPort` to move (the daemon test fakes are 2-method slices; `provider-plugins/__tests__/otel-fakes.ts` is OTel-shaped and stays with the provider per O/DESIGN §2.3). An empty subpath would be a shell, so the `./contracts/observability/testing` export is added by **M2**, next to the fake. Owner can override by asking M1 to also land a `createRecordingObservabilityPort` (port-level, ~40 lines, new code) — not done here because M1 is "pure move".
- `provider-plugins/package.json`: add `"@jini-ai/core": "workspace:^"` to `devDependencies` (it has none today; every provider import of the moved names is `import type` or bundled by the distribution pack, like its existing `@jini-ai/diagnostics` devDep). `sentry.ts:37` imports the **value** `createNoopObservabilityPort`; it moves to core in the same row, and the distribution-pack bundle inlines it as it does today from diagnostics.
- `diagnostics/package.json`, `analytics/package.json`: no export changes (subpaths stay; they just export fewer names).
- `scripts/injection-debt.json`: the provider-plugins → diagnostics payload keys for `opentelemetry.ts`, `sentry.ts`, and analytics-posthog → analytics keys for `browser.ts`, `consent.ts`, `posthog.ts` shrink or vanish (imports move to core, base). Each is removed in the lane's Jini commit if the gate shows it gone; `opentelemetry.ts:38,40` still imports diagnostics helpers (`errorType`, `createAsyncLocalSpanScope`…), so those keys stay.

## 4. Applier pass

`node scripts/apply-repoint.mjs --tsv sheets/C12-OBS.repoint.tsv --repo-root jini=<Jini> --repo-root tovu=<Tovu> --phase wave` after the lane commit.

Dry run 2026-11-16 (`--phase all --dry-run`, integ-view + Tovu `refactor/terra`): **rows 165; applied 151, already 0, keep 1, manual 13, STALE 0, ERROR 0; files changed 126.**

MANUAL rows (13), what to do:
- `provider-plugins/__tests__/observability-otel-operations.test.ts` (8 dynamic imports): only `:117` (`isNoopObservabilityPort`) changes spec to core; the other 7 take `combineObservabilityPorts`, which stays → no edit.
- `provider-plugins/__tests__/observability-sentry.test.ts:318` (`createNoopObservabilityPort`) → core.
- `analytics/__tests__/product-browser.test.ts:8` takes `withProductAnalyticsGuards` → no edit.
- Tovu `agent-daemon-core-rpc.integration.test.ts:89` takes `createNoopTracker` → no edit in M1 (M2 deletes it).
- `diagnostics/__tests__/package-surface.integration.test.ts` (namespace): remove the 29 moved names from the expected surface list.
- `diagnostics/.../optional-analytics.integration.test.ts` `vi.mock('@jini-ai/analytics/product')`: the mock factory returns values only; type imports of moved names are already repointed by their own rows → confirm, usually no edit.

## 5. STOP

- Any guard blob mismatch (re-guard on the merged wave-B tip first, see header).
- A caller that mutates the noop port or depends on distinct noop identity (§1).
- `ObservabilityPort` in core would need any import outside core (it must not: all field types are local).
- The base-purity gate reports anything in `core/src/contracts/observability.ts`.

## 6. Tests (cloud run)

diagnostics, analytics, daemon (`tool-recovery`), http-kit, provider-plugins (otel, sentry, posthog), core (moved noop test), Tovu typecheck. Expected: no behaviour change; debt only down.
