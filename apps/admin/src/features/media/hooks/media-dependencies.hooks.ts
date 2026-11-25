import type { AdminMedia, MediaGridPage } from "@jini-ai/core/contracts/site/cms-admin-media";
import { mediaApi } from "@/features/media/api/media-api";
import { usersApi } from "@/features/users/api/users-api";
import { trashApi } from "@/features/trash/api/trash-api";
import type { MediaPort } from "@jini-ai/admin/screens/media/hooks/media-port.hooks";
import { asciiSlug } from "@jini-ai/admin/shell/lib/ascii-slug";
import { trimChars } from "@jini-ai/core/primitives";
import type { MediaGridPort, MediaGridView } from "./use-grid-pages.hooks";

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

/** Seed state for {@link createFakeMediaPort}. */
export interface FakeMediaPortOptions {
  media?: AdminMedia[];
}

/**
 * An in-memory {@link MediaPort} for tests — lets a test describe "the library has these two
 * items" or "an upload with this alt text" directly, instead of hand-building `Response` objects
 * and stubbing global `fetch`. Shipped alongside the real binding per the pattern's "every port
 * gets a fake" rule.
 */
export function createFakeMediaPort(options: FakeMediaPortOptions = {}): MediaPort & MediaGridPort & {
  /** Every item currently in the fake's store, in list order. */
  readonly items: AdminMedia[];
} {
  const items = [...(options.media ?? [])];

  function newItem(input: { filename: string; contentType: string; dataBase64: string }, opts: { alt?: string; caption?: string; credit?: string }): AdminMedia {
    return {
      id: `fake-${items.length + 1}`,
      workspaceId: "fake-ws",
      status: "active",
      sha256: `fake-sha-${items.length + 1}`,
      title: input.filename,
      // Rough approximation of the real server's `slugifyMediaTitle` (`@jini-ai/cms/media`) — good
      // enough for a fake store's own uniqueness-free happy path; a test needing a REAL collision or
      // conflict must seed `options.media` directly with an explicit `slug`, same as `contentType`'s
      // own disclosed limit above.
      slug: asciiSlug({ text: input.filename, trimChars }) || "untitled",
      alt: opts.alt ?? "",
      caption: opts.caption ?? "",
      credit: opts.credit ?? "",
      width: null,
      height: null,
      cssClass: null,
      htmlAttributes: null,
      // The REAL server ignores this declared string and stores `sniffContentType(bytes)` instead
      // (see `apps/website/src/server/inbound/admin-http/routes/media/upload.ts`). This fake has no bytes to sniff — its input is
      // an opaque base64 string a test made up — so it echoes what the caller declared. A test that
      // needs the two to disagree (uploading bytes whose real type differs from the declared one)
      // must seed `options.media` directly rather than rely on this path.
      contentType: input.contentType,
      publicUrl: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      version: 1,
    };
  }

  return {
    items,

    async listMedia() {
      return { media: [...items] };
    },

    // The whole store as ONE page in the server's order, with the server's counts: a test that needs
    // paging passes its own `listMediaGrid`. `itemId` is an exact lookup, never a scan.
    async listMediaGrid({ tab, orderBy }, page = {}) {
      return fakeGridPage({ items, tab, orderBy, itemId: page.itemId });
    },

    async uploadMedia(input, options = {}) {
      const created = newItem(input, options);
      items.push(created);
      return { media: created };
    },

    async updateMedia({ id }, options = {}) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`fake media not found: ${id}`);
      const updated = { ...items[index], ...options };
      items[index] = updated;
      return { media: updated };
    },

    async trashMedia(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`fake media not found: ${id}`);
      const trashed: AdminMedia = { ...items[index], status: "trashed" };
      items[index] = trashed;
      return { media: trashed };
    },

    async restoreMedia(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`fake media not found: ${id}`);
      items[index] = { ...items[index], status: "active" };
      return { restored: true };
    },

    async deleteMedia(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`fake media not found: ${id}`);
      items.splice(index, 1);
      return { purged: true };
    },

    // A distinct `fake://` scheme, not `api.mediaOriginalUrl`'s real
    // `/workspaces/.../media/.../original` shape — so a test asserting a resolved URL came from
    // THIS fake fails if a consumer ever goes back to calling the real `api` directly.
    mediaOriginalUrl(id) {
      return `fake://media-original/${id}`;
    },
  };
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
