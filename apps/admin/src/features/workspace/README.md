# features/workspace

The workspace-settings screen behind the sidebar's **Design & System → Workspace** entry.

| file | what it is |
|---|---|
| `Workspace.tsx` | Current workspace's own settings (name, etc). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Multi-workspace switching or listing.** This screen is scoped to the current workspace's own
  settings, not workspace administration.

## Notes for anyone editing here

`Workspace.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in
a browser.
