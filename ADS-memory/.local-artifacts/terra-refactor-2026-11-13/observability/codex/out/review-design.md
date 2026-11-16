Software Architect(Review): **GOOD WITH CHANGES.** Keep the shared facade, dependency injection, and vendor plugins. Fix several correctness gaps before implementation.

I read the full design and inspected `refactor/terra` at Jini `b7666092` and Tovu `b28d38c6`. Code line references below refer to those branch snapshots. No files changed; no tests or builds ran.

**(1) Will this integrate easily into both Jini and Tovu?**

**Yes architecturally; the migration is substantial.** The proposed ownership fits both projects:

- Jini packages import a universal contract from core; hosts assemble its implementation. This resolves the current duplication illustrated by [daemon’s structural observability slice:18](/Users/la/Programming/jini-terra-base/packages/daemon/src/tool-recovery/observability.ts:18).
- Tovu already assembles vendor ports, applies consent, and separates operator, site, and visitor destinations in [provider-plugins.ts:265](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/provider-plugins.ts:265). Replacing its tracker construction with the new composer is a natural extension.
- Keeping several consent-scoped **instances of one interface** is essential. One process-wide instance would undermine those boundaries.

However, deleting `Tracker` involves more than repointing its four construction sites. Publishing already has a named operation in [adapter.ts:523](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/features/deployments/static-publish/adapter.ts:523), and background delivery already has one in [outbox-drainer.ts:67](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/contracts/core/events/outbox-drainer.ts:67). HTTP requests and agent runs also use specialized tracker lifecycles. These need explicit migration mappings, preserving their behavior.

**(2) Will testing stay easy? What changes?**

**Ordinary unit tests remain easy. Pure-function tests remain unchanged.** Tests constructing an affected I/O service gain one dependency, ideally through their existing fixture builder. They need no SDK, exporter, network, credentials, or global initialization.

For example, today’s outbox test constructs the drainer without telemetry at [outbox-drainer.test.ts:64](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/contracts/core/events/__tests__/outbox-drainer.test.ts:64):

```ts
// Before
const drainer = startOutboxDrainer(
  { outbox, bus, clock },
  { intervalMs: 10 },
);
```

After the proposed required-argument migration:

```ts
// After — log is the test's logger fixture
const observability = createNoopObservability({ log });

const drainer = startOutboxDrainer(
  { outbox, bus, clock, observability },
  { intervalMs: 10 },
);
```

The existing delivery assertions and cleanup stay the same. A telemetry-focused test instead supplies `createRecordingObservability({})` and inspects its recording. That simplifies today’s handwritten fake at [outbox-drainer.test.ts:278](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/contracts/core/events/__tests__/outbox-drainer.test.ts:278).

Some things **do get harder**, appropriately:

- Context tests must cover overlapping asynchronous work, nesting after `await`, and callbacks.
- Instrumentation can change timing and promise behavior. Preserve synchronous APIs; the proposed `operation()` always returns a promise.
- A recording fake does not prove the production composer sanitizes or propagates correctly. Run shared contract scenarios against both, plus focused tests at the actual adapter boundary.
- Exact metric-duration assertions need a controllable monotonic clock.

The proposed synchronous-stack default for asynchronous tests must change before claiming equivalent behavior.

**(3) Is this the best long-term modular design?**

**The best fit is the proposed injected facade, with runtime-specific context propagation underneath it.**

| Choice | Assessment |
|---|---|
| Required facade at I/O/service boundaries | Recommended: explicit dependencies, isolated hosts, simple fixtures. |
| Ambient context as the way functions obtain observability | Avoid: hides dependencies and makes host/consent selection implicit. |
| OpenTelemetry API as the entire application contract | Useful for tracing interoperability, but insufficient for consent-governed product events and application incident policy. |

The design’s exception for pure helpers is correct. “Required” should mean **the boundary must receive its dependency**, not “every helper needs an unused argument” or “every I/O call creates another named operation.”

Context propagation complements injection: injected observability chooses **where signals may go**; context identifies **which operation they belong to**.

Keep OpenTelemetry’s standard propagation and SDK machinery inside adapters. The existing OTel adapter deliberately avoids global provider registration at [opentelemetry.ts:20](/Users/la/Programming/jini-terra-base/packages/provider-plugins/src/observability-opentelemetry/opentelemetry.ts:20). Preserve that isolation and provide explicit interoperability with a host’s existing tracing setup where needed.

**(4) Flaws and concrete changes, ranked by importance**

1. **Required: replace the asynchronous use of a synchronous context stack.**

   [DESIGN.md:153](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/observability/DESIGN.md:153) assigns a synchronous stack to browsers/tests. A stack restored when the callback returns loses context when that callback returns a promise; keeping it installed until settlement misattributes overlapping operations.

   Keep instance-owned AsyncLocalStorage for Node, including SSR. For browsers, provide an explicit operation-bound context/handle that can survive asynchronous continuations, or a verified asynchronous context implementation. A synchronous stack should promise synchronous behavior only. OpenTelemetry likewise treats context management as a separate capability. [OpenTelemetry context documentation](https://opentelemetry.io/docs/languages/js/context/)

   Define how request decorators, operation scopes, and error deduplication share that context. Today’s report scope is a module-level store at [report-error.ts:24](/Users/la/Programming/jini-terra-base/packages/diagnostics/src/observability/report-error.ts:24); merely injecting a new store into the composer does not migrate its other users.

2. **Required: preserve request, agent-run, and expected-error semantics before deleting `Tracker`.**

   Tovu’s request wrapper tracks response completion/disconnection and shares incident state at [observability-middleware.ts:85](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/inbound/shared/observability-middleware.ts:85). Its agent watcher passes agent-specific outcomes at [assistant-run-finalizer.ts:760](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/modules/assistant-run-finalizer.ts:760). The new generic `OperationHandle` does not directly replace either.

   Move these lifecycles into their designated decorators before removing the overloads. Also fix the worked request integration: Jini’s current middleware calls `next()` outside `tracker.run()` at [http-kit/observability.ts:37](/Users/la/Programming/jini-terra-base/packages/http-kit/src/observability.ts:37), so simply changing its parameter type will not produce the promised nested DB spans.

   Add an explicit incident-classification policy. The daemon intentionally excludes validation failures from error reporting at [tool-recovery/observability.ts:94](/Users/la/Programming/jini-terra-base/packages/daemon/src/tool-recovery/observability.ts:94); “report every throw” would change that behavior.

3. **Required: complete redaction before fan-out, including automatic error paths.**

   `exactSecrets` exists on `error()` but not on `operation()`. An inner operation could automatically report an unfamiliar credential before an outer catch supplies it. Tovu already depends on exact credential masking at [assistant-byok.ts:773](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/modules/assistant-byok.ts:773). Allow operation-scoped sensitive values or an equivalent inherited sanitization policy.

   Always project outbound errors into an approved bounded representation. Existing `redactedError()` returns the original error when message/stack need no changes, retaining arbitrary properties and causes: [report-error.ts:44](/Users/la/Programming/jini-terra-base/packages/diagnostics/src/observability/report-error.ts:44).

   Logs need an explicit policy too. `Logger` is an interface, and its default projection passes ordinary string metadata through; it is not comprehensive secret sanitization. See [logger.ts:40](/Users/la/Programming/jini-terra-base/packages/core/src/primitives/logger.ts:40). Core redaction explicitly cannot recognize every kind of sensitive information: [redact.ts:14](/Users/la/Programming/jini-terra-base/packages/core/src/redact.ts:14).

   Finally, correct the design’s claim that raw URLs never cross the port: they currently do, by contract, at [ports.ts:30](/Users/la/Programming/jini-terra-base/packages/diagnostics/src/observability/ports.ts:30). Either retain adapter-side sanitization explicitly or deliberately change that boundary.

4. **Required: distinguish error admission from sampling and delivery.**

   [DESIGN.md:208](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/observability/DESIGN.md:208) cannot guarantee “errors are never sampled away” merely by calling every adapter. The OTel adapter records exceptions on the active span at [otel.ts:183](/Users/la/Programming/jini-terra-base/packages/diagnostics/src/observability/otel.ts:183). If that span was dropped by head sampling, reporting does not recover it. [OpenTelemetry explains this limitation](https://opentelemetry.io/docs/concepts/sampling/).

   Promise **unsampled incident admission to an eligible error channel**, respecting consent/export gates. If retaining complete error traces is required, specify an appropriate collection and tail-sampling strategy. Keep operation metrics independent of trace sampling.

5. **Required: specify propagation authority and update every forwarding wrapper.**

   Decide which adapter supplies the canonical trace IDs **and matching carrier**. Existing fan-out selects the first available IDs, while providers maintain independent traces: [fanout.ts:99](/Users/la/Programming/jini-terra-base/packages/diagnostics/src/observability/fanout.ts:99).

   `activeCarrier`, `parent`, and `root` must survive fan-out, hook wrappers, lease gates, and actual adapter translation. Tovu’s gate derives method names from its noop and explicitly adds optional methods at [provider-plugins.ts:200](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/provider-plugins.ts:200); new optional hooks will otherwise disappear.

   Validate incoming carriers, define `root` versus `parent` precedence, and restrict outbound propagation to approved destinations. Reuse standard propagators within the adapter. [OpenTelemetry propagators specification](https://opentelemetry.io/docs/specs/otel/context/api-propagators/)

6. **Required before browser adoption: define consent revocation and teardown.**

   Default-off browser tracing is sensible. Its contribution contract also needs a lifecycle for disabling collection, retiring listeners/timers, and handling queued data after revocation or provider replacement. Initial opt-in plus lazy loading is insufficient.

   Reuse Tovu’s existing lease/revision model rather than introducing a parallel one. Preserve its install-level product filtering: product traces are deliberately noop and metrics allow-listed at [product-telemetry.ts:185](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/product-telemetry.ts:185). Automatic operation metrics must not silently broaden that permission.

7. **Required: define success and deduplication precisely.**

   A returned result, or `failed: false`, does not necessarily mean the business action succeeded: denial, cancellation, skipped work, and the design’s “not found” example can all return normally. Prefer explicit product-event capture after the successful business transition, or require an explicit eligible outcome for automatic capture.

   Preserve existing commit-aware event ownership in [tool-use-events.ts:24](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/tool-use-events.ts:24).

   Also strengthen “reported once”: current deduplication only recognizes object throws and records asynchronous admission after settlement at [report-error.ts:75](/Users/la/Programming/jini-terra-base/packages/diagnostics/src/observability/report-error.ts:75). Specify pending-admission handling, primitive throws, and retry after rejection.

8. **Recommended: bound automatic metric cost and strengthen the migration gate.**

   Literal operation names alone do not bound metric series. Outcome values and combinations of `metricKeys` can still grow. Define approved dimensions, value limits/overflow behavior, fixed instrument kinds/units, and a configurable operation policy. Keep provider queues bounded and preserve noop shortcuts.

   Cost: automatic metrics add two measurements per completed operation per metric destination, plus sanitization and span fan-out; retained series depend on label combinations. **UNVERIFIED** overhead; measure representative throughput, latency, and memory before broad adoption.

   Keep the proposed separation between package moves and behavioral adoption. Add a full consumer census, coordinated release/rollback plan, and package-export/dependency updates. Diagnostics currently lists analytics only as a development dependency at [package.json:88](/Users/la/Programming/jini-terra-base/packages/diagnostics/package.json:88), so using its fan-out at runtime needs an explicit packaging decision.

   Finally, the gate at [DESIGN.md:366](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/observability/DESIGN.md:366) misses real boundaries named `startOutboxDrainer` and `publishStaticSite`. Use an explicit inventory of effectful boundaries alongside semantic checks; naming heuristics cannot enforce the stated policy alone.

One shared interface is a good foundation for all your apps.  
Most existing tests will need only one small fixture change.  
The design needs fixes so tracking stays correct during overlapping work and respects privacy choices.  
Keep the approach, and migrate it gradually while preserving today’s behavior.
