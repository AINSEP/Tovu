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
`ApiError`/`describeApiError`, admin failure channel and the shell's `useContentRefreshSubscription` — and `createTaxonomyBlockedError` (the real
`ApiError` the fake taxonomy port throws for a blocked delete). `taxonomy-wired.hooks.ts` binds each
`@jini-ai/admin` taxonomy hook to `useAdminLocale()`, its live port and the kit (`useWiredX`);
`Taxonomy.tsx` mounts those. The Categories & Tags box is `@jini-ai/admin/screens/taxonomy/TermPicker`;
its two hooks are required props, so each editor that mounts it (`posts/editor/PostSavedPanels.tsx`,
`pages/PageEditor.tsx`, `collections/CollectionEntryEditor.tsx`) passes
`useTermPickerHook={useWiredTermPicker}` and `useTermListRevealHook={useTermListReveal}`. It emits only
`jini-term-picker*` classes; `styles.css` lists each one as a twin next to its original `.term-picker*`
rule (`styles/__tests__/term-picker-css.unit.test.ts` guards the twins). Every hook (including `useTaxonomy` and
`useTermPicker`, now split into sub-hooks inside `@jini-ai/admin`) takes one object
`{ options | target, port, locale, kit }` (`useTaxonomy` adds the bound `t`). Tests compose the Jini hooks with the in-memory `createFake*Port`s
from `@jini-ai/admin/screens/taxonomy/hooks/*-dependencies.hooks`.
