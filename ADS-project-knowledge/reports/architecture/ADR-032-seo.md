# ADR-032: SEO Subsystem — Dogfood Bundled Plugin, Per-Entry Meta on ext Fields, page.head Render Hook, Declarative Sitemap/robots

- Status: PROPOSED 2026-07-10 (autonomous Opus 4.8 sweep agent — design-only, no peer audit; owes debate+audit before ACCEPTED)
- Author: autonomous Opus 4.8 sweep agent
- Extends: **ADR-022** (per-entry meta reuses the namespaced `fields.ext.seo.*` bag + a partial expression index; zero new tables), **ADR-020** (the `page.head` output is the canonical render IR, injected at the theme `<head>` seam; ties to theme tiers), **ADR-024** (the SEO plugin is the Phase-4 dogfood: it conforms to the frozen async + serializable ABI so it drops into the future Tier-2 sandbox unchanged)
- Relates: ADR-009 (hooks = extension mechanism; outbox events for cache invalidation), ADR-021 (flat `seo.*` permission strings + code-side catalog), ADR-028 (site-level SEO config as `seo.*` setting definitions), ADR-007 (workspace-scoped queries/cache keys), ADR-012 (bundled plugin ships in the install-dir `plugins/`), ADR-006 (rule-of-two — no new port warranted), ADR-027 (media refs for social images; origin/URL discipline reused), ADR-003 (plugins never run DDL)
- Sources: brief in `todos.md` "Admin Section Spec Sweep"; `tovu-v2-design.md` §3.5 placement rule + §6 Phase-4; AEO/GEO backlog `todos.md` §22 (the named deferred seam)

## Context

Tovu needs the classic SEO surface — per-entry metadata, social cards, structured
data, `sitemap.xml`, and `robots.txt`. `tovu-v2-design.md` §3.5 already **names SEO
as a tier-3 bundled module** (`plugins/seo`) and §6 makes it the **Phase-4 dogfood**:
*"Fields on all content types, a declared `page.head` hook, an admin panel descriptor
rendered by both shells, an `analyze_seo` AI tool registration … SEO ships as
`plugins/seo` with zero core changes."* The architectural question this ADR closes is
**not "where does SEO live"** (§3.5 decided that) but **how its data model, render
hook, sitemap/robots outputs, permissions, and hooks are built so that (a) they reuse
the accepted content/settings/identity machinery rather than inventing parallel
mechanisms, and (b) the plugin is a genuine ABI-conformance proof, not a privileged
core module wearing a plugin costume.**

A large AEO/GEO backlog exists (`todos.md` §22: answer-engine Q&A models, GEO entity
graphs, `llms.txt`, IndexNow, citation tracking, knowledge-sitemaps, crawler-policy
management). This ADR designs the **v1 CORE only** and names AEO/GEO as a single later
seam — building the classic surface *first* is what the answer-engine work later stands
on (a correct sitemap/JSON-LD/meta foundation is a prerequisite for every §22 item).

This is a **design-only** draft produced by a solo agent: no swarm debate, no external
audit. It stays strictly inside accepted ADRs; where it touches an unsettled edge it is
flagged in **Open**, never resolved by reopening an accepted decision.

## Decision

### 1. Placement — tier-3 bundled dogfood plugin (`plugins/seo`), ABI-clean

SEO is a **§3.5 tier-3 bundled module**, not a tier-2 core library. It satisfies the
§3.5 placement rule on both prongs: it is **replaceable** (Yoast/RankMath/Ghost-native
SEO are the proof that a meaningful fraction of sites swap the SEO layer) and
**disable-able** (a headless/API-only site needs none of it). "When in doubt, start it
as a bundled plugin — promotion to core library is easy; demotion is a breaking change."

In ADR-024 capability-tier terms the bundled artifact ships **Tier-3 trusted**
(in-process, first-party, never listed in the public marketplace — ADR-024 §2). But its
architecture is deliberately **Tier-1/Tier-2-shaped**:

- The **per-entry meta half is Tier-1 declarative** — it is nothing but content-type
  field registrations (§2) that a third party could ship install-from-anyone-safe today.
- The **render/sitemap/robots half is code**, but that code touches **only the frozen
  async + serializable ABI** (ADR-024 §3): no `fs`, no direct DB handle, no network, no
  live core objects — head contributions are serializable IR descriptors, content reads
  are keyset queries returning serializable snapshots, all core access is by capability
  handle. This is exactly `todos.md` §line-188's "SEO = pure computation, no fs/network →
  cleanest test of the frozen async/serializable ABI." **The dogfood value is that this
  plugin proves the ABI**: it would drop into the future Tier-2 `utilityProcess` sandbox
  (ADR-024 §4) as a runtime swap with zero code change.

Corollary seam (named, not built): because the head/sitemap outputs are **core-mediated
declarative primitives** (ADR-024 §1 lists "snippet/asset injection" as a core-mediated
primitive), a *future* third-party SEO plugin could ship its head contributions as a
Tier-1 declarative manifest against the same `page.head` seam — the bundled plugin is the
first consumer, not the only possible one.

### 2. Data model — per-entry meta on `fields.ext.seo.*`; zero new tables

Per-entry SEO metadata reuses ADR-022 wholesale. No `seo_*` tables, no sidecars (unlike
ADR-027 media, SEO owns no operational bytes — it is pure derivation over existing rows):

- **Storage:** author overrides live in the validated namespaced JSON bag
  `entries.fields.ext.seo.*` (ADR-022 §2). The registered, validated shape is
  `SeoExtFields` (`src/seo/types.ts`): `title`, `description`, `canonical`, `noindex`,
  `nofollow`, `schemaType`, and the `og*` / `twitter*` overrides. Every field is
  **optional** — absence means "derive". Unregistered keys are rejected at the ADR-022
  write chokepoint; `pluginId='seo'` write-attribution is stamped there for free (ADR-022
  amendment).
- **Field registration is declarative data** (`SeoFieldDecl`) applied to **every content
  type** via the content-type registry (ADR-022 §1) — the Tier-1 half of §1.
- **One queryable field, one expression index.** `noindex` is declared `queryable`, so
  core provisions the ADR-022 §3 partial expression index
  `q_{type}_seo_noindex ON entries(CAST(json_extract(fields,'$.ext.seo.noindex') AS INTEGER), id) WHERE type='{type}'`
  (`SeoExpressionIndexDecl`). This is the only index SEO needs: the sitemap query is
  "published, non-noindex entries per type, keyset-paginated." `CREATE INDEX`/`DROP INDEX`
  only — no DDL authored by the plugin (ADR-003), engine-maintained (zero drift), ports to
  Postgres `jsonb`. Uninstall = `DROP INDEX`, rows untouched.
- **Social images are refs, not URLs.** `ogImage`/`twitterImage` hold a media ref
  (`{assetId}:{transformName}`) or an absolute URL, never a frozen `/m/` URL — internal
  content stores refs (ADR-027 §4); the head renderer resolves the ref to an immutable
  rendition URL at render time via the media surface.

### 3. Site-level settings — `seo.*` definitions in the ADR-028 ledger

Global/workspace SEO configuration (`SeoSettings`) is **not** a new table and **not**
settings-as-entries (ADR-028 killed that: `content.write` reaches agents). It is a set of
`seo.*` **setting definitions** (schemas-as-data) in the ADR-028 Layered Settings Ledger,
resolved `user ?? workspace ?? global ?? default`: `seo.base_url`, `seo.title_template`,
`seo.default_description`, `seo.default_og_image`, `seo.twitter_site`,
`seo.default_robots`, `seo.sitemap_enabled`, `seo.robots_policy` (`SeoSettingKey`). The
ADR-028 core-only subset ships now, so this path is available without waiting on the
plugin-capability-taxonomy gate (the bundled plugin is first-party, so it registers
definitions through core, not the gated plugin path).

### 4. The `page.head` render hook — the theme contract (ADR-020 + ADR-009 §3)

`page.head` is a **filter hook** (ADR-009 §3: extensions must transform a value in-line;
events can't). Contract (`PageHeadHook` in `src/seo/ports.ts`):

- **Seam.** The theme's `<head>` (the `pageShell` in `server/http/site/render.ts`, and
  its Liquid analogue `{% head %}` for Tier-2 themes) carries one injection point. Core,
  at the render seam, builds a **serializable `PageHeadContext`** — `workspaceId`, route,
  contentType, the routing-resolved `canonicalUrl`, siteTitle, locale, active `themeTier`,
  and a **serializable `PageHeadEntryRef`** snapshot of the entry (NOT a live `PostRecord`
  — ADR-024 §3 forbids live objects crossing the surface; the snapshot's identity fields
  are pinned to the real `PostRecord` by the `EntrySnapshotIdentity` compile-time guard).
- **Output is render IR, never HTML strings.** Contributors return `HeadElement[]` —
  tagged serializable descriptors (`title`/`meta`/`og`/`link`/`jsonld`), the ADR-020 §2
  canonical render IR. Core orders by explicit `priority` (ADR-024 §7), dedups by a stable
  `HeadElementKey` (last-writer-wins), **sanitizes**, serializes to `<head>` tags, and
  injects at the seam. A plugin can therefore never inject arbitrary markup — closing the
  same-origin injection surface ADR-020 §2/§6 warns is the largest.
- **The SEO plugin is one contributor.** It emits: templated `<title>`,
  `<meta name=description>`, canonical `<link>`, `robots` meta (when noindex/nofollow),
  the OpenGraph + Twitter card metas, and a `<script type=application/ld+json>` JSON-LD
  block (`kind:"jsonld"`, whose `data` is a validated serialized object). Core and other
  bundled plugins may contribute too (e.g. a feeds plugin's `<link rel=alternate>`).
- **Async fold.** The hook is `async` and returns a Promise (ADR-024 §3) — the renderer
  awaits all contributors. Failure is fail-closed per contributor (ADR-024 §7 / SPEC-005):
  a throwing contributor is dropped with a rendered comment, never 500s the page (matching
  the existing render.ts "a broken theme must not 500" posture).

### 5. JSON-LD, sitemap.xml, robots.txt — derived, core-mediated outputs

- **JSON-LD** is **derived**, type-mapped, not hand-authored in v1: content type →
  schema.org `@type` (`page`→`WebPage`, `post`→`Article`; overridable via
  `fields.ext.seo.schemaType`), plus a minimal `BreadcrumbList` where routing supplies an
  ancestor chain. Emitted as a `HeadElement` of `kind:"jsonld"` (one seam, §4). A per-entry
  raw JSON-LD override editor is **deferred** (§Open / v1-scope).
- **`sitemap.xml`** is generated on demand from the §2 expression-index query over
  published, non-noindex entries per sitemap-eligible type, **plus** any URLs contributed
  by the `seo.sitemap.collect` filter hook (`SitemapCollectHook`) — that hook is how other
  bundled plugins add term/archive/product URLs without SEO knowing their routes. `<lastmod>`
  comes from `entry.updatedAt`. The result is memoized in the `CachePort` under
  `ws:{id}:seo:sitemap` (ADR-007 workspace-prefixed) and **invalidated by outbox events**
  (`entry.published`/`updated`/`unpublished` — `SeoEventSubscriptions`, idempotent per
  ADR-009). A **single sitemap** ships v1; the **sitemap *index*** (>50k URL / 50MB split)
  and news/image/video sitemaps are named deferred seams.
- **`robots.txt`** is derived from `seo.robots_policy` + `seo.sitemap_enabled` (advertises
  the sitemap URL). Per-bot allow/deny rules (`RobotsRule[]`) are storable now; the
  AI-crawler-specific policy management (GPTBot/OAI-SearchBot/PerplexityBot/etc., §22) is
  the deferred AEO seam.
- Both routes are **public, unauthenticated** reads; regenerating/purging the sitemap cache
  is `seo.sitemap.manage` (§6).

### 6. Permissions — flat `seo.*` strings (ADR-021 §3)

Registered in the code-side catalog (`SeoPermission`): `seo.read` (view meta/settings/
analysis), `seo.meta.write` (edit an entry's `fields.ext.seo.*` panel), `seo.settings.manage`
(site-level `seo.*` settings + robots policy), `seo.sitemap.manage` (regenerate/purge the
sitemap cache), `seo.analyze` (run the `analyze_seo` AI tool). Seed-role mapping (ADR-021
§9, non-normative default): `editor` → `seo.read` + `seo.meta.write`; `admin` adds
`seo.settings.manage` + `seo.sitemap.manage` + `seo.analyze`; `owner` `*` covers all. Enforced
at the gateway `authorize()` call; the admin panel and the AI tool share the same handlers
(no back door — §3.5 dogfood rule / ADR-027 INV-6), and agents are delegated principals
(`grant ∩ delegator`, ADR-021 §6).

### 7. No new port (ADR-006 rule-of-two, applied honestly)

The SEO design introduces **no new infrastructure port**. Every extension point is a hook
(§4/§5) and every read is a typed call to an existing lib exposed as a capability handle
(`SeoContentReadCap` over content, `SeoUrlCap` over routing, `SeoSettingsCap` over settings,
`SeoCacheCap` over cache — `src/seo/ports.ts`). None has a second plausible adapter being
built now; elevating any to a swappable port would be the exact speculative-second-adapter
move ADR-006 exists to prevent (the discipline ADR-021 used to reject a PolicyPort). If a
headless client later needs a pluggable sitemap *source* with a real second adapter, the
`seo.sitemap.collect` hook is the seam to promote — not before.

### 8. v1 scope

**IN v1:** per-entry meta fields on all content types (`title`/`description`/`canonical`/
`noindex`/`nofollow`/`schemaType` + OG + Twitter), one `noindex` expression index,
derived type-mapped JSON-LD (WebPage/Article + minimal BreadcrumbList), the `page.head`
render hook (IR descriptors, ordered/deduped/sanitized), single `sitemap.xml`
(query + `seo.sitemap.collect` hook, cached + event-invalidated), `robots.txt` (policy +
sitemap advertise), `seo.*` settings in the ADR-028 ledger, the admin panel descriptor
(per-entry SEO panel + site settings screen), the `analyze_seo` AI tool (registry only;
protocol exposure is Phase-5), flat `seo.*` permissions.

**DEFERRED (each a named seam):**
- **The entire AEO/GEO backlog (`todos.md` §22)** — answer-engine Q&A content model,
  canonical-answer / direct-answer blocks, GEO entity graph, `llms.txt`, per-page `.md`
  mirrors, `data-nosnippet` zones, knowledge-sitemap variants, citation/displacement
  tracking, AI-crawler policy management, content provenance/fingerprinting. This is the
  single largest seam; it builds *on* the v1 JSON-LD/sitemap/meta foundation.
- **Sitemap index** (>50k/50MB split) + news/image/video sitemaps.
- **IndexNow / search-engine ping on publish** — a core-mediated webhook (ADR-024 §1),
  wired to the same outbox events §5 already consumes.
- **hreflang / i18n alternates** — seam via the `i18n` lib (§3.5) and the `link.hreflang`
  field already present on `HeadElement`.
- **Per-entry raw JSON-LD override editor** and arbitrary custom head snippets.
- **Redirects / canonicalization-strategy management** — belongs to the `routing` lib and
  the separate Redirects admin section (`todos.md`), not SEO.
- **Social-preview image generation** — a media transform (ADR-027) seam.

## Consequences

- **Reuses, does not duplicate.** Per-entry meta rides ADR-022 (no tables, one index,
  free write-attribution + revisions); settings ride ADR-028; permissions ride ADR-021;
  URLs ride routing; cache invalidation rides the ADR-009 outbox. The plugin's own new
  surface is small: the derivation logic + the two hooks + the two public routes.
- **The dogfood proves the ABI.** Because SEO touches only the async/serializable ABI and
  reads core solely by handle, it is the concrete evidence that the ADR-024 §3 freeze is
  livable — and the artifact that would validate the Tier-2 `utilityProcess` swap when it
  ships. A privileged core-module SEO would prove nothing.
- **Head injection is safe by construction.** Serializable IR descriptors + core-side
  sanitize/serialize means a head contributor (even a future third-party one) cannot inject
  markup or script — the ADR-020 §2/§6 injection surface stays closed.
- **AEO/GEO is a clean later seam, not a v1 tax.** The v1 core is exactly the classic-SEO
  foundation the §22 answer-engine work presupposes; deferring it costs nothing structural
  and keeps v1 shippable.
- **DX/scope cost, accepted:** the async ABI means head contribution and sitemap generation
  are async folds over `await`ed handles (chattier than a sync in-process read of SQLite);
  accepted as the ADR-024 price. JSON-LD is derived-only in v1 (no raw override) — a real
  limitation for power users, named as a seam.
- **Owes debate + audit.** Solo design-only; no swarm/consensus/audit ran. Not ACCEPTED.

## Open

1. **Sitemap generation cost at scale (unbenchmarked).** The sitemap query rides the
   still-unbenchmarked ADR-022 expression index (ADR-022 Consequences owe a 100k-entry WAL
   benchmark). A full-site sitemap regenerate on a large site could be a heavy read; the
   cache + keyset pagination bound it, but the eager-vs-lazy regeneration policy and the
   index-split threshold are unproven. Do not market "scales" as verified.
- **Cache invalidation granularity.** v1 invalidates the whole `ws:{id}:seo:sitemap` on any
  entry event (simple, correct, possibly wasteful on high-churn sites). Per-type or
  incremental sitemap invalidation is a later refinement, not a v1 contract.
3. **`page.head` seam ownership — flag, not a reopen.** ADR-020 makes the render IR the
   canonical artifact but does not *name* a `<head>`/`{% head %}` injection point in the
   theme contract. This ADR asserts one; if the theme-contract spec (SPEC-004) later defines
   head composition differently, the *mechanism* (IR descriptors, ordered/deduped/sanitized)
   should hold but the seam name may move. Raised as an open question for the theme-contract
   owner — **not** a reopening of ADR-020.
4. **JSON-LD validation depth.** v1 emits derived JSON-LD but does not validate against
   schema.org shape/Rich-Results rules. A validation pass (and the `analyze_seo` tool's rules)
   is designed-for, depth TBD.
5. **Multi-workspace sitemap host.** `seo.base_url` is per-workspace; the `{mediaOrigin}`-style
   question of how a served site advertises its absolute origin is shared with the ADR-027 open
   origin question — the *rule* (per-workspace absolute base) is fixed here.

## Record

Design-only draft by an autonomous Opus 4.8 sweep agent, 2026-07-10, grounded in AGENTS.md,
the ADR index, and the accepted ADRs cited above (esp. ADR-020/022/024/021/028/009/007/012/006/027),
`tovu-v2-design.md` §3.5/§6, and the `todos.md` SEO brief + §22 backlog. Typed interfaces
(`src/seo/types.ts`, `src/seo/ports.ts`) were written and typecheck clean against the real
repo types (full `tsc -p tsconfig.json --noEmit` exit 0; scoped compile exit 0). **No peer
debate and no external audit were run** — both are owed before this ADR can move to ACCEPTED,
along with the ADR-022 sitemap-scale benchmark (Open §1). Companion design report:
`reports/section-designs/20260710-seo-design.md`.

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-032 + round-2. PROPOSED; owes per-ADR audit.
- **Restate ADR-028 as PROPOSED** (drop any "ships now"); sequence SEO settings behind it or ship interim in-code defaults.
- Either register `seo.*` defs via a path a third-party plugin genuinely gets, **or drop the ABI-purity claim** (audit finding).
- **Consume ADR-039 `canonicalUrl`**, which composes from `core/origin` (ADR-040) `canonicalOrigin` — never the raw request host (host-header-injection-proof).
- The `page.head` render seam is owed to the theme-contract owner.
- **Permission namespace:** `admin.seo.manage`.
- **Wave 1 — contingent on ADR-028 reaching ACCEPTED** (028 round-2 re-audit pending) + ADR-039/040 shapes frozen.
