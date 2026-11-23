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
`createTermPickerPort` with the auth client's `me`, and `createTaxonomyPort` over the Trash client)
as module-level singletons, plus `taxonomyHostKit` — this host's `taxonomy-i18n` translator,
`ApiError`/`describeApiError` and admin failure channel — and `createTaxonomyBlockedError` (the real
`ApiError` the fake taxonomy port throws for a blocked delete). `taxonomy-wired.hooks.ts` binds each
`@jini-ai/admin` taxonomy hook to `useAdminLocale()`, its live port and the kit (`useWiredX`);
`Taxonomy.tsx`/`TermPicker.tsx` mount those. Every hook (including `useTaxonomy` and
`useTermPicker`, now split into sub-hooks inside `@jini-ai/admin`) takes one object
`{ options | target, port, locale, kit }` (`useTaxonomy` adds the bound `t`). Tests compose the Jini hooks with the in-memory `createFake*Port`s
from `@jini-ai/admin/screens/taxonomy/hooks/*-dependencies.hooks`.
