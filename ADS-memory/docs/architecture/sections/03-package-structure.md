## 3. Package Structure

Every package has a clear dependency direction. Core packages import nothing from adapters.

```
tovu/
├── packages/
│   │
│   │── ── CORE (zero framework deps, pure TS) ──────────
│   │
│   ├── kernel/                  # The heart — boots everything
│   │   ├── src/
│   │   │   ├── tovu.ts          # Main Tovu class / IoC container
│   │   │   ├── hooks/           # Event & filter system
│   │   │   ├── registry/        # Service registry / DI
│   │   │   └── lifecycle.ts     # Boot, init, shutdown
│   │   ├── package.json         # deps: NONE (maybe only typescript)
│   │   └── tsconfig.json
│   │
│   ├── content/                 # Content engine — schema, CRUD, relations
│   │   ├── src/
│   │   │   ├── schema/          # Content type definitions & registry
│   │   │   │   ├── types.ts     # ContentTypeDefinition, FieldDefinition
│   │   │   │   ├── registry.ts  # Register, resolve, validate schemas
│   │   │   │   └── migration-generator.ts  # Schema → DB migration plan
│   │   │   ├── operations/      # create, read, update, delete, query
│   │   │   │   ├── types.ts     # Pure operation interfaces
│   │   │   │   └── executor.ts  # Runs ops through hooks pipeline
│   │   │   ├── relations.ts     # Relation types & resolution
│   │   │   └── validation.ts    # Field validation (pure functions)
│   │   ├── package.json         # deps: @tovu/kernel only
│   │   └── tsconfig.json
│   │
│   ├── auth/                    # Auth abstractions — roles, permissions, policies
│   │   ├── src/
│   │   │   ├── types.ts         # User, Role, Permission, Session (interfaces)
│   │   │   ├── rbac.ts          # Role-based access control engine
│   │   │   ├── policies.ts      # Content-level permission policies
│   │   │   └── port.ts          # AuthProvider port interface
│   │   └── package.json         # deps: @tovu/kernel
│   │
│   ├── media/                   # Media abstractions — upload, transform, optimize
│   │   ├── src/
│   │   │   ├── types.ts         # MediaAsset, MediaTransform interfaces
│   │   │   ├── pipeline.ts      # Transform pipeline (resize, optimize, etc)
│   │   │   └── port.ts          # StorageProvider port interface
│   │   └── package.json         # deps: @tovu/kernel
│   │
│   ├── theme/                   # Theme engine — template resolution, regions, settings
│   │   ├── src/
│   │   │   ├── types.ts         # Theme, Template, Region, Slot interfaces
│   │   │   ├── resolver.ts      # Template hierarchy resolution
│   │   │   ├── settings.ts      # Theme settings registry
│   │   │   └── renderer.ts      # Abstract render pipeline (NO React/Vue)
│   │   └── package.json         # deps: @tovu/kernel, @tovu/content
│   │
│   ├── plugin/                  # Plugin system — loading, sandboxing, lifecycle
│   │   ├── src/
│   │   │   ├── types.ts         # PluginDefinition, PluginManifest
│   │   │   ├── loader.ts        # Discover & load plugins
│   │   │   ├── sandbox.ts       # Permission enforcement
│   │   │   ├── sdk-builder.ts   # Builds the scoped API a plugin receives
│   │   │   └── dependency.ts    # Dependency resolution & ordering
│   │   └── package.json         # deps: @tovu/kernel
│   │
│   ├── ai/                      # AI context engine — memory, RAG, agent orchestration
│   │   ├── src/
│   │   │   ├── context/         # The 6-layer context assembler
│   │   │   │   ├── types.ts     # ContextLayer, ContextWindow
│   │   │   │   ├── assembler.ts # Compiles context for LLM calls
│   │   │   │   └── layers/      # System, memory, retrieval, tools, history, task
│   │   │   ├── memory/          # Working, episodic, semantic memory
│   │   │   │   ├── types.ts     # MemoryStore port interface
│   │   │   │   ├── working.ts   # Session-scoped volatile memory
│   │   │   │   ├── episodic.ts  # Cross-session behavior patterns
│   │   │   │   └── semantic.ts  # Site knowledge graph
│   │   │   ├── tools/           # Tool registry for MCP
│   │   │   │   ├── types.ts     # ToolDefinition, ToolResult
│   │   │   │   └── registry.ts  # Register tools, resolve by name
│   │   │   └── port.ts          # LLMProvider port (Claude, GPT, Gemini, local)
│   │   └── package.json         # deps: @tovu/kernel, @tovu/content
│   │
│   ├── protocol/                # Protocol layer — MCP, A2A, AG-UI abstractions
│   │   ├── src/
│   │   │   ├── mcp/             # MCP server generation from tools/content
│   │   │   ├── a2a/             # A2A agent card, task lifecycle
│   │   │   ├── ag-ui/           # AG-UI event types, state sync
│   │   │   └── types.ts         # Shared protocol primitives
│   │   └── package.json         # deps: @tovu/kernel, @tovu/ai
│   │
│   ├── api/                     # API layer — framework-agnostic route definitions
│   │   ├── src/
│   │   │   ├── routes.ts        # Route definitions as pure data
│   │   │   ├── handlers.ts      # Handler functions (Request → Response)
│   │   │   ├── middleware.ts    # Auth, rate-limit, cors as composable fns
│   │   │   └── serialization.ts # Response formatting
│   │   └── package.json         # deps: @tovu/kernel, @tovu/content, @tovu/auth
│   │
│   │── ── DATABASE ADAPTERS ──────────────────────────
│   │
│   ├── db-postgres/             # Postgres adapter via Drizzle
│   │   ├── src/
│   │   │   ├── adapter.ts       # Implements DatabasePort
│   │   │   ├── schema-gen.ts    # ContentType → Drizzle schema → SQL
│   │   │   ├── migrations.ts    # Migration runner
│   │   │   └── query-builder.ts # ContentQuery → Drizzle query
│   │   └── package.json         # deps: @tovu/content, drizzle-orm, pg
│   │
│   ├── db-sqlite/               # SQLite adapter (for dev, edge, embedded)
│   ├── db-turso/                # Turso/LibSQL adapter (edge-native)
│   │
│   │── ── STORAGE ADAPTERS ───────────────────────────
│   │
│   ├── storage-supabase/
│   ├── storage-s3/
│   ├── storage-local/
│   │
│   │── ── AUTH ADAPTERS ──────────────────────────────
│   │
│   ├── auth-supabase/
│   ├── auth-lucia/
│   ├── auth-clerk/
│   │
│   │── ── SEARCH ADAPTERS ────────────────────────────
│   │
│   ├── search-postgres/         # pg_trgm + pgvector
│   ├── search-meilisearch/
│   ├── search-typesense/
│   │
│   │── ── HTTP ADAPTERS ──────────────────────────────
│   │
│   ├── http-hono/               # Mounts @tovu/api routes on Hono
│   │   ├── src/adapter.ts       # TovuRoute → Hono route
│   │   └── package.json         # deps: @tovu/api, hono
│   │
│   ├── http-express/
│   ├── http-fastify/
│   ├── http-bun/                # Native Bun.serve
│   │
│   │── ── FRAMEWORK BINDINGS (UI) ────────────────────
│   │
│   ├── react/                   # React bindings
│   │   ├── src/
│   │   │   ├── hooks/           # useContent, useTheme, useTovu, useCopilot
│   │   │   ├── components/      # <TovuSlot>, <RichText>, <MediaImage>
│   │   │   ├── admin/           # Admin UI components (React-specific)
│   │   │   │   ├── ContentEditor.tsx
│   │   │   │   ├── MediaBrowser.tsx
│   │   │   │   ├── SchemaDesigner.tsx
│   │   │   │   └── CopilotPanel.tsx
│   │   │   └── provider.tsx     # <TovuProvider> context wrapper
│   │   └── package.json         # deps: @tovu/kernel, @tovu/content, react
│   │
│   ├── vue/                     # Vue bindings (same pattern)
│   │   ├── src/
│   │   │   ├── composables/     # useContent, useTheme, useTovu
│   │   │   ├── components/      # <TovuSlot>, <RichText>
│   │   │   └── plugin.ts        # Vue plugin installer
│   │   └── package.json
│   │
│   ├── svelte/                  # Svelte bindings
│   │   └── ...
│   │
│   │── ── STARTER KITS (full apps, import everything) ──
│   │
│   ├── create-tovu-next/        # Next.js starter
│   │   └── template/
│   │       ├── app/             # Next.js App Router
│   │       ├── tovu.config.ts   # Wires up adapters
│   │       └── package.json     # deps: @tovu/*, next, react
│   │
│   ├── create-tovu-nuxt/        # Nuxt starter
│   ├── create-tovu-astro/       # Astro starter
│   ├── create-tovu-hono/        # API-only (headless CMS mode)
│   │
│   │── ── CLI ────────────────────────────────────────
│   │
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts      # tovu init (interactive setup)
│   │   │   │   ├── dev.ts       # tovu dev (start dev server)
│   │   │   │   ├── build.ts     # tovu build
│   │   │   │   ├── migrate.ts   # tovu migrate (run DB migrations)
│   │   │   │   ├── plugin.ts    # tovu plugin add/remove/list
│   │   │   │   └── generate.ts  # tovu generate types/client
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   │── ── SDK (what plugin authors import) ───────────
│   │
│   └── sdk/                     # Re-exports clean public API
│       ├── src/
│       │   ├── index.ts         # Main entry: definePlugin, defineTheme, etc
│       │   ├── plugin.ts        # Plugin authoring types & helpers
│       │   ├── theme.ts         # Theme authoring types & helpers
│       │   └── content.ts       # Content type definition helpers
│       └── package.json         # deps: @tovu/kernel, @tovu/content, @tovu/theme
│
├── plugins/                     # First-party plugins (use @tovu/sdk)
│   ├── seo/
│   ├── forms/
│   ├── analytics/
│   └── ecommerce/
│
├── themes/                      # Reference themes
│   ├── starter-react/           # Uses @tovu/react
│   ├── starter-vue/             # Uses @tovu/vue
│   └── starter-astro/           # Uses @tovu/astro (hypothetical)
│
├── turbo.json                   # Turborepo config
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

