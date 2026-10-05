import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createBundledSourceArchiveReader, packAgentPluginDirectory } from "../../bundled-source-archive.js";

/**
 * @file The directory-to-archive round trip that lets a bundled package go THROUGH
 * `installAgentPlugin` rather than around it.
 *
 * The two properties that matter: the round trip is lossless (or the installer would publish
 * different bytes than the repo holds), and the digest is deterministic (or seeding would
 * re-extract on every boot instead of hitting the content-addressed dedup path).
 */

async function fixtureDir(files: Readonly<Record<string, string>>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-bundled-archive-"));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return dir;
}

async function readBack(bytes: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for await (const entry of createBundledSourceArchiveReader().entries(bytes)) {
    assert.equal(entry.kind, "file");
    if (entry.kind !== "file") continue;
    const chunks: Uint8Array[] = [];
    for await (const chunk of entry.openReadStream()) chunks.push(chunk);
    out[entry.entryPath] = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  }
  return out;
}

test("packs and unpacks every file losslessly, including nested and non-ASCII content", async () => {
  const files = {
    "plugin.json": '{"name":"x"}',
    "skills/x/SKILL.md": "# X\n\nBody — with an em dash and an emoji 🧭\n",
    "skills/x/references/deep/nested.md": "nested\n",
    "empty.txt": "",
    // Sorted directory traversal visits a/z.txt before a.txt; archive paths sort the other way.
    "a/z.txt": "nested sort discriminator",
    "a.txt": "sibling sort discriminator",
  };
  const dir = await fixtureDir(files);
  try {
    const packed = await packAgentPluginDirectory(dir);
    assert.deepEqual(await readBack(packed.bytes), files);
    assert.deepEqual([...packed.files], Object.keys(files).sort());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("binary assets round-trip without UTF-8 decoding", async () => {
  const dir = await fixtureDir({ "plugin.json": '{"name":"binary"}' });
  const expected = Buffer.from([0, 0xff, 0xfe, 0xc3, 0x28, 0x80, 10, 13, 0]);
  try {
    await writeFile(path.join(dir, "asset.bin"), expected);
    const packed = await packAgentPluginDirectory(dir);
    const returned = new Map<string, Buffer>();
    for await (const entry of createBundledSourceArchiveReader().entries(packed.bytes)) {
      assert.equal(entry.kind, "file");
      if (entry.kind !== "file") assert.fail("expected regular file");
      const chunks: Buffer[] = [];
      for await (const chunk of entry.openReadStream()) chunks.push(Buffer.from(chunk));
      returned.set(entry.entryPath, Buffer.concat(chunks));
    }
    assert.deepEqual([...returned.keys()], ["asset.bin", "plugin.json"]);
    assert.deepEqual(returned.get("asset.bin"), expected);
    assert.deepEqual(returned.get("plugin.json"), Buffer.from('{"name":"binary"}'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the source-tree cap accepts 2048 files and refuses 2049", async () => {
  const dir = await fixtureDir({});
  try {
    for (let index = 0; index < 2048; index += 1) await writeFile(path.join(dir, `file-${index}.txt`), "x");
    const packed = await packAgentPluginDirectory(dir);
    assert.equal(packed.files.length, 2048);
    assert.equal(Object.keys(await readBack(packed.bytes)).length, 2048);
    await writeFile(path.join(dir, "over-cap.txt"), "x");
    await assert.rejects(() => packAgentPluginDirectory(dir), {
      message: `bundled agent plugin at '${dir}' has 2049 files, over the 2048-file cap — is this the right directory?`,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the digest is a real SHA-256 of the archive bytes and is deterministic across packs", async () => {
  const dir = await fixtureDir({ "plugin.json": '{"name":"x"}', "a.md": "a" });
  try {
    const first = await packAgentPluginDirectory(dir);
    const second = await packAgentPluginDirectory(dir);
    assert.match(first.sha256, /^[a-f0-9]{64}$/);
    assert.equal(first.sha256, second.sha256, "seeding relies on this to hit the content-addressed dedup path");

    const { createHash } = await import("node:crypto");
    assert.equal(createHash("sha256").update(Buffer.from(first.bytes)).digest("hex"), first.sha256);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("changing one byte of content changes the digest", async () => {
  const before = await fixtureDir({ "plugin.json": '{"name":"x"}', "a.md": "a" });
  const after = await fixtureDir({ "plugin.json": '{"name":"x"}', "a.md": "b" });
  try {
    assert.notEqual((await packAgentPluginDirectory(before)).sha256, (await packAgentPluginDirectory(after)).sha256);
  } finally {
    await rm(before, { recursive: true, force: true });
    await rm(after, { recursive: true, force: true });
  }
});

test("a symlink is skipped rather than followed — the installer would reject one anyway", async () => {
  const dir = await fixtureDir({ "plugin.json": '{"name":"x"}' });
  try {
    await symlink("/etc/passwd", path.join(dir, "sneaky"));
    const packed = await packAgentPluginDirectory(dir);
    assert.deepEqual([...packed.files], ["plugin.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the reader refuses bytes that are not this format", async () => {
  const reader = createBundledSourceArchiveReader();
  await assert.rejects(async () => {
    for await (const _entry of reader.entries(new TextEncoder().encode("PK a real zip"))) void _entry;
  }, /bad magic/);
});

test("the reader refuses a truncated archive rather than yielding a partial file", async () => {
  const dir = await fixtureDir({ "plugin.json": '{"name":"x"}', "a.md": "a long enough body to truncate" });
  try {
    const packed = await packAgentPluginDirectory(dir);
    const truncated = packed.bytes.slice(0, packed.bytes.byteLength - 10);
    await assert.rejects(async () => {
      for await (const _entry of createBundledSourceArchiveReader().entries(truncated)) void _entry;
    }, /truncated entry body/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
