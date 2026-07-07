### A7. Hybrid Approach: Modular Monolith + Event Sourcing + DDD + CQRS

**What it is:** The recommended combination for a complex ERP or CMS platform. Not all modules need the same pattern — the architecture is mixed by bounded context based on the actual complexity of each domain.

```
/src
├── modules/
│   ├── accounting/               ← Event Sourced + CQRS (audit trail critical)
│   │   ├── events/               #   InvoiceCreated, PaymentReceived, etc.
│   │   ├── aggregates/           #   Invoice, Payment, JournalEntry
│   │   ├── projections/          #   Read models for dashboards/queries
│   │   ├── commands/             #   Write operations
│   │   └── queries/              #   Read operations (separate path)
│   │
│   ├── inventory/                ← Traditional CRUD (current state matters most)
│   └── crm/                      ← Traditional CRUD (relationships > history)
│
├── ports/                        ← Interfaces (Ports & Adapters)
├── adapters/                     ← Implementations (swappable)
└── shared/                       ← Cross-module primitives
```

| Module | Pattern | Reason |
|---|---|---|
| Accounting / Finance | Event Sourced + CQRS | Audit trail, time-travel, complex reports are core requirements |
| Inventory | Traditional CRUD | Current state is what matters; history is secondary |
| CRM | Traditional CRUD | Relationships and current data matter more than change history |
| Orders / Ecommerce | Event Sourced | Order lifecycle is naturally event-driven |
| Content | CRUD + optional event log | History useful but not legally required; can add event sourcing incrementally |

**Why it matters for Tovu:** The accounting/financial plugin layer is the strongest candidate for event sourcing. The content engine is well-served by the current CRUD + content versions approach. Mixing patterns per bounded context rather than enforcing uniformity is the pragmatic path.

---

