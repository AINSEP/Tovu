# features/plugins

The installed-plugins list behind the sidebar's **Design & System → Plugins** entry.

| file | what it is |
|---|---|
| `Plugins.tsx` | List of installed plugins, enable/disable. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- The plugin runtime itself (`src/features/plugin-runtime` at the app level) — this screen only
  lists and toggles plugins the runtime has already loaded.

## Notes for anyone editing here

`Plugins.tsx` has a unit test (`__tests__/Plugins.unit.test.tsx`).
