# Building a Modern WordPress Alternative: Complete Technical Guide

## Part 3: Tech Stack, Implementation & Migration

---

# Table of Contents - Part 3

7. [Recommended Tech Stack](#7-recommended-tech-stack)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [WordPress Migration Strategy](#9-wordpress-migration-strategy)
10. [Solving WordPress Complaints](#10-solving-wordpress-complaints)

---

# 7. Recommended Tech Stack

## 7.1 Complete Stack Overview

| Layer | Technology | Why |
|-------|------------|-----|
| **Runtime** | Bun / Node.js | Fast, TypeScript native, edge-ready |
| **API Framework** | Hono + tRPC | Lightweight, type-safe, works everywhere |
| **Database** | Supabase (Postgres) | Auth, realtime, storage, vectors built-in |
| **Edge Database** | Turso (libSQL) | SQLite at edge, sub-10ms reads globally |
| **Sync Engine** | Electric SQL | Local-first, instant writes, offline support |
| **Analytics** | Databricks / ClickHouse | Scale-out analytics, ML pipelines |
| **Public Site** | Astro | Islands, SSG/SSR, minimal JS |
| **Admin UI** | Next.js 14+ (App Router) | RSC, streaming, great DX |
| **Components** | Shadcn/ui + Tailwind | Beautiful, accessible, customizable |
| **Editor** | TipTap / Plate | Extensible rich text, real-time collab |
| **AI** | Anthropic Claude | Best reasoning, tool use, streaming |
| **AI Protocol** | MCP | Standard for AI tool discovery |
| **Agent UI** | AG-UI / CopilotKit | Agent-user interaction patterns |
| **Vector Search** | pgvector + Turbopuffer | Hybrid in Postgres + fast RAG |
| **Plugin Runtime** | V8 Isolates (isolated-vm) | Secure sandboxing |
| **Background Jobs** | Inngest / Trigger.dev | Serverless workflows, retries |
| **Real-time** | Partykit / Supabase Realtime | Collaboration, live updates |
| **Deployment** | Vercel / Cloudflare | Edge-first, global |
| **Monitoring** | OpenTelemetry + Axiom | Observability, tracing |

---

## 7.2 Package Structure

```
packages/
├── core/                    # Core CMS engine
│   ├── src/
│   │   ├── content/         # Content CRUD, publishing
│   │   ├── hooks/           # Hook system
│   │   ├── auth/            # Authentication
│   │   ├── media/           # Media handling
│   │   └── types/           # Shared TypeScript types
│   └── package.json
│
├── ai/                      # AI layer
│   ├── src/
│   │   ├── agent/           # CMS agent implementation
│   │   ├── memory/          # Agent memory system
│   │   ├── tools/           # Tool definitions
│   │   ├── rag/             # RAG implementation
│   │   └── mcp/             # MCP server
│   └── package.json
│
├── plugins/                 # Plugin system
│   ├── src/
│   │   ├── runtime/         # V8 isolate runtime
│   │   ├── registry/        # Plugin discovery
│   │   ├── permissions/     # Permission system
│   │   └── marketplace/     # Plugin marketplace
│   └── package.json
│
├── db/                      # Database layer
│   ├── src/
│   │   ├── schema/          # Drizzle schema
│   │   ├── migrations/      # Database migrations
│   │   ├── events/          # Event store
│   │   └── sync/            # Electric SQL setup
│   └── package.json
│
├── ui/                      # Shared UI components
│   ├── src/
│   │   ├── components/      # Shadcn components
│   │   ├── editor/          # Rich text editor
│   │   └── copilot/         # AI copilot components
│   └── package.json
│
└── config/                  # Shared configuration
    ├── eslint/
    ├── typescript/
    └── tailwind/

apps/
├── admin/                   # Admin dashboard (Next.js)
│   ├── app/
│   │   ├── (dashboard)/     # Dashboard routes
│   │   ├── (editor)/        # Content editor
│   │   ├── api/             # API routes
│   │   └── layout.tsx
│   └── package.json
│
├── web/                     # Public website (Astro)
│   ├── src/
│   │   ├── pages/
│   │   ├── layouts/
│   │   └── components/
│   └── package.json
│
├── api/                     # API server (Hono)
│   ├── src/
│   │   ├── routes/
│   │   ├── trpc/
│   │   └── mcp/
│   └── package.json
│
└── worker/                  # Edge worker (Cloudflare)
    ├── src/
    │   └── index.ts
    └── wrangler.toml
```

---

## 7.3 Key Dependencies

```json
{
  "dependencies": {
    // Core
    "@anthropic-ai/sdk": "^0.30.0",
    "@anthropic-ai/mcp": "^0.1.0",
    "hono": "^4.0.0",
    "@trpc/server": "^11.0.0",
    "drizzle-orm": "^0.34.0",
    "zod": "^3.23.0",
    "effect": "^3.0.0",
    
    // Database
    "@supabase/supabase-js": "^2.45.0",
    "@libsql/client": "^0.14.0",
    "electric-sql": "^0.12.0",
    
    // AI
    "ai": "^3.4.0",
    "@copilotkit/react-core": "^1.0.0",
    
    // UI
    "next": "^15.0.0",
    "react": "^19.0.0",
    "@tiptap/react": "^2.8.0",
    "tailwindcss": "^3.4.0",
    
    // Plugin sandboxing
    "isolated-vm": "^5.0.0",
    
    // Background jobs
    "inngest": "^3.0.0",
    
    // Real-time
    "partykit": "^0.0.0"
  }
}
```

---

# 8. Implementation Roadmap

## Phase 1: Foundation (Weeks 1-8)

### Goals
- Core content engine working
- Basic admin UI
- Authentication
- API layer

### Deliverables

```
Week 1-2: Project Setup
├── Monorepo structure (Turborepo)
├── TypeScript + ESLint + Prettier
├── Database schema (Drizzle)
├── Supabase project setup
└── CI/CD pipeline

Week 3-4: Content Engine
├── Content CRUD operations
├── Content types (dynamic schemas)
├── Versioning (content_versions table)
├── Status management (draft/published/archived)
└── Basic hooks system

Week 5-6: Authentication & API
├── Supabase Auth integration
├── Workspace management
├── Role-based permissions
├── tRPC API setup
└── REST fallback endpoints

Week 7-8: Admin UI Foundation
├── Next.js admin app
├── Dashboard layout
├── Content list view
├── Basic content editor (TipTap)
└── Media upload (Supabase Storage)
```

### Milestone Checklist
- [ ] Create, read, update, delete content
- [ ] User authentication
- [ ] Multi-workspace support
- [ ] Basic rich text editing
- [ ] Media upload and management

---

## Phase 2: Plugin System (Weeks 9-14)

### Goals
- Sandboxed plugin execution
- Plugin manifest format
- Permission system
- Hook registration

### Deliverables

```
Week 9-10: Plugin Runtime
├── V8 Isolate setup
├── Plugin manifest schema
├── Permission definitions
├── Sandboxed API injection
└── Resource limits (memory, CPU)

Week 11-12: Plugin Lifecycle
├── Plugin installation flow
├── Plugin discovery/registry
├── Dependency resolution
├── Hot-reload in development
└── Plugin state storage

Week 13-14: Example Plugins
├── SEO Toolkit plugin
├── Social sharing plugin
├── Analytics plugin
└── Plugin documentation
└── Plugin development guide
```

### Milestone Checklist
- [ ] Plugins run in isolated V8 context
- [ ] Plugins can register hooks
- [ ] Permission system enforced
- [ ] Plugin state persisted
- [ ] At least 3 working plugins

---

## Phase 3: AI Layer (Weeks 15-22)

### Goals
- AI copilot in admin
- Tool-use-first agent
- RAG for content search
- MCP server for external agents

### Deliverables

```
Week 15-16: Agent Foundation
├── Claude SDK integration
├── Tool registry
├── Structured outputs
├── Prompt caching setup
└── Memory system basics

Week 17-18: Content Tools
├── search_content tool
├── create_draft tool
├── edit_content tool
├── publish_content tool
└── analyze_content tool

Week 19-20: RAG System
├── Content chunking
├── Embedding generation
├── pgvector hybrid search
├── Context assembly
└── Agentic retrieval loops

Week 21-22: Copilot UI
├── AG-UI components
├── Streaming responses
├── Tool call visualization
├── Human-in-the-loop approvals
└── Generative UI support
```

### Milestone Checklist
- [ ] Agent can create/edit content via tools
- [ ] Semantic search working
- [ ] Copilot panel in admin UI
- [ ] Tool calls stream to UI
- [ ] MCP server exposing CMS tools

---

## Phase 4: Local-First & Real-time (Weeks 23-28)

### Goals
- Instant admin writes
- Offline support
- Real-time collaboration
- Edge deployment

### Deliverables

```
Week 23-24: Electric SQL Integration
├── Electric SQL setup
├── Client-side SQLite
├── Sync configuration
├── Conflict resolution rules
└── Optimistic UI updates

Week 25-26: Real-time Features
├── Live content editing
├── Presence indicators
├── Collaborative cursors
├── Real-time notifications
└── Activity feed

Week 27-28: Edge Deployment
├── Cloudflare Workers API
├── Turso edge database
├── Edge caching strategy
├── CDN configuration
└── Performance optimization
```

### Milestone Checklist
- [ ] Admin works offline
- [ ] Sub-100ms write latency
- [ ] Multi-user collaboration
- [ ] Global edge deployment
- [ ] <50ms read latency worldwide

---

## Phase 5: Public Site & Themes (Weeks 29-34)

### Goals
- Astro-based public site
- Theme system
- Visual builder
- Static generation

### Deliverables

```
Week 29-30: Public Site Engine
├── Astro integration
├── Content fetching
├── Dynamic routes
├── SSG/SSR modes
└── Image optimization

Week 31-32: Theme System
├── Theme manifest format
├── Template hierarchy
├── Component slots
├── Theme settings
└── Default theme

Week 33-34: Visual Builder (Basic)
├── Block-based editing
├── Drag-and-drop
├── Component library
├── Preview mode
└── Responsive editing
```

### Milestone Checklist
- [ ] Public site renders content
- [ ] Theme switching works
- [ ] Basic visual editing
- [ ] Static site generation
- [ ] ISR support

---

## Phase 6: Polish & Scale (Weeks 35-40)

### Goals
- Performance optimization
- Analytics integration
- Migration tools
- Documentation

### Deliverables

```
Week 35-36: Analytics & Monitoring
├── Databricks integration
├── Content analytics
├── AI usage tracking
├── OpenTelemetry setup
└── Error tracking

Week 37-38: Migration Tools
├── WordPress importer
├── Content mapping
├── Media migration
├── URL redirects
└── Plugin compatibility layer

Week 39-40: Documentation & Launch
├── User documentation
├── Developer docs
├── API reference
├── Plugin development guide
└── Video tutorials
```

---

# 9. WordPress Migration Strategy

## 9.1 Data Migration

### Content Mapping

| WordPress | New CMS |
|-----------|---------|
| `wp_posts.post_title` | `contents.title->>'en'` |
| `wp_posts.post_content` | `contents.body->>'en'` (converted) |
| `wp_posts.post_excerpt` | `contents.excerpt` |
| `wp_posts.post_status` | `contents.status` |
| `wp_posts.post_type` | `contents.type` |
| `wp_postmeta.*` | `contents.meta` (JSONB) |
| `wp_terms` | `terms` |
| `wp_term_taxonomy` | `taxonomies` |
| `wp_users` | `users` |

### Migration Script

```typescript
// scripts/migrate-wordpress.ts
import { parseWXR } from './wxr-parser';
import { db } from '@/lib/db';
import { convertGutenbergToTipTap } from './content-converter';

interface WPExport {
  posts: WPPost[];
  pages: WPPage[];
  media: WPMedia[];
  authors: WPUser[];
  categories: WPCategory[];
  tags: WPTag[];
}

async function migrateWordPress(wxrPath: string, workspaceId: string) {
  const data: WPExport = await parseWXR(wxrPath);
  
  console.log(`Migrating ${data.posts.length} posts, ${data.pages.length} pages...`);
  
  // 1. Migrate users
  const userMap = new Map<number, string>();
  for (const wpUser of data.authors) {
    const user = await db.users.upsert({
      where: { email: wpUser.email },
      create: {
        email: wpUser.email,
        name: wpUser.display_name,
      },
      update: {}
    });
    userMap.set(wpUser.id, user.id);
  }
  
  // 2. Migrate taxonomies and terms
  const termMap = new Map<number, string>();
  
  // Categories
  const categoryTaxonomy = await db.taxonomies.create({
    data: { workspaceId, name: 'Category', slug: 'category', hierarchical: true }
  });
  
  for (const cat of data.categories) {
    const term = await db.terms.create({
      data: {
        taxonomyId: categoryTaxonomy.id,
        name: cat.name,
        slug: cat.slug,
        parentId: cat.parent ? termMap.get(cat.parent) : null
      }
    });
    termMap.set(cat.term_id, term.id);
  }
  
  // Tags
  const tagTaxonomy = await db.taxonomies.create({
    data: { workspaceId, name: 'Tag', slug: 'tag', hierarchical: false }
  });
  
  for (const tag of data.tags) {
    const term = await db.terms.create({
      data: {
        taxonomyId: tagTaxonomy.id,
        name: tag.name,
        slug: tag.slug
      }
    });
    termMap.set(tag.term_id, term.id);
  }
  
  // 3. Migrate media
  const mediaMap = new Map<number, string>();
  for (const wpMedia of data.media) {
    // Download and re-upload to Supabase Storage
    const file = await downloadFile(wpMedia.url);
    const { data: uploaded } = await supabase.storage
      .from('media')
      .upload(`${workspaceId}/${wpMedia.filename}`, file);
    
    const media = await db.media.create({
      data: {
        workspaceId,
        filename: wpMedia.filename,
        mimeType: wpMedia.mime_type,
        url: uploaded.path,
        altText: wpMedia.alt,
        meta: wpMedia.meta
      }
    });
    mediaMap.set(wpMedia.id, media.id);
  }
  
  // 4. Migrate content
  const contentMap = new Map<number, string>();
  
  for (const post of [...data.posts, ...data.pages]) {
    // Convert Gutenberg blocks or classic content to TipTap
    const body = await convertGutenbergToTipTap(post.content, mediaMap);
    
    // Collect all meta into JSONB
    const meta: Record<string, any> = {};
    for (const m of post.postmeta) {
      meta[m.key] = m.value;
    }
    
    // Generate embedding for semantic search
    const embedding = await embed(post.title + ' ' + stripHtml(post.content));
    
    const content = await db.contents.create({
      data: {
        workspaceId,
        type: post.post_type,
        slug: post.post_name,
        title: { en: post.title },
        body: { en: body },
        excerpt: post.excerpt,
        status: mapStatus(post.status),
        publishedAt: post.status === 'publish' ? new Date(post.post_date) : null,
        authorId: userMap.get(post.author),
        meta,
        embedding,
        createdAt: new Date(post.post_date)
      }
    });
    
    contentMap.set(post.id, content.id);
    
    // Link terms
    for (const termId of post.terms) {
      const newTermId = termMap.get(termId);
      if (newTermId) {
        await db.contentTerms.create({
          data: { contentId: content.id, termId: newTermId }
        });
      }
    }
  }
  
  // 5. Generate URL redirects
  const redirects = [];
  for (const [wpId, newId] of contentMap) {
    const wpPost = data.posts.find(p => p.id === wpId);
    if (wpPost) {
      redirects.push({
        from: `/${wpPost.post_name}/`,
        to: `/${wpPost.post_type}/${wpPost.post_name}`,
        status: 301
      });
    }
  }
  
  await fs.writeFile('redirects.json', JSON.stringify(redirects, null, 2));
  
  console.log('Migration complete!');
  console.log(`- ${userMap.size} users`);
  console.log(`- ${termMap.size} terms`);
  console.log(`- ${mediaMap.size} media files`);
  console.log(`- ${contentMap.size} content items`);
}

function mapStatus(wpStatus: string): string {
  const map: Record<string, string> = {
    'publish': 'published',
    'draft': 'draft',
    'pending': 'draft',
    'private': 'draft',
    'trash': 'archived'
  };
  return map[wpStatus] || 'draft';
}
```

### Content Converter

```typescript
// scripts/content-converter.ts
import { parse as parseGutenberg } from '@wordpress/block-serialization-default-parser';

export async function convertGutenbergToTipTap(
  content: string,
  mediaMap: Map<number, string>
): Promise<object> {
  // Check if Gutenberg blocks
  if (content.includes('<!-- wp:')) {
    return convertGutenbergBlocks(content, mediaMap);
  }
  
  // Classic editor - convert HTML
  return convertClassicHTML(content, mediaMap);
}

function convertGutenbergBlocks(content: string, mediaMap: Map<number, string>) {
  const blocks = parseGutenberg(content);
  
  const tiptapContent: any[] = [];
  
  for (const block of blocks) {
    switch (block.blockName) {
      case 'core/paragraph':
        tiptapContent.push({
          type: 'paragraph',
          content: [{ type: 'text', text: stripTags(block.innerHTML) }]
        });
        break;
        
      case 'core/heading':
        const level = block.attrs?.level || 2;
        tiptapContent.push({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: stripTags(block.innerHTML) }]
        });
        break;
        
      case 'core/image':
        const mediaId = block.attrs?.id;
        const newMediaId = mediaMap.get(mediaId);
        tiptapContent.push({
          type: 'image',
          attrs: {
            src: newMediaId ? `/media/${newMediaId}` : block.attrs?.url,
            alt: block.attrs?.alt || '',
            title: block.attrs?.caption || ''
          }
        });
        break;
        
      case 'core/list':
        const listType = block.attrs?.ordered ? 'orderedList' : 'bulletList';
        tiptapContent.push({
          type: listType,
          content: parseListItems(block.innerHTML)
        });
        break;
        
      case 'core/quote':
        tiptapContent.push({
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: stripTags(block.innerHTML) }] }]
        });
        break;
        
      case 'core/code':
        tiptapContent.push({
          type: 'codeBlock',
          attrs: { language: block.attrs?.language || 'plaintext' },
          content: [{ type: 'text', text: block.innerHTML.trim() }]
        });
        break;
        
      // Add more block type conversions as needed
      
      default:
        // Fallback: treat as HTML
        if (block.innerHTML?.trim()) {
          tiptapContent.push({
            type: 'paragraph',
            content: [{ type: 'text', text: stripTags(block.innerHTML) }]
          });
        }
    }
  }
  
  return {
    type: 'doc',
    content: tiptapContent
  };
}
```

---

## 9.2 URL Redirect Strategy

```typescript
// middleware.ts (Next.js)
import { NextResponse } from 'next/server';
import redirects from './redirects.json';

export function middleware(request: Request) {
  const url = new URL(request.url);
  
  // Check for WordPress-style URLs
  const redirect = redirects.find(r => 
    url.pathname === r.from || 
    url.pathname === r.from.slice(0, -1)
  );
  
  if (redirect) {
    return NextResponse.redirect(new URL(redirect.to, request.url), redirect.status);
  }
  
  return NextResponse.next();
}

// Also handle common WordPress patterns
const wpPatterns = [
  { pattern: /^\/\d{4}\/\d{2}\/(.+)\/?$/, rewrite: '/post/$1' },  // /2024/01/slug/
  { pattern: /^\/category\/(.+)\/?$/, rewrite: '/categories/$1' },
  { pattern: /^\/tag\/(.+)\/?$/, rewrite: '/tags/$1' },
  { pattern: /^\/author\/(.+)\/?$/, rewrite: '/authors/$1' },
];
```

---

# 10. Solving WordPress Complaints

## Complaint → Solution Matrix

| WordPress Problem | Root Cause | Solution | Implementation |
|-------------------|------------|----------|----------------|
| **Slow admin** | Full page loads, no caching | Local-first (Electric SQL) | Browser SQLite + sync |
| **Plugin conflicts** | Global scope, no isolation | Sandboxed V8 isolates | `isolated-vm` library |
| **No type safety** | PHP dynamic typing | TypeScript everywhere | End-to-end types with tRPC |
| **Database bottleneck** | Single MySQL | Edge SQLite + Postgres | Turso replicas worldwide |
| **Testing difficulty** | Global state | Effect system + DI | Effect-TS for dependencies |
| **Security surface** | Unchecked plugin code | Permission system | Manifest-declared capabilities |
| **N+1 queries** | Per-post meta queries | JSONB + DataLoader | Single query per request |
| **Manual caching** | No built-in cache | Stale-while-revalidate | Edge cache + ISR |
| **No realtime** | Request-response only | WebSockets + sync | Electric SQL + Partykit |
| **Hard to extend AI** | Not designed for AI | MCP + tool registry | First-class AI integration |
| **Poor DX** | No hot reload, old tools | Modern tooling | Vite, Turborepo, Bun |
| **EAV metadata** | wp_postmeta table | JSONB columns | Flexible + indexable |

---

## Detailed Solutions

### 1. Slow Admin → Local-First

**Before (WordPress):**
```
User clicks "Save" → HTTP request → PHP processes → MySQL write → Response → UI updates
Total: 200-500ms minimum
```

**After (Local-First):**
```
User clicks "Save" → Local SQLite write → UI updates immediately → Background sync
Total: <10ms perceived latency
```

```typescript
// Electric SQL makes this transparent
const { db } = useElectric();

async function saveContent(content: Content) {
  // This write is INSTANT (local)
  await db.contents.update({
    where: { id: content.id },
    data: content
  });
  // UI already updated
  // Sync happens in background
}
```

### 2. Plugin Conflicts → Isolated Runtime

**Before (WordPress):**
```php
// Plugin A
function do_thing() { /* ... */ }

// Plugin B - CONFLICT!
function do_thing() { /* different implementation */ }
// Fatal error: Cannot redeclare do_thing()
```

**After (V8 Isolates):**
```typescript
// Each plugin runs in isolated V8 context
const isolateA = new Isolate({ memoryLimit: 128 });
const isolateB = new Isolate({ memoryLimit: 128 });

// Plugin A's do_thing is completely separate from Plugin B's
// No conflicts possible
```

### 3. No Type Safety → TypeScript + tRPC

**Before (WordPress):**
```php
// No idea what this returns until runtime
$post = get_post($id);
echo $post->doesnt_exist; // No error until runtime
```

**After (TypeScript + tRPC):**
```typescript
// Types flow from database to frontend
const content = await trpc.content.get.query({ id });
//    ^? Content - fully typed

content.doesNotExist; // TypeScript error!
```

### 4. Database Bottleneck → Edge Distribution

**Before:**
```
User (Tokyo) → Server (US-East) → MySQL (US-East)
Latency: 200ms+ per query
```

**After:**
```
User (Tokyo) → Edge (Tokyo) → Turso Replica (Tokyo)
Latency: <10ms per query
```

### 5. Testing → Dependency Injection

**Before (WordPress):**
```php
// How do you test this? Global state everywhere
function my_function() {
  global $wpdb;
  $result = $wpdb->get_results("SELECT...");
  // ...
}
```

**After (Effect-TS):**
```typescript
// Dependencies are explicit and injectable
const myFunction = Effect.gen(function* (_) {
  const db = yield* _(Database);
  const result = yield* _(db.query("SELECT..."));
  // ...
});

// Test with mock
const mockDb = Layer.succeed(Database, mockImplementation);
await Effect.runPromise(myFunction.pipe(Effect.provide(mockDb)));
```

### 6. Security → Permission System

**Before (WordPress):**
```php
// Plugin can do literally anything
$wpdb->query("DROP TABLE wp_users"); // Oops
file_get_contents('/etc/passwd');     // Security hole
```

**After (Permissions):**
```typescript
// Plugin must declare capabilities
{
  "name": "my-plugin",
  "permissions": ["content.read", "content.write"],
  // NO access to: database.raw, filesystem, network
}

// Runtime enforces this
cms.database.rawQuery("DROP TABLE"); // PermissionDeniedError
```

### 7. N+1 Queries → JSONB + DataLoader

**Before (WordPress):**
```php
// 100 posts = 100+ queries
foreach ($posts as $post) {
  $meta = get_post_meta($post->ID); // Query per post
}
```

**After (JSONB + DataLoader):**
```typescript
// Single query returns everything
const posts = await db.contents.findMany({
  where: { type: 'post' },
  select: { id: true, title: true, meta: true } // meta is JSONB
});

// Or with DataLoader for relations
const loader = new DataLoader(ids => 
  db.contents.findMany({ where: { id: { in: ids } } })
);
```

### 8. Manual Caching → Automatic Invalidation

**Before (WordPress):**
```php
// Must manually manage cache
$data = wp_cache_get('my_data');
if (!$data) {
  $data = expensive_query();
  wp_cache_set('my_data', $data, '', 3600);
}
// Hope you remembered to invalidate on update!
```

**After (ISR + SWR):**
```typescript
// Next.js handles this automatically
export async function generateStaticParams() {
  return db.contents.findMany({ select: { slug: true } });
}

// Revalidates automatically
export const revalidate = 3600; // Or on-demand

// Client-side: SWR handles stale-while-revalidate
const { data } = useSWR(`/api/content/${id}`, fetcher, {
  revalidateOnFocus: true,
  revalidateOnReconnect: true
});
```

### 9. No Realtime → Built-in Sync

**Before (WordPress):**
```php
// Polling only way to get updates
setInterval(() => {
  fetch('/wp-admin/admin-ajax.php?action=check_updates');
}, 5000);
```

**After (Realtime):**
```typescript
// Electric SQL syncs automatically
const { results } = useLiveQuery(
  db.contents.liveMany({ where: { status: 'published' } })
);
// `results` updates in real-time when data changes

// Or Supabase Realtime
supabase
  .channel('contents')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'contents' }, 
    (payload) => updateUI(payload)
  )
  .subscribe();
```

### 10. Hard to Extend AI → First-Class Integration

**Before (WordPress):**
```php
// AI is an afterthought, bolted on
add_filter('the_content', function($content) {
  // Call some AI API
  // Handle errors somehow
  // Hope it works
});
```

**After (Native AI):**
```typescript
// AI is a core capability
const agent = new CMSAgent();

// Register tools via MCP
agent.registerTool({
  name: 'optimize_seo',
  description: 'Improve content SEO',
  handler: async ({ contentId }) => {
    const content = await db.contents.get(contentId);
    const suggestions = await ai.analyze(content);
    return suggestions;
  }
});

// Copilot UI built-in
<CopilotPanel agent={agent} />
```

---

# Appendix: Quick Reference

## Commands

```bash
# Development
pnpm dev              # Start all apps
pnpm dev:admin        # Admin only
pnpm dev:web          # Public site only
pnpm dev:api          # API only

# Database
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed data
pnpm db:studio        # Open Drizzle Studio

# Build
pnpm build            # Build all
pnpm build:admin      # Build admin

# Test
pnpm test             # Run tests
pnpm test:e2e         # E2E tests

# Deploy
pnpm deploy           # Deploy all
pnpm deploy:edge      # Deploy edge workers
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...

# Supabase
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Edge
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...

# Analytics
DATABRICKS_HOST=...
DATABRICKS_TOKEN=...
```

## Key URLs

```
Admin:      https://admin.yoursite.com
Public:     https://yoursite.com
API:        https://api.yoursite.com
MCP:        https://api.yoursite.com/mcp
Docs:       https://docs.yoursite.com
```

---

*End of Part 3*

*This completes the comprehensive guide to building a modern WordPress alternative.*
