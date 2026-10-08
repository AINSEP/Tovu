import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
/** Owner-approved ZIP install: adversarial real archives and streamed-byte caps. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildZipFixture } from "../../../agent-plugins/__tests__/fixtures/build-zip.js";
import { readSitePluginArchive, MAX_PLUGIN_ARCHIVE_BYTES } from "../../install-archive.js";
import { previewSitePluginInstall, installSitePlugin } from "@jini-ai/plugins/host/node";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { sitePluginZip } from "../fixtures/site-plugin-zip.js";

test("ZIP review and install reuse folder validation and stay off without executing code", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "site-plugin-zip-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = { ...pluginHostBinding, installDir: path.join(root, "plugins"), builtInIds: [], repo: new InMemoryPluginActivationRepo(), conflicts: async () => [] };
  const archive = await sitePluginZip();
  const preview = await previewSitePluginInstall({ archive, deps });
  await assert.rejects(installSitePlugin({ archive, deps, expectedDigest: "sha256-" + "a".repeat(64) }), { code: "PLUGIN_CHANGED_SINCE_PREVIEW" });
  await installSitePlugin({ archive, deps, expectedDigest: preview.digest });
  assert.equal(await readFile(path.join(deps.installDir, "zip-test/1.0.0/server/index.mjs"), "utf8"), "throw new Error('ZIP MUST NOT EXECUTE');");
  assert.deepEqual(await deps.repo.listAll(), []);
});

for (const unsafe of ["../escape.txt", "/root/file.x", "C:/escape.xx", "\\\\host\\file.x", "dir/../evil.x"]) {
  test(`ZIP rejects path ${JSON.stringify(unsafe)}`, async () => {
    // yazl refuses hostile names: alter BOTH ZIP headers without changing byte lengths.
    const safe = "x".repeat(Buffer.byteLength(unsafe));
    const zip = await buildZipFixture([{ path: safe, content: "escape" }]);
    const hostile = Buffer.from(zip.toString("latin1").split(safe).join(unsafe), "latin1");
    await assert.rejects(readSitePluginArchive({ archive: hostile }));
  });
}

test("ZIP rejects a symlink, including a symlink with a directory-shaped name", async () => {
  const zip = await buildZipFixture([{ path: "link", content: "../outside", mode: 0o120777 }]);
  await assert.rejects(readSitePluginArchive({ archive: zip }), { code: "PLUGIN_PACKAGE_UNSAFE" });
  const directoryShape = Buffer.from(zip.toString("latin1").split("link").join("bad/"), "latin1");
  await assert.rejects(readSitePluginArchive({ archive: directoryShape }), { code: "PLUGIN_PACKAGE_UNSAFE" });
});

test("ZIP rejects duplicates and case aliases", async () => {
  for (const second of ["same", "SAME"]) {
    const zip = await buildZipFixture([{ path: "same", content: "one" }, { path: "next", content: "two" }]);
    const duplicate = Buffer.from(zip.toString("latin1").split("next").join(second), "latin1");
    await assert.rejects(readSitePluginArchive({ archive: duplicate }), { code: "PLUGIN_PACKAGE_UNSAFE" });
  }
});

test("ZIP rejects case-aliased directories, files used as parents and special Unix files", async () => {
  for (const entries of [
    [{ path: "server/a", content: "a" }, { path: "SERVER/b", content: "b" }],
    [{ path: "parent", content: "file" }, { path: "parent/child", content: "child" }],
    [{ path: "parent/child", content: "child" }, { path: "parent", content: "file" }],
    [{ path: "device", content: "", mode: 0o020666 }],
  ]) await assert.rejects(readSitePluginArchive({ archive: await buildZipFixture(entries) }), { code: "PLUGIN_PACKAGE_UNSAFE" });
});

test("ZIP caps compressed bytes, entry count and real expanded bytes", async () => {
  await assert.rejects(readSitePluginArchive({ archive: Buffer.alloc(MAX_PLUGIN_ARCHIVE_BYTES + 1) }), { code: "PLUGIN_PACKAGE_TOO_LARGE" });
  const bomb = await buildZipFixture([{ path: "bomb", content: Buffer.alloc(16 * 1024 * 1024 + 1) }]);
  await assert.rejects(readSitePluginArchive({ archive: bomb }), { code: "PLUGIN_PACKAGE_TOO_LARGE" });
  const many = await buildZipFixture(Array.from({ length: 4097 }, (_, i) => ({ path: `d${i}/`, content: "" })));
  await assert.rejects(readSitePluginArchive({ archive: many }), { code: "PLUGIN_PACKAGE_TOO_LARGE" });
  const total = await buildZipFixture(Array.from({ length: 5 }, (_, i) => ({ path: `file${i}`, content: Buffer.alloc(16 * 1024 * 1024) })));
  await assert.rejects(readSitePluginArchive({ archive: total }), { code: "PLUGIN_PACKAGE_TOO_LARGE" });
  const reader = { async *entries() { for (let i = 0; i < 5; i++) yield { kind: "file" as const, entryPath: `f${i}`, declaredSize: 0, async *openReadStream() { yield Buffer.alloc(16 * 1024 * 1024); } }; } };
  await assert.rejects(readSitePluginArchive({ archive: Buffer.alloc(0) }, { reader }), { code: "PLUGIN_PACKAGE_TOO_LARGE" });
  const growing = { async *entries() { yield { kind: "file" as const, entryPath: "growing", declaredSize: 0, async *openReadStream() { yield Buffer.alloc(16 * 1024 * 1024); yield Buffer.alloc(1); } }; } };
  await assert.rejects(readSitePluginArchive({ archive: Buffer.alloc(0) }, { reader: growing }), { code: "PLUGIN_PACKAGE_TOO_LARGE" });
});

test("invalid ZIP and invalid CMS manifests never publish", async () => {
  await assert.rejects(readSitePluginArchive({ archive: Buffer.from("not a zip") }), { code: "PLUGIN_ARCHIVE_INVALID" });
  const deps = { ...pluginHostBinding, installDir: "/unused", builtInIds: [], repo: new InMemoryPluginActivationRepo(), conflicts: async () => [] };
  const archive = await buildZipFixture([{ path: "tovu.plugin.json", content: "{}" }]);
  await assert.rejects(previewSitePluginInstall({ archive, deps }), { code: "PLUGIN_MANIFEST_INVALID" });
});
