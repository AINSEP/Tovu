# Tovu V1 Design Blueprint

Date: 2026-07-01
Purpose: reconcile the three competitor-findings docs (`claude-4.8-`, `codex-5.5-`, `gemini-3.1-tovu-competitor-findings.md`) with `tovu-architecture.md` and the actual code in `tovu/src`, and turn them into a buildable v1 design. Plugins and themes are the product; everything else is substrate.

---

## 1. Verdict on the three findings docs

### Where all three agree (treat as settled)

- Modular monolith + ports/adapters; core never imports provider SDKs.
- SQLite first, Postgres later, via Payload's shape: one shared query/schema core with thin per-dialect adapters.
- Directus roles→policies as the auth/permissions reference.
- Keep the existing event bus + outbox as the decoupling spine.
- Ghost's theme lifecycle (install/preview/activate/deactivate + settings), made renderer-agnostic.
- Strapi/Directus for plugin *packaging*; WordPress for the plugin *mental model* only — explicitly reject hook soup.
- Admin is a shell over stable contracts; AI controls layer on top of admin actions, never inside domain code.

### Where they disagree, and the call

**Package split timing.** Gemini says elevate `src/*` folders into physical workspace packages now ("must be elevated"). Claude says sequence deliberately and watch coupling. **Call: split now, but small.** Gemini is right that folders don't enforce anything, and wrong about scope — going straight to the 20-package layout in `tovu-architecture.md` §3 would mean maintaining 20 package boundaries before any of them has a second consumer. Split into 4–6 workspaces whose boundaries are the ones plugins/themes will actually see (see §4), enforce with tooling, split further only when a module gains a second consumer or its own release cadence. Claude's cross-prefix data supports this: Payload has great adapter seams and terrible package hygiene (23%) — package count doesn't buy discipline, enforcement does.

**Payments reference.** Codex says Ghost (productized Stripe membership); Claude says Open SaaS (multi-provider `paymentProcessor` port). **Call: Claude's shape, but defer entirely — payments is the flagship *plugin*, not a core module.** WordPress's most important lesson is that commerce (WooCommerce) proved the plugin system. When payments comes, it's `plugins/commerce` built on the plugin SDK, with the Open SaaS multi-provider port shape inside it. If payments can't be built as a plugin, the plugin system has failed its main test.

**Schema registry / extension SDK timing.** Gemini says build a Directus-style schema registry + extensions SDK early. **Call: right, with a guardrail.** A content-type/schema registry is a hard prerequisite for plugins (plugins extend content types — the SEO plugin adds fields to posts). But avoid Directus's "reflect any table" data-first philosophy (Claude's caveat): Tovu registers *domain* content types; the registry drives migrations, not the other way around.

**General reliability weighting.** Claude's doc is the strongest (evidence-cited, consistent methodology, flags the reality-vs-aspiration gap). Codex agrees on direction with weaker evidence. Gemini is thin and directionally right on packages/registry but wrong on scope. Use Claude's as the reference doc; the other two as sanity checks.

---

## 2. Design thesis: one substrate, the whole WordPress surface

Tovu is not "a themes-and-plugins engine" — it is the full WordPress platform surface (content, taxonomy, media, users, settings, routing, scheduling, delivery, admin, install/updates) rebuilt as a core set of TypeScript libraries. Section 3.5 maps every WordPress subsystem (per `other-repos-specs/wordpress_specs/`) to its home in Tovu. Themes and plugins are the *ecosystem lever*, not the scope.

Tovu's differentiators are (a) WordPress-grade extensibility in TypeScript and (b) AI-native operation. Both reduce to the same architectural requirement:

> Every capability in the system — first-party or third-party, human-driven or AI-driven — is registered through the same small set of typed kernel registries.

A plugin registers content types, hooks, admin panels, and AI tools. A theme registers templates and settings. The admin shell renders what the registries contain. The AI layer exposes what the registries contain (tools → MCP/AG-UI). Nothing gets a private back door.

This is also the AI story: an AI agent managing a Tovu site is just another consumer of the same capability-scoped API a plugin gets. You don't build "AI features"; you build a legible, permissioned, introspectable action surface, and AI rides it for free.

**Dogfooding rule:** after the plugin system exists, at least one existing feature must be rebuilt as a plugin (first candidate: SEO fields on posts). If first-party code needs an escape hatch the SDK doesn't offer, the SDK is wrong — fix the SDK, don't take the hatch.

---

## 3. Kernel primitives (the extension substrate)

Seven registries. This is the whole kernel surface; everything else is a consumer.

| # | Primitive | Contract sketch | Status today |
|---|---|---|---|
| 1 | **Service registry (DI / ports)** | `register(token, impl)` / `resolve(token)`; adapters injected at composition root | Exists informally (`core/ports.ts` + in-memory adapters) — formalize |
| 2 | **Event bus + outbox** | `enqueue → processOutbox → claimPending → markDelivered`; versioned event envelopes | Exists — keep, add persistence + retries |
| 3 | **Schema registry** | `registerContentType(def)`, `extendContentType(type, fields)`; drives validation + migration plans | Implicit in `PostRecord` — build; evolve `PostRecord` → `ContentEntry` per `features/post/INFO.md` |
| 4 | **Hook system (typed)** | Hook points are *declared* by an owner with a typed signature before anyone can attach; `addFilter`/`addAction` against declared points only | Not built |
| 5 | **Capability model** | Manifest declares capabilities (`content.read`, `admin.panel`, …); SDK builder exposes only granted surface | Not built |
| 6 | **Admin surface registry** | Framework-agnostic descriptors: panels, menu items, editor extensions, settings pages. Shells (Next/Vue) resolve descriptors to components | Partially (admin-shell metadata) — extend |
| 7 | **AI tool registry** | `registerTool(def)`; auto-bridged to MCP / AG-UI by the protocol layer | Not built (design exists in tovu-architecture.md) |

**Anti-hook-soup rule (worth stating twice):** WordPress lets anyone fire and filter any string. Tovu hook points are typed contracts with a declared owner, signature, and doc string, enumerable at runtime (`tovu hooks list`). This is what makes hooks AI-legible too — an agent can discover what's extendable.

---

## 3.5 The full platform surface: WordPress → Tovu capability map

Source of truth: `other-repos-specs/wordpress_specs/` (the reverse-engineered corpus). The platform is organized in five tiers. The kernel (§3) is tier 1; this section is tiers 2–5 — the "core set of libraries" and everything above them.

**Tier 2 — Core libraries** (modules inside `packages/core`, pure TS behind ports; roughly `wp-includes` reborn):

| WordPress subsystem (spec) | Tovu library | Notes / design call |
|---|---|---|
| query-and-posts, blocks | `content` | Content types, statuses (draft/scheduled/published/trash), revisions + autosave, query engine. Block model = the rich-text doc (TipTap JSON), not string-parsed markup |
| taxonomy | `taxonomy` | Terms, hierarchies, custom taxonomies; relations via schema registry |
| meta | *(absorbed)* | No EAV meta tables — schema-registry field extensions + JSON columns replace post/user/term meta |
| options | `settings` | Typed, schema-registered settings, scoped global/workspace/user. Registration replaces WP's untyped `options` grab-bag |
| users-and-auth, application-authorization | `identity` | Users, roles→policies (Directus model), sessions, app tokens/API keys; AI agents are principals here too |
| media | `media` | Assets, transform pipeline, storage port; image sizes as declared transforms |
| rewrite-and-routing | `routing` | Permalink structures, route→template context resolution (feeds the theme resolver); no regex rewrite soup — declarative route table |
| formatting, html-api | `text` | Sanitization (kses equivalent), HTML processing, slug/excerpt utilities. Security-critical; one library, one policy |
| cron | `scheduler` | Real scheduled jobs on the outbox/worker spine — fixes WP-Cron's traffic-dependent pseudo-cron (a top WP complaint) |
| http | `HttpClientPort` | Outbound HTTP as a port (mockable, rate-limitable) |
| wp-root mail | `MailerPort` | Outbound email as a port (SMTP/provider adapters); WP's `wp_mail` is a chronic failure point — make it observable |
| object-cache | `CachePort` | In-memory adapter first; Redis later |
| l10n | `i18n` | Message catalogs + locale context. Design the string API in early even if EN-only ships first — retrofitting i18n is brutal |
| assets-and-dependencies, script-modules | `assets` | Dependency-ordered asset registry; mostly resolved by shells/bundlers in a TS world — keep thin |
| widgets-and-menus (menus half) | `navigation` | Menu trees as content, editable in admin, rendered by themes |
| error-protection-and-recovery | `recovery` (kernel-adjacent) | Safe-mode boot, extension quarantine, last-known-good — this is UF-01/UF-02, a headline Tovu differentiator |
| multisite, network-admin | `workspace` (already exists) | Tovu is multi-site *native* via workspaces + the desktop manager — WP's biggest bolt-on becomes a first-class primitive |
| abilities-api | *(validated)* | WP's new abilities API is convergent evolution toward Tovu's capability model + AI tool registry — proof the §3 design is right |

**Tier 3 — Bundled modules** (built on kernel + libraries; shipped by default but structured as plugins so they prove the SDK and can be disabled):

| WordPress subsystem | Tovu home | Call |
|---|---|---|
| comments, comments-admin | `plugins/comments` | Bundled plugin, not core — many sites disable it; Ghost dropped it entirely; perfect SDK stress test (own tables, hooks, admin surface, moderation queue) |
| feeds-and-syndication | `plugins/feeds` | RSS/Atom as a delivery-output plugin |
| sitemaps | `plugins/seo` (or `sitemaps`) | Pairs naturally with the Phase-4 SEO plugin |
| oembed-and-embeds | `plugins/embeds` | Editor-facing embed resolution; uses `HttpClientPort` |
| search | `plugins/search` over a `SearchPort` | SQLite FTS5 adapter first; Meilisearch/pgvector later |
| tools (import/export) | `plugins/importer` + core export contract | Canonical export format lives in core (UF-13 portability promise); WXR import is a plugin |
| xmlrpc, trackbacks, pingbacks, press-this | **dropped** | Deliberately not carried forward |
| shortcodes | **dropped** | Superseded by dynamic block nodes in the doc model |
| widgets (sidebars half) | **superseded** | Slots/regions + blocks replace widget instances |

**Tier 4 — Extension surface:** themes + plugins (§5), the SDK, and the manifest/lifecycle contracts. Unchanged from before — but note it is one tier of five, not the whole product.

**Tier 5 — Product surfaces** (apps over the API; roughly `wp-admin` + `wp-root` reborn):

| WordPress surface | Tovu home |
|---|---|
| install-and-setup (5-minute install) | `tovu init` / first-boot flow — install dir + SQLite file + admin user; must beat WP's famous install |
| admin bootstrap, dashboard, settings/users/media/menus screens, post editor | `apps/admin-*` shells rendering core + registry-contributed surfaces |
| site editor, theme-json/global-styles, style-engine, template canvas/previews | Theme contract (§5): design tokens = theme.json analog; live preview before activate |
| plugins/themes management, updater-and-filesystem, automatic-updater | Extension manager UI + update pipeline with preflight/rollback (UF-01) — updates are a *workflow*, not a file copy |
| revisions-and-repair | Revision history UI over `content` revisions |
| privacy-and-personal-data | Data export/erase per principal — deferrable, but keep PII tagged in the schema registry from day one |
| site health / debug data | Ops/status surface over `recovery` + structured logs |
| wp-cron endpoint | Worker process (already the outbox worker's job) |
| wp-login/signup | Auth surface over `identity` |
| headless.md | Already native: the content API + DTO packet is Tovu's default shape |

**Placement rule:** tier 2 is anything ≥80% of sites need and plugins must build *on* (content, identity, media, routing, settings). Tier 3 is anything a meaningful fraction of sites disable or replace (comments, feeds, search). When in doubt, start it as a bundled plugin — promotion to core library is easy; demotion is a breaking change.

---

## 4. Package layout (v1 — small on purpose)

Decisions governing this layout are recorded in
`ADS-project-knowledge/reports/architecture/ADR-INDEX.md` (ADR-002…009).

```
tovu/                            # pnpm workspace root
├── packages/
│   ├── core/                    # ONE package; modules split out only on second consumer
│   │   └── src/
│   │       ├── kernel/          # tier 1 — the 7 registries
│   │       │   ├── services/    #   DI / service registry (tokens, resolve)
│   │       │   ├── events/      #   bus + outbox contracts & worker (exists today)
│   │       │   ├── schema/      #   content-type/schema registry (drives validation + core-owned DDL, ADR-003)
│   │       │   ├── hooks/       #   typed hook points (declared-before-attached)
│   │       │   ├── capabilities/#   capability model (plugins + users + agents share vocabulary)
│   │       │   ├── surfaces/    #   admin surface descriptor registry
│   │       │   └── tools/       #   AI tool registry (→ MCP/AG-UI later)
│   │       ├── lib/             # tier 2 — core libraries (§3.5), each: index.ts + INFO.md + __tests__/__specs__
│   │       │   ├── content/     #   entries, statuses, revisions, change-sets (ADR-008), query
│   │       │   ├── taxonomy/    ├── identity/        ├── media/
│   │       │   ├── routing/     ├── settings/        ├── navigation/
│   │       │   ├── scheduler/   ├── text/            ├── i18n/
│   │       │   ├── recovery/    └── workspace/       # (exists today as a feature)
│   │       ├── ports/           # cross-cutting port interfaces that pass ADR-006 rule-of-two
│   │       └── workflows/       # compensation-step util for multi-step ops (ADR-009 §4)
│   ├── sdk/                     # PUBLIC surface (ADR-005): definePlugin/defineTheme/defineContentType,
│   │                            #   scoped-API types, manifest schemas (ADR-004); starts SMALL
│   ├── server/                  # composition root: wiring, Express routes (as data), seeds, ops endpoints
│   ├── db-sqlite/               # persistent adapter set: repos, outbox, change_sets, migrations engine;
│   │                            #   internals = shared base + dialect layer so db-postgres is additive (Payload seam)
│   └── renderer-react/          # the blessed renderer adapter (ADR-002): template-ID→TSX resolution,
│                                #   block component registry, slot renderer
├── apps/
│   ├── admin/                   # the Next admin shell (from tovu/nextjs) — the one real admin
│   └── contract-vue/            # demoted Vue shell (ADR-002): CI contract test that descriptors stay framework-agnostic
├── plugins/                     # first-party plugins; consume @tovu/sdk ONLY; each builds to a .tovu-plugin artifact (ADR-004)
│   ├── seo/                     # Phase 4 dogfood: fields on all types, page.head hook, admin panel, AI tool
│   └── comments/                # later: the tier-3 stress test (own hooks, moderation queue, admin surface)
├── themes/                      # reference themes on the theme contract, renderer: react@1 (ADR-002)
│   ├── paper/  ├── atlas/  └── glassmorphic/
└── tooling/
    ├── eslint-boundaries/       # import-direction lint (Medusa-style), CI gate
    └── cli/                     # tovu init / dev / plugin build (grows into the product CLI)
```

Dependency direction (arrows only point down): `apps → sdk/server → core`;
`plugins/themes → sdk only`; `db-sqlite/renderer-react → core`; `core → nothing`.

Enforcement (all three, per tovu-architecture.md §11): pnpm workspaces + TS project references + boundary lint (dependency-cruiser or eslint import rules — Medusa's lint-rule-per-boundary trick). CI gate, not review suggestion. Track the cross-prefix ratio as packages split; Directus (~2%) is the target, Payload (~23%) the cautionary tale.

Deferred packages (create when a second consumer exists): `db-postgres`, `protocol` (MCP/AG-UI can start inside server), `desktop` (multi-site manager), `payments`, per-framework binding packages.

## 5. Layer decisions (settled by the findings)

- **Data:** SQLite via the Payload seam. Hybrid persistence per `features/post/INFO.md`: identity/routing/workflow fields as relational columns; document-shaped fields (blocks, metadata, plugin extension data, AI analysis) as validated JSON text → `jsonb` on Postgres. Migrations generated from the schema registry.
- **Auth:** a port with a local session adapter first; Directus roles→policies data model from the start (roles, policies, capabilities tables) so the capability model (§3.5) and user permissions share one vocabulary. Site-scoped users; desktop-level ownership later.
- **Events:** keep outbox. Add: persistent adapter, retry w/ backoff, idempotent handlers, dead-letter. Later, for multi-step mutations that must roll back (plugin install, theme activate, updates — UF-01), borrow Medusa's compensation-steps idea as a small workflow util on top of the outbox; not a saga engine in v1.
- **Themes:** Ghost lifecycle + WordPress template-hierarchy resolution, renderer-agnostic (core resolves *template IDs*; shells map IDs to components). Regions/slots take framework-agnostic render instructions. Theme settings live in the schema registry like everything else. **Because a third-party theme library is a core goal, themes are *declarative by default* — block templates + design tokens + sanitized CSS, no executable code; interactivity only via registered components from core/plugins. Full-TSX "code themes" are a trusted-mode escape hatch (ADR-010, amending ADR-002).**
- **Plugins:** manifest (name, version, capabilities, dependencies, hooks consumed, extension points offered) + lifecycle (install/enable/disable/uninstall as compensable steps) + scoped SDK built from granted capabilities. **Runtime: in-process, API-surface enforcement** — no VM/isolate sandboxing in v1 (that's a rabbit hole); the manifest is designed so a stricter runtime can be swapped in later without changing plugin code.
- **AI:** no AI package until registries 3–7 exist — then it's mostly free: tool registry → MCP server; admin surface + hooks → AG-UI actions; capability model → agent permissions. AI agents authenticate as principals with roles/policies like any user.

---

## 6. Build order

Each phase is a shippable vertical slice; no phase starts a package it doesn't need.

**Phase 0 — Workspace-ify (small, do first).**
Extract `packages/{core,sdk,server,db-sqlite(empty)}` + `apps/{admin-next,admin-vue}` from the current tree. Add boundary lint + TS project references + CI gate. Split `core/ports.ts` into per-domain port files (already on todos). *Exit: build passes, boundary violations fail CI, behavior unchanged.*

**Phase 1 — Persistence.**
SQLite adapter for post/workspace repos + outbox (todos "first persistent adapter set"). Outbox retries/backoff/idempotency. Structured logging + request IDs. *Exit: server restarts without losing data; outbox survives crash.*

**Phase 2 — Kernel registries.**
Schema registry (+ `PostRecord` → `ContentEntry` migration), typed hook system, capability model + scoped SDK builder, plugin loader + lifecycle. *Exit: a trivial plugin loads from a manifest, extends a content type, filters a declared hook point, and is denied anything undeclared — proven by contract tests.*

**Phase 3 — Theme contract.**
Theme manifest, template-hierarchy resolver, slots/regions, settings, install/preview/activate/deactivate lifecycle with revert (UF-07). Port paper/atlas/glassmorphic to it in both shells. *Exit: theme switch via admin API, both shells render, bad theme activation reverts cleanly.*

**Phase 4 — Dogfood plugin: SEO.**
Fields on all content types, a declared `page.head` hook, an admin panel descriptor rendered by *both* shells, an `analyze_seo` AI tool registration (registry only; protocol exposure next phase). *Exit: SEO ships as `plugins/seo` with zero core changes.*

**Phase 5 — AI surface.**
MCP server generated from the tool registry; AG-UI/CopilotKit-style control over admin-surface actions; agent principals under roles/policies. *Exit: an external agent lists tools, edits a draft, and is blocked from publish without the capability.*

**Deliberately deferred:** Postgres adapter, payments (arrives as a plugin post-Phase 4), search port, VM-level plugin sandboxing, marketplace/provenance (UF-04/UF-11), microservice extraction (never, until evidence). The desktop multi-site manager is **resolved, not deferred**: open-design's Electron app is the host and Tovu does not build its own — see ADR-011 (standalone single binary stays the primary, CI-enforced topology; desktop mode injects daemon-backed adapters for `LLMPort`/MCP/connectors via a future `packages/host-open-design/`).

**Beyond Phase 5:** the tier 2/3 capability map (§3.5) is the backlog — each remaining library (taxonomy, media, navigation, scheduler, i18n, recovery) and bundled module (comments, feeds, search, importer) lands as its own vertical slice on the same substrate. Phases 0–5 exist to make those slices cheap.

---

## 7. Risks carried forward

- The 20-package layout in `tovu-architecture.md` §3 stays *aspirational*; this doc's §4 is the buildable subset. Don't let new code target the aspirational layout.
- Two admin shells is a boundary-forcing asset but a maintenance cost; if it drags, keep Vue as a read-only contract test rather than deleting it.
- Capability enforcement at the API surface is honor-system against a malicious in-process plugin; acceptable for v1 (first-party + local installs), must be revisited before any marketplace.
- The hook system is the most likely place for WordPress-style rot. The "declared hook points only" rule is load-bearing; enforce it in the SDK types and at runtime.

---

## 8. Honest weaknesses review (2026-07-01)

Problems in the findings docs, `tovu-architecture.md`, and this doc's own synthesis that will bite later if unaddressed. Ordered by expected damage.

> **Update 2026-07-01:** W1–W7 are now *decided* — recorded as ADR-002…009 in
> `ADS-project-knowledge/reports/architecture/` (see ADR-INDEX.md). W7's code
> drift (unscoped `PostRepoPort`, optional `DomainEvent.workspaceId`, outbox
> dropping the event envelope) was fixed in `tovu/src` the same day; all tests pass.

**W1 — "Renderer-agnostic themes" is the riskiest bet in the whole design, and all three findings docs waved it through.** No successful CMS has a framework-agnostic theme ecosystem: WordPress themes are PHP, Ghost themes are Handlebars — both picked one target, and that focus is *why* their ecosystems exist. Agnostic themes force either lowest-common-denominator render instructions or N implementations per theme. Same for admin: "framework-agnostic component descriptors" work for menu items and settings forms, but real plugin UIs ship real components. **Call:** keep the *contracts* renderer-agnostic (template IDs, slots, descriptors) but bless exactly one rendering target for the v1 ecosystem, and demote the Vue shell to a read-only contract test now rather than a co-equal shell. Agnosticism is an insurance policy; don't pay double premiums forever.

**W2 — Runtime schema evolution is the hardest technical problem and every doc hand-waves it.** Payload generates migrations for a *developer* at build time; Tovu plugins install/uninstall on *end-user sites* at runtime, and SQLite's `ALTER TABLE` is weak. Letting plugins run DDL means UF-01 (update breaks production) is unsolvable. **Call:** plugins never get DDL. Plugin-contributed fields live in a namespaced JSON column (`ext.{pluginId}.*`) validated by the schema registry; real DDL is reserved for core libraries and site-level content types through the core migration engine. Uninstall retains JSON data (no destructive migration); this also makes plugin rollback nearly free.

**W3 — Plugin packaging/distribution for a TS runtime is unsolved and unmentioned.** WordPress plugins are interpreted PHP dropped in a folder. A TS plugin needs an artifact story: what gets installed into an install dir, who builds it, how admin-UI components ship, how versions pin against the SDK. **Call needed before Phase 2:** define the plugin artifact (prebuilt ESM + manifest + optional admin bundle, loaded by dynamic import; workspace path only as dev mode). Without this, "plugins" quietly become "workspace packages" and the install-dir product model dies.

**W4 — SDK compatibility promise matters more than sandboxing.** WordPress's ecosystem moat is 20 years of backward compatibility. Decide on day one: what is public API (`@tovu/sdk` exports only), semver policy, deprecation policy (deprecate → warn → remove across N minors), and contract tests that pin the public surface. A capability model without a compat promise produces an ecosystem nobody trusts.

**W5 — Port-mania in `tovu-architecture.md` §13.** Sixteen friction clusters × one bespoke port each (`UpdateSafetyPort`, `IncidentAnalysisPort`, `PerfAnalysisPort`, …) is abstraction before first implementation — most of those are *features*, not seams. **Rule:** no port without two plausible adapters, one being built now. Ports earn their keep where change is likely and external (DB, storage, mail, LLM, search); update-safety and incident analysis are just Tovu code on the event spine.

**W6 — AI mutations need a change-set primitive, and nothing in the design provides it.** If agents edit sites, the differentiator is reviewable/reversible change: propose → preview → apply → revert. Events + revisions get partway, but a first-class change-set (group of mutations with a diff and an inverse) would unify AI approval flows, theme preview, update preflight (UF-01), and migration guardrails (UF-13). Not v1 scope — but design the event envelope and revision model so they don't preclude it (every domain event carries enough state to invert, or references a revision that does).

**W7 — Workspace scoping must be structural, not conventional.** Multisite-native means every repo method, cache key, event envelope, scheduled job, and capability check carries `workspaceId` from day one. Enforce in port signatures (first-argument required object already includes it) and in contract tests. Retrofitting tenancy is the classic unrecoverable mistake.

**W8 — Dogfooding and registry purity have a failure mode.** "Everything through the registries" applied too early means building the platform to build the feature to build the platform. Two or three honest plugin proofs (SEO, comments) are enough; don't convert stable core features to plugins for purity. Watch for the Gutenberg anti-pattern: first-party code quietly using private APIs — if core needs an escape hatch, the SDK is wrong or the feature is tier 2, not tier 3.

**W9 — Content storage vs future collaboration.** Revisions-as-snapshots of TipTap JSON is right for v1, but if CRDT collaboration (AI Foundation docs) is ever real, retrofitting Yjs onto snapshot storage is painful. Cheap insurance: version field on the doc model, revisions addressable by id, and no code that assumes "content = one mutable row."

**W10 — Metrics humility.** Cross-prefix ratio counts edges, not harm; use it as a smell, never a target. Similarly the findings docs' repo ratings differ by ±1.5 points on identical evidence — treat all of it as direction, not ground truth.
