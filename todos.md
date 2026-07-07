# Todos — Tovu (website product)

> **Scope.** This is the **Tovu website-product** backlog (CMS runtime: kernel,
> data layer, content model, theme/plugin systems, admin UI, SEO/AEO/GEO plugins,
> WordPress/Payload/Directus/Ghost parity). It moved here in the 2026-07-06 repo
> split. Cross-references to `src/…` mean code that currently lives in
> **`Tovu-Runner/web/src`** and should be evaluated for **porting here** (see
> `START-HERE.md`), not rebuilt. Operator-shell / media-generation / agent-detection
> / the operator chat profile are **not** here — they're tracked in **Tovu-Runner**.
> The `Completed (Architecture)` scaffold note below refers to the pre-split
> `tovu/` layout that is now Runner's `web/src`.
>
> **Start with the v1 first slice in `START-HERE.md`** before working down this list —
> most items below are gated behind that walking skeleton.

---

## ⛔ BLOCKER — Admin Section Spec Sweep (DO FIRST NEXT SESSION)

**Added 2026-07-07.** These are the admin nav sections currently rendering a generic
**placeholder** (real screen not built, no spec). Each needs its own spec before it can be
built. This is the breadth gap: v1 has only ~5 real capabilities (posts/pages, themes,
audit-undo, auth, workspaces) vs dozens in mature CMSs. **Treat this as the next-session
starting point.**

**Process for each (do NOT jump straight to a spec):**
1. **Competitor teardown** — how did each platform do it, and *who did it best*? Mine
   `other-repos-specs/` (wordpress 78 · directus 29 · medusa · shopify · woocommerce) +
   `competitor-analysis.md` (Ghost/Payload/Directus). Map each to the `tovu-v2-design.md
   §3.5` capability tier it belongs to.
2. **Deep debate** — architecture options, trade-offs, build-vs-bundled-plugin placement
   (§3.5 placement rule: tier-2 core lib vs tier-3 bundled plugin). Use `/debate` +
   `/consensus`.
3. **Audit** — pressure-test the chosen architecture with `/audit-work` (codex + gemini/agy)
   before committing.
4. **ADR** — record the decision (the parity/coverage decisions are currently NOT
   ADR-governed — see gap note below).
5. **Spec** — only then write the SPEC-NNN package.

**Sections needing this treatment (each → competitor study → debate → audit → ADR → spec):**

- [ ] **Media** — asset library, upload pipeline, image transforms, storage port (`media` lib, §3.5 tier 2)
- [ ] **Collections** — custom content types / structured collections (schema registry consumer)
- [ ] **Menus** — navigation trees as editable content (`navigation` lib, tier 2)
- [ ] **Categories & Tags** — taxonomy, hierarchies, term relations (`taxonomy` lib, tier 2)
- [ ] **Forms** — form builder + submissions (likely bundled plugin, tier 3)
- [ ] **User management** — users CRUD screen over `identity` (Directus roles→policies model)
- [ ] **Roles & Permissions** — RBAC/policy model (identity; blocks the Art. VI auth exception)
- [ ] **Members** — front-end membership/subscribers (Ghost members is the reference)
- [ ] **Comments** — moderation queue, own tables/hooks (bundled plugin — SDK stress test, §3.5 tier 3)
- [ ] **SEO** — metadata, sitemaps, `page.head` hook (dogfood plugin, v2-design Phase 4)
- [ ] **Redirects** — redirect rules over `routing`
- [ ] **Newsletter** — email campaigns over `MailerPort` (bundled plugin)
- [ ] **Analytics** — traffic/usage surface (privacy-first; who did this best?)
- [ ] **Database** — admin DB/health/migration surface over Drizzle (ADR-015)
- [ ] **Integrations / API** — API keys, webhooks, outbound integrations (`identity` app tokens + outbox)
- [ ] **Backups** — backup/restore + export (UF-13 portability; pairs with `tovu build` export)
- [ ] **Settings** — typed schema-registered settings, scoped global/workspace/user (`settings` lib, replaces WP options grab-bag)

**Coverage-gap note (surfaced 2026-07-07 audit-of-parity):** the parity map lives in
`tovu-v2-design.md §3.5` (mutable design doc) and the corpus `coverage-audit.md` files —
**it is NOT reconciled into ADRs or the specs.** Recommended first artifact next session: a
**coverage/parity ADR + matrix** mapping each competitor subsystem → {v1 / bundled-plugin /
deferred / dropped} with the owning ADR, so "are we implementing everything the others have?"
has one authoritative answer instead of being spread across four docs.

---

## Completed (WordPress Specs)
All WordPress spec work is complete. See `wordpress_specs/` for the full library (53 files).
- ✓ wp-includes (20 specs)
- ✓ wp-content (overview)
- ✓ wp-admin (12 specs including users)
- ✓ wp-root (3 condensed specs + 12 originals archived)
- ✓ Plugin & Theme Authoring Structure
- ✓ Headless CMS paradigm

## Completed (Architecture)
- ✓ `tovu-architecture.md` — combined, renamed Forge→Tovu, includes appendix of all general patterns
- ✓ `competitor-analysis.md` — Ghost, Payload, Directus breakdown
- ✓ `tovu/` scaffold initialized (TypeScript, Express, tests, modular structure)
- ✓ `tovu/` conventions captured (`PROJECT_MEMORY.md`, local `AGENTS.md`, module `INFO.md`)

Prioritization source: `tovu-architecture.md` section 13 (User Friction Coverage).

---

## Canonical Architecture Decisions (ADRs)

This checklist is the **capability backlog**, not the decision record. Where an ADR
exists, it is the source of truth and supersedes the loose wording below. Index:
`ADS-project-knowledge/reports/architecture/ADR-INDEX.md`.

Which ADR owns which inventory area:
- **§1 Kernel / §10 Server** — ADR-001 (agent-native modular monolith), ADR-009
  (decoupling: sync calls + outbox + hooks).
- **§3 Data Layer** — ADR-006 (ports need two adapters), ADR-007 (`workspaceId`
  everywhere). **Site content lives in a per-site `content.db` behind
  `SiteStorePort`** (better-sqlite3 now → Supabase later) — ADR-012 + ADR-013.
- **§5 Storage/Media** — media blobs under the site folder's `uploads/`, metadata
  rows in that site's `content.db` (ADR-012).
- **§7 Feature Modules** — the `features/*` slices are the site content model
  (post/page/media/presentation), scoped per ADR-007/012.
- **§8 Theme System** — ADR-010 (declarative themes by default; code = trusted
  mode), ADR-002 (React blessed renderer). Two planes: site theme vs app chrome —
  see `admin-sitemap.md §1`.
- **§9 Plugin System** — ADR-003 (plugins never run DDL), ADR-004 (prebuilt ESM +
  signed manifest), ADR-005 (SDK compatibility).
- **§11 Admin UI** — IA in `admin-sitemap.md`; per-screen UI brief in
  `docs/design/admin-sections-ui-brief.md`; rail pages in
  `docs/design/rail-pages-ui-brief.md`.
- **§12 Agentic UI / AI Layer** — **ADR-013**: one CopilotKit client + one AG-UI
  daemon agent; `tools.ts` registry with an execution `surface` (frontend/data);
  agent detection ported from open-design; composer rebuilt headless. Paradigm note:
  `docs/architecture/appendices/A12-tool-use-first-architecture.md`.
- **§13 Protocols** — ADR-011 (two deployment topologies; open-design desktop host),
  ADR-013 (AG-UI/MCP surface, tool exposure).

A "site" everywhere below = **a folder (install dir) with its own `content.db` +
`uploads/` + themes/plugins**, instantiated from a versioned template (ADR-012).

---

## Learn (What You Need to Understand)

### Core architecture fundamentals
- Ports/adapters and dependency inversion (how core stays swappable)
- Hybrid sync command + outbox flow (what is synchronous vs asynchronous)
- Vertical slice architecture (feature-by-feature development)
- Contract testing vs integration testing

### Platform and runtime choices
- Express vs Fastify vs Hono tradeoffs for Tovu
- Outbox implementations (in-memory now, Postgres later)
- Queue/event delivery options (retries, backoff, dead-letter strategy)

### Product + ecosystem
- Directus internals (especially AI layer)
- WordPress pain clusters and how each maps to Tovu capabilities
- Spec-first workflow (Spec Kit commands and artifacts)

---

## Accomplish (What We Need to Build)

### Foundation (active)
- [ ] Split `src/core/ports.ts` into domain-focused port files (including `core/events/ports.ts`)
- [ ] Add server route tests in `src/server/__tests__/` (status code + payload assertions)
- [ ] Add first persistent adapter set (DB-backed repo + DB-backed outbox)
- [ ] Add structured logging + request IDs

### First real capabilities
- [ ] Workspace management beyond create (read/list/update/delete)
- [ ] Basic auth boundary (identity extraction + role checks)
- [ ] Plugin/module registration skeleton
- [ ] Feature flag support (for safe rollout)

### Reliability and safety
- [ ] Outbox retry policy with exponential backoff
- [ ] Idempotency strategy for event handlers
- [ ] Error taxonomy + standardized API error responses
- [ ] Safe-mode/rollback concept draft (from architecture section 13)

---

## Backlog: Directus Research (Still Needed)

Directus is still valuable for reference and can run in parallel with implementation.

- [ ] General Directus architecture map
- [ ] Directus AI layer deep spec (priority)
- [ ] Directus admin UI extension model spec

## Backlog: Admin IA Research (Needed Before Admin Build)

Placeholder admin structure exists at `tovu/apps/admin/sections/` (one INFO.md per section, WordPress-derived). It is a DRAFT until this research lands.

- [ ] Capture the admin information architecture of Directus, Ghost, Payload, Strapi, and WordPress (specs already in `other-repos-specs/wordpress_specs/wp-admin/`): sidebar taxonomy, screen inventory per section, navigation depth, and where each puts settings vs content vs system surfaces. CBM indexes exist for all five repos.
- [ ] Capture each CMS's admin *extension* pattern (how plugins contribute panels/menu items/dashboard widgets): WP menu/meta-box registration, Directus extensions-sdk app surfaces, Payload admin components, Strapi admin plugin API, Ghost admin-x apps.
- [ ] Synthesize into a Tovu admin IA spec: confirm/adjust the `apps/admin/sections/` placeholder set, define the surface-descriptor types each section needs (feeds Master Build Inventory §11 Admin UI), and mark which sections are core vs registry-contributed vs plugin-shipped.

## Backlog: Shopify Research (Still Needed)

Shopify capture work has a detailed checklist in `other-repos-specs/shopify_specs/TODO.md`.

- [ ] Review and execute the Shopify research TODO before restarting Shopify decomposition or agent-build-packet work.

## Backlog: Medusa Research (Still Needed)

Medusa follow-on decomposition notes live in `other-repos-specs/medusa_specs/TODO.md`.

- [ ] Review the Medusa research TODO before adding deeper Medusa internals, route DTO inventories, admin SDK notes, telemetry notes, or hosted-cloud caveats.

## Backlog: Commerce Platform Crosswalk (Still Needed)

Shopify + Medusa synthesis notes live in `other-repos/TODO.md`.

- [ ] Review the Shopify + Medusa follow-on TODO before turning commerce research into a Tovu capability map or V1 commerce platform architecture.

---

## Master Build Inventory (Everything)

### 1) Core Runtime / Kernel
- [ ] Define final kernel responsibilities (lifecycle, DI, service registry)
- [ ] Split core ports into module-level files (`events`, `auth`, `storage`, `search`, etc.)
- [ ] Add core error model (typed errors + error codes)
- [ ] Add config system with typed schema + env validation
- [ ] Add feature flag system (runtime + env + workspace scope)
- [ ] Add capability/permission policy engine primitives
- [ ] Add module loader contract (for plugins/themes/providers)
- [ ] Add architecture boundary enforcement (lint/import rules)
- [ ] Add core observability hooks (metrics/log/tracing abstractions)

### 2) Eventing / Hybrid Sync + Async
- [ ] Finalize domain event envelope schema + versioning
- [ ] Define event naming conventions and ownership
- [ ] Implement persistent outbox adapter (DB-backed)
- [ ] Implement outbox poller/worker with retries and backoff
- [ ] Add idempotency support for handlers
- [ ] Add dead-letter strategy for repeatedly failing events
- [ ] Add event replay strategy for recovery/backfill
- [ ] Add event contract tests

### 3) Data Layer / DB / ORM
- [ ] Choose primary DB strategy for early stage (Postgres first)
- [ ] Choose ORM/query layer (Drizzle/Kysely/Prisma decision)
- [ ] Define migration strategy and tooling
- [ ] Define schema naming conventions and table ownership
- [ ] Implement workspace/tenant isolation strategy at DB level
- [ ] Add transactional unit-of-work patterns for commands
- [ ] Add repository adapter conventions
- [ ] Add seed/fixtures strategy for local and tests
- [ ] Add backup/restore and rollback strategy

### 4) Auth / Identity / Permissions
- [ ] Define identity model (user, service account, workspace membership)
- [ ] Define RBAC model (roles, permissions, scopes)
- [ ] Define policy evaluation model (resource/action/context)
- [ ] Add auth middleware contract for server layer
- [ ] Add session/token strategy
- [ ] Add audit trail for security-sensitive actions
- [ ] Add permission test matrix

### 5) Storage / Media
- [ ] Define media object model and metadata schema
- [ ] Define upload pipeline contract (validation, transforms, derivatives)
- [ ] Add signed URL strategy and expiry model
- [ ] Add media lifecycle policies (retention, deletion, restore)
- [ ] Add media quality checks (format, size, accessibility metadata)
- [ ] Add content-media relationship model

### 6) Search / Indexing
- [ ] Define search document schema and indexing boundaries
- [ ] Define indexing triggers from domain events
- [ ] Implement index upsert/remove handlers
- [ ] Define hybrid search strategy (keyword + semantic optional)
- [ ] Add search relevance tuning strategy
- [ ] Add search contract tests and latency budgets

### 7) Feature Modules (Initial Core Features)
- [ ] Workspace module full CRUD + lifecycle events
- [ ] User + membership module
- [ ] Content model module (types, fields, validation)
- [ ] Content entry module (CRUD, status transitions)
- [ ] Revision/version module
- [ ] Publishing workflow module
- [ ] Taxonomy/relations module
- [ ] Settings module (workspace/system)

### 8) Theme System
- [ ] Define theme manifest schema
- [ ] Define template hierarchy and route mapping
- [ ] Define slots/regions injection model
- [ ] Define theme settings schema and validation
- [ ] Add theme versioning and compatibility checks
- [ ] Add theme lifecycle hooks (install/enable/disable/update)
- [ ] Add theme safety checks and rollback strategy

### 9) Plugin System
- [ ] Define plugin manifest schema and capability declaration
- [ ] Define plugin lifecycle API (install/load/init/stop/uninstall)
- [ ] Define plugin dependency graph and conflict rules
- [ ] Define plugin sandbox/permission enforcement
- [ ] Define plugin UI extension points
- [ ] Define plugin server extension points (routes/hooks/events)
- [ ] Add plugin compatibility/versioning policy
- [ ] Add plugin observability and fault isolation

### 10) HTTP/API Server
- [ ] Keep current Express baseline stable
- [ ] Define transport-agnostic route/handler shape
- [ ] Decide Fastify vs Hono migration path
- [ ] Add request validation and response schema enforcement
- [ ] Add error mapping strategy (domain -> HTTP)
- [ ] Add rate limiting and security headers
- [ ] Add API versioning strategy
- [ ] Add OpenAPI generation strategy

### 11) Admin UI (Headless Admin Client)
- [ ] Define admin API contract and client SDK boundaries
- [ ] Choose baseline stack (Next.js + React + Zustand)
- [ ] Build shell layout (navigation, module registry, auth guard)
- [ ] Build workspace management screens
- [ ] Build content type builder UI
- [ ] Build content editor UI (forms, validation, revisions)
- [ ] Build media manager UI
- [ ] Build settings and permissions UI
- [ ] Build extension point rendering in admin
- [ ] Build admin notification center

### 12) Agentic UI / AI Layer
- [ ] Define AI interaction model (assistant panel + task execution)
- [ ] Define tool registry contracts and tool safety policy
- [ ] Define structured outputs and tool-call protocol
- [ ] Define context assembly pipeline (system/site/task/history)
- [ ] Define memory policy (session, episodic, semantic boundaries)
- [ ] Define guardrails and human-in-the-loop checkpoints
- [ ] Define AI audit trail and explainability logging
- [ ] Define AG-UI event/state model for streaming interactions

### 13) Protocols and Integrations
- [ ] Define MCP exposure model for tools/data
- [ ] Define A2A support boundaries
- [ ] Define webhook/event subscription model for external systems
- [ ] Define import/export contracts for interoperability
- [ ] Define AI WordPress database ingestion agent: connect read-only to a WordPress MySQL/MariaDB database, extract posts/pages/custom post types, body content, metadata, taxonomies, authors, revisions, attachments, and image assets, map them into Tovu content/media schemas, and run dry-run validation, permalink/redirect mapping, resumable import jobs, audit logs, and rollback/compensation planning before writes.
- [ ] Define provider adapter lifecycle contracts

### 14) Testing Strategy
- [ ] Define test pyramid expectations per module
- [ ] Add `__tests__` baseline in all modules
- [ ] Add `__specs__` baseline in all modules
- [ ] Add contract tests for every core port
- [ ] Add integration tests for command + outbox flow
- [ ] Add API route tests
- [ ] Add regression suite for high-risk flows
- [ ] Add performance smoke tests

### 15) DevEx / Tooling / CI
- [ ] Standardize project scripts (dev/build/typecheck/test/lint)
- [ ] Add lint + formatter + architecture lint
- [ ] Add commit/PR conventions
- [ ] Add CI pipeline with required gates
- [ ] Add local dev bootstrap docs
- [ ] Add environment matrix docs (dev/staging/prod)
- [ ] Add codegen strategy for typed clients if needed

### 16) Reliability / Ops / Security
- [ ] Add structured logging + correlation IDs
- [ ] Add metrics and tracing
- [ ] Define SLOs and operational dashboards
- [ ] Define incident response runbooks
- [ ] Define backup/restore runbooks
- [ ] Add secrets management policy
- [ ] Add dependency and supply-chain scanning
- [ ] Add vulnerability response policy

### 17) Product Safety (From WordPress Pain Clusters)
- [ ] Update preflight checks and safe rollout design
- [ ] Incident analysis and guided remediation design
- [ ] Conflict isolation and quarantine strategy
- [ ] Performance attribution and budgets
- [ ] Authoring safety and template recovery
- [ ] Migration/portability strategy
- [ ] Governance/trust and provenance strategy

### 18) Documentation / Knowledge Retention
- [ ] Keep `PROJECT_MEMORY.md` updated each session
- [ ] Keep module `INFO.md` accurate as files evolve
- [ ] Keep module `__specs__` synced with implementation
- [ ] Maintain ADR log for major architecture decisions
- [ ] Maintain glossary of domain terms
- [ ] Maintain roadmap by milestone (M0, M1, M2...)

### 19) WordPress Parity Gap Checklist (Detailed)

#### Content + publishing
- [ ] Post/page/custom-type parity (authoring + APIs + permissions)
- [ ] Draft/review/published/future/private status model parity
- [ ] Scheduled publishing with timezone correctness
- [ ] Revisions + restore + compare views
- [ ] Autosave and crash recovery
- [ ] Slug/permalink management and uniqueness handling
- [ ] Trash/restore/delete lifecycle
- [ ] Sticky/featured content behavior

#### Taxonomy + navigation
- [ ] Categories/tags/custom taxonomies
- [ ] Term archives and filtering behavior
- [ ] Menu builder (hierarchical) + assignment to theme locations
- [ ] Breadcrumb/navigation helper model

#### Editor + design system
- [ ] Block editor equivalent (or strict alternative) with schema safety
- [ ] Reusable blocks/patterns/templates
- [ ] Full-site editing equivalents (template parts, global styles)
- [ ] Media embed blocks and short content primitives (quote/code/table/etc.)
- [ ] WYSIWYG parity between editor and rendered output

#### Theme system parity
- [ ] Template hierarchy and fallback rules
- [ ] Theme manifest and settings UI
- [ ] Child-theme equivalent strategy
- [ ] Theme update compatibility checks and rollback
- [ ] Theme preview and activation flow

#### Plugin ecosystem parity
- [ ] Plugin install/activate/deactivate/update/uninstall flows
- [ ] Plugin dependency + compatibility checks
- [ ] Hook/filter-like extension model
- [ ] Plugin settings registration and UI mounting
- [ ] Plugin conflict detection and safe disable/quarantine

#### Admin + operations
- [ ] Users/roles/capabilities management UI
- [ ] Comments/moderation system (if in scope)
- [ ] Settings pages parity (general/reading/writing/permalinks-like)
- [ ] Update center and update history
- [ ] Built-in site health diagnostics
- [ ] Import/export tooling and migration helpers

#### SEO + discovery
- [ ] XML sitemap generation + controls
- [ ] Canonical/meta/schema controls
- [ ] Robots and indexing controls
- [ ] Redirect rules + canonicalization strategy

#### Media + files
- [ ] Media library parity (search/filter/metadata)
- [ ] Image derivatives and responsive sizes
- [ ] File replacement/versioning behavior
- [ ] Bulk media operations

#### Infrastructure + reliability
- [ ] Cron/scheduler equivalent
- [ ] Caching strategy (page/data/object) with invalidation
- [ ] Backup/restore UX
- [ ] Safe update/rollback flows
- [ ] Multisite/tenant strategy (if parity target includes multisite)

### 20) Payload/Directus/Ghost Parity and Strategic Additions

#### Payload-like capabilities
- [ ] Field-level schema builder parity (rich field types + validation)
- [ ] Relationship and nested/document modeling parity
- [ ] Access control at collection/field/doc level
- [ ] Hooks lifecycle parity (`beforeChange`, `afterRead`, etc. equivalent)
- [ ] Local API equivalent (server-side direct invocation)
- [ ] Draft/publish + versioning parity
- [ ] Uploads with focal points/transforms and ACL

#### Directus-like capabilities
- [ ] Database-first introspection mode (optional strategy)
- [ ] Data Studio-like admin configurability
- [ ] Flows/automation builder equivalent
- [ ] Realtime subscriptions and event streams
- [ ] Granular permissions matrix (role/policy/filter-based)
- [ ] Extension types parity (interface/display/layout/module/hook/endpoint/op/panel analogs)
- [ ] Marketplace/distribution model for extensions (if in scope)

#### Ghost-like capabilities
- [ ] Writer-first editing experience quality target
- [ ] Membership/subscription primitives
- [ ] Newsletter/email publishing primitives
- [ ] Publication settings and audience segmentation
- [ ] SEO + canonical + social cards defaults
- [ ] Performance-first defaults for publishing surfaces

#### Strategic additions (beyond parity)
- [ ] AI-native operations assistant (safe tool-calling)
- [ ] Guided incident remediation
- [ ] Preflight update risk checks + canary + rollback
- [ ] Policy-based governance and provenance controls
- [ ] Contract-first plugin security model

### 21) Big Missing Items to Explicitly Track
- [ ] Billing/licensing domain model (if SaaS)
- [ ] Tenant provisioning lifecycle (create/suspend/delete/archive)
- [ ] Rate limits and abuse prevention
- [ ] Legal/compliance requirements (audit, retention, privacy workflows)
- [ ] Data portability + exit tooling guarantees
- [ ] Disaster recovery objectives (RPO/RTO targets)
- [ ] Internationalization/localization strategy
- [ ] Accessibility baseline and regression checks
- [ ] Analytics/event taxonomy and data governance
- [ ] Support/admin tooling for operations team

### 22) AEO / GEO / AI Surfaces (First-Class)

#### AEO (Answer Engine Optimization)
- [ ] Define AEO content model (Q&A entities, canonical answer blocks, evidence links)
- [ ] Add structured data generation for answer engines (schema consistency + validation)
- [ ] Build answer freshness workflow (staleness checks + auto-review queue)
- [ ] Add answer quality scoring (accuracy, completeness, citation confidence)
- [ ] Add AEO analytics surface (answer impressions, citation wins, decay signals)

#### GEO (Generative Engine Optimization)
- [ ] Define GEO entity graph model (brand, product, docs, features, relationships)
- [ ] Add machine-readable knowledge packaging (LLM-ready endpoint/doc bundles)
- [ ] Create an AI-readable site guide/template pack for Next.js, Vite, and other frontend users covering semantic HTML, structured data, canonical metadata, sitemaps, content hierarchy, and LLM-readable source pages
  Starter links to review later (not exhaustive):
  - Search Engine Land: `https://searchengineland.com/google-publishes-guide-on-optimizing-for-generative-ai-features-477671`
  - Google Search Central: `https://developers.google.com/search/docs/fundamentals/ai-optimization-guide`
- [ ] Add citation-safe source-of-truth pages and canonical mapping
- [ ] Add GEO monitoring (model mention tracking, citation drift, hallucination risk)
- [ ] Add remediation workflows for weak/missing entity representation

#### AIO/GEO Sitemap Plugin
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo` (Dead Internet / Search Heist / Zero-Click analysis)

##### Visibility (GEO-era sitemap as knowledge declaration)
- [ ] Define "knowledge sitemap" schema — entity graph, canonical answer anchors, authority claims, not just URLs
- [ ] Add structured content relationship mapping (topics → pages → evidence → citations)
- [ ] Generate machine-optimized sitemap variants for AI crawlers (beyond XML — structured data, entity bundles)
- [ ] Add per-page "citability" metadata (canonical answers, freshness date, authorship, source chain)
- [ ] Integrate with existing GEO entity graph model (section above)

##### Defense (Anti-Heist / Anti-Clone)
- [ ] Add sitemap topology monitoring — detect when a competing domain mirrors your URL structure
- [ ] Add selective sitemap exposure — full graph for trusted crawlers, minimal for unknowns
- [ ] Add content fingerprinting and first-publication timestamping (prove original authorship)
- [ ] Add domain lapse / zombie page alerting — warn before dormant pages expire and become cloneable
- [ ] Add lookalike domain detection (variations on site name appearing with mirrored content)
- [ ] Add crawler pattern analysis — detect mass-export behavior vs normal crawling

##### Intelligence (Citation & Displacement Tracking)
- [ ] Track which pages are being cited in AI overviews / answer engines
- [ ] Track content staleness signals (pages going stale = ripe for displacement by competitors)
- [ ] Track competitor topology mirrors and content overlap drift
- [ ] Add alerting for citation loss / decay (you were cited, now you're not)
- [ ] Add dashboard: citation wins, displacement risks, heist attempts, freshness scores

#### Content Provenance & Defense (Platform-Level)
Source video: `https://www.youtube.com/watch?v=4WyduoGpIPo`

- [ ] [Optional-Weak] Content provenance as a first-class CMS feature — content signing, timestamping, editorial process declaration at platform level (proves human authorship + original pub date in a model-collapse world)
- [ ] Add intelligent crawler policy management beyond robots.txt — per-crawler rules, welcome citation bots, throttle scrapers, detect mass-export patterns
- [ ] Add "human-first" signal packaging — editorial process metadata, authorship chains, source citations, signals that quality-focused engines will reward
- [ ] Add content originality scoring — flag when published content looks AI-generated or duplicative before it damages site authority

#### AEO Plugin (Tovu-Native — replaces Yoast/RankMath)
Source research: AI engine crawler/indexing patterns (Google AI Overviews, ChatGPT Search, Claude, Perplexity, Bing Copilot)

##### Per-page auto-generated outputs
- [ ] Auto-generate JSON-LD structured data from typed content model (Article, HowTo, Product — context-dependent)
- [ ] Auto-generate "direct-answer block" (2-3 sentence extractable answer) placed at top of page
- [ ] Auto-generate clean `.md` mirror of each page at `<url>.md` for LLM-friendly consumption
- [ ] `data-nosnippet` zone management — let editors mark sections excluded from AI extraction
- [ ] Meta description generation optimized for extraction (complete sentences, factual, 150-160 chars)

##### Site-level outputs
- [ ] Auto-generate `/llms.txt` from site structure and key pages (low-cost future bet)
- [ ] IndexNow integration — ping Bing instantly on publish/update (only proven instant-discovery signal)
- [ ] Sitemap.xml with accurate `<lastmod>` dates (freshness signal across all engines)
- [ ] robots.txt builder — per-bot allow/block config (OAI-SearchBot, GPTBot, PerplexityBot, Googlebot, bingbot, ChatGPT-User)

##### Engine-specific optimizations
- [ ] Google AI Overviews: "nugget in the mine" content structure (long-form with extractable direct answers per section)
- [ ] ChatGPT Search: ensure pages indexed in Bing (OAI-SearchBot uses Bing's index); separate GPTBot (training) vs OAI-SearchBot (search) controls
- [ ] Perplexity: freshness-first strategy — auto-flag stale content, surface recency signals, original research/data emphasis
- [ ] Bing Copilot: IndexNow for real-time discovery + `data-nosnippet` for fine-grained control
- [ ] Claude: clean semantic HTML that converts well to text/markdown, minimal JS-dependent content

##### Content quality signals (agent-assisted)
- [ ] Claim + evidence pair detection — AI suggests adding citations/data to unsupported claims
- [ ] Heading hierarchy validation — flag broken H1>H2>H3 structure
- [ ] "Citability score" per page — how extractable/quotable is this content for AI engines?
- [ ] Freshness monitoring — alert when pages go stale and become displacement targets

##### Forms plugin (TanStack Form-based)
- [ ] Define form schema model compatible with TanStack Form's typed API (agent-manipulable field definitions, validation rules, nested structures)
- [ ] Form builder capability contracts (agent can create/modify/validate forms via typed commands)
- [ ] Submission routing, conditional logic, payment integration
- [ ] Notification/webhook triggers on submission

##### Multilingual plugin
- [ ] Locale model + fallback chains (per-content-type locale config)
- [ ] Agent-driven translation workflow (auto-translate on publish, human review queue)
- [ ] URL slug per locale, hreflang generation, locale switcher component
- [ ] Translation memory / glossary for consistency across content
- [ ] Parity tracking — surface which locales are out of sync

##### Membership/Paywall plugin
- [ ] Subscription tier model (plans, entitlements, content access rules)
- [ ] Content restriction rules (per-page, per-section, per-content-type)
- [ ] Drip/scheduled content release
- [ ] Payment gateway integration (Stripe primary)
- [ ] Member directory, login/registration flows, profile management

#### AI Surfaces (User + Employee)
- [ ] Define end-user AI surface (assistant panel for guided site changes)
- [ ] Define employee/internal AI surface (operations console with elevated tooling)
- [ ] Define tool permission tiers (user-safe vs staff-only vs admin-only)
- [ ] Add approval flows for destructive/high-impact tool actions
- [ ] Add audit logs for all AI tool calls and resulting mutations
- [ ] Add simulation/dry-run mode before applying front-end or back-end changes
- [ ] Add rollback checkpoints for AI-applied changes
- [ ] Add dual-surface UX contracts (what users can self-serve vs what staff can perform)

#### AI Tooling for Frontend + Backend Mutation
- [ ] Tooling: frontend layout/style/content mutation tools
- [ ] Tooling: backend schema/config/workflow mutation tools
- [ ] Tooling: safe migration tools (preview diff, impact analysis, revert plan)
- [ ] Tooling: test-and-verify tools (run checks before apply)
- [ ] Tool orchestration policy: require tool-use-first and structured outputs
- [ ] Add guardrails to prevent unbounded or cross-tenant mutations

#### Agentic Web / Playground MCP Backlog
Source prompts:
- Automattic: `https://automattic.com/2026/04/21/wordpress-operating-system-agentic-web/`
- WordPress Playground MCP: `https://make.wordpress.org/playground/2026/03/17/connect-ai-coding-agents-to-wordpress-playground-with-mcp/`

- [ ] Evaluate the "WordPress as operating system of the agentic web" thesis against Tovu's strategy: governed web operating layer exposing content, admin, extensions, jobs, diagnostics, and site state as safe agent capabilities.
- [ ] Track the agentic-web challenge set as explicit risks to solve later: legacy/technical-debt drag, inconsistent extension quality, abandoned/insecure extensions, performance overhead, extension-order complexity, fragmented runtimes, and missing ecosystem quality signals.
- [ ] Define a Tovu agent capability catalog for content, media, themes, plugins, settings, jobs, migrations, diagnostics, and recovery, with descriptors reusable by admin UI, AI assistant, MCP, and future protocols.
- [ ] Define a WordPress Playground-style Tovu Playground: disposable local/browser sandbox for AI coding agents to test site, content, theme, plugin, and schema changes without production writes.
- [ ] Add a local-only MCP bridge for Tovu Playground with token/origin protection, explicit user-scoped enablement, and no production credentials by default.
- [ ] Expose sandbox tools for HTTP requests, admin navigation, content mutation, theme/plugin file operations, migration dry-runs, test execution, job inspection, snapshot reset, and export/import.
- [ ] Add an AI coding agent integration contract covering sandbox creation, patch application, preview URL, diff review, human approval, audit log, and rollback checkpoint linkage.
- [ ] Add contract tests proving MCP/playground actions cannot exceed equivalent authenticated admin permissions or bypass safe-mode/recovery policy.

### 23) Platform Gaps Still Missing

#### Governance, data, and compliance
- [ ] Define data classification policy (PII, sensitive business data, public data)
- [ ] Define retention and deletion policy per data class
- [ ] Implement data subject request workflows (export/delete/correction)
- [ ] Map controls for SOC2-style audit readiness
- [ ] Map GDPR/CCPA requirements to concrete product behaviors
- [ ] Define evidence collection workflow for audits (logs, approvals, controls)

#### Reliability and global operations
- [ ] Define multi-region strategy (active/passive or active/active)
- [ ] Define data residency controls by workspace/tenant
- [ ] Define disaster failover playbook and trigger criteria
- [ ] Define latency and availability SLOs by region
- [ ] Run recurring restore drills to validate RPO/RTO goals

#### Commercial platform capabilities
- [ ] Define billing domain model (plans, subscriptions, invoices)
- [ ] Define entitlement model (feature access by plan)
- [ ] Define quota model (API, storage, AI usage, seats)
- [ ] Define overage handling and enforcement behavior
- [ ] Define billing/audit reconciliation workflows

#### API and ecosystem lifecycle
- [ ] Define API versioning lifecycle and sunset/deprecation policy
- [ ] Define SDK generation and release process
- [ ] Define backward-compatibility guarantees for core APIs
- [ ] Define extension API stability policy (what can break and when)

#### Marketplace and supply chain trust
- [ ] Define plugin/theme submission and review workflow
- [ ] Define package signing and integrity verification model
- [ ] Define extension trust scoring (security, maintenance, quality)
- [ ] Define malicious package response workflow (disable/quarantine/notify)

#### Release management and support operations
- [ ] Define release channels (stable, beta, canary) and promotion rules
- [ ] Define rollback playbooks per release type
- [ ] Define customer-facing status page and incident communication templates
- [ ] Define support tooling (safe impersonation, diagnostics bundle export)
- [ ] Define runbooks for top recurring incidents

#### Product growth and safety operations
- [ ] Define experimentation framework (A/B testing + guardrails)
- [ ] Define onboarding wizard and activation milestone tracking
- [ ] Define migration assistant UX with success/failure checkpoints
- [ ] Define cost telemetry by module/feature and budget alerts
- [ ] Define analytics taxonomy governance and ownership
- [ ] Define UGC moderation/safety policy if user-generated content is enabled

### 24) Architecture Tooling Evaluation (added 2026-06-30)

Source: competitor-analysis session. See `claude-tovu-competitor-findings.md`, `gemini-tovu-competitor-findings.md`, `codex-tovu-competitor-findings.md`.
Goal: evaluate/adopt tooling that keeps the codebase modular, maintainable, and flexible (enforces the ports/adapters + spec-first constraints). Ties into existing items 1) "architecture boundary enforcement" and 15) "architecture lint".

Recommended starting five (highest ROI):
- [ ] Evaluate **dependency-cruiser** — enforce "core never imports adapters" as CI-failing rules (makes the inward-dependency rule real)
- [ ] Evaluate **knip** — find unused files/exports/deps across the workspace (keeps plugin-heavy platform lean)
- [ ] Evaluate **Zod** at all boundaries — runtime validation + single source of truth for types (fits SQLite JSON-text ↔ jsonb strategy)
- [ ] Evaluate **ArchUnitTS / ts-arch** — architecture rules as unit tests (fits spec-first / M3 test-contract framework)
- [ ] Evaluate **Testcontainers** (+ **Pact**) — contract-test each DB/storage/payment adapter against a real backend

Adopt when splitting `src/` into `packages/`:
- [ ] Evaluate **Nx** vs **Turborepo** — workspace + module-boundary tags + affected graph + caching
- [ ] Evaluate **Sheriff** / **good-fences** — lighter encapsulation if not going full Nx

Understanding / codegen / docs:
- [ ] Evaluate **Madge** — fast circular-dependency detection (cheap complement to Graphify/CBM)
- [ ] Evaluate **ts-morph** — TS AST manipulation for `migration-generator.ts`, plugin `sdk-builder`, typegen (how Payload does config/typegen)
- [ ] Evaluate **ts-rest / tRPC** — compiler-checked contracts for the headless packet (Next/Vue shells)
- [ ] Evaluate **Structurizr DSL / C4 model** (+ PlantUML) — diagrams-as-code living architecture docs (pairs with ADR log in item 18)
- [ ] Evaluate **OpenTelemetry** (later) — runtime coupling/traces once modules talk via events

### 25) Reference Codebases to Study (added 2026-06-30)

Goal: study exemplary OSS repos for architecture/design patterns Tovu needs (ports/adapters, DDD, plugin systems, theme systems, provider adapters, monorepo layout). Consider cloning + graphifying the high-priority ones like the existing OSS-Repos set.

Ports/adapters + DDD references (TS):
- [ ] **Sairyss/domain-driven-hexagon** — canonical TS DDD + hexagonal + CQRS reference (closest to Tovu's intended core)
- [ ] **CodelyTV/typescript-ddd-example** — DDD/CQRS skeleton in TS
- [ ] **medusajs/medusa** — modular monolith, module container + module links, provider pattern (already partly in specs; graphify it)

Plugin-system gold standards:
- [ ] **microsoft/vscode** — contribution points, extension host, activation events (the canonical extensible-platform design)
- [ ] **backstage/backstage** — plugin framework at scale, well-documented plugin API
- [ ] **grafana/grafana** — plugin + data-source-provider architecture

Theme + plugin + content tooling (TS, directly relevant):
- [ ] **facebook/docusaurus** — theme + plugin + preset lifecycle in TS (strong theme-system reference)
- [ ] **withastro/astro** — integrations API, content collections, deploy adapters (modern content-tool adapter pattern)

Provider/adapter + modular monorepo references (TS):
- [ ] **novuhq/novu** — NestJS modular monorepo, notification provider adapters (like Strapi providers)
- [ ] **twentyhq/twenty** — modern NestJS + React modular monorepo (CRM)
- [ ] **calcom/cal.com** — large Next.js app + packages monorepo, feature modularity
- [ ] **nestjs/nest** — DI/modules/providers = canonical TS ports/adapters + DI reference

Curated lists to mine:
- [ ] **mehdihadeli/awesome-software-architecture** and **donnemartin/system-design-primer** — patterns catalog
