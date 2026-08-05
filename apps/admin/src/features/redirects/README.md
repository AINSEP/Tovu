# features/redirects

The URL-redirects screen behind the sidebar's **Marketing → Redirects** entry.

| file | what it is |
|---|---|
| `Redirects.tsx` | List of redirects, create/delete, bulk import (`AdminRedirectImportResponse`). Uses `lib/fetch-query`'s `useFetchQuery`/`useFetchMutation` rather than the plain `useEffect`+`useState` pattern most other screens use. |
| `index.ts` | The only surface `panels.tsx` may import. |

## Notes for anyone editing here

`Redirects.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in
a browser.
