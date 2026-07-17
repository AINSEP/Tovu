# Implementation Outline: Comments Moderation Admin Frontend

- Spec: SPEC-036 v1.0.0
- Status: PRODUCED (retroactive — written after implementation, per explicit user request 2026-07-16: backfill the outline/test-mapping artifact for already-built, already-tested work rather than redo it)
- Trigger result: Boundary Cross, Contract Change (client-side only)
- Date: 2026-07-16T00:00:00Z (backfilled)
- Author: Software Architect (in-session, direct — Claude Code host, per explicit user request)

> This is a genuinely new UI surface (not a mechanical extraction like the ServerModule slices), so it gets a real outline. It is lighter than a from-scratch backend feature's outline because the entire backend contract already existed, audit-clean, before this spec started — there was no server-side design decision to make, only a client consumption decision.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence |
|---|---:|---|
| Boundary Cross | yes | New file `apps/admin/src/sections/Comments.tsx` + 5 new `lib/api.ts` client functions, wired into `App.tsx`'s router — spans 3 existing files plus one new one |
| Contract Change | yes (client-side only) | New `ApiError.body` field added to `lib/api.ts`'s existing error type, to carry a 409's `currentVersion` — additive, backward-compatible |
| System Wiring | no | No composition-root/server change; purely a frontend consumer of already-shipped, already-wired backend routes |
| Data And Persistence | no | No schema/table change |
| Critical Cross-Boundary Invariant | no | The one real invariant (server-side authz) is unchanged and untouched by this spec — client-side permission hiding is UX only, not a new enforcement boundary |
| Parallelization Ambiguity | no | Single component, single implementer, no cross-team ordering question |

## Module/File Map

| File | Change | Responsibility |
|---|---|---|
| `apps/admin/src/lib/api.ts` | +86 lines | `listCommentsQueue`, `moderateComment`, `purgeComment`, `getCommentsSettings`, `putCommentsSettings`; widened `ApiError` with a `body` field |
| `apps/admin/src/sections/Comments.tsx` | new, 408 lines | `QueueSection` (status filter, cursor pagination, per-row moderation actions) + `SettingsSection` (partial-patch settings form), combined by `Comments()` |
| `apps/admin/src/App.tsx` | +3 lines | `"comments"` case added to the section-router switch |

## Test Expectations (mapped to spec ACs)

No frontend component-test harness exists in this repo — this was confirmed before implementation, not discovered as a gap during it. Verification method: a standalone Node/tsx integration script that boots the real `createApp()`/`createRouteDeps()` composition and imports the actual `lib/api.ts` functions (not a mock), exercising them over real HTTP against a real ephemeral server. 11 checks, all passing, covering AC-01 through AC-09. Script was not committed (scratch verification, not a durable test asset) — this is a real gap for future work (see Downstream Handoff Notes).

| AC | Verified by |
|---|---|
| AC-01/02/03 (queue list, status filter, pagination) | Smoke script: status filter real (pending vs spam), cursor pagination across `limit:2` pages walks all seeded comments with zero dupes/drops |
| AC-04/05 (moderation actions) | Smoke script: approve/spam/restore/trash→purge all round-trip correctly against real backend |
| AC-06 (purge, trash-only, confirmed) | Code review — `window.confirm` ladder present; not independently re-verified live in this outline pass |
| AC-07 (409 handling) | Smoke script: a deliberately stale `expectedVersion` throws `ApiError(status=409)` with real `currentVersion` in `e.body` |
| AC-08/09 (settings form) | Smoke script: partial patch persists only the changed field; `spamAutoRejectScore: 1.5` rejected by real backend validator; `closeAfterDays` round-trips `5 → null` |
| AC-10 (permission hiding) | **Settings-side verified** (GET route itself gated, `SettingsSection` returns `null` rather than firing a doomed request). **Queue-side action-button hiding was code-reviewed only** — not independently re-tested against a live low-privilege session in this outline pass. Flagged as the one residual verification gap. |
| AC-11 (regression) | Full suite re-run at merge time: 1697/1695/2 (2 known pre-existing, unrelated) — confirmed by Coordinator independently, not just trusted from the implementer's report |

## Critical Invariants

None specific to this spec — the server-side authz boundary (`comments.configure`/`comments.moderate`/etc.) is pre-existing and unchanged. This spec's only "invariant-adjacent" property is REQ-12 (no ad hoc `fetch()` calls) — verified directly by the Coordinator via `grep -n "fetch(" Comments.tsx` returning zero matches, independent of the implementer's own claim.

## Downstream Handoff Notes

- **Real gap, not fixed here:** AC-10's queue-side permission hiding (action buttons conditionally rendered from `api.me().effectivePermissions`) has not been exercised against a real low-privilege session end-to-end — only code-reviewed. If a future session wants full confidence here, seed a `comments.read`-only principal and confirm the buttons are actually absent/disabled in a real browser or HTTP-driven DOM check.
- **No literal browser/DOM render was ever captured** for this spec — all verification is HTTP-level (proves the data layer, not literal pixel/DOM correctness). A manual `npm run dev` pass (both apps) would close this if ever wanted.
- **Scratch verification script was not retained** — a future spec in this same family (Comments-adjacent UI work) would benefit from a committed, reusable version of this pattern (boot real `createApp()`, wrap `global.fetch`, exercise `lib/api.ts` directly) as an actual test file, closing the "no frontend test harness" gap incrementally rather than all at once.
