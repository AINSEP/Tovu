# Feature Spec: Admin Frontend Mop-Up (Media, Taxonomy, Redirects, Collections, SEO)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-037 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-037-admin-frontend-mopup |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note (disclosed)

The same admin-frontend coverage sweep that found the Comments gap (SPEC-036) also found 6 smaller PARTIAL-coverage sections — each already wired to real APIs, each missing one slice of what its own backend exposes. One of the 6 (Integrations — "capability check display") turned out to be a false positive on closer read: `src/server/routes/admin/integrations/deps.ts` is a type-only file, not a route; the `originRegistry` capability check it names happens server-side inside `create.ts`'s own validation, not as a separate endpoint a frontend would call. That item is dropped. This spec covers the remaining 5, batched into one combined lightweight spec per explicit user request (these are single-endpoint additions to already-shipped sections, not new sections — full per-item `feature.spec.md` ceremony is disproportionate).

**What did NOT change (explicit, not an oversight):** no backend route, port, or write-service change anywhere in this spec — every endpoint below already exists. Several client functions in `apps/admin/src/lib/api.ts` already exist too (`updateMedia`, `getRedirectHits`, `updateContentTypeFields`, `createTaxonomy`) and are simply unused by their section's UI; only `importRedirects` and the 3 per-entry SEO functions are net-new client code.

## Requirements

### Media (`apps/admin/src/sections/Media.tsx`)

- REQ-01: Media library items shall have an edit affordance (e.g. a row action or a click-to-expand panel) that opens a form for `title`/`alt`/`caption`/`credit` and calls the already-existing `api.updateMedia(id, patch)` (client function exists, unused) → `PATCH /api/admin/v1/workspaces/:workspaceId/media/:mediaId` (`media.update`-gated). Partial patch — only send changed fields, matching the backend's own optional-field contract.

### Categories & Tags (`apps/admin/src/sections/Taxonomy.tsx`)

- REQ-02: The section shall gain a "create taxonomy" affordance (name + hierarchical toggle) calling the already-existing `api.createTaxonomy({name, hierarchical})` (client function exists, unused) → `POST /api/admin/v1/taxonomy` (`admin.taxonomy.manage`-gated), and the new taxonomy shall appear in the list on success without a manual page reload.

### Redirects (`apps/admin/src/sections/Redirects.tsx`)

- REQ-03: Each redirect row shall display its hit count, calling the already-existing `api.getRedirectHits(id)` (client function exists, unused) → `GET .../redirects/:id/hits` (`admin.redirects.manage`-gated). Implementer's choice whether this is fetched eagerly per-row or lazily on expand/hover — avoid an N+1 burst on initial list load if the list can be large; a lazy per-row fetch on visible-row basis or a single batch-friendly approach are both acceptable, just don't fire all rows' hit-count requests synchronously on mount if the list commonly has >20 rows.
- REQ-04: The section shall gain a bulk-import affordance (e.g. paste/upload a JSON array of `{source, target, statusCode, ...}` rule objects) calling a new `api.importRedirects(rules)` client function → `POST .../redirects/import` (`admin.redirects.manage`-gated, 1-500 items per the backend's own `MAX_IMPORT_BATCH_SIZE`). The route always returns `207 Multi-Status` — the UI shall surface a per-item success/failure summary (matching `toAdminRedirectImportResponse`'s shape — read it directly, don't guess), not just a blanket success/fail toast, since a partial-batch failure is the route's own designed behavior, not an edge case.

### Collections (`apps/admin/src/sections/Collections.tsx`)

- REQ-05: An existing content type's field schema shall be editable after creation (currently only settable at creation time via local draft state), calling the already-existing `api.updateContentTypeFields(key, {fields, expectedVersion})` (client function exists, unused) → `PUT /api/admin/v1/content-types/:key/fields` (`admin.collections.manage`-gated, optimistic-concurrency via `expectedVersion`, full-replace semantics — the whole `fields` array is sent, not a patch). A 409 (stale `expectedVersion`) shall surface a visible "this content type changed since you loaded it, refresh and try again" message, same pattern as SPEC-036's comment-moderation 409 handling (REQ-07 there) — reuse that message shape/convention, don't invent a new one.

### SEO (`apps/admin/src/sections/Seo.tsx`)

- REQ-06: The section shall gain a per-entry SEO view (entry picker or accessed from the entry's own editor — implementer's choice which entry-selection UX fits best given what's already in this app, e.g. `PostEditor.tsx` may already have a natural slot for a linked SEO panel) that reads via a new `api.getSeoEntry(entryId)` → `GET .../seo/entries/:entryId` and writes partial overrides via a new `api.putSeoEntry(entryId, patch)` → `PUT .../seo/entries/:entryId` (both `admin.seo.manage`-gated).
- REQ-07: The per-entry SEO view shall also surface the entry's SEO score/issues via a new `api.getSeoEntryAnalyze(entryId)` → `GET .../seo/entries/:entryId/analyze` (read-only, no write side) — display the returned score/issues list, exact shape read directly from `analyzeEntry`'s return type in `src/seo/` before building the display, don't guess the field names.
- REQ-08: A `PUT` that fails backend validation (`SeoFieldValidationError`/`SeoInvalidCanonicalUrlError`, both 400) shall surface the real backend error message, not a generic "something went wrong."

### Cross-cutting

- REQ-09: Every new client call shall go through `apps/admin/src/lib/api.ts`, matching every existing section's convention — no ad hoc `fetch()` calls inside any section component (same rule as SPEC-036's REQ-12).
- REQ-10: None of the 5 sections' existing functionality (list rendering, existing actions already wired) shall regress — each is an additive change to an already-shipped, already-working section.

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Editing a media item's title via the new form persists it (verified via a subsequent GET/list refresh showing the new title), and a field left unchanged is not overwritten (partial-patch proof — change only `title`, confirm `alt`/`caption`/`credit` are untouched).
- AC-02 (REQ-02) [P1]: Creating a new taxonomy via the form makes it appear in the list without a manual reload, and a subsequent independent list fetch confirms it's real (not just optimistic local state).
- AC-03 (REQ-03) [P1]: A redirect rule with recorded hits shows a nonzero count matching what `getRedirectHits` actually returns; a rule with zero hits shows `0`, not a missing/blank field (the backend's own "still 200s with hitCount: 0" contract, per `hits.ts`'s own doc comment).
- AC-04 (REQ-04) [P1]: Importing a batch with a mix of valid and invalid rules (e.g. one with a malformed `source`) shows the `207` per-item breakdown — which rules succeeded, which failed and why — not a blanket pass/fail.
- AC-05 (REQ-05) [P1]: Editing an existing content type's fields (e.g. adding a new field) persists via the real PUT, is reflected on a subsequent fetch, and a deliberately stale `expectedVersion` (two edits racing) surfaces the 409 message without silently applying the stale write.
- AC-06 (REQ-06/07) [P1]: The per-entry SEO view loads real current overrides for a real entry, a partial PUT persists and is reflected by a subsequent GET, and the analyze view shows real score/issues data (not zeroed-out placeholder values) for an entry with actual SEO-relevant content.
- AC-07 (REQ-08) [P1]: Submitting an invalid canonical URL surfaces the backend's real `SeoInvalidCanonicalUrlError` message text, not a generic error.
- AC-08 (REQ-09) [P1]: `grep -rn "fetch(" apps/admin/src/sections/{Media,Taxonomy,Redirects,Collections,Seo}.tsx` (or wherever the new code lands) returns no matches outside `lib/api.ts` itself.
- AC-09 (REQ-10) [P1]: Full regression: `npx tsc --noEmit` clean (both repo root and `apps/admin/`), `apps/admin: npm run build` succeeds, and the existing backend test suite (unaffected by frontend-only changes) still shows only the 2 known pre-existing failures.

## Non-Goals

- The Integrations "capability check" item — dropped as a false positive (see Scope Note); no backend endpoint exists for this, nothing to wire.
- Bulk operations beyond Redirects' existing import route (no bulk-edit for Media/Collections/SEO — matches each backend's own current single-item route shape).
- Any backend route, port, or write-service change — every endpoint this spec's UI calls already exists.
- A dedicated entry-picker UI framework for SEO if one doesn't already exist in this app — reuse whatever entry-selection pattern (dropdown, search, linked-from-editor) is cheapest given what's already built, per REQ-06's own "implementer's choice."

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | AC-01–09 are all observable through real HTTP/build/typecheck — verified before/alongside implementation, same discipline as SPEC-036. |
| III — Simplicity Gate | COMPLIES | Every change is additive to an already-shipped section, directly traceable to REQ-01–10; no new abstraction, no new component framework. |
| IV — Anti-Abstraction Gate | N/A | No new port/adapter — frontend-only, consuming already-built backend ports. |
| V — Integration-First Testing | COMPLIES | Every P1 AC is verified at the real HTTP boundary against the real backend routes, not mocked. |
| VI — Security-by-Default | COMPLIES | No authz change — every route called is already gated exactly as it was before this spec; this spec only adds UI callers. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal — surfaces existing backend errors/responses, does not add new event emission. |
