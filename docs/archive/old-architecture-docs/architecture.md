This is a really important architectural decision — you're essentially building a **framework-agnostic core** with adapters/bindings for specific runtimes. This is how the best long-lived open source projects work (Prisma, TanStack, Drizzle, tRPC all follow this pattern).

Let me think through how this fundamentally restructures everything.

---

# The Core Principle: Dependency Inversion Everywhere

The central idea is that your core has **zero opinions** about rendering, HTTP framework, or UI library. It defines interfaces (ports), and everything else is an adapter. This is hexagonal architecture (ports & adapters) applied to an entire CMS platform.

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

## Monorepo Structure

This is where it gets concrete. The key insight: **every package has a clear dependency direction, and the core packages import nothing from adapters.**

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
│   │   │   ├── middleware.ts     # Auth, rate-limit, cors as composable fns
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
│   │   └── ...
│   │
│   ├── db-turso/                # Turso/LibSQL adapter (edge-native)
│   │   └── ...
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

## The Key Architecture Patterns

### 1. Port Interfaces (How the Core Stays Pure)

Every external dependency is behind a port. The core only knows about the interface, never the implementation:

```typescript
// packages/content/src/port.ts
// This is the ONLY thing the core knows about databases.
// It has ZERO knowledge of Drizzle, Prisma, SQL, Postgres, etc.

export interface DatabasePort {
  // Schema operations
  ensureTable(definition: TableDefinition): Promise<void>;
  migrateSchema(plan: MigrationPlan): Promise<MigrationResult>;

  // CRUD - works on abstract records, not SQL
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

### 2. The Kernel (IoC Container + Service Registry)

The kernel is the DI container that wires everything together. No framework, no dependencies. Pure TypeScript:

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

    // 2. Initialize content engine (schema registry)
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
    // Cleanup resources
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

### 3. The Configuration File (How Users Wire It Up)

This is the user-facing entry point — similar to `next.config.ts` or `drizzle.config.ts`:

```typescript
// tovu.config.ts (in the user's project)
import { defineConfig } from '@tovu/sdk';

// Adapters — user chooses their stack
import { postgres }      from '@tovu/db-postgres';
import { supabaseAuth }  from '@tovu/auth-supabase';
import { supabaseStorage } from '@tovu/storage-supabase';
import { pgSearch }       from '@tovu/search-postgres';
import { honoHttp }       from '@tovu/http-hono';
import { claude }         from '@tovu/ai-claude';

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
    mcp: { enabled: true },
    a2a: { enabled: true, agentCard: { name: 'My Site', skills: [] } },
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

### 4. Theme Engine (Framework-Agnostic)

This is where the architecture gets interesting. The theme engine in the core knows nothing about React or Vue. It works with **an abstract render tree**:

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
  // Try each rule in priority order
  const sorted = [...hierarchy.rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of sorted) {
    if (matchPattern(rule.pattern, context)) {
      return rule.template;
    }
  }

  return hierarchy.fallback;
}

/**
 * Slots/Regions — plugins can register content for named regions.
 * The framework binding decides HOW to render them.
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

Then the framework bindings translate this into actual components:

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

### 5. Plugin SDK (What Plugin Authors Actually See)

Plugin authors never interact with ports or adapters. They get a scoped, sandboxed API:

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
        seoTitle: { type: 'text', label: 'SEO Title', group: 'seo' },
        seoDescription: { type: 'text', label: 'Meta Description', group: 'seo' },
        ogImage: { type: 'media', label: 'OG Image', group: 'seo' },
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
      // This tells the framework binding: "load the component
      // exported from this plugin at this path"
      component: {
        pluginId: 'tovu-seo',
        exportPath: './admin/SeoPanel',
      },
    });

    // Register as MCP tool (automatically exposed to AI agents)
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

### 6. The API Layer (Framework-Agnostic Route Definitions)

Routes are defined as pure data structures, then mounted by whichever HTTP adapter the user chose:

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

// packages/http-hono/src/adapter.ts
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

---

## The Dependency Graph (What Can Import What)

This is the most important thing to enforce. If you get this wrong, you lose swappability:

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

## Enforcing the Architecture

You need tooling to prevent architecture rot:

```typescript
// In turbo.json or a custom lint rule

// 1. Use TypeScript project references to enforce boundaries
// Each package's tsconfig.json lists explicit references

// 2. Use a tool like @tovu/lint-architecture (custom ESLint plugin)
// Rules:
//   - @tovu/kernel cannot import from any other @tovu/* package
//   - @tovu/content can only import from @tovu/kernel
//   - @tovu/db-* can import from @tovu/content + their external DB lib
//   - @tovu/react can import from @tovu/kernel, @tovu/content, @tovu/theme + react
//   - NO circular dependencies

// 3. Use `package.json` exports maps to control what's public
// packages/kernel/package.json
{
  "exports": {
    ".": "./src/index.ts",        // Public API only
    "./hooks": "./src/hooks/index.ts",
    "./internal": null            // Block internal imports
  }
}
```

## What This Architecture Buys You

**Scenario: Next.js dies, everyone moves to $NEW_THING**
→ Write a new `@tovu/new-thing` binding. Core untouched. Plugins untouched. Themes need new templates but logic stays.

**Scenario: Drizzle gets abandoned, Prisma 6 is amazing**
→ Write a new `@tovu/db-prisma` adapter implementing `DatabasePort`. Swap one line in `tovu.config.ts`. Everything else untouched.

**Scenario: You want to support Cloudflare Workers (no Node APIs)**
→ Core is already pure TS. Write `@tovu/http-workers` adapter. Use `@tovu/db-turso` (edge-native SQLite). Done.

**Scenario: React falls out of favor**
→ The admin UI needs rewriting (that's real work), but every plugin's business logic, every content type, every hook, every AI tool — all untouched. The new Vue/Svelte/Solid admin just implements the same component descriptors.

**Scenario: A better AI protocol replaces MCP**
→ Add a new sub-module in `@tovu/protocol`. Existing MCP tools auto-bridge to the new protocol. Plugin authors don't change anything.

The key trade-off: this architecture is **more work upfront** (you're building interfaces before implementations), but it makes the right things easy to change and the wrong things hard to break. For a project intended to outlive any single framework, this is the correct bet.
