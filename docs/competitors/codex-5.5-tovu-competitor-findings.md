# Tovu Competitor Findings

Date: 2026-06-30

## What Tovu Is

Tovu is a WordPress-like CMS platform written in TypeScript:

- a single binary that boots an install directory
- a desktop app that manages multiple site installs
- SQLite first, with a Postgres adapter later
- a local install model with config, DB, uploads/media, themes, plugins
- an AI-native admin layer later, including AG-UI / CopilotKit-style page control

The right architecture is a modular monolith with strict ports/adapters in core, not a provider-coupled app.

## Repositories Indexed

CBM-MCP indexed:

- `wordpress`
- `directus`
- `payload`
- `strapi`
- `ghost`
- `open-saas`

Graphify was run for:

- `ghost`
- `payload`
- `strapi`
- `directus`

`open-saas` was indexed in CBM-MCP, but I did not graphify it. It is useful as a light SaaS template reference, not a primary CMS reference.

## Best References By Area

| Area | Best Repo | Why |
|---|---|---|
| Product/install model | Ghost | Closest to a real publishable product with a strong single-install mental model |
| Monorepo/package layout | Directus | Clean API/app/sdk/package split and good boundary discipline |
| Database model and migrations | Payload | Strong adapter-oriented CMS model and database abstraction path |
| SQLite now / Postgres later | Payload | The adapter pattern is already the right shape for this |
| Auth and roles/permissions | Directus | Best fit for a data/admin-driven permissions model |
| Event bus / decoupling | Directus or Ghost | Directus for clean app/service separation, Ghost for product-level module split |
| Themes | WordPress and Ghost | WordPress for ecosystem shape, Ghost for polished publishing theme behavior |
| Plugins/extensions | Strapi | Best packaging model for plugin/provider extension surfaces |
| Payments | Ghost | Best productized paid publishing/membership flow reference |
| Admin frontend/backend split | Directus | Strongest admin/API separation and app/server boundary discipline |
| AI-native readiness | Directus and Payload | Directus has explicit AI/MCP surface area; Payload has a strong config/adapters base |

## Ratings

| Repo | Rating | Notes |
|---|---|---|
| Ghost | 9/10 | Best product shape for a WordPress-like install and publisher experience, even if the internals are not the cleanest |
| Payload | 8.5/10 | Best TypeScript CMS reference for adapters, generated types, and a modular CMS surface |
| Directus | 8.5/10 | Best architecture discipline for admin/API separation and permissions-heavy systems |
| Strapi | 8/10 | Best plugin/provider packaging reference, but heavier coupling than ideal for Tovu |
| WordPress | 7/10 | Best ecosystem/install mental model, weakest architecture for a new TypeScript codebase |
| Open SaaS | 5.5/10 | Useful as a small SaaS scaffold, but not a core CMS architecture reference |

## What The Graphs Changed

Graphify added an important structural signal:

- Directus had the cleanest cross-prefix coupling, about 2.1% of non-container edges.
- Ghost and Strapi were both around 14.5% / 14.3%.
- Payload was much more cross-coupled, around 29.7%.

Cross-prefix edges are non-container graph edges where source and target files live under different top-level or package prefixes. Example: `packages/ui/src -> packages/payload/src`.

That is not a correctness proof. It is a coupling smell and a boundary-quality signal:

- lower usually means cleaner package/app boundaries
- some cross-prefix edges are legitimate shared API calls
- a lot of them is often a sign that the package structure is porous

## Repo-Specific Lessons

### WordPress

What to copy:

- the install mental model
- the “site is a folder” framing
- themes/plugins as first-class concepts
- simple operator workflow

What to avoid:

- hook soup as a core integration model
- global state everywhere
- PHP-era implicit coupling

### Ghost

What to copy:

- product-first publishing experience
- single install / local boot model
- clear separation of product apps around a central runtime
- membership/payments thinking

What to avoid:

- too much split between many frontend apps if Tovu can keep the admin unified
- inherited product-era complexity that is not needed for a new TypeScript platform

### Payload

What to copy:

- database adapter strategy
- generated types and config-driven CMS design
- plugin/template ergonomics
- migration and schema toolchain

What to avoid:

- letting the adapter/plugin surface blur the core boundary
- excessive coupling between UI templates and backend internals

### Directus

What to copy:

- strong API/admin split
- auth/role/permission discipline
- service boundaries
- explicit module surfaces for schema, storage, extensions, realtime, AI/MCP

What to avoid:

- too much surface area too early
- a platform that is all framework and not enough product

### Strapi

What to copy:

- plugin/provider packaging
- monorepo organization for a CMS platform
- extension entry points

What to avoid:

- porous boundaries between core and plugins
- framework gravity that makes the platform hard to keep simple

### Open SaaS

What to copy:

- lightweight SaaS scaffolding ideas
- admin page layout ideas for simple product surfaces

What to avoid:

- treating it as a CMS reference
- overfitting Tovu to a generic SaaS app rather than a local install platform

## Recommended Tovu Architecture

### Repo / package layout

Use a modular monorepo like this:

- `core/` for domain rules and ports
- `server/` for the HTTP/bootstrap composition root
- `desktop/` for the multi-site manager
- `admin/` for the web admin shell
- `db-sqlite/` first adapter
- `db-postgres/` later adapter
- `themes/` for rendering themes
- `plugins/` for extensions
- `payments/` for billing/membership
- `auth/` for identity and access
- `events/` for the event bus and outbox

### Database model

Start with SQLite tables that can map cleanly to Postgres later:

- `sites`
- `users`
- `roles`
- `capabilities`
- `site_members`
- `posts`
- `pages`
- `media`
- `themes`
- `plugins`
- `plugin_installs`
- `settings`
- `events`
- `outbox`
- `payments`
- `subscriptions`

Keep the core schema portable:

- SQLite: normalized tables, JSON text where needed
- Postgres later: `jsonb`, stronger indexes, optional vector/search extensions

### Auth

Use site-scoped auth with global desktop ownership only where needed:

- desktop user manages multiple sites
- each site has its own users, roles, and permissions
- auth should be a port, not a vendor SDK
- sessions/tokens should be site-aware

### Events / module decoupling

Prefer a domain event bus plus outbox instead of direct cross-module calls:

- core emits events
- adapters persist to `events` and `outbox`
- side effects are handled asynchronously
- disconnected modules talk through contracts, not imports

For early Tovu, an in-process event bus plus outbox is likely enough.
Do not jump to microservices for this.

### Themes

Treat themes like a swappable rendering contract:

- theme package manifest
- template and asset conventions
- preview/install/activate/deactivate lifecycle
- route-to-template explainers

### Plugins

Treat plugins as capability-scoped modules:

- manifest with declared capabilities
- enable/disable lifecycle
- isolated API surface
- contract tests for plugin entry points

### Payments

Keep payments separate from content/core:

- membership and billing are a module, not a core primitive
- model purchases, subscriptions, entitlements, and webhooks explicitly
- do not let payment provider APIs leak into core

### Admin frontend/backend split

Use one API/composition root and one admin shell:

- backend owns domain logic, schema, and lifecycle
- frontend is a shell over stable contracts
- AI controls later should sit on top of admin actions, not inside domain code

## Blind Spots / Risks

- WordPress-like ecosystems can drift into hook-style hidden coupling. Tovu should resist that.
- A desktop manager plus many site installs raises storage, upgrade, and migration complexity.
- If plugin/theme contracts are not explicit from day one, the platform will become hard to reason about.
- Payments and auth can easily leak provider dependencies into core if ports are not strict.
- AI-native controls should be layered on top of stable admin operations, not baked into the core data model.

## Next Source Investigations

1. Read Ghost membership/payments flows and install/bootstrap flow.
2. Read Directus auth/roles/permissions flow in the API package.
3. Read Payload database adapter implementations for SQLite/Postgres.
4. Read Strapi plugin and provider registration surfaces.
5. Read WordPress theme install/activation and plugin lifecycle surfaces.
6. Read how Directus separates `api`, `app`, and `sdk` contracts.
7. Read Ghost admin app/module boundaries around `admin-x-*`.
8. Read Payload template generation and config AST transforms.
9. Read Tovu’s current `src/features/*` and `src/core/*` boundaries against the desired port model.
10. Decide whether Tovu needs an outbox-first event layer or a simpler in-process bus plus durable queue.

## Summary

If Tovu is the goal, the ranking is:

1. Ghost for product/install/admin shape
2. Payload for TypeScript CMS adapters and schema tooling
3. Directus for admin/API/permission discipline
4. Strapi for plugin/provider packaging
5. WordPress for ecosystem mental model only
6. Open SaaS for lightweight SaaS scaffolding only

