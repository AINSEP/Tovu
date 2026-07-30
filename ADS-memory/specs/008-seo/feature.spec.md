# Feature Spec: seo

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-008 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128 |
| feature_name | FEAT-008-seo |
| last_edited | 2026-07-13T20:18:23Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

The SEO admin section gives editors and admins classic on-page SEO control over posts and pages — per-entry meta title/description/canonical/robots/social-card overrides, workspace-level SEO defaults, derived JSON-LD structured data, a public `sitemap.xml`, and a public `robots.txt` — implemented as the ADR-032 dogfood bundled module that proves Tovu's frozen async/serializable plugin ABI.

---

## Problem Statement

**Current state:** Tovu posts/pages have no SEO surface at all. There is no per-entry meta title/description override, no canonical URL control, no robots directive, no OpenGraph/Twitter card output, no structured data, and no `sitemap.xml`/`robots.txt`. `src/seo/ports.ts` and `src/seo/types.ts` exist as design-only interface stubs (ADR-032) with no adapters, no routes, and no admin UI behind them.

**Desired state:** An editor can set meta title/description, a canonical override, noindex/nofollow, a JSON-LD schema type, and OpenGraph/Twitter overrides on any post or page, and an admin can configure workspace-level SEO defaults and robots policy. The public site emits correct `<head>` tags, valid JSON-LD, a working `sitemap.xml`, and a working `robots.txt` — all derived through one shared computation, never duplicated per surface.

**Why now:** ADR-032 is ACCEPTED and cleared its `/audit-work` gate; it is next in the Wave-1 admin-section sweep queue (alongside sibling ADR-033 Redirects) and is explicitly named the ADR-024 ABI dogfood — no time-boxed deadline, but it is the next unblocked, ACCEPTED, unspecced admin section.

**Success signal:** A new developer can implement per-entry SEO CRUD, `page.head` rendering, `sitemap.xml`, and `robots.txt` from this spec package alone, and every P1 acceptance criterion below is verified by an integration-level test at its real boundary (HTTP route or public route).

---

## User Journey

**Trigger:** An editor opens a post/page in the admin editor, or an admin opens the SEO settings screen.

**Steps (per-entry):**
1. Editor opens a post/page in the existing Post/Page editor and switches to the "SEO" panel.
2. Panel loads the entry's current override fields plus the currently-effective (resolved) meta preview (title/description/canonical/robots/OG/Twitter/JSON-LD).
3. Editor edits any subset of override fields (e.g. sets a custom meta description, ticks "noindex") and saves.
4. Panel re-fetches effective meta and shows the updated preview.

**Steps (site-level):**
1. Admin opens **Marketing → SEO** (`/admin/seo`).
2. Screen loads current `seo.*` settings (title template, default description, default OG image, Twitter handle, default robots, sitemap enabled, robots rules).
3. Admin edits a field and saves; screen shows the saved values back.
4. Admin can click "Regenerate sitemap" to force-refresh the cached sitemap immediately rather than waiting for the next content-change event.

**Outcome:** The public site's `<head>` reflects the effective meta for every page; `/sitemap.xml` lists eligible published, non-noindex entries; `/robots.txt` reflects the configured policy.

**Alternate paths:** On a per-entry write with an unregistered field or malformed URL, the panel shows an inline validation error and no partial save occurs. On a settings write with an invalid robots rule, the same. If the acting principal lacks `admin.seo.manage`, both screens show a forbidden state and no write is attempted. If a `page.head` contributor throws during a public page render, that contributor's output is silently dropped (comment marker) and the page still renders — this is a pre-existing renderer posture (`server/http/site/render.ts`), not new to SEO.

---

## Scope

**In scope:**
- Per-entry SEO override fields on posts and pages (`title`, `description`, `canonical`, `noindex`, `nofollow`, `schemaType`, `ogTitle`, `ogDescription`, `ogImage`, `ogType`, `twitterCard`, `twitterTitle`, `twitterDescription`, `twitterImage`) — read/write, gated by `admin.seo.manage` (REQ-01/02/03)
- Effective SEO meta resolution (override ▸ site default ▸ derived) as one shared computation (REQ-04/05)
- `page.head` render-IR contribution: title, meta description, canonical link, robots meta, OpenGraph, Twitter card, JSON-LD (REQ-06/07/16)
- Derived, type-mapped JSON-LD (`page`→`WebPage`, `post`→`Article`, override via `schemaType`) plus a minimal `BreadcrumbList` when routing supplies an ancestor chain (REQ-07)
- Public, unauthenticated `sitemap.xml` (single sitemap, keyset-paginated, cached, event-invalidated) (REQ-08/10)
- Public, unauthenticated `robots.txt` (policy + sitemap advertisement) (REQ-09)
- Workspace-level `seo.*` settings CRUD (title template, default description, default OG image, Twitter handle, default robots, sitemap enabled, robots rules) via the ADR-028 settings ledger, gated by `admin.seo.manage` (REQ-11)
- Manual sitemap cache regeneration action, gated by `admin.seo.manage` (REQ-13)
- `analyzeEntry` SEO score/lint computation surfaced in the admin panel only — registry entry reserved for the future `analyze_seo` AI tool name, no protocol wiring (REQ-14)
- Admin UI: a per-entry "SEO" panel embedded in the existing Post/Page editor, and a dedicated `/admin/seo` site-settings screen

**Out of scope:**
- The entire AEO/GEO backlog (`todos.md` §22): answer-engine Q&A content model, GEO entity graph, `llms.txt`, per-page `.md` mirrors, `data-nosnippet` zones, knowledge-sitemap variants, citation/displacement tracking, AI-crawler-specific policy management
- Sitemap index (>50k URL / 50MB split) and news/image/video sitemaps
- IndexNow / search-engine ping on publish
- hreflang / i18n alternates
- A per-entry raw JSON-LD override editor and arbitrary custom head snippets
- Redirects / canonicalization-strategy management (owned by ADR-033 Redirects, a sibling spec)
- Social-preview image generation (a media-transform seam, ADR-027)
- Protocol-level exposure of `analyze_seo` as an agent-invokable tool (named Phase-5 in ADR-032 §8)
- Migrating post/page storage onto the generic ADR-022 `entries` model — this spec attaches to the real, existing bespoke `posts` table (see Dependencies and `state.spec.md`)
- Any real second implementer of the `seo.sitemap.collect` hook (no taxonomy/term content exists in this repo yet) — the hook's contract is declared but has zero live contributors in v1

---

## Requirements

- REQ-01: The system shall allow a principal holding `admin.seo.manage` to read and write the per-entry SEO override fields (`title`, `description`, `canonical`, `noindex`, `nofollow`, `schemaType`, `ogTitle`, `ogDescription`, `ogImage`, `ogType`, `twitterCard`, `twitterTitle`, `twitterDescription`, `twitterImage`) for any post or page in its workspace.
- REQ-02: The system shall persist per-entry SEO override fields as a single validated JSON object attached to the entry's own row — never in a new table.
- REQ-03: The system shall reject a per-entry SEO write that contains any key outside the registered override-field set, without persisting any part of that write.
- REQ-04: The system shall compute effective per-entry SEO meta (title, description, canonical, robots directive, OpenGraph, Twitter card, JSON-LD) by layering, in order: author override, then workspace `seo.*` setting default, then a value derived from the entry itself.
- REQ-05: The system shall expose effective SEO meta through one shared computation consumed identically by the admin preview, the public `page.head` render, and the `analyzeEntry` computation — no second, divergent implementation.
- REQ-06: The system shall contribute `page.head` output for public post/page views exclusively as ordered, deduplicated, sanitized head-element descriptors (`title`/`meta`/`og`/`link`/`jsonld`) — never as a raw HTML string.
- REQ-07: The system shall derive JSON-LD structured data from content type (`page`→`WebPage`, `post`→`Article`, overridable via the effective `schemaType`), plus a minimal `BreadcrumbList` element whenever routing supplies an ancestor chain for the current page.
- REQ-08: The system shall serve a single `sitemap.xml` at a public, unauthenticated route listing every published, non-noindex post and page in the workspace, keyset-paginated internally.
- REQ-09: The system shall serve `robots.txt` at a public, unauthenticated route, derived from the workspace's `seo.robots_policy` rules and `seo.sitemap_enabled` setting.
- REQ-10: The system shall cache the generated sitemap per workspace and invalidate that cache whenever any entry in the workspace is published, updated, or unpublished.
- REQ-11: The system shall allow a principal holding `admin.seo.manage` to read and write the workspace-level `seo.*` settings (`titleTemplate`, `defaultDescription`, `defaultOgImage`, `twitterSite`, `defaultRobots`, `sitemapEnabled`, `robotsPolicy` rules).
- REQ-12: The system shall compose every absolute URL it emits (canonical `<link>`, sitemap `<loc>`, OpenGraph/Twitter URLs) exclusively from the routing library's `urlFor`/`canonicalUrl` resolution — never from a separately configured base-URL setting.
- REQ-13: The system shall allow a principal holding `admin.seo.manage` to manually trigger sitemap cache regeneration on demand.
- REQ-14: The system shall compute an SEO analysis (numeric score plus a list of issues) for a given entry, surfaced only to the admin panel in this scope.
- REQ-15: The system shall reject any per-entry SEO write or workspace-settings write attempted by a principal that does not hold `admin.seo.manage`.
- REQ-16: The system shall drop, rather than fail the page render for, any `page.head` contributor (including the SEO plugin's own) that throws during computation.

<!-- Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given an authenticated principal holding `admin.seo.manage`, when they `PUT` a valid subset of SEO override fields for an existing post, then the fields are persisted and a subsequent `GET` returns them unchanged.
- AC-02 (REQ-01) [P1]: Given an authenticated principal holding `admin.seo.manage`, when they `GET` SEO data for a post with no overrides set, then the response returns an empty overrides object and a fully-derived effective meta object.
- AC-03 (REQ-02) [P1]: Given a per-entry SEO write, when it is persisted, then it is stored in the existing `posts` row (no new table is created or queried for this write).
- AC-04 (REQ-03) [P1]: Given a per-entry SEO write payload containing a key not in the registered override-field set, when the write is submitted, then the request is rejected with `SEO_FIELD_VALIDATION_ERROR` and none of the payload's fields are persisted.
- AC-05 (REQ-04) [P1]: Given an entry with no `description` override and a workspace `seo.default_description` setting configured, when effective meta is computed, then `description` equals the workspace default.
- AC-06 (REQ-04) [P1]: Given an entry with a `description` override set, when effective meta is computed, then `description` equals the override regardless of the workspace default.
- AC-07 (REQ-04) [P1]: Given an entry with no `description` override and no workspace default configured, when effective meta is computed, then `description` is derived from the entry's excerpt (or omitted if no excerpt exists).
- AC-08 (REQ-04) [P2]: Given an entry with no `canonical` override, when effective meta is computed, then `canonical` equals the routing-resolved `canonicalUrl` for that entry.
- AC-09 (REQ-05) [P1]: Given the same entry and the same workspace settings, when `getEntryMeta` is called from the admin preview and `renderHead` is called for the public page, then both resolve identical `title`/`description`/`canonical`/`robots` values.
- AC-10 (REQ-06) [P1]: Given a public post/page render, when `page.head` is computed, then every element in the returned array is one of the five tagged `HeadElement` kinds and none is a raw HTML string.
- AC-11 (REQ-06) [P1]: Given two head contributors that emit an element with the same dedup key, when the fold completes, then only one element for that key appears in the final output.
- AC-12 (REQ-07) [P1]: Given a `page`-kind entry with no `schemaType` override, when JSON-LD is derived, then the emitted `@type` is `WebPage`.
- AC-13 (REQ-07) [P1]: Given a `post`-kind entry with no `schemaType` override, when JSON-LD is derived, then the emitted `@type` is `Article`.
- AC-14 (REQ-07) [P2]: Given a `schemaType` override of `"FAQPage"`, when JSON-LD is derived, then the emitted `@type` is `"FAQPage"` instead of the content-type default.
- AC-15 (REQ-07) [P2]: Given routing supplies an ancestor chain for the current page, when JSON-LD is derived, then a `BreadcrumbList` element is included alongside the primary type.
- AC-16 (REQ-08) [P1]: Given a workspace with one published, non-noindex post and one published, noindex post, when `GET /sitemap.xml` is requested, then the response includes the first post's URL and excludes the second's.
- AC-17 (REQ-08) [P1]: Given a workspace with one draft post, when `GET /sitemap.xml` is requested, then the draft post's URL is not present in the response.
- AC-18 (REQ-08) [P1]: Given `GET /sitemap.xml` is requested with no `Authorization` header, when the request is processed, then it returns `200` (no authentication is required).
- AC-19 (REQ-09) [P1]: Given `GET /robots.txt` is requested with no `Authorization` header, when the request is processed, then it returns `200` (no authentication is required).
- AC-20 (REQ-09) [P1]: Given `seo.sitemap_enabled` is `true`, when `GET /robots.txt` is requested, then the response body includes a `Sitemap:` line pointing at the workspace's sitemap URL.
- AC-21 (REQ-09) [P2]: Given `seo.sitemap_enabled` is `false`, when `GET /robots.txt` is requested, then the response body contains no `Sitemap:` line.
- AC-22 (REQ-10) [P1]: Given a cached sitemap response, when a post is published, then the next `GET /sitemap.xml` request reflects the newly-published post without requiring manual regeneration.
- AC-23 (REQ-10) [P1]: Given a cached sitemap response, when a post is unpublished, then the next `GET /sitemap.xml` request no longer includes that post.
- AC-24 (REQ-11) [P1]: Given a principal holding `admin.seo.manage`, when they `PUT` new `seo.*` settings, then a subsequent `GET` returns the updated values.
- AC-25 (REQ-11) [P1]: Given a `seo.*` settings write with an invalid `titleTemplate` (missing the required `%s` placeholder), when submitted, then the request is rejected with `SEO_SETTINGS_VALIDATION_ERROR` and the prior settings are unchanged.
- AC-26 (REQ-12) [P1]: Given any entry with no `ogImage`/canonical origin configured locally, when its sitemap `<loc>`, canonical `<link>`, or OG `url` is computed, then the absolute URL's origin comes from routing's resolved `canonicalUrl`, and no SEO-local base-URL setting exists to read from.
- AC-27 (REQ-13) [P1]: Given a principal holding `admin.seo.manage`, when they call the sitemap-regenerate action, then the cached sitemap is rebuilt and the next `GET /sitemap.xml` reflects any changes made since the last cache write.
- AC-28 (REQ-14) [P2]: Given an entry with no meta title or description set anywhere (override and site default both absent) and no excerpt derivable, when `analyzeEntry` runs, then the returned issues list includes an entry flagging the missing description.
- AC-29 (REQ-15) [P1]: Given an authenticated principal that does not hold `admin.seo.manage`, when they attempt any per-entry SEO write or settings write, then the request is rejected with `FORBIDDEN` and no data changes.
- AC-30 (REQ-15) [P1]: Given an unauthenticated request, when it attempts any per-entry SEO write or settings write, then the request is rejected with `UNAUTHENTICATED`.
- AC-31 (REQ-16) [P1]: Given a `page.head` contributor that throws during computation, when the head fold completes, then the page still renders successfully and the throwing contributor's elements are absent from the output.

<!-- Rules: every REQ-* has at least one AC; every AC has a priority tag; P1 ACs are independently testable; AC numbers are never reused. -->

---

## Invariants

- INV-01: A `posts.seo_ext_json` value, when non-null, must always validate against the registered `SeoExtFields` shape — an entry must never persist a key outside that shape.
- INV-02: The effective per-entry `title` must never be empty — it always resolves to at least the entry's own `title` field run through (or standing in for) the workspace title template.
- INV-03: `page.head` output delivered to the render seam must never contain a raw HTML string — only tagged `HeadElement` descriptors.
- INV-04: `sitemap.xml` must never include an entry whose effective `noindex` resolves to `true`.
- INV-05: `sitemap.xml` must never include an entry that is not in `published` status.
- INV-06: A per-entry SEO write or a `seo.*` settings write must never bypass the `admin.seo.manage` authorization check.
- INV-07: No SEO code path may read or write a `seo.base_url`-shaped setting — every absolute URL SEO emits must always be derived from routing's verified canonical origin.
- INV-08: The sitemap cache key must always be workspace-prefixed (`ws:{workspaceId}:seo:sitemap`) and must never be shared across workspaces.
- INV-09: `getEntryMeta`, `renderHead`, `buildSitemap`, `buildRobots`, and `analyzeEntry` must always be reachable only through the single `SeoQueryPort` surface — no route, hook, or future AI-tool binding may read persisted SEO data through a second, parallel handler.

---

## Edge Cases

- EC-01: What happens when a freshly-created post has no SEO override fields set at all? Expected behavior: `getEntryMeta` derives every field (title from the entry title run through the site title template, description from the site default or the entry excerpt, canonical from routing, robots `{noindex:false, nofollow:false}`, no JSON-LD override).
- EC-02: What happens when an entry's `noindex` override is explicitly `false` while the workspace's `seo.default_robots.noindex` is `true`? Expected behavior: the entry-level override wins; the entry is indexable and appears in the sitemap.
- EC-03: What happens when a per-entry SEO write includes an unregistered key (e.g. `fooBar`)? Expected behavior: the entire write is rejected with `SEO_FIELD_VALIDATION_ERROR`; the entry's existing SEO data is unchanged.
- EC-04: What happens when `GET /sitemap.xml` is requested for a workspace with zero eligible posts/pages? Expected behavior: a valid, empty `<urlset>` document is returned with HTTP `200`, and the empty result is cached like any other.
- EC-05: What happens when a previously-published, sitemap-listed entry is unpublished? Expected behavior: the `entry.unpublished` outbox event invalidates the workspace's sitemap cache; the next `GET /sitemap.xml` excludes that entry.
- EC-06: What happens when the SEO plugin's own `page.head` contributor throws (e.g. a corrupt stored JSON-LD candidate)? Expected behavior: that contributor's elements are dropped for that render, a comment marker is emitted in their place per the existing renderer posture, and the page still returns `200`.
- EC-07: What happens when `ogImage`/`twitterImage` holds a media ref whose underlying asset has been deleted? Expected behavior: the corresponding OG/Twitter image field is omitted from the head output; the rest of the head render (title, description, canonical, other OG/Twitter fields) is unaffected.
- EC-08: What happens when two sitemap-regenerate requests for the same workspace arrive concurrently? Expected behavior: both requests resolve to the same deterministic sitemap content; the cache holds exactly one entry for that workspace's sitemap key; no corrupted or duplicated cache entry results.
- EC-09: What happens when `GET /robots.txt` is requested while `seo.sitemap_enabled` is `false`? Expected behavior: the robots policy rules are still emitted; no `Sitemap:` line is included.
- EC-10: What happens when a `canonical` override points at a different domain entirely (a legitimate syndication use case)? Expected behavior: the override is accepted and emitted as-is, provided it is a well-formed absolute URL — SEO does not re-derive or reject cross-domain canonical values.
- EC-11: What happens when a draft (unpublished) entry's effective meta is computed (e.g. for an editor preview) and it has no explicit `noindex` override? Expected behavior: the resolved robots directive defaults `noindex` to `true` for non-published entries even without an explicit override, so a draft can never be accidentally indexable if ever exposed by another route.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `src/features/post` (bespoke `posts` table, not the generic ADR-022 `entries` model) | The only implemented content storage this spec attaches to; `posts.seo_ext_json` is a new column on this table | If the generic ADR-022 entries migration lands later, this column must be renamed/moved onto `entries.fields.ext.seo` — a data-preserving rename since the JSON shape is unchanged, not a reshape | None needed — this spec's JSON shape is already ADR-022-shaped by construction |
| `src/routing` (ADR-039 `urlFor`/`canonicalUrl`) | Canonical/absolute URL resolution for every URL SEO emits | `src/routing/routing.ts`'s `composeCanonicalUrl` still reads `ctx.originOverride` (a documented TODO stand-in) rather than calling `OriginRegistryPort.canonicalOrigin` from `src/origin` (which now exists but is not yet wired in); absolute URLs may fall back to a relative/empty origin until routing completes that wiring | None — SEO must not invent its own origin resolution (would violate REQ-12/INV-07); this is a routing-owned prerequisite outside this spec's scope |
| `src/features/settings` (ADR-028 Layered Settings Ledger) | `seo.*` setting-definition registration and `user ?? workspace ?? global ?? default` resolution | None currently — the core-only settings subset is implemented (SPEC-007) | N/A |
| `src/media` (ADR-027) | Resolves `ogImage`/`twitterImage` media refs to immutable rendition URLs | Referenced asset has been deleted | Omit the image field from OG/Twitter output (EC-07); do not fail the rest of the head render |
| `core` outbox/event bus (`entry.published`/`updated`/`unpublished`) | Drives sitemap cache invalidation | Event delivery fails or is delayed | Sitemap cache serves stale content until the next event or a manual regenerate (REQ-13) |
| `src/identity` (ADR-021 `authorize()` + permission catalog) | Permission-gated authorization for every write and admin-read route | None currently — implemented and exercised by every other admin section | N/A |

---

## Open Questions

- OQ-01: Should the `seo.sitemap.collect` hook be wired into a live (even if empty) registry in v1, or left as a declared-but-uninvoked contract until a real second contributor (e.g. a taxonomy/term plugin) exists? — Owner: Software Architect — Resolve by: 2026-07-20
- OQ-02: Exact Drizzle migration/index naming for the new `posts.seo_ext_json` column and its sitemap-eligibility index (mechanical naming convention alignment with existing migrations, no behavior impact) — Owner: Software Architect — Resolve by: 2026-07-20

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Sitemap XML and `robots.txt` are two small, deterministic flat-text formats generated by direct string templating — no schema/XML library is warranted for two fixed shapes this narrow; JSON-LD is plain object construction (native `JSON.stringify`). |
| II — Test-First | COMPLIES | TDD Agent certifies failing tests against this spec before the Programmer writes implementation code, per Article II. |
| III — Simplicity Gate | COMPLIES | Every new surface traces to a requirement: `SeoQueryPort` methods → REQ-04/05/06/08/09/13/14; `PageHeadHook`/`SitemapCollectHook` → REQ-06/07/08; `posts.seo_ext_json` → REQ-01/02/03; `seo.*` settings → REQ-11/12. |
| IV — Anti-Abstraction Gate | COMPLIES | ADR-032 §7 already establishes no new infrastructure port for this feature; every capability handle (`SeoContentReadCap`/`SeoUrlCap`/`SeoSettingsCap`/`SeoCacheCap`) wraps an already-implemented lib (post, routing, settings, cache) reused by handle, and `page.head`/`seo.sitemap.collect` are hooks, not ports — consistent with the existing Rule-of-Two discipline already applied by ADR-021/ADR-006. |
| V — Integration-First Testing | COMPLIES | Every P1 AC above is verified at a real HTTP boundary: the admin `/api/admin/v1/workspaces/:workspaceId/seo/**` routes, or the public `/sitemap.xml`/`/robots.txt` routes. |
| VI — Security-by-Default | EXCEPTION (standing v1, per Constitution Art. VI) | The dev server has no full auth layer yet; this spec still enforces `admin.seo.manage` at the existing `authorize()` gateway for every write and admin-read route. `sitemap.xml`/`robots.txt` are intentionally public/unauthenticated by design (read-only, no PII, matches the WordPress/Yoast convention) — this is a deliberate scope decision (REQ-08/09), not an instance of the standing no-auth gap. |
| VII — Spec Integrity | COMPLIES | This spec's `spec_id`/`content_hash` are referenced by every downstream stage per Article VII. |
| VIII — Observability | COMPLIES | Every write path (`entry meta write`, `settings write`, `sitemap regenerate`) emits a structured error on failure (`errors.spec.md` §2) and the cache-invalidation path is driven by the existing outbox event mechanism (`workspaceId`/`entryId` as the available correlation identifiers, matching the deferred-`correlationId` pattern used elsewhere in this codebase). |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing `ADS-memory/reports/pipeline/` folders — `008-seo` is unused)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled (even if answer is "no deadline")
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has precedence, ordering, dedup, and default-value rules)
- [x] traceability.spec.md complete (pending implementation — all rows seeded)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `brownfield` — brownfield evidence paths recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Read `src/seo/ports.ts` and `src/seo/types.ts` before writing any adapter/route code — reconcile against this spec's corrections (permission namespace, retired `seo.base_url`, the `posts.seo_ext_json` storage decision) rather than the stub's literal current shape.
- Keep `getEntryMeta`/`renderHead`/`buildSitemap`/`buildRobots`/`analyzeEntry` behind the single `SeoQueryPort` surface (INV-09) — no route may bypass it.

Ask before:
- Wiring `seo.sitemap.collect` to any real second contributor beyond an empty registry (OQ-01).

Never:
- Introduce a `seo.base_url`-shaped setting or read raw request host for any absolute URL (INV-07).
- Add a new SQL table for SEO data (REQ-02).
