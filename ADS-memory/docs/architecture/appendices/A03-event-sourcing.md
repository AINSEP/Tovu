### A3. Event Sourcing

**What it is:** Instead of storing current state, store the sequence of events that produced that state. Current state is derived by replaying events. The event log is append-only and immutable.

```
Traditional:                    Event Sourced:

invoice record:                 events:
{                               1. InvoiceCreated { customer, date }
  id: 123,                      2. LineAdded { product, qty, price }
  total: 1500,    ◄── snapshot  3. TaxCalculated { amount: 150 }
  status: "paid"                4. InvoicePosted { }
}                               5. PaymentReceived { amount: 1500 }
                                6. InvoiceMarkedPaid { }

                                Current state = replay all events
```

```typescript
// Event definitions (append-only)
type ContentEvent =
  | { type: 'ContentCreated'; data: { id: string; title: string; author: string } }
  | { type: 'ContentPublished'; data: { id: string; publishedAt: Date } }
  | { type: 'ContentDeleted'; data: { id: string; deletedBy: string } };

// Derive state from events — pure function
function deriveContent(events: ContentEvent[]): Content | null {
  return events.reduce((state, event) => {
    switch (event.type) {
      case 'ContentCreated': return { ...event.data, status: 'draft' };
      case 'ContentPublished': return state ? { ...state, status: 'published' } : null;
      case 'ContentDeleted': return null;
      default: return state;
    }
  }, null as Content | null);
}

// Time travel: reconstruct state at any past moment
async function getContentAsOf(id: string, asOf: Date): Promise<Content | null> {
  const events = await db.events
    .find({ streamId: id, timestamp: { $lte: asOf } })
    .sort({ version: 1 });
  return deriveContent(events);
}
```

**Why it matters:** Complete audit trail by construction. Time-travel queries. New read projections can be built at any time by replaying the event log. Immutability is enforced structurally, not by convention.

**When to use for Tovu:** Highest value when Tovu's financial plugins (invoicing, ecommerce) reach compliance requirements — ledgers are historically event-sourced. Also relevant if content revision history needs to go beyond snapshots to support "what changed and why." The `events` table already exists in the Tovu schema; adopting event sourcing fully is an evolution of an existing pattern, not a greenfield migration.

**When NOT to use:** When only current state matters and audit history has no business value. Event versioning (schema migration of old events) is a genuine long-term maintenance cost. Storage grows without bound. Rebuilding projections from a large event log can be slow.

---

