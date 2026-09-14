import { describe, expect, it } from "vitest";

import { folderPathsFromDataTransfer } from "../folder-drop";

/**
 * @file Mirrors `apps/desktop/src/renderer/folder-drop.test.ts` case-for-case (see `folder-drop.ts`'s
 * own header for why this admin-side copy exists rather than a shared import) — SPEC-053 AC-01/AC-02.
 * Plain-object stand-ins for `DataTransfer`/`DataTransferItem`/`FileSystemEntry`/`File`, same as the
 * desktop original: the function under test never reads a real DOM property off any of these, every
 * field it touches (`kind`, `webkitGetAsEntry`, `isDirectory`, `items`, `files`) is faked directly.
 */

function fakeFile(id: string): File {
  return { id } as unknown as File;
}

function fakeEntry(isDirectory: boolean): FileSystemEntry {
  return { isDirectory } as unknown as FileSystemEntry;
}

function fakeFileItem(getEntry?: () => FileSystemEntry | null): DataTransferItem {
  return { kind: "file", webkitGetAsEntry: getEntry } as unknown as DataTransferItem;
}

function fakeStringItem(): DataTransferItem {
  return { kind: "string" } as unknown as DataTransferItem;
}

function fakeDataTransfer(items: DataTransferItem[] | undefined, files: File[] | undefined): DataTransfer {
  return { items, files } as unknown as DataTransfer;
}

function getPathForFileFrom(paths: ReadonlyMap<File, string>): (file: File) => string {
  return (file) => paths.get(file) ?? "";
}

describe("folderPathsFromDataTransfer", () => {
  it("returns no paths for a drop with neither items nor files", () => {
    expect(folderPathsFromDataTransfer(fakeDataTransfer(undefined, undefined), () => "/unused")).toEqual([]);
  });

  it("skips a non-file item (e.g. the text/uri-list string item Finder adds alongside a folder)", () => {
    const dataTransfer = fakeDataTransfer([fakeStringItem()], []);
    expect(folderPathsFromDataTransfer(dataTransfer, () => "/unused")).toEqual([]);
  });

  it("skips a file item whose entry is not a directory", () => {
    const file = fakeFile("loose-file");
    const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(false))], [file]);
    expect(
      folderPathsFromDataTransfer(dataTransfer, getPathForFileFrom(new Map([[file, "/should-not-appear"]]))),
    ).toEqual([]);
  });

  it("skips a file item whose webkitGetAsEntry() resolves to null", () => {
    const file = fakeFile("no-entry");
    const dataTransfer = fakeDataTransfer([fakeFileItem(() => null)], [file]);
    expect(
      folderPathsFromDataTransfer(dataTransfer, getPathForFileFrom(new Map([[file, "/should-not-appear"]]))),
    ).toEqual([]);
  });

  it("skips a file item on a drag that never defines webkitGetAsEntry at all", () => {
    const file = fakeFile("no-method");
    const dataTransfer = fakeDataTransfer([fakeFileItem(undefined)], [file]);
    expect(
      folderPathsFromDataTransfer(dataTransfer, getPathForFileFrom(new Map([[file, "/should-not-appear"]]))),
    ).toEqual([]);
  });

  it("recovers the OS path for a single dropped folder", () => {
    const file = fakeFile("folder-a");
    const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(true))], [file]);
    expect(
      folderPathsFromDataTransfer(dataTransfer, getPathForFileFrom(new Map([[file, "/Users/x/Desktop/Folder A"]]))),
    ).toEqual(["/Users/x/Desktop/Folder A"]);
  });

  it("drops a resolved folder whose path could not be recovered (getPathForFile returned '')", () => {
    const file = fakeFile("unresolvable-folder");
    const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(true))], [file]);
    expect(folderPathsFromDataTransfer(dataTransfer, () => "")).toEqual([]);
  });

  it("drops a folder item when .files has no entry at its index", () => {
    const dataTransfer = fakeDataTransfer([fakeFileItem(() => fakeEntry(true))], []);
    expect(folderPathsFromDataTransfer(dataTransfer, () => "/should-not-appear")).toEqual([]);
  });

  it("keeps the .files index aligned when a string item sits ahead of the folder's file item", () => {
    const file = fakeFile("the-only-file");
    const dataTransfer = fakeDataTransfer([fakeStringItem(), fakeFileItem(() => fakeEntry(true))], [file]);
    expect(
      folderPathsFromDataTransfer(dataTransfer, getPathForFileFrom(new Map([[file, "/Users/x/Desktop/Aligned Folder"]]))),
    ).toEqual(["/Users/x/Desktop/Aligned Folder"]);
  });

  it("preserves drop order across a mix of string items, loose files, and multiple folders", () => {
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
    expect(
      folderPathsFromDataTransfer(
        dataTransfer,
        getPathForFileFrom(
          new Map([
            [folderOne, "/Users/x/Desktop/Folder One"],
            [folderTwo, "/Users/x/Desktop/Folder Two"],
          ]),
        ),
      ),
    ).toEqual(["/Users/x/Desktop/Folder One", "/Users/x/Desktop/Folder Two"]);
  });
});
