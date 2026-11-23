# features/pages

The Pages list — the screen behind the sidebar's **Content → Pages** entry.

| file | what it is |
|---|---|
| `Pages.tsx` | Host wiring for the list view, which renders from `@jini-ai/admin/pages/Pages` (same `DataTable` + `RowMenu` shape as `features/posts`'s `Posts.tsx`). Binds `useWiredPages` (`hooks/use-pages.hooks.ts`, over `@jini-ai/admin/pages/hooks/use-pages.hooks`), the Theme Pages hook + tab, `PublishSectionButton`, `ServerLabel`, `lib/admin-post-list-sort.ts` and the `rules.ts` link rules. |
| `PageEditor.tsx` | The editor itself — bespoke HTML preview/source view, not Tiptap. Markup only; state lives in `hooks/use-page-editor.hooks.ts`. Reached via `/admin/pages/{pageId}` (`panels.tsx`'s `pages` section, `page-editor` view). |
| `index.ts` | The only surface `panels.tsx` may import. |

## Wiring

- `hooks/use-page-editor.hooks.ts` hands `@jini-ai/ui/panel-kit`'s `useSettlementGeneration` to
  `@jini-ai/admin`'s `useExternalEntryRefresh` as a required input (its own counter instance,
  separate from the editor's save settlement).

## What this feature does not own

- **Posts.** A separate feature, despite the near-identical list shape. They diverge by design —
  see [ADR-056](../../../../../ADS-memory/reports/architecture/ADR-056-pages-vibecoding.md): posts
  stay Tiptap, pages become AI-generated HTML. Merging the two now would have to be undone. A page
  is still a `post` row with `kind: "page"` server-side, but it is edited through this feature's own
  `PageEditor`, not `features/posts`'s `PostEditor` — see `PageEditor.tsx`'s own file header for why
  a shared Tiptap editor was the wrong call here.

## Notes for anyone editing here

`Pages.tsx` is driven end to end by `__tests__/Pages.unit.test.tsx` (through this wiring and the
real kits); the list's own pure/seam tests live with it in `@jini-ai/admin`. `PageEditor.tsx` does now (`__tests__/PageEditor.unit.test.tsx`, characterisation tests
written 2026-08-06).
