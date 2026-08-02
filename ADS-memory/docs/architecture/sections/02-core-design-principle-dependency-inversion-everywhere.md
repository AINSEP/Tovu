## 2. Core Design Principle: Dependency Inversion Everywhere

The central thesis of Tovu's architecture is that the core has **zero opinions** about rendering, HTTP framework, database, or UI library. It defines interfaces (ports), and everything else is an adapter.

```
┌─────────────────────────────────────────────────────────────┐
│                    ADAPTERS (swap these)                     │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Next.js  │ │ Nuxt/Vue │ │ Astro    │ │ SvelteKit    │  │
│  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter      │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘  │
│       └─────────────┼───────────┼───────────────┘          │
│                     │           │                           │
│  ┌──────────┐ ┌─────┴─────┐ ┌──┴───────┐ ┌─────────────┐  │
│  │ Hono     │ │ Express   │ │ Fastify  │ │ Bun.serve   │  │
│  │ HTTP     │ │ HTTP      │ │ HTTP     │ │ HTTP        │  │
│  └────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       └─────────────┼────────────┘               │         │
│                     │                            │         │
├─────────────────────┼────────────────────────────┼─────────┤
│                     ▼                            ▼         │
│              CORE (pure TypeScript, zero deps)              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Tovu Kernel                                         │   │
│  │  ┌───────────┐ ┌───────────┐ ┌──────────────────┐  │   │
│  │  │ Hook      │ │ Content   │ │ Plugin Runtime   │  │   │
│  │  │ System    │ │ Engine    │ │ (Loader+Sandbox) │  │   │
│  │  └───────────┘ └───────────┘ └──────────────────┘  │   │
│  │  ┌───────────┐ ┌───────────┐ ┌──────────────────┐  │   │
│  │  │ Auth      │ │ Theme     │ │ AI Context       │  │   │
│  │  │ Abstractions│ │ Engine  │ │ Engine           │  │   │
│  │  └───────────┘ └───────────┘ └──────────────────┘  │   │
│  │  ┌───────────┐ ┌───────────┐ ┌──────────────────┐  │   │
│  │  │ Schema    │ │ Media     │ │ Protocol Layer   │  │   │
│  │  │ Registry  │ │ Manager   │ │ (MCP/A2A/AG-UI)  │  │   │
│  │  └───────────┘ └───────────┘ └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                    PORT INTERFACES                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Database │ │ Storage  │ │ Auth     │ │ Search       │  │
│  │ Port     │ │ Port     │ │ Provider │ │ Port         │  │
│  │          │ │          │ │ Port     │ │              │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘  │
│       │            │            │               │          │
├───────┼────────────┼────────────┼───────────────┼──────────┤
│       ▼            ▼            ▼               ▼          │
│              ADAPTERS (swap these too)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Drizzle/ │ │ Supabase │ │ Supabase │ │ pgvector     │  │
│  │ Postgres │ │ Storage  │ │ Auth     │ │              │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────┤  │
│  │ Drizzle/ │ │ S3       │ │ Lucia    │ │ Meilisearch  │  │
│  │ SQLite   │ │          │ │          │ │              │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────┤  │
│  │ Kysely/  │ │ Local FS │ │ Auth.js  │ │ Typesense    │  │
│  │ Turso    │ │          │ │          │ │              │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

