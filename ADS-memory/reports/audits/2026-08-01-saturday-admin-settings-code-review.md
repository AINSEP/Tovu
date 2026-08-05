# Saturday admin and settings code review

Date: 2026-08-04

## Scope

Final current source only. Reviewed the Tovu implementations related to the Saturday admin redesign, fetch-query/Redirects migration, media previews, and settings authorization, reset, and SSE behavior. Historical snapshots were not used to determine findings.

## Findings

### Medium: page activity rows open the post route

`Dashboard` merges rows from both `api.listPosts()` and `api.listPages()`, but renders every row with `/admin/posts/${row.id}`. A recently updated page therefore opens the post editor route rather than its page route. Depending on the identifier, this shows the wrong content or a not-found state.

Affected code: `apps/admin/src/features/dashboard/Dashboard.tsx:89`.

Fix direction: derive the route from `row.kind` (or carry an explicit editor href in the activity-row model) and add a regression test containing both a post and a page.

### Medium: shared media lightbox keeps the previous item's fallback stage

`MediaLightbox` reuses one `MediaPreview` instance while changing `item` with the previous/next controls. `useMediaPreview` initializes `stage` once and never resets it when `item.id` changes. After a video or unsupported asset advances the image -> video -> unsupported fallback chain, navigation causes the next asset to start at that inherited stage rather than testing as an image. An unsupported asset makes every subsequent lightbox asset render as unsupported until the dialog is remounted.

Affected code: `apps/admin/src/features/media/Media.tsx:397` and `apps/admin/src/features/media/hooks/use-media-preview.hooks.ts:35-45`.

Fix direction: key `MediaPreview` by `item.id` in the shared lightbox, or reset `stage` in an effect keyed by `item.id`. Add a mixed image/video/unsupported navigation test.

## Security review

No additional actionable authorization, cross-tenant-write, SSE-isolation, or stored-media serving defect was found in the final reviewed Tovu paths. The settings write routes bind non-global writes to the ambient workspace, and the media-original route authorizes before lookup and serves sniffed bytes with HTML/SVG forced to download.

## Validation

- `apps/admin`: 52 focused unit tests passed for media, dashboard, forms, Redirects, and fetch-query.
- Dashboard-only: 12 tests passed.
- Media-only: 18 tests passed.

The current tests do not cover either finding above.
