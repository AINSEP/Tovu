# Traceability Matrix: seo

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
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
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every REQ/AC/INV/EC/error-code/behavior-rule from the rest of the package to its eventual implementation and test. All rows are `pending` — this spec has not yet gone through TDD/implementation.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Read/write per-entry SEO override fields, gated by `admin.seo.manage` | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Valid PUT persists and round-trips on GET | P1 | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-01) | GET with no overrides returns empty overrides + derived effective meta | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Per-entry SEO data persists on the entry's own row, no new table | — | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | Write is stored in existing `posts` row | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | Reject writes with unregistered keys | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Unregistered key rejected, nothing persisted | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Effective meta = override ▸ site default ▸ derived | — | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-04) | No override + site default set → site default wins | P1 | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-04) | Override set → override wins over site default | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-04) | No override, no default → derived from excerpt | P1 | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-04) | No canonical override → routing-resolved canonical | P2 | pending | pending | pending | pending | PENDING |
| REQ-05 | One shared effective-meta computation for admin/public/analyze | — | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-05) | `getEntryMeta` and `renderHead` resolve identical values | P1 | pending | pending | pending | pending | PENDING |
| REQ-06 | `page.head` output is ordered, deduped, sanitized IR only | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-06) | Every head element is a tagged `HeadElement`, never raw HTML | P1 | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-06) | Colliding dedup keys collapse to one element | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Derived, type-mapped JSON-LD + BreadcrumbList | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-07) | `page` kind, no override → `WebPage` | P1 | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-07) | `post` kind, no override → `Article` | P1 | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-07) | `schemaType` override changes emitted `@type` | P2 | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-07) | Ancestor chain present → BreadcrumbList included | P2 | pending | pending | pending | pending | PENDING |
| REQ-08 | Public `sitemap.xml`, published + non-noindex only | — | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-08) | Noindex post excluded, non-noindex post included | P1 | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-08) | Draft post excluded | P1 | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-08) | No auth required, returns 200 | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Public `robots.txt` from policy + sitemap-enabled | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-09) | No auth required, returns 200 | P1 | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-09) | Sitemap enabled → `Sitemap:` line present | P1 | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-09) | Sitemap disabled → no `Sitemap:` line | P2 | pending | pending | pending | pending | PENDING |
| REQ-10 | Sitemap cache invalidated on publish/update/unpublish | — | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-10) | Publish reflected in next sitemap fetch | P1 | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-10) | Unpublish reflected in next sitemap fetch | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Read/write workspace `seo.*` settings, gated by `admin.seo.manage` | — | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-11) | Settings PUT persists and round-trips on GET | P1 | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-11) | Invalid `titleTemplate` rejected, prior settings unchanged | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Absolute URLs always via routing `canonicalUrl`, never a local base-URL setting | — | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-12) | Sitemap/canonical/OG URLs derive origin from routing, not from SEO settings | P1 | pending | pending | pending | pending | PENDING |
| REQ-13 | Manual sitemap regeneration | — | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-13) | Regenerate rebuilds cache, next fetch reflects changes | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | `analyzeEntry` SEO score/issues, admin-panel only | — | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-14) | Missing title/description flagged as an issue | P2 | pending | pending | pending | pending | PENDING |
| REQ-15 | Reject writes without `admin.seo.manage` | — | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-15) | Authenticated but unauthorized → `FORBIDDEN`, no change | P1 | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-15) | Unauthenticated → `UNAUTHENTICATED` | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Throwing `page.head` contributor is dropped, not fatal | — | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-16) | Throwing contributor dropped, page still renders | P1 | pending | pending | pending | pending | PENDING |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | `posts.seo_ext_json`, when non-null, must always validate against the registered `SeoExtFields` shape | pending | pending | PENDING |
| INV-02 | The effective per-entry `title` must never be empty | pending | pending | PENDING |
| INV-03 | `page.head` output must never contain a raw HTML string | pending | pending | PENDING |
| INV-04 | `sitemap.xml` must never include a `noindex` entry | pending | pending | PENDING |
| INV-05 | `sitemap.xml` must never include a non-`published` entry | pending | pending | PENDING |
| INV-06 | Per-entry/settings writes must never bypass `admin.seo.manage` | pending | pending | PENDING |
| INV-07 | No SEO code path may read/write a `seo.base_url`-shaped setting | pending | pending | PENDING |
| INV-08 | Sitemap cache key always workspace-prefixed | pending | pending | PENDING |
| INV-09 | All SEO reads only through the single `SeoQueryPort` surface | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Fresh post with no SEO overrides at all | pending | pending | PENDING |
| EC-02 | Entry override `noindex: false` beats a workspace default `true` | pending | pending | PENDING |
| EC-03 | Write with unregistered key is rejected wholesale | pending | pending | PENDING |
| EC-04 | Empty workspace → valid empty `<urlset>` | pending | pending | PENDING |
| EC-05 | Unpublish invalidates sitemap cache | pending | pending | PENDING |
| EC-06 | SEO's own head contributor throws → dropped, page still 200 | pending | pending | PENDING |
| EC-07 | Deleted media ref → image field omitted, rest of head unaffected | pending | pending | PENDING |
| EC-08 | Concurrent regenerate requests → one deterministic cache entry | pending | pending | PENDING |
| EC-09 | `sitemap_enabled=false` → no `Sitemap:` line in robots.txt | pending | pending | PENDING |
| EC-10 | Cross-domain canonical override accepted as-is | pending | pending | PENDING |
| EC-11 | Draft entry with no explicit `noindex` override defaults to `noindex: true` | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| `SEO_FIELD_VALIDATION_ERROR` | pending | pending | pending | PENDING |
| `SEO_INVALID_CANONICAL_URL` | pending | pending | pending | PENDING |
| `SEO_SETTINGS_VALIDATION_ERROR` | pending | pending | pending | PENDING |
| `SEO_ENTRY_NOT_FOUND` | pending | pending | pending | PENDING |
| `UNAUTHENTICATED` | pending | pending | pending | PENDING |
| `FORBIDDEN` | pending | pending | pending | PENDING |
| `INTERNAL_ERROR` | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Effective meta precedence (per field) | § 1.1 | pending | pending | PENDING |
| `page.head` ordering by priority | § 2.1 | pending | pending | PENDING |
| Sitemap ordering by keyset `id` | § 2.2 | pending | pending | PENDING |
| Default: `seo.title_template = "%s"` | § 3 | pending | pending | PENDING |
| Default: `seo.default_robots = {false,false}` | § 3 | pending | pending | PENDING |
| Default: non-published derived `noindex = true` | § 3 | pending | pending | PENDING |
| Limit: 500-char string fields / 2048-char URL fields | § 4 | pending | pending | PENDING |
| Limit: 50 `robotsRules` max | § 4 | pending | pending | PENDING |
| Dedup: `HeadElementKey` collision → highest-priority wins | § 5 | pending | pending | PENDING |
| Tie-break: same key + same priority → later-registered wins | § 6.1 | pending | pending | PENDING |
| Edge: 500/501-char boundary on `title` | § 7 | pending | pending | PENDING |
| Edge: 50/51-rule boundary on `robotsRules` | § 7 | pending | pending | PENDING |
| Edge: explicit `noindex:false` on a draft still wins over the derived default | § 7 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All rows above | Spec stage — TDD/implementation has not started | At Software Architect / TDD dispatch | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| — | — | — | — |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| — | — | — | — |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| `seo.sitemap.collect` real invocation (OQ-01) | Future taxonomy/term-content spec | No second real contributor exists in this repo yet | ADR-032 §8 (named deferred seam), Coordinator |
| `analyze_seo` protocol/MCP exposure | ADR-032 §8 "Phase-5" | Explicitly named out-of-scope for this pass | ADR-032 |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — entire package is pre-implementation, expected at this stage
- [x] Section 6.2 (untested) is empty or all entries are DEFERRED with approval
- [x] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — N/A, no rows are past PENDING yet

**[ ] TRACEABILITY COMPLETE** — not yet; this is expected and correct at spec stage (`traceability_status: PENDING IMPLEMENTATION`).

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent | 2026-07-13 | Seeded from `feature.spec.md`/`errors.spec.md`/`behavior.spec.md` v1.0.0 |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
