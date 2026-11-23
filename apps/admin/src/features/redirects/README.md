# features/redirects

The URL-redirects screen behind the sidebar's **Marketing → Redirects** entry.

| file | what it is |
|---|---|
| `@jini-ai/admin/redirects/react` | Screens live in `@jini-ai/admin/redirects`: list/create/delete, bulk import and gesture-gated hit counts. Uses the existing `@jini-ai/ui/fetch-query` cache/mutation owner rather than a copied fetch lifecycle. |
| `@jini-ai/admin/screens/redirects` | The screen mount `panels.tsx` imports; the host injects `useModulePanel` and `RedirectsModuleLoading`. |
| `@jini-ai/admin/screens/redirects/redirects-i18n` | The dictionary and parameterized string/markup helpers (moved to Jini with their tests). |
| `api/redirects-api.types.ts` | DTO mirror of the server's `AdminRedirectDto`. |
| `../../integrations/jini-admin/redirects-ports.ts` | Workspace HTTP adapter, error mapping, filtered refresh and permission/translation bindings. |
| `../../integrations/jini-admin/redirects-module.hooks.ts` | Live locale, markup slots and the existing publish contribution. |

## Notes for anyone editing here

The original five screen/hook/rules suites and the dictionary suite now live in Jini's redirects source; host wiring is covered by `redirects-{ports,swap}.unit.test.ts(x)` in the integration folder.
The real browser check of list/import/hits remains required before release. Original extraction rationale
(including the fetch-query pilot and one-locale-per-screen rule) survives in Jini's
`packages/admin/src/redirects/SOURCE-RATIONALE.md`.
