# Tovu CMS: User-Friction Architecture Addendum

> **Swarm Consensus Output** — Claude Opus 4.6 + Codex GPT-5.4, 2 debate rounds, 2026-03-31
> Gemini 3.1 Pro Preview unavailable (capacity exhausted). 2-model debate with 90%+ convergence.
> This document is an addendum to `tovu-architecture.md`, designing the user-friction-solving layer.

---

## 1. Architecture Critique

### Structural Flaws in Base Architecture

**`@tovu/api` violates hexagonal architecture.** It depends on "all core packages," making it the fattest coupling point. Routes are transport concerns belonging in the adapter layer. Core should expose `Command`/`Query` objects and handler contracts. HTTP, GraphQL, and other transport adapters map routes → commands. **Action:** Demote `@tovu/api` to adapter status. *(Both models unanimous)*

**`DatabasePort` is a god-interface.** Mixing DDL (`ensureTable`, `migrateSchema`), CRUD (`insert`, `findById`, etc.), and transaction control into one port forces every adapter to implement everything. **Action:** Split into `SchemaPort` (DDL/migration), `RecordPort` (typed CRUD), `TransactionPort` (isolation control). Enables read-replica routing and separate migration tooling. *(Both models unanimous)*

**Global hook system recreates WordPress's worst pattern.** String-based hooks like `hooks.filter.page.head` with no type safety, no ordering guarantees, no resource limits — this is exactly what causes WordPress complaint #6 (plugin conflicts). **Action:** Replace with typed extension points (see Cross-Cutting Concerns §9). *(Both models unanimous)*

**Plugin sandbox is aspirational, not architectural.** "Scoped API" is described but no isolation boundary is defined. In-process TypeScript shares the event loop, heap, and I/O. **Action:** Define `PluginRuntimePort` with real isolation: V8 isolates, worker threads, or WASM sandboxes. Capability tokens, timeouts, memory/CPU ceilings, network/filesystem denial by default. *(Both models unanimous)*

**`@tovu/ai` is over-centralized.** "6-layer context assembler, memory, tool registry" is three bounded contexts in one package. `ai.registerTool()` should not auto-publish to MCP/A2A/AG-UI without policy gates. **Action:** Split into `@tovu/ai-core` (LLMPort, tool registry, prompt assembly) and `@tovu/ai-memory` (working/episodic/semantic behind MemoryPort). Protocol bridging stays in `@tovu/protocol`. *(Both models unanimous)*

**No control-plane/runtime split.** Without a recovery shell that boots independently of extensions/themes, "core update locked me out" (complaint #3) still exists in Tovu. **Action:** Kernel must distinguish control plane (admin, management, recovery) from runtime plane (content delivery, extension execution). See §9. *(Both models unanimous)*

**`@tovu/theme` is too legacy a name and concept.** The scope includes design tokens, responsive validation, slot contracts, and route-template resolution — far beyond "themes." **Action:** Rename to `@tovu/presentation`, decouple from `@tovu/content` via `ContentProjectionPort` (read-only view contract). *(Codex proposed, Claude conceded)*

### Missing Primitives

| Primitive | Why Required | Complaints Addressed |
|-----------|-------------|---------------------|
| `EventLogPort` + `EventBusPort` | Every friction fix needs event propagation. Log is source of truth, bus is distribution. | Cross-cutting |
| `SnapshotPort` | Rollback, preview, migration all need point-in-time state capture | #1, #3, #14, UF-01, UF-15 |
| `HealthCheckPort` | Canary rollout, environment scanning, checkout verification | #1, #9, UF-01, UF-09 |
| `CachePort` | Declarative caching to solve complaint #12 (caching complexity) | #12, #13 |
| `JobPort` | Background processing for security, media, AI, email, imports | #9, UF-09 |
| `EmailPort` | Transactional email with SPF/DKIM/DMARC | WP structural gap |
| `ConfigPort` + `SecretsPort` | Typed config with env overrides; secrets that never leak to logs/exports | Cross-cutting |
| `PolicyPort<C>` → resolved as shared `PolicyDecision` type | Consistent policy evaluation pattern across domains | Cross-cutting |

### Over-Engineering in Section 13

Section 13 names 32 components (16 ports + 16 modules) without implementation. Many share cross-cutting concerns and should be consolidated. The 5 capability tracks are useful as **execution workstreams for project planning**, but the **architectural organization** should follow 3 domains:

1. **Change Safety** — updates, conflicts, rollback, environment compat, content integrity (UF-01,02,03,08,09)
2. **Extension Governance** — trust, security, provenance, cost (UF-04,11,12)
3. **Authoring Experience** — templates, collaboration, notifications, quality, writer mode (UF-07,10,14,16)

Performance (UF-05,06) and Platform Ops (UF-13,15) are cross-cutting concerns, not standalone domains.

*(Claude proposed 3-domain consolidation, Codex agreed to use as top-level story with tracks as execution workstreams underneath)*

### Revised Package Map

```
@tovu/kernel          — IoC, lifecycle, service registry (imports NOTHING)
@tovu/change          — Shared types: ChangeEnvelope, SnapshotRef, PolicyDecision, HealthProbe
@tovu/content         — Schema registry, CRUD, relations, validation
@tovu/auth            — RBAC, permissions, multi-tenant sessions
@tovu/media           — Upload/transform + MediaCatalogPort (folders, tags, smart collections)
@tovu/presentation    — Design tokens, template versioning, slot contracts, responsive validation
@tovu/plugin          — Loader, isolated runtime, SDK, dependency resolution
@tovu/ai-core         — LLMPort, tool registry, prompt assembly
@tovu/ai-memory       — Working/episodic/semantic memory behind MemoryPort
@tovu/protocol        — MCP/A2A/AG-UI abstractions
@tovu/reliability     — Change safety, incidents, recovery, content integrity
@tovu/security        — Extension trust, provenance, registry governance
@tovu/observability   — Perf tracing, attribution, budgets, cache, env compat
@tovu/authoring       — Collaboration, signals, writer mode, content quality
@tovu/commerce        — Catalog, cart, checkout, orders, payments, shipping, tax
@tovu/scheduler       — Job queue, cron, worker leasing
@tovu/email           — Transactional email, domain verification, bounce tracking
@tovu/i18n            — Locale management, variant linking, translation workflow
@tovu/ops             — Migration, WP import, preview envs, cost control, delivery
```

**Dependency rules (unchanged pattern):**
```
kernel (imports NOTHING)
  ↓
change (shared types only, no logic — depends on kernel types only)
  ↓
content, auth, media, presentation, plugin, ai-core, ai-memory, protocol,
reliability, security, observability, authoring, commerce, scheduler,
email, i18n, ops
  ↓
adapters (http-hono, db-postgres, stripe-payment, sendgrid-email, etc.)
```

---

## 2. Track 1: Reliability Guardrails — Change Safety Domain

**Solves complaints:** #1 (4.775), #3 (3.875), #4 (3.762), #6 (3.55), #7 (3.502), #16 (2.899)
**UF families:** UF-01, UF-02, UF-03, UF-08

### Port Interfaces

```typescript
// Unified facade for callers — internally decomposed
interface ChangeSafetyPort {
  propose(change: ChangeEnvelope): Promise<ChangeTicket>;
  preflight(ticketId: string): Promise<PreflightReport>;
  execute(ticketId: string, strategy: RolloutStrategy): Promise<Execution>;
  rollback(executionId: string): Promise<RollbackResult>;
}

// Internal services (not exposed as top-level ports to most consumers)
interface RecoveryShellPort {
  boot(siteId: string, mode: 'safe' | 'minimal'): Promise<RecoverySession>;
  listExtensions(sessionId: string): Promise<ExtensionStatus[]>;
  disable(sessionId: string, extensionId: string): Promise<void>;
  restoreSnapshot(sessionId: string, ref: SnapshotRef): Promise<void>;
}

interface IncidentPort {
  report(signal: ErrorSignal): Promise<IncidentId>;
  fingerprint(incidentId: string): Promise<IncidentFingerprint>;
  analyze(incidentId: string): Promise<RootCauseReport>;
  remediate(incidentId: string): Promise<RemediationPlan>;
}

interface ExtensionLifecyclePort {
  graph(siteId: string): Promise<DependencyGraph>;
  simulate(change: ChangeEnvelope): Promise<CompatibilityReport>;
  quarantine(extensionId: string, reason: QuarantineReason): Promise<void>;
  healthCheck(extensionId: string): Promise<ExtensionHealth>;
}

interface ContentIntegrityPort {
  save(mutation: ContentMutation): Promise<RevisionRef>;
  history(entityId: string): Promise<RevisionTimeline>;
  recover(entityId: string, targetRevision: string): Promise<RecoveryResult>;
  validate(mutation: ContentMutation): Promise<ValidationReport>;
}

interface SnapshotPort {
  capture(scope: SnapshotScope): Promise<SnapshotRef>;
  restore(ref: SnapshotRef, target: RestoreTarget): Promise<RestoreResult>;
  diff(a: SnapshotRef, b: SnapshotRef): Promise<StateDiff>;
}
```

### Module Layout
`@tovu/reliability` — depends on kernel, change. Sub-modules: `change-gate` (facade), `snapshot-engine`, `incident-analyzer`, `extension-graph`, `content-revisions`, `recovery-shell`, `health-probes`.

### Behavioral Design
1. **Any site-mutating operation** (plugin install/update, core update, template publish, schema change) creates a `ChangeEnvelope`.
2. `ChangeSafetyPort.preflight()` runs the pipeline: snapshot current state → resolve dependency graph → check environment compatibility → simulate extension compatibility → evaluate performance budget → produce go/no-go report with AI-generated risk summary.
3. On approval, `execute()` applies via configured `RolloutStrategy` (immediate, canary %, blue-green). During canary, health probes run against the changed subset.
4. On failure at any stage, `rollback()` restores from pre-change snapshot. Failed change logged as incident.
5. `RecoveryShellPort` boots WITHOUT loading extensions or themes — just kernel + auth + recovery UI. Prevents complaint #3.
6. Content writes through `ContentIntegrityPort`: document-centric API (save/history/recover/validate) with transactional mutation sessions internally for compound operations. Failed saves produce recoverable drafts, not silent corruption.

*(Consensus: unified facade externally with internal decomposition. Document-centric API matching how editors think, transactional sessions as internal implementation. Both models agreed.)*

### AI-Native Angle
- Deterministic fingerprints first; AI clusters incidents, writes human-readable blame summaries from release diffs + traces + prior incidents.
- Pre-flight reports include AI-generated plain-English risk summaries ("Plugin X v2.3 conflicts with Theme Y because both modify the `page.head` extension point with incompatible CSS injection").
- Remediation plans contextualized to user role (admin gets "disable Plugin X", developer gets the stack trace and fix suggestions).

---

## 3. Track 2: Security and Trust — Extension Governance Domain

**Solves complaints:** #5 (3.762), #22 (subscription fatigue), #24 (governance crisis)
**UF families:** UF-04, UF-11

### Port Interfaces

```typescript
interface ExtensionTrustPort {
  scan(artifact: ExtensionArtifact): Promise<SecurityReport>;
  score(extensionId: string): Promise<TrustScore>;
  verifyIntegrity(siteId: string): Promise<IntegrityReport>;
  quarantineOnThreat(extensionId: string, vuln: VulnerabilityRef): Promise<void>;
}

interface ProvenancePort {
  record(event: AuditEvent): Promise<AuditReceipt>;
  timeline(resource: ResourceRef, range?: TimeRange): Promise<AuditTimeline>;
  verify(receiptId: string): Promise<VerificationResult>;
  export(query: AuditQuery): Promise<AuditExport>;
}

interface RegistryPort {
  resolve(request: PackageRequest): Promise<PackageResolution>;
  publish(artifact: ExtensionArtifact, attestation: Attestation): Promise<void>;
  revoke(artifactId: string, reason: string): Promise<void>;
  channels(): Promise<RegistryChannel[]>;
}

interface VulnIntelPort {
  check(sbom: SBOM): Promise<VulnMatch[]>;
  subscribe(extensionId: string): Promise<VulnFeed>;
}
```

### Module Layout
`@tovu/security` — depends on kernel, change, plugin. Sub-modules: `trust-scorer`, `artifact-scanner`, `provenance-ledger`, `registry-client`, `vuln-intel-adapter`, `security-policy-engine`.

### Behavioral Design
1. Extension install/update triggers scan: static analysis of declared permissions, dependency audit, known vulnerability check via `VulnIntelPort`, capability diff from prior version.
2. Trust score = composite of: author reputation, code signature validity, vulnerability history, permission scope, community usage.
3. Registry is federated: `RegistryPort` supports multiple channels (Tovu official, enterprise private, community). Sites configure trust policies per channel.
4. `ProvenancePort` creates append-only audit trail with cryptographically verifiable receipts. Suitable for audits, client handoffs, regulated workflows.
5. Runtime: plugins execute within isolation boundaries with capability enforcement. Undeclared operations → security event → optional quarantine.

### AI-Native Angle
- Human-readable security summaries: "This plugin requests filesystem write + outbound HTTP — unusual for a typography plugin."
- Permission diff on update: "v2.0 now requests `auth.read` which v1.x did not need."
- Anomaly detection on runtime behavior. AI explains, never enforces.

---

## 4. Track 3: Performance and Scale

**Solves complaints:** #2 (4.18), #9 (3.438), #11 (3.348), #12 (3.2), #13 (3.052)
**UF families:** UF-05, UF-06, UF-09

### Port Interfaces

```typescript
interface PerfObservabilityPort {
  trace(request: TraceContext): Promise<TraceSpan>;
  attribute(window: TimeWindow): Promise<AttributionReport>;
  budget(scope: BudgetScope): Promise<BudgetStatus>;
  setBudget(scope: BudgetScope, limits: PerfLimits): Promise<void>;
}

interface CachePort {
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, value: T, policy: CachePolicy): Promise<void>;
  invalidate(tags: string[]): Promise<void>;
}

interface EnvironmentCompatPort {
  scan(target: RuntimeEnvironment): Promise<CompatReport>;
  gate(change: ChangeEnvelope): Promise<PolicyDecision>;
  requirements(): Promise<RuntimeRequirements>;
}

interface CheckoutHealthPort {
  syntheticTest(siteId: string): Promise<CheckoutTestResult>;
  preflight(change: ChangeEnvelope): Promise<CheckoutImpact>;
  monitor(siteId: string): Promise<CheckoutMetrics>;
}
```

### Module Layout
`@tovu/observability` — depends on kernel, change. Sub-modules: `trace-collector`, `attribution-engine`, `budget-enforcer`, `cache-manager`, `env-scanner`, `checkout-harness`.

### Behavioral Design
1. Every request, job, and extension invocation produces attributed spans: route, template, content query, extension, media transform.
2. Cache is declarative and tag-based. Modules declare invalidation tags. No user-managed cache plugins. Adapter swappable (in-memory, Redis, CDN edge).
3. Performance budgets per scope (route, template, extension). Breaches flagged in preflight.
4. Environment scanner runs before upgrades: Node version, DB version, memory, storage latency, search engine. Clear go/no-go.
5. Commerce changes run `CheckoutHealthPort` synthetic tests exercising full purchase flow.

### AI-Native Angle
- Trace attribution: "Your homepage is slow because Plugin X's database query takes 340ms — here's the query and a suggested index."
- Cache policy suggestions from real traffic patterns.
- Release-to-regression blame summaries.

---

## 5. Track 4: Authoring and UX — Authoring Experience Domain

**Solves complaints:** #8 (3.46), #10 (3.425), #15 (2.988), #18 (2.798), #19 (2.65), #20, #21
**UF families:** UF-07, UF-10, UF-14, UF-16

### Port Interfaces

```typescript
interface TemplateLifecyclePort {
  versions(templateId: string): Promise<TemplateVersion[]>;
  preview(change: TemplateChange): Promise<PreviewResult>;
  publish(templateId: string, version: string): Promise<PublishResult>;
  revert(templateId: string, toVersion: string): Promise<RevertResult>;
  explain(routeId: string): Promise<RouteExplanation>;
}

interface CollaborationPort {
  join(documentId: string, actor: ActorRef): Promise<CollabSession>;
  applyOp(sessionId: string, operation: EditOp): Promise<OpResult>;
  presence(documentId: string): Promise<PresenceState>;
  resolve(documentId: string, conflictId: string, resolution: Resolution): Promise<void>;
}

interface AdminSignalPort {
  emit(signal: AdminSignal): Promise<void>;
  inbox(actorId: string, filters?: SignalFilter): Promise<SignalPage>;
  dismiss(signalId: string): Promise<void>;
  configure(actorId: string, preferences: NotificationPrefs): Promise<void>;
}

interface WriterModePort {
  enter(actorId: string, contentType: string): Promise<WriterWorkspace>;
  suggest(workspaceId: string, context: WriterContext): Promise<Suggestion[]>;
  publish(workspaceId: string): Promise<PublishResult>;
}

interface ContentQualityPort {
  lint(contentId: string): Promise<QualityReport>;
  a11yCheck(contentId: string): Promise<A11yReport>;
  mediaInspect(assetId: string): Promise<MediaQualityReport>;
  autoFix(contentId: string, issues: string[]): Promise<FixResult>;
}

interface PresentationSchemaPort {
  tokens(siteId: string): Promise<DesignTokens>;
  validate(templateId: string): Promise<ResponsiveReport>;
}
```

### Module Layout
`@tovu/authoring` — depends on kernel, content, presentation. Sub-modules: `template-manager`, `collab-engine`, `signal-center`, `writer-workspace`, `quality-checker`.

### Behavioral Design
1. Templates are versioned artifacts with route impact previews, visual diffs, responsive checks, and one-click revert. Route explainer answers "why does /about render this way?"
2. **Collaboration: hybrid approach** — CRDT for rich text blocks (real-time co-editing), optimistic concurrency with semantic merge for structured fields, short-lived locks only for destructive operations (publish, delete, schema change). *(Both models unanimous on hybrid)*
3. Writer Mode strips CMS to: content editor, media picker, publish button, AI assist. Agencies configure per role for client handoff. Addresses "Simplicity Exit" vector.
4. Admin signals replace WordPress's chaotic notice system. Single prioritized inbox with severity, source attribution, actionable CTAs, dismissal tracking. Policies control which signals surface for which roles.
5. Content quality: inline a11y checks, readability, SEO basics, media optimization. AI suggests fixes, can auto-apply with confirmation.

### AI-Native Angle
- Route explainer generates natural language descriptions of template resolution.
- Writer mode AI assists with tone, structure, SEO, content gaps.
- Conflict resolution: AI suggests merge strategies.
- Quality auto-fix: AI rewrites alt text, adjusts heading hierarchy, suggests image crops.
- Live contextual docs generated from actual schema, extensions, and routes — reduces documentation rot (#21).

---

## 6. Track 5: Platform Operations

**Solves complaints:** #14 (2.988), #22 (subscription fatigue), #23 (agency handoff), #25 (DX fragmentation)
**UF families:** UF-12, UF-13, UF-15

### Port Interfaces

```typescript
interface MigrationPort {
  export(siteId: string, profile: ExportProfile): Promise<PortableBundle>;
  import(bundle: PortableBundle, target: ImportTarget): Promise<ImportPlan>;
  dryRun(planId: string): Promise<DryRunReport>;
  execute(planId: string): Promise<ImportResult>;
  redirectMap(planId: string): Promise<RedirectMapping>;
}

interface WpImportPort {
  connect(source: WpConnectionConfig): Promise<WpSiteInventory>;
  analyze(inventory: WpSiteInventory): Promise<MigrationAssessment>;
  mapContent(inventory: WpSiteInventory): Promise<ContentMapping>;
  execute(mapping: ContentMapping): Promise<WpImportResult>;
}

interface DeliveryPort {
  createPreview(source: ChangeEnvelope): Promise<PreviewEnvironment>;
  diff(envA: string, envB: string): Promise<EnvironmentDiff>;
  promote(previewId: string, target: string): Promise<DeployResult>;
  teardown(previewId: string): Promise<void>;
}

interface CostControlPort {
  usage(period: CostPeriod): Promise<UsageReport>;
  forecast(period: CostPeriod): Promise<CostForecast>;
  budget(policy: BudgetPolicy): Promise<BudgetStatus>;
  attributeByExtension(period: CostPeriod): Promise<ExtensionCostBreakdown>;
}
```

### Module Layout
`@tovu/ops` — depends on kernel, content, media, change. Sub-modules: `portable-bundle`, `wp-importer`, `preview-manager`, `cost-meter`, `delivery-pipeline`.

### Behavioral Design
1. **PortableBundle** is canonical export format: structured JSON with content trees, relation graphs, media manifests, redirect maps, locale variants, extension dependencies, environment requirements. No serialized PHP. No hardcoded URLs. All references are stable IDs.
2. **WP Import** is an anti-corruption adapter: reads WP database/REST/WXR → maps to Tovu content types, extracts shortcodes to blocks, maps Elementor/Gutenberg serialized content to structured AST, generates SEO redirect map, dry-run report before execution.
3. Preview environments are ephemeral copies of site state. Parity diff shows exactly what's different from production. Promote applies diff atomically.
4. Cost control attributes spend by dimension: infrastructure, extension licenses, AI tokens, storage, bandwidth. Budget alerts fire through AdminSignalPort.

### AI-Native Angle
- WP Import: AI maps WordPress plugins to Tovu equivalents ("Yoast SEO → Tovu's content quality linter covers 80%").
- SEO redirect validation: identifies chains and 404 risks.
- Cost anomaly detection: "Your AI spend doubled — Plugin X calls LLM per page view."

---

## 7. Track 6: Ecommerce

**Solves complaints:** #2 (4.18), #22 (subscription fatigue)
**UF families:** UF-06

**Design position (consensus):** 80/20 commerce core, not WooCommerce clone. Ship opinionated primitives for catalog, cart, checkout, orders, payments. Complex B2B, marketplace, subscriptions are plugin territory.

### Port Interfaces

```typescript
interface CatalogPort {
  create(product: ProductDraft): Promise<ProductRecord>;
  update(productId: string, changes: ProductPatch): Promise<ProductRecord>;
  query(filters: CatalogQuery): Promise<CatalogPage>;
  variants(productId: string): Promise<VariantRecord[]>;
}

interface CartPort {
  create(sessionId: string): Promise<Cart>;
  addItem(cartId: string, item: CartItem): Promise<Cart>;
  removeItem(cartId: string, lineId: string): Promise<Cart>;
  applyPromotion(cartId: string, code: string): Promise<Cart>;
}

interface CheckoutPort {
  begin(cartId: string): Promise<CheckoutSession>;
  setShipping(sessionId: string, address: Address, method: string): Promise<CheckoutSession>;
  calculateTax(sessionId: string): Promise<TaxBreakdown>;
  confirm(sessionId: string, paymentMethod: string): Promise<OrderRef>;
}

interface PaymentGatewayPort {
  createIntent(amount: Money, metadata: PaymentMeta): Promise<PaymentIntent>;
  capture(intentId: string): Promise<CaptureResult>;
  refund(intentId: string, amount?: Money): Promise<RefundResult>;
  webhookHandler(event: WebhookEvent): Promise<void>;
}

interface InventoryPort {
  check(skuId: string): Promise<StockLevel>;
  reserve(skuId: string, quantity: number, ttl: number): Promise<ReservationRef>;
  commit(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;
}

interface ShippingPort {
  rates(origin: Address, destination: Address, items: ShipmentItem[]): Promise<ShippingRate[]>;
  purchase(rateId: string): Promise<Shipment>;
  track(shipmentId: string): Promise<TrackingInfo>;
}

interface TaxPort {
  calculate(lineItems: TaxableItem[], destination: Address): Promise<TaxResult>;
  commit(orderId: string): Promise<TaxCommit>;
  void(orderId: string): Promise<void>;
}

interface OrderPort {
  place(checkout: ConfirmedCheckout): Promise<Order>;
  get(orderId: string): Promise<Order>;
  list(query: OrderQuery): Promise<OrderPage>;
  refund(orderId: string, items: RefundItem[]): Promise<RefundResult>;
}
```

### Module Layout
`@tovu/commerce` — depends on kernel, content (for catalog-as-content projection), change. Sub-modules: `catalog`, `cart`, `checkout-orchestrator`, `order-ledger`, `inventory`, `payment-adapters`, `shipping-adapters`, `tax-adapters`, `promotions`.

### Behavioral Design
1. Catalog products participate in content system for search, templating, AI description generation.
2. Cart is session-scoped, server-side state. Persists across requests, supports save-for-later.
3. Checkout is a state machine: `cart → shipping → tax → payment → order`. Each transition idempotent with reservation keys. Inventory reserved at checkout start, committed on capture, released on timeout.
4. Orders are append-only ledger events. Admin views are projections.
5. Payment, shipping, tax are pure port interfaces with provider adapters (Stripe, PayPal, ShipStation, TaxJar). Swapping = adapter config.
6. Commerce changes run `CheckoutHealthPort` synthetic tests as preflight.

*(Cart as first-class port: Claude proposed, Codex accepted PaymentGateway must be separate, Cart/Checkout split accepted as reasonable given cross-request persistence needs)*

### AI-Native Angle
- Product description and SEO generation.
- Funnel abandonment analysis.
- Fraud signal triage (not decisioning — stays with payment provider).
- Merchandising suggestions. AI advises; settlement and compliance stay deterministic.

---

## 8. Gap Closures

### Job Scheduler — `@tovu/scheduler`

```typescript
interface JobPort {
  enqueue(job: JobDefinition): Promise<JobRef>;
  schedule(cron: CronExpression, job: JobDefinition): Promise<ScheduleRef>;
  cancel(jobId: string): Promise<void>;
  status(jobId: string): Promise<JobStatus>;
  lease(workerId: string, capacity: number): Promise<LeasedJob[]>;
  complete(jobId: string, result: JobResult): Promise<void>;
  fail(jobId: string, error: JobError): Promise<void>;
}
```

Separate package, same process by default (worker threads), extractable to separate service. Database-backed queue (not visitor-triggered). Heartbeat-based leasing. Dead letter queue for persistent failures. Used by: security scans, media processing, AI embeddings, email delivery, import pipelines, canary health checks, cache warmup.

### Email — `@tovu/email`

```typescript
interface EmailPort {
  send(message: EmailMessage): Promise<DeliveryResult>;
  sendTemplate(templateId: string, data: TemplateData, to: Recipient[]): Promise<DeliveryResult>;
  verifyDomain(domain: string): Promise<DomainVerification>;
  bounceWebhook(event: BounceEvent): Promise<void>;
}
```

Adapter-swappable (SendGrid, SES, Postmark, SMTP). Domain verification guides SPF/DKIM/DMARC setup. Bounce tracking feeds deliverability scoring.

### Governance

Not a separate package — governance is a policy layer within `@tovu/security`. `RegistryPort` supports federated channels (Tovu Foundation, enterprise mirrors, private registries). Sites pin trust roots and recall feeds. Architectural governance (who can publish, recall, pin) enforced by `RegistryPort`. Organizational governance is out of software scope.

### Writer Mode

Already defined as `WriterModePort` in `@tovu/authoring` (Track 4). First-class port, not a UI flag.

### WordPress Import

Already defined as `WpImportPort` in `@tovu/ops` (Track 5). Anti-corruption layer pattern.

### i18n — `@tovu/i18n`

```typescript
interface LocalePort {
  define(locale: LocaleDefinition): Promise<void>;
  resolve(path: string, acceptLanguage: string): Promise<LocaleMatch>;
  link(groupId: string, variants: LocaleVariant[]): Promise<void>;
  translate(contentId: string, targetLocale: string): Promise<TranslationDraft>;
  fallback(locale: string): Promise<FallbackChain>;
}
```

Content records have locale-linked variants sharing canonical group ID. Routes locale-prefixed or domain-mapped (adapter config). Search indexes locale-aware. AI-assisted translation draft → human review → publish. Fallback chains define display when requested locale unavailable.

### Media Organization — enhancement to `@tovu/media`

```typescript
interface MediaCatalogPort {
  organize(assetId: string, folder: FolderRef): Promise<void>;
  tag(assetId: string, tags: string[]): Promise<void>;
  search(query: MediaSearchQuery): Promise<MediaSearchResult>;
  smartCollection(rule: CollectionRule): Promise<CollectionRef>;
  dedupe(scope: DedupeScope): Promise<DuplicateReport>;
}
```

Virtual folders (not filesystem paths). Tags with auto-suggestion. AI-powered smart collections. Deduplication detection. Media indexed in SearchPort for cross-content discovery.

### Config/Secrets — `ConfigPort` + `SecretsPort`

```typescript
interface ConfigPort {
  get<T>(key: string, schema: ZodSchema<T>): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
  watch(key: string): AsyncIterable<ConfigChange>;
}

interface SecretsPort {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
  rotate(key: string): Promise<RotationResult>;
}
```

Typed configuration with environment overrides. Secrets never appear in logs, exports, or PortableBundle. Prevents ad-hoc environment access across packages.

*(Config/Secrets: Codex identified, Claude conceded as valid gap)*

---

## 9. Cross-Cutting Concerns

### Event System: Log + Bus

```typescript
// Source of truth — append-only, durable, replayable
interface EventLogPort {
  append(event: DomainEvent): Promise<EventRef>;
  stream(query: EventQuery): AsyncIterable<DomainEvent>;
  replay(from: EventRef): AsyncIterable<DomainEvent>;
}

// Distribution mechanism — real-time, ephemeral
interface EventBusPort {
  subscribe(pattern: EventPattern, handler: EventHandler): Promise<Subscription>;
  unsubscribe(subscriptionId: string): Promise<void>;
}
```

Every domain action publishes typed events. The log is the source of truth (auditability, deterministic recovery). The bus provides real-time distribution built on top of the log. Subscribers registered at boot from extension manifests — not dynamic string-based hooks.

*(Consensus: both agreed log-primary with bus-style subscription as derived layer)*

### Typed Extension Points (replacing global hooks)

```typescript
interface ExtensionPoint<TInput, TOutput> {
  readonly id: string;
  readonly schema: { input: ZodSchema<TInput>; output: ZodSchema<TOutput> };
  readonly budget: { timeoutMs: number; maxMemoryMb: number };
  invoke(input: TInput, chain: ExtensionChain<TInput, TOutput>): Promise<TOutput>;
}
```

Modules declare extension points with typed schemas, budgets, and ordering rules. Plugins register handlers against typed extension points. Runtime enforces schemas, timeouts, and memory limits. Ordering is explicit with cycle detection. This directly prevents complaint #6 (plugin conflicts).

*(Both models unanimous: typed, versioned, budgeted extension points replace global hooks)*

### Control Plane / Runtime Plane Split

```
Control Plane (always accessible):
  kernel + auth + admin UI + recovery shell + management API
  Boots WITHOUT extensions, themes, or commerce runtime

Runtime Plane (full capability):
  All of the above + extensions + themes + commerce + content delivery
  Loads the complete extension graph
```

A broken extension must never prevent control plane access. One deployment is fine; one trust domain is not. Recovery shell is the architectural guarantee against complaint #3.

*(Both models unanimous)*

### Shared Primitives (from `@tovu/change`)

```typescript
type ChangeEnvelope = {
  id: string;
  siteId: string;
  kind: 'core' | 'extension' | 'template' | 'schema' | 'content' | 'commerce' | 'env';
  actor: ActorRef;
  diff: unknown;
};

type SnapshotRef = { id: string; scope: SnapshotScope; timestamp: Date; };
type PolicyDecision = { allowed: boolean; reasons: string[]; warnings?: string[]; };
type HealthProbe = { name: string; check(): Promise<HealthStatus>; };
type AuditReceipt = { id: string; hash: string; timestamp: Date; };
```

### Auth Must Be Multi-Tenant

`AuthPort` needs `siteId` and `environmentId` dimensions for multisite, agency handoff, and preview environments. Current interface only has user-level sessions — insufficient.

### AI Safety Boundary

AI assists with explanation, suggestion, and drafting. AI never makes unilateral destructive decisions (quarantine, rollback, data deletion, payment capture). All AI recommendations flow through human-confirmed policy gates. `PolicyDecision` makes this explicit: AI can produce recommendations, enforcement requires actor confirmation.

*(Both models unanimous)*

---

## Appendix: Complaint-to-Decision Mapping

| # | Complaint | Score | Primary Solution | Ports/Modules |
|---|-----------|-------|------------------|---------------|
| 1 | Plugin updates break production | 4.775 | ChangeSafetyPort preflight + canary + rollback | reliability, change |
| 2 | WooCommerce friction | 4.18 | First-party 80/20 commerce + CheckoutHealthPort | commerce, observability |
| 3 | Core updates lock out admin | 3.875 | RecoveryShellPort + control/runtime plane split | reliability |
| 4 | Critical errors & debugging | 3.762 | IncidentPort fingerprint + AI root cause | reliability |
| 5 | Security/supply-chain risk | 3.762 | ExtensionTrustPort + VulnIntelPort + RegistryPort | security |
| 6 | Plugin conflicts | 3.55 | Typed extension points + plugin isolation + ExtensionLifecyclePort | reliability, plugin |
| 7 | Publishing data loss | 3.502 | ContentIntegrityPort + revision history | reliability |
| 8 | CSS/responsive gaps | 3.46 | PresentationSchemaPort design tokens + responsive validation | presentation, authoring |
| 9 | Hosting/environment mismatch | 3.438 | EnvironmentCompatPort pre-upgrade scanning | observability |
| 10 | FSE crashes | 3.425 | TemplateLifecyclePort versioning + one-click revert | authoring |
| 11 | Performance: editor regressions | 3.348 | PerfObservabilityPort + budget enforcement | observability |
| 12 | Caching complexity | 3.2 | Declarative CachePort, tag-based invalidation | observability |
| 13 | CWV/TTFB/frontend bloat | 3.052 | PerfObservabilityPort attribution + budgets | observability |
| 14 | Migration pain | 2.988 | MigrationPort + PortableBundle + WpImportPort | ops |
| 15 | Editor input regressions | 2.988 | ContentQualityPort + typed extension points | authoring |
| 16 | Save failures/REST errors | 2.899 | ContentIntegrityPort transactional saves | reliability |
| 17 | Multisite/permissions | 2.851 | Multi-tenant AuthPort + RegistryPort federation | auth, security |
| 18 | Admin UX fragmentation | 2.798 | AdminSignalPort unified inbox + WriterModePort | authoring |
| 19 | FSE template lifecycle | 2.65 | TemplateLifecyclePort versioning + explain | authoring |
| 20 | Collaboration locking | — | CollaborationPort hybrid CRDT + optimistic concurrency | authoring |
| 21 | Documentation rot | — | AI-generated live contextual docs from schema/routes | ai-core, authoring |
| 22 | Subscription fatigue | — | First-party commerce + CostControlPort | commerce, ops |
| 23 | Agency/client handoff | — | WriterModePort + ProvenancePort + preview envs | authoring, security, ops |
| 24 | Governance crisis | — | Federated RegistryPort + ProvenancePort | security |
| 25 | DX fragmentation | — | Pure TS monolith + typed contracts + no PHP | architecture-wide |

---

## Appendix: Known Unknowns Resolved

| Question | Consensus Answer |
|----------|-----------------|
| Ecommerce parity target? | 80/20 — opinionated core, plugins for long-tail |
| CRDT vs OT? | Hybrid: CRDT for rich text, optimistic concurrency for structured fields, locks for destructive ops |
| Job scheduler: in-kernel or separate? | Separate package (`@tovu/scheduler`), same process default, extractable |
| Governance: architectural vs organizational? | Architectural: federated registry, provenance, channel policies. Organizational: out of software scope |

---

## Appendix: Debate Metadata

| Property | Value |
|----------|-------|
| Models | Claude Opus 4.6, Codex GPT-5.4 |
| Rounds | 2 (converged at round 2, confidence > 0.90) |
| Gemini Status | Unavailable — MODEL_CAPACITY_EXHAUSTED on 3.1 Pro Preview, 2.5 Pro, 2.5 Flash |
| Consensus Points | 16 strong agreements from Round 1 |
| Disagreements | 10 identified, 8 fully resolved, 2 near-resolved in Round 2 |
| Unresolved | D2 (ChangeEnvelope package location — minor, start in reliability, extract if needed), D8 (Cart/Checkout port split — minor, both accept separate PaymentGateway) |
