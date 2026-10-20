/**
 * Pins every refusal and pass-through branch of the share-profile ZIP preflight. Hand-built local
 * headers plus a typed yauzl stand-in let each central/local field disagree in isolation, so the
 * order of checks and the exact refusal texts stay provably identical across refactors. One real
 * yazl → yauzl round trip proves the adapter still delegates streaming and closing to yauzl.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import * as yauzl from "yauzl";
import type { AgentPluginArchiveEntry } from "@jini-ai/agent-plugins/lifecycle";
import { createShareArchiveReader } from "../import-archive-reader.js";

const { ZipFile } = createRequire(import.meta.url)("yazl");
const LOCAL_SIGNATURE = 0x04034b50;
const MISMATCH = { code: "UNSAFE_ARCHIVE", message: "ZIP local and central entry headers disagree." };
const TRUNCATED = { code: "UNSAFE_ARCHIVE", message: "Truncated ZIP local entry metadata." };
const UNSUPPORTED = { code: "UNSAFE_ARCHIVE", message: "Share ZIP contains encryption, a link, a special entry, or ambiguous filename metadata." };
const REGULAR = 0o100644 << 16, DIRECTORY = 0o040755 << 16;

type EntryFields = Partial<Pick<yauzl.Entry, "fileName" | "generalPurposeBitFlag" | "compressionMethod" | "relativeOffsetOfLocalHeader" | "extraFields" | "externalFileAttributes" | "uncompressedSize" | "versionMadeBy">>;
interface LocalHeader { name: string; flags?: number; method?: number; extra?: Buffer; signature?: number; extraLength?: number }

/** One local file header exactly as the ZIP spec lays it out (no file data follows). */
function localHeader(header: LocalHeader): Buffer {
  const name = Buffer.from(header.name), extra = header.extra ?? Buffer.alloc(0), fixed = Buffer.alloc(30);
  fixed.writeUInt32LE(header.signature ?? LOCAL_SIGNATURE, 0);
  fixed.writeUInt16LE(header.flags ?? 0, 6);
  fixed.writeUInt16LE(header.method ?? 0, 8);
  fixed.writeUInt16LE(name.length, 26);
  fixed.writeUInt16LE(header.extraLength ?? extra.length, 28);
  return Buffer.concat([fixed, name, extra]);
}
function extraField(id: number): Buffer { const field = Buffer.alloc(4); field.writeUInt16LE(id, 0); return field; }
const DEFAULTS: EntryFields = { fileName: "themes/a.txt", generalPurposeBitFlag: 0, compressionMethod: 0, relativeOffsetOfLocalHeader: 0, extraFields: [], externalFileAttributes: REGULAR, uncompressedSize: 1, versionMadeBy: 0x0314 };
function entry(overrides: EntryFields = {}): EntryFields { return { ...DEFAULTS, ...overrides }; }

/**
 * Real yauzl whose `fromBufferPromise` ignores the bytes under test and opens a stored one-byte
 * template entry per requested entry, then rewrites each real `Entry`'s central fields. The
 * adapter still checks those fields against the hand-built local headers it was given.
 */
function fakeYauzl(fields: EntryFields[]) {
  const calls = { options: [] as unknown[], closed: 0, opened: [] as yauzl.Entry[] };
  const port: typeof yauzl = {
    ...yauzl,
    async fromBufferPromise(_buffer, options) {
      calls.options.push(options);
      const zip = await yauzl.fromBufferPromise(await zipOf(fields.map((_, index) => ({ name: `t${index}`, bytes: Buffer.from("x") }))), { lazyEntries: true });
      const entries: yauzl.Entry[] = [];
      for await (const real of zip.eachEntry()) entries.push(Object.assign(real, fields[entries.length]));
      const open = zip.openReadStreamPromise.bind(zip), close = zip.close.bind(zip);
      zip.eachEntry = async function* () { yield* entries; };
      zip.openReadStreamPromise = async opened => { calls.opened.push(opened); return open(opened); };
      zip.close = () => { calls.closed++; close(); };
      return zip;
    },
  };
  return { port, calls };
}
async function read(archive: Buffer, entries: EntryFields[]): Promise<AgentPluginArchiveEntry[]> {
  const reader = createShareArchiveReader({ yauzl: fakeYauzl(entries).port });
  const seen: AgentPluginArchiveEntry[] = [];
  for await (const item of reader.entries({ archive })) seen.push(item);
  return seen;
}
async function zipOf(items: { name: string; bytes: Buffer }[]): Promise<Buffer> {
  const zip = new ZipFile();
  for (const item of items) zip.addBuffer(item.bytes, item.name, { compress: false, mode: 0o100644 });
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("a real yazl share ZIP streams its bytes back through the adapter", async () => {
  const reader = createShareArchiveReader({ yauzl });
  const contents: string[] = [];
  for await (const item of reader.entries({ archive: await zipOf([{ name: "themes/a.txt", bytes: Buffer.from("hello") }]) })) {
    assert.equal(item.kind, "file");
    if (item.kind !== "file") continue;
    const chunks: Buffer[] = [];
    for await (const chunk of item.openReadStream({})) chunks.push(Buffer.from(chunk));
    contents.push(`${item.entryPath}=${Buffer.concat(chunks).toString()}`);
  }
  assert.deepEqual(contents, ["themes/a.txt=hello"]);
});

test("the adapter forces strict filenames on top of the reader's own yauzl options", async () => {
  const { port, calls } = fakeYauzl([]);
  for await (const _item of createShareArchiveReader({ yauzl: port }).entries({ archive: Buffer.alloc(0) })) { /* none */ }
  assert.deepEqual(calls.options, [{ lazyEntries: true, validateEntrySizes: true, strictFileNames: true }]);
});

test("the adapter delegates opening an entry stream and closing the archive to yauzl", async () => {
  const { port, calls } = fakeYauzl([entry()]);
  const chunks: Buffer[] = [];
  for await (const item of createShareArchiveReader({ yauzl: port }).entries({ archive: localHeader({ name: "themes/a.txt" }) })) {
    if (item.kind === "file") for await (const chunk of item.openReadStream({})) chunks.push(Buffer.from(chunk));
  }
  assert.deepEqual({ opened: calls.opened.map(opened => opened.fileName), closed: calls.closed, bytes: Buffer.concat(chunks).toString() }, { opened: ["themes/a.txt"], closed: 1, bytes: "x" });
});

test("an entry whose local header agrees with the central entry passes through", async () => {
  const seen = await read(localHeader({ name: "themes/ä.txt", flags: 0x808, method: 8 }), [entry({ fileName: "themes/ä.txt", generalPurposeBitFlag: 0x808, compressionMethod: 8 })]);
  assert.deepEqual(seen.map(item => [item.kind, item.entryPath]), [["file", "themes/ä.txt"]]);
});

test("a negative local header offset is refused as a header disagreement", async () => {
  await assert.rejects(read(localHeader({ name: "themes/a.txt" }), [entry({ relativeOffsetOfLocalHeader: -1 })]), MISMATCH);
});

test("a local header offset without 30 header bytes after it is refused before any read", async () => {
  const bytes = localHeader({ name: "themes/a.txt" });
  await assert.rejects(read(bytes, [entry({ relativeOffsetOfLocalHeader: bytes.length - 2 })]), MISMATCH);
});

test("a local header with the wrong signature is refused", async () => {
  await assert.rejects(read(localHeader({ name: "themes/a.txt", signature: 0 }), [entry()]), MISMATCH);
});

test("local general-purpose flags that differ from the central entry are refused", async () => {
  await assert.rejects(read(localHeader({ name: "themes/a.txt", flags: 0x800 }), [entry()]), MISMATCH);
});

test("a local compression method that differs from the central entry is refused", async () => {
  await assert.rejects(read(localHeader({ name: "themes/a.txt", method: 8 }), [entry()]), MISMATCH);
});

test("a local filename that differs from the central filename is refused", async () => {
  await assert.rejects(read(localHeader({ name: "themes/b.txt" }), [entry()]), MISMATCH);
});

test("a header disagreement is reported before the local extra-field bounds", async () => {
  await assert.rejects(read(localHeader({ name: "themes/b.txt", extraLength: 65535 }), [entry()]), MISMATCH);
});

test("local extra fields that run past the archive end are refused as truncated", async () => {
  await assert.rejects(read(localHeader({ name: "themes/a.txt", extraLength: 1 }), [entry()]), TRUNCATED);
});

test("local extra fields that end exactly at the archive end pass through", async () => {
  const seen = await read(localHeader({ name: "themes/a.txt", extra: extraField(0x5455) }), [entry()]);
  assert.deepEqual(seen.map(item => item.entryPath), ["themes/a.txt"]);
});

test("a malformed local extra field surfaces yauzl's own parse error", async () => {
  const extra = Buffer.alloc(4); extra.writeUInt16LE(0x5455, 0); extra.writeUInt16LE(9, 2);
  await assert.rejects(read(localHeader({ name: "themes/a.txt", extra }), [entry()]), { message: "extra field length exceeds extra field buffer size" });
});

for (const flag of [1, 64, 8192]) {
  test(`general-purpose flag ${flag} (encryption or masked headers) is refused`, async () => {
    await assert.rejects(read(localHeader({ name: "themes/a.txt", flags: flag }), [entry({ generalPurposeBitFlag: flag })]), UNSUPPORTED);
  });
}

for (const [label, mode] of [["symlink", 0o120777], ["block device", 0o060644], ["fifo", 0o010644]] as const) {
  test(`a ${label} file type is refused`, async () => {
    await assert.rejects(read(localHeader({ name: "themes/a.txt" }), [entry({ externalFileAttributes: mode << 16 })]), UNSUPPORTED);
  });
}

test("an entry with no Unix file type passes through", async () => {
  const seen = await read(localHeader({ name: "themes/a.txt" }), [entry({ externalFileAttributes: 0 })]);
  assert.deepEqual(seen.map(item => item.entryPath), ["themes/a.txt"]);
});

for (const id of [0x000d, 0x756e, 0x7075, 0x9901]) {
  test(`a central extra field 0x${id.toString(16)} is refused`, async () => {
    await assert.rejects(read(localHeader({ name: "themes/a.txt" }), [entry({ extraFields: [{ id, data: Buffer.alloc(0) }] })]), UNSUPPORTED);
  });
  test(`a local extra field 0x${id.toString(16)} is refused`, async () => {
    await assert.rejects(read(localHeader({ name: "themes/a.txt", extra: extraField(id) }), [entry()]), UNSUPPORTED);
  });
}

test("a directory name with a nonzero size is refused", async () => {
  await assert.rejects(read(localHeader({ name: "themes/dir/" }), [entry({ fileName: "themes/dir/", externalFileAttributes: DIRECTORY })]), UNSUPPORTED);
});

test("a directory name carrying a regular-file mode is refused", async () => {
  await assert.rejects(read(localHeader({ name: "themes/dir/" }), [entry({ fileName: "themes/dir/", uncompressedSize: 0 })]), UNSUPPORTED);
});

test("a file name carrying a directory mode is refused", async () => {
  await assert.rejects(read(localHeader({ name: "themes/dir" }), [entry({ fileName: "themes/dir", externalFileAttributes: DIRECTORY })]), UNSUPPORTED);
});

test("an empty directory entry with a directory or untyped mode passes through", async () => {
  const archive = localHeader({ name: "themes/dir/" });
  const seen = [
    ...await read(archive, [entry({ fileName: "themes/dir/", uncompressedSize: 0, externalFileAttributes: DIRECTORY })]),
    ...await read(archive, [entry({ fileName: "themes/dir/", uncompressedSize: 0, externalFileAttributes: 0 })]),
  ];
  assert.deepEqual(seen.map(item => [item.kind, item.entryPath]), [["directory", "themes/dir/"], ["directory", "themes/dir/"]]);
});

test("each entry is checked against its own local header offset", async () => {
  const first = localHeader({ name: "themes/a.txt" });
  const archive = Buffer.concat([first, localHeader({ name: "themes/b.txt", signature: 0 })]);
  const seen: string[] = [];
  const reader = createShareArchiveReader({ yauzl: fakeYauzl([entry(), entry({ fileName: "themes/b.txt", relativeOffsetOfLocalHeader: first.length })]).port });
  await assert.rejects((async () => { for await (const item of reader.entries({ archive })) seen.push(item.entryPath); })(), MISMATCH);
  assert.deepEqual(seen, ["themes/a.txt"]);
});
