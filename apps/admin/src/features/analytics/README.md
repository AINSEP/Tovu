# features/analytics

The pageview/hits screen behind the sidebar's **Marketing → Analytics** entry.

| file | what it is |
|---|---|
| `Analytics.tsx` | List of recorded page-view hits (`DataTable`, timestamps). |
| `index.ts` | The only surface `panels.tsx` may import. |

## Notes for anyone editing here

`Analytics.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in
a browser.
