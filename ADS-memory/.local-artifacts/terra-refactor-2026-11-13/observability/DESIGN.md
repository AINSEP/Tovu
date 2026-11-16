# One observability contract for Jini + Tovu (design, 2026-11-15)

Design only. Nothing here is built. Read against Jini `jini-terra-base` (branch `integ/wave-b`), lane `gh/wave-b/C8`, Tovu `tovu-codex-trial-terra`, and `development/todos.md` §M.

## 1. Verdict on the owner's idea

**Right idea, and about 70% of it already exists.** Jini already has the fan-out (`combineObservabilityPorts`), the "one call does tracing + errors + analytics" facade (`createTracker` → `Tracker`), redaction (`redactedError` over core `redactSecrets`), and vendor adapters as provider plugins (OTel, Sentry, PostHog). The real gaps: the contract sits in `@jini-ai/diagnostics`, which domain packages may not import, so they copy slices of it (daemon `ToolCallObservability`, http-kit `HttpRequestObservabilityPort`); callers face two overlapping shapes (`ObservabilityPort` and `Tracker`); logs are a separate dependency; nothing is required, so coverage is one caller (`tool.call`).

**What I changed from the literal version, and why:**
1. **Required at composition boundaries, not on every function.** Jini has 6,278 exported functions and 784 exported `create*` factories. Threading the object through pure helpers adds a parameter they never use, makes pure code look impure, doubles test setup, and adds zero signal: a pure helper's throw already lands in its caller's operation. So it is **required (no `?`, no default) in the required object of every factory/decorator that does I/O or builds a handler, route, tool, worker or scheduler, and of any standalone exported function that does I/O.** Inner code reaches it through the factory's closure. Pure helpers never take it. A gate enforces this (§4 M5).
2. **One object, two faces.** Features use the small facade `Observability` (operation, error, metric, capture, log). Infrastructure chokepoints (request middleware, storage kernel, guarded HTTP client, agent-run watcher) need split start/end lifecycles, so they read `observability.signals` (the existing `ObservabilityPort`). Hosts still pass ONE thing everywhere; a lint rule keeps `.signals` inside the chokepoint files.
3. **Logs folded in** (`observability.log`, the core `Logger`, stamped with trace ids). Factories drop their separate `logger` dependency, so the required object does not grow.
4. **Operations emit metrics automatically** (count + duration by name/outcome), which covers the approved "tool calls + failures by tool, run duration" with no extra code at call sites.
5. **"One interface" is one type, not one instance.** Tovu already builds three instances (product branch, site branch, visitor branch) because consent differs per branch. That stays; the type is shared.
6. AI prompt/response text (Langfuse `ai_trace`) stays its own contract: it carries content under a separate opt-in, and the facade never carries user text.

## 2. The contract

### 2.1 Where it lives

| Subpath | Holds | Who imports |
|---|---|---|
| `@jini-ai/core/contracts/observability` (universal) | All types below, moved verbatim from `diagnostics/src/observability/ports.ts` (vendor-neutral part) and `analytics/src/product/index.ts` (port + event types), plus the new facade types and `createNoopObservability` (pure, allowed in core per owner 11-15 D2). | Every Jini package, provider plugins, hosts |
| `@jini-ai/core/contracts/observability/testing` (universal) | `createRecordingObservability` | Tests only |
| `@jini-ai/diagnostics/observability` (universal) | `createObservability` (composer), `combineObservabilityPorts` (exists), `redactedError` (exists), `redactOperationAttributes` (exists, C8 keeps it), `createStackContextStore` | Hosts only |
| `@jini-ai/diagnostics/observability/node` | `createAsyncLocalContextStore`, `createAsyncLocalSpanScope` (exists) | Node hosts |
| `@jini-ai/analytics/product` | `withProductAnalyticsGuards`, `fanOutProductAnalytics` (exist; types now from core) | Hosts |
| provider plugins `observability-opentelemetry`, `observability-sentry`, `analytics-posthog` | Adapters returning `ObservabilityAdapter` / `ProductAnalyticsAdapter` | Provider host |

No library types in core: carriers are W3C strings, attributes are `string | number | boolean`, errors are `unknown`.

### 2.2 Types (core `contracts/observability.ts`)

```ts
import type { Logger } from '../primitives/logger.js';

// ---- Moved verbatim from diagnostics ports.ts (abridged here; no shape change in M1) ----
export type OperationAttributes = Readonly<Record<string, string | number>>;
export interface TraceIds { readonly traceId: string; readonly spanId: string; }
export interface TrackerScope { run<T>(fn: () => T): T; }
export interface RequestTrackingInput { method: string; path: string; }
export interface RequestTrackingOptions { requestId?: string; }
export interface RequestTrackingOutcome { statusCode: number; routePattern: string; }
export interface RequestTracker { readonly requestId?: string; end(outcome: RequestTrackingOutcome): void; run?<T>(fn: () => T): T; }
export interface DbQueryTrackingInput { system: string; }
export interface DbQueryTrackingOutcome { operation: string; table?: string; error?: unknown; }
export interface DbQueryTracker extends TrackerScope { end(outcome: DbQueryTrackingOutcome): void; }
export interface OutboundCallTrackingInput { method: string; url: string; }
export interface OutboundCallTrackingOutcome { statusCode?: number; error?: unknown; }
export interface OutboundCallTracker extends TrackerScope { end(outcome: OutboundCallTrackingOutcome): void; }
export interface AgentRunTrackingInput { runId: string; }
export interface AgentRunTrackingOptions { conversationId?: string; agentName?: string; }
export type AgentRunStatus = 'succeeded' | 'failed' | 'canceled' | 'interrupted' | 'abandoned';
export interface AgentRunTrackingOutcome {
  status: AgentRunStatus; error?: unknown;
  /** M3-b (approved): OTel adapters map to gen_ai.* names. Counts and labels only, never text. */
  usage?: AiUsage;
}
export interface AiUsage { model: string; provider: string; inputTokens?: number; outputTokens?: number; costUsd?: number; }
export interface OperationTrackingInput {
  name: string; attributes?: OperationAttributes;
  /** M3-a: continue a trace started in another process. Absent = child of the active scope. */
  parent?: TraceCarrier;
  /** M3-d: start a new root trace (background job runs) even inside an active scope. */
  root?: boolean;
}
export interface OperationTrackingOutcome { outcome: string; failed: boolean; attributes?: OperationAttributes; }
export interface OperationTracker extends TrackerScope { end(outcome: OperationTrackingOutcome): void; }
export interface ErrorReport { error: unknown; context: { operation: string; attributes?: OperationAttributes; level?: 'warning' | 'error'; trace?: TraceIds }; }
export interface MetricInput { name: string; value: number; }
export interface MetricOptions { kind?: 'counter' | 'gauge' | 'histogram'; unit?: string; attributes?: OperationAttributes; }
export interface CrashUpload { submitURL: string; globalExtra: Readonly<Record<string, string>>; }

/** W3C trace context as plain strings: an HTTP `traceparent` header, a child process's TRACEPARENT env. */
export interface TraceCarrier { readonly traceparent: string; readonly tracestate?: string; }

/** The vendor SPI. Each provider plugin implements it; hosts fan several out into one. */
export interface ObservabilityPort {
  readonly supportsMetric?: boolean;
  activeTraceIds?(required: Record<string, never>): TraceIds | undefined;
  /** M3-a: the active scope as a carrier for the next hop. Absent on adapters that cannot propagate. */
  activeCarrier?(required: Record<string, never>): TraceCarrier | undefined;
  metric(input: MetricInput, options?: MetricOptions): void | Promise<void>;
  trackRequest(input: RequestTrackingInput, options?: RequestTrackingOptions): RequestTracker;
  trackDbQuery(input: DbQueryTrackingInput): DbQueryTracker;
  trackOutboundCall(input: OutboundCallTrackingInput): OutboundCallTracker;
  trackAgentRun(input: AgentRunTrackingInput, options?: AgentRunTrackingOptions): AgentRunTracker;
  trackOperation(input: OperationTrackingInput): OperationTracker;
  reportError(report: ErrorReport): boolean | void | Promise<boolean | void>;
  crashUpload?(required: { release: string; environment: string }): CrashUpload;
  /** M3-c: publishable browser config for one surface. Absent (the default) = no browser tracing. */
  browserObservability?(required: { surface: BrowserSurface }): BrowserObservabilityContribution | undefined;
}
export interface AgentRunTracker extends TrackerScope { end(outcome: AgentRunTrackingOutcome): void; }
export interface ObservabilityAdapter { port: ObservabilityPort; dispose(): Promise<void>; }

// ---- Moved verbatim from analytics/product ----
export type ProductEventProperties = Readonly<Record<string, string | number | boolean>>;
export interface ProductEvent { name: string; userId: string; properties?: ProductEventProperties; }
export interface ProductIdentity { userId: string; traits?: ProductEventProperties; }
export interface ProductAnalyticsPort { /* unchanged: capture, identify, captureAiGeneration?, includeAiContent?, browserAnalytics? */ }
export interface ProductAnalyticsAdapter { port: ProductAnalyticsPort; dispose(): Promise<void>; }

// ---- Browser (M3-c) ----
export type BrowserSurface = 'admin' | 'site-chat' | 'site';
/** Publishable values only (a public DSN, an OTLP browser endpoint). The browser adapter loads lazily. */
export interface BrowserObservabilityContribution { providerId: string; module: string; configuration: Readonly<Record<string, string>>; }

// ---- NEW: what features use ----
export interface OperationHandle {
  /** The feature's own fixed label (`completed`, `denied`, `skipped`). First call wins; a throw
   *  still replaces an earlier success, never a cancellation (existing Tracker semantics). */
  setOutcome(outcome: OperationTrackingOutcome): void;
  /** Bounded labels learned mid-way (a resolved tool id). Same rules as start attributes. */
  setAttributes(attributes: OperationAttributes): void;
}
export interface OperationOptions {
  /** Fixed labels and ids only: never user text, paths, URLs, bodies. Redacted + capped by the composer. */
  attributes?: OperationAttributes;
  /** Attribute keys also used as metric labels (bounded sets only, e.g. `tool.id`). Default: none. */
  metricKeys?: readonly string[];
  parent?: TraceCarrier;
  root?: boolean;
  /** Optional product event sent once on success, through the host's consent-guarded analytics. */
  capture?: { name: string; userId: string; properties?: ProductEventProperties };
}
export interface ErrorOptions {
  attributes?: OperationAttributes;
  level?: 'warning' | 'error';
  /** Values blanked even without a known secret shape (the key a failing call used). */
  exactSecrets?: readonly string[];
}

/** The one dependency every I/O factory takes. Never throws from telemetry; application errors keep
 *  their identity. All methods are safe on the noop. */
export interface Observability {
  /** Runs `run` exactly once inside a named feature step and returns its result or rethrows its
   *  original error. On a throw the error is reported once (deduped through nested operations). */
  operation<T>(required: { name: string; run: (op: OperationHandle) => T | Promise<T> }, optional?: OperationOptions): Promise<T>;
  /** An incident outside an operation's throw path (a caught failure that is still a bug). */
  error(required: { error: unknown; operation: string }, optional?: ErrorOptions): void;
  metric(required: MetricInput, optional?: MetricOptions): void;
  /** Product analytics. Resolves after local consent/admission, never after delivery. */
  capture(required: { name: string; userId: string }, optional?: { properties?: ProductEventProperties }): void | Promise<void>;
  /** Host logger; every line carries the active trace ids. Still works when telemetry is off. */
  readonly log: Logger;
  /** Active trace, for log correlation and cross-process propagation. */
  current(required: Record<string, never>): { ids: TraceIds; carrier?: TraceCarrier } | undefined;
  /** Chokepoint SPI. Lint: only request/db/http/agent-run/tool-executor decorator files may read it. */
  readonly signals: ObservabilityPort;
}

/** Host-owned scope storage. Node: AsyncLocalStorage. Browser/tests: a synchronous stack. */
export interface ObservabilityContextStore<F> { get(required: Record<string, never>): F | undefined; run<T>(required: { frame: F; fn: () => T }): T; }

/** Telemetry off: work runs once, logs still go to `log`, nothing else happens. Frozen; O(1). */
export function createNoopObservability(required: { log: Logger }): Observability;
```

### 2.3 Noop and recording fake

- `createNoopObservability({ log })` (core main subpath, because hosts with telemetry off use it in production). `log` is required on purpose: turning telemetry off must never silence logs. `signals` is the existing frozen noop port (`createNoopObservabilityPort` moves to core with it), so chokepoint decorators keep skipping their wrappers (`isNoopObservabilityPort`).
- `createRecordingObservability({}, { carrier? })` (core `/testing`) returns `{ observability, recording }`:

```ts
export interface ObservabilityRecording {
  operations: Array<{ name: string; attributes: OperationAttributes; outcome?: string; failed?: boolean; parent?: string; root: boolean; ended: boolean }>;
  errors: Array<{ operation: string; name: string; message: string; attributes?: OperationAttributes; level: 'warning' | 'error' }>;
  metrics: Array<{ name: string; value: number; kind?: string; attributes?: OperationAttributes }>;
  events: Array<{ name: string; userId: string; properties?: ProductEventProperties }>;
  logs: Array<{ level: 'info' | 'warn' | 'error'; message: string }>;
}
```
The fake applies the SAME redaction as the composer (core `redactSecrets` on messages and string attributes), so a test can assert that a secret never left. It records `signals` calls too (`recording.signals`) for chokepoint tests. It replaces the per-package OTel-shaped fakes C8 could not place (C8 report: "the split needs a decision on where an OTel-shaped fake lives" → the answer is: tests of features use this fake; only the OTel provider's own tests keep an OTel-shaped fake, inside the provider).

### 2.4 Composer and fan-out (diagnostics)

```ts
export function createObservability(
  required: {
    ports: readonly ObservabilityPort[];           // OTel, Sentry, ... already started by the provider host
    analytics: readonly ProductAnalyticsPort[];    // already consent-guarded by the host; never guarded twice
    log: Logger;
    context: ObservabilityContextStore<OperationFrame>;
  },
  optional: { warn?: (message: string) => void; operationMetrics?: boolean } = {},
): Observability;
```
- Fan-out: `combineObservabilityPorts({ ports })` and `fanOutProductAnalytics({ ports: analytics })`, both existing, each adapter isolated (one adapter throwing never reaches the caller or skips the others). All ports noop + no analytics → returns `createNoopObservability({ log })`.
- `operation` = today's `Tracker.trace` (outcome rules, run-once, dedup scope) on `trackOperation`, plus: `metricKeys`-labelled `operation.count` (counter) and `operation.duration` (histogram, ms) when `operationMetrics !== false`; `capture` sent once on success.
- `createTracker` / `Tracker` / `createNoopTracker` are deleted (owner 11-15: no re-export shells; 4 callers repointed).
- `reportErrorOnce` keeps its logic but takes the context store instead of importing `node:async_hooks`, so the composer is universal (browser-capable).

### 2.5 Redaction point

One point before fan-out, in the composer, then each adapter again (idempotent, defence in depth):

| Signal | Composer does | Adapter still does |
|---|---|---|
| errors (`operation` throw, `error()`) | `redactedError` (core `redactSecrets` + `exactSecrets`) on message and stack | Sentry `describeReportedError`; OTel `exception.*` mapping |
| attributes (operation, metric, error) | `redactOperationAttributes`: strings capped (128 chars) and run through `redactSecrets`; max 32 keys; non-scalar values dropped | unchanged |
| product events | `redactSecrets` on string properties; consent is the host's guard, already applied | PostHog's own |
| logs | core `Logger` projection (`describeLogMeta`, `describeErrorForLog`) | n/a |
| request/DB/outbound (chokepoints) | not through the composer: raw URL/statement never cross the port (existing rule) | adapters keep scheme/host/port only; statement text never sent |

### 2.6 Sampling

Decided per vendor adapter (OTel ratio sampler, Sentry `tracesSampleRate`) through each provider's settings card; the contract carries no sampler. Three invariants, enforced by the composer and the fake's tests: errors are never sampled away (reportError always fans out); operation metrics count every operation whether or not its span is sampled; a sampled-out trace still propagates its carrier (W3C `sampled=0` flag) so downstream processes agree. Default 100%: hosts are small; the setting exists when a host is not.

### 2.7 Browser: off by default

- No browser code ships unless a provider returns `browserObservability({ surface })`, mirroring today's `browserAnalytics`. Each adapter returns `undefined` unless its saved setting `browser tracing` for that surface is on, and that setting defaults off.
- `admin` and `site-chat`: owner opt-in per site. `site` (public visitors): additionally only after the visitor's consent, through the existing consent plugin; and see Q1 (legal question from 10-04 still open).
- The browser host builds `createObservability({ ports: [lazilyLoadedAdapter], analytics: [], log, context: createStackContextStore({}) })`; with no contribution it builds the noop. The adapter module loads lazily, never in the main bundle. Phones keep the same behaviour (no mobile gating).

## 3. Worked examples

### (a) Jini domain service factory + tool handler

```ts
// packages/<domain>/src/backup/service.ts
import type { Observability } from '@jini-ai/core/contracts/observability';
import type { BlobStorePort, SiteRepo } from './ports.js';

/** Fixed operation names: the gate rejects anything but a literal or a key of this object. */
export const BACKUP_OPERATIONS = { create: 'backup.create', restore: 'backup.restore' } as const;

export interface BackupService {
  create(required: { siteId: string }, optional?: { reason?: 'manual' | 'scheduled' }): Promise<{ backupId: string }>;
}

/** Required object = every I/O port + observability. Pure helpers below take none of them. */
export function createBackupService(
  { sites, blobs, observability }: { sites: SiteRepo; blobs: BlobStorePort; observability: Observability },
  _optional: Record<string, never> = {},
): BackupService {
  return {
    create: ({ siteId }, { reason = 'manual' } = {}) =>
      observability.operation({
        name: BACKUP_OPERATIONS.create,
        run: async (op) => {
          const site = await sites.get({ siteId });                       // DB span nests here (kernel chokepoint)
          if (!site) { op.setOutcome({ outcome: 'not-found', failed: false }); return { backupId: '' }; }
          const archive = buildArchiveManifest({ site });                 // pure: no observability param
          const { key } = await blobs.put({ key: archiveKey({ siteId }), body: archive }); // outbound span nests here
          observability.log.info({ message: 'backup stored' }, { meta: { siteId } });
          return { backupId: key };
        },
      }, { attributes: { 'site.id': siteId, 'backup.reason': reason }, metricKeys: ['backup.reason'] }),
  };
}

// packages/<domain>/src/backup/tool.ts — a tool handler is a factory product: it closes over observability.
export function createBackupTool({ backups, observability }: { backups: BackupService; observability: Observability }) {
  return {
    id: 'site.backup.create',
    execute: ({ input, principal }: { input: { siteId: string }; principal: { id: string } }) =>
      observability.operation({
        name: 'tool.call',
        run: () => backups.create({ siteId: input.siteId }),             // nested backup.create span
      }, {
        attributes: { 'tool.id': 'site.backup.create' },
        metricKeys: ['tool.id'],
        capture: { name: 'backup_created', userId: principal.id },        // product event on success only
      }),
  };
}
```
(In practice the generic `tool.call` wrapper stays in one place, the daemon's tool-executor decorator, which moves from its structural `ToolCallObservability` slice to `Observability`; tool authors then write only the inner domain operation. Shown inline here for the shape.)

### (b) Tovu composition: OTel + Sentry + PostHog into one object

Extends the existing `composePorts` in `apps/website/src/server/runtime/composition/provider-plugins.ts` (which already fans out leases and builds three trackers):

```ts
import { createObservability } from '@jini-ai/diagnostics/observability';
import { createAsyncLocalContextStore } from '@jini-ai/diagnostics/observability/node';
import { withProductAnalyticsGuards } from '@jini-ai/analytics/product';
import type { ObservabilityPort, ProductAnalyticsPort } from '@jini-ai/core/contracts/observability';

function composeObservability({ leases, consent, consentRevision, log, product, warn }: ComposeInput) {
  // Leases are whatever the owner connected: observability-opentelemetry (Datadog/Grafana/Honeycomb
  // via OTLP), observability-sentry, analytics-posthog. Tovu names no vendor here.
  const siteTraces = (leases.get('observability') ?? []) as ObservabilityPort[];
  const siteAnalytics = ((leases.get('product_analytics') ?? []) as ProductAnalyticsPort[])
    .map((inner) => withProductAnalyticsGuards({ inner, consent }, { consentRevision }));
  const context = createAsyncLocalContextStore({});
  const site = createObservability({ ports: siteTraces, analytics: siteAnalytics, log, context }, { warn });
  return {
    // Install-level product branch joins only the operator instance; visitors never feed it.
    observability: product
      ? createObservability({ ports: [...siteTraces, product.observability], analytics: [...siteAnalytics, product.productAnalytics], log, context }, { warn })
      : site,
    siteObservability: site,
    visitorObservability: createObservability({ ports: siteTraces, analytics: [/* visitor-proof guarded branch, as today */], log, context }, { warn }),
  };
}

// Route/module binding: the composition root is the only place that picks the instance.
const backups = createBackupService({ sites: siteRepo, blobs: blobStore, observability: ports.observability });
app.use(createRequestTrackingMiddleware({ observability: ports.observability }));       // reads .signals
const kernel = instrumentStorageKernel({ kernel: rawKernel, observability: ports.observability });

// Cross-process (M3-a): daemon → CLI child keeps one trace.
const carrier = ports.observability.current({})?.carrier;
spawnCli({ env: carrier ? { TRACEPARENT: carrier.traceparent, ...(carrier.tracestate ? { TRACESTATE: carrier.tracestate } : {}) } : {} });
// and in the child: observability.operation({ name: 'cli.run', run }, { parent: readCarrierFromEnv({ env: process.env }) })
```
Desktop and Open Marketing do the same with their own leases; a host with telemetry off passes `createNoopObservability({ log })` (one line).

### (c) Unit test with the recording fake

```ts
import { describe, expect, it } from 'vitest';
import { createRecordingObservability } from '@jini-ai/core/contracts/observability/testing';
import { BACKUP_OPERATIONS, createBackupService } from '../service.js';
import { createMemorySiteRepo, createFailingBlobStore } from './fakes.js';

describe('createBackupService', () => {
  it('reports a failed backup.create operation and one redacted error', async () => {
    const { observability, recording } = createRecordingObservability({});
    const blobs = createFailingBlobStore({ error: new Error('upload failed: token=sk-ant-' + 'x'.repeat(95)) });
    const service = createBackupService({ sites: createMemorySiteRepo({ sites: [{ id: 's1' }] }), blobs, observability });

    await expect(service.create({ siteId: 's1' })).rejects.toThrow('upload failed');   // original error, unchanged

    expect(recording.operations).toEqual([
      expect.objectContaining({ name: BACKUP_OPERATIONS.create, attributes: { 'site.id': 's1', 'backup.reason': 'manual' }, outcome: 'error', failed: true, ended: true }),
    ]);
    expect(recording.errors).toHaveLength(1);                                          // reported once, not per nesting level
    expect(recording.errors[0]).toMatchObject({ operation: BACKUP_OPERATIONS.create, level: 'error' });
    expect(recording.errors[0]!.message).not.toContain('sk-ant-');                     // redaction happened before fan-out
    expect(recording.metrics).toContainEqual(expect.objectContaining({ name: 'operation.count', attributes: expect.objectContaining({ operation: 'backup.create', failed: 1 }) }));
  });
});
```

## 4. Migration plan

**What replaces what**

| Today | After |
|---|---|
| `diagnostics/observability/ports.ts` vendor-neutral types, `noop.ts` | core `contracts/observability` (moved, same shapes; old file keeps only `TraceSpanPort`/`SpanScopePort`/request-log ports C8 left there) |
| `analytics/product` port + event types | core `contracts/observability` (guards + fan-out stay in analytics) |
| `Tracker`, `createTracker`, `createNoopTracker`, `tracker-types.ts` | `Observability`, `createObservability`, `createNoopObservability` (deleted, not aliased) |
| daemon `ToolCallObservability`, http-kit `HttpRequestObservabilityPort`, C8's OTel `contract.ts` restatements | import from core (restatements deleted) |
| separate `logger` deps on factories that also take observability | `observability.log` |
| `reportErrorOnce` on `node:async_hooks` | same logic over an injected `ObservabilityContextStore` |
| unchanged | `combineObservabilityPorts`, `withProductAnalyticsGuards`, `fanOutProductAnalytics`, chokepoint decorators, provider adapters, C8's provider `context` helpers |

**Order and lanes** (rough tokens; Terra = Codex gpt-6.1-terra MAX for mechanical volume per owner 11-12)

| Step | When | What | Behaviour change | Cost |
|---|---|---|---|---|
| M1 contract move (lane `C12-OBS`) | Wave C, after C8 + its R12 applier rows are merged (C8 edits the same `ports.ts`/`index.ts`/`otel.ts`) | Pure type move to core + `noop` + repoint all importers (Jini ~20 files, Tovu up to 68 that import `@jini-ai/diagnostics/observability` types) + delete the 3 restatements. Census + DROP rows like other C lanes. | None | Opus sheet 60k; Terra applier ~150k |
| M2 facade | Right after M1's cloud run | `Observability` + composer + recording fake + context store; delete `Tracker` (4 callers: Tovu `provider-plugins.ts`, `agent-daemon-core-client.ts`, desktop `product-telemetry.ts`, diagnostics); move daemon tool decorator onto the facade. Failing tests first (owner rule). | Yes, small; reviewed | Opus build 200k + Codex blind bug pass + Opus review 60k |
| M5 gate (WARN) | With M2 | Script below, WARN + debt list generated from current tree. | None | Sonnet 80k |
| M3 approved §M extras | After M2, four parallel lanes | a) traceparent propagation daemon↔CLI child, desktop→site server, server→daemon (Opus 250k); b) gen_ai usage on agent runs (Sonnet 120k); c) browser adapter, off by default (Opus + Chrome 250k, after Q1); d) background work root traces: outbox worker, schedulers, trash purge (Sonnet 150k, starts with the "not checked" survey) | Yes | ~770k |
| M4 adoption | Per feature/package, only AFTER that feature's move slices (MOVE/SPLIT/SERVER) land; never inside a pure move. The five named steps (tool call, publish, backup, deploy, import) first, see Q2. | Add `observability` to required objects, wrap the named step, delete separate `logger` dep, wire in the composition root. Terra threads signatures; Sonnet names operations/outcomes; Opus reviews one batch per round. | Yes (new signals only) | ~15 Jini pkgs + ~25 Tovu feature folders: ~3.5M Terra/Sonnet + ~400k Opus review |
| M5 gate ERROR | Per package once its debt rows hit 0 | flip to CI ERROR | — | — |

Add one line to `move-templates/COMMON.md` now: "A move slice never adds or removes observability; a moved factory missing it stays on the gate's debt list."

**The gate (`development/scripts/observability-gate`, both repos, ratchet like the complexity gate)**
1. Exported functions named `create*|with*|register*|instrument*` in non-test source whose required parameter has a property typed `*Port|*Repo|*Repository|*Kernel|*Client|*Store|*Executor|*Queue|Fs*` must also have `observability: Observability` (required, not `?:`).
2. `observability?:` and `createNoopObservability(` are errors outside composition roots, tests and `/testing`.
3. `operation({ name: ... })` must be a string literal or a member of an `*_OPERATIONS` const (bounded cardinality).
4. `.signals` read outside the allow-listed chokepoint files is an error.
5. Debt list = today's violations; new code cannot add rows.

## 5. Owner questions

1. **Public-site visitor tracing (Web Vitals, front-end errors):** allowed at all, only after the visitor's consent? This was skipped on 10-04 as legally unclear. Admin and site chat are planned as owner opt-in, default off, either way.
2. **Timing of the five named steps** (tool call, publish, backup, deploy, import): wrap them right after M2 (about 400k Sonnet, touches Tovu feature folders that may still be in move slices; I'd skip any folder with an open slice), or wait until those features finish moving to Jini?
3. **Budget for M4** (~3.5M Terra/Sonnet + ~400k Opus, spread over the move waves): approve, or adopt only where the gate's debt list overlaps a feature that is being touched anyway?
