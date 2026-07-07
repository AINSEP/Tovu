### A2. CQRS (Command Query Responsibility Segregation)

**What it is:** Separate the write model (commands) from the read model (queries) completely. Commands validate business rules and emit events; queries read from denormalized projections optimized for display.

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

```typescript
// WRITE side — validates rules, emits event
class PostInvoiceCommand {
  execute(invoiceId: string) {
    // Validate business rules, then emit
    emit(new InvoicePostedEvent(invoiceId, lines, totals));
  }
}

// READ side — denormalized, query-optimized projection
// Updated by listening to events from the write side
class InvoiceReadModel {
  // Flat, pre-joined table tuned for the specific query shapes needed
}
```

**Why it matters:** Read and write sides scale independently. Read models can be shaped exactly to query needs without touching the normalized write model.

**When to use for Tovu:** If Tovu ever adds complex reporting dashboards (content performance, plugin analytics, ecommerce orders) that have fundamentally different access patterns from the mutation operations, CQRS is the correct split. The `@tovu/content` operations layer is already positioned to adopt this — commands go through the executor pipeline, and read projections can be added as a separate path without restructuring the write side.

**When NOT to use:** Simple CRUD with no reporting complexity. CQRS adds infrastructure overhead (projection maintenance, eventual consistency) that is pure cost when queries and commands are symmetric.

---

