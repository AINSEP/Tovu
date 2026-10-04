# features/recovery

The whole-database restore screen (design-spec.md §4, ADR-045) behind the sidebar's
**Operations → Recovery** entry.

| file | what it is |
|---|---|
| `Recovery.tsx` | Inline `SettingsDialogShell` with Restore points (create + list) and Restore (the selected point's plan/confirm/execute ceremony), per the owner's 2026-09-10 consolidation in `development/todos.md`. Never a separate "Backups" route (ADR-045). |
| `hooks/use-recovery-navigation.hooks.ts` | URL-controlled tab selection and select/back handlers; navigation is injected as a port. |
| `hooks/use-recovery.hooks.ts` | Status, list, create and deep-link resolution through `RecoveryPort`. |
| `hooks/use-restore-flow.hooks.ts` | Disclosure, acknowledgement and restore ceremony through `RestoreFlowPort`. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Per-row undo.** This is a whole-database snapshot restore, not the kind of per-row recoverability
  `Posts.tsx`/`Pages.tsx` disclaim in their own delete-confirm copy — do not conflate the two.
- The database activity ledger and migrate-forward ceremony (`features/database`). Restore-point
  create/list/restore all belong here; Database can deep-link to a point from a ledger row.

## Notes for anyone editing here

`__tests__/Recovery.unit.test.tsx` covers the inline shell, translated controls, list/create and
the real restore-flow hook's ceremony. `__tests__/use-recovery-navigation.unit.test.ts` covers
URL selection and navigation order through an injected port; `use-recovery.unit.test.ts` and
`use-restore-flow.unit.test.ts` cover the data hooks.

`src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts` also reads the component source directly
(`readFileSync`) to check acceptance criteria — keep the page-description markup intact.
