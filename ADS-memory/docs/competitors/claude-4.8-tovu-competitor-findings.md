# Tovu Competitor Findings (Claude / Opus 4.8)

Date: 2026-06-30

Independent analysis. Grounded in Codebase Memory MCP (CBM) queries and Graphify code graphs. Where I cite a symbol I inspected it via CBM `search_graph`; where I cite a percentage I computed it from the Graphify `graph.json` (method in the "What The Graphs Showed" section).

## What Tovu Is

Tovu is a WordPress-like CMS written in TypeScript:

- a single binary that boots an install directory
- a desktop app that manages multiple site installs
- SQLite first, with a Postgres adapter later
- a local install model: config, DB, uploads/media, themes, plugins
- an AI-native admin layer later (AG-UI / CopilotKit-style page control)

The intended architecture is a modular monolith with strict ports/adapters in core — core/domain depends on port interfaces, never on provider SDKs.

**Reality vs. aspiration (important).** `tovu-architecture.md` describes a large `packages/` monorepo (kernel, content, auth, media, theme, plugin, ai, protocol, api …). The *actual* code today (CBM `Users-la-Desktop-Programming-Tovu`, 5357 nodes, **0 import cycles**) is a single `src/` tree: post/presentation/workspace feature slices, `admin-shell/navigation`, an outbox (`enqueue → processOutbox → claimPending → markDelivered`), ports with in-memory adapters (`InMemoryEventBus`, `InMemoryOutbox`, `InMemoryWorkspaceRepo`), a rich-text renderer, and Next + Vue shells over a headless DTO packet. The ports/adapters discipline is real *in the small*; the big package split is not built yet. Managing that gap is the central near-term risk.

## Methodology / Evidence Sources

CBM-MCP indexed (queried for this report): `wordpress`, `directus`, `payload`, `strapi`, `ghost`, `open-saas`, plus `Tovu`.

Graphify code graphs used: `Tovu`, `ghost`, `payload`, `strapi`, `directus` (pre-existing), and **`open-saas` (newly graphified for this analysis** — 1353 nodes / 2006 edges / 135 communities, commit `071e59ac`, at `OSS-Repos/open-saas/graphify-out/`). **Medusa** was also cloned, CBM-indexed, and graphified (scoped to `packages/`, docs excluded) as an *architecture-only* reference — see its rows below.

Note on node counts: Graphify report counts (e.g. Payload 37,503, Ghost 33,301, Directus 18,965) are lower than CBM raw counts (Payload 58,050, Ghost 80,869, Directus 79,860). They count different things (Graphify dedups/filters). Both are legitimate; neither is wrong.

## Ratings

Rated as *references for building Tovu specifically* (a TS, SQLite-first, themes+plugins, install-model, AI-native CMS).

| Repo | Rating | Rationale (evidence) |
|---|---|---|
| Payload | 9/10 | Definitive SQLite-now/Postgres-later reference: `db-sqlite`, `db-postgres`, `db-vercel-postgres`, `db-d1-sqlite` are thin adapters over one shared `drizzle` package (`drizzle/src/sqlite/*`, `/postgres/*`: `buildDrizzleTable`, `setColumnID`, `requireDrizzleKit`). TS config-driven, code-first. |
| Directus | 8.5/10 | Cleanest boundaries (2.0% cross-prefix — see below); richest RBAC (`api/src/permissions/modules/*`, migration `20240806A-permissions-policies` = roles→policies + accountability); granular package taxonomy (`storage-driver-*`, `themes`, `extensions-sdk`, `ai`). |
| Ghost | 8/10 | Best productized install + theme lifecycle (`PUT /themes/:theme/activate`, `CustomThemeSettingsService.activateTheme`, `bridge.activateTheme`) and Stripe membership; but Knex/Bookshelf ORM and mixed Ember/React (`admin-x-settings` is TSX) admin. |
| Strapi | 7.5/10 | Best event-hub + plugin/provider packaging: `packages/core/core/src/services/event-hub.ts` (`subscribe`/`emit`), `core/database/src/lifecycles`, plugin `Register` lifecycle, `providers/{upload-*,email-*}`; heavier framework gravity than Tovu wants. |
| Open SaaS | 7/10 | Best **payments port** reference (newly graphified): a `paymentProcessor` abstraction with `stripe`/`lemonSqueezy`/`polar` adapters over a shared subscription-status layer; pluggable auth methods; per-feature env schemas; no import cycles. Not a CMS, Wasp-coupled. |
| WordPress | 6/10 | Unbeatable install/ecosystem *mental model* and hook philosophy; learn the model, not the PHP internals — it is the thing Tovu is reacting against. |
| Medusa | 8.5/10 † | Best *modular-monolith* teacher in the set: isolated modules + module **links** (cross-module without imports, enforced by a custom lint rule), a durable **workflow/saga engine** with per-step compensation, and cross-module Remote Query. † architecture reference only — it's commerce, not a CMS (as a CMS product reference ~5/10); MikroORM/Postgres-first, so not the SQLite reference. |

(Open SaaS is rated higher here than in `codex-tovu-competitor-findings.md` because graphing it surfaced a genuinely clean multi-provider payments abstraction, which is exactly a Tovu gap area.)

## Best References By Area

| Area | Best Repo | Why (evidence) |
|---|---|---|
| Product/install model | Ghost + WordPress | Ghost = real single-install product; WordPress = "site is a folder" mental model |
| Monorepo/package layout | Directus | Granular `packages/*` + `api`/`app`/`sdk` split; lowest coupling |
| Database model + migrations | Payload | `drizzle` shared base + generated migrations per dialect |
| SQLite now / Postgres later | Payload | `db-sqlite` + `db-postgres` as thin adapters over one `drizzle` core — copy this shape directly |
| Auth + roles/permissions | Directus | Roles→policies + accountability + field-level access (`api/src/permissions/modules/*`) |
| Event bus / decoupling | Strapi (reference); Tovu's own outbox (keep) | Strapi `event-hub` + DB `lifecycles`; Tovu already has a clean `EventBusPort`/outbox |
| Themes | Ghost | Activation lifecycle + settings cache; renderer-agnostic-ize it for Tovu |
| Plugins/extensions | Strapi + Directus | Strapi provider/plugin packaging; Directus `extensions-sdk`; WordPress for the hook model |
| Payments | Open SaaS | `paymentProcessor` port with stripe/lemonSqueezy/polar adapters (multi-provider, normalized) |
| Admin frontend/backend split | Directus | Headless API + separate app + typed SDK — closest to Tovu's headless packet + Next/Vue shells |
| AI-native readiness | Directus (`ai` pkg) + Open SaaS (`demo-ai-app`) | Reference surfaces only; Tovu's `protocol`/`ai` design is ahead conceptually |

## What The Graphs Showed

I recomputed **cross-prefix edge ratio** uniformly across all graphs (codex's exact method isn't recorded, so a single consistent method makes the comparison apples-to-apples; absolute numbers therefore differ from codex's, but the *ranking direction* agrees).

Method: for each non-`contains` edge, take the module prefix of the source and target files (`packages/<name>`, `apps/<name>`, `plugins/<name>`, `providers/<name>`, `extensions/<name>`, else top-level dir); count edges whose endpoints differ.

| Repo | Non-container edges | Cross-prefix | Ratio |
|---|---|---|---|
| Tovu | 716 | 8 | 1.1% |
| Directus | 24,379 | 491 | **2.0%** |
| Open SaaS | 930 | 37 | 4.0% |
| Ghost | 25,626 | 1,347 | 5.3% |
| Strapi | 21,773 | 1,805 | 8.3% |
| Medusa (`packages/`) | 38,972 | 4,031 | 10.3% |
| Payload | 35,736 | 8,283 | **23.2%** |

**What "cross-prefix edges" means:** a cross-prefix edge is a non-structural graph edge (a call/import/reference, not a folder-`contains`-file edge) whose two endpoints live under different top-level or package prefixes — e.g. `packages/ui/src → packages/payload/src`. It is not a correctness measure. It is a **boundary-quality smell**: lower usually means cleaner package boundaries; some cross-prefix edges are legitimate (shared API); a high ratio suggests the package structure is porous and modules reach across each other freely.

**Reading:** Directus has the cleanest boundaries (2.0%) — good template for a package taxonomy. Payload is highly cross-coupled (23.2%) — copy its *DB-adapter pattern*, not its package boundary discipline. Open SaaS (4.0%) and Ghost (5.3%) are clean and small/moderate. Tovu (1.1%) is clean simply because it is still small — this number will rise as packages are split; hold the line then.

## Repo-Specific Lessons

### Payload — copy the DB adapter strategy
Copy: one shared `drizzle` core + thin per-dialect adapters (`db-sqlite`, `db-postgres`, and even edge variants `db-d1-sqlite`, `db-vercel-postgres`); code-first schema → generated migrations; generated types. Avoid: its cross-package coupling (23.2%) — do not let adapters/UI reach into core internals.

### Directus — copy boundaries, RBAC, admin split
Copy: `api`/`app`/`sdk` separation; roles→policies + accountability permissions (`api/src/permissions/modules/*`, migration `20240806A-permissions-policies`); `storage-driver-*` as the storage-port pattern; typed SDK for the admin shell. Avoid: data-first "reflect any table" philosophy — Tovu needs real domain models (Post, Page, User), and its full surface area is too much too early.

### Ghost — copy product + theme lifecycle + membership
Copy: single-install product feel; theme activate/settings lifecycle (`CustomThemeSettingsService.activateTheme`, `PUT /themes/:theme/activate`); Stripe membership/subscription thinking. Avoid: Knex/Bookshelf ORM coupling; fragmenting the admin across many apps if Tovu can keep one shell.

### Strapi — copy event hub + provider/plugin packaging
Copy: `event-hub` (`subscribe`/`emit`) and DB `lifecycles`; `providers/{upload-*,email-*}` as the swappable-provider pattern; plugin `Register` lifecycle + `registerPluginRoutes`. Avoid: porous core↔plugin boundaries and framework gravity that makes the platform hard to keep simple.

### Open SaaS — copy the payments port (newly graphified)
Copy: `paymentProcessor` interface with `stripe`/`lemonSqueezy`/`polar` adapters, each `create*CheckoutSession()` / `ensure*Customer()` / `*Webhook()`, normalized through a shared layer (`SubscriptionStatus`, `PaymentPlanId`, `updateUserSubscription()`, `getOpenSaasSubscriptionStatus()`); per-feature env schemas (`authEnvSchema`, `lemonSqueezyEnvSchema`, …); pluggable auth methods. Avoid: treating it as a CMS reference or overfitting Tovu to a generic SaaS app; the Wasp DSL coupling.

### WordPress — copy the mental model only
Copy: "site is a folder"; themes/plugins as first-class; simple operator workflow. Avoid: hook soup as the core integration model; global state; PHP-era implicit coupling.

### Medusa — copy module isolation + the workflow engine (architecture only)
Copy: modules as isolated packages with a service factory (`MedusaService`) + own tables; **module links** for cross-module relationships instead of imports; encoding that boundary as a lint rule (`eslint-plugin/.../link-no-cross-module-relationship` — same spirit as dependency-cruiser in `todos.md` §24); the **workflow/saga engine** (`core/workflows-sdk/.../create-step.ts` + `core/orchestration/transaction/*`: `beginCompensation`, `getCompensationSteps`, `retryStep`) — directly applicable to UF-01 update-safety and any multi-step admin/AI mutation that must roll back cleanly; cross-module Remote Query. Notably clean for its size (10.3% cross-prefix at ~59k nodes). Avoid: it's commerce-shaped, not a CMS (no themes/media/publishing to copy); heavy framework surface; MikroORM/Postgres-first — keep **Payload** as the SQLite/Postgres adapter reference. Borrow patterns, not the stack.

## Recommended Tovu Architecture

### Package layout (modular monorepo)
`core/` (domain rules + ports), `server/` (HTTP/bootstrap composition root), `desktop/` (multi-site manager), `admin/` (web admin shell), `db-sqlite/` (first adapter) and `db-postgres/` (later) over a shared `db/` drizzle base, `themes/`, `plugins/`, `payments/`, `auth/`, `events/`. Watch the cross-prefix ratio as you split — aim to stay Directus-like (~2%), not Payload-like (~23%).

### Database model
SQLite tables that map cleanly to Postgres: `sites`, `users`, `roles`, `policies`, `capabilities`, `site_members`, `posts`, `pages`, `media`, `themes`, `plugins`, `plugin_installs`, `settings`, `events`, `outbox`, `payments`, `subscriptions`. Keep portable: SQLite normalized tables + JSON text; Postgres later `jsonb` + stronger indexes + optional pgvector. Use Payload's shared-drizzle-core + per-dialect adapter shape.

### Auth
Site-scoped auth, desktop-level ownership only where needed. Each site has its own users/roles/policies (Directus roles→policies model). Auth is a port, not a vendor SDK. Sessions/tokens are site-aware.

### Events / module decoupling
Keep the in-process `EventBusPort` + outbox already in the codebase (`enqueue → processOutbox → claimPending → markDelivered`). Core emits domain events; adapters persist to `events`/`outbox`; side effects run async. Modules talk through contracts, not imports. Do not jump to microservices.

### Themes
Themes as a swappable rendering contract: manifest, template/asset conventions, preview/install/activate/deactivate lifecycle (Ghost's lifecycle, but renderer-agnostic so React/Vue/Astro can back it).

### Plugins
Capability-scoped modules: manifest with declared capabilities, enable/disable lifecycle, isolated API surface, contract tests per entry point (Strapi/Directus packaging; WordPress hook model for ergonomics).

### Payments
A `payments` module behind a `PaymentProcessorPort` with stripe/lemonSqueezy/polar adapters (Open SaaS shape). Model purchases, subscriptions, entitlements, webhooks explicitly. Never let provider SDKs leak into core.

### Admin frontend/backend split
One composition root + one admin shell over stable contracts (Tovu already does this with the headless packet + Next/Vue). Backend owns domain/schema/lifecycle; frontend is a shell. AI controls sit *on top of* admin actions via an `AIAssistantPort`, not inside domain code.

## Blind Spots / Risks

- The `packages/` architecture is aspirational; today's code is a single `src/` tree. Sequence the split deliberately and keep cross-prefix low as you go.
- WordPress-like ecosystems drift into hook-style hidden coupling — resist it; prefer explicit event/plugin contracts.
- Desktop manager + many installs multiplies storage, upgrade, and migration complexity (this is why `UF-01` update-safety matters).
- Payments and auth easily leak provider deps into core if ports aren't strict — enforce with contract tests.
- AI-native controls must layer on stable admin operations, not be baked into the data model.

## Top 10 Source Investigations Next

1. Payload `packages/db-sqlite/src/index.ts` + `packages/drizzle/src/sqlite/*` vs `postgres/*` — extract the exact adapter seam.
2. Open SaaS `template/app/src/payment/{stripe,lemonSqueezy,polar}/*` — extract the `paymentProcessor` port + webhook normalization.
3. Directus `api/src/permissions/modules/*` + migration `20240806A-permissions-policies` — roles→policies model.
4. Strapi `packages/core/core/src/services/event-hub.ts` + `core/database/src/lifecycles` — event/lifecycle design.
5. Strapi `packages/providers/*` and plugin `Register`/`registerPluginRoutes` — provider/plugin packaging.
6. Ghost `CustomThemeSettingsService` + `bridge.activateTheme` + `PUT /themes/:theme/activate` — theme lifecycle.
7. Ghost members/Stripe services (`server/services/stripe/*`, `members/*`) — subscription model.
8. Directus `api`/`app`/`sdk` contract boundaries + `storage-driver-*` — storage-port + admin split.
9. Tovu `src/features/*` + `src/core/*` boundaries vs the desired port model — plan the package split.
10. Decide outbox-first vs in-process-bus-plus-durable-queue for Tovu's event layer (current outbox is a good base).

## Summary

Ranking as references for Tovu:

1. **Payload** — DB adapter strategy (SQLite→Postgres) and code-first TS CMS.
2. **Directus** — boundaries, RBAC, admin/API/SDK split.
3. **Ghost** — product/install shape, theme lifecycle, membership.
4. **Strapi** — event hub + plugin/provider packaging.
5. **Open SaaS** — the payments port (multi-provider), now graphified.
6. **WordPress** — ecosystem/install mental model only.

Borrow the *pattern* from each best-in-class area rather than any single repo wholesale; Tovu's own ports + outbox core is already the right spine.
