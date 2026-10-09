/**
 * @file Where an admin Sites card's preview image lives on disk: the path convention, the version
 * token the listing carries, reading one back, and the atomic write.
 *
 * The server twin of the desktop app's `apps/desktop/src/site-preview-store.ts`, with the same three
 * decisions for the same reasons: the record carries a VERSION (the file's mtime), never the bytes,
 * because the Sites listing is re-read on every refresh; a write goes temp-file-then-rename, because
 * a torn image with a newer mtime would replace a working thumbnail with a broken one; and every
 * failure is `null`, never a throw, because a preview is decoration. NEEDS-JINI: both twins are
 * plain-Node digest/name-keyed image caches and belong in one Jini module (see this feature's
 * report); they are not shared yet because neither app imports the other's source.
 *
 * Keyed by the site's FOLDER NAME rather than the desktop's directory digest: on the server the
 * folder name is already every site's identity (every Sites write takes it), and the same bound
 * the Sites routes enforce (`SITE_NAME_PATTERN`, at most 100 characters) keeps it a safe path
 * segment, so it cannot climb out of {@link root}.
 *
 * Stored under `sites/.tovu/site-previews/` — the switcher base's gitignored sibling of every site
 * folder (`.gitignore`'s `sites/.tovu/`), so a capture never shows up in `git status` the way a
 * file inside the tracked `sites/<name>/` would.
 */
import nodeFs from "node:fs";
import path from "node:path";
import { SITE_NAME_PATTERN, type SiteBinding } from "#src/platform/site-dir/index";

/** JPEG: a 640px screenshot is ~40 KB here against ~300 KB as PNG, and it is only a thumbnail. */
export const SITE_PREVIEW_CONTENT_TYPE = "image/jpeg";
const EXTENSION = ".jpg";

/** The subset of `node:fs` the store touches — injectable so every failure branch is testable. */
export type SitePreviewFs = Pick<typeof nodeFs, "statSync" | "readFileSync" | "writeFileSync" | "renameSync" | "mkdirSync" | "rmSync">;

export interface SitePreviewStore {
  /** The capture's mtime in ms, or `null` when there is none or `name` is not a site folder name. */
  version(required: { name: string }, optional?: {}): number | null;
  read(required: { name: string }, optional?: {}): Buffer | null;
  /** @returns the new version token, or `null` when the write failed. */
  write(required: { name: string; bytes: Buffer }, optional?: {}): number | null;
}

/**
 * The preview directory for a switcher-compatible binding (`sites/<name>/` under a switcher base),
 * else `null`: an install-dir boot has no `sites/.tovu/` of its own to write into.
 * @complexity O(n) in the path length.
 */
export function sitePreviewRoot({ binding }: { binding: Pick<SiteBinding, "dir" | "switcherCompatible"> }, _optional = {}): string | null {
  return binding.switcherCompatible ? path.join(path.dirname(binding.dir), ".tovu", "site-previews") : null;
}

/**
 * A filesystem-backed {@link SitePreviewStore} rooted at `root`.
 * @complexity Each call O(1) syscalls; `read`/`write` O(n) in the image size.
 */
export function createSitePreviewStore(
  { root }: { root: string },
  { fs = nodeFs, pid = process.pid }: { fs?: SitePreviewFs; pid?: number } = {},
): SitePreviewStore {
  /** `null` for anything that is not a valid site folder name — never a path built from it. */
  function fileFor(name: string): string | null {
    if (name.length < 1 || name.length > 100 || !SITE_NAME_PATTERN.test(name)) return null;
    return path.join(root, `${name}${EXTENSION}`);
  }

  return {
    version({ name }) {
      const file = fileFor(name);
      if (file === null) return null;
      try {
        return fs.statSync(file).mtimeMs;
      } catch {
        // No capture yet is the ordinary state for every new or never-started site.
        return null;
      }
    },
    read({ name }) {
      const file = fileFor(name);
      if (file === null) return null;
      try {
        return fs.readFileSync(file);
      } catch {
        return null;
      }
    },
    write({ name, bytes }) {
      const file = fileFor(name);
      if (file === null) return null;
      const temp = `${file}.${pid}.tmp`;
      try {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(temp, bytes);
        fs.renameSync(temp, file);
        return fs.statSync(file).mtimeMs;
      } catch {
        try {
          fs.rmSync(temp, { force: true });
        } catch {
          // The write already failed; a failed cleanup adds nothing to report.
        }
        return null;
      }
    },
  };
}
