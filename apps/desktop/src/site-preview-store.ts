/**
 * @file Where a site card's preview image lives on disk, and everything about it that is not
 * Electron: the path convention, the version token the renderer polls, reading one back as a
 * `data:` URL, and the two cleanup paths.
 *
 * The CAPTURE itself is not here — that needs a `BrowserWindow` and lives in `main.ts`. Splitting
 * at that line is what makes all of this testable under plain `node --test`, same convention as
 * `tracked-sites.ts`, `site-dir-store.ts` and `site-config.ts`.
 *
 * **WHY A FILE KEYED BY A DIGEST, AND NOT A FIELD IN THE REGISTRY.** `desktop-projects.json`'s row
 * keys are frozen (`siteDir`, `origin`, `siteId`, `createdAt`, plus the top-level `dismissed`), and
 * a preview needs no new one: the filename is DERIVED from `siteDir`, which is already the row key
 * and already `SiteRecord.id`. The digest is `sitePartition`'s own
 * (`sha256(path.resolve(siteDir)).slice(0, 32)`, `desktop-auth.ts`) rather than a second scheme,
 * so one site has one identity across this app rather than two that can disagree.
 *
 * **WHY THE RECORD CARRIES A VERSION AND NOT THE IMAGE.** `useSitesPolling` calls `listSites()`
 * every 4 seconds — it must, because sites crash and finish booting with no user action. A `data:`
 * URL on `SiteRecord` would therefore re-serialize every preview across IPC 15 times a minute for
 * the life of the window (~1.25 MB per poll at 50 sites) to redraw images that have not changed.
 * {@link readPreviewVersion} returns an mtime instead — eight bytes — and the renderer asks for the
 * bytes once, then only again when that number moves.
 *
 * **STALENESS IS CORRECT BEHAVIOUR HERE, NOT A BUG TO FIX LATER.** A capture is taken when a site
 * STARTS, so a thumbnail is at most one session old: it shows the site as it was the last time it
 * ran, which is what "last known" means. A site the operator edited but has not restarted showing
 * its pre-change state is the honest answer, not a cache-invalidation failure. Do not add a timer,
 * a watcher, or a staleness badge — a slightly old thumbnail is normal, and a badge saying so is
 * noise on every card.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PREVIEW_DIR_NAME = "site-previews";

/** Captures are written as PNG — `nativeImage.toPNG()` is lossless and needs no quality knob for
 *  an image this small. The extension is fixed so {@link previewPath} stays a pure function. */
const PREVIEW_EXTENSION = ".png";

/**
 * A site's preview filename stem — the SAME digest `sitePartition` derives, so this app has one
 * notion of "which site is this" rather than two.
 *
 * Deliberately not re-exported from `desktop-auth.ts`: that module's export is a session-partition
 * string (`persist:tovu-site-<digest>`), not the digest, and parsing the digest back out of it
 * would couple this file to that string's shape.
 *
 * @complexity O(n) in the path length.
 */
function siteDigest(siteDir: string): string {
  return crypto.createHash("sha256").update(path.resolve(siteDir)).digest("hex").slice(0, 32);
}

/**
 * The directory holding every cached preview.
 *
 * `userDataDir` is passed in rather than read from `app.getPath("userData")` here, for the reason
 * `main.ts`'s own header gives about `TOVU_DESKTOP_USER_DATA_DIR`: that override must be applied
 * before `whenReady()`, and every consumer has to resolve userData through the same accessor at the
 * same time. A module that read it independently would write E2E previews into the real user's
 * profile — a pollution nobody would notice for weeks.
 *
 * @complexity O(1).
 */
function previewDir(userDataDir: string): string {
  return path.join(userDataDir, PREVIEW_DIR_NAME);
}

/**
 * Absolute path of one site's cached preview. Pure — says nothing about whether it exists.
 *
 * @complexity O(n) in the path length.
 */
function previewPath(userDataDir: string, siteDir: string): string {
  return path.join(previewDir(userDataDir), `${siteDigest(siteDir)}${PREVIEW_EXTENSION}`);
}

/**
 * The token the renderer watches to know its cached image is stale: the capture's mtime in
 * milliseconds, or `null` when there is no capture.
 *
 * An mtime rather than a counter because it needs no state of its own — the filesystem already
 * records it, it survives a restart, and a file replaced by {@link writePreview} always moves it
 * forward. A counter would have to live somewhere, and the only somewhere available is the registry
 * whose keys are frozen.
 *
 * @returns the mtime in ms, or `null` when absent or unreadable. Never throws: a missing preview is
 *   the ordinary case (every site starts with none), not an error.
 * @complexity O(1) — one `stat`.
 */
function readPreviewVersion(userDataDir: string, siteDir: string): number | null {
  try {
    return fs.statSync(previewPath(userDataDir, siteDir)).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * One site's cached preview as a `data:` URL, or `null` when there is none.
 *
 * A `data:` URL rather than a `file://` path: the renderer is a `file://` page (`main.ts` loads it
 * with `loadFile`), and whether Chromium lets such a page load a `file://` image from a DIFFERENT
 * directory is a policy question this app should not depend on the answer to. A `data:` URL has no
 * such question, needs no custom protocol registered, and — because it is fetched on demand and
 * keyed by {@link readPreviewVersion} rather than ridden along on every 4s poll — costs nothing per
 * poll. See this file's own header.
 *
 * @returns the URL, or `null` when absent or unreadable.
 * @complexity O(n) in the file size — one read plus one base64 encode.
 */
function readPreviewDataUrl(userDataDir: string, siteDir: string): string | null {
  try {
    const bytes = fs.readFileSync(previewPath(userDataDir, siteDir));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Store `bytes` as `siteDir`'s preview, replacing any previous one.
 *
 * Written to a temp file and renamed, for a narrower reason than `site-config.ts`'s: a torn PNG
 * here breaks nothing that matters, but a half-written file would still have a NEWER mtime than the
 * good one it replaced, so {@link readPreviewVersion} would report a new version for an image that
 * cannot decode — and the renderer would swap a working thumbnail for a broken one. Same-directory
 * rename makes the file either the old one or the new one.
 *
 * @param bytes the PNG, as `nativeImage.toPNG()` returns it.
 * @returns the new version token, or `null` when the write failed. Never throws: a preview is
 *   decoration, and failing to cache one must never take down the site start that triggered it.
 * @complexity O(n) in the byte length.
 */
function writePreview(userDataDir: string, siteDir: string, bytes: Buffer): number | null {
  const filePath = previewPath(userDataDir, siteDir);
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(previewDir(userDataDir), { recursive: true });
    fs.writeFileSync(tempPath, bytes);
    fs.renameSync(tempPath, filePath);
    return fs.statSync(filePath).mtimeMs;
  } catch {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // The write already failed; a failed cleanup adds nothing to report.
    }
    return null;
  }
}

/**
 * Drop one site's cached preview. Called where the registry row is unmade (`project-ipc.ts`'s
 * `handleDelete`, the single production call site of `untrackSite`).
 *
 * @complexity O(1).
 */
function deletePreview(userDataDir: string, siteDir: string): void {
  try {
    fs.rmSync(previewPath(userDataDir, siteDir), { force: true });
  } catch {
    // Best-effort. An orphan is swept at next boot, and is invisible until then — see
    // {@link sweepOrphanedPreviews}.
  }
}

/**
 * Delete every cached preview that no tracked site claims.
 *
 * HYGIENE, NOT CORRECTNESS, and the distinction matters for anyone tempted to make this more
 * eager: `buildSiteRecord` only ever asks for the preview of a row it is already building, so an
 * orphaned file is unreachable from the UI — it is disk litter, never a card showing a screenshot
 * of a site that no longer exists. {@link deletePreview} handles the ordinary path; this catches
 * the ones that never went through it (a hand-edited registry, a crash between the two writes, a
 * folder removed in Finder).
 *
 * @param trackedSiteDirs every currently tracked site directory.
 * @returns how many files were removed.
 * @complexity O(n + m) — one `readdir` against a Set built from the tracked rows.
 */
function sweepOrphanedPreviews(userDataDir: string, trackedSiteDirs: string[]): number {
  const keep = new Set(trackedSiteDirs.map((dir) => `${siteDigest(dir)}${PREVIEW_EXTENSION}`));
  let removed = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(previewDir(userDataDir));
  } catch {
    // No directory yet is the ordinary first-run state, not a failure.
    return 0;
  }
  for (const entry of entries) {
    if (keep.has(entry)) continue;
    try {
      fs.rmSync(path.join(previewDir(userDataDir), entry), { force: true });
      removed += 1;
    } catch {
      // Leave it; the next boot tries again.
    }
  }
  return removed;
}

export {
  siteDigest,
  previewDir,
  previewPath,
  readPreviewVersion,
  readPreviewDataUrl,
  writePreview,
  deletePreview,
  sweepOrphanedPreviews,
};
