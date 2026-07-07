### A5. Service Mesh

**What it is:** An infrastructure layer that handles service-to-service communication concerns — mutual TLS, retries, circuit breaking, observability, traffic routing — via sidecar proxies, with zero changes to application code.

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

Popular options: Istio (feature-rich, complex), Linkerd (simpler, lighter), Consul Connect, AWS App Mesh.

**Why it matters:** Cross-cutting concerns (mTLS everywhere, distributed tracing, canary deployments, circuit breakers) are handled without touching application code. Language-agnostic — the mesh works regardless of what each service is written in.

**When to use for Tovu:** Only relevant after Tovu has been extracted into 10+ microservices and is running on Kubernetes. At that point the operational complexity of a service mesh is justified by the security and observability return. The sidecar overhead (memory, latency) is too expensive for a monolith or small service count.

**When NOT to use:** Monolith, modular monolith, or fewer than ~10 services. The complexity cost of Istio in particular is significant even for experienced platform teams.

---

