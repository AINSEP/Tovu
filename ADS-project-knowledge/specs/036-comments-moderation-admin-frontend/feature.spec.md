# Feature Spec: Comments Moderation Admin Frontend

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-036 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-036-comments-moderation-admin-frontend |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note (disclosed)

A fresh admin-frontend coverage sweep this session (2026-07-16) found Comments is the single largest frontend/backend gap in the whole admin: ADR-031's backend (SPEC-033 v1 + SPEC-035 follow-up, both merged and audit-clean this session) ships a full moderation queue, 5 moderation actions, and a settings GET/PUT surface — but `apps/admin/src/App.tsx`'s section router has no `"comments"` case, so the nav entry falls through to the generic static `Placeholder` component with zero API calls. This spec closes that gap: a moderation-queue list view, the 5 moderation actions, and a settings form, mirroring `Members.tsx`'s established list+action shape (the closest existing analog per the sweep).

**What did NOT change (explicit, not an oversight):** no backend route, port, or write-service code — every endpoint this spec's UI calls already exists, built and merged this session. The public-facing comment widget/submission form (ADR-025 origin-isolation host) remains unbuilt and out of scope, same disclosed blocker ADR-031 itself names.

## Problem Statement

**Current state:** `src/server/routes/admin/comments/{moderation-queue,moderate,get-settings,put-settings}.ts` expose a complete, permission-gated moderation surface (`comments.read`/`.moderate`/`.delete`/`.delete.force`/`.configure`). Nothing in `apps/admin/` calls any of it. An operator navigating to the Comments nav entry sees a static placeholder with no way to see, moderate, or configure comments at all — the backend's entire value is unreachable.

**Desired state:** A `Comments.tsx` section (mirroring `Members.tsx`'s shape) wired into `App.tsx`'s router and `nav.ts`, giving an operator: a filterable moderation queue (by status: pending/approved/spam/trash), a way to take each of the 4 real per-comment actions (approve/spam/trash/restore) plus purge, and a settings form for the 6 `CommentsSettings` fields.

## Requirements

- REQ-01: `apps/admin/src/sections/Comments.tsx` shall render a moderation-queue list for the current workspace, calling `GET /api/admin/v1/workspaces/:workspaceId/comments/queue` (`api.listCommentsQueue` in `lib/api.ts`, new).
- REQ-02: The queue list shall support filtering by `status` (`pending` | `approved` | `spam` | `trash`, matching `CommentStatus` exactly — the query param the backend route already accepts, default `pending`) via a status selector that re-fetches on change.
- REQ-03: The queue list shall be keyset-paginated using the backend's `nextCursor` (matching `ModerationQueuePage`'s shape) with a "Load more" affordance — mirrors `Redirects.tsx`'s existing cursor-pagination pattern in this same admin app, not a novel pattern.
- REQ-04: Each queue row shall display: author name, a truncated body preview, status, created-at, and depth (thread indicator) — the fields already present on `CommentRecord` the queue route already returns; no new backend field is needed.
- REQ-05: Each queue row shall expose the 4 real per-comment moderation actions the backend supports — `approve` (`comments.moderate`), `spam` (`comments.moderate`), `trash` (`comments.delete`), `restore` (`comments.moderate`) — each calling `POST /api/admin/v1/workspaces/:workspaceId/comments/:commentId/{action}` with the comment's current `expectedVersion` (optimistic-concurrency, required by the route) and refetching the row's queue page on success.
- REQ-06: A `purge` action (`comments.delete.force`) shall be exposed ONLY from the `trash` status filter view (mirrors the backend's own trash→purge ladder framing in `types.ts`'s doc comment) with a confirmation step before the irreversible `POST .../purge` call, since purge has no `expectedVersion` guard on the backend and is destructive.
- REQ-07: A 409 response from any moderation action (stale `expectedVersion`) shall surface a visible "this comment changed since you loaded it, refresh and try again" message and NOT silently retry or apply a stale write — the route's own 409 body (`{error, currentVersion}`) already carries what's needed to inform this message.
- REQ-08: `apps/admin/src/sections/CommentsSettings.tsx` (or an inline settings panel within `Comments.tsx` — implementer's choice, matching whichever existing sibling pattern reads cleaner, e.g. `Seo.tsx`'s single-file settings-plus-list shape vs. a split file) shall render a form for all 6 `CommentsSettings` fields (`enabled`, `requireModeration`, `maxDepth`, `closeAfterDays`, `spamAutoRejectScore`, `maxPerIpPerHour`), reading via `GET .../comments/settings` and writing via `PUT .../comments/settings` (partial-patch semantics — only send changed fields, matching the backend's own patch contract).
- REQ-09: The settings form shall client-side validate `spamAutoRejectScore` to `[0,1]` and reject a save attempt outside that range before the network call — mirrors the backend's own `validateCommentsSettingsPatch` bound, so a rejected save is caught early with a clear message rather than surfacing the backend's generic 400.
- REQ-10: `closeAfterDays` shall render as an optional numeric field where empty/blank means "never closes" (`null` on the wire) — matching the backend's own `CLOSE_AFTER_DAYS_NEVER_SENTINEL` semantics at the type layer (the UI never sends the sentinel value itself, only `null` or a positive number, exactly as `put-settings.ts`'s own contract expects).
- REQ-11: `apps/admin/src/App.tsx`'s section-router switch shall gain a `"comments"` case mounting `Comments.tsx`, and `apps/admin/src/nav.ts`'s Comments entry shall route there instead of falling through to `Placeholder`.
- REQ-12: All Comments admin API calls shall go through `apps/admin/src/lib/api.ts` (new `listCommentsQueue`/`moderateComment`/`purgeComment`/`getCommentsSettings`/`putCommentsSettings` functions), matching every other section's existing convention — no ad hoc `fetch()` calls inside `Comments.tsx` itself.

## Acceptance Criteria

- AC-01 (REQ-01/02/03/04) [P1]: Navigating to Comments renders the pending-status queue by default, showing real comments seeded via the backend's ingress path (not mocked), with author/preview/status/created-at/depth visible per row.
- AC-02 (REQ-02) [P1]: Switching the status filter to `spam` re-fetches and shows only `spam`-status comments; switching back to `pending` shows only `pending` again.
- AC-03 (REQ-03) [P1]: With more comments seeded than one page's `limit`, "Load more" fetches the next page using the real `nextCursor` and appends rows without duplicating or dropping any.
- AC-04 (REQ-05) [P1]: Clicking `approve` on a `pending` row calls the real approve route with the row's current version, the row disappears from the `pending` filter view on success (or updates in place if already filtered to `approved`), and re-fetching independently confirms the comment's status is now `approved`.
- AC-05 (REQ-05) [P1]: The same success/refetch behavior holds for `spam`, `trash`, and `restore` (verified against each action's own real route and permission).
- AC-06 (REQ-06) [P1]: `purge` is visible only in the `trash` filter view, requires an explicit confirmation step, and successfully removes the comment from every subsequent queue fetch across all statuses after confirming.
- AC-07 (REQ-07) [P1]: Simulating a stale `expectedVersion` (two moderation calls racing on the same comment) surfaces the 409 message on the losing call without silently applying it or crashing the UI.
- AC-08 (REQ-08/09/10) [P1]: The settings form loads the real current values via GET, a valid partial save (e.g. only `requireModeration`) persists and is reflected on next GET, and a save with `spamAutoRejectScore` outside `[0,1]` is rejected client-side with no network call made.
- AC-09 (REQ-08/10) [P1]: Setting `closeAfterDays` to blank/empty and saving persists `null` on the backend (verified via a direct GET after save); setting it to a positive number persists that number.
- AC-10 (REQ-11) [P1]: A principal with `comments.read` but lacking `comments.moderate`/`.delete`/`.configure` can view the queue but the corresponding action buttons are hidden or disabled, matching what the backend would 403 on anyway — client-side affordance hiding only, the real authz enforcement stays server-side (Art. VI — this is UX, not the security boundary).
- AC-11 (REQ-12) [P1]: The full existing admin frontend test/build (if one exists for this app) is unaffected — a regression check, not new coverage this spec itself requires beyond what AC-01–10 already cover through real HTTP.

## Non-Goals

- The public-facing comment submission widget/panel (ADR-025 origin-isolation host does not exist yet) — same disclosed blocker every prior Comments spec in this repo has named.
- Any backend route, port, or write-service change — every endpoint this spec's UI calls already exists and is audit-clean as of this session's `/audit-work` round (TM-adr046-phase3-comments-audit-001, PASS 9.4/10).
- Reply-threading UI beyond a depth indicator (no nested-reply composer in the admin — moderation only, not authoring).
- Bulk moderation actions (select-all-approve, etc.) — v1 is per-row actions only, matching the backend's per-comment route shape (no bulk route exists).
- `maxPerIpPerHour`'s live-reconfiguration into the actual rate limiter — disclosed, pre-existing, unrelated backend gap (`comments/index.ts`'s own comment); the settings form still lets an operator SET the value even though the rate limiter doesn't yet re-read it live, consistent with how the setting is already exposed on the backend's own GET/PUT contract.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency; reuses this app's existing fetch-wrapper `lib/api.ts` pattern and whatever UI primitives sibling sections (`Members.tsx`, `Redirects.tsx`) already use. |
| II — Test-First | COMPLIES | AC-01–10 are all observable through real HTTP against the real backend composition — TDD stage certifies failing tests against these before implementation, same as every other spec in this repo. |
| III — Simplicity Gate | COMPLIES | No new abstraction — one section component (plus an optional split settings file, implementer's choice) and 5 new `lib/api.ts` functions, directly tracing to REQ-01–12. No bulk-action framework, no generic CRUD scaffold. |
| IV — Anti-Abstraction Gate | N/A | No new port/adapter — this is a frontend-only spec consuming already-built backend ports. |
| V — Integration-First Testing | COMPLIES | Every P1 AC is verified at the real HTTP boundary against the real backend routes (AC-01–10), not mocked. |
| VI — Security-by-Default | COMPLIES | Client-side affordance hiding (AC-10) is UX only; the actual authz boundary remains server-side `authorize()` on every existing route, unchanged by this spec. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal — this UI surfaces existing backend state/errors (including the 409 message per REQ-07), it does not add new event emission. |
