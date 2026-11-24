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

- `hooks/media-dependencies.hooks.ts` binds `@jini-ai/admin/screens/media/hooks/media-port.hooks`'s
  `MediaPort` to `api/media-api.ts`; `AdminMedia` rows come from `@jini-ai/core/contracts/site/cms-admin-media`.
- `Media.tsx`'s `EditMediaModal` binds `openLightboxDialog` / `closeLightboxDialog` from the host
  kit (`useAdminKitValues()`, provided by `main.tsx`'s `<AdminKitProvider kit={adminKit}>`) and
  passes them, with `open`/`onClose`, as required args to
  `@jini-ai/admin/screens/media/hooks/use-edit-media-modal.hooks`'s `useEditMediaModal`.
- `Media.tsx` calls `@jini-ai/admin/screens/media/hooks/use-media-grid-size.hooks`'s `useMediaGridSize`
  with `{ storageKey: MEDIA_GRID_SIZE_STORAGE_KEY }` — the product storage key stays in `rules.ts`; the
  sizes and `parseMediaGridSize` come from `@jini-ai/admin/screens/media/grid-size`.
