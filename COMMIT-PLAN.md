# P8-T3.T — r62t-rev-p8a

Implemented in the working tree only, on the supplied Tovu HEAD
`7c87b3c3f95301d59f55041bf163b723bbab5d79`. No Git writes.

## Prerequisite and anchors

- P8-T3.J is implemented on Jini `codex/b-p8aj`, read-only SHA
  `01468dc1c99a9528c218e1e1e21368ebb35fea74`. Inspected its browser event,
  browser export, controller field, header ownership logic, and shell router.
  The supplied `o-b-p8aj/b-p8aj.md` report also records completion.
- All named Tovu anchors match. No sheets stopped or skipped for an undone Jini sheet.
- This clone has no installed `@jini-ai/admin` artifact. Cloud validation must
  supply the artifact containing P8-T3.J; no manifest or lockfile changes were specified.
- Local `AI-Dev-Shop` and the three referenced `ADS-memory` architecture/memory
  files are absent. Used the supplied complete dispatch and external programmer
  skills, with the dispatch's exact design and execution restrictions governing.

## Coordinator commit order

1. `test(admin): characterize router-owned menu leave protection`
   - `apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx`
   - Added the four named cases before production edits, using the real router
     and existing menu fixture. Explicitly injected `useWiredMenuEditor` in all
     16 existing bare renders, preserving the header-fallback tests.

2. `fix(admin): bind menu dirty confirmation to router preflight`
   - Create `apps/admin/src/features/menus/hooks/use-route-guarded-menu-editor.hooks.ts`.
   - Change `apps/admin/src/features/menus/menu-editor-panel.tsx`.
   - Change `apps/admin/src/panels.tsx`.
   - Create `COMMIT-PLAN.md`.
   - Bind the existing dirty check in a layout effect with matching cleanup;
     return router ownership and require explicit host injection. Preserve the
     route key, null mapping, row hooks, tab strip, menus URL, and App interceptor.

## Named tests and mutation witnesses

| Test | Mutation expected to turn it red |
| --- | --- |
| `sidebar navigation with unsaved menu edits asks first` | Remove `event.preventDefault()` from `onBefore`; cancellation then loses the URL/draft. |
| `a dirty menu Back link prompts once when the router owns the guard` | Omit `leaveGuardOwner: "router"`; the allowed Back click prompts twice. |
| `a clean menu leaves from the sidebar without a prompt` | No separate mutation specified; asserts no confirmation and arrival at Pages. |
| `unmounting a dirty menu removes the guard` | Omit listener cleanup; the rejecting confirm spy detects a prompt and blocks the surviving link. |

## Review and validation

- Re-read the complete diff against P8-T3.T. No extra behavior, helpers in
  production, dependency changes, or unrelated formatting added.
- Deletions required by the sheet: unused panel `useWiredMenuEditor` import,
  default hook initializer, and stale defaulted-test-seam documentation.
  No additional deletions were needed during the final scope review.
- Static architecture review: PASS against the supplied host/Jini boundary,
  required hook injection, layout-effect timing, and subscription ownership.
  The supplied design is the pattern contract; no redesign or extra ports.
- Documentation: panel injection contract updated; hook lifecycle why-comment
  added as the specified single line. No additional source comments.
- Function review: `useRouteGuardedMenuEditor` and `onBefore` have directly
  assertable cancel/allow and teardown paths in the named tests. Constant-size
  listener bookkeeping; the existing dirty comparison is unchanged. Runtime
  assessment remains INCONCLUSIVE because execution is prohibited.
- Cost: one listener per mounted editor, one existing dirty check per preflight;
  listener replaced on `confirmLeave` changes and removed on unmount. ESTIMATED
  from source; cloud runs the cleanup witness next.
- New hook: 16 lines. Menu test file: 491 lines. `panels.tsx` was already 1320
  lines; only its specified import and JSX prop changed.
- `git diff --check` passed. No tests, mutations, builds, installs, type-checks,
  linters, browser validation, or coverage measurement ran, per dispatch.
  Existing tests and assertions were not removed or weakened.

## Sheets left

- P8-T3.J: Jini-only SOL sheet, already completed by the Jini run.
- P8-J1.J: OPUS, Jini; untouched.
- P8-T1.S: OPUS, Tovu; untouched.
