### A6. Architecture Comparison Table

| Architecture | Best When | Avoid When |
|---|---|---|
| Ports & Adapters | Swappability matters; dependencies will change | Simple CRUD app with stable single provider |
| Vertical Slices | Large team, many features, feature-focused delivery | Small team where shared logic dominates |
| CQRS | Read and write access patterns diverge significantly | Simple app where queries and mutations are symmetric |
| Event Sourcing | Audit trail required; time-travel queries needed | "Just need current state"; no compliance requirement |
| Microservices | Independent scaling needed; large org; proven monolith bottleneck | Starting out; small team; before scaling evidence |
| Modular Monolith | Starting out; need clean future extraction path | Already at scale with proven need to split |
| DDD | Complex domain; domain experts available; long-lived project | Simple CRUD; solo dev; short-lived project |
| Service Mesh | 10+ microservices; strict security/compliance; Kubernetes already | Monolith; small service count; no Kubernetes |

---

