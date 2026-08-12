import type { AdminMedia } from "../../../lib/api";

/**
 * @file What `use-media.hooks.ts` and `use-edit-media-panel.hooks.ts` need from the outside world,
 * as an interface rather than a direct `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on
 * `development/docs/architecture/wired-hooks-convention.md` (canonical spec) and
 * `redirects-port.hooks.ts` (canonical reference implementation): this file declares,
 * `media-dependencies.hooks.ts` binds the real `api` client, and nothing else under
 * `features/media` imports `lib/api` for these five routes. One shared port rather than one per
 * hook — both hooks read/write the same `/media` resource, and a test double for one is a test
 * double for the resource, not for a single screen.
 *
 * `api.mediaOriginalUrl` is deliberately NOT part of this port: it is a pure, synchronous URL
 * template (`${BASE}/workspaces/${WORKSPACE_ID}/media/${id}/original` — no `fetch`, no `await`,
 * see `lib/api.ts`), not I/O. Per the convention's "what stays a direct import" rule (same
 * reasoning as `describeApiError`), a pure no-I/O function is imported directly rather than
 * injected — injecting it would let a fake quietly change a decision rule every test needs to hold
 * still, for zero testability gain since there is no host boundary to cross.
 */
export interface MediaPort {
  listMedia(): Promise<{ media: AdminMedia[] }>;
  uploadMedia(
    input: { filename: string; contentType: string; dataBase64: string },
    options?: { alt?: string; caption?: string; credit?: string }
  ): Promise<{ media: AdminMedia }>;
  updateMedia(
    target: { id: string },
    options?: {
      title?: string;
      alt?: string;
      caption?: string;
      credit?: string;
      width?: number | null;
      height?: number | null;
      cssClass?: string | null;
    }
  ): Promise<{ media: AdminMedia }>;
  trashMedia(id: string): Promise<{ media: AdminMedia }>;
  deleteMedia(id: string): Promise<{ purged: boolean }>;
}
