# features/collections

Custom content types — the three screens behind the sidebar's **Content → Collections** entry.

| file | what it is |
|---|---|
| `Collections.tsx` | The content-type registry list plus the "New content type" modal (design-spec.md §1, ADR-022/ADR-043). |
| `CollectionEntries.tsx` | Per-content-type entry list, `/admin/collections/{typeKey}`. |
| `CollectionEntryEditor.tsx` | Per-entry editor, `/admin/collections/{typeKey}/{entryId|new}`. Its own Tiptap wiring, separate from `features/posts`'s (see the file's own header for the disclosed deviation from design-spec.md §1.5). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- **Taxonomy** (categories and tags) — a collection entry can reference terms but does not manage
  them.
- **The widget embed extension itself** — `lib/widget-embed-extension`, shared with `features/posts`.

## Notes for anyone editing here

`Collections.tsx` has **no unit test**. `CollectionEntries.tsx` and `CollectionEntryEditor.tsx` each
have one (`__tests__/`).
