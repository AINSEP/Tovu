## 10. Dependency Rules

This is the most critical thing to enforce. A single wrong import direction can collapse swappability across the entire system.

```
                    ┌──────────┐
                    │  kernel  │  ← imports NOTHING
                    └────┬─────┘
           ┌─────────────┼─────────────┬──────────────┐
           ▼             ▼             ▼              ▼
      ┌────────┐   ┌─────────┐   ┌────────┐    ┌─────────┐
      │content │   │  auth   │   │ media  │    │  theme  │
      └───┬────┘   └────┬────┘   └───┬────┘    └────┬────┘
          │              │            │              │
          ▼              ▼            ▼              ▼
      ┌─────────────────────────────────────────────────┐
      │                     api                          │
      └──────────────────────┬──────────────────────────┘
                             │
      ┌──────────────────────┼──────────────────────────┐
      │                      │                           │
      ▼                      ▼                           ▼
 ┌──────────┐         ┌──────────┐              ┌──────────────┐
 │http-hono │         │http-     │              │http-fastify  │
 │          │         │express   │              │              │
 └──────────┘         └──────────┘              └──────────────┘

 ┌──────────┐         ┌──────────┐              ┌──────────────┐
 │db-       │         │db-sqlite │              │db-turso      │
 │postgres  │         │          │              │              │
 └──────────┘         └──────────┘              └──────────────┘

 ┌──────────┐         ┌──────────┐              ┌──────────────┐
 │ react    │         │  vue     │              │  svelte      │
 │ bindings │         │ bindings │              │  bindings    │
 └──────────┘         └──────────┘              └──────────────┘

RULE: Arrows point DOWN only. Nothing below can import anything above.
      Core packages NEVER import adapters.
      Adapters import core packages + their specific external lib.
      Framework bindings import core + their specific framework.
```

---

