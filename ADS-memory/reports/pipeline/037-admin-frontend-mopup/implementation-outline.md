# Implementation Outline: Admin Frontend Mop-Up (Media, Taxonomy, Redirects, Collections, SEO)

- Spec: SPEC-037 v1.0.0
- Status: PRODUCED (retroactive, backfilled after implementation per explicit user request)
- Trigger result: none of the standard triggers fire strongly enough to warrant a heavyweight outline — see Trigger Decision Matrix. This is intentionally a light outline.
- Date: 2026-07-16T00:00:00Z (backfilled)
- Author: Software Architect (in-session, direct — Claude Code host, per explicit user request)

> 5 small, independent, additive changes to 5 already-shipped sections. No new backend contract, no composition-root change, no cross-boundary invariant. A full Module/Contract/Wiring Map per the heavyweight template would document ceremony, not signal — this outline is deliberately proportionate.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence |
|---|---:|---|
| Boundary Cross | marginal | Each item touches exactly one existing section file + `lib/api.ts`; no item spans more than 2 files |
| Contract Change | no | 4 of 5 items reuse pre-existing, already-defined `lib/api.ts` client functions (`updateMedia`, `createTaxonomy`, `getRedirectHits`, `updateContentTypeFields`) that were simply unused before this spec. Only `importRedirects` + 3 SEO functions are net-new client code, and none define a new backend contract — they call already-shipped routes. |
| System Wiring | no | No composition-root change |
| Critical Cross-Boundary Invariant | no | No new invariant introduced |
| Parallelization Ambiguity | no | 5 independent items, single implementer, sequential commits |

## File Map

| File | Item(s) | Change |
|---|---|---|
| `apps/admin/src/sections/Media.tsx` | Media edit | `EditMediaRow` (expandable per-row panel), `diffMediaMetadata` helper for partial patches |
| `apps/admin/src/sections/Taxonomy.tsx` | Create taxonomy | `NewTaxonomyForm` |
| `apps/admin/src/sections/Redirects.tsx` | Hit counts + import | `HitCountCell` (lazy, button-triggered), `ImportRedirectsForm` (207 per-item breakdown) |
| `apps/admin/src/sections/Collections.tsx` | Field-schema edit | `EditFieldsDialog` (full-replace + `expectedVersion`, 409 handling) |
| `apps/admin/src/sections/Seo.tsx` | Per-entry SEO | `SeoEntrySection` (entry picker), `SeoEntryPanel` (partial override edit), `AnalyzePanel` (score/issues) |
| `apps/admin/src/lib/api.ts` | Cross-cutting | +114 lines: `importRedirects` (new), `getSeoEntry`/`putSeoEntry`/`getSeoEntryAnalyze` (new); 4 pre-existing functions newly consumed |

## Test Expectations (mapped to spec ACs)

Same verification method as SPEC-036 (no frontend component-test harness exists): a scratch Node/tsx integration script booting the real `createApp()`/`createRouteDeps()` composition, exercising the actual `lib/api.ts` functions over real HTTP. 8 checks, all passing. Script not committed (same disclosed gap as SPEC-036).

| AC | Verified by |
|---|---|
| AC-01 (Media partial patch) | Smoke script: title-only patch left `alt`/`caption`/`credit` untouched; confirmed via fresh `listMedia()` |
| AC-02 (Taxonomy create, real not optimistic) | Smoke script: new taxonomy confirmed via independent `listTaxonomies()` call, not just local state |
| AC-03 (hit counts, zero-hit case) | Smoke script: zero-hit rule returns `0`, not blank |
| AC-04 (207 import breakdown) | Smoke script: mixed valid/invalid batch returned 1 created + 1 failed with index/code/message |
| AC-05 (Collections 409) | Smoke script: genuine race reproduced (apply update, retry with stale version) — real 409, stale write confirmed never applied |
| AC-06 (SEO round trip + analyze) | Smoke script: real PUT/GET round trip and analyze call |
| AC-07 (SEO validation error surfaced) | Smoke script: invalid canonical URL (`javascript:...`) returned real backend text and code, not generic message |
| AC-08 (no ad hoc fetch) | `grep -rn "fetch(" apps/admin/src/sections/{Media,Taxonomy,Redirects,Collections,Seo}.tsx` — independently re-run by Coordinator, zero matches |
| AC-09 (regression) | `npx tsc --noEmit` (root + admin) and `npm run build` re-run independently by Coordinator, both clean |

## Critical Invariants

None specific to this spec.

## Downstream Handoff Notes

- Same scratch-script-not-retained gap as SPEC-036 — a future consolidation pass could commit a reusable version of this verification pattern as an actual test file.
- Redirects hit-count fetch is button-triggered per-row (implementer's choice, spec allowed either lazy-on-visible or batch) — structurally guaranteed to avoid an N+1 burst (no request fires without a click), but this wasn't separately load-tested against a list with e.g. 100+ rows.
- SEO entry-picker is a standalone dropdown in `Seo.tsx` rather than embedded in `PostEditor.tsx` (spec named this implementer's choice) — if a future spec wants the SEO panel surfaced directly from the post/page editor instead, that's a UX relocation, not a backend change.
