/**
 * @file Behavioural tests for `folder-drop.ts`'s only export, `folderPathsFromDataTransfer`.
 * Written against the real function, using plain-object stand-ins for `DataTransfer` /
 * `DataTransferItem` / `FileSystemEntry` / `File` — the same identity-stand-in approach
 * `SiteGrid.hooks.test.ts` uses for DOM nodes. This package has no jsdom dependency at all, and none
 * is needed here: the function under test never reads a real DOM property off any of these objects —
 * every field it touches (`kind`, `webkitGetAsEntry`, `isDirectory`, `items`, `files`) is faked
 * directly.
 *
 * Run by the `*.test.ts` half of this package's `test` script (`node --import tsx --test`), same as
 * `App.hooks.test.ts` and `SiteGrid.hooks.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { folderPathsFromDataTransfer } from "./folder-drop.js";

/** A `File` stand-in. Nothing in the function under test reads any real `File` property — every
 *  file only ever passes through `getPathForFile`, which this suite controls — so identity is all a
 *  fake file needs. */
function fakeFile(id: string): File {
  return { id } as unknown as File;
}

/** A `FileSystemEntry` stand-in exposing only `isDirectory`, the one field the function reads. */
function fakeEntry(isDirectory: boolean): FileSystemEntry {
  return { isDirectory } as unknown as FileSystemEntry;
}

/** A `kind: 'file'` drag item. `getEntry` models `webkitGetAsEntry()`: omit it to model a drag that
 *  never defines the method at all, pass `() => null` to model one that defines it but resolves
 *  nothing, or pass `() => fakeEntry(...)` for a resolved entry. */
function fakeFileItem(getEntry?: () => FileSystemEntry | null): DataTransferItem {
  return {
    kind: "file",
    webkitGetAsEntry: getEntry,
  } as unknown as DataTransferItem;
}

/** A non-file drag item — e.g. the `text/uri-list`/`text/plain` string item macOS Finder adds
 *  alongside a dropped folder's own file item. */
function fakeStringItem(): DataTransferItem {
  return { kind: "string" } as unknown as DataTransferItem;
}

function fakeDataTransfer(
  items: DataTransferItem[] | undefined,
  files: File[] | undefined,
): DataTransfer {
  return { items, files } as unknown as DataTransfer;
}

/** Builds a `getPathForFile` that answers only for the given `(file, path)` pairs and returns `''`
 *  for anything else — matching `webUtils.getPathForFile()`'s real behaviour for a `File` it cannot
 *  resolve a path for. */
function getPathForFileFrom(paths: ReadonlyMap<File, string>): (file: File) => string {
  return (file) => paths.get(file) ?? "";
}

test("returns no paths for a drop with neither items nor files", () => {
  const dataTransfer = fakeDataTransfer(undefined, undefined);
  const result = folderPathsFromDataTransfer(dataTransfer, () => "/unused");
  assert.deepEqual(result, []);
});

test("skips a non-file item (e.g. the text/uri-list string item Finder adds alongside a folder)", () => {
  const dataTransfer = fakeDataTransfer([fakeStringItem()], []);
  const result = folderPathsFromDataTransfer(dataTransfer, () => "/unused");
  assert.deepEqual(result, []);
});

test("skips a file item whose entry is not a directory", () => {
  const file = fakeFile("loose-file");
  const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(false))], [file]);
  const result = folderPathsFromDataTransfer(
    dataTransfer,
    getPathForFileFrom(new Map([[file, "/should-not-appear"]])),
  );
  assert.deepEqual(result, []);
});

test("skips a file item whose webkitGetAsEntry() resolves to null", () => {
  const file = fakeFile("no-entry");
  const dataTransfer = fakeDataTransfer([fakeFileItem(() => null)], [file]);
  const result = folderPathsFromDataTransfer(
    dataTransfer,
    getPathForFileFrom(new Map([[file, "/should-not-appear"]])),
  );
  assert.deepEqual(result, []);
});

test("skips a file item on a drag that never defines webkitGetAsEntry at all", () => {
  const file = fakeFile("no-method");
  const dataTransfer = fakeDataTransfer([fakeFileItem(undefined)], [file]);
  const result = folderPathsFromDataTransfer(
    dataTransfer,
    getPathForFileFrom(new Map([[file, "/should-not-appear"]])),
  );
  assert.deepEqual(result, []);
});

test("recovers the OS path for a single dropped folder", () => {
  const file = fakeFile("folder-a");
  const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(true))], [file]);
  const result = folderPathsFromDataTransfer(
    dataTransfer,
    getPathForFileFrom(new Map([[file, "/Users/x/Desktop/Folder A"]])),
  );
  assert.deepEqual(result, ["/Users/x/Desktop/Folder A"]);
});

test("drops a resolved folder whose path could not be recovered (getPathForFile returned '')", () => {
  // The exact failure mode the module's own header warns about: a synthesized File — one that did
  // NOT come straight off dataTransfer.files the way the page received it — resolves to ''.
  const file = fakeFile("unresolvable-folder");
  const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(true))], [file]);
  const result = folderPathsFromDataTransfer(dataTransfer, () => "");
  assert.deepEqual(result, []);
});

test("drops a folder item when .files has no entry at its index", () => {
  // items claims one file-kind item, but .files is empty — the `file === undefined` guard.
  const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(true))], []);
  const result = folderPathsFromDataTransfer(dataTransfer, () => "/should-not-appear");
  assert.deepEqual(result, []);
});

test("keeps the .files index aligned when a string item sits ahead of the folder's file item", () => {
  // This is the bug the module's header describes: .items and .files are NOT index-aligned once a
  // string item is present, because .files holds only the kind === 'file' entries. A loop that used
  // one shared index here would read files[1] (out of bounds -> undefined) instead of files[0].
  const file = fakeFile("the-only-file");
  const dataTransfer = fakeDataTransfer(
    [fakeStringItem(), fakeFileItem(() => fakeEntry(true))],
    [file],
  );
  const result = folderPathsFromDataTransfer(
    dataTransfer,
    getPathForFileFrom(new Map([[file, "/Users/x/Desktop/Aligned Folder"]])),
  );
  assert.deepEqual(result, ["/Users/x/Desktop/Aligned Folder"]);
});

test("preserves drop order across a mix of string items, loose files, and multiple folders", () => {
  const folderOne = fakeFile("folder-one-file");
  const looseFile = fakeFile("loose-file");
  const folderTwo = fakeFile("folder-two-file");
  const dataTransfer = fakeDataTransfer(
    [
      fakeStringItem(),
      fakeFileItem(() => fakeEntry(true)), // folder one -> files[0]
      fakeFileItem(() => fakeEntry(false)), // loose file -> files[1], excluded
      fakeFileItem(() => fakeEntry(true)), // folder two -> files[2]
    ],
    [folderOne, looseFile, folderTwo],
  );
  const result = folderPathsFromDataTransfer(
    dataTransfer,
    getPathForFileFrom(
      new Map([
        [folderOne, "/Users/x/Desktop/Folder One"],
        [folderTwo, "/Users/x/Desktop/Folder Two"],
      ]),
    ),
  );
  assert.deepEqual(result, ["/Users/x/Desktop/Folder One", "/Users/x/Desktop/Folder Two"]);
});
