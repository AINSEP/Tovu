# Tovu Architecture

---

## 1. Architectural Foundation

Tovu is built on a combination of four interlocking patterns. These are not arbitrary choices — each one was selected because it solves a specific, concrete problem that an AI-native CMS faces.

### Ports & Adapters (Hexagonal Architecture)

**What it is:** The core system defines interfaces ("ports") for every external dependency. Nothing in the core ever imports a real database driver, HTTP framework, storage SDK, or AI provider. Concrete implementations ("adapters") are injected at startup.

**Why Tovu uses it:** A CMS that will outlive any single framework cannot have opinions baked in. When Drizzle gets abandoned, when the Next.js ecosystem shifts, when a better LLM protocol emerges — the core stays completely untouched. Only the adapter layer changes.

**The rule:** Dependencies point inward only. Core packages import nothing from adapters. Adapters import core packages plus their specific external library.

### Modular Monolith

**What it is:** All packages are deployed together as a single unit, but their internal boundaries are as strict as if they were separate services. Module-to-module communication goes through defined contracts, never through direct internal imports across boundaries.

**Why Tovu uses it:** Microservices introduce network latency, distributed tracing complexity, and deployment overhead that is unnecessary before you have the scale to justify it. The modular monolith gives you clean boundaries and the option to extract services later — without paying the complexity tax now.

**The practical benefit:** A plugin author never needs to worry about service discovery, network failures, or message queues just to extend a content type.

### Domain-Driven Design (DDD)

**What it is:** The software model is organized around the actual domain concepts — not around technical concerns like "controllers" or "services." Each package maps to a bounded context with its own language and responsibility.

**Why Tovu uses it:** A CMS has genuine domain complexity: content has types, schemas, relations, and lifecycle events. Auth has roles, permissions, and policies. Media has transforms, pipelines, and storage strategies. DDD gives each of these its own package with clear ownership, rather than bleeding them into a flat "utils" directory.

**In practice:** `@tovu/content` owns everything about content — schema definition, CRUD operations, relations, validation. It does not own database queries (that is `@tovu/db-*`). It does not own HTTP routes (that is `@tovu/api`).

### Vertical Slices (within packages)

**What it is:** Inside each feature area, code is organized by operation rather than by technical layer. Instead of `controllers/`, `services/`, `repositories/` across the whole codebase, each feature's handler, validation, and data access live together.

**Why Tovu uses it:** When you need to change how "create a content item" works, you change one self-contained slice — not three horizontal layers spread across different directories. Teams can own slices. Features can be deleted cleanly.

---

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

## 4. Port Interfaces

Every external dependency is behind a port. The core only knows about the interface, never the implementation. Adapters are injected at startup — the core has zero knowledge of Drizzle, Prisma, SQL, Postgres, Supabase, or any specific provider.

```typescript
// packages/content/src/port.ts
export interface DatabasePort {
  // Schema operations
  ensureTable(definition: TableDefinition): Promise<void>;
  migrateSchema(plan: MigrationPlan): Promise<MigrationResult>;

  // CRUD — works on abstract records, not SQL
  insert(table: string, data: Record<string, unknown>): Promise<{ id: string }>;
  findById(table: string, id: string): Promise<Record<string, unknown> | null>;
  findMany(table: string, query: ContentQuery): Promise<PaginatedResult>;
  update(table: string, id: string, data: Record<string, unknown>): Promise<void>;
  delete(table: string, id: string): Promise<void>;

  // Transactions
  transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
}

export interface ContentQuery {
  where?: FilterExpression;
  orderBy?: OrderExpression[];
  limit?: number;
  offset?: number;
  include?: string[];  // relations to eager-load
}

// packages/media/src/port.ts
export interface StoragePort {
  upload(key: string, data: ReadableStream, metadata: FileMetadata): Promise<StoredFile>;
  getUrl(key: string, options?: UrlOptions): Promise<string>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StoredFile[]>;
}

// packages/auth/src/port.ts
export interface AuthPort {
  validateSession(token: string): Promise<Session | null>;
  createSession(userId: string): Promise<Session>;
  destroySession(sessionId: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;
}

// packages/ai/src/port.ts
export interface LLMPort {
  complete(params: CompletionParams): Promise<CompletionResult>;
  stream(params: CompletionParams): AsyncIterable<StreamChunk>;
  embed(texts: string[]): Promise<number[][]>;
}

// packages/search/src/port.ts
export interface SearchPort {
  index(collection: string, doc: SearchDocument): Promise<void>;
  search(collection: string, query: SearchQuery): Promise<SearchResult>;
  remove(collection: string, id: string): Promise<void>;
  semantic(collection: string, embedding: number[], limit: number): Promise<SearchResult>;
}
```

### Swappable Adapters per Port

| Port | Current Adapters | Future Options |
|------|-----------------|----------------|
| `DatabasePort` | Drizzle/Postgres, Drizzle/SQLite, Kysely/Turso | Prisma, any SQL driver |
| `StoragePort` | Supabase Storage, S3, Local FS | Cloudflare R2, GCS |
| `AuthPort` | Supabase Auth, Lucia, Clerk, Auth.js | Any OAuth/session provider |
| `SearchPort` | pgvector, Meilisearch, Typesense | Elasticsearch, Algolia |
| `LLMPort` | Claude, GPT, Gemini | Any local or hosted model |

---

## 5. The Kernel (IoC Container)

The kernel is the DI container that wires everything together. No framework, no external dependencies. Pure TypeScript.

```typescript
// packages/kernel/src/tovu.ts

export class Tovu {
  private services = new Map<symbol, unknown>();
  private hooks: HookSystem;
  private plugins: PluginRuntime;
  private _booted = false;

  constructor(private config: TovuConfig) {
    this.hooks = new HookSystem();
    this.plugins = new PluginRuntime(this);
  }

  // ─── Service Registration (Dependency Injection) ────────────

  /**
   * Register a service implementation for a port.
   * This is how adapters plug in.
   */
  register<T>(token: ServiceToken<T>, implementation: T): void {
    if (this._booted) {
      throw new Error(`Cannot register services after boot. Register '${token.description}' earlier.`);
    }
    this.services.set(token, implementation);
  }

  /**
   * Resolve a service. Throws if not registered — fail fast.
   */
  resolve<T>(token: ServiceToken<T>): T {
    const service = this.services.get(token);
    if (!service) {
      throw new Error(
        `Service '${token.description}' not registered. ` +
        `Did you forget to install an adapter?`
      );
    }
    return service as T;
  }

  /**
   * Check if a service is available (for optional dependencies).
   */
  has<T>(token: ServiceToken<T>): boolean {
    return this.services.has(token);
  }

  // ─── Boot Lifecycle ──────────────────────────────────────────

  async boot(): Promise<void> {
    // 1. Validate required services are registered
    this.validateRequired();

    // 2. Emit beforeBoot hook — adapters can do async setup here
    await this.hooks.emit('tovu.beforeBoot', this);

    // 3. Load plugins in dependency order
    await this.plugins.loadAll(this.config.plugins);

    // 4. Run migrations if needed
    if (this.config.autoMigrate) {
      await this.resolve(TOKENS.database).migrateSchema(
        this.resolve(TOKENS.schemaRegistry).getMigrationPlan()
      );
    }

    // 5. Signal ready
    this._booted = true;
    await this.hooks.emit('tovu.booted', this);
  }

  async shutdown(): Promise<void> {
    await this.hooks.emit('tovu.beforeShutdown', this);
    await this.hooks.emit('tovu.shutdown', this);
  }

  private validateRequired(): void {
    const required = [TOKENS.database, TOKENS.storage, TOKENS.auth];
    for (const token of required) {
      if (!this.has(token)) {
        throw new Error(
          `Required service '${token.description}' not registered.\n` +
          `Install an adapter: e.g., @tovu/db-postgres, @tovu/db-sqlite`
        );
      }
    }
  }
}

// Service tokens — typed symbols used for DI
export const TOKENS = {
  database:   Symbol.for('tovu.database') as ServiceToken<DatabasePort>,
  storage:    Symbol.for('tovu.storage')  as ServiceToken<StoragePort>,
  auth:       Symbol.for('tovu.auth')     as ServiceToken<AuthPort>,
  search:     Symbol.for('tovu.search')   as ServiceToken<SearchPort>,
  llm:        Symbol.for('tovu.llm')      as ServiceToken<LLMPort>,
  hooks:      Symbol.for('tovu.hooks')    as ServiceToken<HookSystem>,
} as const;

// Type-safe service token
export type ServiceToken<T> = symbol & { __type?: T };
```

---

## 6. Configuration

`tovu.config.ts` is the user-facing entry point — the single file where a user wires their chosen adapter stack into the core. It is intentionally modeled after the ergonomics of `next.config.ts` and `drizzle.config.ts`.

```typescript
// tovu.config.ts (in the user's project)
import { defineConfig } from '@tovu/sdk';

// Adapters — user chooses their stack
import { postgres }         from '@tovu/db-postgres';
import { supabaseAuth }     from '@tovu/auth-supabase';
import { supabaseStorage }  from '@tovu/storage-supabase';
import { pgSearch }         from '@tovu/search-postgres';
import { honoHttp }         from '@tovu/http-hono';
import { claude }           from '@tovu/ai-claude';

// Plugins
import seo        from '@tovu/plugin-seo';
import analytics  from '@tovu/plugin-analytics';
import ecommerce  from '@tovu/plugin-ecommerce';

export default defineConfig({
  // Database
  database: postgres({
    connectionString: process.env.DATABASE_URL!,
    poolSize: 20,
  }),

  // Auth
  auth: supabaseAuth({
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
  }),

  // Storage
  storage: supabaseStorage({
    bucket: 'media',
  }),

  // Search
  search: pgSearch({
    vectorDimensions: 1536,  // for pgvector
  }),

  // HTTP layer
  http: honoHttp({ port: 3000 }),

  // AI
  ai: claude({
    model: 'claude-sonnet-4-20250514',
  }),

  // Protocols
  protocols: {
    mcp:  { enabled: true },
    a2a:  { enabled: true, agentCard: { name: 'My Site', skills: [] } },
    agui: { enabled: true },
  },

  // Content types (can also be defined in separate files)
  content: {
    types: './content/**/*.ts',  // glob for content type definitions
  },

  // Plugins
  plugins: [
    seo(),
    analytics({ provider: 'plausible' }),
    ecommerce({ currency: 'USD' }),
  ],

  // Theme (optional — headless mode if omitted)
  theme: './theme',
});
```

To swap the entire database, change one import and one line in this file. Everything else — plugins, content types, auth, the whole CMS — is untouched.

---

## 7. Theme Engine

The theme engine in the core knows nothing about React or Vue. It operates on an abstract representation of templates, regions, and slot render instructions. Framework bindings translate this into actual components.

```typescript
// packages/theme/src/types.ts

/**
 * A theme is a collection of templates, settings, and regions.
 * It does NOT contain React/Vue/Svelte components — those live
 * in the framework binding layer.
 */
export interface ThemeDefinition {
  name: string;
  version: string;

  /** Template hierarchy — maps route patterns to template IDs */
  templates: TemplateHierarchy;

  /** Named regions where plugins can inject content */
  regions: string[];

  /** User-configurable settings */
  settings: Record<string, ThemeSettingDefinition>;

  /** Assets (CSS, fonts, images) */
  assets?: ThemeAssets;
}

export interface TemplateHierarchy {
  /** Ordered list of templates to try for each route type */
  rules: TemplateRule[];
  /** Default fallback template */
  fallback: string;
}

export interface TemplateRule {
  /** Pattern: 'single-{contentType}', 'archive-{taxonomy}', 'page-{slug}', etc */
  pattern: string;
  /** Template identifier — resolved by the framework binding */
  template: string;
  /** Priority (higher = tried first) */
  priority?: number;
}

// packages/theme/src/resolver.ts

/**
 * Pure function. Given a route context, returns the template ID to use.
 * No framework dependencies.
 */
export function resolveTemplate(
  hierarchy: TemplateHierarchy,
  context: RouteContext,
): string {
  const sorted = [...hierarchy.rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const rule of sorted) {
    if (matchPattern(rule.pattern, context)) {
      return rule.template;
    }
  }
  return hierarchy.fallback;
}

/**
 * Slots/Regions — plugins register content for named regions.
 * The framework binding decides HOW to render each instruction.
 */
export interface SlotContent {
  pluginId: string;
  slotName: string;
  priority: number;
  /**
   * Framework-agnostic render instruction.
   * Could be: { type: 'html', html: '...' }
   * Or: { type: 'component', componentId: 'seo-meta-tags' }
   * Or: { type: 'data', data: {...} }
   * The framework binding interprets this.
   */
  content: SlotRenderInstruction;
}
```

The framework bindings translate these abstract instructions into actual components:

```typescript
// packages/react/src/hooks/useTemplate.ts
import { resolveTemplate } from '@tovu/theme';

export function useTemplate(context: RouteContext) {
  const tovu = useTovu();
  const templateId = resolveTemplate(tovu.theme.hierarchy, context);
  // Dynamic import of the React component for this template
  const Component = tovu.theme.components.get(templateId);
  return Component;
}

// packages/react/src/components/TovuSlot.tsx
export function TovuSlot({ name, context }: { name: string; context?: any }) {
  const tovu = useTovu();
  const slotContents = tovu.theme.getSlotContents(name);

  return (
    <>
      {slotContents
        .sort((a, b) => a.priority - b.priority)
        .map((slot) => (
          <SlotRenderer key={slot.pluginId} instruction={slot.content} />
        ))}
    </>
  );
}
```

---

## 8. Plugin SDK

Plugin authors never interact with ports, adapters, or the kernel directly. They receive a scoped, sandboxed API that only exposes what their declared `permissions` grant access to.

```typescript
// Using @tovu/sdk to write a plugin

import { definePlugin } from '@tovu/sdk';

export default definePlugin({
  name: 'tovu-seo',
  version: '1.0.0',

  // Declare what you need — if you don't declare it, you can't use it
  permissions: [
    'content.read',
    'content.extendSchema',
    'hooks.filter.page.head',
    'admin.panel',
  ],

  setup(tovu) {
    // tovu here is a SCOPED API — not the full kernel.
    // It only exposes what `permissions` declared.

    // Extend any content type with SEO fields
    tovu.content.extendType('*', {
      fields: {
        seoTitle:       { type: 'text',  label: 'SEO Title',        group: 'seo' },
        seoDescription: { type: 'text',  label: 'Meta Description', group: 'seo' },
        ogImage:        { type: 'media', label: 'OG Image',         group: 'seo' },
      },
    });

    // Filter: inject meta tags into page head
    tovu.hooks.addFilter('page.head', async (head, { content }) => {
      const title = content.seoTitle || content.title;
      const desc = content.seoDescription || '';
      return head + `<meta property="og:title" content="${title}">` +
                     `<meta property="og:description" content="${desc}">`;
    });

    // Register admin panel — returns a framework-agnostic descriptor,
    // NOT a React component. The binding layer resolves it.
    tovu.admin.registerPanel({
      id: 'seo-settings',
      label: 'SEO',
      icon: 'search',
      component: {
        pluginId: 'tovu-seo',
        exportPath: './admin/SeoPanel',
      },
    });

    // Register as MCP tool — automatically exposed to AI agents
    tovu.ai.registerTool({
      name: 'analyze_seo',
      description: 'Analyze SEO score for a piece of content',
      parameters: {
        contentId: { type: 'string', description: 'ID of the content to analyze' },
      },
      execute: async ({ contentId }) => {
        const content = await tovu.content.findById(contentId);
        return analyzeSeo(content);
      },
    });
  },
});
```

**Key design decisions in the Plugin SDK:**

- `permissions` is a declare-before-use model. A plugin cannot access anything it has not declared. The sandbox enforces this at runtime.
- `admin.registerPanel` accepts a framework-agnostic component descriptor, not a React component. The framework binding resolves the actual component. This means the same plugin works across React and Vue admin UIs.
- `ai.registerTool` automatically bridges to MCP, A2A, and AG-UI. Plugin authors register a tool once; the protocol layer handles exposure to all AI agent protocols.

---

## 9. API Layer

Routes are defined as pure data structures, then mounted by whichever HTTP adapter the user chose. The core never imports Hono, Express, or Fastify.

```typescript
// packages/api/src/routes.ts

export function defineTovuRoutes(tovu: Tovu): RouteDefinition[] {
  return [
    // Content API
    {
      method: 'GET',
      path: '/api/content/:type',
      middleware: [authenticate, requirePermission('content.read')],
      handler: async (req) => {
        const items = await tovu.resolve(TOKENS.content).findMany(
          req.params.type,
          parseQuery(req.query),
        );
        return { status: 200, body: items };
      },
    },
    {
      method: 'POST',
      path: '/api/content/:type',
      middleware: [authenticate, requirePermission('content.create')],
      handler: async (req) => {
        const created = await tovu.resolve(TOKENS.content).create(
          req.params.type,
          req.body,
        );
        return { status: 201, body: created };
      },
    },
    // ... more routes
  ];
}

// packages/http-hono/src/adapter.ts — mounts the pure route definitions on Hono
import { Hono } from 'hono';
import { defineTovuRoutes } from '@tovu/api';

export function createHonoApp(tovu: Tovu): Hono {
  const app = new Hono();
  const routes = defineTovuRoutes(tovu);

  for (const route of routes) {
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    app[method](route.path, async (c) => {
      // Adapt Hono's context to Tovu's Request interface
      const tovuReq = adaptHonoRequest(c);

      // Run middleware chain
      for (const mw of route.middleware) {
        const result = await mw(tovuReq);
        if (result?.earlyReturn) return c.json(result.body, result.status);
      }

      const result = await route.handler(tovuReq);
      return c.json(result.body, result.status);
    });
  }

  return app;
}
```

The same `defineTovuRoutes` function is used by `@tovu/http-express`, `@tovu/http-fastify`, and `@tovu/http-bun`. Each adapter only needs to implement the translation from its framework's request/response types to Tovu's internal `Request` interface.

---

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

## 11. Architecture Enforcement

Architectural rules are not just documented — they are enforced by tooling so that violations are caught at build time, not in code review.

```typescript
// 1. TypeScript project references enforce compile-time boundaries.
// Each package's tsconfig.json lists explicit allowed references.
// If @tovu/kernel tries to import @tovu/db-postgres, tsc will fail.

// 2. Custom ESLint plugin: @tovu/lint-architecture
// Rules:
//   - @tovu/kernel cannot import from any other @tovu/* package
//   - @tovu/content can only import from @tovu/kernel
//   - @tovu/db-* can import from @tovu/content + their external DB lib
//   - @tovu/react can import from @tovu/kernel, @tovu/content, @tovu/theme + react
//   - NO circular dependencies anywhere

// 3. package.json exports maps control what is public API vs internal.
// packages/kernel/package.json
{
  "exports": {
    ".":         "./src/index.ts",
    "./hooks":   "./src/hooks/index.ts",
    "./internal": null            // Explicitly blocked — no package can reach internals
  }
}
```

**Why this matters:** Architecture rot almost always starts with a "temporary" shortcut — a core package importing a specific DB utility directly, or a plugin importing from another plugin's internals. These three layers of enforcement (TypeScript references, ESLint rules, exports maps) make that shortcut a build failure rather than a code smell.

---

## 12. Swappability Examples

These are the concrete scenarios the architecture is designed to handle:

**Scenario: Next.js dies, everyone moves to $NEW_THING**
Write a new `@tovu/new-thing` binding. Core untouched. Plugins untouched. Themes need new templates but all business logic stays.

**Scenario: Drizzle gets abandoned, Prisma 6 is amazing**
Write a new `@tovu/db-prisma` adapter implementing `DatabasePort`. Swap one line in `tovu.config.ts`. Everything else — content types, auth, plugins, AI tools — untouched.

**Scenario: You want to support Cloudflare Workers (no Node APIs)**
Core is already pure TS with no Node dependencies. Write `@tovu/http-workers` adapter. Use `@tovu/db-turso` (edge-native SQLite). Done.

**Scenario: React falls out of favor**
The admin UI needs rewriting — that is real work. But every plugin's business logic, every content type, every hook, every AI tool, every content schema is completely untouched. The new Vue/Svelte/Solid admin just implements the same framework-agnostic component descriptors.

**Scenario: A better AI protocol replaces MCP**
Add a new sub-module in `@tovu/protocol`. Existing MCP tools auto-bridge to the new protocol. Plugin authors change nothing.

**Scenario: You need to run multiple LLM providers**
Register multiple implementations against different tokens. The `LLMPort` interface is the same — you can have `claude` for generation and `openai` for embeddings, each registered under a different service token.

---

The fundamental trade-off: this architecture requires more work upfront because you are building interfaces before implementations. In return, it makes the right things easy to change and the wrong things hard to break. For a project intended to outlive any single framework or infrastructure provider, this is the correct bet.

---

## 13. User Friction Coverage (Living Backlog)

This section maps the major user-frustration clusters into architecture capabilities Tovu must support over time.
It is intentionally a living backlog, not a claim that everything below is already solved.
Reference corpus: `docs/user-complaints/` contains the raw complaint research that motivates this backlog; review it if restarting or reprioritizing.
Current planning checkpoint: `AI-Dev-Shop/reports/swarm-consensus/runs/2026-03-24-191415-consensus-report.md` captures the latest Codex + Claude synthesis on starting sequence and early slices; use it as supporting context, not as a replacement for this document.

### 13.1 Main Issue Families to Solve

These are the primary clusters to keep in focus. The earlier "top 10" list was a priority cut, not the full main set.

| ID | User-Visible Failure Pattern | Required Capability (What Tovu Must Do) | Swappable Seam (Port/Module) |
|---|---|---|---|
| UF-01 | A routine core/plugin/theme update breaks production (500s, layout collapse, admin lockout). | Preflight checks, canary rollout, automatic rollback to last-known-good, and safe-mode boot path. | `UpdateSafetyPort` + `ReleasePolicyEngine` |
| UF-02 | Users see generic "critical error" messages and cannot identify root cause quickly. | Error fingerprinting, dependency blame, guided remediation steps, and one-click recovery actions. | `IncidentAnalysisPort` + `RecoveryOrchestrator` |
| UF-03 | Multiple extensions interact unpredictably, causing non-deterministic failures. | Deterministic dependency graph, conflict isolation, plugin capability boundaries, and temporary quarantine mode. | `ExtensionGraphPort` + `ConflictIsolationRuntime` |
| UF-04 | Vulnerable/compromised extensions lead to hacks, redirects, spam pages, and repeat infections. | Continuous risk scoring, integrity checks, auto-quarantine policies, and cleanup playbooks with audit trail. | `ExtensionTrustPort` + `SecurityPolicyEngine` |
| UF-05 | CWV/TTFB remain poor despite caching/plugins; teams cannot find the real bottleneck. | Bottleneck attribution across DB/app/assets/network, performance budgets, and regression blocking. | `PerfAnalysisPort` + `PerfBudgetPolicy` |
| UF-06 | Ecommerce updates or migrations break checkout, payment, or order integrity. | Checkout preflight harness, migration guardrails, transactional rollback, and post-deploy health verification. | `CommerceReliabilityPort` + `CheckoutHarness` |
| UF-07 | Editor/FSE changes are confusing; template edits break pages with unclear recovery path. | Template versioning, route-to-template explainers, UI guardrails, and one-click revert for theme/editor states. | `AuthoringSafetyPort` + `TemplateStateManager` |
| UF-08 | Content saves fail, revisions corrupt, or data disappears after operations. | Transactional writes, save-retry with clear error classes, integrity checks, and robust revision recovery. | `ContentIntegrityPort` + `RevisionEngine` |
| UF-09 | PHP/runtime/host config drift causes sudden runtime failures after upgrades. | Environment compatibility scanner, runtime policy profiles, and pre-upgrade validation gates. | `EnvironmentCompatPort` + `RuntimePolicyEngine` |
| UF-10 | Admin is cluttered with upsells/noise; operators miss critical alerts. | Unified notification center, strict notification API contracts, and priority-based alert channels. | `AdminSignalPort` + `NotificationPolicyEngine` |
| UF-11 | Ecosystem governance changes create trust risk around update provenance and policy shifts. | Verifiable update provenance, immutable change log, and explicit policy controls for trust boundaries. | `ProvenancePort` + `GovernancePolicyLayer` |
| UF-12 | Plugin/platform prices shift unexpectedly and blow up multi-site budgets. | Cost observability, renewal forecasting, and policy-based budget thresholds/alerts. | `CostControlPort` + `LicensingPolicyEngine` |
| UF-13 | Teams need to migrate in/out without SEO loss, broken URLs, or schema lock-in. | Canonical export contracts, redirect mapping, validation tooling, and reversible migration plans. | `MigrationPort` + `PortabilitySchema` |
| UF-14 | Multi-user editing is brittle ("locked post"), with poor collaboration ergonomics. | Robust concurrency model, presence/locking policy, and conflict-aware merge workflows. | `CollaborationPort` + `SyncConflictResolver` |
| UF-15 | Local/staging/prod drift causes "works in staging, fails in prod" releases. | First-class preview environments, environment parity checks, and declarative deployment workflows. | `DeliveryWorkflowPort` + `PreviewEnvManager` |
| UF-16 | Authoring quality suffers due to accessibility regressions and weak media workflows. | A11y linting in editor, contrast/semantic checks, media diagnostics, and transform safety rails. | `ContentQualityPort` + `MediaQualityPipeline` |

### 13.2 Architectural Requirement: Solve Friction in a Swappable Way

Every user-friction capability should be implemented as a bounded module with a stable port contract, so better solutions can replace old ones without rewiring the core.

Required shape for each capability:

- Define a dedicated port in core (`UpdateSafetyPort`, `IncidentAnalysisPort`, `PerfAnalysisPort`, etc.).
- Keep policies/rules declarative and versioned (not hardcoded into adapters).
- Support multiple adapters per capability (built-in engine, third-party service, hybrid).
- Enforce contract tests so adapters are interchangeable by behavior, not naming.
- Record decisions with explicit replaceability constraints (ADR per capability).
- Gate rollout behind feature flags and policy profiles for incremental adoption.

### 13.3 Planned Capability Tracks

These tracks organize implementation so the backlog is actionable and modular.

| Track | Primary Clusters | First Concrete Milestones |
|---|---|---|
| T1: Reliability Guardrails | UF-01, UF-02, UF-03, UF-08 | Preflight update runner, safe-mode boot, incident timeline, one-click rollback. |
| T2: Security and Trust | UF-04, UF-11 | Extension integrity scanner, quarantine flow, signed artifact verification, immutable change ledger. |
| T3: Performance and Scale | UF-05, UF-06, UF-09 | Runtime profiler with attribution, checkout health harness, environment compatibility gate. |
| T4: Authoring and UX | UF-07, UF-10, UF-14, UF-16 | Template revert system, route explainer, unified admin inbox, editor a11y/media checks. |
| T5: Platform Operations | UF-12, UF-13, UF-15 | License/cost dashboard, canonical export contract, preview-branch workflow with parity checks. |

### 13.4 Implementation Rule

No friction fix should be added as a one-off special case inside kernel internals.
If a fix cannot be expressed behind a stable interface and tested as a swappable module, redesign it before shipping.

---

## 14. Meta-Coding Framework (Spec-First + Test-First + Pattern-First)

Tovu adopts a Meta-Coding workflow: AI is an execution engine, while humans own intent, constraints, and acceptance quality.
This is mandatory for core packages and strongly recommended for plugins/themes.

### 14.1 Delivery Stages

| Stage | Goal | Required Artifacts | Exit Gate |
|---|---|---|---|
| M0: Problem Framing | Clarify why this work exists | Problem statement, user impact, non-goals | Scope is explicit and testable |
| M1: Blueprint Spec | Define what must be built | Spec with functional requirements, constraints, acceptance criteria | No ambiguous requirements remain |
| M2: Foreman Selection | Define how it must be built | Pattern selection (ports/adapters, DDD boundaries, slice ownership), ADR | Dependency direction and module seams are fixed |
| M3: Test Contracting | Define proof before implementation | Contract tests for ports, integration tests for critical flows, failure-mode tests | Tests fail for missing behavior and pass for baseline |
| M4: Thin Vertical Slice | Build smallest production-valid path | One slice implementation + observability + rollback path | Slice passes tests and deploy checks |
| M5: Incremental Expansion | Extend safely by slice | Additional slices, migration notes, updated risk log | No architecture boundary regressions |
| M6: Hardening and Review | Stabilize and operationalize | Performance/security checks, runbooks, docs updates | Release readiness approved |

### 14.2 Non-Negotiable Rules

- No code generation before M1 (spec) and M2 (architecture decision) are written.
- No adapter merge without contract tests for the target port.
- No core dependency inversion violations (enforced by lint + project references).
- No critical feature ships without rollback or safe-disable path.
- No "temporary" direct dependency on provider SDKs inside core/domain packages.

### 14.3 Vibe-Coding Policy

Vibe-coding is allowed only for bounded exploration:

- Use vibe spikes to explore UX, API shapes, and algorithm feasibility.
- Keep spikes isolated under `experiments/` and out of core runtime paths.
- Promote spike code only by rewriting against the approved spec and tests.
- If spike behavior cannot be specified and tested, it does not graduate.

### 14.4 Architecture Pattern Guidance

Pattern selection must be problem-matched, not trend-matched:

- Default: Modular Monolith + Ports/Adapters + DDD boundaries + Vertical Slices.
- Add CQRS when read/write pressures diverge materially.
- Add Event Sourcing only where auditability/time-travel is a hard requirement.
- Extract microservices only when a module has distinct scaling/deployability needs.
- Prefer replacing adapters over rewriting domain logic when new tools emerge.

### 14.5 Recommended Tooling Posture

- Use Spec Kit (or equivalent) to standardize spec artifacts and implementation plans.
- Keep ADRs in-repo and linked from each major module.
- Maintain a contract-test suite per port (`AuthPort`, `StoragePort`, `SearchPort`, etc.).
- Treat architecture checks as CI gates, not code review suggestions.

---

## Appendix: Architectural Patterns Reference

> This section is a general knowledge repository. These patterns are not all currently used by Tovu, but are documented here for future reference when architectural decisions need to be revisited.

---

### A1. Vertical Slice Architecture (Jimmy Bogard)

**What it is:** Organize code by feature/operation rather than by horizontal technical layer. Every feature owns its own handler, validation, and data access in one place.

```
Traditional Layers:              Vertical Slices:

├── controllers/                 ├── features/
│   ├── invoice.ts               │   ├── create-invoice/
│   └── customer.ts              │   │   ├── handler.ts
├── services/                    │   │   ├── validator.ts
│   └── invoice.ts               │   │   └── repository.ts
├── repositories/                │   └── pay-invoice/
│   └── ...                      │       ├── handler.ts
└── models/                      │       └── repository.ts
```

**Why it matters:** Changing one feature touches one directory, not three horizontal layers. Features can be deleted cleanly. Teams can own slices independently.

**When to use for Tovu:** Tovu already applies vertical slices _within_ its bounded-context packages (e.g., inside `@tovu/content`, each operation is a self-contained slice). If the package structure ever flattens under pressure, this is the pattern to return to.

**When NOT to use:** When shared logic between features is substantial — slices can duplicate code without discipline.

---

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

### A8. MCP (Model Context Protocol)

**What it is:** Anthropic's open standard for connecting AI models to external tools, resources, and data sources. Often described as "USB for AI" — a single standardized interface that any agent or model can use to discover and invoke capabilities.

**Why it matters:** Agents can discover tools dynamically at runtime. Plugins written once are callable by any MCP-compatible AI system (Claude, GPT, local models). Removes the need for bespoke per-model integrations.

**When to use for Tovu:** Already a first-class concern — `@tovu/protocol/mcp` generates an MCP server from the tool registry. Every plugin that calls `tovu.ai.registerTool()` is automatically exposed over MCP. The pattern to maintain: tools are registered once in the domain layer; the protocol layer handles exposure.

```typescript
import { MCPServer } from '@anthropic-ai/mcp';

const server = new MCPServer({
  name: 'cms-content-tools',
  version: '1.0.0',
  tools: [
    {
      name: 'search_content',
      description: 'Semantic search across all CMS content',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          contentType: { type: 'string', enum: ['post', 'page', 'all'] },
          limit: { type: 'number', default: 10 }
        },
        required: ['query']
      },
      handler: async ({ query, contentType, limit }) => {
        const embedding = await embed(query);
        return db.contents.select()
          .where(contentType !== 'all' ? { type: contentType } : {})
          .orderBy(sql`embedding <-> ${embedding}`)
          .limit(limit);
      }
    }
  ],
  resources: [
    {
      uri: 'content://posts/{id}',
      name: 'Single Post',
      mimeType: 'application/json',
      handler: async ({ id }) => db.contents.findUnique({ where: { id } })
    }
  ]
});

server.listen({ port: 3001 });
```

---

### A9. AG-UI (Agent-User Interaction Protocol)

**What it is:** CopilotKit's emerging standard for bidirectional communication between AI agents and UI layers. Goes beyond a chat interface — agents can stream live UI components, pause for human confirmation, and share reactive state with the frontend.

**Why it matters:** Enables agents to render structured UI (grids, forms, previews) rather than plain text. Human-in-the-loop flows (approve before save, confirm before delete) are first-class, not bolted-on. The UI updates in real time as the agent works.

**Key capabilities:**

| Feature | Description |
|---|---|
| Streaming Tool Calls | UI updates as agent executes each step |
| Generative UI | Agent dynamically creates React components |
| Human Confirmation | Agent pauses; UI presents approve/reject |
| Shared State | Agent and UI share reactive state object |
| Action Suggestions | Agent surfaces clickable next-step buttons |

**When to use for Tovu:** The `CopilotPanel` in `@tovu/react/admin` is the natural integration point. AG-UI is most valuable when the AI copilot performs multi-step operations (search → preview → confirm save) where streaming intermediate UI is better UX than a final text response.

```typescript
// Server-side agent streams UI events
class ContentAgent extends Agent {
  async *handleMessage(message: string) {
    yield { type: 'status', message: 'Searching content...' };

    const results = await this.tools.search_content({ query: message });

    // Stream a rendered grid component, not a text list
    yield {
      type: 'generative_ui',
      component: 'ContentGrid',
      props: { items: results, onSelect: 'select_content' }
    };

    yield {
      type: 'suggestions',
      actions: [
        { label: 'Create new post', tool: 'create_draft' },
        { label: 'Refine search', tool: 'search_content' }
      ]
    };
  }
}

// Client-side React
function AdminDashboard() {
  const { messages, sendMessage, pendingToolCalls } = useCopilot({
    agent: '/api/content-agent',
  });

  return (
    <CopilotProvider>
      <CopilotPanel>
        {pendingToolCalls.map(call => (
          <ToolCallCard
            key={call.id}
            call={call}
            onApprove={() => call.approve()}
            onReject={() => call.reject()}
          />
        ))}
        <CopilotInput onSend={sendMessage} />
      </CopilotPanel>
    </CopilotProvider>
  );
}
```

---

### A10. Compound AI Systems

**What it is:** Orchestrated pipelines of specialized AI components rather than a single large model doing everything. A router classifies the request, a retriever fetches context, a generator produces output, and a verifier checks quality.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Router    │────▶│  Retriever  │────▶│  Generator  │
│  (classify) │     │   (RAG)     │     │  (Claude)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                    │
       │            ┌──────┴──────┐             │
       │            ▼             ▼             │
       │      ┌─────────┐   ┌─────────┐        │
       │      │ Vector  │   │  Graph  │        │
       │      │   DB    │   │   DB    │        │
       │      └─────────┘   └─────────┘        │
       │                                        │
       ▼                                        ▼
┌─────────────┐                        ┌─────────────┐
│   Direct    │                        │  Verifier   │
│   Answer    │                        │  (quality   │
│  (no RAG)   │                        │   check)    │
└─────────────┘                        └─────────────┘
```

**Why it matters:** Better quality through specialization. Cost optimization — use a small model for routing and classification, a large model only for generation. Each component is independently swappable and testable.

**When to use for Tovu:** When the AI copilot needs to handle a wide range of request types (search, create, edit, analyze, explain) with different resource requirements. The router prevents every request from going to the most expensive model. DSPy can be used to optimize the pipeline's prompts automatically against quality metrics.

```python
import dspy

class ContentPipeline(dspy.Module):
    def __init__(self):
        self.router = dspy.ChainOfThought("query -> intent: create|edit|search|analyze")
        self.searcher = dspy.RAG(k=5)
        self.creator = dspy.ChainOfThought("topic, style -> draft_content")
        self.verifier = dspy.ChainOfThought("output, intent -> is_valid: bool, issues: list")

    def forward(self, query: str, context: dict = None):
        intent = self.router(query=query).intent

        if intent == "search":
            return {"type": "search_results", "data": self.searcher(query)}
        elif intent == "create":
            draft = self.creator(topic=query, style=context.get("style", "professional"))
            verification = self.verifier(output=draft, intent=intent)
            return {"type": "draft", "data": draft, "warnings": verification.issues}
```

---

### A11. Agentic RAG

**What it is:** Retrieval-Augmented Generation where the agent controls the retrieval process — deciding when to retrieve, reformulating queries when results are insufficient, verifying source relevance, and iterating until confidence is high enough.

| Traditional RAG | Agentic RAG |
|---|---|
| Single fixed query → retrieve → generate | Multiple retrieval cycles |
| Fixed retrieval strategy | Adaptive strategy per query |
| No relevance verification | Agent evaluates and rejects poor results |
| Static chunking | Dynamic context assembly |

**Why it matters:** Substantially better answer quality for complex queries. The agent can fill gaps by reformulating, resolve contradictions between sources, and fall back to web search when the internal corpus is insufficient.

**When to use for Tovu:** When the AI copilot is answering questions about a site's content corpus, or when the ecommerce/analytics plugins need to synthesize answers across multiple data sources. Simpler single-pass RAG is fine for straightforward semantic search; Agentic RAG is worth the added latency for research-type queries.

```typescript
class AgenticRAG {
  async retrieve(query: string): Promise<RetrievalResult> {
    let currentQuery = query;
    let allResults: Document[] = [];

    for (let i = 0; i < 5; i++) {
      const results = await this.vectorSearch(currentQuery, { limit: 10 });
      allResults = [...allResults, ...results];

      const evaluation = await this.evaluateRelevance(results, query);

      if (evaluation.isComplete) break;

      if (evaluation.needsMoreContext) {
        // Reformulate to fill identified gaps
        currentQuery = await this.reformulateQuery(query, results, evaluation.missingAspects);
        continue;
      }

      break;
    }

    const ranked = await this.rerankResults(allResults, query);
    return { documents: ranked.slice(0, 10), confidence: this.calculateConfidence(ranked) };
  }
}
```

---

### A12. Tool-Use-First Architecture

**What it is:** Every agent action — including reasoning, responding, and searching — is expressed as a structured tool call. The agent never produces unstructured free text as its primary output mode; everything goes through the tool interface.

**Why it matters:**

| Benefit | Description |
|---|---|
| Full Observability | Every agent step is a structured, loggable record |
| Human-in-the-Loop | Any tool call can be intercepted for approval before execution |
| Testability | Assert on structured tool calls, not on prose output |
| No Hallucinated Actions | Agent cannot claim to have done something without a tool call record |
| Composability | Tools are reusable across multiple agents |

**When to use for Tovu:** Already the design principle in `@tovu/ai`. The `tool_choice: { type: 'required' }` flag enforces this on every agent call. The "thinking tool" pattern makes agent reasoning visible and debuggable without exposing it to users.

```typescript
const cmsAgentTools = {
  // Makes reasoning observable — logged but not shown to user
  think: {
    description: 'Reason through a problem before acting.',
    parameters: z.object({
      observation: z.string(),
      plan: z.array(z.string()),
      decision: z.string()
    }),
    handler: async (input) => ({ acknowledged: true })
  },

  save_content: {
    description: 'Save content to database. Requires prior draft.',
    parameters: z.object({ draft: ContentSchema, status: z.enum(['draft', 'published']) }),
    requiresApproval: true, // Pause for human confirmation
    handler: async ({ draft, status }) => contentService.save({ ...draft, status })
  },

  // Even the response to the user is a tool call
  respond_to_user: {
    description: 'Send a message to the user.',
    parameters: z.object({
      message: z.string(),
      suggestedActions: z.array(z.string()).optional()
    }),
    handler: async (input) => ({ delivered: true })
  }
};

// Force structured output — no raw text responses
const response = await claude.messages.create({
  messages: [{ role: 'user', content: userMessage }],
  tools: buildToolDefinitions(cmsAgentTools),
  tool_choice: { type: 'required' }
});
```

---

### A13. Memory Architectures

**What it is:** Multi-tier memory systems that give agents context beyond the current conversation window. Four distinct memory types serve different temporal and semantic purposes.

| Type | Description | Storage |
|---|---|---|
| **Working Memory** | Current task context, active variables | In-context window |
| **Episodic Memory** | Past interactions with this user | Vector store with timestamps |
| **Semantic Memory** | Learned facts about entities (users, content, site) | Knowledge graph |
| **Procedural Memory** | How to do specific tasks well | Few-shot examples from past successes |

**Why it matters:** Agents with only working memory forget everything between sessions. Episodic memory enables personalization. Semantic memory prevents re-asking for known facts. Procedural memory improves task performance over time.

**When to use for Tovu:** `@tovu/ai/memory` implements this pattern already (working, episodic, semantic tiers). Procedural memory (storing successful task approaches as few-shot examples) is the logical next addition as the copilot accumulates session history.

```typescript
class AgentMemory {
  async recall(query: string, context: RecallContext): Promise<MemoryRecall> {
    // Retrieve from all tiers in parallel
    const [episodic, semantic, procedural] = await Promise.all([
      this.recallEpisodic(query, context),     // Past interactions
      this.recallSemantic(query, context),     // Known entity facts
      this.recallProcedural(context.taskType)  // Relevant past task examples
    ]);

    return this.synthesize(episodic, semantic, procedural);
  }

  async remember(interaction: Interaction): Promise<void> {
    // Store in episodic memory with embedding
    await this.episodic.insert({
      embedding: await embed(interaction.summary),
      metadata: { userId: interaction.userId, timestamp: interaction.timestamp },
      content: interaction.summary
    });

    // Extract entities into semantic memory (knowledge graph)
    for (const entity of interaction.entities) {
      await this.semantic.upsertEntity(entity);
    }

    // If successful task, store as procedural example
    if (interaction.success && interaction.taskType) {
      this.procedural.store(interaction.taskType, {
        input: interaction.input,
        reasoning: interaction.reasoning,
        output: interaction.output
      });
    }
  }
}
```

---

### A14. Structured Outputs / Constrained Decoding

**What it is:** Force models to produce valid, schema-conforming JSON at the token level — not via prompt instructions, but via constrained sampling during inference. The output is guaranteed to match a Zod/JSON Schema definition.

**Why it matters:** 100% valid structured output with no parsing errors. Full TypeScript type safety on the result. Eliminates defensive parsing code and retry logic for malformed responses.

**When to use for Tovu:** Everywhere the AI layer produces structured data consumed by the application — content analysis, SEO scoring, metadata extraction, schema generation. The `tool_choice: { type: 'tool', name: 'X' }` pattern on Anthropic's API is already the implementation of this.

```typescript
const ContentAnalysisSchema = z.object({
  seoScore: z.number().min(0).max(100),
  readabilityGrade: z.number().min(1).max(12),
  issues: z.array(z.object({
    type: z.enum(['seo', 'grammar', 'style', 'accessibility']),
    severity: z.enum(['low', 'medium', 'high']),
    message: z.string(),
    suggestion: z.string()
  })),
  summary: z.string()
});

// Output is GUARANTEED to match the schema — no defensive parsing needed
const response = await claude.messages.create({
  messages: [{ role: 'user', content: `Analyze: ${content}` }],
  tools: [{ name: 'analyze_content', input_schema: zodToJsonSchema(ContentAnalysisSchema) }],
  tool_choice: { type: 'tool', name: 'analyze_content' }
});

const analysis = response.content[0].input as z.infer<typeof ContentAnalysisSchema>;
// TypeScript knows: analysis.seoScore is number, analysis.issues[0].severity is 'low'|'medium'|'high'
```

---

### A15. Prompt Caching

**What it is:** Mark the static portions of a prompt (system instructions, few-shot examples, tool definitions) for server-side caching. On subsequent requests, the cached portion is not re-processed — only the variable user message is.

**Why it matters:** Up to 90% cost reduction on cached portions. Meaningfully lower latency. Makes long, detailed system prompts (style guides, content schemas, tool lists) economically viable in production.

**When to use for Tovu:** Any admin session where the user makes multiple requests shares the same system prompt. The CMS system prompt — content type definitions, style guide, available tools, few-shot examples — can be thousands of tokens and stays static across all requests in a session. Cache it.

```typescript
const response = await claude.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: [
    {
      type: 'text',
      text: longSystemPrompt,      // Content types, style guide, tool descriptions
      cache_control: { type: 'ephemeral' }  // Cache this block
    },
    {
      type: 'text',
      text: fewShotExamples,       // Worked examples of content operations
      cache_control: { type: 'ephemeral' }  // Cache this block too
    }
  ],
  messages: [
    { role: 'user', content: userMessage }  // Only this varies per request
  ]
});

// First request in a session: full prompt processed
// Subsequent requests: cache hit on system + examples; only user message billed at full rate
// Cost implication: cache hit tokens billed at ~10% of input token rate (Anthropic pricing)
// Cache TTL: ~5 minutes of inactivity
```

---

### A16. Local-First / Sync Engines (Electric SQL)

**What it is:** The browser holds a full local copy of relevant data in SQLite. All reads and writes are instant (local). A sync engine propagates changes to and from the server in the background, with conflict resolution built in.

**Why it matters:** Zero-latency UI updates. Offline capability. No optimistic update boilerplate — writes are local and therefore always succeed immediately.

| Solution | Description |
|---|---|
| Electric SQL | Postgres that syncs to SQLite in browser |
| PowerSync | Offline-first, mobile focus |
| Triplit | Full relational DB in browser |
| cr-sqlite | CRDTs built into SQLite |

**When to use for Tovu:** The content editor is the highest-value candidate. Autosave, collaborative editing, and draft management all benefit from local-first semantics. If Tovu ever adds a mobile admin app, local-first becomes essential rather than optional.

**When NOT to use:** Multi-user real-time collaboration on the same document requires CRDT-aware sync (Yjs integration), which adds complexity. Start with local-first for single-user editing flows first.

```typescript
import { electrify } from 'electric-sql';

const electric = await electrify(sqliteDb, schema, {
  url: 'https://api.myapp.com/electric'
});

// Reactive query — re-renders automatically when sync delivers changes
const { results: posts } = useLiveQuery(
  electric.db.contents.liveMany({
    where: { type: 'post', status: 'published' },
    orderBy: { publishedAt: 'desc' }
  })
);

// Write is instant (local SQLite) — sync happens in background
async function createPost(data: NewPost) {
  await electric.db.contents.create({
    data: { id: generateId(), ...data, status: 'draft', createdAt: new Date() }
  });
  // UI updates immediately. Server receives the change asynchronously.
}
```

---

### A17. HTAP (Hybrid Transactional/Analytical Processing)

**What it is:** A single database that handles both OLTP (transactional reads/writes) and OLAP (analytical aggregations) without a separate data warehouse or ETL pipeline.

**Why it matters:** Real-time analytics on live operational data. No sync lag between operational DB and analytics DB. Eliminates a class of infrastructure (Kafka, ETL jobs, data warehouse).

| Solution | Description |
|---|---|
| TiDB | MySQL-compatible, built for HTAP |
| SingleStore | Real-time analytics on operational data |
| ClickHouse | Columnar, increasingly used as primary OLTP+analytics store |
| DuckDB | Embedded analytics, runs in browser or edge |
| AlloyDB | Google's PostgreSQL with analytics acceleration |

**When to use for Tovu:** When the analytics plugin needs real-time dashboards (content performance, plugin revenue, user behavior) and the operational Postgres becomes a bottleneck for analytical queries. ClickHouse with a `ReplacingMergeTree` is a strong fit for content + event data.

**When NOT to use:** Early stage. Postgres with proper indexing and materialized views handles analytical load well until there is concrete evidence of bottleneck. HTAP adds operational complexity and a different query model.

```typescript
// ClickHouse handles both transactional inserts and analytical aggregations
const client = createClient({ host: 'https://your-clickhouse.com' });

// Transactional insert
await client.insert({
  table: 'contents',
  values: [{ ...content, version: Date.now() }],
  format: 'JSONEachRow'
});

// Analytical query on live data — no ETL lag
const metrics = await client.query({
  query: `
    SELECT type, status, count() as count,
           countIf(created_at >= now() - INTERVAL 7 DAY) as created_last_week
    FROM contents
    WHERE workspace_id = {workspaceId:UUID}
    GROUP BY type, status
  `,
  query_params: { workspaceId }
});
```

---

### A18. Embedded Databases / SQLite Renaissance (Turso, D1)

**What it is:** SQLite deployed at the edge or per-tenant, with replication, branching, and distributed read replicas. Each user or workspace gets their own database instance. Reads are sub-millisecond because data is co-located with compute.

**Why it matters:** Horizontal scale by isolation — no shared database bottleneck. Per-tenant isolation is structural, not just logical. Edge deployments can have truly local data.

| Solution | Description |
|---|---|
| Turso / libSQL | SQLite with global replication and git-style branches |
| LiteFS | Distributed SQLite on Fly.io |
| Cloudflare D1 | SQLite at the edge (Cloudflare Workers) |
| rqlite | Distributed SQLite with Raft consensus |

**When to use for Tovu:** The `@tovu/db-turso` adapter already exists. The pattern is particularly valuable for a SaaS deployment of Tovu where each customer workspace gets its own Turso database — complete isolation, no noisy-neighbor problem, and database branching for preview environments becomes trivial.

```typescript
// Each workspace gets its own isolated database
async function getWorkspaceDB(workspaceId: string) {
  return createClient({
    url: `libsql://${workspaceId}.turso.io`,
    authToken: process.env.TURSO_TOKEN
  });
}

// Create an isolated branch for a PR preview deployment
async function createPreviewBranch(workspaceId: string, prNumber: number) {
  const response = await fetch(
    `https://api.turso.tech/v1/databases/${workspaceId}/branches`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.TURSO_API_TOKEN}` },
      body: JSON.stringify({ name: `preview-pr-${prNumber}` })
    }
  );
  return response.json(); // Full copy of production data, completely isolated
}
```

---

### A19. Vector Databases Going Hybrid (pgvector in Postgres)

**What it is:** Vector similarity search embedded directly into an existing relational database rather than in a separate purpose-built vector store. Hybrid queries combine semantic similarity, full-text search, and relational filters in a single query.

**Why it matters:** One database — no sync between an operational DB and a separate vector store. Vectors update atomically with the rest of the record. Hybrid queries are possible without a join across two systems.

| Solution | Description |
|---|---|
| pgvector | Vectors in Postgres (HNSW and IVFFlat indexes) |
| sqlite-vec | Vectors in SQLite |
| Turbopuffer | Serverless vectors optimized for RAG |
| LanceDB | Embedded vector DB |

**When to use for Tovu:** Already in use — the `contents` and `agent_memories` tables have `embedding vector(1536)` columns with HNSW indexes, and `@tovu/search-postgres` implements hybrid search. The pattern to maintain: embeddings live in the same row as the content they represent, updated in the same transaction.

```typescript
// Hybrid search: semantic score + full-text score + relational filters — single query
async function hybridSearch(query: string, filters: SearchFilters) {
  const embedding = await embed(query);

  return db.$queryRaw`
    SELECT
      id, title, type, status,
      1 - (embedding <=> ${embedding}::vector) as semantic_score,
      ts_rank(search_vector, plainto_tsquery('english', ${query})) as text_score,
      (
        0.6 * (1 - (embedding <=> ${embedding}::vector)) +
        0.4 * ts_rank(search_vector, plainto_tsquery('english', ${query}))
      ) as combined_score
    FROM contents
    WHERE
      workspace_id = ${filters.workspaceId}
      AND status = 'published'
      AND embedding <=> ${embedding}::vector < 0.5
    ORDER BY combined_score DESC
    LIMIT ${filters.limit || 10}
  `;
}
```

---

### A20. Graph Capabilities in SQL (Apache AGE)

**What it is:** Graph query capabilities (Cypher query language, node/edge model) added as an extension to Postgres, enabling graph traversals without a separate graph database.

**Why it matters:** Content relationships, taxonomy hierarchies, permission inheritance, and "users who viewed X also viewed Y" recommendation graphs are naturally modeled as graphs. Apache AGE makes these queries possible in Postgres without a separate Neo4j or similar system.

| Solution | Description |
|---|---|
| Apache AGE | Cypher graph queries in Postgres |
| Kùzu | Embedded graph DB |
| TypeDB | Graph + type system |

**When to use for Tovu:** When content recommendations, internal link graphs, or permission inheritance chains need to be queried with multi-hop traversals. Simpler relationship queries (direct `JOIN`) are fine with standard SQL; the graph extension pays off when query depth is variable (e.g., "find all content reachable within 3 links from this post").

```sql
-- Enable Apache AGE
CREATE EXTENSION IF NOT EXISTS age;
SELECT create_graph('content_graph');

-- Query: recommend content via multi-hop graph traversal
SELECT * FROM cypher('content_graph', $$
  MATCH (start:Content {id: $contentId})

  OPTIONAL MATCH (start)-[:LINKS_TO]->(direct)
  OPTIONAL MATCH (start)-[:IN_CATEGORY]->(cat)<-[:IN_CATEGORY]-(sameCategory)
  OPTIONAL MATCH (start)<-[:VIEWED]-(user)-[:VIEWED]->(alsoViewed)

  WITH COLLECT(DISTINCT direct) +
       COLLECT(DISTINCT sameCategory) +
       COLLECT(DISTINCT alsoViewed) as candidates
  UNWIND candidates as candidate

  RETURN candidate.id, candidate.title, count(*) as score
  ORDER BY score DESC
  LIMIT 10
$$, $params) as (id agtype, title agtype, score agtype);
```

---

### A21. Database Branching (Neon, PlanetScale)

**What it is:** Treat a database like a git repository — create branches from the main database that are fully isolated copies (using copy-on-write), run migrations or tests on the branch, and delete it when done.

**Why it matters:** Preview deployments get a real copy of production data, fully isolated. Schema migrations can be tested without risk to production. Instant rollback — just don't merge the branch. No more "staging is out of sync with production."

| Solution | Description |
|---|---|
| Neon | Postgres with copy-on-write branches (instant) |
| PlanetScale | MySQL with branching and non-blocking schema changes |
| Turso | SQLite with branches |
| Supabase | Postgres branching (beta) |

**When to use for Tovu:** Preview deployments in a SaaS context. Safe migration testing. Neon is the strongest option for the Postgres-primary stack — branches are created in seconds using copy-on-write, not full data copies.

```typescript
// Create an isolated Neon branch for a PR preview
async function createPreviewBranch(prNumber: number) {
  const response = await fetch(
    'https://console.neon.tech/api/v2/projects/{project_id}/branches',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}` },
      body: JSON.stringify({
        branch: { name: `preview-pr-${prNumber}`, parent_id: 'main' },
        endpoints: [{ type: 'read_write' }]
      })
    }
  );
  const { branch, endpoints } = await response.json();
  return { branchId: branch.id, connectionString: endpoints[0].connection_uri };
}

// Test a migration on a branch before applying to production
async function testMigration(sql: string) {
  const { connectionString } = await createPreviewBranch('migration-test');
  const testDb = neon(connectionString);
  try {
    await testDb.transaction(async (tx) => {
      await tx.raw(sql);
      await runMigrationTests(tx); // Verify integrity after migration
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await deleteBranch('migration-test');
  }
}
```

---

### A22. Incremental View Maintenance

**What it is:** Materialized views that update incrementally as underlying data changes, rather than being fully recomputed on a schedule. New events flow through a streaming SQL engine and the view reflects changes in milliseconds.

**Why it matters:** Real-time derived data (trending content, content performance scores, live dashboards) without the cost of re-running expensive aggregation queries on every page load. The view is always up to date; queries against it are instant.

| Solution | Description |
|---|---|
| Materialize | Streaming SQL with incremental views |
| ReadySet | Cache layer with incremental view support |
| Feldera | Incremental compute engine |

**When to use for Tovu:** When the analytics plugin needs live dashboards over high-volume event data (page views, engagement events) that would be too expensive to query directly on each request. Materialize maintains views like `trending_content` and `content_performance` incrementally; the dashboard query is a simple `SELECT` against the pre-maintained result.

```sql
-- Connect to Postgres CDC stream
CREATE SOURCE content_events
FROM POSTGRES CONNECTION pg_connection
PUBLICATION 'content_changes';

-- Incrementally maintained view — updates in milliseconds, not on full recompute
CREATE MATERIALIZED VIEW trending_content AS
SELECT
  content_id,
  count(*) as view_count,
  count(DISTINCT user_id) as unique_viewers,
  max(viewed_at) as last_viewed
FROM page_views
WHERE viewed_at > mz_now() - INTERVAL '1 hour'
GROUP BY content_id
ORDER BY view_count DESC;

-- Dashboard query — instant, reads precomputed result
SELECT * FROM trending_content LIMIT 10;
```

---

### A23. Edge-First Architecture

**What it is:** Design for edge deployment from the start — compute runs at CDN nodes close to users worldwide. No centralized origin for the hot path. Static assets, database reads, and even AI inference happen at the edge.

**Why it matters:** Sub-50ms latency globally. Linear scale with no single bottleneck. Resilience — no single region failure takes down the system.

**When to use for Tovu:** The `@tovu/db-turso` and `@tovu/http-bun` adapters already support edge deployment. The pattern is most valuable for the public-facing site (content delivery) where read latency is user-visible. The admin UI is lower priority for edge deployment.

**When NOT to use:** Operations requiring strong consistency across writes, complex server-side sessions, or Node.js-specific APIs. The admin mutation path (create, publish, delete content) does not need edge deployment.

```typescript
// Cloudflare Workers — database and AI at the edge
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cache = caches.default;

    // Edge cache check first
    let response = await cache.match(request);
    if (response) return response;

    // SQLite at the edge (D1) — sub-millisecond read
    const content = await env.DB.prepare(
      `SELECT * FROM contents WHERE slug = ? AND status = 'published'`
    ).bind(url.pathname.slice(1)).first();

    if (!content) return new Response('Not Found', { status: 404 });

    // AI inference at the edge (Workers AI)
    const summary = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `Summarize in one sentence: ${content.body.slice(0, 1000)}`
    });

    response = new Response(renderHTML(content, summary), {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600'
      }
    });

    await cache.put(request, response.clone());
    return response;
  }
};
```

---

### A24. Islands Architecture

**What it is:** Server-render the entire page as static HTML, then selectively hydrate only the interactive components ("islands"). The majority of the page ships zero JavaScript.

**Why it matters:** Minimal JavaScript bundle. Fast initial paint. Progressive enhancement — the page is readable before any JS loads. Interactive components are isolated and can hydrate lazily.

**When to use for Tovu:** The public-facing site rendered by Astro is the natural fit. Content pages are mostly static — the reading experience needs no JS. Interactive islands (search, comments, AI assistant) hydrate independently and lazily.

**When NOT to use:** The admin UI is inherently interactive and state-heavy. Islands architecture would be fighting against the grain for an editor with real-time collaboration, drag-and-drop, and live previews.

```astro
---
// Server-only: runs at build time or on server
const { content } = Astro.props;
---
<html>
<body>
  <!-- Static — zero JavaScript shipped -->
  <Header />
  <article>
    <h1>{content.title}</h1>
    <div set:html={content.body} />
  </article>

  <!-- Interactive island: hydrates immediately on load -->
  <SearchBar client:load />

  <!-- Interactive island: hydrates when scrolled into view (lazy) -->
  <AIAssistant client:visible contentId={content.id} />

  <!-- Interactive island: hydrates only when user interacts -->
  <ShareMenu client:idle />

  <!-- Static — zero JavaScript -->
  <Footer />
</body>
</html>
```

---

### A25. React Server Components

**What it is:** React components that run exclusively on the server. They can access databases directly, never ship to the client bundle, and stream HTML progressively. Client components (interactive) are opt-in via `'use client'`.

**Why it matters:** Zero client bundle cost for server components. Direct database access without an API layer for data fetching. Streaming — content appears as it is ready rather than waiting for the full page.

**When to use for Tovu:** The Next.js starter (`@tovu/create-tovu-next`) uses RSC via the App Router. The admin dashboard benefits from RSC for the data-heavy parts (content lists, analytics summaries) while keeping `'use client'` for the editor and interactive components.

```tsx
// Server Component — runs on server only, no client bundle cost
// Can query DB directly, can be async
export default async function ContentPage({ params }: { params: { id: string } }) {
  // Direct DB access — no useEffect, no loading state, no API call
  const content = await db.contents.findUnique({ where: { id: params.id } });
  const [related, analysis] = await Promise.all([
    findRelatedContent(content),
    analyzeContent(content.body)
  ]);

  return (
    <div>
      <h1>{content.title}</h1>
      <AISummary analysis={analysis} /> {/* Also a Server Component */}

      {/* 'use client' boundary — this ships to browser */}
      <ContentEditor content={content} />

      {/* Streams in after the above — doesn't block initial render */}
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments contentId={content.id} /> {/* Server Component, loads async */}
      </Suspense>
    </div>
  );
}
```

---

### A26. Effect Systems (Effect-TS)

**What it is:** A TypeScript library that makes errors, dependencies, and concurrency explicit in the type system. Every effectful operation declares what it can fail with and what services it requires. Retries, timeouts, and cancellation are compositional primitives.

**Why it matters:** Typed errors — the compiler tells you exactly what can go wrong. Explicit dependencies — no hidden coupling through imports or globals. Automatic retry and timeout behavior without manual wiring. Dramatically reduces runtime surprises in production.

**When to use for Tovu:** Strong candidate for the core operation pipeline in `@tovu/content` and the AI layer. The `DBError | ValidationError | NotFoundError` pattern eliminates the class of bugs where an error type is swallowed or mishandled. The dependency injection model aligns naturally with Tovu's port/adapter design.

**When NOT to use:** Effect-TS has a steep learning curve. Introduce it incrementally in new subsystems rather than as a wholesale migration. Do not use it in plugin-facing APIs — plugin authors should not need to learn Effect to write a basic plugin.

```typescript
import { Effect, pipe, Schedule } from 'effect';

// The type signature tells you exactly what this operation can do:
// - Success: returns Content
// - Failures: NotFoundError | ValidationError | DBError
// - Dependencies: requires ContentService and AIService to be provided
const publishContent = (id: string): Effect.Effect<
  Content,
  NotFoundError | ValidationError | DBError,
  ContentService | AIService
> => pipe(
  // Get content — can fail with NotFoundError
  Effect.flatMap(ContentService, s => s.get(id)),

  // Validate — can fail with ValidationError
  Effect.flatMap(content =>
    content.body.length < 100
      ? Effect.fail(new ValidationError(['Body must be at least 100 characters']))
      : Effect.succeed(content)
  ),

  // Save — can fail with DBError
  Effect.flatMap(content =>
    Effect.flatMap(ContentService, s =>
      s.save({ ...content, status: 'published' })
    )
  ),

  // Retry DB errors up to 3 times with exponential backoff
  Effect.retry({ times: 3, schedule: Schedule.exponential('100ms') }),

  // Hard timeout — operation must complete within 10 seconds
  Effect.timeout('10 seconds')
);

// Run with provided dependencies — compiler enforces all deps are present
const result = await Effect.runPromise(
  publishContent('content-id-123').pipe(
    Effect.provideService(ContentService, contentServiceImpl),
    Effect.provideService(AIService, aiServiceImpl)
  )
);
```
