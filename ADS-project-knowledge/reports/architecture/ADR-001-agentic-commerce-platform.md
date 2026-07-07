# ADR-001: Agent-Native Commerce Platform Architecture

- Status: ACCEPTED
- Date: 2026-06-02
- Author: Swarm Consensus (Claude Opus 4.6 + Gemini + Codex 5.5) / Leon Aburime
- Consensus confidence: >90% (3-model agreement on all critical dimensions)

## Context

Tovu needs a commerce platform where AI agents can interact on behalf of users across all commerce operations — managing products, processing orders, applying coupons, handling checkout, configuring shipping/tax/payments, and managing customers. External authenticated agents from other systems must also be able to interact with scoped permissions.

WooCommerce was analyzed via reverse-spec extraction (coupons: 33 requirements) and deep research (DR Codex 5.5). Key problems for agent interaction:
- Three separate API surfaces with different auth models
- Session-bound state (nonce rotation, cart tokens)
- 400+ filter/action hooks that silently modify behavior
- No preview/dry-run capability
- No delegation model for agents acting as users
- No declared side-effects — behavior is only knowable post-execution

## Decision

Build a **modular monolith with a canonical OperationRegistry, hexagonal ports/adapters, plan/execute semantics, and database-agnostic repository interfaces**. All consumers (human UI, internal agents, external agents, webhooks, integrations) use the same operations through transport adapters.

**Pattern selected:** Modular Monolith + Hexagonal Architecture + OperationRegistry + Plan/Execute

## Core Architecture

### The OperationRegistry (Central Primitive)

Every commerce action is a registered operation:

```ts
type CommerceOperation = {
  id: string;                          // e.g., "coupon.apply"
  version: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredPermissions: Permission[];
  resourceScope: ResourceScope;
  idempotency: "required" | "optional";
  riskLevel: "read" | "low" | "money_movement" | "destructive";
  plan(input, context): Promise<OperationPlan>;
  execute(input, context, commit: CommitToken): Promise<OperationResult>;
};
```

- `plan()` — preview: validates, projects changes, declares side-effects, returns `planHash`. No state mutation.
- `execute()` — commit: requires idempotency key; for risky ops requires matching `planHash`. If state changed since plan, returns `plan_stale` + fresh plan.
- Every `execute()` returns a structured receipt: what changed, what triggered, reversibility, reverse operation ID.

### Request Context (Who Is Doing What)

Every request carries:

```ts
type RequestContext = {
  subject: string;       // human or service account being represented
  actor: string;         // agent, app, browser, worker making the call
  delegation: {          // what the actor is allowed to do as the subject
    scopes: string[];
    resourceConstraints: Record<string, any>;
    spendLimits?: MoneyAmount;
    expiry: DateTime;
    approvalPolicy?: ApprovalPolicy;
  };
  workspace: string;     // tenant/store boundary
  correlationId: string; // audit + tracing
};
```

### External Agent Access (A2A / Federation)

External agents from other platforms authenticate via OAuth2 and receive delegation tokens:

1. External system registers as an OAuth client with declared capabilities
2. Store owner grants scoped access (e.g., "read products + create orders for customer X")
3. External agent receives bearer token with delegation context
4. Same OperationRegistry, same plan/execute, same audit trail
5. External agents can discover available operations via schema endpoint

This enables: marketplace integrations, multi-store agents, third-party fulfillment agents, customer service bots from partner platforms.

### Database Adapter Layer

The domain NEVER touches SQL directly. Repository ports define the contract:

```
Domain Logic → Repository Port (interface) → DB Adapter (implementation)
                                                ├── PostgresAdapter (preferred — advisory locks, JSONB, SKIP LOCKED)
                                                ├── MySQLAdapter (FOR UPDATE, JSON columns, InnoDB locks)
                                                └── MariaDBAdapter (same as MySQL with MariaDB-specific optimizations)
```

- PostgreSQL is the reference/preferred adapter
- MySQL/MariaDB adapters provide compatibility
- Concurrency primitives (locks, reservations, atomic increments) are adapter-specific
- The plan/execute contract is DB-agnostic — adapters implement the locking strategy

### Extension Model

Extensions declare capabilities and operate through typed interfaces:

```json
{
  "id": "acme-shipping-rates",
  "capabilities": ["shipping.rate.quote"],
  "permissions": ["cart.read"],
  "sideEffects": ["external_http"],
  "supportsPlan": true
}
```

- First-party extensions: typed interfaces (TypeScript), run in-process behind ports
- Third-party/untrusted: sandboxed execution (Wasm or V8 Isolates), no direct DB access
- Extensions return typed proposals/mutations — core decides and commits
- All extensions must support `plan()` (preview their effects)
- Narrow extension points: validators, calculators, rate providers, gateways, fulfillment, agent tools

### Transport Adapters (One Operation Model, Many Surfaces)

```
OperationRegistry
  → REST/OpenAPI adapter (durable public API contract)
  → MCP adapter (auto-generated from operation schemas — agent tool discovery)
  → A2A adapter (external agent federation)
  → AG-UI adapter (agentic UI streaming)
  → Webhook adapter (event delivery)
  → CLI adapter (admin tooling)
```

All generated from the same operation descriptors. Add new transports without changing domain logic.

### Auth & Delegation

- **OAuth2/OIDC** for authentication (well-understood, massive tooling ecosystem)
- **Fine-grained scopes** for delegation: resource-level (e.g., `cart:customer_123:write`)
- **Delegation tokens** for agents: subject + actor + scopes + constraints + expiry
- **Approval policies** for high-risk operations: agent plans → human approves → agent executes
- Browser sessions are just one auth adapter — not a privileged path
- Guest checkout gets an actor identity (not anonymous session state)

### Commerce Domain Modules

All implement the OperationRegistry pattern:

| Module | Key Operations |
|--------|---------------|
| Products | CreateProduct, UpdateProduct, CreateProductWithVariations, ManageInventory |
| Orders | CreateOrder, TransitionStatus, RefundLineItems, AddNote |
| Cart | AddItem, RemoveItem, ApplyCoupon, RemoveCoupon, UpdateQuantity |
| Checkout | InitiateCheckout, CalculateTotals, ProcessPayment, ConfirmOrder |
| Coupons | CreateCoupon, ValidateCoupon, ApplyCoupon, CalculateDiscount |
| Customers | CreateAccount, LinkGuest, UpdateProfile, ManageAddresses |
| Shipping | GetRates, SelectMethod, CreateShipment, TrackShipment |
| Tax | CalculateTax, ConfigureRates, SetJurisdiction |
| Payments | CreatePaymentIntent, Authorize, Capture, Refund |
| Settings | GetConfig, UpdateConfig (typed, versioned, audited) |
| Analytics | QueryReports (async projections from domain events) |
| Webhooks | RegisterWebhook, DeliverEvent (durable, with retries) |
| Jobs | ScheduleWorkflow, QueryStatus (Temporal or equivalent) |

### Consistency Model

- **Strong consistency (ACID):** Cart totals, coupon usage, stock reservation, payment state, order creation — the money path
- **Eventual consistency (async):** Search indexing, analytics projections, webhook delivery, email notifications, recommendations
- **Outbox pattern:** Domain events written transactionally with the aggregate, consumed async by projections/integrations

### Background Work

- Outbox for domain events (guaranteed delivery without distributed transactions)
- Durable workflow engine (Temporal.io or equivalent) for long-running processes (checkout saga, refund flows, bulk operations)
- No WP-Cron, no request-driven execution — dedicated worker pool

## What NOT To Carry Over From WooCommerce

| WooCommerce Pattern | Why Not | Replacement |
|----|----|----|
| CPT/postmeta (EAV) | Destroys query performance at scale | Typed relational schema per module |
| Three API surfaces | Agent must juggle different auth/contracts | One OperationRegistry, multiple transport adapters |
| Nonce-rotating sessions | Agents can't maintain browser state | Stateless bearer tokens + durable cart resources |
| Global filter/action hooks | Unpredictable for automated consumers | Declared extension points with typed contracts |
| wp_options settings | No typing, no versioning, autoload bloat | Typed config resources with schema + audit |
| WP-Cron jobs | Request-driven, non-deterministic | Dedicated workflow engine |
| Temp-meta locking | Race conditions, dead row accumulation | DB-native locks via adapter (advisory, FOR UPDATE) |
| Execute-first-explain-later | Agent can't preview outcomes | plan/execute with planHash |

## Guardrails for Implementation

1. **Every new operation MUST implement both `plan()` and `execute()`** — no exceptions. If it can't be previewed, it can't be registered.
2. **No SQL in domain logic** — all data access through repository ports. Violation = architecture breach.
3. **No ambient state mutation** — extensions return proposals, core commits. No hook can silently change a cart.
4. **Every operation receipt MUST declare reversibility** — agents need to know what they can undo.
5. **External agents get the same API as internal agents** — no second-class citizen transports.
6. **Delegation tokens MUST be scoped and time-limited** — no god-mode API keys.
7. **All money-movement operations require planHash confirmation** — prevents stale-state execution.
8. **DB adapter MUST be swappable** — Postgres preferred, MySQL/MariaDB supported. Domain never imports adapter.
9. **Operation schemas ARE the documentation** — MCP tools, OpenAPI docs, and agent capabilities are generated, not hand-written.
10. **Audit trail is non-optional** — every operation execution is logged with full request context (subject, actor, delegation, correlation).

## Build First (MVP)

1. OperationRegistry with plan/execute primitives
2. RequestContext with subject/actor/delegation
3. PostgreSQL adapter + MySQL adapter (prove portability early)
4. Coupons module (already reverse-specced, good complexity canary)
5. Cart + Checkout slice (proves the transactional money path)
6. Products module (proves catalog scale story)
7. OAuth2 auth + delegation token minting
8. REST/OpenAPI transport adapter
9. MCP transport adapter (agent tool discovery)
10. Outbox + basic workflow engine integration

## Defer

- Full GraphQL read layer
- Wasm extension sandbox (use typed in-process interfaces first)
- Multi-region / active-active
- Full event sourcing across all modules
- Analytics warehouse (ClickHouse)
- Extension marketplace
- A2A federation protocol (build the capability, defer the discovery/registry)
- Autonomous bulk-operation agents

## Consensus Evidence

This ADR was produced via Swarm Consensus debate (2026-06-02):
- **Claude Opus 4.6** (Primary): Proposed single typed API, intent operations, OAuth2 delegation, declared effects
- **Gemini**: Proposed CQRS+EventDriven, Wasm pure functions, Macaroons, Temporal.io. Revised Round 2: conceded CQRS and adopted intent-ops.
- **Codex 5.5**: Proposed OperationRegistry with plan/execute+planHash, hexagonal ports, OAuth/OIDC delegation, typed extension capabilities. Most concrete and implementable proposal.

**Unanimous agreement:** Modular monolith, PostgreSQL, no CPT/EAV, no hooks, durable carts, preview/dry-run, one API model, strong consistency for money paths.

**Synthesis:** Final architecture takes Codex's OperationRegistry+planHash as the core primitive, Claude's intent-based operations and OAuth2 delegation, Gemini's extension isolation model (deferred to Wasm for untrusted, typed interfaces for first-party), and all three models' agreement on modular monolith + hexagonal ports.

## Re-evaluation Triggers

- If we need multi-region deployment before 100k orders/month → revisit modular monolith
- If third-party extension ecosystem grows past 50 extensions → revisit Wasm sandbox timeline
- If OAuth2 scopes prove too coarse for agent delegation → evaluate Macaroons/Biscuits
- If PostgreSQL becomes deployment barrier for target customers → expand adapter testing
