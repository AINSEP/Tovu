# Competitor Analysis: Ghost, Payload, Directus

*Research date: February 18, 2026. All version numbers, star counts, and release dates verified directly from GitHub API and official sources.*

---

## Overview Comparison Table

| Property | Ghost | Payload CMS | Directus |
|---|---|---|---|
| **Founded** | April 2013 | January 2021 (repo) | December 2012 (repo); v9 rewrite Nov 2021 |
| **First stable release** | v0.3.0 — Oct 2013; v1.0 — Jul 2017 | v1.0 — Nov 2021; v2.0 — Oct 2023; v3.0 — Nov 2024 | v9.0.0 — Nov 2021 (Vue/TS rewrite) |
| **Current version** | 6.19.1 | 3.77.0 | 11.15.4 |
| **License** | MIT | MIT | BUSL-1.1 (changed from GPL in Apr 2023; free for orgs under $5M revenue; GPL after 3 years) |
| **Primary language** | JavaScript (Node.js) with partial TypeScript migration | TypeScript | TypeScript |
| **Tech stack** | Node.js 22, Express, Bookshelf ORM, Knex, Handlebars, Ember.js admin | TypeScript, Next.js 15, React 19, Drizzle ORM, Mongoose or Postgres/SQLite adapters | TypeScript, Express, Knex, Vue 3.5, Editor.js |
| **Database** | SQLite or MySQL/MariaDB | MongoDB, PostgreSQL, SQLite, Vercel Postgres, D1 (Cloudflare) | PostgreSQL, MySQL, MariaDB, SQLite, MS SQL Server, CockroachDB, OracleDB |
| **Primary use case** | Publishing platform — blogs, newsletters, memberships | Developer-first headless CMS / app framework | Headless CMS + data platform; wraps any existing SQL DB |
| **GitHub stars (Feb 2026)** | ~51,840 | ~40,661 | ~34,243 |
| **Business model** | Non-profit foundation; Ghost(Pro) managed hosting | MIT open source; Payload Cloud managed hosting; enterprise support | BUSL license; Directus Cloud ($99+/mo); self-hosted requires license for >$5M revenue orgs |
| **Monorepo** | Yes (Yarn/Nx — 4 core + 13 app packages) | Yes (pnpm/Turborepo — 40+ packages) | Yes (pnpm — 30+ packages across api/, app/, packages/) |
| **Admin UI** | Ember.js (legacy) — being migrated to React | React 19 / Next.js App Router (auto-generated from config) | Vue 3.5 (SPA, built with Vite) |
| **Plugin/extension model** | None (webhooks + custom integrations via API keys only) | First-class plugin system (TypeScript config functions) | Extension SDK (Interfaces, Displays, Layouts, Modules, Hooks, Endpoints, Operations, Panels) |
| **AI features** | None native; Koenig editor has no AI writing assistant | MCP plugin (`@payloadcms/plugin-mcp`) | Deep native AI: multi-provider support (OpenAI, Anthropic, Google), AI sidebar, context staging, prompts, visual element highlighting, MCP server built-in |

---

## Ghost

### History & Founding

Ghost was founded in **April 2013** by **John O'Nolan** (former WordPress UX lead) and **Hannah Wolfe**. O'Nolan's origin story is well documented: frustrated with WordPress's complexity and feature bloat, he published a blog post in November 2012 titled "Ghost — Just a Blogging Platform" proposing a simpler alternative. The post went viral in the WordPress community.

In May 2013 they launched a Kickstarter campaign asking for £25,000. They raised £196,362 from 5,480 backers in 29 days. Ghost was set up as a **non-profit foundation** from day one — a structural decision that means the company can never be acquired and 100% of revenue is reinvested into the product. O'Nolan has cited this as intentional: avoiding the VC treadmill that corrupted many open-source projects.

The first public release (`v0.3.0`) shipped in October 2013 — just 5 months after the Kickstarter. Ghost 1.0 launched in **July 2017** after a complete rewrite introducing the Content API and new admin. Ghost 5.0 introduced the membership/subscription monetization layer. Ghost 6.x (current) requires Node.js 22 and is focused on the ActivityPub/Fediverse integration.

As of 2026 Ghost runs 100 million+ installs and publishes its financial metrics publicly (ARR visible on ghost.org/about).

### Architecture

Ghost is a **lightweight monorepo** using Yarn workspaces and Nx for build orchestration. It has a small package footprint compared to competitors:

```
ghost-monorepo/
├── ghost/
│   ├── core/          # The main Ghost application (Node.js/Express)
│   ├── admin/         # Admin UI (Ember.js — being migrated)
│   ├── i18n/          # Internationalization strings
│   └── parse-email-address/
├── apps/
│   ├── activitypub/   # Fediverse/ActivityPub integration (Tailwind SPA)
│   ├── admin-x-design-system/  # React design system
│   ├── admin-x-framework/
│   ├── admin-x-settings/       # New React settings UI
│   ├── announcement-bar/
│   ├── comments-ui/
│   ├── portal/        # Membership portal widget
│   ├── posts/
│   ├── shade/         # UI component library
│   ├── signup-form/
│   ├── sodo-search/
│   └── stats/
└── e2e/
```

**Core server layer (`ghost/core`):** A traditional MVC-ish Node.js application built on **Express 4** with a rich internal service layer. The services directory alone contains 70+ service modules (members, email-service, email-analytics, stripe, newsletters, themes, koenig, webhooks, etc.).

**ORM/Database:** Ghost uses **Bookshelf.js** (an ORM built on Knex) for its data layer. Knex itself handles migrations via `knex-migrator`. Ghost supports **SQLite** (default, for simplicity) and **MySQL/MariaDB** for production. No PostgreSQL support — a frequently cited limitation.

**API layer:** Ghost exposes three distinct APIs:
- **Content API** (public, read-only — for frontend consumption)
- **Admin API** (authenticated — for management)
- **Members API** (for subscription/membership management)

Each API has its own set of endpoints (posts, pages, tags, authors, tiers, members, newsletters, etc.). There are 70+ endpoint files in `ghost/core/core/server/api/endpoints/`.

**Theme system:** Ghost uses **Handlebars** templating with the `gscan` validator to ensure theme compatibility. Themes are zip files uploaded via admin. Ghost maintains a marketplace of commercial and free themes. The theme system is deeply integrated — themes can define custom settings, card templates, and portal configuration.

**Koenig editor:** Ghost's rich text editor (`@tryghost/kg-*`) is a custom Lexical-based block editor. The Koenig ecosystem is its own package family:
- `@tryghost/kg-default-cards` — built-in content blocks
- `@tryghost/kg-default-nodes` — Lexical node definitions
- `@tryghost/kg-lexical-html-renderer` — server-side rendering
- `@tryghost/kg-html-to-lexical` — import conversion

**Admin UI:** Historically Ember.js (the `ghost/admin` package still uses Ember). The ongoing migration is introducing React via the `apps/admin-x-*` packages and the `apps/shade` component library. This dual-framework coexistence is a technical debt burden.

### Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js ^22.13.1 |
| HTTP framework | Express 4.21.2 |
| ORM | Bookshelf 1.2.0 + Knex 2.4.2 |
| Database | SQLite or MySQL/MariaDB |
| Migrations | knex-migrator 5.3.2 |
| Admin UI (legacy) | Ember.js (Octane) |
| Admin UI (new) | React (admin-x packages) |
| Templating | Handlebars 4.7.8 (themes) |
| Editor | Koenig (custom Lexical implementation) |
| Email | Nodemailer + Mailgun + AWS SES |
| Payments | Stripe 8.x |
| Search | Custom NQL (Ghost Query Language) |
| TypeScript | Partial — being added incrementally (tsx for transpilation) |
| Build tooling | Yarn + Nx |

Ghost is notably **not TypeScript-first**. Most of the core is still JavaScript with JSDoc annotations or partial `.ts` files. The `tsconfig.json` exists but serves a hybrid codebase.

### Plugin/Extension System

**Ghost has no plugin system.** This is the single most cited limitation by developers. Ghost's extensibility model is:

1. **Webhooks** — HTTP callbacks fired on content events (post published, member created, etc.)
2. **Custom integrations** — API key pairs that give external services access to the Admin API
3. **Custom theme settings** — Themes can define settings editable in Ghost Admin
4. **Storage adapters** — A documented `ghost-storage-base` interface for swapping the file storage backend (S3, etc.)

There is no way to add custom content types, custom admin UI components, custom API routes, or new editor blocks without forking the core. Ghost is explicitly designed around its fixed data model: posts, pages, tags, authors, tiers, members, newsletters.

The Ghost team made this architectural decision deliberately to keep the platform focused. It is both a strength (simplicity, no plugin compatibility hell) and a hard ceiling for any project that outgrows Ghost's fixed data model.

### AI Integration

Ghost has **no native AI features** as of February 2026. There is no AI writing assistant in the Koenig editor, no AI-powered content suggestions, and no integration with any LLM provider in the core codebase. A search of the Ghost repository for OpenAI or Anthropic integration yields zero results.

Ghost's approach to AI is that users can connect third-party AI tools via Zapier/Make.com webhooks. The Koenig editor roadmap does not include AI writing assistance as a built-in feature.

### Business Model

Ghost operates as a **non-profit foundation (The Ghost Foundation)**. Revenue comes entirely from:

- **Ghost(Pro) managed hosting** — tiered plans:
  - Starter: $18/mo (billed yearly) — 1 staff user, 1,000 members, 5MB upload limit
  - Publisher: $29/mo — 3 staff users, custom themes, 8,000+ integrations, 1,000 members
  - Business: $199/mo — 15 staff users, priority support, higher usage limits
  - Custom: Enterprise pricing for unlimited staff, dedicated IP, 99.9% SLA

The self-hosted version is fully MIT licensed with zero restrictions. The Foundation structure means Ghost cannot be acquired or sold. All revenue is reinvested.

### Strengths

- **Exceptional writing/publishing UX**: The Koenig editor, membership portal, and newsletter system are polished and deeply integrated. The publishing workflow from draft to email newsletter to web is seamless.
- **Built-in monetization**: Stripe integration, paid tiers, member management, and email newsletters are first-class — not bolted on.
- **Simplicity and performance**: Ghost sites load fast. The narrow scope means less surface area for bugs.
- **ActivityPub/Fediverse integration**: Ghost's `apps/activitypub` is building native Fediverse support — making Ghost publications into federated social objects. Unique in the CMS space.
- **Non-profit trust model**: The foundation structure builds long-term trust with the community.
- **Developer-friendly APIs**: Clean REST APIs, well-documented, with official SDKs.
- **Honest theming**: Handlebars themes are simple, learnable, and the gscan validator prevents bad themes from shipping.
- **100M+ installations**: Proven at scale with a large community.

### Weaknesses / Common Complaints

- **No plugin system**: Cannot add custom post types, custom API routes, or custom admin UI without forking. Teams that need flexibility hit a hard wall.
- **No PostgreSQL support**: SQLite and MySQL only. This blocks many production environments that standardize on Postgres.
- **Ember.js admin**: The legacy admin is in Ember.js (a framework with a small and shrinking community). The migration to React is slow and creates two parallel UIs.
- **Opinionated data model**: Everything maps to posts/pages/tags/authors/members. Non-publishing use cases (events, products, directories, etc.) are impossible without hacks.
- **Limited multi-language support**: No built-in i18n for content. Multilingual sites require workarounds.
- **Database migration brittleness**: Ghost's Bookshelf/Knex migration system has historically been a source of upgrade failures.
- **Self-hosting complexity**: Despite being open source, self-hosting Ghost correctly (with email, Stripe, members) requires significant DevOps knowledge.
- **Not truly headless**: While Ghost has a Content API, it was designed for traditional rendered themes first. True headless use cases (no theme, just API) are an afterthought.
- **No AI features**: In 2026, a publishing platform with no AI writing tools is increasingly behind.

### Key Architectural Decisions

**Decision 1: Non-profit foundation.** Ensures Ghost can never pivot away from its open-source mission. The trade-off is slower growth and limited enterprise sales capability.

**Decision 2: Handlebars themes over component-based.** Choosing a server-side template language that any developer can learn kept the theme ecosystem accessible. The trade-off is that Handlebars doesn't compose well with modern React/Vue frontends.

**Decision 3: Bookshelf ORM.** An older, less-maintained ORM that preceeded Prisma and Drizzle. Now a liability — lacks TypeScript-native query building, lacks Postgres support, and makes the database layer hard to modernize.

**Decision 4: No plugin system.** Kept the codebase clean and maintainable at the cost of extensibility. Ghost's philosophy is "build the thing well rather than build everything." Correct for its use case but wrong for a general-purpose CMS.

**Decision 5: Ember.js for admin.** A technically sound choice in 2013-2016, now a maintenance burden with a diminishing talent pool. The ongoing React migration creates two parallel UI systems.

**Decision 6: Koenig as a custom Lexical fork.** Rather than using Lexical directly, Ghost built a comprehensive card-based editor on top of it. This gives them total control over the editing experience but requires maintaining a large package family (`@tryghost/kg-*`).

---

## Payload CMS

### History & Founding

Payload was created by **James Mikrut** and **Dan Ribbens** at their agency **One More Studio** (based in Columbus, Ohio). The problem they were solving was practical: they kept building the same custom admin panels and backend systems for client projects. They wanted a self-hosted, code-first CMS that gave developers the power of a custom backend without building from scratch each time.

The GitHub repository was created in **January 2021**. The first public betas shipped through 2021 (v0.4 through v0.15). **Payload v1.0** launched in **November 2021** — the same month as Directus v9 and shortly after Strapi v4. The v1 release used Express + React Router as a standalone Express application with a React SPA admin.

**Payload v2.0** (October 2023) introduced significant TypeScript improvements and the Lexical rich text editor.

**Payload v3.0** (November 2024) was the most radical architectural change: Payload was completely re-architected from an Express + React Router SPA to a **Next.js App Router native** application. In v3, Payload installs directly into any existing Next.js `/app` folder. The frontend and backend live in the same Next.js project. This was described as "a new era for headless CMS."

Current version is **3.77.0** (February 18, 2026 — they release multiple times per week).

Payload raised a **seed round** to support the transition from agency project to product company, though exact amounts are not public. The company rebranded as **Payload CMS, Inc.**

### Architecture

Payload v3 is architecturally the most unusual CMS in this comparison. It is not a standalone application — it is a **library that installs into a Next.js app**.

```
your-next-app/
├── app/
│   ├── (payload)/
│   │   ├── admin/[[...segments]]/  # Auto-generated admin UI
│   │   └── api/[...slug]/          # REST + GraphQL API routes
│   ├── (frontend)/                 # Your frontend routes
│   └── layout.tsx
├── payload.config.ts               # THE config file — everything defined here
├── payload-types.ts                # Auto-generated TypeScript types
└── collections/
    ├── Posts.ts
    ├── Users.ts
    └── Media.ts
```

**The config-as-code model:** Everything in Payload is defined in `payload.config.ts`. Collections, globals, fields, hooks, access control, plugins — all of it is TypeScript code. There is no database-stored schema, no admin GUI to define content types. This is the most developer-centric approach of all three competitors.

```typescript
// payload.config.ts — complete example of what config looks like
import { buildConfig } from 'payload'

export default buildConfig({
  collections: [
    {
      slug: 'posts',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richText' },
        { name: 'author', type: 'relationship', relationTo: 'users' },
      ],
      hooks: {
        beforeChange: [({ data }) => { /* transform */ return data }],
      },
      access: {
        read: () => true,
        create: ({ req }) => req.user?.role === 'admin',
      }
    }
  ],
  plugins: [
    seoPlugin({ /* config */ }),
    formBuilderPlugin({ /* config */ }),
  ]
})
```

**Package structure (pnpm monorepo, Turborepo):**

```
packages/
├── payload/              # Core library (3.77.0)
├── next/                 # Next.js integration layer
├── ui/                   # React 19 admin UI components
├── richtext-lexical/     # Lexical editor (primary)
├── richtext-slate/       # Slate editor (legacy)
├── db-mongodb/           # MongoDB adapter (Mongoose)
├── db-postgres/          # PostgreSQL adapter (Drizzle)
├── db-sqlite/            # SQLite adapter (Drizzle)
├── db-d1-sqlite/         # Cloudflare D1 adapter
├── db-vercel-postgres/   # Vercel Postgres adapter
├── drizzle/              # Shared Drizzle utilities
├── graphql/              # GraphQL layer
├── plugin-seo/           # SEO plugin
├── plugin-form-builder/  # Form builder
├── plugin-nested-docs/   # Hierarchical content
├── plugin-search/        # Search integration
├── plugin-stripe/        # Stripe payments
├── plugin-multi-tenant/  # Multi-tenancy
├── plugin-ecommerce/     # E-commerce (new)
├── plugin-import-export/ # Data import/export
├── plugin-mcp/           # MCP (Model Context Protocol) integration
├── plugin-cloud-storage/ # Cloud storage (S3, Azure, GCS, R2)
├── storage-s3/           # S3 storage adapter
├── storage-gcs/          # GCS adapter
├── storage-azure/        # Azure adapter
├── storage-r2/           # Cloudflare R2 adapter
├── storage-vercel-blob/  # Vercel Blob adapter
├── storage-uploadthing/  # UploadThing adapter
├── email-nodemailer/     # Email via Nodemailer
├── email-resend/         # Email via Resend
├── kv-redis/             # Redis KV adapter
├── live-preview-react/   # Live preview for React
├── create-payload-app/   # CLI scaffolding
└── sdk/                  # JavaScript/TypeScript SDK
```

**Admin UI generation:** Payload's admin panel is automatically generated from the collection config. When you define a collection with fields, Payload generates the full CRUD UI with the correct field editors, relationships, filtering, and access-controlled views — all from code, with no manual UI work.

**Data access — the Local API:** Payload provides a "Local API" that lets you query the database directly from React Server Components without going through HTTP:

```typescript
// In a Next.js RSC — direct DB access, fully type-safe
const { docs } = await payload.find({
  collection: 'posts',
  where: { status: { equals: 'published' } },
  depth: 2,
})
```

### Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js ^18.20.2 or >=20.9.0 |
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (100%) |
| Admin UI | React 19 + Next.js RSC |
| Rich text | Lexical 0.35.0 (primary), Slate (legacy) |
| ORM (SQL) | Drizzle ORM 0.44.7 |
| ORM (Mongo) | Mongoose |
| Database | MongoDB, PostgreSQL, SQLite, D1, Vercel Postgres |
| Email | Nodemailer or Resend |
| Build tooling | pnpm + Turborepo |
| Type generation | json-schema-to-typescript |
| HTTP | Next.js API routes (no separate HTTP server) |
| Auth | Built-in JWT (jose 5.x) |

### Plugin/Extension System

Payload has a **first-class plugin system**. Plugins are TypeScript functions that receive and modify the Payload config:

```typescript
// A plugin is just a function
type Plugin = (config: Config) => Config

// Usage
export default buildConfig({
  plugins: [
    seoPlugin(),
    stripePlugin({ stripeSecretKey: process.env.STRIPE_SECRET_KEY }),
    cloudStoragePlugin({ collections: { media: { adapter: s3Adapter({ /* */ }) } } }),
  ]
})
```

This means plugins have access to the entire config — they can add collections, extend existing collections with new fields, add hooks, register custom components, inject admin views, and add API routes. It is the most composable plugin model of the three.

Official Payload plugins include: SEO, Form Builder, Nested Docs, Redirects, Search, Sentry, Multi-Tenant, Cloud Storage, Stripe, Import/Export, E-commerce, and MCP.

Because plugins are just TypeScript that returns a modified config, the entire system is type-safe. You get autocomplete and type checking on plugin configuration.

### AI Integration

Payload's AI integration is via the **`@payloadcms/plugin-mcp`** package, which adds **Model Context Protocol (MCP)** capabilities. MCP is the protocol developed by Anthropic that allows AI assistants to interact with tools and data sources.

With the MCP plugin, AI agents (Claude, GPT-4, etc.) can:
- Read and write content via Payload's APIs
- Query collections and globals
- Use Payload as a data source in AI-assisted workflows

This is an **infrastructure-level AI integration** — it makes Payload a connectable data source for AI tools, rather than embedding AI in the editor or admin UI. There is no AI writing assistant, no AI-powered field suggestions, and no LLM integration in the admin UI itself (as of v3.77.0).

The plugin uses `@modelcontextprotocol/sdk` 1.25.2 and `mcp-handler` for the implementation.

### Business Model

Payload is **MIT licensed** — completely free to use, modify, and commercialize with no restrictions.

Revenue comes from:
- **Payload Cloud** — managed hosting (pricing not prominently published; invite-based)
- **Enterprise support** contracts
- **Agency partnerships**

The MIT license is a deliberate choice to maximize adoption and community growth. Payload competes on developer experience, not on licensing restriction.

### Strengths

- **TypeScript-first, type-safe everything**: The config generates `payload-types.ts` automatically. Every collection, field, and relationship is fully typed. Developers get compile-time safety across the entire content model.
- **Config-as-code**: The entire CMS schema lives in version control as TypeScript. Schema changes are tracked in git, reviewable in PRs, and deployable via CI/CD — like infrastructure-as-code for your content model.
- **Next.js native v3 architecture**: No separate backend process. No CORS. No separate deployment. The admin and frontend co-exist in the same Next.js app. For teams already on Next.js, this is a massive DX win.
- **Flexible database support**: MongoDB, PostgreSQL, SQLite, D1, Vercel Postgres. The Drizzle-based adapters give excellent SQL type safety.
- **Powerful plugin ecosystem**: The config-function plugin model is the most composable extension system of the three competitors.
- **Local API**: Direct database access from RSCs without HTTP overhead.
- **One-click deployment**: Vercel and Cloudflare deploy buttons are built-in templates.
- **Active development**: ~weekly releases, very responsive GitHub issues.

### Weaknesses / Common Complaints

- **Developer-only tool**: Non-technical users cannot manage the content schema. Adding a new field requires a code change, a git commit, and a deployment. Payload is explicitly not for non-developer content managers who need to define their own data model.
- **Next.js lock-in (v3)**: v3 requires Next.js. Teams on other frameworks (Remix, SvelteKit, Astro, bare Express) cannot use v3 without friction. The config-as-code model was framework-agnostic in v1/v2; v3 ties Payload's future to Next.js's future.
- **Build-time performance**: The import map generation and TypeScript config compilation add meaningful build time overhead. Heavy build caches are required.
- **Connection pool management in dev**: The most-commented open GitHub issue (57 comments) is about database connections not being properly closed during hot reload / static site generation. `getPayloadHMR` spams DB connections in development.
- **dynamicIO incompatibility**: 41 comments on an issue about Payload being incompatible with Next.js's `dynamicIO` flag, blocking some optimization paths.
- **Cloud storage plugin at capacity**: 62 comments on a socket usage issue with the cloud storage plugin.
- **TypeScript inference slowness**: On large projects, the generated `payload-types.ts` file becomes large enough to slow down TypeScript Language Server in editors.
- **No built-in AI in the editor**: Compared to Directus's deep AI sidebar and context system, Payload's admin UI has no AI assistance.
- **Learning curve**: The config-as-code model is powerful but requires deep familiarity with TypeScript and Payload's concepts to use well.

### Key Architectural Decisions

**Decision 1: Config-as-code (not DB-stored schema).** The most distinctive choice Payload made. Schema in code means version control, type safety, and predictability. The trade-off: non-technical users can't self-service schema changes, and schema migrations require deployment cycles.

**Decision 2: Next.js integration (v3).** Moving from a standalone Express app to being a Next.js library was bold. It eliminated the separate-process overhead and enabled RSC data access. The risk: deep coupling to Next.js's release cycle. The peer dependency pin (`next: >=15.2.9 <15.3.0 || >=15.3.9 <15.4.0 || ...`) shows how tight this coupling is — every Next.js minor release requires Payload to explicitly test and approve it.

**Decision 3: Plugin system as config transformation.** Choosing plugins-as-functions rather than a plugin registry or event system was the right call. It's composable, type-safe, and testable in isolation. Ghost's complete absence of a plugin system is a cautionary tale that Payload learned from.

**Decision 4: Drizzle ORM for SQL.** Drizzle is a modern, TypeScript-native, low-overhead ORM. This enables type-safe query building and excellent migration tooling. A significant improvement over Ghost's Bookshelf.

**Decision 5: Separate database adapters.** Rather than committing to one database, Payload invested in making the database layer swappable. The `@payloadcms/db-*` package family means users can choose MongoDB (schema-flexible) or PostgreSQL (relational, hosted, Drizzle-native) depending on their needs.

---

## Directus

### History & Founding

Directus was founded by **Benjamin Haynes** (CEO) and **Rijk van Zanten** (CTO). The GitHub repository dates to **December 2012**, making it one of the oldest projects in this comparison. Early versions were a PHP-based database admin tool.

The company behind Directus is **Monospace, Inc.**, headquartered in Brooklyn, NY, with an all-remote global team.

**Version history milestones:**
- Pre-v9 (before Nov 2021): PHP-based, Angular admin, separate product from modern Directus
- **v9.0.0 (November 2021)**: Complete rewrite in TypeScript/Vue 3. The modern Directus was born. This is effectively a different product than pre-v9.
- **v10.0.0 (April 2023)**: Major release alongside the **license change from GPL to BUSL-1.1**. This controversial change made Directus free only for organizations with under $5 million in total finances.
- **v11.x (current, Feb 2026)**: Deep AI integration (AI sidebar, multi-provider support, MCP server, context staging, visual highlighting).

The BUSL license change in April 2023 caused significant community backlash. Directus defended it as necessary to sustain the company while maintaining the "open core" model, noting that the license converts to GPL-v3 three years after each release.

### Architecture

Directus's defining architectural concept is the **"database mirror"** (or "database-first") approach. Rather than defining a schema in code or a config file, Directus **connects to any existing SQL database** and introspects the schema at runtime.

You bring a database. Directus wraps it with:
- Auto-generated REST and GraphQL APIs
- An admin UI to manage data
- Role-based access control
- File management
- Automation (Flows)
- Auth (OAuth, SAML, LDAP)

This means schema changes made outside Directus (via raw SQL migrations, another tool, etc.) are reflected in Directus automatically. Non-destructively.

**Monorepo structure (pnpm workspaces):**

```
directus/
├── api/           # Node.js/Express backend (@directus/api v33.3.1)
├── app/           # Vue 3 admin SPA (@directus/app v15.4.0)
├── packages/
│   ├── ai/                    # AI types and model definitions
│   ├── composables/           # Shared Vue composables
│   ├── constants/
│   ├── create-directus-extension/  # Extension scaffolding CLI
│   ├── create-directus-project/    # Project scaffolding CLI
│   ├── env/                   # Environment variable management
│   ├── errors/
│   ├── extensions/            # Extension type definitions
│   ├── extensions-registry/   # Extension marketplace registry
│   ├── extensions-sdk/        # Extension development toolkit
│   ├── schema/                # DB schema inspection utilities
│   ├── schema-builder/        # Schema construction helpers
│   ├── specs/                 # OpenAPI/GraphQL specs
│   ├── storage/               # Storage abstraction
│   ├── storage-driver-azure/
│   ├── storage-driver-cloudinary/
│   ├── storage-driver-gcs/
│   ├── storage-driver-local/
│   ├── storage-driver-s3/
│   ├── storage-driver-supabase/
│   ├── themes/                # Studio theming
│   ├── types/
│   └── utils/
├── sdk/           # JavaScript/TypeScript SDK
└── directus/      # CLI entry point
```

**API layer (`api/`):** Built on **Express** with **Knex** as the query builder. The Knex layer is critical: it's what enables Directus to support 7 different database engines (PostgreSQL, MySQL, MariaDB, SQLite, MS SQL Server, CockroachDB, OracleDB). Knex normalizes query syntax across all of them.

**Database schema introspection:** The `@directus/schema` package contains the database inspector. On startup and on schema changes, Directus queries the database's information_schema (or equivalent) to build an in-memory representation of every table, column, and relationship. This drives the admin UI, API generation, and type coercion.

**Admin UI (`app/`):** A full Vue 3 SPA compiled with Vite. The admin is rich — it includes data browsing, collection management, file management, user management, flow builder, and the AI sidebar. It uses Editor.js (via `@editorjs/*` packages) for rich text. The admin is served as a static build from `app/dist/index.html`.

**Flows (Automation):** Directus has a built-in visual workflow automation system called Flows. Flows are trigger-action chains (webhooks, schedules, manual, database events) that can run custom JavaScript/TypeScript operations, call APIs, send emails, and manipulate data — a no-code automation layer built into the CMS.

### Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js >=22 |
| HTTP framework | Express |
| Query builder | Knex |
| Databases | PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, CockroachDB, OracleDB |
| Admin UI | Vue 3.5.24 (SPA, built with Vite) |
| Rich text editor | Editor.js (block editor) |
| Language | TypeScript (100%) |
| AI SDK | `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai-compatible` (Vercel AI SDK) |
| Build tooling | pnpm + Rolldown/Rollup |
| Auth | JWT + OAuth2/OpenID/SAML/LDAP |
| MCP | `@modelcontextprotocol/sdk` (built-in, not a plugin) |

### Plugin/Extension System

Directus has the **most mature and comprehensive extension system** of the three competitors. Extensions are developed with the `@directus/extensions-sdk` toolkit and can be installed from the marketplace or as local files.

Extension types:

| Type | Purpose |
|---|---|
| **Interface** | Custom field input components in the admin UI (built in Vue) |
| **Display** | Custom field display renderers for list/detail views |
| **Layout** | Custom data browsing layouts (e.g., map view, calendar view, kanban) |
| **Module** | Entire new pages/sections in the admin navigation |
| **Hook** | Server-side event listeners (filter/action) for the API |
| **Endpoint** | Custom API routes added to the Directus server |
| **Operation** | Custom steps in the Flows automation system |
| **Panel** | Dashboard/insight panel components |
| **Bundle** | Groups multiple extension types into one package |

Extensions run in an **isolated sandbox** using `isolated-vm` for server-side extensions, preventing malicious extensions from escaping to the host process. App extensions (Vue components) run in the browser context normally.

Extensions can be published to the Directus Marketplace (via `@directus/extensions-registry`) and installed without restarting the server in cloud environments.

The `@directus/extensions-sdk` CLI scaffolds extension projects with TypeScript, testing, and build tooling included.

### AI Integration

Directus v11 has the **deepest native AI integration** of all three competitors. It is not an add-on or plugin — AI is a core feature of the Directus Studio.

**AI providers supported** (via Vercel AI SDK):
- OpenAI (GPT-4o Mini, GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano, GPT-5 series)
- Anthropic (Claude series)
- Google (Gemini series)
- Any OpenAI-compatible endpoint

**AI features in the admin UI (`app/src/ai/`):**
- `ai-conversation.vue` — Full conversation interface (chat-style AI sidebar)
- `ai-context-card.vue` — Context about the current item being edited
- `ai-context-menu.vue` — AI actions surfaced in right-click context menus
- `ai-magic-button.vue` — One-click AI actions on individual fields
- `ai-sidebar-detail.vue` — Persistent AI sidebar panel
- `ai-input.vue` / `ai-textarea.vue` — AI-augmented form inputs
- `ai-message-list.vue` / `ai-message.vue` — Conversation history
- `ai-model-selector.vue` — Select which AI model to use
- `ai-prompt-variables-modal.vue` — Template prompt variables
- `use-context-staging.ts` — Manages which data is included in AI context
- `use-visual-element-highlight.ts` — Highlights page elements for visual context
- `define-tool.ts` — Defines MCP-style tools the AI can call

The AI system can see and manipulate the current collection data, call Directus APIs as tools, and be configured with custom prompts by admins.

**MCP server:** Directus includes a built-in MCP server (via `@modelcontextprotocol/sdk`), making Directus data directly accessible to Claude, GPT-4, and other MCP-compatible AI agents without any plugin installation.

**Model configuration:** The `@directus/ai` package defines all supported AI models with context limits, pricing (input/output cost per token), and capability flags (attachment support, reasoning support). Admins configure which models are available in Directus settings.

### Business Model

Directus operates under a **dual-track model**:

**BUSL-1.1 license** (changed from GPL in April 2023):
- Free for any organization with total finances under $5,000,000 per year (revenue + funding + budget)
- Requires a commercial license for larger organizations
- Each release converts to GPL-v3 after 3 years from release date
- Extensions SDK is MIT licensed (separate from the core)

**Directus Cloud pricing:**
- Professional: $99/month (billed annually) — 5 Studio users, 75,000 DB entries, 250,000 API requests/month, shared infrastructure
- Enterprise: Custom pricing — dedicated infrastructure, custom user counts, unlimited API requests, premium support ($300/month add-on), SAML/LDAP SSO, data processing agreement

**Self-hosted commercial license:** Organizations above the $5M threshold contact Directus sales for licensing.

### Strengths

- **Database-first flexibility**: Connect to any existing SQL database. No schema migration from Directus's own format. Teams with existing databases get an instant API, admin, and auth layer.
- **Deepest AI integration**: The AI sidebar, context staging, visual highlighting, and multi-provider support are genuinely ahead of all competitors.
- **MCP built-in**: First-class MCP server support without plugins.
- **Richest extension system**: Interfaces, Displays, Layouts, Modules, Hooks, Endpoints, Operations, Panels — every layer of the system is extensible.
- **Broadest database support**: 7 databases vs. Ghost's 2 and Payload's 5.
- **Visual automation (Flows)**: A no-code automation builder built into the core — comparable to n8n/Zapier but self-hosted.
- **Polished admin UI**: The Vue 3 admin is feature-rich with data visualization (Insights), file management, user management, and the full Flow builder.
- **100,000+ cloud members**: Strong adoption signal.

### Weaknesses / Common Complaints

- **BUSL license controversy**: The April 2023 license change alienated a significant portion of the open-source community and enterprise evaluators who prefer MIT/Apache licenses. Many community contributors stopped contributing after the change. The $5M revenue threshold creates ambiguity for growing startups.
- **Schema-first, not code-first**: Schema is stored in the database (in `directus_collections`, `directus_fields` tables), not in version control. There is no native way to track schema changes in git. Migrations must be done through Directus's API or admin UI. This is the inverse of Payload's strength.
- **Vue-specific extensions**: App extensions (Interfaces, Displays, etc.) must be written in Vue. Teams standardized on React cannot reuse their component libraries.
- **Complexity ceiling**: Directus does so many things (CMS, BaaS, automation, analytics, file management, auth, extensions) that the cognitive overhead is high. New users report being overwhelmed.
- **The "wraps your DB" model has limits**: Since Directus mirrors the DB schema, it works great for simple column types but gets complicated with complex custom data structures, polymorphic relations, or non-standard data types.
- **Flows debugging**: The visual flow builder is powerful but debugging complex flows (especially with custom JS operations) requires experience. Error messages are sometimes opaque.
- **GraphQL update permission bug**: The most commented open GitHub issue (43 comments) is about GraphQL create mutations checking update permissions instead of create permissions — a permissions bug that has been open for an extended period.
- **Collection/field changes lost in some versions** (30 comments): A reliability bug where schema changes saved to DB are not reflected in the UI without a server restart.
- **Performance under load**: Because every request goes through the schema inspection layer and knex query builder, Directus adds overhead compared to a hand-written API. High-traffic applications may need caching layers.
- **No TypeScript safety at the query layer**: Unlike Payload's config-as-code which generates types, Directus's DB-mirror approach means queries to `directus.items('posts')` are not type-safe without additional tooling.

### Key Architectural Decisions

**Decision 1: Database mirror (not schema-in-code).** Connecting to existing databases and introspecting them makes Directus universally applicable but sacrifices version-controlled schema management. This is the fundamental design tension at the center of Directus. It's why "schema in DB vs. schema in code" is one of the primary axes for CMS selection.

**Decision 2: Vue 3 for the admin.** A sensible choice given Vue's composition API elegance and the fact that the Directus team (particularly Rijk van Zanten, CTO) is from the Vue ecosystem. The trade-off: app extensions must be Vue, locking out React developers from building first-class UI extensions.

**Decision 3: Knex as the query layer.** Knex's database agnosticism (supporting 7 databases) is core to Directus's "bring your own database" promise. The trade-off is that Knex is query-builder-level (not ORM-level), requiring more explicit query construction. Modern alternatives like Drizzle and Prisma are more TypeScript-native.

**Decision 4: BUSL license change.** A controversial but understandable business decision. Directus was struggling to monetize a fully GPL product. BUSL gives them a commercial moat while preserving the spirit of open source (GPL conversion after 3 years). The $5M revenue threshold captures enterprise customers who can afford to pay while keeping it free for the vast majority of the ecosystem.

**Decision 5: Deep native AI rather than plugin AI.** Building AI directly into the Directus Studio (not as an optional plugin) was the right call for 2026. The AI sidebar with context staging, visual highlighting, and tool-calling is a genuinely differentiated feature. No other CMS in the market ships this level of AI integration natively.

**Decision 6: Flows as a built-in automation engine.** Rather than deferring to Zapier or n8n for automation, Directus built it in. This increases the product's surface area but also its stickiness — teams that build Flows workflows become deeply tied to Directus.

---

## Lessons for Tovu

This section synthesizes what Tovu should copy, what it should avoid, and where the gap exists that Tovu fills.

---

### What Tovu Should Copy

**From Payload: Config-as-code with full TypeScript types.**
Payload's `payload.config.ts` + auto-generated `payload-types.ts` is the best developer experience in the space. Schema in git, type safety everywhere, schema changes tracked in PRs. Tovu's plugin/content-type system should be code-first with type generation. Any approach that stores schema in a database (like Directus) sacrifices version control and type safety.

**From Payload: The plugin-as-config-function model.**
Payload's plugin system (`(config) => config`) is elegant, composable, and type-safe. It eliminates the complexity of event buses, hook registries, and plugin lifecycles. Tovu's extensibility should follow this pattern: plugins transform the config, and the transformed config drives everything downstream.

**From Payload: Swappable database adapters.**
The `@payloadcms/db-*` family lets Payload support MongoDB, Postgres, SQLite, D1, and Vercel Postgres. Tovu's database layer should be abstracted behind the Port interface from day one, with concrete adapters for at least Postgres (Drizzle) and SQLite (Drizzle/D1). Do not bake in a single database like Ghost did with Bookshelf+MySQL.

**From Directus: Deep native AI, not plugin AI.**
Directus's AI sidebar, context staging, multi-provider support, and MCP server are built into the core — not an optional add-on. Tovu's AI Context Engine should be a first-class citizen, not bolted on later. Directus proves the market wants AI-native tooling in the admin UI itself. The difference between Tovu and Directus: Directus added AI to a data platform. Tovu should be designed from scratch as an AI-native CMS where AI is not a feature but the architecture.

**From Directus: MCP server as a built-in primitive.**
Both Payload (plugin) and Directus (built-in) support MCP. Tovu's Protocol Layer (MCP/A2A/AG-UI) in the architecture is correct. MCP is becoming the de facto protocol for AI tool integration. Being MCP-native from day one is a genuine differentiator in 2026.

**From Directus: Richest extension system.**
Directus's extension type taxonomy (Interface, Display, Layout, Module, Hook, Endpoint, Operation, Panel, Bundle) maps every layer of the system to an extension point. Tovu's plugin system should think at the same granularity: plugins can extend field renderers, admin views, API routes, lifecycle hooks, AI tools, and the theme system — not just "add a new post type."

**From Ghost: Non-profit foundation structure (if applicable).**
Ghost's foundation structure builds deep long-term trust. If Tovu's positioning includes community trust and anti-VC sentiment, the legal structure matters. Ghost cannot be acquired. That guarantee attracts a specific type of user who has been burned by VC-backed open source pivots (MongoDB going SSPL, Elastic going proprietary, etc.).

**From Ghost: The publishing and monetization layer.**
Ghost's built-in membership tiers, newsletter system, Stripe integration, and comment system are mature and deeply tested. Tovu's publishing layer should at minimum match Ghost's membership/newsletter feature set. Ghost has a 10+ year head start on the publishing UX — study it carefully.

**From Ghost: Koenig-style block editor architecture.**
Ghost's block editor (Koenig) demonstrates how to build a card-based rich text editor with custom card types, server-side rendering, and import/export conversions. Tovu's editor should use Lexical (as both Ghost and Payload do), with custom block types that are registered through the plugin system.

---

### What Tovu Should Avoid

**Avoid Ghost's Bookshelf ORM.** Bookshelf is legacy. It predates TypeScript, lacks Postgres support, and makes the data layer hard to modernize. Use Drizzle (as Payload does) or an equivalent TypeScript-native query builder.

**Avoid Ghost's Ember.js admin.** Choosing a niche admin framework creates a talent problem. Ghost is now migrating away from Ember after years of technical debt. Tovu's admin should be React (aligned with the largest component ecosystem) or Vue (Directus's choice), but not an outlier framework.

**Avoid Ghost's MySQL-only limitation.** PostgreSQL is the default for modern cloud deployments (Supabase, Neon, Railway, Render). Not supporting Postgres in 2026 is a significant barrier to adoption.

**Avoid Directus's BUSL license.** The April 2023 BUSL change caused a measurable community backlash. For Tovu to build a large contributor base and ecosystem, MIT licensing is strongly preferred. Ghost (MIT) has 51,840 stars; Payload (MIT) has 40,661; Directus (BUSL) has 34,243 — the licensing signal is visible in the star counts. Furthermore, the $5M revenue threshold creates legal uncertainty for growing startups considering Directus.

**Avoid Directus's schema-in-database model.** The inability to track schema changes in git is a significant weakness for development teams. Directus's "connect to your existing DB" pitch is powerful for retrofitting existing data but creates a second-class developer experience compared to Payload's code-first model. Tovu should be code-first: content types defined in TypeScript, tracked in git, deployed with CI/CD.

**Avoid Payload's tight Next.js coupling (v3).** Payload v3's decision to install into the Next.js `/app` folder is a bold DX improvement for Next.js users, but it makes Payload impossible to use without Next.js. Tovu's architecture (framework-agnostic adapters) is the correct answer: the core works standalone, and the Next.js adapter is one of many options. Do not make the same mistake Payload made by coupling the core to a single framework.

**Avoid Ghost's no-plugin decision.** Ghost's explicit non-plugin stance is appropriate for their narrow publishing use case. Tovu is a general-purpose CMS — the plugin system is not optional. Every CMS that aimed to be general-purpose without extensibility eventually lost to competitors with plugins.

---

### Where the Gap Is That Tovu Fills

The three competitors establish a clear market topology:

| Position | CMS | Who it's for | Where it fails |
|---|---|---|---|
| Publishing-first | Ghost | Creators, journalists, newsletters | No extensibility; MySQL-only; no AI; no custom data models |
| Developer-first, framework-bound | Payload | Next.js developers | Next.js dependency; no AI in UI; non-technical users can't self-service |
| Data-platform-first | Directus | Data teams, BaaS use cases | BUSL license; schema in DB not code; Vue-only extensions; overwhelming complexity |

**The gap Tovu fills is the intersection of three properties that no single existing CMS provides simultaneously:**

1. **AI-native by design** — Not "AI added to a CMS" (Directus), not "CMS with MCP plugin" (Payload), not "CMS with no AI" (Ghost). Tovu's architecture places the AI Context Engine as a core module alongside the Content Engine and Plugin Runtime. Every content operation — create, update, relate, publish — is AI-aware at the architecture level.

2. **Framework-agnostic + code-first** — Payload showed that code-first schema is the right model for developers. But Payload coupled it to Next.js. Directus showed that framework-independence is valuable. But Directus coupled it to database-stored schema. Tovu delivers code-first TypeScript schema (Payload's strength) with framework-agnostic deployment (Directus's strength). The core is an adapter-pattern library that works with Next.js, Nuxt, SvelteKit, Astro, or standalone.

3. **Genuinely MIT and sustainable** — Ghost (MIT, non-profit) proved that MIT + hosting revenue is a viable business model. Directus (BUSL) proved that open-source CMSs without a clear monetization path eventually change their license in ways that damage the community. Tovu should follow the Ghost model: MIT core, managed hosting revenue, foundation or transparent company structure.

**The specific user Tovu targets that none of the three serve well:**

A development team building a content-rich application in 2026 that:
- Wants a code-first, TypeScript-native content model (Payload strength)
- Needs to deploy on a framework other than Next.js (Payload weakness)
- Wants AI writing assistance, AI content generation, and AI tool-calling built into the admin (Directus strength, but BUSL + Vue-locked + overwhelming)
- Needs a publishing experience that matches Ghost's newsletter/membership quality (Ghost strength, but no extensibility)
- Can't or won't pay for enterprise licensing based on revenue thresholds (Directus weakness)
- Wants their schema in git, deployable with CI/CD (Payload strength, Directus weakness)

This is not a small niche. It is the modern full-stack developer building anything from a media brand to a SaaS product's documentation system to an e-commerce catalog — anyone who needs content infrastructure that doesn't fight their stack.

The single phrase that captures the gap: **Ghost is for publishers. Payload is for Next.js developers. Directus is for data teams. Tovu is for teams building AI-powered applications that happen to have a content layer.**
