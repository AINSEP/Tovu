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

## Wiring

`taxonomy-host-ports.ts` is the one place this admin binds `@jini-ai/admin`'s taxonomy screen code:
`createTaxonomyApi({ request })` over `lib/admin-http/request`, then the live ports
(`createMergeTermSectionPort`, `createNewTaxonomyFormPort`, `createNewTermFormPort`,
`createTermPickerPort` with the auth client's `me`) as module-level singletons. The `use-*` hooks
and `taxonomy-dependencies.hooks.ts` read those singletons; tests use the in-memory
`createFake*Port`s from the same `@jini-ai/admin/screens/taxonomy/hooks/*-dependencies.hooks` subpaths.
