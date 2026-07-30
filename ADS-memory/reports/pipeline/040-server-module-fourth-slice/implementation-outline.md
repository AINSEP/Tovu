# Implementation Outline: Server Module Convention — Fourth Slice (comments-moderation, menus, users, settings)

- Spec: SPEC-040 v1.0.0
- Status: PRODUCED (retroactive, backfilled after implementation per explicit user request)
- Trigger result: System Wiring only — same established ADR-046/SPEC-031 pattern, 4th/5th/6th/7th application.
- Date: 2026-07-16T00:00:00Z (backfilled)
- Author: Software Architect (in-session, direct — Claude Code host, per explicit user request)

## Trigger Decision Matrix

| Trigger | Applies? | Evidence |
|---|---:|---|
| Boundary Cross | yes | 23 registrars across 4 domains, moved into 4 new module files |
| Contract Change | marginal | 2 pre-existing helper functions (`identityReposFrom`/`identityServiceDepsFrom` in `users/deps.ts`, `toWriteServiceDeps` in `settings/shared.ts`) were retyped from full `RouteDeps` to the new narrow types — a real, disclosed narrowing (see Non-Obvious Finding) |
| System Wiring | yes | `app.ts` composition-root call sites changed |
| Critical Cross-Boundary Invariant | no | No invariant introduced; byte-identical behavior required (AC-05) |
| Parallelization Ambiguity | no | 4 independent domains, done sequentially |

## Module/File Map

| File | Domain | Notes |
|---|---|---|
| `src/server/routes/admin/comments/deps.ts` (new) + `modules/comments-moderation.ts` (new) | comments-moderation | Reused pre-existing `AdminCommentsModerationQueueDeps`/`AdminCommentsModerateDeps`; `get-settings.ts`/`put-settings.ts` retyped to the new combined `CommentsModerationRouteDeps` |
| `modules/menus.ts` (new) | menus | Zero per-file changes needed — all 6 registrars already used the pre-existing `MenuRouteDeps` (from `server/http/admin/menus.ts`); this module is a pure wrapper |
| `routes/admin/users/deps.ts` (widened) + `modules/users.ts` (new) | users/roles/policies | New `UsersRouteDeps` added alongside existing helpers (not a replacement) |
| `routes/admin/settings/deps.ts` (new) + `modules/settings.ts` (new) | settings | New `SettingsRouteDeps` |
| `src/server/app.ts` | — | 23 inline calls replaced by 4 module-factory calls at original relative positions |

## Non-Obvious Finding

Two pre-existing helper functions had their own signatures narrowed as a side effect of this slice: `identityReposFrom`/`identityServiceDepsFrom` (users) and `toWriteServiceDeps` (settings) went from `deps: RouteDeps` to `deps: UsersRouteDeps`/`deps: SettingsRouteDeps` respectively. This was necessary (not optional) — the 5+5 mutation registrars that call these helpers needed to be retyped to the new narrow registrar types, and TypeScript would not accept a narrow-typed deps object being passed into a full-`RouteDeps`-typed helper without this change. Both narrowings are pure (the helpers already only read fields the new narrow types include) — confirmed by the implementer reading both helper bodies before retyping, not assumed safe.

## Coverage Gap Found (pre-existing, not introduced by this spec)

No HTTP-level test exists anywhere in this repo for the users/roles/policies route family — `identity-routes.test.ts`'s own file header discloses this. AC-03 (users/roles/policies domain tests pass) is therefore trivially satisfied by "there are no tests to break." The implementer additionally ran a manual smoke script against the real `createApp()` composition (login + GET/POST users/roles/policies all returned expected 200/201s) as a substitute for the missing formal coverage — this is disclosed here as a real, pre-existing gap for a future spec to close, not something this slice was scoped to fix.

## Test Expectations (mapped to spec ACs)

| AC | Verified by |
|---|---|
| AC-01 (comments-moderation) | `comments-settings-routes.test.ts` + `comments-e2e.test.ts` — 6/6 pass |
| AC-02 (menus) | `admin-menus-routes.test.ts` — 11/11 pass |
| AC-03 (users/roles/policies) | No formal HTTP suite exists (see Coverage Gap above); manual smoke script substitute, all expected statuses returned |
| AC-04 (settings) | `settings-auth.test.ts` + `settings-principal-check.test.ts` + `settings-register-definitions-op-validation.test.ts` — 13/13 pass |
| AC-05 (full suite unchanged) | 1700/1698/2 before and after — I re-ran this independently, matches exactly |
| AC-06 (typecheck, dead imports) | `npx tsc --noEmit -p .` — I re-ran independently, clean; grep for the 23 relocated registrar names in `app.ts` — I re-ran independently, zero matches |

## Critical Invariants

None new.

## Downstream Handoff Notes

- **Real, disclosed gap:** users/roles/policies has no HTTP-level test suite in this entire repo, predating this spec. Worth a named follow-up spec if this domain's correctness needs stronger-than-manual-smoke assurance going forward.
- The "retype a helper's own signature when narrowing its callers" pattern (seen twice in this slice) is a useful precedent for SPEC-042 (the final slice), which also touches domains (`settings/shared.ts`-adjacent) that may have similar internal helpers.
- This slice's implementer hit a session/API rate limit on its FIRST dispatch attempt, before making any edits (clean worktree, safe to redispatch). Redispatched fresh with an added instruction to commit after each domain rather than batching to the end — this succeeded on the second attempt with zero lost work. Worth keeping as the default instruction for any further large multi-domain dispatch in this session.
