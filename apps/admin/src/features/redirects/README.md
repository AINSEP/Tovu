# features/redirects

The URL-redirects screen behind the sidebar's **Marketing → Redirects** entry.

| file | what it is |
|---|---|
| `@jini-ai/admin/redirects/react` | Screens live in `@jini-ai/admin/redirects`: list/create/delete, bulk import and gesture-gated hit counts. Uses the existing `@jini-ai/ui/fetch-query` cache/mutation owner rather than a copied fetch lifecycle. |
| `index.ts` | The only surface `panels.tsx` may import. |
| `redirects-i18n.tsx` | Host dictionary and parameterized string/markup helpers. |
| `../../integrations/jini-admin/redirects-ports.ts` | Workspace HTTP adapter, error mapping, filtered refresh and permission/translation bindings. |
| `../../integrations/jini-admin/redirects-module.hooks.ts` | Live locale, markup slots and the existing publish contribution. |

## Notes for anyone editing here

The original five screen/hook/rules suites now live in Jini's redirects source. The dictionary suite
stays here; host wiring is covered by `redirects-{ports,swap}.unit.test.ts(x)` in the integration folder.
The real browser check of list/import/hits remains required before release. Original extraction rationale
(including the fetch-query pilot and one-locale-per-screen rule) survives in Jini's
`packages/admin/src/redirects/SOURCE-RATIONALE.md`.
