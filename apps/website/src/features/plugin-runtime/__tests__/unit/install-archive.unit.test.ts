/** Pins every refusal and acceptance branch of the CMS ZIP policy, one behaviour per test.
 * A typed scripted reader drives the policy directly; real yazl archives drive the yauzl guard. */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentPluginArchiveEntry, AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import { PluginInstallError } from "@jini-ai/plugins/host/node";
import { buildZipFixture } from "../../../agent-plugins/__tests__/fixtures/build-zip.js";
import { MAX_PLUGIN_ARCHIVE_BYTES, readSitePluginArchive } from "../../install-archive.js";

const MiB = 1024 * 1024;
const EMPTY = new Uint8Array(0);

function file(entryPath: string, chunks: readonly Uint8Array[] = [], declaredSize?: number): AgentPluginArchiveEntry {
  return { kind: "file", entryPath, declaredSize, async *openReadStream() { yield* chunks; } };
}
function dir(entryPath: string): AgentPluginArchiveEntry { return { kind: "directory", entryPath }; }
function reader(entries: readonly AgentPluginArchiveEntry[]): AgentPluginArchiveReaderPort {
  return { async *entries() { yield* entries; } };
}
function read(entries: readonly AgentPluginArchiveEntry[]) {
  return readSitePluginArchive({ archive: EMPTY }, { reader: reader(entries) });
}
const unsafe = (message: string) => ({ name: "PluginInstallError", code: "PLUGIN_PACKAGE_UNSAFE", message });
const tooLarge = (message: string) => ({ name: "PluginInstallError", code: "PLUGIN_PACKAGE_TOO_LARGE", message });
const SIZE = "ZIP exceeds the file or expanded size limit.";
const OUTSIDE = "ZIP paths must stay inside the package.";

/** Rewrites the "version made by" host byte of every central-directory record (yazl always writes Unix). */
function withHostByte(zip: Buffer, host: number): Buffer {
  const copy = Buffer.from(zip);
  for (let at = copy.indexOf("PK\x01\x02", 0, "latin1"); at !== -1; at = copy.indexOf("PK\x01\x02", at + 4, "latin1")) copy[at + 5] = host;
  return copy;
}

test("archive one byte over the upload limit is refused before reading", async () => {
  await assert.rejects(readSitePluginArchive({ archive: new Uint8Array(MAX_PLUGIN_ARCHIVE_BYTES + 1) }, { reader: reader([]) }), tooLarge("ZIP exceeds the 32 MiB upload limit."));
});

test("archive exactly at the upload limit is read", async () => {
  assert.equal((await readSitePluginArchive({ archive: new Uint8Array(MAX_PLUGIN_ARCHIVE_BYTES) }, { reader: reader([]) })).size, 0);
});

test("4096 entries are accepted", async () => {
  assert.equal((await read(Array.from({ length: 4096 }, (_, i) => dir(`d${i}/`)))).size, 0);
});

test("the 4097th entry is refused", async () => {
  await assert.rejects(read(Array.from({ length: 4097 }, (_, i) => dir(`d${i}/`))), tooLarge("ZIP has too many entries."));
});

for (const kind of ["symlink", "hardlink", "device", "fifo"] as const) {
  test(`a ${kind} entry is refused`, async () => {
    await assert.rejects(read([{ kind, entryPath: "link" }]), unsafe("ZIP links are not allowed."));
  });
}

for (const [label, entry] of [
  ["an empty file path", file("")],
  ["a root directory", dir("/")],
  ["a NUL byte", file("a\0b")],
  ["an absolute path", file("/etc/passwd")],
  ["a drive letter", file("C:x")],
  ["an empty segment", file("a//b")],
  ["a file with a trailing slash", file("a/")],
  ["a dot segment", file("a/./b")],
  ["a dot-dot segment", file("a/../b")],
  ["a backslash dot-dot segment", file("a\\..\\b")],
  ["a colon inside a segment", file("a/b:c")],
] as const) {
  test(`${label} is refused as outside the package`, async () => {
    await assert.rejects(read([entry]), unsafe(OUTSIDE));
  });
}

test("backslashes become slashes and directories are not returned as files", async () => {
  const files = await read([dir("dir\\"), file("dir\\file", [Buffer.from("x")])]);
  assert.deepEqual([...files.entries()], [["dir/file", Buffer.from("x")]]);
});

test("an exact duplicate path is refused", async () => {
  await assert.rejects(read([file("same"), file("same")]), unsafe("ZIP has duplicate paths."));
});

test("a directory listed twice is refused as a duplicate", async () => {
  await assert.rejects(read([dir("d/"), dir("d")]), unsafe("ZIP has duplicate paths."));
});

test("a case alias of a file is refused", async () => {
  await assert.rejects(read([file("same"), file("SAME")]), unsafe("ZIP has case-aliased paths."));
});

test("a case alias of a parent directory is refused", async () => {
  await assert.rejects(read([file("server/a"), file("SERVER/b")]), unsafe("ZIP has case-aliased paths."));
});

test("a mixed-case parent reused with the same spelling is accepted", async () => {
  assert.deepEqual([...(await read([file("Dir/a"), file("Dir/b")])).keys()], ["Dir/a", "Dir/b"]);
});

test("a path of 4096 distinct prefixes is accepted", async () => {
  assert.equal((await read([file(Array.from({ length: 4096 }, () => "a").join("/"))])).size, 1);
});

test("a path adding the 4097th distinct prefix is refused", async () => {
  await assert.rejects(read([file(Array.from({ length: 4097 }, () => "a").join("/"))]), tooLarge("ZIP has too many files and directories."));
});

test("a path under an earlier file is refused", async () => {
  await assert.rejects(read([file("parent"), file("parent/child")]), unsafe("ZIP path crosses a file."));
});

test("a file over an earlier file's subtree is refused", async () => {
  await assert.rejects(read([file("parent/child"), file("parent")]), unsafe("ZIP file replaces a directory."));
});

test("a file over an earlier explicit directory's subtree is refused", async () => {
  await assert.rejects(read([dir("parent/child/"), file("parent")]), unsafe("ZIP file replaces a directory."));
});

test("a directory after a file inside it is accepted", async () => {
  assert.deepEqual([...(await read([file("parent/child"), dir("parent/")])).keys()], ["parent/child"]);
});

test("a sibling sharing a name prefix is not a subtree", async () => {
  assert.deepEqual([...(await read([file("ab/c"), file("a")])).keys()], ["ab/c", "a"]);
});

for (const [label, declaredSize] of [
  ["a fractional", 1.5],
  ["a NaN", Number.NaN],
  ["an infinite", Number.POSITIVE_INFINITY],
  ["a negative", -1],
  ["an over-16 MiB", 16 * MiB + 1],
] as const) {
  test(`${label} declared size is refused before streaming`, async () => {
    await assert.rejects(read([file("f", [], declaredSize)]), tooLarge(SIZE));
  });
}

test("a declared size of exactly 16 MiB passes the declared check", async () => {
  assert.equal((await read([file("f", [], 16 * MiB)])).get("f")?.byteLength, 0);
});

test("a declared size of zero passes the declared check", async () => {
  assert.equal((await read([file("f", [Buffer.from("ab")], 0)])).get("f")?.toString(), "ab");
});

test("a declared size that would push the expanded total over 64 MiB is refused", async () => {
  const sixteen = new Uint8Array(16 * MiB);
  const full = [0, 1, 2, 3].map((i) => file(`f${i}`, [sixteen]));
  await assert.rejects(read([...full, file("next", [], 1)]), tooLarge(SIZE));
});

test("a declared size reaching exactly 64 MiB total is accepted", async () => {
  const sixteen = new Uint8Array(16 * MiB);
  const files = await read([0, 1, 2].map((i) => file(`f${i}`, [sixteen])).concat(file("last", [sixteen], 16 * MiB)));
  assert.equal(files.size, 4);
});

test("a file streaming one byte past 16 MiB is refused", async () => {
  await assert.rejects(read([file("f", [new Uint8Array(16 * MiB), new Uint8Array(1)])]), tooLarge(SIZE));
});

test("streamed bytes pushing the expanded total past 64 MiB are refused", async () => {
  const sixteen = new Uint8Array(16 * MiB);
  await assert.rejects(read([0, 1, 2, 3].map((i) => file(`f${i}`, [sixteen])).concat(file("next", [new Uint8Array(1)]))), tooLarge(SIZE));
});

test("a file's chunks are concatenated in order", async () => {
  assert.equal((await read([file("f", [Buffer.from("ab"), Buffer.from("cd")])])).get("f")?.toString(), "abcd");
});

test("a reader failure that is not a policy refusal becomes PLUGIN_ARCHIVE_INVALID", async () => {
  const broken: AgentPluginArchiveReaderPort = { async *entries() { throw new Error("corrupt central directory"); } };
  await assert.rejects(readSitePluginArchive({ archive: EMPTY }, { reader: broken }), { name: "PluginInstallError", code: "PLUGIN_ARCHIVE_INVALID", message: "ZIP could not be read safely." });
});

test("a policy refusal raised by the reader passes through unchanged", async () => {
  const refusing: AgentPluginArchiveReaderPort = { async *entries() { throw new PluginInstallError("READER_CODE", "reader said no"); } };
  await assert.rejects(readSitePluginArchive({ archive: EMPTY }, { reader: refusing }), { code: "READER_CODE", message: "reader said no" });
});

test("default reader returns a real archive's files and skips its directories", async () => {
  const zip = await buildZipFixture([{ path: "dir/", content: "" }, { path: "dir/a.txt", content: "A", mode: 0o100644 }]);
  assert.deepEqual([...(await readSitePluginArchive({ archive: zip })).entries()], [["dir/a.txt", Buffer.from("A")]]);
});

test("default reader refuses a Unix symlink before the shared reader classifies it", async () => {
  const zip = await buildZipFixture([{ path: "link", content: "../outside", mode: 0o120777 }]);
  await assert.rejects(readSitePluginArchive({ archive: zip }), unsafe("ZIP links and special entries are not allowed."));
});

test("default reader refuses a Unix device entry", async () => {
  const zip = await buildZipFixture([{ path: "device", content: "", mode: 0o020666 }]);
  await assert.rejects(readSitePluginArchive({ archive: zip }), unsafe("ZIP links and special entries are not allowed."));
});

test("default reader accepts a Unix entry with no file-type bits", async () => {
  const zip = await buildZipFixture([{ path: "plain", content: "p", mode: 0o644 }]);
  assert.equal((await readSitePluginArchive({ archive: zip })).get("plain")?.toString(), "p");
});

test("default reader ignores Unix mode bits on a non-Unix-authored entry", async () => {
  const zip = withHostByte(await buildZipFixture([{ path: "link", content: "target", mode: 0o120777 }]), 0);
  assert.equal((await readSitePluginArchive({ archive: zip })).get("link")?.toString(), "target");
});

test("default reader turns bytes that are not a ZIP into PLUGIN_ARCHIVE_INVALID", async () => {
  await assert.rejects(readSitePluginArchive({ archive: Buffer.from("not a zip") }), { code: "PLUGIN_ARCHIVE_INVALID", message: "ZIP could not be read safely." });
});
