# features/pages

The Pages list — the screen behind the sidebar's **Content → Pages** entry.

| file | what it is |
|---|---|
| `Pages.tsx` | List view. Same `DataTable` + `RowMenu` shape as `features/posts`'s `Posts.tsx`, backed by the pages-filtered endpoints (`GET/POST .../pages`). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Posts.** A separate feature, despite the near-identical list shape. They diverge by design —
  see [ADR-056](../../../../../ADS-memory/reports/architecture/ADR-056-pages-vibecoding.md): posts
  stay Tiptap, pages become AI-generated HTML. Merging the two now would have to be undone.
- **The editor itself.** A page is a `post` row with `kind: "page"`, so it's edited through
  `features/posts`'s `PostEditor`, reached via `/admin/posts/{id}`. There is no `PageEditor`.

## Notes for anyone editing here

`Pages.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.
