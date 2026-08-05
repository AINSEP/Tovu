# features/media

The media library behind the sidebar's **Content → Media** entry.

| file | what it is |
|---|---|
| `Media.tsx` | Upload, list, delete media items (`DataTable`-free grid — its own list rendering). |
| `index.ts` | The only surface `panels.tsx` may import. |

## What this feature does not own

- Insertion into an editor (Posts/Collections). Those editors' image-drop handling reads a local
  `File` into a `data:` URL directly rather than going through this feature's library.

## Notes for anyone editing here

`Media.tsx` has a unit test (`__tests__/Media.unit.test.tsx`).
