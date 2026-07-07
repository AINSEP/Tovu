### A4. Microservices

**What it is:** Each domain module is deployed as an independent service with its own process, database, and deployment lifecycle. Services communicate over the network (HTTP, gRPC, or message queues).

```
Modular Monolith (now):          Microservices (later, if needed):

┌──────────────────────────┐     ┌──────────┐  ┌──────────┐
│     ONE DEPLOYMENT        │     │ Content  │  │  Auth    │
│  ┌────────┐  ┌─────────┐  │     │ Service  │  │ Service  │
│  │Content │  │  Auth   │  │ ──► └────┬─────┘  └────┬─────┘
│  │ Module │  │ Module  │  │          │              │
│  └────────┘  └─────────┘  │          └──────┬───────┘
│  ┌────────┐  ┌─────────┐  │              Message Bus
│  │ Media  │  │ Plugin  │  │
│  │ Module │  │ Runtime │  │
│  └────────┘  └─────────┘  │
└──────────────────────────┘
```

**Why it matters:** Independent scaling per service, independent deployment, independent technology choices per service. The natural end state for systems that have outgrown a monolith.

**When to use for Tovu:** The modular monolith's strict package boundaries are designed to make this extraction viable. The signal to extract is: a specific module (e.g., the plugin runtime or the AI layer) has materially different scaling characteristics — it needs to scale horizontally independent of the rest of the system, or needs separate deployment cadence. Module-to-module communication through defined contracts today maps directly to service boundaries tomorrow.

**When NOT to use:** Before there is real operational evidence that the monolith is the bottleneck. Microservices add distributed systems complexity (network failures, distributed tracing, eventual consistency between services, service discovery) that is pure overhead at early scale. Start modular, extract on evidence.

---

