import { mediaApi } from "@/features/media/api/media-api";
import { usersApi } from "@/features/users/api/users-api";
import { trashApi } from "@/features/trash/api/trash-api";
import type { MediaPort } from "@jini-ai/admin/screens/media/hooks/media-port.hooks";

/**
 * @file The only place under `features/media` that reaches `lib/api` for the five `MediaPort`
 * routes — see `media-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. Each method wraps its `api` counterpart explicitly rather
 *  than pointing at it directly, so a route's default-parameter shape (`uploadMedia`'s
 *  `options = {}`, `updateMedia`'s `options = {}`) stays `lib/api.ts`'s to own. */
export const defaultMediaPort: MediaPort = {
  listMedia: () => mediaApi.listMedia(),
  // Host note for `uploadMedia`'s declared `contentType`; the same fact is why the in-memory fake in `@jini-ai/admin` just echoes it.

  // The REAL server ignores this declared string and stores `sniffContentType(bytes)` instead
  // (see `apps/website/src/server/inbound/admin-http/routes/media/upload.ts`). This fake has no bytes to sniff — its input is
  // an opaque base64 string a test made up — so it echoes what the caller declared. A test that
  // needs the two to disagree (uploading bytes whose real type differs from the declared one)
  // must seed `options.media` directly rather than rely on this path.
  uploadMedia: (input, options) => mediaApi.uploadMedia(input, options),
  updateMedia: (target, options) => mediaApi.updateMedia(target, options),
  trashMedia: (id) => mediaApi.trashMedia({ id }),
  deleteMedia: (id) => mediaApi.deleteMedia({ id }),
  // No media-specific restore route: the shared Trash restore already handles media rows.
  restoreMedia: async (id) => {
    const report = await trashApi.restoreTrashItems({ items: [{ entityType: "media", entityId: id }] });
    return { restored: report.restored === 1 };
  },
  mediaOriginalUrl: (id) => mediaApi.mediaOriginalUrl({ id }),
  listUsers: () => usersApi.listUsers(),
};
