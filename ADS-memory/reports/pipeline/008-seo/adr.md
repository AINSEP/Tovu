# ADR-PIPE-008: SEO (Per-Entry Meta, page.head, Sitemap/Robots) — Implementation Architecture

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; Red-Team has NOT run for SPEC-008 — accepted with that acknowledged gap, reversible if TDD/Programmer surfaces a real problem)
- Date: 2026-07-13
- Spec: SPEC-008 v1.0.0 (hash: sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128)
- Author: Software Architect Agent

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Sitemap XML / `robots.txt` are two small, fixed-shape flat-text formats built by direct string templating (feature.spec.md Constitution Compliance already argues this; confirmed on inspection — no XML/robots library is warranted for two formats this narrow). JSON-LD is plain `JSON.stringify` over a validated object graph. The one new settings-ledger schema variant (`{type:"json"}`, see Decision §3) is not a library question — it is a vocabulary extension to an existing in-repo module. |
| II — Test-First | COMPLIES | No SEO adapter/route/UI code exists yet (`src/seo/{ports,types}.ts` are design-only stubs with zero call sites). TDD Agent certifies failing tests from SPEC-008's ACs/INVs/ECs before the Programmer writes implementation. |
| III — Simplicity Gate | COMPLIES | Every module below traces to a REQ (see Module/Service Boundaries). The one vocabulary extension this ADR makes to a shared module (`SettingValueSchema` gains `{type:"json"}`, Decision §3) is scoped to the one concrete field (`robotsRules`) that genuinely cannot be scalar-decomposed — `defaultRobots` IS decomposed into two booleans specifically to avoid a broader vocabulary change than necessary. |
| IV — Anti-Abstraction Gate | COMPLIES | No new port is introduced anywhere in this design. Every capability SEO needs is a typed call to an already-ported existing module (`post` via `PostRepoPort`, `routing` via `urlFor`, `settings` via `getEffective`/`write-service`, `media` via its existing read repos, `identity` via `authorize()`) — matching ADR-032 §7's own "no new port" decision, now verified against the real code rather than assumed. The one new registry this ADR adds (`page.head` contributor registry, Decision §2) is an ordered in-module array with a typed register function, the same shape `routing.ts` already uses for `registerResolvePhase`/`registerNamedRoute` — not a port, and not gated by rule-of-two (hooks/registries are exempt per ADR-009 §3, same treatment `routing.ts` already received). |
| V — Integration-First Testing | COMPLIES | Every P1 AC is verified at a real boundary: the 6 admin HTTP routes, the 2 public HTTP routes (`/sitemap.xml`, `/robots.txt`), or the real `pageShell()`/`renderSite()` render path for `page.head` (AC-10/11/31). |
| VI — Security-by-Default | EXCEPTION (standing v1, per Constitution Art. VI) | Same standing exception every other admin section carries — no full auth layer yet, dev-auth session principal stands in. `admin.seo.manage` still gates every write/admin-read route (INV-06). `sitemap.xml`/`robots.txt` are deliberately public (REQ-08/09), a scope decision, not an instance of the standing gap. |
| VII — Spec Integrity | COMPLIES | This ADR and all downstream artifacts cite SPEC-008 v1.0.0, hash `sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128`. |
| VIII — Observability | COMPLIES | Every write path emits a structured error per `errors.spec.md` §1/§2. The sitemap-cache-invalidation path rides the existing outbox mechanism (`OutboxPort`/`EventBusPort`, already wired in `RouteDeps`) — this ADR's Decision §5 is what actually makes that dependency real (see Brownfield/Migration Mapping). |

No unjustified EXCEPTION rows. Complexity Justification table has one entry (the settings schema vocabulary extension), included for auditability even though it is not a violation (see below).

## Research Summary

- Research artifact: N/A — no library, framework, or persistence-mechanism choice is open, confirmed on inspection. Persistence is Drizzle/SQLite (ADR-015, existing `posts` table); the settings ledger is ADR-028/SPEC-007 (existing, already implemented); routing is ADR-039 (existing, already implemented); authorization is ADR-021's `authorize()` (existing). Every "how do I build this" question this ADR answers is a reuse-vs-extend call against real, already-implemented code, not a technology selection — see Decision §1–§7 below, each grounded in an actual file read during this pass, not the ADR-032 stub's assumptions.

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS (`validate_spec_package.py --phase preflight`, exit 0, re-run 2026-07-13 during this Software Architect pass against the recorded spec hash)
- Spec hash verified at: 2026-07-13 (provider-local validator, `--phase spec --update-hash`, per `pipeline-state.md`)
- Red-Team status and artifact: NOT YET RUN (per `pipeline-state.md` `red_team_status`) — this ADR proceeds per Coordinator directive that FEAT-008 is dispatched straight to Software Architect (SPEC-008's `spec-dod.md` Sign-Off Block shows Coordinator sign-off with the 4 flagged deviations reviewed and concurred; Red-Team is a separate, not-yet-run stage this ADR does not stand in for. Flagged, not silently assumed away).
- System Blueprint status and artifact: Not produced for this feature (no macro-topology change — SEO is a new bundled-plugin-shaped feature module inside the existing modular-monolith server, matching the precedent set by ADR-PIPE-007 for Settings).
- CodeBase Analyzer reports consumed: None formal; this ADR performed direct source inspection of `src/seo/{ports,types}.ts`, `src/routing/{ports,types,routing}.ts`, `src/origin/{ports,origin}.ts`, `src/features/post/post.ts`, `src/infra/db/schema.ts`, `src/identity/permissions.ts`, `src/features/settings/{settings,write-service,ports,types,migration}.ts`, `src/server/http/site/render.ts`, `src/server/routes/site/pages.ts`, `src/server/routes/types.ts`, `src/server/app.ts`, `src/media/{ports,rendition-service}.ts`, `src/core/ports.ts`, `apps/admin/src/sections/{Appearance,PostEditor}.tsx`, and `src/server/routes/admin/{presentation/get,settings/get-effective}.ts` to ground every decision below in the real repo rather than the ADR-032 stub's assumptions.
- Reverse-spec artifacts consumed: None (SPEC-008 is brownfield via `spec-manifest.md`'s Brownfield References section, not a reverse-spec extraction).
- Validator result or waiver: PASS, no waiver needed (python3 available).

## Context

SPEC-008 is APPROVED and Planning-Preflight-PASSED. ADR-032 already made the product-level architecture decisions (bundled dogfood plugin shape, `fields.ext.seo.*`-style data model — later corrected to `posts.seo_ext_json` by the spec, `page.head` as the theme render hook, derived sitemap/robots, flat permissions — later corrected to `admin.seo.manage` by the spec). SPEC-008's `state.spec.md` §0/§5 already resolved 4 concrete drift points between ADR-032's stub-writing pass and the real codebase (storage attachment point, permission namespace, `seo.base_url` retirement, `RobotsPolicy` stored-vs-computed split). This ADR's job, per the Software Architect mandate, is the next layer down: turn the spec into concrete module boundaries or file paths inside *this* codebase, using the actual code (not the ADR-032 stub's assumptions about what exists).

Direct inspection of the real repo during this pass surfaced **five further concrete gaps** the spec package's own brownfield analysis did not catch (the spec's 4 documented deviations plus these 5 make 9 total real vs. assumed drift points this ADR resolves):

1. **No `CachePort` exists anywhere in this codebase.** `src/seo/ports.ts`'s `SeoCacheCap` doc comment says it is "backed by the core `CachePort`" — no such port exists in `src/core/ports.ts` or anywhere else. REQ-10/AC-22/23/EC-08/INV-08 need a real cache.
2. **No `entry.published`/`entry.updated`/`entry.unpublished` outbox events exist.** `feature.spec.md`'s own Dependencies table lists these as an already-available dependency SEO merely subscribes to. In reality, `src/features/post/post.ts`'s `updatePost()` emits no domain events at all — this is a P1 AC-blocking gap (AC-22/AC-23), not a documentation nit.
3. **The settings ledger's `SettingValueSchema` is deliberately scalar-only** (`string | number | boolean | enum` — `src/features/settings/types.ts`'s own doc comment calls this out as an intentional Article III boundary). SEO's `seo.default_robots` (object) and `seo.robots_policy` (array of objects) do not fit.
4. **No `page.head` injection seam exists in the real renderer.** `src/server/http/site/render.ts`'s `pageShell()` builds a fixed `<head>` with a hardcoded `<title>` and nothing else — there is no hook, no registry, no seam of any kind. ADR-032's own Open item 3 explicitly flags this as unresolved and defers it to "the theme-contract owner." No other spec has claimed that role; this ADR does.
5. **No media-ref-to-URL resolution helper exists** for `ogImage`/`twitterImage` (EC-07). `src/media`'s only rendition-resolution function (`resolveMediaRendition`) serves bytes for the `/m/` route; nothing turns an `{assetId}:{transformName}` ref into a URL string for embedding elsewhere.

Each is resolved concretely below (Decision §2, §3, §5, §8) rather than left as an ambiguity for TDD/Programmer to guess at.

## Decision

Build SEO as a new `src/seo/` feature module (filling in the existing design-only stub) that: (a) stores per-entry overrides on the new `posts.seo_ext_json` column and writes them through the existing `PostRepoPort` (no new port); (b) resolves effective meta via one pure evaluator consumed identically by the admin preview, the public render, and `analyzeEntry` (REQ-05); (c) registers itself as the sole v1 contributor to a new, render-seam-owned `page.head` registry that this ADR adds to `src/server/http/site/`; (d) stores site-level settings as `site.seo.*` definitions in the existing ADR-028 ledger, with `robotsRules` carried by one new scalar-adjacent `{type:"json"}` schema variant added to that ledger; (e) maintains an in-module, workspace-keyed sitemap cache (no new `CachePort`) invalidated by three outbox events this ADR adds to `features/post`'s existing write path; (f) resolves `ogImage`/`twitterImage` media refs to URLs via a small read-only helper over `media`'s existing repos.

**Pattern(s) selected:** Vertical feature-module slice (mirrors `src/features/settings/`, `src/identity/`) with zero new hexagonal ports — every dependency is consumed through an already-ported existing module. Not a new architectural pattern; this ADR applies the repo's existing default to a new feature, exactly as ADR-PIPE-007 did for Settings.

### 1. Module home and boundaries

`src/seo/` becomes a real feature module (filling the existing `ports.ts`/`types.ts` stubs), following the same file-per-concern shape as `src/features/settings/`. It depends on `post` (repo read/write), `routing` (`urlFor`/canonical URL), `settings` (`getEffective`/write-service), `media` (read-only rendition lookup), and `identity` (`authorize()`, permission registration) — the same dependency shape ADR-032 §7 already committed to, now verified against real ports instead of assumed ones.

### 2. The `page.head` seam — owned by the render layer, not by SEO

ADR-032's Open item 3 names this exact gap and defers seam ownership to "the theme-contract owner." This ADR takes that role: add `src/server/http/site/page-head.ts`, a small core-owned ordered registry (same shape as `routing.ts`'s `phaseRegistry`/`namedRoutes` — an in-module array + typed `register`/`fold`/`reset-for-tests` surface, not a port, not an open ADR-009 plugin hook with a public registration path). It owns:

- `registerPageHeadContributor(hook: PageHeadHook): void` — core-only registration, called once at composition-root boot (mirrors `registerResolvePhase`).
- `foldPageHead(ctx: PageHeadContext): Promise<HeadElement[]>` — awaits every registered contributor sorted by ascending `priority` (behavior.spec.md §2.1), drops (does not rethrow) a throwing contributor's output (REQ-16/EC-06 — the "existing renderer posture" AC-31/EC-06 refer to is this function's own fail-closed-per-contributor fold, generalizing the same "a broken theme must not 500" principle `renderSite`'s Liquid try/catch already applies elsewhere in this file), and dedups by `HeadElementKey` with last-writer-wins-by-priority + later-registration-wins tie-break (behavior.spec.md §5/§6.1).
- `serializeHeadElements(elements: HeadElement[]): string` — turns the final `HeadElement[]` into actual `<head>` tag markup (the one place raw strings are produced from IR — INV-03's enforcement point), escaping every attribute/text value (reuses `render.ts`'s existing `escapeHtml`).

`render.ts`'s `pageShell()` changes to accept a pre-serialized head-elements string and splice it after the existing fixed tags, and to suppress its own hardcoded `<title>` when the folded elements already contain a `kind:"title"` element (the dedup rule guarantees at most one). `routes/site/pages.ts` changes to build a `PageHeadContext` (workspaceId, route, contentType, a `PageHeadEntryRef` snapshot built from the `PostRecord`, `canonicalUrl` from `routing.urlFor`, siteTitle, themeTier) and call `foldPageHead()` before `renderSite()`. SEO's own contributor is registered once at `server/app.ts` boot, alongside the other composition-root wiring.

### 3. Settings — `site.seo.*` definitions, one new schema vocabulary variant

`NAMESPACE_FENCE` in `src/features/settings/settings.ts` requires a `site`-owned (workspace-scoped) definition's namespace to start with `site.`, not bare `seo.` as `feature.spec.md`/`state.spec.md`/ADR-032 write it informally. This ADR registers the 7 stored settings as **`namespace: "site.seo"`**, `ownerKind: "site"`, `scopes: SCOPE_BIT.workspace` only (no global/user layer — the spec has no per-user SEO default), `workspaceId` = the real workspace id:

| Spec key | Registered `key` | Schema |
|---|---|---|
| `titleTemplate` | `title_template` | `{type:"string"}` |
| `defaultDescription` | `default_description` | `{type:"string", nullable:true}` |
| `defaultOgImage` | `default_og_image` | `{type:"string", nullable:true}` |
| `twitterSite` | `twitter_site` | `{type:"string", nullable:true}` |
| `defaultRobots.noindex` | `default_robots_noindex` | `{type:"boolean"}` — **decomposed**, see below |
| `defaultRobots.nofollow` | `default_robots_nofollow` | `{type:"boolean"}` — **decomposed** |
| `sitemapEnabled` | `sitemap_enabled` | `{type:"boolean"}` |
| `robotsRules` | `robots_rules` | `{type:"json"}` — **new schema variant**, see below |

`defaultRobots` is deliberately decomposed into two booleans (zero ledger changes needed) rather than reaching for the new `json` variant, keeping that extension's footprint to the one field that genuinely cannot be scalar-decomposed. `robotsRules` (a variable-length array of `{userAgent, allow?, disallow?}`) needs `{type:"json", nullable?: boolean}` added to `SettingValueSchema` (`src/features/settings/types.ts`) with one matching `case "json": return true;` branch in `validateValueAgainstSchema` (`src/features/settings/settings.ts`) — the ledger schema only asserts "this is a value", not its internal shape; SEO's own write-path validator (mirroring how `titleTemplate`'s `%s`-count rule already lives in SEO's validator, not the ledger's schema) checks the 50-rule max and per-rule shape before ever calling `set()`. This is additive and backward-compatible — no existing definition's schema changes.

SEO registers its 7 definitions once at boot via an idempotent `ensureSeoSettingDefinitions()` (mirrors `migration.ts`'s `ensureCoreDefinition`/`ensureThemeDefinitions` skip-if-registered pattern exactly), exposed to routes as a `seoReady: Promise<void>` on `RouteDeps`, mirroring the existing `settingsReady` fire-and-forget convention.

### 4. Per-entry storage and write chokepoint — the existing `PostRepoPort`, no new port

`posts.seo_ext_json TEXT` (nullable) is added to the `posts` Drizzle table. The per-entry SEO write (`setEntrySeoOverrides`) is its own small chokepoint function in `src/seo/write-service.ts`: `authorize("admin.seo.manage")` → validate (registered-key-only, per-field length/URL-scheme checks) → `postRepo.findById` → merge the patch into the existing (or empty) `seo_ext_json` → `postRepo.save()` (bumping `version`, per `state.spec.md` §3). No new port: `PostRepoPort` already has `findById`/`save`, already rule-of-two (`repo.memory.ts` + `repo.sqlite.ts`). `getEntryMeta`/`analyzeEntry`/`renderHead` reads go through the same `postRepo.findById`.

### 5. Sitemap cache — an in-module Map, invalidated by outbox events this ADR adds to `post`

No `CachePort` exists in this codebase and none is warranted for a single workspace-keyed string value with no other consumer today (introducing a `CachePort` now for one caller would itself be a rule-of-two violation in the other direction — a port with a hypothetical, not concrete, second adapter). `src/seo/sitemap.ts` owns a private `Map<string, string>` keyed `ws:{workspaceId}:seo:sitemap` (INV-08), with `buildSitemap`/`buildRobots` reading through it and `regenerateSitemapCache`/`invalidateSitemapCache` writing/clearing it.

Cache invalidation needs real signals. `src/features/post/post.ts`'s `updatePost()` currently emits no events at all. This ADR extends it (additive — `UpdatePostDeps` gains an optional... no, required `outbox: OutboxPort`, since every real caller already has one available on `RouteDeps`) to compare `existing.status` vs. the incoming `input.status` and enqueue exactly one of `entry.published` / `entry.updated` / `entry.unpublished` on the transitions that matter for a public, indexable surface:

| Existing status | New status | Event emitted |
|---|---|---|
| not `published` | `published` | `entry.published` |
| `published` | `published` (edited, stays published) | `entry.updated` |
| `published` | not `published` | `entry.unpublished` |
| not `published` | not `published` | none (never sitemap-eligible either side) |

`server/app.ts` subscribes SEO's three `SeoEventSubscriptions` handlers (idempotent per ADR-009) to these event names, invalidating the workspace's sitemap cache entry. **A per-entry SEO override write that changes `noindex`/`canonical` also invalidates the same cache key directly** (synchronous call from `write-service.ts`, not an outbox round-trip) — an override write is not an `entry.*` event, but it can still change sitemap eligibility (INV-04), so it must not wait for the next unrelated content event.

### 6. `ogImage`/`twitterImage` resolution — a small read-only helper over existing `media` repos

`src/seo/media.ts` adds `resolveSeoImageRef(ref, deps): Promise<string | undefined>`: if `ref` already looks like an absolute URL, pass through; otherwise parse the `{assetId}:{transformName}` ref and look up the latest registered transform version via the already-existing `MediaRepoPort`/`AssetRenditionRepoPort`/`TransformDefinitionRepoPort` (read-only, no new port) to compose the frozen `/m/{assetId}/{transformName}.v{version}/{slug}.{ext}` URL; returns `undefined` (field omitted, EC-07) on any lookup miss (deleted asset, unregistered transform) rather than throwing. **EC-07's original "and on an ungenerated rendition" clause was overturned 2026-09-05 — see Amendments below.**

### 7. `seo.sitemap.collect` (OQ-01) and the expression index (OQ-02) — resolved

**OQ-01:** `SitemapCollectHook`'s registry is wired as a real, empty, in-module ordered array (same shape as `page.head`'s registry) at v1 — declared and foldable, zero real registrants, exactly matching `feature.spec.md` Scope's own "no real second implementer" statement. This is a live-but-empty registry, not a dead stub — a future taxonomy plugin has a real seam to call into without a second architecture pass.

**OQ-02:** No bespoke `CAST(json_extract(...))` partial expression index ships in v1. The sitemap query filters `status='published'` at the SQL layer (already covered by the existing `idx_posts_workspace` index) and filters `noindex` in application code over the returned rows. This matches ADR-032's own Open §1 disclosure ("unbenchmarked at scale... do not market 'scales' as verified") — building a bespoke SQLite expression index for an unbenchmarked, small-scale v1 dev deployment is complexity this spec has no NFR requiring. Named as a future optimization trigger (Re-evaluation Triggers below), not a v1 requirement.

### 8. Permission

`admin.seo.manage` is registered once in `src/identity/permissions.ts`'s existing `registerPermission()` call block (same mechanism `navigation.manage`/`integration.manage` already use) — a single new catalog entry, gating all 6 admin routes (both reads and writes, matching the `theme.set`/`admin.redirects.manage` single-permission-per-domain precedent `api.spec.md` §2 already cites).

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: `src/seo/` is a vertical feature slice, matching every existing feature module's shape. No new hexagonal seam is introduced anywhere — every dependency is consumed through an already-ported existing module, which is the *simpler* choice here, not a compromise (Article IV). The admin UI stays two flat files (`Seo.tsx` site-settings screen + a panel embedded in the existing `PostEditor.tsx`), matching `Appearance.tsx`'s convention.

## Rationale

Map the decision to the system drivers:
- **Driver: ADR-032 was written against an assumed codebase state (generic `entries` model, a `CachePort`, existing outbox events, an existing `page.head` seam) that does not match reality** → addressed by grounding every dependency in the actual current code (Decision §1–§6) instead of inheriting the stub's assumptions, the same discipline `state.spec.md` §0/§5 already applied to the 4 documented deviations.
- **Driver: REQ-10's cache-invalidation contract (AC-22/23, P1) has no real event source today** → addressed by the smallest possible extension to `post`'s existing write path (Decision §5) rather than inventing a parallel notification mechanism.
- **Driver: the settings ledger's scalar-only vocabulary (Article III, deliberate) meets a genuinely non-scalar setting (`robotsRules`)** → addressed by decomposing what can be decomposed (`defaultRobots`) and adding the smallest possible vocabulary extension (`json` variant) for what cannot, rather than inventing a `seo`-local settings mechanism that would duplicate the ADR-028 ledger's revision/audit guarantees.
- **Driver: `page.head` has no home** → addressed by placing the registry where the renderer already lives (`server/http/site/`), owned by the render layer per ADR-032's own framing, not smuggled into the `seo` module where a second contributor (a future feeds plugin, named in ADR-032 §4) would have no natural home.
- **Driver: `/tasks` needs safe `[P]` parallelization** → addressed by the parallel delivery plan in the Downstream Handoff Notes of the implementation outline, sequencing the schema/settings-vocabulary/outbox-event prerequisites ahead of the SEO module itself and the UI.

## Pattern Evaluation

The core pattern (vertical feature-module slice, no new ports, reuse-by-handle over existing modules) is **inherited from ADR-032/ADR-006/ADR-028/ADR-039** and is not re-evaluated — ADR-032 already made and cleared its `/audit-work` gate on this shape. The five genuinely open implementation-level questions this ADR resolves (Decision §2, §3, §5, §6, §7) are each a reuse-vs-build call:

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---|---|---|---|---|---|---|---|
| **`page.head` seam:** in-module registry in `server/http/site/` (this ADR) | Strong fit | High | measured (read `render.ts`/`routing.ts` directly) | Matches the exact shape `routing.ts` already uses for its own registries; lives where the renderer lives, so a future second contributor has a natural home | `render.ts`/`pages.ts` need real (small) changes, not just additive files | A brownfield touch to a real render path vs. a zero-touch alternative | **SELECTED** |
| `page.head` seam: keep entirely inside `src/seo/`, `render.ts` imports SEO directly | Weak fit | Low | analogical | Zero changes to `render.ts`'s structure beyond one call site | Wrong ownership — a future non-SEO contributor (ADR-032 §4 names a feeds plugin) would have to import the SEO module to register into a "shared" seam SEO doesn't conceptually own; couples the render layer to a feature module | Cheaper today, wrong shape for the named future case | Not selected — ADR-032 itself frames this as the theme layer's seam, not SEO's |
| **Sitemap cache:** in-module `Map`, no new port (this ADR) | Strong fit | High | measured (confirmed no `CachePort` exists anywhere) | Zero new abstraction; matches Article IV — a port needs 2 real adapters or a concrete near-term second, and none exists | Cache is process-local (acceptable — single dev-server process, matches every other in-memory adapter in this repo today) | Not horizontally-scalable, but nothing else in this repo is either yet | **SELECTED** |
| Sitemap cache: introduce a new `CachePort` (in-memory + a stubbed "future Redis" adapter) | Rejected | Medium | analogical | Forward-looking shape | Fails rule-of-two today (no real second adapter); pure speculative generality Article III/IV explicitly bar | None that justify it now | Not selected — the exact anti-pattern ADR-006 exists to prevent |
| **Settings vocabulary:** decompose `defaultRobots`, add `json` type for `robotsRules` only (this ADR) | Strong fit | High | measured (read `types.ts`'s scalar-only doc comment directly) | Smallest possible footprint; preserves Article III's "deliberately small" vocabulary for every other field; new variant is additive/non-breaking | Adds one variant to a module that explicitly documented not wanting one | The vocabulary purity ADR-028 wanted vs. the one field that structurally cannot be scalar | **SELECTED** |
| Settings vocabulary: store `robotsRules` as a separate bespoke table | Rejected | Low | analogical | Keeps the ledger scalar-pure | Directly violates REQ-02's "never a new table" *spirit* extended to settings, and duplicates the ledger's own revision/audit machinery for one array field | Not worth the duplication for a ≤50-row, workspace-scoped array | Not selected |
| **`ogImage` resolution:** small read-only helper reusing existing `media` read ports (this ADR) | Strong fit | High | measured (read `rendition-service.ts` directly) | No new port; reuses the exact repos `resolveMediaRendition` already reads | Duplicates a small slice of `resolveMediaRendition`'s lookup logic (URL composition without byte-serving) | A few lines of overlap vs. importing a byte-serving function for a URL-only need | **SELECTED** |
| `ogImage` resolution: call `resolveMediaRendition` and discard the bytes | Rejected | Low | analogical | Zero new code | Fetches and discards actual image bytes on every head render — wasteful I/O for a URL-only need; also generates renditions eagerly (wrong semantics — head rendering shouldn't trigger lazy transform generation) | Simplicity of reuse vs. correctness/cost | Not selected |

## Quality Attribute Scorecard

Most axes are governed by ADR-032's own framing (replaceable/disable-able bundled-plugin shape, no new port, ABI-conformance intent — unchanged by this ADR). Scored here for the concrete surface this ADR adds: the render-seam registry, the settings-vocabulary extension, and the outbox-event extension to `post`.

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing SEO/head behavior later | 4 | measured | `page.head` registry is a clean, typed seam a future contributor can register into without touching SEO; sitemap cache is isolated in one file | `render.ts`/`pages.ts` now carry a real dependency on the head-fold call, a light coupling that didn't exist before | The alternative (SEO-owned seam) would have been *harder* to extend later, not easier | Repo convention (in-module registries, no ports for single-evaluator seams) stays acceptable at this scale | always-on | If a second `page.head` contributor becomes real, the registry already supports it with zero structural change | Owner: whoever ships the second contributor; trigger: a second real `PageHeadHook` registration | — |
| modularity | Cross-module coupling | 4 | measured | `seo` depends on `post`, `routing`, `settings`, `media`, `identity` — all already-existing dependency directions in this codebase (every feature depends on `identity`; `routing` already depends on `post`) | `post.ts` gains a new dependency on `OutboxPort` in `updatePost()` (previously event-free) | Reusing the existing outbox mechanism is the *lower*-coupling option vs. inventing a parallel notification path | — | always-on | — | — | +1 vs. a hypothetical SEO-local polling/notification mechanism |
| scalability | Read/write volume headroom | 3 | assumed | Single sitemap doc, in-process cache, no benchmark run | No expression index (OQ-02 resolution); full-table scan + app-side `noindex` filter on every cache miss | Matches ADR-032's own disclosed "unbenchmarked at scale" posture (Open §1) — this ADR does not claim to fix that, only to not add unwarranted complexity for an unbenchmarked v1 | Dev-scale workspace sizes for the foreseeable v1 timeframe | always-on | If a workspace's published-entry count grows large enough that sitemap-scan latency is observed, add the `CAST(json_extract(...))` partial index named in Decision §7 | Owner: whoever observes the slowdown; trigger: measured sitemap-build latency, not a calendar date | -1 vs. the (rejected) eager-expression-index alternative, accepted per Article III |
| reliability | Never-brick / correctness under failure | 4 | measured | `foldPageHead` never lets one contributor's throw break the page (REQ-16); sitemap cache invalidation is idempotent per event (ADR-009); a per-entry SEO write's direct cache-invalidation call means an entry's own `noindex` flip is never dependent on outbox delivery timing | Sitemap cache is process-local — a server restart or a missed/failed outbox delivery leaves it stale until the next real event or manual regenerate (REQ-13 exists precisely for this) | Matches the Dependencies table's own documented fallback ("stale content until next event or manual regenerate") | — | always-on | — | — | — |
| security | Authorization correctness | 4 | measured | Single permission (`admin.seo.manage`) gates both reads and writes uniformly across 6 routes — no self-vs-other branching to get wrong (unlike Settings' REQ-13) | `sitemap.xml`/`robots.txt` are deliberately unauthenticated — correct per REQ-08/09, but worth naming as a reviewed decision, not an oversight | Simpler authorization surface than Settings' — one permission, one check per route, matching `theme.set`'s existing pattern | — | always-on | — | — | — |
| operability | Ops/debugging surface | 4 | measured | Structured errors (`errors.spec.md` §1); the sitemap cache's manual-regenerate action (REQ-13) gives an operator a direct lever when the automatic invalidation is suspected stale | No metrics/dashboarding for cache hit/miss or fold-drop counts (not required by any NFR) | Matches the existing admin-route observability baseline | — | always-on | — | — | — |
| cost | Build/run cost | 5 | measured | Zero new infrastructure (no new port, no new external cache, no new table beyond one nullable column) | None | Pure feature-module addition plus small, additive extensions to 3 existing modules (`post`, `settings`, `identity`) | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 5 | measured | Every field-precedence rule (behavior.spec.md §1.1), the head-fold dedup/tie-break (§5/§6.1), and the outbox-transition table (Decision §5) are pure, directly unit-testable functions; every P1 AC has a real HTTP or render-path boundary | None | Matches this repo's established test-first pattern | — | always-on | — | — | — |

No axis scored ≤2; Mitigations Required section is empty except the two forward-looking notes captured inline above (scale trigger for the expression index; second-contributor trigger for the registry).

## Overall Strengths

- Every dependency this feature needs already exists in the codebase in some form — this ADR's real contribution is verifying and wiring those dependencies correctly, not inventing new ones.
- The five gaps found during this pass (no cache, no events, scalar-only settings, no head seam, no image-URL helper) are each closed with the smallest possible extension to an existing module, not a new abstraction layer.
- `page.head` gets a real, typed, testable home for the first time — closing an ADR-032 Open item that has been outstanding since the ADR's original draft.

## Overall Weaknesses

- `render.ts`/`pages.ts` — both existing, working files — need real structural changes (not purely additive), which is inherently riskier than a greenfield addition; mitigated by keeping the change narrowly scoped to "accept and splice a pre-serialized head string" rather than a larger refactor.
- `post.ts`'s `updatePost()` gaining outbox-event responsibility is a second module (beyond `seo` itself) whose behavior this feature's correctness depends on — Code Review must verify the transition table in Decision §5 is implemented exactly, not approximately.

## Tradeoff Tension

We are trading a small, real change to two already-working files (`render.ts`, `post.ts`) for closing two structural gaps (no head seam, no cache-invalidation signal) that would otherwise silently fail two P1 acceptance criteria (AC-31, AC-22/23) if left as "someone else's problem."

## Why This Won

Every alternative considered either reintroduced exactly the speculative-abstraction pattern Article III/IV/ADR-006 exist to prevent (a `CachePort` with no second adapter, a `page.head` seam owned by the wrong module) or left a P1-blocking gap unresolved for a downstream agent to discover mid-TDD, which is more expensive to unwind than resolving it now with full repo context. Matching existing conventions everywhere reuse was possible (in-module registries, existing ports, existing outbox mechanism) keeps SEO unsurprising to an engineer already familiar with `routing.ts` or `settings/migration.ts`.

## Runner-Up Comparison

- Runner-up: Build a new `CachePort` + a dedicated SEO-local notification mechanism instead of extending `post.ts`'s outbox usage, keeping `seo` fully self-contained and touching zero other modules.
- Why it lost: Both pieces would be genuinely *more* isolated but *less* correct — a new port with one real adapter fails rule-of-two outright (Article IV), and a SEO-local notification mechanism would duplicate the outbox's idempotency/reliability guarantees for no benefit, plus leave `post.ts`'s status-transition moments un-observable to any *other* future consumer that might also want them (a search-index updater, an analytics rollup) — exactly the kind of narrow, feature-scoped shortcut the modular-monolith default heuristic warns against.

## Consequences

**Positive:**
- SEO ships with zero new hexagonal ports — the cleanest possible verification that ADR-032 §7's "no new port" claim actually holds against the real code, not just the stub.
- `page.head` gets a real, reusable seam other bundled plugins (named in ADR-032 §4) can register into later with no further architecture work.
- The `post.ts` outbox extension is small, generically useful (any future consumer of publish/unpublish/update transitions benefits, not just SEO), and testable in isolation.

**Negative / Tradeoffs:**
- Two existing, working files (`render.ts`, `routes/site/pages.ts`) require real changes, carrying more regression risk than an additive-only feature would.
- The settings-ledger vocabulary is no longer purely scalar (one `json` variant added) — a deliberate, disclosed, minimal exception to a documented Article III boundary, not a silent erosion of it.

**Risks:**
- Risk: `updatePost()`'s new event-emission logic misclassifies a status transition (e.g. treats a draft→draft title edit as publish-worthy) → plan: TDD Agent certifies the exact 4-row transition table in Decision §5 as an isolated, directly-testable unit before wiring it into the real `updatePost()` write path.
- Risk: `foldPageHead`'s dedup/tie-break logic (last-writer-wins-by-priority, then later-registration-wins) is implemented inconsistently with behavior.spec.md §5/§6.1 → plan: TDD Agent certifies this as a standalone pure-function unit (own test file) before either `render.ts` or the SEO contributor depend on it.
- Risk: The `json` schema-variant addition to `features/settings` is scoped incorrectly (e.g. loosened further than `robotsRules` needs) → plan: Code Review verifies the variant is used exactly once (`site.seo.robots_rules`) and that `validateValueAgainstSchema`'s new branch does not silently accept malformed values SEO's own write-path validator is supposed to catch first.

## Mitigations Required

None — no axis scored ≤2. The three forward-looking risk mitigations above are Owner/Enforcement-tagged and already captured inline.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

This is brownfield in the sense of "extends real, already-shipping modules" (`post`, `settings`, `identity`, the renderer) but is **not** a data migration — there is no prior SEO data to migrate, and the new `posts.seo_ext_json` column is purely additive.

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | **Expand only, no contract phase needed.** `posts.seo_ext_json` is a new nullable column with no default-value backfill requirement (`null` means "derive everything," which is the correct behavior for every pre-existing row — REQ-04's precedence chain already treats an absent override as "fall through to site default / derived"). No existing row needs touching. | Programmer (Drizzle migration), Software Architect (this decision) |
| Dual-write or read-routing plan | N/A — no legacy SEO data source exists to dual-write from or migrate off of. | N/A |
| Backfill plan | None needed — see Expand/contract shape. `site.seo.*` setting definitions are registered idempotently at boot (`ensureSeoSettingDefinitions`, mirrors `migrateLegacyPresentationSettings`'s skip-if-registered pattern) with schema-supplied defaults (`titleTemplate="%s"`, `sitemapEnabled=true`, etc. per `behavior.spec.md` §3) — every workspace is correctly served from defaults on first boot, no backfill row-by-row. | Programmer |
| Reconciliation checks | AC-02 (GET with no overrides returns a fully-derived effective meta) is the reconciliation check for the additive column — a pre-existing post with `seo_ext_json IS NULL` must resolve exactly the same effective meta the derivation rules define, with zero special-casing for "this row predates the SEO feature." | TDD Agent |
| Observability proving phase health | Each per-entry SEO write and each settings write emits its own `setting_revisions`/typed-error signal per the existing ledger and errors.spec.md §1 conventions — no separate migration-specific telemetry is needed because there is no migration, only additive schema/definition registration. | Programmer |
| Rollback test | Because the new column is nullable and additive, and the new setting definitions resolve to schema defaults when absent, rollback is simply: don't ship the SEO routes/UI. No destructive step exists in this feature at all — the column can remain in the schema unused with zero behavioral impact on any other feature. | Software Architect (this decision) |
| Cutover approval and timing | No cutover — there is nothing to switch over from. The feature is live the moment its routes/UI ship; no dual-running period is needed. | Coordinator / Code Review |
| Point of no return | None in this feature. (Contrast with ADR-PIPE-007's Settings migration, which had a real legacy-port deletion step — SEO has no equivalent legacy surface to retire.) | N/A |
| Post-cutover verification | AC-01/02 (round-trip persistence + derived-meta-on-empty-overrides) integration tests, run against the real SQLite adapter, are the full post-ship verification — no manual `/verify` pass beyond the feature's own P1 test suite is required by this migration-safety analysis (a general `/verify` pass on the shipped feature is still expected per normal process, just not migration-specific). | TDD Agent, then normal `/verify` |

## Re-evaluation Triggers

- Calendar trigger: None — no forced revisit date.
- Scale trigger: If a single workspace's published-entry count makes `buildSitemap`'s full-scan-plus-app-filter measurably slow, add the `CAST(json_extract(seo_ext_json,'$.noindex') AS INTEGER)` partial expression index named in Decision §7 (OQ-02) — a mechanical addition, not a redesign.
- Topology trigger: If a second real `page.head` contributor (e.g. the feeds plugin ADR-032 §4 names) or a second real `seo.sitemap.collect` registrant appears, no redesign is needed — both registries already support N contributors; re-evaluate only whether ordering/priority conventions still make sense with a second real registrant.
- Dependency trigger: If `src/routing/routing.ts`'s `composeCanonicalUrl` is updated to consume `OriginRegistryPort.canonicalOrigin` (closing its own documented TODO — a routing-owned prerequisite, not owned by this feature per `feature.spec.md` Dependencies), no SEO-side change is needed — SEO already only ever calls `routing.urlFor`, never composes an origin itself (INV-07). Re-verify this remains true after that routing-side change lands.

## Module / Service Boundaries

```
src/seo/                                  # EXISTING stub filled in (REQ-01..16)
  INFO.md                                 # module purpose, mirrors settings/identity INFO.md convention
  types.ts                                 # MODIFIED: SeoSettingKey drops "seo.base_url" (INV-07);
                                           #   SeoSettings drops `baseUrl`; RobotsPolicy stays
                                           #   computed-only (unchanged shape, now actually produced
                                           #   by buildRobots() rather than assumed persisted);
                                           #   SeoPermission type replaced by the single string
                                           #   "admin.seo.manage" used at call sites
  ports.ts                                 # MODIFIED: SeoQueryPort unchanged (already correct);
                                           #   SeoCacheCap's doc comment corrected to describe the
                                           #   real in-module Map-backed implementation, not a
                                           #   nonexistent core CachePort
  seo.ts                                   # NEW: pure evaluator — getEntryMeta, analyzeEntry,
                                           #   field-by-field precedence (behavior.spec.md §1.1),
                                           #   content-type -> JSON-LD @type mapping (REQ-07)
  page-head-contributor.ts                 # NEW: SEO's own PageHeadHook implementation (priority
                                           #   bands per behavior.spec.md §2.1) — registers into
                                           #   server/http/site/page-head.ts's registry at boot
  write-service.ts                         # NEW: setEntrySeoOverrides — THE per-entry chokepoint
                                           #   (REQ-01/02/03); authorize -> validate -> merge into
                                           #   posts.seo_ext_json via PostRepoPort.save (no new port);
                                           #   also directly invalidates the sitemap cache on a
                                           #   noindex/canonical-affecting write (Decision §5)
  settings.ts                              # NEW: getSeoSettings/setSeoSettings mapping over
                                           #   features/settings (namespace site.seo, Decision §3);
                                           #   ensureSeoSettingDefinitions() boot-time registration;
                                           #   titleTemplate %s-count + robotsRules shape/length
                                           #   validators (SEO_SETTINGS_VALIDATION_ERROR)
  sitemap.ts                                # NEW: buildSitemap/buildRobots/regenerateSitemapCache/
                                           #   invalidateSitemapCache over an in-module Map cache
                                           #   (Decision §5); the empty seo.sitemap.collect registry
                                           #   (OQ-01, Decision §7)
  media.ts                                  # NEW: resolveSeoImageRef — media-ref-to-URL helper over
                                           #   existing media read ports (Decision §6)
  errors.ts                                 # NEW: SeoFieldValidationError, SeoInvalidCanonicalUrlError,
                                           #   SeoSettingsValidationError, SeoEntryNotFoundError
  index.ts                                  # NEW: barrel export
  __tests__/                                # unit + integration tests

src/server/http/site/
  page-head.ts                              # NEW: registerPageHeadContributor/foldPageHead/
                                           #   serializeHeadElements/resetForTests — the render-seam
                                           #   registry (Decision §2), core-owned, not SEO-owned
  render.ts                                 # MODIFIED: pageShell() accepts a pre-serialized head
                                           #   string, suppresses its own hardcoded <title> when the
                                           #   fold already produced a title element

src/server/routes/site/
  pages.ts                                  # MODIFIED: builds PageHeadContext (canonicalUrl via
                                           #   routing.urlFor), calls foldPageHead()+serialize before
                                           #   renderSite() on both the home and :slug routes
  sitemap.ts                                # NEW: public GET /sitemap.xml (SEO_GET_SITEMAP)
  robots.ts                                 # NEW: public GET /robots.txt (SEO_GET_ROBOTS)

src/server/routes/admin/seo/
  get-entry.ts                              # NEW: SEO_GET_ENTRY_META
  put-entry.ts                              # NEW: SEO_PUT_ENTRY_META
  get-entry-analyze.ts                      # NEW: SEO_GET_ENTRY_ANALYZE
  get-settings.ts                           # NEW: SEO_GET_SETTINGS
  put-settings.ts                           # NEW: SEO_PUT_SETTINGS
  post-sitemap-regenerate.ts                # NEW: SEO_POST_SITEMAP_REGENERATE

src/infra/db/schema.ts                      # MODIFIED: posts gains seoExtJson: text("seo_ext_json")
                                           #   (nullable, additive)

src/identity/permissions.ts                 # MODIFIED: registerPermission({id:"admin.seo.manage", ...})

src/features/settings/types.ts              # MODIFIED: SettingValueSchema gains
                                           #   {type:"json", nullable?: boolean} (Decision §3)
src/features/settings/settings.ts           # MODIFIED: validateValueAgainstSchema gains
                                           #   case "json": return true;

src/features/post/post.ts                   # MODIFIED: UpdatePostDeps gains outbox: OutboxPort;
                                           #   updatePost() emits entry.published/updated/unpublished
                                           #   per the Decision §5 transition table

src/server/routes/types.ts                  # MODIFIED: RouteDeps gains seoReady: Promise<void>
                                           #   (mirrors settingsReady)
src/server/app.ts                           # MODIFIED: registers the 8 SEO route registrars,
                                           #   subscribes SeoEventSubscriptions to the 3 entry
                                           #   events, calls ensureSeoSettingDefinitions() at boot,
                                           #   registers SEO's PageHeadHook contributor

apps/admin/src/sections/Seo.tsx             # NEW: site-settings screen (mirrors Appearance.tsx)
apps/admin/src/sections/PostEditor.tsx      # MODIFIED: embeds the new SeoEntryPanel as a tab/section
apps/admin/src/App.tsx                      # MODIFIED: import + mount <Seo /> (matches existing
                                           #   per-section route wiring)
apps/admin/src/lib/api.ts                   # MODIFIED: adds the 6 admin-route client calls
```

## API / Event Contract Summary

What interfaces does this decision define that other agents must respect?

- `SeoQueryPort` (`src/seo/ports.ts`, existing stub, now implemented) — `getEntryMeta`/`renderHead`/`buildSitemap`/`buildRobots`/`analyzeEntry`. INV-09: no route/hook/future-AI-tool binding may read persisted SEO data through a second, parallel handler.
- `registerPageHeadContributor`/`foldPageHead`/`serializeHeadElements` (`src/server/http/site/page-head.ts`, NEW) — the render-seam registry every future `page.head` contributor (SEO now, others later per ADR-032 §4) must register into; TDD/Programmer must not add a second, parallel head-injection path into `render.ts`.
- 6 admin HTTP endpoints + 2 public HTTP endpoints per `api.spec.md` §1, each gated per §2's auth profiles.
- `entry.published` / `entry.updated` / `entry.unpublished` — new outbox event names `post.ts` now emits; any future consumer (not just SEO) may subscribe.
- `SettingValueSchema`'s new `{type:"json"}` variant (`src/features/settings/types.ts`) — available to any future feature needing an opaque-JSON setting value; Programmer/Code Review must confirm it is used exactly once in this feature (`site.seo.robots_rules`), not as a general escape hatch for fields that could be scalar-decomposed.
- `admin.seo.manage` — the single new permission string; gates all 6 admin routes.

## Enforcement

How do we prevent violations?
- Code Review Agent flags any route reading/writing `posts.seo_ext_json` other than through `src/seo/write-service.ts`/`src/seo/seo.ts` (INV-09's chokepoint boundary).
- Code Review Agent flags any second `page.head`-shaped injection point added to `render.ts`/`pages.ts` outside `page-head.ts`'s registry.
- Code Review Agent verifies `updatePost()`'s new event-emission logic exactly matches the Decision §5 transition table (4 rows, including the "no event" row) with direct unit test coverage for each.
- Code Review Agent verifies the `{type:"json"}` schema variant is used exactly once (`site.seo.robots_rules`) and that SEO's own write-path validator — not the ledger schema — enforces `robotsRules`' internal shape/length.
- Code Review Agent verifies no `seo.base_url`-shaped setting or raw request-host read exists anywhere in the new code (INV-07).

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.* (No Constitution Check row is EXCEPTION; this entry is included for auditability of a vocabulary extension to a module that explicitly documented a narrower intent, even though it complies with Article III per the mapping below.)

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| III (not a violation — documented for auditability) | `SettingValueSchema` gains `{type:"json"}` solely to store `seo.robots_policy` (REQ-11), a variable-length array of structured rules that cannot be scalar-decomposed the way `defaultRobots` was | A bespoke `seo_robots_rules` table | Duplicates the ADR-028 ledger's own revision/audit machinery for one ≤50-row array; a new table for this is more complexity, not less, and would still need its own write chokepoint |

## Amendments

### 2026-09-05 — EC-07's "never generates" clause OVERTURNED (owner ruling)

**What changed:** Decision §6's `resolveSeoImageRef` originally resolved `undefined` (field omitted)
whenever the composed rendition had not yet been generated, in addition to the genuine-miss cases
(deleted/trashed asset, unregistered transform) — see EC-07 and `src/seo/__tests__/media.test.ts`'s
former "a registered transform with no generated rendition yet resolves undefined (never generates)"
certification. As of 2026-09-05 that clause is **removed**: `resolveSeoImageRef` now always composes
and returns the URL for the latest registered transform version, regardless of whether that exact
rendition row already exists. The genuine-miss cases (deleted asset, trashed asset, unregistered
transform, malformed ref) are unchanged and still resolve `undefined`.

**Why:** Every published entry's `og:image`/`twitter:image` was missing site-wide. A dedicated
OG/featured image is the normal shape for `seoExtJson.ogImage`/`twitterImage` — it is not embedded in
any entry body (the admin's `Seo.tsx` field is a plain text ref input with no picker/preview that
would otherwise trigger a fetch and warm the rendition), so under the old rule no other code path ever
generated it, and the tag stayed omitted forever. The owner ruled directly on this, verbatim: *"I want
this to be viewable by everybody. Like, I don't want... I'm not hiding anything. I want this to be
indexed by any crawler or anything like that."* The rejected alternative — eager rendition warm-up on
publish/save — was explicitly out of scope for this change.

**Safety argument (why this does not trade correctness for a shipped tag):** `resolveSeoImageRef`
always selects the **latest** registered version of the named transform (`resolveLatestTransformVersion`
— highest `version`, same "current latest" query `transform-registry.ts`'s `getLatestTransformDefinition`
answers). The public serving route (`routes/site/media-rendition.ts` -> `resolveMediaRendition` in
`@jini-ai/cms/media`'s `rendition-service.ts`) allows anonymous lazy generation of a not-yet-generated
rendition whenever `isLatestTransformVersion` is true for the requested `(name, version)` — which it
always is for the exact version this function selects. So every URL `resolveSeoImageRef` can now emit
is guaranteed servable on first anonymous fetch; there is no code path where relaxing this rule can
produce a tag pointing at a 404. The media access gate (`resolveMediaAccessDecision`,
`gating.length === 0 -> allowed: true`) already treats an asset with no live-post referrer as
ungated by default — unaffected and untouched by this change; its own doc comment already names
`resolveShareImages`'s OG/Twitter URLs as a measured, deliberate counter-example to a blanket
referrer-required default.

**Verified/re-confirmed 2026-09-05** by direct reads of `rendition-service.ts::resolveMediaRendition`
and `transform-registry.ts::isLatestTransformVersion`/`getLatestTransformDefinition` in
`Jini/packages/cms/src/media/` (symlinked into this repo as `@jini-ai/cms/media`), not inherited from
a prior agent's characterization alone.

**What did NOT change:** the media access gate, auth, RBAC, or any gating logic; eager
warm-up/pre-generation (still out of scope); the genuine-miss branches of `resolveSeoImageRef`.

**Record:** `src/seo/__tests__/media.test.ts`'s EC-07 rendition-miss test was rewritten (not deleted)
to assert the new contract — a missing rendition row no longer suppresses the URL. A new end-to-end
test, `src/server/__tests__/routes/seo-og-image-crawlability.test.ts`, certifies the full path: a
published entry with an unwarmed `ogImage` ref renders an absolute `og:image` URL, and fetching that
exact URL anonymously (no cookies, no auth) returns 200 with an `image/*` content type.

## Related Decisions

- Extends: ADR-032 (SEO Subsystem, ACCEPTED 2026-07-10) — this ADR implements it against the real codebase, correcting 4 spec-documented + 5 architecture-discovered drift points from the ADR's original stub-writing pass; ADR-039/ADR-040 (routing/origin `canonicalUrl`, consumed read-only); ADR-028/SPEC-007 (settings ledger, extended by one schema variant); ADR-021 (`authorize()`, permission catalog); ADR-006 (rule-of-two — no new port introduced); ADR-009 (hook/event mechanism — `page.head`, `seo.sitemap.collect`, outbox events all reuse this); ADR-027 (media rendition URL contract, read-only reuse); ADR-015 (Drizzle)
- Relates to: ADR-PIPE-007 (Settings core-ledger implementation architecture — the precedent this ADR's shape and level of detail follow); ADR-033 (Redirects — sibling spec, disjoint files, no coordination needed at this stage)
