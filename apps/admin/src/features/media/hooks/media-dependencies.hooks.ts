import { api, type AdminMedia } from "@/lib/api";
import type { MediaPort } from "./media-port.hooks";

/**
 * @file The only place under `features/media` that reaches `lib/api` for the five `MediaPort`
 * routes — see `media-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies
 *  .hooks.ts`'s `defaultRedirectsPort`. Each method wraps its `api` counterpart explicitly rather
 *  than pointing at it directly, so a route's default-parameter shape (`uploadMedia`'s
 *  `options = {}`, `updateMedia`'s `options = {}`) stays `lib/api.ts`'s to own. */
export const defaultMediaPort: MediaPort = {
  listMedia: () => api.listMedia(),
  uploadMedia: (input, options) => api.uploadMedia(input, options),
  updateMedia: (target, options) => api.updateMedia(target, options),
  trashMedia: (id) => api.trashMedia(id),
  deleteMedia: (id) => api.deleteMedia(id),
  mediaOriginalUrl: (id) => api.mediaOriginalUrl(id),
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
export function createFakeMediaPort(options: FakeMediaPortOptions = {}): MediaPort & {
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
      slug: input.filename.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled",
      alt: opts.alt ?? "",
      caption: opts.caption ?? "",
      credit: opts.credit ?? "",
      width: null,
      height: null,
      cssClass: null,
      htmlAttributes: null,
      // The REAL server ignores this declared string and stores `sniffContentType(bytes)` instead
      // (see `server/routes/admin/media/upload.ts`). This fake has no bytes to sniff — its input is
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

    async uploadMedia(input, options = {}) {
      const created = newItem(input, options);
      items.push(created);
      return { media: created };
    },

    async updateMedia({ id }, options = {}) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`fake media not found: ${id}`);
      const updated = { ...items[index]!, ...options };
      items[index] = updated;
      return { media: updated };
    },

    async trashMedia(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`fake media not found: ${id}`);
      const trashed: AdminMedia = { ...items[index]!, status: "trashed" };
      items[index] = trashed;
      return { media: trashed };
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
