# features/taxonomy

Categories and tags — the screen behind the sidebar's **Content → Taxonomy** entry.

| file | what it is |
|---|---|
| `Taxonomy.tsx` | List of taxonomies and their terms, create/edit/delete terms. |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- Attaching a term to a post or collection entry — that happens in `features/posts`/
  `features/collections`, which reference terms but don't manage them.

## Notes for anyone editing here

`Taxonomy.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.
