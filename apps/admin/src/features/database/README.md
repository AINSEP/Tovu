# features/database

The change-log/ledger and restore-point browser behind the sidebar's **Design & System → Database**
entry.

| file | what it is |
|---|---|
| `Database.tsx` | Raw ledger row browser plus the restore-point list. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Actually restoring a snapshot** — that flow is `features/recovery`'s. This screen surfaces the
  ledger and restore points; `Recovery.tsx` drives the restore itself.

## Notes for anyone editing here

`Database.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.
