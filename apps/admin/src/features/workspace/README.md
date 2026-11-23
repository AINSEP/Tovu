# features/workspace

The workspace-settings screen behind the sidebar's **Design & System → Workspace** entry.

| file | what it is |
|---|---|
| `Workspace.tsx` | Thin host binding: renders `@jini-ai/admin/screens/workspace/Workspace` (the screen's markup, its `WorkspaceController` shape and the `isWorkspaceDirty` rule now live there) with the wired hook and this install's delete-notice copy. |
| `workspace.css` | Styles for the screen's `jini-*` classes that `jini-media.css` does not cover. |
| `hooks/use-workspace.hooks.ts` | The controller hook (fetch, rename draft, save, locale) — passed to the shared screen as its required `useWorkspaceHook`. |
| `hooks/workspace-dependencies.hooks.ts` | The live `WorkspacePort` binding (port contract: `@jini-ai/admin/screens/workspace/hooks/workspace-port.hooks`) and its fake. |
| `rules.ts` | This screen's error-code message overrides (copy, so host-owned). |

The wire DTO is `AdminWorkspaceResponse` from `@jini-ai/core/contracts/site/cms-workspace`.
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Multi-workspace switching or listing.** This screen is scoped to the current workspace's own
  settings, not workspace administration.

## Notes for anyone editing here

The shared screen's unit tests live beside it in `@jini-ai/admin` (`screens/workspace/__tests__`);
the hook's tests stay here. Treat a styling change as unverified until you have driven it in a browser.
