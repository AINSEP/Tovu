# Building a Modern WordPress Alternative: Complete Technical Guide

## Part 2: Architectural Paradigms & Proposed Architecture

---

# Table of Contents - Part 2

4. [Architectural Paradigms](#4-architectural-paradigms)
5. [Proposed CMS Architecture](#5-proposed-cms-architecture)
6. [Database Design](#6-database-design)

---

# 4. Architectural Paradigms

## 4.1 Edge-First Architecture

### What It Is
Design for edge deployment from day one—compute runs close to users worldwide.

### Why It Matters
- **Sub-50ms latency** globally
- **Infinite scale** - Edge nodes handle load
- **Cost efficiency** - No centralized compute
- **Resilience** - No single point of failure

### Implementation

```typescript
// Cloudflare Workers example
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cacheKey = new Request(url.toString(), request);
    
    // Check edge cache first
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    if (response) return response;
    
    // SQLite at the edge (D1)
    const content = await env.DB.prepare(`
      SELECT * FROM contents WHERE slug = ? AND status = 'published'
    `).bind(url.pathname.slice(1)).first();
    
    if (!content) return new Response('Not Found', { status: 404 });
    
    // AI at the edge (Workers AI)
    const summary = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `Summarize: ${content.body.slice(0, 1000)}`
    });
    
    response = new Response(renderHTML(content, summary), {
      headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' }
    });
    
    await cache.put(cacheKey, response.clone());
    return response;
  }
};
```

---

## 4.2 Islands Architecture

### What It Is
Server render everything, hydrate only interactive parts ("islands").

### Why It Matters
- **Minimal JavaScript** - Most pages need little/no JS
- **Fast initial load** - Full HTML from server
- **Progressive enhancement** - Works without JS

### Implementation with Astro

```astro
---
// This runs on server only
const { content } = Astro.props;
---
<html>
<body>
  <!-- Static - no JavaScript -->
  <Header />
  <Sidebar />
  
  <!-- Interactive island - hydrates immediately -->
  <ContentEditor client:load content={content} />
  
  <!-- Hydrates when visible (lazy) -->
  <AIAssistant client:visible contentId={content.id} />
  
  <!-- Static footer -->
  <Footer />
</body>
</html>
```

---

## 4.3 React Server Components

### What It Is
Components that run on server and stream HTML—no hydration needed for those parts.

### Why It Matters
- **Zero client bundle** for server components
- **Direct database access** in components
- **Streaming** - Show content as it loads

### Implementation

```tsx
// This runs entirely on server
export default async function ContentPage({ params }) {
  const content = await db.contents.findUnique({ where: { id: params.id } });
  const [related, summary] = await Promise.all([
    findRelated(content),
    generateSummary(content.body)
  ]);
  
  return (
    <div>
      <h1>{content.title}</h1>
      <AISummary summary={summary} />
      
      {/* Client component - interactive */}
      <ContentEditor content={content} />
      
      <Suspense fallback={<Skeleton />}>
        <Comments contentId={content.id} />
      </Suspense>
    </div>
  );
}
```

---

## 4.4 Effect Systems (Effect-TS)

### What It Is
Typed errors, explicit dependencies, and observability built into the type system.

### Why It Matters
- **Typed errors** - Know exactly what can fail
- **Explicit dependencies** - No hidden coupling
- **Automatic retries/timeouts** - Built-in resilience

### Implementation

```typescript
import { Effect, pipe } from 'effect';

// Errors are in the type signature
const publishContent = (id: string): Effect.Effect<
  Content,                                    // Success
  NotFoundError | ValidationError | DBError,  // Possible errors
  ContentService | AIService                  // Dependencies needed
> => pipe(
  Effect.flatMap(ContentService, s => s.get(id)),
  Effect.flatMap(content => 
    content.body.length < 100
      ? Effect.fail(new ValidationError(['Too short']))
      : Effect.succeed(content)
  ),
  Effect.flatMap(content =>
    Effect.flatMap(ContentService, s =>
      s.save({ ...content, status: 'published' })
    )
  ),
  Effect.retry({ times: 3, schedule: Schedule.exponential('100ms') }),
  Effect.timeout('10 seconds')
);
```

---

# 5. Proposed CMS Architecture

## 5.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Edge Layer                               │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────────────────┐ │
│  │Public Site│  │ Admin UI  │  │  API (Hono + tRPC + MCP)    │ │
│  │(Astro)    │  │(RSC+React)│  │                             │ │
│  └───────────┘  └───────────┘  └─────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                    Sync Layer │                                  │
│  ┌────────────────────────────▼──────────────────────────────┐  │
│  │              Electric SQL / PowerSync                      │  │
│  │    Browser SQLite ◀────sync────▶ Server Postgres          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                 Core Services │                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Content  │ │ Plugin   │ │   AI     │ │  Event   │           │
│  │ Engine   │ │ Runtime  │ │  Layer   │ │  Store   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                   Data Layer  │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Postgres (Supabase)                      │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │   │
│  │  │Relation│ │pgvector│ │  AGE   │ │ Events │            │   │
│  │  │  al    │ │        │ │ (graph)│ │        │            │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                    ▼                    ▼                       │
│           ┌─────────────┐      ┌─────────────┐                 │
│           │ Databricks  │      │ Turbopuffer │                 │
│           │ (analytics) │      │  (fast RAG) │                 │
│           └─────────────┘      └─────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5.2 Plugin Runtime (Sandboxed)

```typescript
import { Isolate } from 'isolated-vm';

class PluginRuntime {
  async loadPlugin(plugin: Plugin): Promise<void> {
    const manifest = await this.parseManifest(plugin.manifestPath);
    
    // Create sandboxed V8 isolate (128MB limit)
    const isolate = new Isolate({ memoryLimit: 128 });
    const context = await isolate.createContext();
    
    // Inject only permitted APIs
    await this.injectAPIs(context, manifest.permissions);
    
    // Load and run plugin code
    const code = await fs.readFile(plugin.entryPath, 'utf-8');
    await isolate.compileScript(code).run(context);
    
    // Register hooks
    for (const hook of manifest.hooks) {
      const callback = await context.eval(`plugin.hooks['${hook}']`);
      hooks.add(hook, (value, ctx) => 
        callback.apply(undefined, [value, ctx], { timeout: 5000 })
      );
    }
    
    // Register AI tools via MCP
    for (const tool of manifest.tools || []) {
      aiRegistry.registerTool(tool);
    }
  }
}

// Example plugin manifest
{
  "name": "seo-toolkit",
  "version": "1.0.0",
  "permissions": ["content.read", "content.write", "ai.use"],
  "hooks": ["content.beforePublish"],
  "tools": ["analyze_seo", "suggest_keywords"]
}
```

---

## 5.3 AI Agent Layer

```typescript
class CMSAgent {
  private tools = new Map<string, Tool>();
  
  constructor() {
    // Tool-use-first: everything is a tool
    this.tools.set('think', {
      description: 'Reason through a problem',
      handler: async (input) => ({ acknowledged: true })
    });
    
    this.tools.set('search_content', {
      description: 'Semantic search',
      handler: async ({ query }) => contentService.search(query)
    });
    
    this.tools.set('save_content', {
      description: 'Save to database',
      requiresApproval: true,
      handler: async (input) => contentService.save(input)
    });
    
    this.tools.set('respond', {
      description: 'Send response to user',
      handler: async (input) => ({ delivered: true })
    });
  }
  
  async *handleMessage(message: string): AsyncGenerator<AgentEvent> {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: message }],
      tools: this.getToolDefinitions(),
      tool_choice: { type: 'required' }, // Force structured output
      stream: true
    });
    
    for await (const event of response) {
      if (event.type === 'tool_use') {
        const tool = this.tools.get(event.name);
        
        if (tool.requiresApproval) {
          yield { type: 'approval_required', tool: event.name, input: event.input };
        } else {
          const result = await tool.handler(event.input);
          yield { type: 'tool_result', tool: event.name, result };
        }
      }
    }
  }
  
  // Expose as MCP server for external agents
  asMCPServer(): MCPServer {
    return new MCPServer({
      name: 'cms-agent',
      tools: Array.from(this.tools.entries()).map(([name, t]) => ({
        name,
        description: t.description
      }))
    });
  }
}
```

---

## 5.4 Hooks System

```typescript
type HookCallback<T> = (value: T, context: HookContext) => T | Promise<T>;

class HookRegistry {
  private filters = new Map<string, { callback: HookCallback<any>; priority: number }[]>();
  
  addFilter<T>(name: string, callback: HookCallback<T>, priority = 10): () => void {
    const hooks = this.filters.get(name) || [];
    hooks.push({ callback, priority });
    hooks.sort((a, b) => a.priority - b.priority);
    this.filters.set(name, hooks);
    
    return () => {
      const current = this.filters.get(name) || [];
      this.filters.set(name, current.filter(h => h.callback !== callback));
    };
  }
  
  async applyFilters<T>(name: string, value: T, context: HookContext): Promise<T> {
    const hooks = this.filters.get(name) || [];
    let result = value;
    
    for (const { callback } of hooks) {
      result = await callback(result, context);
    }
    
    return result;
  }
}

// Available hooks
interface CMSHooks {
  'content.beforeCreate': (input: CreateInput) => CreateInput;
  'content.afterCreate': (content: Content) => void;
  'content.beforePublish': (content: Content) => Content;
  'content.afterPublish': (content: Content) => void;
  'admin.sidebar': (items: SidebarItem[]) => SidebarItem[];
  'ai.tools': (tools: AITool[]) => AITool[];
}
```

---

# 6. Database Design

## 6.1 Core Schema

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Workspaces (multi-tenant)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workspace members
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  PRIMARY KEY (workspace_id, user_id)
);

-- Content types (dynamic)
CREATE TABLE content_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  schema JSONB NOT NULL, -- JSON Schema
  UNIQUE(workspace_id, slug)
);

-- Contents (main table - replaces wp_posts + wp_postmeta)
CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  content_type_id UUID REFERENCES content_types(id),
  type TEXT NOT NULL,
  
  -- Core fields
  slug TEXT NOT NULL,
  title JSONB NOT NULL,      -- { "en": "Hello", "es": "Hola" }
  body JSONB,                -- Rich content
  excerpt TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  
  -- Author
  author_id UUID REFERENCES users(id),
  
  -- Flexible metadata (no EAV!)
  meta JSONB DEFAULT '{}',
  
  -- SEO
  seo_title TEXT,
  seo_description TEXT,
  
  -- Version
  version INT DEFAULT 1,
  
  -- Vector for semantic search
  embedding vector(1536),
  
  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title->>'en', '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body->>'en', '')), 'C')
  ) STORED,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(workspace_id, type, slug)
);

-- Indexes
CREATE INDEX idx_contents_workspace ON contents(workspace_id);
CREATE INDEX idx_contents_type ON contents(type);
CREATE INDEX idx_contents_status ON contents(status);
CREATE INDEX idx_contents_search ON contents USING gin(search_vector);
CREATE INDEX idx_contents_embedding ON contents USING hnsw (embedding vector_cosine_ops);

-- Content versions (history)
CREATE TABLE content_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title JSONB NOT NULL,
  body JSONB,
  meta JSONB,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_id, version)
);

-- Taxonomies
CREATE TABLE taxonomies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  hierarchical BOOLEAN DEFAULT false,
  UNIQUE(workspace_id, slug)
);

-- Terms
CREATE TABLE terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  taxonomy_id UUID REFERENCES taxonomies(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES terms(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE(taxonomy_id, slug)
);

-- Content-Term junction
CREATE TABLE content_terms (
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  term_id UUID REFERENCES terms(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, term_id)
);

-- Media
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt_text TEXT,
  meta JSONB DEFAULT '{}',
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Event store (event sourcing)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  version INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stream_id, version)
);

CREATE INDEX idx_events_stream ON events(stream_id, version);

-- Plugin state
CREATE TABLE plugin_state (
  plugin_id TEXT NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  PRIMARY KEY (plugin_id, workspace_id, key)
);

-- Agent memories
CREATE TABLE agent_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memories_embedding ON agent_memories USING hnsw (embedding vector_cosine_ops);

-- Content chunks for RAG
CREATE TABLE content_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  UNIQUE(content_id, chunk_index)
);

CREATE INDEX idx_chunks_embedding ON content_chunks USING hnsw (embedding vector_cosine_ops);
```

---

## 6.2 Hybrid Search Query

```typescript
async function hybridSearch(query: string, filters: SearchFilters) {
  const embedding = await embed(query);
  
  return db.$queryRaw`
    SELECT 
      id, title, excerpt, type, status,
      1 - (embedding <=> ${embedding}::vector) as semantic_score,
      ts_rank(search_vector, plainto_tsquery(${query})) as text_score,
      (0.6 * (1 - (embedding <=> ${embedding}::vector)) +
       0.4 * ts_rank(search_vector, plainto_tsquery(${query}))) as combined_score
    FROM contents
    WHERE 
      workspace_id = ${filters.workspaceId}
      AND status = 'published'
      AND embedding <=> ${embedding}::vector < 0.5
    ORDER BY combined_score DESC
    LIMIT ${filters.limit || 20}
  `;
}
```

---

*End of Part 2*

*Continue to Part 3 for: Tech Stack, Implementation Roadmap, and Migration Strategy*
