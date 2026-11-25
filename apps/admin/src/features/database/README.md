# features/database

The change-log/ledger and restore-point browser behind the sidebar's **Design & System → Database**
entry.

| file | what it is |
|---|---|
| `Database.tsx` | Host binding: passes the wired section hooks, admin locale hook and `ServerLabel` to Jini's `Database` (`@jini-ai/admin/screens/database/Database`). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Actually restoring a snapshot** — that flow is `features/recovery`'s. This screen surfaces the
  ledger and restore points; `Recovery.tsx` drives the restore itself.

## Notes for anyone editing here

The screen's render tests live in `@jini-ai/admin` (`screens/database/__tests__/Database.unit.test.tsx`);
`__tests__/Database.binding.unit.test.tsx` pins the host wiring over the real HTTP adapter.
