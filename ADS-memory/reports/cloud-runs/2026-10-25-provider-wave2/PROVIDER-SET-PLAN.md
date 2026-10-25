Software Architect(Review): **Software Architect + Code Inspection** — personas loaded for ownership, lifecycle design, and regression planning.

**Verdict: use `@jini-ai/plugins`, with a small provider-contribution extension.** It already owns code-plugin installation, admission, activation, and loading. It does **not yet** provide the factory registration and resource disposal these adapters need.

Inspected Jini observability `49779de1`, guard-zero `07289148`, salvage `c2c5f04c`; current integration line `59d2ba94`; Tovu observability `f1e1caf9a`, AI tracing `388f42d2`; and current Open Marketing sources. No edits, tests, builds, or servers.

**What exists and what needs extending**

- Code plugins use `<installDir>/<id>/<version>/jini.plugin.json` and `server/index.mjs`; `tovu.plugin.json` remains a read alias. Installation accepts folders/archives, validates bounded bytes and integrity, and publishes versioned artifacts without evaluating code.
- [The loader](/Users/la/Programming/tovu-integration-clones/jini-om1025/packages/plugins/src/host/node/loader.ts) verifies integrity and SDK compatibility, applies host tier admission, then imports and runs setup. Existing contributions cover routes, tools, and widgets; charts add reviewed browser assets. Recharts’ server setup is empty, so it establishes packaging precedent, not server-adapter lifecycle support.
- Open Marketing already calls that same loader through [its executable plugin host](/Users/la/Programming/Open-Marketing/apps/server/src/plugin-host.ts). It needs the shared extension plus thin composition changes.
- A better **registry** already exists: [`createProviderRegistry`](/Users/la/Programming/tovu-integration-clones/jini-om1025/packages/core/src/provider-registry.ts), with a frozen ownership contract. Reuse it for provider validation, identity, and duplicate refusal.
- `defineProviderContribution` also exists, but its loader belongs to **Agent Plugins** and their trust/activation model. It is useful precedent, not a reason to install these adapters as agent plugins or introduce another loader.
- Tier-3 executes trusted code in process. SDK capability gates govern supplied handles; they do not sandbox arbitrary Node imports or network calls.

**Proposed distribution and lifecycle**

Put the set at `Jini/packages/provider-plugins`, published as **one asset distribution, `@jini-ai/provider-plugins`**. Its adapters are regular plugin artifacts under `plugins/<id>/<version>/`; it exposes no callable vendor-adapter barrel. No vendor-named npm packages.

Build each plugin into self-contained `server/index.mjs` plus any contained chunks; bundle SDK dependencies, hash every runtime file, retain licenses, and publish the catalog/artifacts together. SDK dependencies belong to this distribution’s build dependencies. Remove vendor exports, SDK peers, and vendor tests from core packages. Hosts install selected plugin folders through the existing installer; deploying one plugin requires no runtime npm installation.

Extend the existing manifest/contribution owner with **proposed** `contributes.providers` declarations and a capability-gated `sdk.providers.register`. A declaration identifies `{ contract, id, contractVersion: 1 }`; registration supplies a factory. Setup captures factories privately, and publishes them only after successful admission. Domain contract validation remains injected; `plugins` need not import diagnostics, analytics, runtime, or commerce.

Factories take `(requiredObj, optionalObj = {})` and return `{ port, dispose }`. Required inputs contain explicit configuration, credentials, and effect ports. Secrets never enter manifests, browser assets, or agent instructions. Factory execution creates clients/timers; module evaluation and registration do not.

Host selection requires **installed + enabled + configured** before importing a provider plugin. Unconfigured contracts retain their existing noop. Await initialization in asynchronous boot before admitting application work; Tovu’s current observability construction precedes plugin attachment, so composition order must change explicitly.

Disable, quarantine, replacement, failed boot, and shutdown all retire the contribution generation and dispose acquired resources. A late initialization result from a retired generation must be disposed immediately. Disposal is idempotent, bounded, and failure-isolated; borrowed clients remain host-owned. Rebuild core registry views from live contribution snapshots because its current API has no unregister operation.

OTel and Sentry register distinct provider IDs for `observability`; reuse diagnostics’ fan-out. Langfuse and recording reuse the AI-trace fan-out after its isolation fix. **Payments select a provider per account; they never fan out money-moving calls.** Product-analytics guards run before vendor delivery.

Each vendor gets its own canonical manifest: tier-3, engine 1, version, integrity map, provider declaration, registration capability, and empty content hooks/fields. Support both host namespaces with the same publisher identity. Test the actual SDK ABIs: Tovu currently reports `0.1.0`, OM `1.0.0`; copying Recharts’ range would reject OM.

**Move list and consumer work**

Sources below are relative to the named repository/ref; destinations are under `packages/provider-plugins/src/<plugin-id>`.

| Plugin ID | Source → destination contents | Tovu update | Open Marketing update |
|---|---|---|---|
| `observability-opentelemetry` | Jini `49779de1:packages/diagnostics/src/observability/{opentelemetry,otel,config}.ts`; move OTLP configuration and span/exporter-specific types too | Replace package-subpath `require` with configured code-plugin selection; preserve request/DB/outbound instrumentation and store-close teardown | Supply selected port through server composition’s existing observability input; dispose on stop |
| `observability-sentry` | Same ref: `packages/diagnostics/src/observability/sentry.ts` | Replace lazy subpath selection; retain combined operation/error delivery | Add optional server plugin configuration; share diagnostics fan-out |
| `analytics-posthog` | Same ref: `packages/analytics/src/product/posthog.ts` | Replace adapter loading; retain opaque principal IDs and human telemetry consent | Add optional product-analytics wiring with explicit telemetry consent; default noop. Conversion/shareability consent is a different contract |
| `ai-trace-langfuse` | Tovu `388f42d2:ADS-memory/reports/cloud-runs/2026-10-25-ai-tracing/jini-patches/jini-ai-tracing.diff` → post-patch `packages/agent-runtime/src/ai-trace/langfuse.ts` | First land corrected neutral Jini patch, then add host wiring: this Tovu ref contains reports/patches only | Keep vendor sink/credentials in server; transport validated, bounded neutral trace events from agent |
| `payments-stripe` | Jini integration `59d2ba94:packages/capability-providers/src/adapters/stripe/**` | No direct Stripe import found; prepare optional commerce registration without activating the parked payment feature | No direct Stripe consumer found; add optional host binding/conformance, without inventing checkout features |

Keep neutral instrumentation, privacy guards, contracts, noop implementations, and fan-out in their existing Jini owners. Move SDK-specific lifecycle/mapping into the set. Preserve useful “why” comments, updating obsolete subpath and synchronous-loading explanations.

**Two ownership decisions belong in Coordinator’s first slice.**

Stripe currently implements `charge/getCharge/refund`, throws errors, and conflates pending refunds with refunded charges. It cannot satisfy [commerce’s payment contract](/Users/la/Programming/tovu-integration-clones/jini-om1025/packages/commerce/src/payments/contract/provider.ts), which requires idempotency, verified webhooks, evidence, and `unknown` outcomes. Record commerce as canonical and the legacy contract’s supersession/compatibility policy; reuse useful Stripe translation code without exposing another payments owner.

Record this owner decision’s narrow supersession of OM’s older “all vendor implementations in Agent Plugins” rule. Also account for [OM’s current agent flow](/Users/la/Programming/Open-Marketing/apps/agent/src/runtime/model.ts): it forwards text/tools but drops provider usage events. Full AI tracing requires neutral event transport; swapping a server sink alone cannot supply those missing fields.

**Required fixes and future regression tests**

IDs match the supplied reviews. Every row requires demonstrated failing/passing coverage during implementation.

| Review | Fix during the move | Regression evidence |
|---|---|---|
| Obs #1 | Select error code/name, then redact and cap the selected label | Credential-shaped `error.code` is absent from both OTel and Sentry output |
| Obs #2 | Invalidate pending consent approvals using the consent revision/generation, checked immediately before delivery | Deferred `true` resolving after revocation sends neither capture nor identify; exercise Tovu’s settings boundary |
| Obs #3 | Move vendor implementations and dependencies into code-plugin artifacts | Core/app boundary scan plus isolated plugin installation/loading; disabled provider imports nothing |
| Obs #4 | Extract `validateEventProps` into a platform-neutral owner reused by ingest and product analytics | Browser-target import of product analytics succeeds without Node shims |
| Langfuse #1 | Apply capture policy to model/run error content; retain safe codes/classes separately | Off/metadata/full modes handle errors containing secrets and email as specified |
| Langfuse #2 | Contain mapper, pricing, recorder, and error-callback failures; remove completed recorders in `finally` | Successful underlying start/emit/finish results survive each injected tracing failure |
| Langfuse #3 | Guard queued replay individually and contain initialization/reporting failures | Throwing replay produces no unhandled rejection; later queued events continue |
| Langfuse #4 | Preserve cache/reasoning counters and stop reasons through canonical event translation | Real normalizer → executor translation → lifecycle → recorded trace retains fields |
| Langfuse #5 | Accumulate usage snapshots; close turns on explicit request boundaries | Google usage-plus-text frame creates one turn; repeated snapshots do not inflate totals/cost |
| Langfuse #6 | Make generated tool identities request-scoped | Two requests using `call_0` produce distinct spans and correctly matched results |
| Langfuse #7 | Distinguish new requests from delayed post-usage tool emission | Anthropic’s next tool-only call gets its own turn; OpenAI delayed emission retains its correct parent |
| Langfuse #8 | Observe actual terminal transitions, including watchdog completion | Inactivity termination finishes the trace once and releases its recorder |
| Langfuse #9 | Isolate each sink’s record/flush/shutdown failures | A broken first sink cannot suppress healthy sinks or their cleanup |
| Langfuse #10 | Move SDK construction/loading into the Langfuse code plugin | Runtime core imports without Langfuse installed; configured plugin passes mapping/lifecycle tests |
| Langfuse #11 | Change owned mapper callbacks to object arguments | `{ agentId }` / `{ contextRef }` callbacks work through the real lifecycle decorator |
| Salvage `c2c5f04c` | Remove the eager email-sender export from `/forms`; expose a dedicated sender subpath and require a platform release containing `/mail/senders` for that consumer | Packed CMS `/forms` imports without platform; sender works with its declared minimum. This prevents an optional peer becoming mandatory for existing Forms users |
| Guard-zero: server/db | Raise server’s db peer minimum to the release introducing the owner-store exports | Packed server loads with its declared minimum db version |
| Guard-zero: consumers | Publish matching packages, then update Tovu server/db minima and lockfile together; update OM’s matching pins | Fresh packed installation loads owner-store and Tovu CLI help without missing exports |

Also retain regressions for the observability review’s already-fixed behavior: unknown-tool sanitization, independent Sentry traces, absence of global SDK takeover, isolated fan-out, and actual teardown registration.

**Build sequence — separate reviewable slices; estimates are engineer-days**

| Step | Deliverable | Depends on | Effort |
|---|---|---|---|
| 0 | Record ownership, manifest/factory contract, OM exceptions, Stripe contract disposition, acceptance cases | — | 0.5 |
| 1 | Provider capture/gate/claims extension, registry reuse, generation retirement and disposal | 0 | 1–1.5 |
| 2 | Single distribution build/pack pipeline and isolated artifact fixture | 0; finalize against 1 | 0.5–1 |
| 3 | Shared error-label fix, OTel/Sentry moves, preserved lifecycle tests | 1–2 | 0.5–1 |
| 4 | Neutral validator extraction, consent-race fix, PostHog move | 1–2 | 0.5–1 |
| 5a | Neutral AI event-boundary/identity/usage fixes | 0 | 1–2 |
| 5b | Lifecycle failure containment, watchdog cleanup, sink isolation/replay | 0; coordinate contracts with 5a | 0.5–1 |
| 6 | Langfuse plugin and mapping/artifact coverage | 1–2, 5a–5b | 0.5 |
| 7 | Stripe conversion to commerce contract and contract tests | 0–2 | 1–2 |
| 8 | Tovu and OM adoption, independently reviewable; include OM trace transport | Relevant provider slices | 1.5–2.5 |
| 9 | Salvage isolation, peer fixes, packed-install checks, coordinated release | Fixes can start after 0; release last | 0.5–1 |

Steps 1, 2, 5a, 5b, and release fixes can overlap after contracts settle; provider slices can then proceed independently. Rough total **9–15 engineer-days**, chiefly sensitive to Stripe conversion and OM trace transport.

Use patch changesets for the existing fixed `@jini-ai/*` group, including the distribution; raise required peer minima to the actual release containing new exports. Publish Jini before consumer lockfile changes. Future validation includes port suites, both host bindings, isolated packed installs without vendor SDKs, teardown races, and the requested CCN ≤10 check.

Main risks are boot-order cycles, late initialization after disable, SDK bundle/runtime resolution, cross-process consent freshness, and incorrectly treating Stripe’s old outcomes as commerce evidence. Keep artifact limits intact and test both hosts against identical plugin bytes.

Out of scope: new checkout/UI features, payment-ledger migrations, other vendor adapters, a new plugin runtime, tier-2 sandboxing, Langfuse API-generation upgrades, live vendor calls, and deployment. Evidence came from source/ref reads; MCP graph tools were unavailable and the available Jini graph predates these October changes. Next assignee: Coordinator for step 0, then test-first implementation slices.
