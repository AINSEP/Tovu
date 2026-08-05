# features/recovery

The whole-database restore screen (design-spec.md §4, ADR-045) behind the sidebar's
**Design & System → Recovery** entry.

| file | what it is |
|---|---|
| `Recovery.tsx` | One screen, two views per design-spec.md §0.1: a restore-points list and an inline restore-flow for a selected point — never a separate "Backups" route (ADR-045 explicitly rejects that shape). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Per-row undo.** This is a whole-database snapshot restore, not the kind of per-row recoverability
  `Posts.tsx`/`Pages.tsx` disclaim in their own delete-confirm copy — do not conflate the two.
- The raw ledger browser (`features/database`) that lists restore points — this feature only drives
  the restore flow itself.

## Notes for anyone editing here

`Recovery.tsx` has **no unit test**. `src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts` reads
this file's source directly (`readFileSync`) to check acceptance criteria — its path was updated to
`features/recovery/Recovery.tsx` when this file moved.
