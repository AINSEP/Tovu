/**
 * @file Recovers the absolute OS path of every FOLDER in a raw drop onto the admin chat composer
 * (`AssistantDock`'s `ChatPane`) — the admin-side counterpart of
 * `apps/desktop/src/renderer/folder-drop.ts` (SPEC-053).
 *
 * **Why this is a duplicate, not a shared import.** `apps/desktop` and `apps/admin` are separate
 * apps with no dependency edge between them today — `apps/admin` also ships as a plain browser
 * bundle with no relationship to Electron at all, so importing across that boundary for one ~90-line,
 * zero-repo-internal-import module would add a real cross-app coupling for a function this codebase
 * already treats as intentionally standalone (see the desktop original's own header: pulled out
 * specifically so it has "zero repo-internal imports"). The desktop preload already sets the
 * precedent for this exact tradeoff — `apps/desktop/src/preload/preload.mts` re-exposes `tovuVoice`
 * itself (byte-for-byte the same surface `preload-speech.cts` exposes) rather than sharing one preload
 * across the two window kinds it serves, for the same "one Electron preload per window, duplicate the
 * small bridge" reason. `folder-drop.test.ts` in `apps/desktop` is the source of truth for this
 * function's behavior; this file and its own test are kept in lockstep with it by hand — there is no
 * automated drift guard, since the two apps have no shared build step that could run one.
 *
 * Read directly off `dataTransfer.items`/`.files`, BEFORE `@jini-ai/chat`'s own drop handling (which
 * runs afterward, on the same event, once the capture-phase listener that calls this — the wrapping
 * `<aside aria-label="Assistant">` in `apps/admin/src/App.tsx`, via `AssistantDock`'s imperative
 * `handleDropCapture` — returns without calling `preventDefault`/`stopPropagation`) expands a dropped
 * folder into synthesized per-leaf `File` objects via the `FileSystemEntry` API. That expansion is
 * exactly the owner-reported bug this closes: "i still cant drop a folder path to chat input... i just
 * adds all the files in the folder." See the desktop original's header for the full mechanism —
 * `webUtils.getPathForFile()` only resolves a path for a `File` exactly as `dataTransfer.files` handed
 * it, not for one of those synthesized leaves.
 */

/**
 * Pairs each `kind === 'file'` item in `items` with the `File` at the matching position in `files`.
 * See the desktop original for why a shared loop index across `.items`/`.files` is wrong (a macOS
 * Finder drag commonly adds a `text/uri-list`/`text/plain` string item alongside a dropped folder's
 * own file item, and `.files` holds only the `kind === 'file'` entries).
 */
function pairFileItemsWithFiles(
  items: readonly DataTransferItem[],
  files: readonly File[],
): Array<{ item: DataTransferItem; file: File }> {
  const pairs: Array<{ item: DataTransferItem; file: File }> = [];
  let fileIndex = 0;
  for (const item of items) {
    if (item.kind !== "file") continue;
    const file = files[fileIndex];
    fileIndex += 1;
    if (file !== undefined) pairs.push({ item, file });
  }
  return pairs;
}

/**
 * Resolves a dropped FOLDER's OS path from one `(item, file)` pair, or `undefined` when the pair is
 * not a folder (or the folder's path could not be recovered).
 */
function folderPathForItem(
  item: DataTransferItem,
  file: File,
  getPathForFile: (file: File) => string,
): string | undefined {
  const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null })
    .webkitGetAsEntry?.();
  if (entry?.isDirectory !== true) return undefined;
  const path = getPathForFile(file);
  return path === "" ? undefined : path;
}

/**
 * Recovers the absolute OS path of every FOLDER in a raw drop, in drop order.
 *
 * @param dataTransfer the raw `DragEvent.dataTransfer` from a capture-phase drop listener.
 * @param getPathForFile `window.tovuFiles.getPathForFile` (see `folder-drop-port.ts`) — injected so
 *   this stays testable with plain stand-ins, exactly like the desktop original.
 * @returns every recovered folder path, in drop order; an empty array when nothing dropped was a
 *   folder (or no folder's path could be recovered) — the caller's cue to let the drop fall through
 *   to the ordinary attachment-upload path unchanged.
 * @complexity Time: O(n) in the number of dragged items; space: O(n).
 */
export function folderPathsFromDataTransfer(
  dataTransfer: DataTransfer,
  getPathForFile: (file: File) => string,
): string[] {
  const items = Array.from(dataTransfer.items ?? []);
  const files = Array.from(dataTransfer.files ?? []);
  const paths: string[] = [];
  for (const { item, file } of pairFileItemsWithFiles(items, files)) {
    const path = folderPathForItem(item, file, getPathForFile);
    if (path !== undefined) paths.push(path);
  }
  return paths;
}
