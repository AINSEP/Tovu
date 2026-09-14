/**
 * Recovers the absolute OS path of any FOLDER in a raw drop.
 *
 * Pulled out of `App.hooks.ts` into its own module with zero repo-internal imports — originally so
 * it could be unit-tested with Node's own BARE `node --test` runner: this repo imports its own `.ts`
 * sources with a `.js` specifier (required for `tsc`'s NodeNext resolution elsewhere in this
 * project), Node's native TypeScript support does not remap that back to the real `.ts` file at run
 * time, and a module reachable only through a chain of `.js`-specifier imports could not be
 * exercised by bare `node --test` at all — confirmed empirically: it fails with
 * `ERR_MODULE_NOT_FOUND` on the first such specifier it hits, however many imports deep.
 *
 * That specific constraint is no longer why THIS file's own test runs the way it does:
 * `folder-drop.test.ts` lives under `src/renderer/`, which this package's `test` script now runs
 * through its second command, `node --import tsx --test` (tsx resolves a `.js` specifier back to
 * the real `.ts` file, so the `ERR_MODULE_NOT_FOUND` failure above would not reproduce there either
 * way — see that test file's own header). The zero-import shape stayed regardless of which runner
 * ended up executing it.
 *
 * Read directly off `dataTransfer.items`/`.files` — BEFORE `@jini-ai/chat`'s own drop handling
 * (which runs afterward, on the very same event, once the capture-phase listener that calls this,
 * `captureFolderDrop` in `use-workspace-chat-pane.hooks.ts` — `WorkspaceChatPane`'s `onDropCapture`
 * — returns without calling `preventDefault`/`stopPropagation`) expands
 * each dropped folder into synthesized per-leaf `File` objects via the `FileSystemEntry` API.
 *
 * That expansion matters because those synthesized files are NOT the ones `dataTransfer.files`
 * handed the page: `@jini-ai/ui`'s `filesFromFileSystemEntry` builds each one by calling
 * `entry.file(callback)`, and Electron's `webUtils.getPathForFile()` only resolves a path for a
 * `File` exactly as `dataTransfer.files` delivered it — it returns `''` for the synthesized ones.
 * So a folder's path has to be read here, synchronously, before that expansion ever runs; by the
 * time `uploadAttachments` sees the (already-flattened) files, the path is unrecoverable.
 */

/**
 * Pairs each `kind === 'file'` item in `items` with the `File` at the matching position in `files`.
 *
 * `dataTransfer.items` and `dataTransfer.files` are NOT simply index-aligned, despite how close
 * that reads: `.items` holds one entry per dragged representation, INCLUDING `kind === 'string'`
 * ones — a macOS Finder drag commonly adds a `text/uri-list`/`text/plain` string item alongside a
 * dropped folder's own file item — while `.files` holds only the `kind === 'file'` entries. Reusing
 * one loop index across both silently reads the wrong file (or `undefined`, dropped here with no
 * error) the moment a string item sorts ahead of a file item. This tracks a SEPARATE counter,
 * incremented only for `kind === 'file'` items, as the index into `.files` — that keeps the two
 * aligned regardless of what else the drag carries, because `.files` preserves the same relative
 * order as the file-kind items in `.items` (per spec).
 */
function pairFileItemsWithFiles(
  items: readonly DataTransferItem[],
  files: readonly File[],
): Array<{ item: DataTransferItem; file: File }> {
  const pairs: Array<{ item: DataTransferItem; file: File }> = [];
  let fileIndex = 0;
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = files[fileIndex];
    fileIndex += 1;
    if (file !== undefined) pairs.push({ item, file });
  }
  return pairs;
}

/**
 * Resolves a dropped FOLDER's OS path from one `(item, file)` pair, or `undefined` when the pair
 * is not a folder (or the folder's path could not be recovered).
 *
 * `webkitGetAsEntry().isDirectory` is what picks out which file item is a dropped FOLDER rather
 * than a loose file — Chromium (and so Electron) hands a folder drop a `File` entry too, despite a
 * folder not really being one. `getPathForFile` returning `''` is the same failure mode this
 * module's file header describes for a synthesized `File`: no path to recover, so no path to return.
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
  return path === '' ? undefined : path;
}

/**
 * Recovers the absolute OS path of every FOLDER in a raw drop, in drop order.
 *
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
