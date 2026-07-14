# Behavior Rules Spec: seo

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-008 |
| feature_name | FEAT-008-seo |
| version | 1.0.0 |
| content_hash | sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128 |
| last_edited | 2026-07-13T20:18:23Z |

**Purpose:** SEO has a genuine multi-source precedence chain (author override ▸ site default ▸ derived), a deterministic head-element ordering/dedup rule, and several non-obvious defaults — this file is required, not omittable.

---

## 1. Precedence Rules

### 1.1 Effective per-entry meta resolution

**Situation:** Whenever `getEntryMeta`/`renderHead`/`analyzeEntry` computes any field of the effective `SeoMeta`.

**Sources in precedence order (highest to lowest):**
1. `posts.seo_ext_json.{field}` (author per-entry override) — the editor's explicit, deliberate choice for this one entry.
2. Workspace `seo.*` setting (site default) — the operator's workspace-wide default, where one exists for that field.
3. Derived from the entry / routing / content type — the system's best computed guess when neither of the above is set.

**Field-by-field mapping:**
| Field | Override source | Site-default source | Derived fallback |
|---|---|---|---|
| `title` | `seo_ext_json.title` | — (no site-level title override; only `titleTemplate` shapes it) | `seo.title_template` applied to `entry.title` |
| `description` | `seo_ext_json.description` | `seo.default_description` | entry excerpt (or omitted) |
| `canonical` | `seo_ext_json.canonical` | — | `routing.canonicalUrl` for the entry |
| `robots.noindex` | `seo_ext_json.noindex` | `seo.default_robots.noindex` | `false` if `entry.status === "published"`, else `true` (draft-safety derived fallback — EC-11; an explicit author override still wins per the normal precedence order, this only changes what the *derived* layer supplies) |
| `robots.nofollow` | `seo_ext_json.nofollow` | `seo.default_robots.nofollow` | `false` |
| `openGraph.image` | `seo_ext_json.ogImage` | `seo.default_og_image` | omitted (no `og:image` tag) |
| `twitter.site` | — (no per-entry override exists for the handle) | `seo.twitter_site` | omitted |
| `jsonLd[0].@type` | `seo_ext_json.schemaType` | — | content-type map: `page`→`WebPage`, `post`→`Article` |

**Example:**
- Scenario: an entry has no `description` override; the workspace has `seo.default_description = "A great site"`.
- Result: effective `description` = `"A great site"` (site default wins over derived, since no override exists).

**Test requirement:** The TDD Agent must write a test for each field row above covering (a) override-wins-over-default, (b) default-wins-over-derived, and (c) all-absent-falls-to-derived (or omitted, per the fallback column).

---

## 2. Ordering Rules

### 2.1 `page.head` element ordering (REQ-06)

**Field used for sorting:** `HookHandler.priority` (ascending) at the contributor level, then a fixed internal per-kind priority within the SEO plugin's own contribution.

**SEO's own internal priority bands (deterministic, for testability):**
| Element | Priority |
|---|---|
| `title` | 100 |
| `meta` (description) | 110 |
| `link` (canonical) | 120 |
| `meta` (robots) | 130 |
| `og` (all OpenGraph properties) | 140–149 |
| `og`/`meta` (all Twitter properties) | 150–159 |
| `jsonld` | 900 (renders after all basic tags) |

**Stability:** Within the same priority value, elements are folded in contributor-registration order (stable).

**When overridden:** Core/other bundled plugins may register a `PageHeadHook` with a different `priority` than SEO's; those contributions interleave by that value — SEO does not reorder anyone else's output.

**Invariant:** The final `<head>` element order is always ascending by effective priority; out-of-order output is a bug.

### 2.2 Sitemap entry ordering (REQ-08)

**Order:** `SitemapEntry[]` is ordered by the underlying keyset query's `id` ascending (matches the ADR-022-style partial-expression-index query pattern this spec's `posts`-table index follows — see `state.spec.md` §1).

**Tie-break:** N/A — `id` (UUID) is unique per entry.

**Invariant:** Sitemap page-to-page ordering is stable across calls with an unchanged data set (required for correct keyset pagination).

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `seo.title_template` | Workspace setting | `"%s"` | The least surprising default is "just show the page title" — no branding suffix assumed without operator opt-in. |
| `seo.default_robots` | Workspace setting | `{noindex: false, nofollow: false}` | Safe-open default: new sites want to be indexed by default; an opt-in noindex is a deliberate operator/editor choice, not a system default. |
| `seo.sitemap_enabled` | Workspace setting | `true` | A sitemap is unconditionally useful and has no downside when a site has content; opting out is the deliberate choice. |
| `seo.robots_policy` (rules) | Workspace setting | `[]` | No crawler-specific rules until the operator adds one — an empty rule set still yields a valid, permissive `robots.txt`. |
| `effective.robots.noindex` (derived, non-published entries) | Derived, per-entry | `true` | Drafts must never be accidentally indexable if a route ever exposes them — safety-first override of the site default (EC-11). |
| `ogType` (derived) | Derived, per-entry | `"website"` for `page` kind, `"article"` for `post` kind, absent explicit override | Matches the same content-type mapping used for JSON-LD `@type`, keeping the two derivations consistent. |
| `SeoAnalysis.score` (no issues found) | Derived | `100` | A perfect score with zero issues is the only value consistent with the issues list being the sole scoring input in v1 (no partial-credit rubric is specified). |
| `robotsRules` max length | API validation | `50` | Defensive bound — prevents an unbounded `robots.txt` body; no legitimate SEO configuration needs more than 50 per-user-agent rule blocks. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| `SeoExtFields` string field max length (`title`, `description`, `schemaType`, `ogTitle`, `ogDescription`, `twitterTitle`, `twitterDescription`) | 500 characters | API | A storage/DoS-safety bound, not an SEO best-practice recommendation — this spec does not enforce or invent "ideal" SEO character-count guidance (e.g. "keep titles under 60 chars"); that belongs to `analyzeEntry`'s advisory issues (Section 7), never to hard validation. |
| `SeoExtFields` URL/ref field max length (`canonical`, `ogImage`, `twitterImage`) | 2048 characters | API | Matches common URL-length practical limits; rejected outright above this length, not truncated. |
| `seo.default_description`/`seo.default_og_image` max length | 500 / 2048 characters respectively | API | Same bounds as their per-entry counterparts, for consistency. |
| `seo.robots_policy` rules per workspace | 50 | API | See Default Values above. |
| `RobotsRule.allow`/`disallow` entries per rule | 100 | API | Defensive bound; no legitimate crawl-rule set needs more per user agent. |
| Sitemap internal keyset page size | 500 entries per page | Internal (not caller-controlled — `sitemap.xml` assembles all pages server-side into one document, per REQ-08's "single sitemap" v1 scope) | Bounds a single query's cost; the full sitemap response concatenates pages until exhausted. |

---

## 5. Deduplication Rules

### 5.1 What Counts as a Duplicate (head-element dedup, not resource dedup)

A `HeadElement` is considered a duplicate of another if both share the same `HeadElementKey`:
- `kind: "title"` → key is always the fixed string `"title"` (only one `<title>` tag can ever exist).
- `kind: "meta"` → key is `` `meta:${name}` `` (e.g. `meta:description`, `meta:robots`).
- `kind: "og"` → key is `` `og:${property}` `` (e.g. `og:og:title`).
- `kind: "link"` → key is `` `link:${rel}` `` (e.g. `link:canonical`).
- `kind: "jsonld"` → key is `` `jsonld:${data['@type'] ?? 'untyped'}` ``.

**Not a duplicate if:** the elements have different `kind`, or the same `kind` but a different discriminator value above (e.g. two different `meta` names, or two `jsonld` elements with different `@type`s — both are kept, e.g. `Article` + `BreadcrumbList`).

### 5.2 How Duplicates Are Handled

**At fold time:** When two contributors emit an element with the same `HeadElementKey`, core keeps only the one processed **last** in ascending-priority order (last-writer-wins, per ADR-032 §4) — i.e., among colliding keys, the element with the numerically **highest** `priority` value wins, since it is folded in last.

**Tie-break (Section 6.1):** If two colliding elements also share the exact same `priority` value, the one from the **later-registered** contributor wins (stable insertion order, first-registered contributor's element is overwritten).

**User-facing behavior:** Not user-visible — this is a server-side render-time fold; there is no UI surface for observing a discarded duplicate head element in this v1 scope.

### 5.3 Idempotency vs. Deduplication

Distinct concepts here too: `INVALIDATE_SITEMAP_CACHE_ON_ENTRY_EVENT` is **idempotent** (a duplicate outbox delivery for the same event is a no-op), while `HeadElementKey` collision handling is **deduplication** (two genuinely different contributors producing the same slot). They are not interchangeable and are tested separately.

---

## 6. Tie-Break Logic

### 6.1 Head-element same-priority collision

**When does this apply:** Two `page.head` contributors emit elements with the same `HeadElementKey` AND the same `priority` value.

**Tie-break rule:** The contributor registered later in the composition root's registration order wins (its element is the final one folded, overwriting the earlier one).

**Rationale:** Deterministic without requiring a synthetic secondary sort key; registration order is already fixed at startup and does not vary per-request.

**Invariant:** Given the same set of registered contributors and the same page context, the winning element is always the same.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `title` override is exactly 500 characters | Accepted. | Yes |
| `title` override is exactly 501 characters | Rejected with `SEO_FIELD_VALIDATION_ERROR`. | Yes |
| `canonical` override is exactly 2048 characters and a valid absolute URL | Accepted. | Yes |
| `canonical` override is exactly 2049 characters | Rejected with `SEO_FIELD_VALIDATION_ERROR`. | Yes |
| `canonical` override uses a `javascript:` scheme | Rejected with `SEO_INVALID_CANONICAL_URL`. | Yes |
| `robotsRules` has exactly 50 entries | Accepted. | Yes |
| `robotsRules` has exactly 51 entries | Rejected with `SEO_SETTINGS_VALIDATION_ERROR`. | Yes |
| `titleTemplate` contains no `%s` | Rejected with `SEO_SETTINGS_VALIDATION_ERROR`. | Yes |
| `titleTemplate` contains `%s` twice | Accepted (both occurrences are replaced identically) — not an error, since it is still unambiguous. | Yes |
| Two `page.head` contributors emit the same key with identical `priority` | First-registered contributor's element is overwritten; second wins (§6.1). | Yes |
| All precedence sources absent for `description` | `effective.description` is `undefined`/omitted — no `<meta name=description>` tag is emitted at all (not an empty-string tag). | Yes |
| `analyzeEntry` runs on an entry with no issues found | `score = 100`, `issues = []`. | Yes |
| A non-`published` entry with an explicit `noindex: false` override | `effective.robots.noindex` is `false` — the explicit author override still wins per §1.1's normal precedence order; the draft-safety `true` default only fills in when no override and no site default apply. | Yes |
| A non-`published` entry with no `noindex` override and no `seo.default_robots.noindex` set | `effective.robots.noindex` resolves to `true` (draft-safety derived fallback — see `feature.spec.md` EC-11). | Yes |
