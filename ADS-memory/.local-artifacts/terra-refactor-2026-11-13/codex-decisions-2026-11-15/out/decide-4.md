Software Architect(Direct): Recommend **KEEP, CONSOLIDATE/SPLIT, SPLIT, SPLIT**, respectively. No files were edited; no tests or builds were run. C3b was inspected at `f5d9f84` through its existing local ref. Contract changes below are proposals.

**1. `server/error-mapping`**

**RECOMMENDATION:** Keep `respondToApiError` as Tovu’s shared HTTP policy adapter; extract nothing further now.

**WHY**

- Jini already owns the reusable behavior: error construction, default status mapping, and envelope serialization. Tovu’s helper calls those owners. See [respond.ts:3](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/error-mapping/respond.ts:3), [statusForError:59](/Users/la/Programming/jini-terra-base/packages/core/src/contracts/server/api-error.ts:59), and [sendApiError:19](/Users/la/Programming/jini-terra-base/packages/http-kit/src/response.ts:19).
- Its remaining responsibility is meaningful host policy: read Tovu’s established correlation ID and omit it when absent. Request tracking creates that context separately. See [respond.ts:13](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/error-mapping/respond.ts:13) and [observability-middleware.ts:81](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/inbound/shared/observability-middleware.ts:81).
- Folding it into analytics would assign a shared transport policy to a feature route. The recorded migration inventory spans many route families, although each still needs individual contract review. See [INFO.md:73](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/error-mapping/INFO.md:73).
- Express is **not itself a reason extraction is impossible**: Jini already accepts a structural `ApiErrorResponseWriter`. The reason to retain this helper is its host convention and the absence of additional unowned generic behavior. See [response.ts:8](/Users/la/Programming/jini-terra-base/packages/http-kit/src/response.ts:8).

**CONCRETE SHAPE:** Keep Tovu’s existing `respondToApiError({ res, code, message }, { details })`. Routes supply reviewed copy and safe details; request middleware supplies correlation context. Import `createApiError` from `@jini-ai/protocol`, `statusForError` directly from `@jini-ai/core/contracts/server`, and `sendApiError` from `@jini-ai/http-kit`. Add no Jini factory, compatibility export, or replacement wrapper.

**RISKS / WHAT WOULD CHANGE THE ANSWER:** A second host needing configurable correlation extraction could justify extending the existing HTTP response owner. Do not automatically apply this JSON policy to OAuth, MCP, or streaming responses; the current policy explicitly preserves their protocol formats. See [INFO.md:85](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/error-mapping/INFO.md:85).

**CONFIDENCE:** High.

**2. `contracts/core/events`**

**RECOMMENDATION:** Make `@jini-ai/core/contracts/events` the single shared contract owner, reconcile its contract with infra’s stronger lease semantics, and move stateful implementations to infra.

**WHY**

- C3b fixes contract placement but preserves the old positional enqueue and implicit lease. Infra’s contract explicitly passes `claimLeaseMs`, supports generic envelopes, and carries optional claim tokens. These are behavioral differences, not naming differences. See [core events ports:111](/Users/la/Programming/jini-terra-base/packages/core/src/contracts/events/ports.ts:111) and [infra ports.ts:3](/Users/la/Programming/jini-terra-base/packages/infra/src/events/outbox/ports.ts:3).
- Tovu currently reconciles two Jini contracts itself, including discarding the worker’s per-call lease argument. Every future host should not inherit this translation obligation. See [jini-outbox-adapter.ts:18](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/contracts/core/events/jini-outbox-adapter.ts:18).
- Lease duration participates in correctness: infra validates that it exceeds the full batch timeout budget. Adopting the old core shape verbatim would leave that agreement implicit. See [policy.ts:18](/Users/la/Programming/jini-terra-base/packages/infra/src/events/outbox/policy.ts:18).
- The in-memory bus and outbox own mutable subscriptions and delivery state. They belong with reusable infrastructure implementations, outside pure core and outside CMS-specific ownership. See [memory-bus.ts:22](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/contracts/core/events/memory-bus.ts:22).
- Tovu genuinely owns event-to-policy composition and process selection. Its retry table combines forms and webhook behavior; its serving root starts delivery after app construction. See [outbox-retry-policies.ts:17](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/contracts/core/events/outbox-retry-policies.ts:17) and [serving-app.ts:75](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/serving-app.ts:75).

**CONCRETE SHAPE:**

- **`@jini-ai/core/contracts/events`:** Own `DomainEvent`, `EventPublisher`, `EventBusPort`, generic `OutboxRecord<Event>`, `OutboxClaim`, `OutboxPort<Event>`, and shared `OutboxRetryPolicy` / `OutboxRetryPolicyResolver`. Normalize methods to `(requiredArgs, optionalArgs = {})`; enqueue and publish receive `{ event }`. Claims explicitly receive `{ batchSize, nowIso, claimLeaseMs }`; settlement preserves optional fencing receipts.
- Preserve required `DomainEvent.workspaceId`. Keep the worker generic over a smaller envelope so non-CMS hosts need not manufacture CMS fields. The current tenant requirement is explicit. See [core events ports:31](/Users/la/Programming/jini-terra-base/packages/core/src/contracts/events/ports.ts:31).
- **`@jini-ai/infra/events/outbox`:** Own `processOutbox`, `startOutboxDrainer`, `toEnqueueOnlyOutbox`, policies/defaults, scheduling, and `InMemoryOutbox`. Put `InMemoryEventBus` in an infra events leaf. These implementations consume core contracts directly.
- **Host wiring:** Supply durable storage, subscribed bus, clock, scheduler, randomness, safe logging/tracing, and the event-specific retry resolver. Update Tovu’s SQL adapter to honor the passed lease while preserving its existing row format and default behavior. Its current lease is constructor-bound. See [outbox-repo.ts:78](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/platform/db/repos/outbox-repo.ts:78).
- **Tovu retains:** Schema/repository binding, subscriber registration, retry-policy selection, observability decoration, delivery-process ownership, and shutdown orchestration. Delete translation adapters and forwarding exports after consumers import their actual owners.

**RISKS / WHAT WOULD CHANGE THE ANSWER:** This requires an explicit amendment to C3’s “verbatim” contract decision before implementation. Preserve envelope contents, idempotent enqueue, atomic claims, retry decisions, and late-outcome behavior. Optional claim tokens do not provide the stronger guarantees of the separate `FencedOutboxPort` protocol; retain that distinction. Existing unfenced late-write risk is documented in [worker.ts:150](/Users/la/Programming/jini-terra-base/packages/infra/src/events/outbox/worker.ts:150). Land contract/implementation reconciliation before the consumer repoint.

**CONFIDENCE:** High on ownership; medium on the exact compatibility migration.

**3. `platform/db/migration`**

**RECOMMENDATION:** Keep the schema manifest in Tovu, but extract reusable table-copy ordering into Jini’s existing database-transfer owner.

**WHY**

- The manifest introspects Tovu’s concrete Drizzle schema and records product judgments about particular columns. Those facts cannot become a neutral platform schema. See [manifest.ts:66](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/platform/db/migration/manifest.ts:66) and [REVIEWED_JSON_COLUMNS:390](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/platform/db/migration/manifest.ts:390).
- `topologicalTableCopyOrder` is already separated from schema discovery and runs over supplied names and edges. Its deterministic ordering and cycle handling are reusable behavior. See [manifest.ts:736](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/platform/db/migration/manifest.ts:736).
- Jini already owns transfer metadata, copying, and sequence-reseeding behavior. Extend that owner rather than creating another migration subsystem. See [transfer/index.ts:1](/Users/la/Programming/jini-terra-base/packages/db/src/transfer/index.ts:1) and [internal-ddl.ts:65](/Users/la/Programming/jini-terra-base/packages/db/src/transfer/internal-ddl.ts:65).
- The host already injects its schema, order, and derived-object exclusions into transfer composition. That is the correct boundary to preserve. See [database-transfer-adapters.ts:14](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/composition/database-transfer-adapters.ts:14).

**CONCRETE SHAPE:** Extend **`@jini-ai/db/transfer`** with an implementation-backed `topologicalTableCopyOrder({ tableNames, dependencies }, {})`, `TableCopyDependency`, and `TableCopyOrderCycleError`. Accept plain metadata, without Drizzle types or a new dependency.

Tovu keeps `collectCoreTables`, `collectForeignKeyEdges`, `computeCoreTableCopyOrder`, reviewed column registries, naming conventions, and `DERIVED_OBJECTS`. Its `computeCoreTableCopyOrder` genuinely adapts the schema into the shared algorithm; it is not a forwarding shell. The host supplies its trusted catalog and rebuild/exclusion policy.

Reuse existing `reseedIdentitySql` for transfer SQL rather than introducing a second public reseeding owner. Do not create a speculative plugin-migration module: the manifest describes that classifier as preparation for a future path. See [manifest.ts:28](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/platform/db/migration/manifest.ts:28).

**RISKS / WHAT WOULD CHANGE THE ANSWER:** Preserve alphabetical tie-breaking, duplicate-edge handling, cycle rejection, and self-reference treatment. Table ordering does not solve row ordering inside self-referencing tables. See [manifest.ts:745](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/platform/db/migration/manifest.ts:745). Also, rejecting an oversized existing identifier and shortening a generated identifier are different contracts; do not substitute one for the other. “No production importer” alone does not justify deleting schema-safety assertions or their supporting behavior.

**CONFIDENCE:** High.

**4. `server/runtime/services`**

**RECOMMENDATION:** Split both services: move reusable MCP use cases into `@jini-ai/mcp`; keep Tovu’s response contracts, copy, authorization, and composition.

**WHY**

- Probe session handling is reusable: connect, list tools, apply the existing trust-description owner, classify failures safely, and close in `finally`. See [external-mcp-probe.ts:170](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/services/external-mcp-probe.ts:170).
- Saved-target resolution already calls Jini’s hosted-store implementation through Tovu bindings. Moving orchestration should extend that owner rather than duplicate credential resolution. See [external-mcp-store.ts:41](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/features/external-mcp/external-mcp-store.ts:41).
- Admissions reading is general federation behavior, including connections beyond hosted HTTP. Its essential invariant is distinguishing an unavailable report from an available empty report. See [external-mcp-admissions.ts:23](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/services/external-mcp-admissions.ts:23).
- Current services contain host policy: legacy `AGENT_DAEMON_UNAVAILABLE`, Tovu response bodies, settings links, and credential copy. Those should not define every host’s API. See [admissions.ts:13](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/services/external-mcp-admissions.ts:13) and [probe.ts:193](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/services/external-mcp-probe.ts:193).

**CONCRETE SHAPE:**

- **`@jini-ai/mcp/federation/hosted`:** Export `probeExternalMcpServer`, `ExternalMcpProbePorts`, and `ExternalMcpProbeResult`, implemented in `hosted/probe.ts`. Reuse the package’s existing store/auth/trust implementations. Return success data or typed failure categories, without HTTP statuses, response bodies, or settings URLs.
- **`@jini-ai/mcp/federation`:** Export `readFederationAdmissions`, `FederationAdmissionsPorts`, and `FederationAdmissionsResult`, implemented in `federation/admissions.ts`. Receive the existing runtime’s wait/read capabilities, a timeout policy, and a safe diagnostic sink. Construct no second runtime or admission store.
- **Existing core hosted contracts:** Continue using `ExternalMcpServerRepoPort` and `ExternalMcpOAuthTokenResolverPort`. Add a typed configuration-failure discriminator at that shared boundary; extend the existing resolver to produce it. Do not continue classifying reauthorization through English substring matching. That coupling currently exists at [probe.ts:94](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/server/runtime/services/external-mcp-probe.ts:94).
- **Host wiring and retained code:** Bind repository, sealer/vault capabilities, OAuth resolver, HTTP session factory, clock, and safe diagnostics. Keep workspace/permission checks, rate limits, legacy codes/statuses, copy, links, tool metadata, and runtime activation policy in Tovu. Remove forwarding service files once callers use the actual owners.

**RISKS / WHAT WOULD CHANGE THE ANSWER:** The available pilot record states “owner approval” but does not supply a durable technical reason for rejection. Coordinator should record this split as the proposed resolution of that hold. Preserve hosted-only probing, no remote tool invocation or registry mutation, cleanup, secret-free outcomes, and OAuth-refresh side-effect classification. The current tool contracts explicitly classify probe and admissions startup as potentially mutating durable state. See [operations-tools.ts:40](/Users/la/Programming/tovu-codex-trial-terra/apps/website/src/features/external-mcp/operations-tools.ts:40).

**CONFIDENCE:** Medium, because the earlier rejection’s rationale is unavailable.

Keep Tovu’s small error helper because it applies Tovu’s request-tracking policy.  
Give every product one shared event contract, with reusable delivery machinery in Jini.  
Keep Tovu’s database map, while sharing the rules that determine safe copying order.  
Share MCP checking and reporting in Jini; let each product control access and user-facing responses.
