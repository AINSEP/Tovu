# features/posts

The Posts list and the Post editor — the two screens behind the sidebar's **Content → Posts** entry.

| file | what it is |
|---|---|
| `Posts.tsx` | List view. `DataTable` + `RowMenu` from `@jini-ai/admin/react`, row actions, delete confirmation. |
| `PostEditor.tsx` | The Tiptap editor. Owns the `WidgetEmbed` node and the unsaved-changes guard (`useDirtyGuard`). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Pages.** A separate feature, despite the near-identical list shape. They diverge by design —
  see [ADR-056](../../../../../ADS-memory/reports/architecture/ADR-056-pages-vibecoding.md): posts
  stay Tiptap, pages become AI-generated HTML. Merging the two now would have to be undone.
- **The widget embed extension itself** — `lib/widget-embed-extension`, shared with other editors.
- **Taxonomy** (categories and tags), which a post references but does not manage.

## Notes for anyone editing here

`Posts.tsx` has **no unit test**. `PostEditor.unit.test.tsx` covers the editor only. Treat a change
to the list as unverified until you have driven it in a browser.
