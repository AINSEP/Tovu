# State Contract Spec: seo

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/state.spec.md`

- Spec ID: `SPEC-008`
- Feature: `FEAT-008-seo`
- Version: `1.0.0`
- Content Hash: `sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128`
- Last Edited: `2026-07-13T20:18:23Z`

## Purpose
Defines persistent and derived state, legal transitions, selectors, and invariants for the SEO admin section, in a language-neutral format.

## 0) Brownfield Storage Decision (read first)

ADR-032 §2 designs per-entry SEO storage as the generic ADR-022 model:
`entries.fields.ext.seo.*`, a namespaced JSON bag on a generic `entries` table with a
content-type registry. **That generic model does not exist in this repo.** The only
implemented content storage is the bespoke `posts` table
(`src/infra/db/schema.ts` → `posts`, `src/features/post/post.ts` → `PostRecord`),
which has no `fields`/`ext` JSON column of any kind — its columns are fixed:
`id, workspace_id, title, slug, body_json, status, kind, updated_at, version`.

**Decision (this spec, not a new architecture debate):** add one new nullable
column, `seo_ext_json TEXT`, to the existing `posts` table. It stores exactly the
`SeoExtFields` JSON shape ADR-032 §2 / `src/seo/types.ts` already define — the same
keys, same validation rules, same optionality. This keeps ADR-032's "zero new
tables" intent (no `seo_meta` table) while attaching to what the codebase actually
has today. When (if) the generic ADR-022 `entries` migration lands, this column's
contents map onto `entries.fields.ext.seo` **by a rename, not a reshape** — the JSON
shape does not change.

This resolves the one genuine ambiguity the Coordinator flagged between the ADR and
the code stub; it is recorded here rather than left as `[NEEDS CLARIFICATION]`
because the resolution follows directly from (a) ADR-032 §2's own JSON shape and
(b) the precedent of every other Wave-1 sweep ADR (029/030/033/034/035/036)
attaching its own new columns/tables directly rather than waiting on ADR-022.

## 1) State Shape

### 1.1 Persistent: `posts` table addition
| Field | Type | Nullable | Initial Value | Description |
|---|---|---|---|---|
| `seo_ext_json` | `TEXT (serialized SeoExtFields JSON)` | yes | `null` | Author-authored per-entry SEO override bag. `null` means "no overrides — derive everything." |

No other table changes. No new tables.

### 1.2 Persistent: `seo.*` setting definitions (via `features/settings`, ADR-028 ledger — reuses existing tables, no schema change)
| Setting Key | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `seo.title_template` | `string` | no | `"%s"` | Template applied to an entry's title; `%s` is replaced with the page title. |
| `seo.default_description` | `string` | yes | `null` | Fallback meta description when an entry has no override and no derivable excerpt. |
| `seo.default_og_image` | `string` | yes | `null` | Fallback OpenGraph image (media ref or absolute URL). |
| `seo.twitter_site` | `string` | yes | `null` | Site-level `@handle` for the Twitter `site` card field. |
| `seo.default_robots` | `object {noindex: boolean, nofollow: boolean}` | no | `{noindex: false, nofollow: false}` | Fallback robots directive when an entry has no override. |
| `seo.sitemap_enabled` | `boolean` | no | `true` | Whether `sitemap.xml` is generated/advertised. |
| `seo.robots_policy` | `array<RobotsRule>` | no | `[]` | Per-user-agent allow/disallow rules stored at the site scope. |

**`seo.base_url` is deliberately NOT registered** (ADR-032 Round-3 fold; REQ-12/INV-07)
— `src/seo/types.ts`'s `SeoSettingKey`/`SeoSettings.baseUrl` still include it; that is
a stub/ADR-drift this spec does not carry forward. See §5 "Stub Mismatches."

### 1.3 Derived (computed at read time, never stored)
| Field | Type | Description |
|---|---|---|
| `effective.title` | `string` | override ?? `titleTemplate` applied to `entry.title` |
| `effective.description` | `string \| undefined` | override ?? `seo.default_description` ?? entry excerpt |
| `effective.canonical` | `string` | override ?? `routing.canonicalUrl` for the entry |
| `effective.robots` | `{noindex, nofollow}` | per-field override ?? `seo.default_robots` ?? `{false, false}`; when no override and no site default apply, the derived `noindex` fallback is `true` instead of `false` for any entry whose `status !== "published"` (EC-11) — an explicit override still wins regardless of publish status |
| `effective.openGraph` | `OpenGraph` | overrides layered over `seo.default_og_image`/derived title/description |
| `effective.twitter` | `TwitterCard` | overrides layered over `seo.twitter_site`/derived title/description |
| `effective.jsonLd` | `JsonLd[]` | derived from content type + `schemaType` override + routing ancestor chain (BreadcrumbList) |
| `sitemap` (per workspace) | `SitemapEntry[]` | published, non-noindex posts/pages, keyset-queried, cached |
| `robotsPolicy` (resolved) | `RobotsPolicy` | `{rules: seo.robots_policy, sitemapUrls: [canonical sitemap URL] if seo.sitemap_enabled else []}` |

## 2) Entity Contracts
```yaml
SeoExtFields:
  title: string?
  description: string?
  canonical: string?          # absolute URL
  noindex: boolean?
  nofollow: boolean?
  schemaType: string?
  ogTitle: string?
  ogDescription: string?
  ogImage: string?            # media ref "{assetId}:{transformName}" or absolute URL
  ogType: enum[website, article, profile]?
  twitterCard: enum[summary, summary_large_image]?
  twitterTitle: string?
  twitterDescription: string?
  twitterImage: string?       # media ref or absolute URL

SeoSettings:
  titleTemplate: string
  defaultDescription: string?
  defaultOgImage: string?
  twitterSite: string?
  defaultRobots: { noindex: boolean, nofollow: boolean }
  sitemapEnabled: boolean
  robotsRules: array<RobotsRule>   # STORED portion only — see §5 note on RobotsPolicy split

RobotsRule:
  userAgent: string
  allow: array<string>?
  disallow: array<string>?

RobotsPolicy:                  # COMPUTED read-only shape returned by buildRobots(); never stored as-is
  rules: array<RobotsRule>     # = SeoSettings.robotsRules, passed through
  sitemapUrls: array<string>   # computed: [] if !sitemapEnabled, else [canonical sitemap URL]

SitemapEntry:
  loc: string                  # absolute URL, from routing.canonicalUrl
  lastmod: string (date-time)? # = entry.updatedAt
  changefreq: enum[always, hourly, daily, weekly, monthly, yearly, never]?
  priority: number?            # 0.0-1.0

SeoMeta:
  title: string
  description: string?
  canonical: string
  robots: { noindex: boolean, nofollow: boolean }
  openGraph: { title: string, description: string?, type: string, url: string, image: string?, siteName: string? }
  twitter: { card: string, title: string, description: string?, image: string?, site: string? }
  jsonLd: array<object>
```

## 3) Action Catalog
| Action | Payload | Precondition | State Changes | Failure Handling |
|---|---|---|---|---|
| `SET_ENTRY_SEO_OVERRIDES` | `{workspaceId, entryId, patch: Partial<SeoExtFields \| null-per-field>}` | entry exists in workspace; caller holds `admin.seo.manage`; patch keys ⊆ registered fields | Merges patch into `posts.seo_ext_json` (a `null` field value clears that key); bumps `posts.version` | Unregistered key → reject whole write, no partial merge (`SEO_FIELD_VALIDATION_ERROR`) |
| `RESOLVE_ENTRY_EFFECTIVE_META` | `{workspaceId, entryId}` | entry exists | Pure read — no state change | Entry not found → `SEO_ENTRY_NOT_FOUND` |
| `UPSERT_SEO_SETTINGS` | `{workspaceId, patch: Partial<SeoSettings>}` | caller holds `admin.seo.manage`; `titleTemplate` (if present) contains exactly one `%s`; `robotsRules.length <= 50` | Writes through the existing ADR-028 settings write chokepoint (`features/settings/write-service.ts`), one `setting_revisions` row per changed key | Invalid `titleTemplate`/rule shape → `SEO_SETTINGS_VALIDATION_ERROR`, no partial write |
| `REGENERATE_SITEMAP_CACHE` | `{workspaceId}` | caller holds `admin.seo.manage` | Rebuilds `ws:{workspaceId}:seo:sitemap` cache entry from a fresh query | Query failure → `INTERNAL_ERROR`, prior cache entry left untouched (fail-safe, not fail-open) |
| `INVALIDATE_SITEMAP_CACHE_ON_ENTRY_EVENT` | outbox `entry.published \| entry.updated \| entry.unpublished` | none (idempotent handler) | Deletes/marks-stale the `ws:{workspaceId}:seo:sitemap` cache entry | Handler is idempotent — a duplicate delivery is a no-op, never a duplicate invalidation error |
| `BUILD_SITEMAP` | `{workspaceId}` | none | Pure read (cache-checked) — returns cached value or computes + caches | Query failure → `INTERNAL_ERROR` |
| `BUILD_ROBOTS` | `{workspaceId}` | none | Pure read — resolves `seo.*` settings, computes `RobotsPolicy` | Settings resolution failure → `INTERNAL_ERROR` |
| `ANALYZE_ENTRY` | `{workspaceId, entryId}` | entry exists; caller holds `admin.seo.manage` (admin-panel-only, REQ-14) | Pure read — computes score + issues over `RESOLVE_ENTRY_EFFECTIVE_META`'s result | Entry not found → `SEO_ENTRY_NOT_FOUND` |

## 4) Selector Contracts
| Selector | Input | Output | Null/Empty Behavior |
|---|---|---|---|
| `getEntryMeta` | `{workspaceId, entryId}` | `SeoMeta` | Throws `SEO_ENTRY_NOT_FOUND` if the entry does not exist — never returns a partial/empty `SeoMeta` |
| `renderHead` | `PageHeadContext` | `HeadElement[]` | Returns `[]` only if every contributor (including SEO's own) throws or yields nothing — never throws itself (REQ-16) |
| `buildSitemap` | `{workspaceId}` | `SitemapEntry[]` | Returns `[]` when the workspace has zero eligible entries (EC-04) — never `null` |
| `buildRobots` | `{workspaceId}` | `RobotsPolicy` | `sitemapUrls: []` when `sitemapEnabled` is `false` (EC-09) — `rules` may be `[]` |
| `analyzeEntry` | `{workspaceId, entryId}` | `SeoAnalysis` | `issues: []` when nothing is flagged; `score` is always a number, never `null`/`NaN` |

## 5) State Invariants
- [ ] `posts.seo_ext_json`, when non-null, always deserializes to a subset of the registered `SeoExtFields` keys (INV-01).
- [ ] `effective.title` is never an empty string (INV-02).
- [ ] `effective.robots.noindex` is always `true` for any entry whose `status !== "published"` when neither an author override nor a site default supplies a value (EC-11) — an explicit override always takes precedence over this derived fallback.
- [ ] `RobotsPolicy.sitemapUrls` is always `[]` when `sitemapEnabled` is `false` and always exactly one canonical sitemap URL when it is `true`.
- [ ] `SitemapEntry[]` returned by `buildSitemap` never includes an entry with `status !== "published"` or effective `noindex === true` (INV-04/INV-05).
- [ ] No `SeoSettings`-shaped value ever carries a `baseUrl`/`seo.base_url` field (INV-07) — this is a hard schema-level omission, not a runtime check.

### Stub Mismatches (from `src/seo/types.ts` / `src/seo/ports.ts`, flagged per Coordinator instruction, not silently resolved)
1. **Storage attachment point.** `types.ts`'s doc comments assume `entries.fields.ext.seo.*` (the generic ADR-022 model) exists. It does not. This spec attaches to a new `posts.seo_ext_json` column instead (§0 above).
2. **Permission namespace.** `SeoPermission` in `types.ts` is still the flat 5-string `seo.read | seo.meta.write | seo.settings.manage | seo.sitemap.manage | seo.analyze` vocabulary from ADR-032 §6's original decision text. ADR-032's own Round-2 fold, the project-wide `sweep-crosscutting-decisions-20260710.md` frozen convention, and every sibling Wave-1 ADR (029/030/033/034/035/036) instead use an `admin` + section + verb namespace shape. This spec uses the single permission `admin.seo.manage` for every admin-gated route (`api.spec.md` §2) — the code-side `PermissionDescriptor` catalog (`src/identity/permissions.ts`) needs exactly one new entry, not five.
3. **`SeoSettings.baseUrl`.** `types.ts` still declares `baseUrl: string` on the resolved `SeoSettings` shape and `"seo.base_url"` in the `SeoSettingKey` union. ADR-032's Round-3 audit fold explicitly retires this field — every absolute URL must come from routing's `canonicalUrl` instead. This spec's `SeoSettings`/setting-definition table (§1.2/§2 above) omits `baseUrl`/`seo.base_url` entirely.
4. **`RobotsPolicy` conflates stored and computed data.** `types.ts`'s `SeoSettings.robotsPolicy: RobotsPolicy` bundles the author-writable `rules` together with the server-computed `sitemapUrls` in one persisted-looking shape. This spec stores only `robotsRules: RobotsRule[]` (§1.2) and computes the full `RobotsPolicy` (rules + `sitemapUrls`) at `buildRobots()` read time (§1.3) — `sitemapUrls` is never itself persisted.

## 6) Acceptance Checklist
- [x] All actions have explicit before/after behavior.
- [x] Selectors are deterministic and side-effect free (except the two invalidation/regenerate actions, which are explicitly cache-mutating and documented as such).
- [x] Entity fields and enums align with `api.spec.md` and `ui.spec.md`.
