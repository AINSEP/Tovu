# Feature Spec: Server Module Convention — Fourth Slice (ADR-046 Phase 3)

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-040 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-040-server-module-convention-fourth-slice |
| last_edited | 2026-07-16T00:00:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent (in-session, direct — Claude Code host, dispatched subagent) |
| spec_mode | brownfield |

## Scope Note

Continuing the mechanical ADR-046 Phase 3 sweep (SPEC-031 → SPEC-034 → SPEC-038 → SPEC-039). This slice pulls 4 more domains into `ServerModuleHandle`, out of the ~9 remaining after SPEC-038/039: **comments moderation** (4 registrations — distinct from the already-shipped Comments admin FRONTEND, SPEC-036/037, which is unrelated UI work; this is the backend route-file relocation only), **menus** (6), **users/roles/policies** (8), **settings** (5) — 23 registrations total.

Two of these four domains already have narrow deps types ready to reuse, confirmed by direct inspection before writing this spec:
- Comments moderation: `AdminCommentsModerationQueueDeps` (`moderation-queue.ts`) and `AdminCommentsModerateDeps` (`moderate.ts`) already exist as narrow `Pick<RouteDeps, ...>` types. `get-settings.ts`/`put-settings.ts` do NOT yet have named narrow types — check their actual parameter usage.
- Menus: `MenuRouteDeps`/`MenuRouteRegistrar` already exist, but NOTE the unusual location — defined in `src/server/http/admin/menus.ts`, not in a `routes/admin/menus/deps.ts` file like every other domain's convention. Confirm this file's exact export shape before writing `modules/menus.ts`.

The other two do NOT have narrow types yet and need one created from scratch, matching the established `Pick<RouteDeps, ...>` pattern:
- Users/roles/policies: routes currently use plain `RouteRegistrar`/full `RouteDeps`. `src/server/routes/admin/users/deps.ts` exists but is NOT a narrow deps type — it's a helper (`identityReposFrom`/`identityServiceDepsFrom`) that assembles nested service-deps bags FROM `RouteDeps`; keep using it as-is, it's unrelated to this spec's narrowing goal.
- Settings: routes currently use plain `RouteRegistrar`/full `RouteDeps`.

## Requirements

- REQ-01: `src/server/modules/comments-moderation.ts` (new — named distinctly from any future public-facing `comments.ts` module, since this domain is ADMIN moderation only) shall export `createCommentsModerationModule(deps)` wrapping all 4 registrars (`registerAdminCommentsModerationQueueRoute`, `registerAdminCommentsModerateRoutes`, `registerAdminCommentsGetSettingsRoute`, `registerAdminCommentsPutSettingsRoute`). Reuse `AdminCommentsModerationQueueDeps`/`AdminCommentsModerateDeps` where they already exist; determine `get-settings.ts`/`put-settings.ts`'s actual field needs by reading them directly and either reuse an existing type or define what's needed inline/in a new `deps.ts` for this module.
- REQ-02: `src/server/modules/menus.ts` (new) shall export `createMenusModule(deps: MenuRouteDeps)` wrapping all 6 menu registrars, reusing the already-existing `MenuRouteDeps` type from `src/server/http/admin/menus.ts` — do not redefine it.
- REQ-03: `src/server/routes/admin/users/deps.ts` shall gain a new narrow `UsersRouteDeps` type (a `Pick<RouteDeps, ...>` covering exactly what the 8 users/roles/policies registrars read — read all 8 files directly to determine the exact field set, likely including `workspaceId`/`authorize`/`clock`/`idGen`/the identity repo fields `identityReposFrom` needs) — additive to the existing helper functions in that file, not a replacement.
- REQ-04: `src/server/modules/users.ts` (new) shall export `createUsersModule(deps: UsersRouteDeps)` wrapping all 8 registrars (`registerAdminUserListRoute`/`CreateRoute`/`AssignRoleRoute`/`AttachPolicyRoute`, `registerAdminRoleListRoute`/`CreateRoute`, `registerAdminPolicyListRoute`/`CreateRoute`).
- REQ-05: `src/server/routes/admin/settings/deps.ts` (new) shall define a narrow `SettingsRouteDeps` type covering exactly what the 5 settings registrars read (read all 5 files directly — `register-definitions.ts`, `get-effective.ts`, `set.ts`, `clear.ts`, `reset.ts`).
- REQ-06: `src/server/modules/settings.ts` (new) shall export `createSettingsModule(deps: SettingsRouteDeps)` wrapping all 5 registrars.
- REQ-07: `app.ts`'s `createApp()` shall call the 4 new module factories instead of the 23 inline registrar calls they replace, at the same relative registration position, and shall remove the now-dead direct registrar imports.
- REQ-08: Behavior must be byte-identical from any external caller's perspective — same routes, same responses, same status codes, same auth gating. This is a refactor, not a behavior change.

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Existing comments-moderation backend tests (`src/server/__tests__/routes/comments-*.test.ts` or wherever they live — find and run unmodified) still pass against the real `createApp()` composition.
- AC-02 (REQ-02) [P1]: Existing menu route tests still pass unmodified against the real composition.
- AC-03 (REQ-03/04) [P1]: Existing users/roles/policies route tests still pass unmodified against the real composition.
- AC-04 (REQ-05/06) [P1]: Existing settings route tests still pass unmodified against the real composition.
- AC-05 (REQ-07) [P1]: Full test suite passes with the exact same pass/fail counts as the branch this slice forks from (verify before/after).
- AC-06 (REQ-07) [P1]: `npx tsc --noEmit -p .` stays clean; no dead imports remain in `app.ts` for the 23 relocated registrars.

## Non-Goals

- The remaining ~5 domains after this slice (forms, redirects, analytics, storage/recovery, content-types/entries, SEO) — later slices.
- Any backend behavior change, any `deps.ts` (composition-root) change beyond adding the new narrow types this spec requires.
- The Comments admin FRONTEND (SPEC-036/037) — already shipped, unrelated to this backend-only relocation.

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. |
| II — Test-First | COMPLIES | Every touched domain's pre-existing test suite re-run unmodified as the regression gate. |
| III — Simplicity Gate | COMPLIES | 4 modules, narrow `Pick`-based deps types, no new abstraction beyond the established pattern. |
| IV — Anti-Abstraction Gate | COMPLIES | Extends `ServerModuleHandle`'s existing consumer set; no new port, no new generic mechanism. |
| V — Integration-First Testing | COMPLIES | AC-01–04 all exercise the real `createApp()` composition. |
| VI — Security-by-Default | N/A | No authz surface change — same routes, same permission strings, same gates, unmoved. |
| VII — Spec Integrity | COMPLIES | This spec is the reference for the implementation it accompanies. |
| VIII — Observability | N/A | No new observable signal. |
