/** `folder-zip.ts`: a picked folder becomes one readable stored-mode `.zip` whose entries sit at the
 *  top (the folder's own name stripped), with exact bytes and CRCs, and over-limit or empty folders
 *  are refused before anything is uploaded. */
import { describe, expect, it } from "vitest";

import { crc32, FOLDER_MAX_FILES, FolderZipError, zipFolderFiles } from "../InstallTabCard/folder-zip";

function picked(path: string, content: BlobPart): File {
  const file = new File([content], path.split("/").pop()!);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

/** Reads every central-directory entry, then its local header and bytes — an independent parse of
 *  the archive layout, so a wrong offset, size or CRC fails here. */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: Array<{ name: string; data: Uint8Array; crc: number; flags: number }> = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint16(local + 8, true)).toBe(0); // stored
    const size = view.getUint32(local + 18, true);
    const start = local + 30 + view.getUint16(local + 26, true);
    entries.push({ name, data: bytes.subarray(start, start + size), crc: view.getUint32(local + 14, true), flags: view.getUint16(at + 8, true) });
    at += 46 + nameLength;
  }
  return entries;
}

describe("zipFolderFiles", () => {
  it("strips the picked folder's name, keeps bytes exact (binary too), and names the zip after the folder", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x80]);
    const zip = await zipFolderFiles({ files: [picked("hello/tovu.plugin.json", "{}"), picked("hello/server/index.mjs", "export {}"), picked("hello/img/é.png", png)], maxBytes: 1024 });
    expect(zip.name).toBe("hello.zip");
    expect(zip.type).toBe("application/zip");
    const entries = readZip(new Uint8Array(await zip.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual(["tovu.plugin.json", "server/index.mjs", "img/é.png"]);
    expect(Array.from(entries[2]!.data)).toEqual(Array.from(png));
    for (const entry of entries) expect(entry.crc).toBe(crc32(entry.data));
    // Only the non-ASCII name carries the UTF-8 flag.
    expect(entries.map((e) => e.flags)).toEqual([0, 0, 0x0800]);
  });

  it("matches the standard CRC-32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("refuses an empty folder, too many files, and a folder over the limit before or after zipping", async () => {
    await expect(zipFolderFiles({ files: [], maxBytes: 10 })).rejects.toMatchObject({ reason: "empty" });
    const many = Array.from({ length: FOLDER_MAX_FILES + 1 }, (_, i) => picked(`f/${i}`, ""));
    await expect(zipFolderFiles({ files: many, maxBytes: 1 << 20 })).rejects.toMatchObject({ reason: "too-many" });
    await expect(zipFolderFiles({ files: [picked("f/a", "12345678901")], maxBytes: 10 })).rejects.toMatchObject({ reason: "too-large" });
    // Raw bytes fit, but headers push the archive over: still refused.
    await expect(zipFolderFiles({ files: [picked("f/a", "1234567890")], maxBytes: 10 })).rejects.toBeInstanceOf(FolderZipError);
  });

  it("reports a file the browser cannot read as unreadable", async () => {
    const broken = picked("f/a", "x");
    Object.defineProperty(broken, "arrayBuffer", { value: () => Promise.reject(new Error("gone")) });
    await expect(zipFolderFiles({ files: [broken], maxBytes: 1024 })).rejects.toMatchObject({ reason: "unreadable" });
  });
});
