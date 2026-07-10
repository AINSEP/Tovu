# SEO Section Design — Dogfood Bundled Plugin (v1 core)

- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent (design-only; no peer debate, no external audit)
- Companion ADR: `reports/architecture/ADR-032-seo.md` (PROPOSED)
- Typed interfaces: `src/seo/types.ts`, `src/seo/ports.ts` (typecheck clean — see §7)
- Scope: v1 **classic SEO core** only. The AEO/GEO backlog (`todos.md` §22) is a single named later seam.

---

## 1. Competitor-lite orientation

Three reference points, mined lightly (per the sweep's design-only depth budget):

- **WordPress** (`other-repos-specs/wordpress_specs/wp-includes/sitemaps.md`). Core ships
  only XML sitemaps — as a **request-routed provider registry**: `posts`/`taxonomies`/
  `users` providers plus **plugin-added custom providers**, rendered to XML/XSL. Meta
  tags, OpenGraph, JSON-LD, canonical, robots-meta are **not core** — they are the entire
  reason Yoast/RankMath exist. Two lessons: (a) sitemaps are a *contribution registry*, not
  a monolith — my `seo.sitemap.collect` hook is that registry; (b) the meta/cards/schema
  surface is the classic third-party plugin territory, which is exactly why Tovu ships it as
  a **bundled** (replaceable) plugin, not a core library.
- **Payload** (`docs/research/competitor-analysis.md`). Ships an official **`plugin-seo`**
  (per-collection meta fields, title/description, OG) *and a separate `plugin-redirects`*.
  Validates two calls: SEO is a plugin, and **redirects are a different plugin** (Tovu:
  redirects belong to `routing` + the Redirects admin section, not SEO — ADR-032 §8).
  Payload's config-as-code means its SEO fields are declared in TypeScript; Tovu's ADR-022
  registry declares them **as data**, so a non-developer/AI can register SEO fields without a
  deploy — a strict improvement on the same idea.
- **Ghost** (`todos.md` line 601: "SEO + canonical + social cards defaults"). Ghost bakes
  sensible SEO defaults in (canonical, OG/Twitter, structured data) with almost no config —
  the "publisher-first, good defaults, minimal knobs" posture. Tovu mirrors this: every
  `SeoExtFields` field is optional and **derives** from the entry + site defaults when absent;
  the SEO panel is progressive-disclosure, not a required chore.

Takeaway: the market splits SEO into (1) per-entry meta + cards + schema (Yoast/Payload
`plugin-seo`/Ghost defaults) and (2) sitemaps/robots (WP core provider registry). Tovu unifies
both in one bundled plugin, reuses the content/settings machinery for (1), and uses a hook as
the provider registry for (2).

## 2. Tier rationale (§3.5 placement)

`tovu-v2-design.md` §3.5 **already places SEO as a tier-3 bundled module** (`plugins/seo`)
and §6 makes it the Phase-4 dogfood. This design accepts and justifies that rather than
re-deciding it:

- **§3.5 placement rule, both prongs met.** Tier-3 = "anything a meaningful fraction of sites
  disable or replace." SEO is *replaced* (Yoast/RankMath/Payload-seo/Ghost-native are a whole
  market) and *disabled* (headless/API sites need none of it). Tier-2 is "anything ≥80% of
  sites need and plugins must build *on*" — SEO fails the "build on" test: nothing else builds
  on SEO; SEO builds on content/routing/settings.
- **Two capability-tier faces (ADR-024).** The bundled artifact ships **Tier-3 trusted**
  (in-process, first-party, never marketplace-listed). But its architecture is split:
  - the **per-entry meta half is Tier-1-declarative** (pure content-type field registrations);
  - the **render/sitemap/robots half is code that touches only the frozen async +
    serializable ABI** (no fs/network/DB-handle/live-objects) — `todos.md` line 188 names SEO
    as precisely this "pure computation" ABI-conformance test.
- **Why the split matters (the dogfood payoff).** Because the code half is ABI-clean, the SEO
  plugin is the concrete proof that ADR-024 §3's freeze is livable, and the artifact that would
  validate the Tier-2 `utilityProcess` sandbox swap (ADR-024 §4) with **zero code change**. A
  privileged core-module SEO would prove nothing about the plugin ABI. This is the whole point
  of dogfooding it.

## 3. The design in prose

**Per-entry metadata is content-model reuse, not a new subsystem.** SEO owns no operational
tables (contrast ADR-027 media, which owns blob/rendition sidecars — SEO owns no bytes, only
derivation). Author overrides live in the ADR-022 validated JSON bag `entries.fields.ext.seo.*`
(`SeoExtFields`: title, description, canonical, noindex, nofollow, schemaType, og*, twitter*),
registered declaratively on **every** content type and validated at the write chokepoint (which
also stamps `pluginId='seo'` attribution and a revision, for free). Everything is optional and
**derives** when absent — the Ghost posture. Social images are stored as media **refs**, not
`/m/` URLs (ADR-027 §4), resolved at render time.

**Exactly one field is queryable.** The sitemap query is "published, non-`noindex` entries per
type, keyset-paginated." So `noindex` alone is declared `queryable`, earning the ADR-022 §3
partial expression index `q_{type}_seo_noindex … WHERE type='{type}'` — `CREATE INDEX` only, no
plugin DDL (ADR-003), engine-maintained, `DROP INDEX` on uninstall leaves rows intact, ports to
Postgres jsonb. No other SEO field needs an index.

**Site-level config is the settings ledger, not a table.** `SeoSettings` (base_url,
title_template, default_description, default_og_image, twitter_site, default_robots,
sitemap_enabled, robots_policy) are `seo.*` **setting definitions** in the ADR-028 Layered
Settings Ledger, resolved workspace-scoped. ADR-028 explicitly killed settings-as-entries
(`content.write` reaches agents → a settings-as-entry would let any agent flip site security),
so SEO settings ride the dedicated ledger the core-only ADR-028 subset already ships.

**The `page.head` hook is the theme render contract.** A filter hook (ADR-009 §3 — extensions
must transform a value in-line). Core, at the render seam (`server/http/site/render.ts`'s
`pageShell`, and `{% head %}` for Tier-2 Liquid themes), builds a **serializable**
`PageHeadContext` — including a `PageHeadEntryRef` snapshot of the entry (never a live
`PostRecord`, ADR-024 §3; the snapshot's identity is pinned to the real record by the
`EntrySnapshotIdentity` compile-time guard) and the routing-resolved `canonicalUrl`. Contributors
return `HeadElement[]` — **render-IR descriptors** (`title`/`meta`/`og`/`link`/`jsonld`), the
ADR-020 §2 canonical IR, **never raw HTML**. Core orders by explicit priority (ADR-024 §7), dedups
by stable key, **sanitizes**, serializes, and injects. This closes the same-origin head-injection
surface ADR-020 §2/§6 flags as the largest — a contributor physically cannot emit arbitrary markup
or script. The SEO plugin is one contributor (title/description/canonical/robots-meta/OG/Twitter/
JSON-LD); core and other bundled plugins may add more. The fold is async and fail-closed per
contributor (a thrown handler is dropped with a comment, never a 500 — matching render.ts today).

**JSON-LD / sitemap / robots are derived, core-mediated declarative outputs.** JSON-LD is
type-mapped (page→WebPage, post→Article, minimal BreadcrumbList; `schemaType` override), emitted
through the same `HeadElement` seam. `sitemap.xml` is generated from the `noindex` expression-index
query **plus** URLs contributed by the `seo.sitemap.collect` hook (the WP-provider-registry analog:
term/archive/product pages arrive from other plugins), memoized under `ws:{id}:seo:sitemap`
(ADR-007), invalidated by `entry.published`/`updated`/`unpublished` outbox events (idempotent,
ADR-009). `robots.txt` is derived from the robots policy + advertises the sitemap. Both routes are
public reads; cache purge is `seo.sitemap.manage`.

**No new port.** Every extension is a hook; every read is a typed call to an existing lib exposed
as a capability handle (content/url/settings/cache). ADR-006 rule-of-two is not met by any of them
(no real second adapter today), so promoting any to a port would be the speculative-second-adapter
move ADR-006 exists to prevent — the same reasoning ADR-021 used to reject a PolicyPort. The
`seo.sitemap.collect` hook is the seam to promote *if* a pluggable sitemap source with a real second
adapter ever lands.

## 4. Alternatives considered

- **SEO as a tier-2 core library.** Rejected: fails the §3.5 "plugins build on it" test and the
  "meaningful fraction disable/replace" test; and it would forfeit the dogfood value (a core
  module can't prove the plugin ABI). Promotion core←plugin is cheap later if evidence appears;
  demotion is a breaking change — start as the plugin.
- **New `seo_meta` table (one row per entry).** Rejected: ADR-022's whole thesis is that
  per-entry extension data belongs in the validated namespaced JSON bag with expression indexes,
  *not* satellite meta tables (the WordPress `postmeta` sin). A table would also duplicate
  revisions/attribution the ext bag gets free. No table is needed.
- **Settings-as-entries for site SEO config.** Rejected by ADR-028's authority-surface argument
  (`content.write` reaches agents). Use the ledger.
- **Raw-HTML `page.head` contributions (return an HTML string).** Rejected: reopens the ADR-020
  §2/§6 same-origin injection surface (the largest). IR descriptors + core sanitize/serialize is
  the only safe shape and keeps head output IR-canonical across theme tiers.
- **Sitemap as a core route with a hardcoded post/page provider.** Rejected in favor of the
  `seo.sitemap.collect` hook — matches WP's extensible provider registry and lets bundled plugins
  contribute URL sets without SEO knowing their routes.
- **Synchronous in-process head/sitemap reads** (cheaper over sync SQLite). Rejected: violates
  ADR-024 §3 (async-only) and would make the plugin ABI-dirty, destroying the dogfood proof and the
  Tier-2-swap property. Accept the async chattiness.
- **Bundle redirects into SEO** (Yoast does; users expect it). Rejected: redirects belong to
  `routing` + the separate Redirects section (Payload splits them too). Kept out of scope.
- **Author JSON-LD by hand per entry in v1.** Deferred: derived type-mapped JSON-LD covers the
  90% case; a raw override editor is a named seam, not a v1 requirement.

## 5. Implementation Proposal (phased)

### Phase A — declarative meta (Tier-1-shaped, no code path)
1. `plugins/seo` manifest + `SeoFieldDecl[]` registering `fields.ext.seo.*` on all content types
   (ADR-022 registry, validated-on-write).
2. One `SeoExpressionIndexDecl` → core provisions `q_{type}_seo_noindex` (ADR-022 §3).
3. `seo.*` `setting_definitions` in the ADR-028 ledger (`SeoSettings` schema).
4. Register the `seo.*` permission catalog (ADR-021 §3) + seed-role mapping.
5. Admin: the per-entry SEO panel descriptor (edits the ext bag, gated `seo.meta.write`) + the
   site SEO settings screen (gated `seo.settings.manage`) — rendered by both shells.
*Exit: SEO fields validate on write, appear in the panel, `noindex` is indexed. Zero core changes.*

### Phase B — resolution + the page.head hook
6. The resolver: effective `SeoMeta` = author overrides ▸ site defaults ▸ derived-from-entry
   (title template, excerpt→description, routing→canonical, type→schema `@type`).
7. Register the `page.head` filter hook contributor (`PageHeadHook`) emitting `HeadElement[]`;
   wire the render seam (`pageShell` `<head>` + `{% head %}`) to fold/order/dedup/sanitize/inject.
8. Derived JSON-LD (WebPage/Article/BreadcrumbList) as a `kind:"jsonld"` head element.
*Exit: a published page renders correct title/description/canonical/OG/Twitter/JSON-LD in `<head>`,
sanitized, across declarative + templated themes.*

### Phase C — sitemap + robots + invalidation
9. `buildSitemap` over the `noindex` expression-index keyset query + the `seo.sitemap.collect`
   hook; memoize under `ws:{id}:seo:sitemap`.
10. `SeoEventSubscriptions` → invalidate on entry publish/update/unpublish (idempotent).
11. Public `sitemap.xml` + `robots.txt` route handlers (unauthenticated reads); `seo.sitemap.manage`
    for cache purge.
*Exit: `sitemap.xml` lists published non-noindex URLs with `<lastmod>`, refreshes on publish;
`robots.txt` advertises it.*

### Phase D — AI tool
12. `analyzeEntry` → register the `analyze_seo` AI tool (ADR-014 registry; protocol exposure is
    Phase-5). Same handler as the admin lint (no back door).
*Exit: `analyze_seo` returns a score + issues over the resolved meta; blocked without `seo.analyze`.*

### `src/` modules to add (final layout under `plugins/seo/`, or `src/seo/` in the current single-tree repo)
```
src/seo/
  types.ts          # DONE (this sweep): domain types + IR + compile guard
  ports.ts          # DONE (this sweep): hook + capability-handle + read-surface contracts
  resolve.ts        # (Phase B) overrides ▸ defaults ▸ derived → SeoMeta          [logic, later]
  head.ts           # (Phase B) SeoMeta → HeadElement[]  (the page.head contributor)
  jsonld.ts         # (Phase B) content type → schema.org graph
  sitemap.ts        # (Phase C) query + collect-hook fold → SitemapEntry[] → XML
  robots.ts         # (Phase C) SeoSettings → robots.txt
  register.ts       # (Phase A) field decls, index decl, settings defs, permissions, hooks, subs
  analyze.ts        # (Phase D) SeoMeta → SeoAnalysis  (analyze_seo tool)
```

### Schema / DDL sketch
- **No new tables.** Per-entry meta = `entries.fields.ext.seo.*` (ADR-022). Site config =
  ADR-028 `setting_definitions` + `setting_values_*` rows under `seo.*`. Both use existing DDL.
- **The only core-provisioned DDL** (engine-run, not plugin-authored — ADR-003/022 §3), per
  sitemap-eligible content type:
  ```sql
  CREATE INDEX q_{type}_seo_noindex
    ON entries(CAST(json_extract(fields,'$.ext.seo.noindex') AS INTEGER), id)
    WHERE type = '{type}';
  -- uninstall: DROP INDEX q_{type}_seo_noindex;  (rows untouched)
  ```

### Permission strings (ADR-021 flat catalog)
`seo.read` · `seo.meta.write` · `seo.settings.manage` · `seo.sitemap.manage` · `seo.analyze`.

### Hooks & events
- Filter hooks: **`page.head`** (`PageHeadContext → HeadElement[]`), **`seo.sitemap.collect`**
  (`SitemapCollectContext → SitemapEntry[]`). Async, explicit priority, fail-closed (ADR-024 §7).
- Outbox subscriptions: `entry.published` / `entry.updated` / `entry.unpublished` → sitemap-cache
  invalidation (idempotent, ADR-009 §2).

## 6. v1-scope cut + named deferred seams

**IN v1:** per-entry meta on all types (title/description/canonical/noindex/nofollow/schemaType +
OG + Twitter), one `noindex` expression index, derived JSON-LD (WebPage/Article + BreadcrumbList),
the `page.head` render hook (IR, ordered/deduped/sanitized), single `sitemap.xml` (query +
collect-hook, cached + event-invalidated), `robots.txt`, `seo.*` settings, admin panel + site
settings screen, `analyze_seo` tool (registry only), flat `seo.*` permissions.

**DEFERRED — named seams:**
- **AEO/GEO backlog (`todos.md` §22)** — the single largest seam: answer-engine Q&A content model,
  direct-answer/canonical-answer blocks, GEO entity graph, `llms.txt`, per-page `.md` mirrors,
  `data-nosnippet` zones, knowledge-sitemap variants, citation/displacement tracking, AI-crawler
  policy (GPTBot/OAI-SearchBot/PerplexityBot/…), content provenance/fingerprinting. Builds *on* the
  v1 JSON-LD/sitemap/meta foundation — that's why classic core ships first.
- **Sitemap index** (>50k/50MB split) + news/image/video sitemaps.
- **IndexNow / search-engine ping on publish** — core-mediated webhook (ADR-024 §1) on the same
  outbox events Phase C already consumes.
- **hreflang / i18n alternates** — via the `i18n` lib; `HeadElement.link.hreflang` is already present.
- **Per-entry raw JSON-LD override editor** + arbitrary custom head snippets.
- **Redirects / canonicalization strategy** — `routing` + the Redirects section, not SEO.
- **Social-preview image generation** — an ADR-027 media transform seam.

## 7. Typed-interface compile status

`src/seo/types.ts` + `src/seo/ports.ts` were written as interfaces/types only (no logic) and
import the **real** repo types (`../core/ports`, `../features/post/post`, `../features/theme/theme`).

- Full project typecheck: `npx tsc -p tsconfig.json --noEmit` → **exit 0** (clean; the new files are
  in `src/**/*.ts`, so this compiles them against the whole real tree — no pre-existing errors to
  isolate around).
- Scoped compile of only the two new files (`--strict --skipLibCheck` + repo compiler flags) →
  **exit 0**.
- `EntrySnapshotIdentity = Pick<PostRecord, "id"|"workspaceId"|"slug"|"title"|"status">` is a
  deliberate compile-time guard: the serializable head snapshot is pinned to the live `PostRecord`,
  so a future rename/removal of a content identity field breaks this typecheck instead of drifting.

## 8. Open questions (for the human's morning audit)

1. **Sitemap scale is unbenchmarked.** Rides the still-unbenchmarked ADR-022 expression index (owes
   a 100k-entry WAL benchmark). Eager-vs-lazy regeneration policy + index-split threshold unproven.
2. **`page.head` seam ownership.** ADR-020 makes the render IR canonical but doesn't *name* a
   `<head>`/`{% head %}` injection point in the theme contract. ADR-032 asserts one; SPEC-004 (theme
   contract) may place head composition differently. Flagged, **not** a reopen of ADR-020.
3. **Cache invalidation granularity** — v1 blows the whole sitemap cache on any entry event; per-type
   incremental invalidation is a later refinement.
4. **JSON-LD validation depth** — derived but unvalidated against schema.org/Rich-Results in v1.
5. **Multi-workspace absolute origin** (`seo.base_url`) shares the open `{mediaOrigin}` question with
   ADR-027; the *rule* (per-workspace absolute base) is fixed, the delivery mechanism is not.

**Owed before ACCEPTED:** peer debate + external audit (this was solo/design-only), plus the ADR-022
sitemap-scale benchmark (OQ-1).
