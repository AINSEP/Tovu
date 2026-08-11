# features/themes

The site presentation-settings screen — reachable at `/admin/appearance`, deliberately with no
sidebar entry (see `nav.ts`'s note that a panel's presence in the nav and its routability are
independent opt-ins).

| file | what it is |
|---|---|
| `Themes.tsx` | Theme/presentation settings (76 lines — a stub, not a placeholder for a bigger screen that never got built; see `panels.tsx`'s "Themes" nav label). |
| `index.ts` | The only surface `panels.tsx` may import. |

## Notes for anyone editing here

`Themes.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in
a browser.
