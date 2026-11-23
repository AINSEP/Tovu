# features/workspace

The workspace-settings screen behind the sidebar's **Design & System → Workspace** entry.

| file | what it is |
|---|---|
| `Workspace.tsx` | Thin host binding: renders `@jini-ai/admin/screens/workspace/Workspace` (the screen's markup, its `WorkspaceController` shape and the `isWorkspaceDirty` rule now live there) with the wired hook and this install's delete-notice copy. |
| `workspace.css` | Styles for the screen's `jini-*` classes that `jini-media.css` does not cover. |
| `hooks/workspace-dependencies.hooks.ts` | The live `WorkspacePort` binding (port contract: `@jini-ai/admin/screens/workspace/hooks/workspace-port.hooks`), its fake, and `useWiredWorkspace` — binds the shared controller hook `@jini-ai/admin/screens/workspace/hooks/use-workspace.hooks` (fetch, rename draft, save) to this install's locale, `workspace-i18n` dictionary and `rules.ts` error copy, then reaches the shared screen as its required `useWorkspaceHook`. |
| `rules.ts` | This screen's error-code message overrides (copy, so host-owned). |

The wire DTO is `AdminWorkspaceResponse` from `@jini-ai/core/contracts/site/cms-workspace`.
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Multi-workspace switching or listing.** This screen is scoped to the current workspace's own
  settings, not workspace administration.

## Notes for anyone editing here

The shared screen's unit tests live beside it in `@jini-ai/admin` (`screens/workspace/__tests__`);
so do the controller hook's (`screens/workspace/__tests__/use-workspace.hooks.unit.test.ts`). Only
the host binding's wiring test (`__tests__/workspace-dependencies.hooks.unit.test.ts`: real API
client, real locale endpoint, this app's production query adapter) stays here. Treat a styling change as unverified until you have driven it in a browser.
