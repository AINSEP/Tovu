/**
 * Recovers the absolute OS path of any FOLDER in a raw drop.
 *
 * Pulled out of `App.hooks.ts` into its own module with zero repo-internal imports — deliberately,
 * so it can be unit-tested with Node's built-in test runner (`folder-drop.test.ts`). This repo
 * imports its own `.ts` sources with a `.js` specifier (required for `tsc`'s NodeNext resolution
 * elsewhere in this project), and Node's native TypeScript support does NOT remap that back to the
 * real `.ts` file at run time — confirmed empirically: `node --test` fails with
 * `ERR_MODULE_NOT_FOUND` on the first such specifier it hits, however many imports deep. A module
 * reachable only through a chain of `.js`-specifier imports can't be exercised by `node --test` at
 * all; a module with no repo-internal imports has no chain to break.
 *
 * Read directly off `dataTransfer.items`/`.files` — BEFORE `@jini-ai/chat`'s own drop handling
 * (which runs afterward, on the very same event, once the capture-phase listener that calls this,
 * `App.tsx`'s `onDropCapture`, returns without calling `preventDefault`/`stopPropagation`) expands
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
 * `dataTransfer.items` and `dataTransfer.files` are NOT simply index-aligned, despite how close
 * that reads: `.items` holds one entry per dragged representation, INCLUDING `kind === 'string'`
 * ones — a macOS Finder drag commonly adds a `text/uri-list`/`text/plain` string item alongside a
 * dropped folder's own file item — while `.files` holds only the `kind === 'file'` entries. Reusing
 * one loop index across both silently reads the wrong file (or `undefined`, dropped by the
 * `file === undefined` guard below with no error) the moment a string item sorts ahead of a file
 * item. This tracks a SEPARATE counter, incremented only for `kind === 'file'` items, as the index
 * into `.files` — that keeps the two aligned regardless of what else the drag carries, because
 * `.files` preserves the same relative order as the file-kind items in `.items` (per spec).
 *
 * `webkitGetAsEntry().isDirectory` is what picks out which file item is a dropped FOLDER rather
 * than a loose file — Chromium (and so Electron) hands a folder drop a `File` entry too, despite a
 * folder not really being one.
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
  let fileIndex = 0;
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const index = fileIndex;
    fileIndex += 1;
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null })
      .webkitGetAsEntry?.();
    if (entry?.isDirectory !== true) continue;
    const file = files[index];
    if (file === undefined) continue;
    const path = getPathForFile(file);
    if (path !== '') paths.push(path);
  }
  return paths;
}
