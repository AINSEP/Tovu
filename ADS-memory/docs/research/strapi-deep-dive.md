# Competitor Deep Dive: Strapi

*Research date: July 6, 2026. Star/version/license numbers verified from the GitHub
API; architecture claims grounded in the Codebase Memory MCP index of `strapi`
(`OSS-Repos/strapi`, 84,358 nodes / 145,258 edges) — symbols cited were inspected
via `search_graph`/`get_architecture`. Companion to `competitor-analysis.md`
(Ghost/Payload/Directus), which only covered Strapi in passing.*

> **Why this doc exists.** Strapi is the **most-starred** open-source headless CMS
> — it had been under-covered relative to how popular it is. Current stars
> (Jul 2026): **Strapi 72,616** · Ghost 54,302 · Payload 43,425 · Directus 36,421.
> If we're reasoning about "who won and why," Strapi is the one to understand.

---

## Overview

| Property | Strapi |
|---|---|
| **Founded** | 2015 (repo created 2015-09-30) — Pierre Burgy, Aurélien Georget, Jim Laurie (Paris) |
| **Milestones** | v3 (2020, last JS-first); **v4** (Nov 2021 — design system, RBAC, plugins API); **v5** (2024 — Document Service, Vite admin, TS-first) |
| **Current version** | v5.50.0 (Jul 2026); releases weekly on `develop` |
| **License** | **MIT (Community)** + **Enterprise Edition carve-out** — anything under an `ee/` directory is proprietary; cloud terms can override (GitHub reports `NOASSERTION` for the dual license) |
| **Language** | TypeScript-first as of v5 (3,843 TS files vs 771 JS in the graph) |
| **Tech stack** | Node.js, Koa (HTTP), **Knex** query builder + custom Dialect layer, React 18 + Vite admin, Strapi Design System |
| **Databases** | PostgreSQL, MySQL/MariaDB, SQLite — via Knex + per-dialect classes |
| **Primary use case** | General-purpose headless CMS; **non-developers define content types in a GUI** (the key differentiator) |
| **GitHub stars** | ~72,616 (Jul 2026) — #1 in the category |
| **Business model** | Open-core: MIT core + paid Enterprise features + Strapi Cloud |
| **Monorepo** | Yes (Yarn + Nx) — `packages/core/*`, `packages/plugins/*`, `packages/providers/*`, `packages/cli/*` |
| **AI features** | **New in v5:** a built-in **MCP server** (`services/mcp/*` — tool/prompt/resource registries, RBAC-aware) + an `ai-tooling` package |

---

## History & Founding

Strapi was created in **2015** by three French engineers — **Pierre Burgy**,
**Aurélien Georget**, and **Jim Laurie** — originally as a way to "bootstrap your
API" (the name is a contraction of *bootstrap* + *API*). It predates every other CMS
in our comparison set except WordPress and the pre-v9 Directus. The company (Strapi,
Inc.) later relocated its center of gravity to the US and raised venture funding
(Series A/B), which is worth noting: unlike Ghost's non-profit or Payload's lean
agency-origin, **Strapi is VC-backed**, and that shows up in its enterprise/cloud
monetization pressure and its licensing choices.

Version arc:
- **v3 (2020)** — the last JavaScript-first generation; established the "GUI
  content-type builder + auto-generated REST/GraphQL" identity.
- **v4 (Nov 2021)** — shipped the same month as Payload v1 and Directus v9. Added the
  modern plugin API, the Strapi Design System, and RBAC. This is the version most of
  the market ran for years.
- **v5 (2024)** — the current generation. The headline change is the **Document
  Service API** (replacing the Entity Service), plus a Vite-based React admin,
  TypeScript-first codebase, and the beginnings of native AI/MCP.

---

## Architecture

Strapi is a **Yarn/Nx monorepo** with a clean three-bucket package taxonomy. From the
code graph (`get_architecture`):

```
packages/
├── core/
│   ├── strapi/            # the runtime entrypoint / server bootstrap
│   ├── core/              # THE core services (document-service, event-hub, mcp, entity-service…)
│   ├── database/          # Knex-based data layer + Dialect abstraction + lifecycles
│   ├── content-manager/   # the admin content editing app + history/lifecycles
│   ├── content-type-builder/  # the GUI schema builder (writes schema files)
│   ├── content-releases/  # scheduled/grouped publishing (enterprise-flavored)
│   ├── review-workflows/  # editorial approval stages
│   ├── permissions/       # RBAC engine
│   ├── upload/            # media library (behind provider adapters)
│   ├── email/             # email service (behind provider adapters)
│   ├── admin/             # React 18 + Vite admin shell + Design System
│   ├── types/             # shared TS contracts (incl. plugin lifecycle types)
│   └── data-transfer/     # import/export/transfer engine
├── plugins/               # first-party plugins: graphql, i18n, users-permissions,
│                          #   documentation, sentry, color-picker, cloud
├── providers/             # swappable provider adapters:
│                          #   email-{nodemailer,sendgrid,mailgun,amazon-ses,sendmail}
│                          #   upload-{local,aws-s3,cloudinary}
├── cli/                   # create-strapi-app, cloud CLI
├── generators/            # code generators (API scaffolding)
└── utils/                 # logger, typescript, upgrade (codemod runner), tsconfig
```

**The runtime object (`Strapi`).** Everything hangs off a central `Strapi` instance
(`packages/core/core/src/Strapi.ts`) — `strapi.plugin(...)`, `strapi.destroy()`,
services registry, etc. `Strapi.plugin` is a top hotspot (fan-in 179): plugins reach
into the core through this object, and the core reaches back into plugins. The graph's
boundary counts make the coupling explicit: **plugins→core 880 calls, core→plugins
439** — bidirectional. This is why Strapi scored an **8.3% cross-prefix edge ratio**
in the earlier graph analysis (porous core↔plugin boundaries), versus Directus's 2.0%.

**Document Service (v5's defining change).**
`packages/core/core/src/services/document-service/repository.ts` — `findMany`,
`create`, `update`, `publish`. In v4 you talked to the *Entity Service* (rows). In v5
you talk to the *Document Service* (documents), which unifies **draft & publish** and
**i18n locales** as first-class concepts: a "document" has draft/published versions and
per-locale variants behind one id (`draft-and-publish.ts`: `defaultStatus`,
`statusToLookup`, `statusToData`; `components.ts` handles nested component upserts). The
legacy `entity-service/` still ships as a compatibility layer. This is the single most
important thing to study in v5 — it's how a CMS models versioned, localized content
cleanly above the raw table.

**Database layer (`packages/core/database`).** Built on **Knex**, not an ORM. The key
abstraction is the **`Dialect`** class (`src/dialects/dialect.ts`) with
`configure`/`initialize`/`getTables`/`useReturning`/`supportsUnsigned`/
`supportsOperator` — concrete subclasses per engine (Postgres, MySQL, SQLite) normalize
behavioral differences. `query/query-builder.ts` (`getKnexQuery`) compiles Strapi's
query objects to Knex. `Database.transaction` wraps units of work. Schema is derived
from content-type definitions, and **lifecycles** (`content-manager` history services,
`core/database` lifecycles) fire `beforeCreate`/`afterUpdate`/etc. hooks — this is the
same Knex-dialect strategy Directus uses, and the reason both support many databases.

**Event Hub (`services/event-hub.ts`).** `createEventHub` returns an
`emit`/`subscribe`/`on`/`off`/`once`/`unsubscribe`/`destroy` surface with a
`defaultSubscriber`. Domain events (entry created/updated/published, media uploaded,
etc.) flow through here; webhooks and plugins subscribe. This is the exact pattern the
Claude findings flagged as Strapi's best-in-class contribution.

**Content-Type Builder (the differentiator).** `ANY /content-type-builder/
content-types/:uid?` — a first-party admin app that lets a **non-developer define the
data model through a GUI**, which writes schema JSON/TS files to the project. This is
Strapi's core identity and the thing Payload deliberately *doesn't* do (Payload is
code-only). It's why agencies love Strapi: the client can add a field without a
developer.

---

## Plugin / Extension System

Strapi's extensibility is a **plugin + provider** two-tier model:

**Plugins** are packages with a `strapi-server.js` (backend) and/or `strapi-admin.js`
(frontend) entry, exposing lifecycle hooks typed in `packages/core/types/src/plugin/
config/strapi-server/lifecycle.ts` — **`register`** (wire services/routes before
bootstrap), **`bootstrap`** (run after), and **`destroy`**. A plugin can register
content types, routes (`registerPluginRoutes`), services, policies, middlewares, and
admin UI. First-party examples in-repo: `graphql`, `i18n`, `users-permissions` (the
auth/RBAC-for-end-users plugin), `documentation` (OpenAPI), `sentry`, `color-picker`.

**Providers** are the narrower swappable-adapter tier — a provider implements a single
capability interface. `packages/providers/` ships `email-{nodemailer,sendgrid,mailgun,
amazon-ses,sendmail}` and `upload-{local,aws-s3,cloudinary}`. Each is a tiny package
conforming to the `email` or `upload` service contract. **This is the pattern worth
copying**: capability port + a family of thin adapter packages, chosen by config.

Trade-off: because plugins get deep access to the `Strapi` object and the core calls
back into plugins, the boundary is porous (the 8.3% cross-prefix number). Powerful, but
the platform is hard to keep small — the opposite of a strict ports/adapters core.

---

## AI Integration (new in v5 — not in the earlier analysis)

This is the biggest change since our Feb 2026 write-up. Strapi has added a **built-in
MCP (Model Context Protocol) server** at `packages/core/core/src/services/mcp/`:

- **`McpToolRegistry`** (`tool-registry.ts`) — registers callable tools; `bind()` wires
  them to the running Strapi instance.
- **`McpCapabilityRegistry` / `McpCapabilityDefinitionRegistry`** (`internal/`) — the
  capability layer (a top graph hotspot, fan-in 421), the backbone all registries share.
- **`McpPromptRegistry`** and **`McpResourceRegistry`** — MCP prompts and resources,
  matching the full MCP spec surface (tools + prompts + resources).
- **RBAC-aware:** there's an integration test `mcp/mcp-content-manager-rbac.test.api`
  — the MCP tool surface is **filtered by the same permissions engine** as the admin,
  so an AI agent can't exceed the caller's role. That's the right way to do it.
- An **`ai-tooling`** package and `/schemas/chat/{generate-title,attachment,feedback}`
  routes indicate admin-side AI chat features are landing too.

So Strapi has moved from "no AI" (its state in the older doc) to **MCP-native with RBAC
enforcement** — converging with Directus and validating an MCP-first posture. It is not
yet as deep as Directus's editor-embedded AI sidebar, but the *tool-surface + RBAC*
design is arguably cleaner and is directly relevant to Tovu's own tool-surface plan
(ADR-013/014).

---

## Business Model

**Open-core, VC-backed.** The core (`packages/*` outside `ee/`) is **MIT**. Anything
under an **`ee/` directory is the proprietary Enterprise Edition** (SSO/SAML, advanced
RBAC, review workflows, audit logs, content history depth, etc.), gated by a license
key. **Strapi Cloud** is the managed hosting tier. GitHub shows `NOASSERTION` precisely
because the LICENSE file describes both regimes plus cloud-terms overrides.

Contrast with the set: Ghost (pure MIT, non-profit), Payload (pure MIT), Directus
(BUSL). Strapi sits between MIT and BUSL — the *code you can see* is mostly MIT, but the
enterprise features are source-available-but-not-free. This open-core split is a
well-trodden model (GitLab, etc.) and clearly hasn't hurt adoption — Strapi still leads
on stars.

---

## Strengths

- **GUI content-type builder** — non-developers model data without code. This is the
  #1 reason for its popularity with agencies and mixed teams, and the thing no
  code-first CMS (Payload) offers.
- **Broadest reach of the "traditional" headless CMSs** — most stars, largest plugin
  marketplace, most tutorials/StackOverflow answers, biggest hiring pool.
- **Clean provider adapter family** — `email-*` / `upload-*` packages are a textbook
  capability-port pattern.
- **Event Hub** — a clean in-process pub/sub for domain events + webhooks.
- **Multi-database via Knex Dialects** — Postgres/MySQL/SQLite from one query layer.
- **v5 Document Service** — a genuinely good model for draft/publish + i18n as
  first-class, unified behind a document id.
- **MCP-native + RBAC-filtered AI** (v5) — caught up on AI with a well-scoped design.
- **Auto-generated REST *and* GraphQL** — GraphQL is a first-party plugin, not bolted on.

## Weaknesses / Common Complaints

- **Porous core↔plugin boundaries** (8.3% cross-prefix; bidirectional core/plugin
  calls). Powerful but heavy — the framework has strong "gravity" and is hard to keep
  minimal or embed.
- **Schema-in-files-from-a-GUI is an awkward middle** — not fully code-first (types can
  drift; the builder writes files) and not fully DB-introspected (Directus). You get
  some of both worlds' downsides.
- **Knex, not a typed ORM** — query building isn't TypeScript-native the way Payload's
  Drizzle layer is; less compile-time safety at the data layer.
- **Migration pain across majors** — v3→v4 and v4→v5 were large breaking jumps (hence
  the dedicated `utils/upgrade` codemod runner). Upgrades have historically been rough.
- **Open-core friction** — features you might expect (SSO, advanced RBAC, audit logs)
  are paywalled under `ee/`; the free/enterprise line can surprise evaluators.
- **VC monetization pressure** — more aggressive cloud/enterprise steering than the
  non-profit (Ghost) or lean (Payload) alternatives.
- **Heavy admin** — full React/Vite SPA + Design System; not a lightweight embed.

---

## Key Architectural Decisions

**Decision 1: GUI-defined content types (schema from a builder).** The defining choice
— it made Strapi accessible to non-developers and drove adoption, at the cost of a
code-first developer experience. It's the *inverse* of Payload's config-as-code bet.

**Decision 2: Knex + per-dialect classes (not an ORM).** Bought broad database support
and full query control; cost is no typed query layer. Same trade Directus made.

**Decision 3: Plugin system with deep `Strapi`-object access.** Maximum extensibility,
minimum boundary discipline — the porous-boundary smell is the direct consequence.

**Decision 4: Provider packages per capability.** The `email-*`/`upload-*` split is the
cleanest part of the architecture and the most reusable idea for us.

**Decision 5: v5 Document Service.** Re-basing the content API on documents (draft/
publish + i18n unified) rather than raw entities — a maturity move that took a major
version and a big migration, but it's the right model.

**Decision 6: MCP-native, RBAC-filtered AI (v5).** Rather than an editor AI sidebar
first (Directus's path), Strapi led with an MCP tool/prompt/resource server gated by its
permission engine. For an agent-driven future this is arguably the more foundational
order of operations.

---

## Lessons for Tovu

**Copy — the provider adapter family.** `packages/providers/{email-*,upload-*}` is
exactly our `StoragePort`/`EmailPort` + thin-adapter-packages shape. Model our upload
and email layers on this: one capability contract, a family of small adapter packages
selected by config.

**Copy — the Event Hub semantics.** `emit`/`subscribe`/`once` over domain events is
what we already have with `EventBusPort` + outbox. Strapi validates the shape; keep
ours (we additionally have durable outbox delivery, which Strapi's in-process hub does
not).

**Copy — the v5 Document Service model** when we add draft/publish + i18n. Documents
(one id → draft/published × locales) is a better content model than bolting status and
locale columns onto a flat posts table. Our `PostStatus` is the seed of this; grow it
toward the Document Service shape rather than reinventing.

**Copy — MCP tool surface *filtered by RBAC*.** This is the most directly relevant
finding for ADR-013/014: Strapi's `mcp/*` registries gate every tool through the
permissions engine (`mcp-content-manager-rbac` test). Our assistant tool surface
(`tools.ts` `surface` seam + per-workspace grants) should enforce the *same* auth as
the admin — Strapi is the reference implementation to study.

**Learn from — the boundary porosity.** Strapi's 8.3% cross-prefix vs Directus's 2.0%
is the cautionary tale: a plugin system that hands plugins the whole runtime object
becomes hard to keep clean. Our dependency-cruiser gate (todos.md §24) + strict ports
are the antidote. Give plugins *capabilities*, not the kernel.

**Learn from — the "GUI vs code" schema tension.** Strapi (GUI-writes-files),
Payload (pure code), Directus (pure DB introspection) each picked one and ate the
downside. Tovu's stance is code-first content types (Payload's strength) — but note
that Strapi's *popularity* comes precisely from letting non-developers model data. Our
AI-native angle can square this: the **assistant** becomes the "GUI" that edits the
code-first schema, so non-developers get Strapi's accessibility without giving up
Payload's git-tracked, type-safe model. That's a genuine differentiator, and Strapi's
lead is the evidence that the non-developer modeling need is real.

**Don't copy — Knex-as-data-layer.** Strapi and Directus both use Knex (query builder,
untyped). Our decision to adopt **Drizzle** (Payload's approach) gives a typed layer
with a cleaner SQLite→Postgres seam. Strapi's Dialect abstraction is a fine *conceptual*
reference for what per-dialect differences you must normalize, but the typed-ORM path is
better for us.

---

## Where Strapi sits in the market map

The `competitor-analysis.md` topology, with Strapi added:

| Position | CMS | Who it's for | Where it fails |
|---|---|---|---|
| Publishing-first | Ghost | Creators, newsletters | No extensibility, MySQL-only |
| Developer-first, code | Payload | Next.js/TS developers | Next.js lock-in, non-devs can't self-serve |
| Data-platform-first | Directus | Data teams, BaaS | BUSL, schema-in-DB, Vue-only |
| **General-purpose, GUI-modeled** | **Strapi** | **Agencies, mixed teams, non-dev modelers** | **Porous boundaries, open-core paywall, untyped data layer, rough upgrades** |

Strapi is the **popular generalist** — the safe default for a team that wants a
GUI-modeled headless CMS with a huge ecosystem. Its weaknesses (boundary porosity,
untyped data, open-core friction, upgrade pain) are exactly the seams Tovu's
architecture is designed to avoid. And its newest move (MCP-native, RBAC-gated AI) is
strong confirmation that the AI-tool-surface direction we've already committed to
(ADR-013/014) is where the whole category is heading — Tovu just needs to be *born*
there rather than retrofit it.
