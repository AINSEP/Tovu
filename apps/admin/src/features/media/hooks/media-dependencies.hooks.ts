import type { AdminMedia, MediaGridPage } from "@jini-ai/core/contracts/site/cms-admin-media";
import { createFakeMediaPort as createJiniFakeMediaPort, type FakeMediaPortOptions } from "@jini-ai/admin/screens/media/hooks/fake-media-port";
import { mediaApi } from "@/features/media/api/media-api";
import { usersApi } from "@/features/users/api/users-api";
import { trashApi } from "@/features/trash/api/trash-api";
import type { MediaPort } from "@jini-ai/admin/screens/media/hooks/media-port.hooks";
import type { MediaGridPort, MediaGridView } from "@jini-ai/cms/react/media/hooks/use-grid-pages.hooks";

/**
 * @file The only place under `features/media` that reaches `lib/api` for the five `MediaPort`
 * routes — see `media-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. Each method wraps its `api` counterpart explicitly rather
 *  than pointing at it directly, so a route's default-parameter shape (`uploadMedia`'s
 *  `options = {}`, `updateMedia`'s `options = {}`) stays `lib/api.ts`'s to own. */
export const defaultMediaPort: MediaPort & MediaGridPort = {
  listMedia: () => mediaApi.listMedia(),
  listMediaGrid: (view, page) => mediaApi.listMediaGrid(view, page),
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

/**
 * The in-memory media port for tests: `@jini-ai/admin`'s fake plus this host's paged grid read, answered
 * as ONE page in the server's order with the server's counts. A test that needs paging passes its own
 * `listMediaGrid`. `itemId` is an exact lookup, never a scan.
 */
export function createFakeMediaPort(options: FakeMediaPortOptions = {}): ReturnType<typeof createJiniFakeMediaPort> & MediaGridPort {
  const port = createJiniFakeMediaPort(options);
  return Object.assign(port, {
    listMediaGrid: async ({ tab, orderBy }: MediaGridView, page: { itemId?: string } = {}) =>
      fakeGridPage({ items: port.items, tab, orderBy, itemId: page.itemId }),
  });
}

/** The fake's answer to one grid request, shaped like the route's: filter by tab, order, count everything. @complexity O(n log n). */
export function fakeGridPage({ items, tab, orderBy, itemId }: { items: AdminMedia[]; tab: MediaGridView["tab"]; orderBy: MediaGridView["orderBy"]; itemId?: string }, _optional: Record<string, never> = {}): MediaGridPage {
  const inTab = (item: AdminMedia, wanted: MediaGridView["tab"]): boolean => {
    if (wanted === "trash") return item.status === "trashed";
    if (item.status === "trashed") return false;
    const family = wanted === "images" ? "image/" : wanted === "videos" ? "video/" : "";
    return (item.contentType ?? "").startsWith(family);
  };
  const matching = items.filter((item) => inTab(item, tab));
  const ordered = orderBy === "alphabetical"
    ? [...matching].sort((a, b) => a.title.trim().toLocaleLowerCase().localeCompare(b.title.trim().toLocaleLowerCase()) || (a.id < b.id ? -1 : 1))
    : [...matching].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
  const count = (wanted: MediaGridView["tab"]): number => items.filter((item) => inTab(item, wanted)).length;
  return {
    media: itemId === undefined ? ordered : ordered.filter((item) => item.id === itemId),
    nextCursor: null,
    counts: { all: count("all"), images: count("images"), videos: count("videos"), trash: count("trash") },
    hasUntypedActive: items.some((item) => item.status !== "trashed" && item.contentType === null),
  };
}
