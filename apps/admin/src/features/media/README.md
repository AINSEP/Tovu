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

## Wiring

- `Media.tsx`'s `EditMediaModal` binds `openLightboxDialog` / `closeLightboxDialog` from the host
  kit (`useAdminKitValues()`, provided by `main.tsx`'s `<AdminKitProvider kit={adminKit}>`) and
  passes them, with `open`/`onClose`, as required args to
  `@jini-ai/admin/screens/media/hooks/use-edit-media-modal.hooks`'s `useEditMediaModal`.
