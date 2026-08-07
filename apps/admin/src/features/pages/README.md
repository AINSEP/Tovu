# features/pages

The Pages list — the screen behind the sidebar's **Content → Pages** entry.

| file | what it is |
|---|---|
| `Pages.tsx` | List view. Same `DataTable` + `RowMenu` shape as `features/posts`'s `Posts.tsx`, backed by the pages-filtered endpoints (`GET/POST .../pages`). |
| `PageEditor.tsx` | The editor itself — bespoke HTML preview/source view, not Tiptap. Markup only; state lives in `hooks/use-page-editor.hooks.ts`. Reached via `/admin/pages/{pageId}` (`panels.tsx`'s `pages` section, `page-editor` view). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Posts.** A separate feature, despite the near-identical list shape. They diverge by design —
  see [ADR-056](../../../../../ADS-memory/reports/architecture/ADR-056-pages-vibecoding.md): posts
  stay Tiptap, pages become AI-generated HTML. Merging the two now would have to be undone. A page
  is still a `post` row with `kind: "page"` server-side, but it is edited through this feature's own
  `PageEditor`, not `features/posts`'s `PostEditor` — see `PageEditor.tsx`'s own file header for why
  a shared Tiptap editor was the wrong call here.

## Notes for anyone editing here

`Pages.tsx` has **no unit test** — treat a change there as unverified until you have driven it in a
browser. `PageEditor.tsx` does now (`__tests__/PageEditor.unit.test.tsx`, characterisation tests
written 2026-08-06).
