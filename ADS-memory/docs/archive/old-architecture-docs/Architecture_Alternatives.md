# Architecture Alternatives

A comparison of software architectures for building a modern ERP system.

---

## The "Clean" Family (All Similar)

These are 90% the same idea with different names:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Hexagonal          Clean            Onion            │
│   (Cockburn)      (Uncle Bob)       (Palermo)          │
│                                                         │
│   Ports &         Entities &        Domain &           │
│   Adapters        Use Cases         Services           │
│                                                         │
│   ALL SAY: "Dependencies point inward,                 │
│            core has no external deps"                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Core Principle

```
                    ┌─────────────────────────────────────┐
                    │                                     │
   ┌────────────┐   │   ┌─────────────────────────────┐   │   ┌────────────┐
   │            │   │   │                             │   │   │            │
   │  Next.js   │◄──┼──►│                             │◄──┼──►│ PostgreSQL │
   │  Frontend  │   │   │      CORE BUSINESS          │   │   │            │
   │            │   │   │         LOGIC               │   │   ├────────────┤
   └────────────┘   │   │                             │   │   │            │
                    │   │   (Pure functions/classes   │   │   │   Redis    │
   ┌────────────┐   │   │    with NO dependencies     │   │   │            │
   │            │   │   │    on external systems)     │   │   └────────────┘
   │  Flutter   │◄──┼──►│                             │   │
   │   Mobile   │   │   └─────────────────────────────┘   │   ┌────────────┐
   │            │   │                                     │   │            │
   └────────────┘   │         PORTS (interfaces)          │   │  Stripe    │
                    │                                     │   │            │
                    └─────────────────────────────────────┘   └────────────┘
                              ADAPTERS (implementations)
```

### Rules for Swappability

1. **Core logic has ZERO external imports**
2. **All external systems accessed via interfaces (ports)**
3. **Implementations (adapters) are injected**
4. **Data flows through the core, never around it**

### Example: Swappable Database

```typescript
// ports/repository.ts (INTERFACE - never changes)
export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByCustomer(customerId: string): Promise<Invoice[]>;
  save(invoice: Invoice): Promise<Invoice>;
  delete(id: string): Promise<void>;
}

// adapters/postgres/invoice.repository.ts
export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private prisma: PrismaClient) {}
  async findById(id: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({ where: { id } });
  }
}

// adapters/mongodb/invoice.repository.ts (SWAP IN LATER)
export class MongoInvoiceRepository implements InvoiceRepository {
  constructor(private collection: Collection) {}
  async findById(id: string): Promise<Invoice | null> {
    return this.collection.findOne({ _id: id });
  }
}
```

### File Structure

```
/src
├── core/                    # PURE BUSINESS LOGIC (no external deps)
│   ├── entities/
│   │   ├── invoice.ts
│   │   └── payment.ts
│   ├── services/
│   │   ├── invoice.service.ts
│   │   └── tax.service.ts
│   └── errors/
│
├── ports/                   # INTERFACES (contracts)
│   ├── repositories/
│   │   ├── invoice.repository.ts
│   │   └── customer.repository.ts
│   ├── services/
│   │   ├── payment.provider.ts
│   │   ├── email.service.ts
│   │   └── pdf.generator.ts
│   └── events/
│       └── event.bus.ts
│
├── adapters/                # IMPLEMENTATIONS (swappable)
│   ├── postgres/
│   ├── mongodb/
│   ├── stripe/
│   ├── square/
│   ├── sendgrid/
│   └── resend/
│
├── api/
│   └── routes/
│
└── di/
    └── container.ts         # Wire everything together
```

### Swappability Summary

| Component | Interface (Port) | Current Adapter | Future Options |
|-----------|-----------------|-----------------|----------------|
| Database | `Repository<T>` | PostgreSQL | MongoDB, MySQL, Supabase |
| Cache | `CacheService` | Redis | Memcached, In-memory |
| Payments | `PaymentProvider` | Stripe | Square, Adyen, PayPal |
| Email | `EmailService` | SendGrid | Resend, AWS SES, Postmark |
| Storage | `FileStorage` | S3 | GCS, Cloudflare R2, Local |
| Queue | `JobQueue` | BullMQ | SQS, RabbitMQ, Celery |
| PDF | `PdfGenerator` | React-PDF | Puppeteer, wkhtmltopdf |
| Search | `SearchEngine` | PostgreSQL FTS | Elasticsearch, Meilisearch |

---

## Vertical Slice Architecture (Jimmy Bogard)

**Different philosophy:** Instead of horizontal layers, organize by feature.

```
Traditional Layers:              Vertical Slices:

├── controllers/                 ├── features/
│   ├── invoice.ts               │   ├── create-invoice/
│   ├── payment.ts               │   │   ├── handler.ts
│   └── customer.ts              │   │   ├── validator.ts
├── services/                    │   │   └── repository.ts
│   ├── invoice.ts               │   ├── pay-invoice/
│   └── payment.ts               │   │   ├── handler.ts
├── repositories/                │   │   └── repository.ts
│   └── ...                      │   └── send-reminder/
└── models/                      │       └── ...
```

### Pros
- Each feature is self-contained
- Change one feature without touching others
- Easier to delete features
- Teams can own slices

### Cons
- Code duplication across slices
- Harder to share logic
- Can become messy without discipline

### Best For
Large teams, microservices transition, feature-focused development

---

## CQRS (Command Query Responsibility Segregation)

**Separate read and write models completely.**

```
                    ┌─────────────────┐
                    │                 │
         ┌─────────►│  WRITE MODEL    │──────┐
         │          │  (normalized)   │      │
Commands │          └─────────────────┘      │ Events
(writes) │                                   │
         │                                   ▼
    ┌────┴────┐                      ┌──────────────┐
    │   API   │                      │  Event Store │
    └────┬────┘                      └──────┬───────┘
         │                                   │
Queries  │          ┌─────────────────┐      │ Projections
(reads)  │          │                 │      │
         └─────────►│  READ MODEL     │◄─────┘
                    │  (denormalized) │
                    └─────────────────┘
```

### Example for Accounting

```typescript
// WRITE side - simple, validates business rules
class PostInvoiceCommand {
  execute(invoiceId: string) {
    // Validate, then emit event
    emit(new InvoicePostedEvent(invoiceId, lines, totals));
  }
}

// READ side - optimized for queries
class InvoiceReadModel {
  // Denormalized table optimized for listing/searching
  // Updated by listening to events
}
```

### Pros
- Read and write can scale independently
- Read models optimized for specific queries
- Great for complex reporting (ERP!)

### Cons
- Eventual consistency (reads may lag)
- More infrastructure
- Overkill for simple CRUD

### Best For
Accounting, reporting-heavy systems, high-read workloads

---

## Event Sourcing

**Store events, not state. Derive state from events.**

```
Traditional:                    Event Sourced:

invoice record:                 events:
{                               1. InvoiceCreated { customer, date }
  id: 123,                      2. LineAdded { product, qty, price }
  customer: "Acme",             3. LineAdded { product, qty, price }
  total: 1500,    ◄── current   4. TaxCalculated { amount: 150 }
  status: "paid"      state     5. InvoicePosted { }
}                               6. PaymentReceived { amount: 1500 }
                                7. InvoiceMarkedPaid { }

                                Current state = replay all events
```

### Why This Is PERFECT for Accounting

- Ledgers ARE event sourced (historically!)
- Complete audit trail built-in
- Can reconstruct state at any point in time
- "What was the balance on March 15th?" = replay to that date
- Immutable by design (accountants love this)

### Pros
- Perfect audit trail
- Time-travel queries
- Debug by replaying events
- Natural fit for accounting

### Cons
- Different mental model
- Event versioning is tricky
- Storage grows forever
- Rebuilding projections takes time

### Best For
Accounting, audit-heavy systems, compliance requirements, financial applications

---

## Modular Monolith (vs Microservices)

**Don't start with microservices. Start with well-structured monolith.**

```
Modular Monolith:
┌─────────────────────────────────────────────────────┐
│                    ONE DEPLOYMENT                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐ │
│  │Invoicing│  │Inventory│  │Payments │  │  CRM   │ │
│  │ Module  │  │ Module  │  │ Module  │  │ Module │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └───┬────┘ │
│       │            │            │            │      │
│       └────────────┴─────┬──────┴────────────┘      │
│                          │                          │
│                   Shared Database                   │
└─────────────────────────────────────────────────────┘

Later, if needed, extract to microservices:
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Invoicing │  │Inventory │  │Payments  │  │   CRM    │
│ Service  │  │ Service  │  │ Service  │  │ Service  │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │             │
     └─────────────┴──────┬──────┴─────────────┘
                    Message Bus
```

**Key insight:** Module boundaries in monolith = future service boundaries.

### Pros
- Simple deployment
- No network latency between modules
- Easier debugging
- Refactor freely
- Extract to microservices when needed

### Cons
- Still need discipline for boundaries
- Shared database can become messy
- One bad module affects whole system

### Best For
Starting out, small teams, proving product-market fit

---

## Domain-Driven Design (DDD)

**A design approach (not architecture) that puts business domain at the center.**

Works WITH other architectures (Hexagonal, Event Sourcing, CQRS), not instead of them.

```
┌─────────────────────────────────────────────────────────────────┐
│                      KEY CONCEPTS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Bounded Context   = Module with its own language/models        │
│  Entity            = Has identity (Invoice #123)                │
│  Value Object      = No identity, immutable (Money, Address)    │
│  Aggregate         = Cluster of entities, consistency boundary  │
│  Domain Event      = Something that happened (InvoicePosted)    │
│  Repository        = Persistence abstraction (per aggregate)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pros
- Ubiquitous language between devs and domain experts
- Clear module boundaries (bounded contexts)
- Business logic in entities, not anemic services
- Natural microservice boundaries later

### Cons
- Steep learning curve (many concepts)
- Overkill for simple CRUD apps
- Requires access to domain experts
- Aggregate design is tricky to get right

### Best For
Complex business domains (like ERP), multiple teams, long-lived projects

---

## Service Mesh

**Infrastructure layer for microservice-to-microservice communication.**

Sidecar proxies handle cross-cutting concerns (auth, retries, observability) so your app code doesn't have to.

```
┌─────────────────────┐         ┌─────────────────────┐
│     Service A       │         │     Service B       │
│  ┌───────────────┐  │         │  ┌───────────────┐  │
│  │   App Code    │  │         │  │   App Code    │  │
│  └───────┬───────┘  │         │  └───────┬───────┘  │
│  ┌───────▼───────┐  │  mTLS   │  ┌───────▼───────┐  │
│  │    SIDECAR    │◄─┼────────►┼─►│    SIDECAR    │  │
│  │ (auth, retry, │  │         │  │ (auth, retry, │  │
│  │  logging)     │  │         │  │  logging)     │  │
│  └───────────────┘  │         │  └───────────────┘  │
└─────────────────────┘         └─────────────────────┘
```

**Popular options:** Istio (feature-rich), Linkerd (simpler), Consul Connect, AWS App Mesh

### Pros
- Zero code changes for security/observability
- mTLS everywhere automatically
- Traffic control (canary deploys, circuit breakers)
- Language agnostic

### Cons
- Significant complexity (especially Istio)
- Resource overhead (sidecar per pod)
- Overkill for < 10 services
- Requires Kubernetes (usually)

### Best For
10+ microservices, strict security/compliance requirements, large orgs already on Kubernetes

---

## Architecture Comparison Table

| Architecture | Best When | Avoid When |
|--------------|-----------|------------|
| Ports & Adapters | Swappability matters | Simple CRUD app |
| Vertical Slices | Large team, many features | Small team |
| CQRS | Complex reads ≠ writes | Simple app |
| Event Sourcing | Audit trail critical | "Just need current state" |
| Microservices | Scale independently, large org | Starting out, small team |
| Modular Monolith | Starting out, need flexibility | Already at scale |
| DDD | Complex domain, domain experts available | Simple CRUD, solo dev |
| Service Mesh | 10+ microservices, strict security | Monolith, small system |

---

## Recommended Stack for ERP Rebuild

```
┌─────────────────────────────────────────────────────────────┐
│                    RECOMMENDED STACK                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Architecture:    Modular Monolith + Event Sourcing         │
│  Design:          DDD (bounded contexts, aggregates)        │
│  Pattern:         Ports & Adapters for swappability         │
│  Data:            CQRS for complex reporting                │
│  Organization:    Vertical slices within modules            │
│  Later:           Service Mesh (when 10+ services)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Hybrid Approach File Structure

```
/src
├── modules/                      # Modular monolith
│   ├── accounting/               # Event-sourced module
│   │   ├── events/               # Invoice created, posted, paid...
│   │   ├── aggregates/           # Invoice, Payment, JournalEntry
│   │   ├── projections/          # Read models for queries
│   │   ├── commands/             # Write operations
│   │   └── queries/              # Read operations (CQRS)
│   │
│   ├── inventory/                # Could be traditional CRUD
│   │   └── ...
│   │
│   └── crm/                      # Could be traditional CRUD
│       └── ...
│
├── ports/                        # Interfaces (Orc-BASH style)
├── adapters/                     # Implementations
└── shared/                       # Cross-module stuff
```

### Why This Combo?

| Module | Pattern | Reason |
|--------|---------|--------|
| Accounting | Event Sourced + CQRS | Audit trail, time-travel, complex reports |
| Inventory | Traditional CRUD | Simpler, current state matters most |
| CRM | Traditional CRUD | Simpler, relationships matter more than history |
| Orders | Event Sourced | Order lifecycle is naturally event-driven |

---

## The Honest Truth

**There is no "best" architecture.** There are tradeoffs.

The main principles that matter:

1. **Dependencies point inward** - Core logic has no external deps
2. **Depend on interfaces, not implementations** - For swappability
3. **Start simple, extract when needed** - Modular monolith → microservices
4. **Match pattern to problem** - Event sourcing for audit trails, CRUD for simple data
5. **Build for change** - Assume every external dependency will be replaced

> "Well-designed software that's modular and easy to swap beats perfect software that's only perfect for right now."
