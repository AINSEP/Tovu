/** Local plugin install plan (2026-09-22), decisions 2–7: real filesystem, never imports code. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, link, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { installSitePlugin, previewSitePluginInstall } from "../../install.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import { discoverPlugins } from "../../discovery.js";
import { composePluginRuntime } from "#src/server/runtime/composition/plugin-runtime";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-install-"));
  const sourceDir = path.join(root, "source");
  const installDir = path.join(root, "plugins");
  const repo = new InMemoryPluginActivationRepo();
  const manifest = { id: "local-test", name: "Local test", version: "1.0.0", sdkRange: "*", engine: 1, tier: "tier-3", capabilities: [], hooks: [], fields: [], integrity: {} as Record<string, string> };
  // Importing this entry would fail: preview/install must operate on bytes only.
  const code = "throw new Error('INSTALL EXECUTED PLUGIN');";
  await mkdir(path.join(sourceDir, "server"), { recursive: true });
  await writeFile(path.join(sourceDir, "server/index.mjs"), code);
  manifest.integrity["server/index.mjs"] = `sha256-${createHash("sha256").update(code).digest("hex")}`;
  const save = () => writeFile(path.join(sourceDir, "tovu.plugin.json"), JSON.stringify(manifest));
  await save();
  const deps = { installDir, builtInIds: ["word-count"], repo };
  return { root, sourceDir, installDir, manifest, save, deps, repo };
}

test("folder preview -> install publishes valid bytes, stays off everywhere and cleans staging", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps });
  assert.equal(preview.hasCode, true);
  assert.equal(preview.tier, "tier-3");
  await installSitePlugin({ sourceDir: f.sourceDir, expectedDigest: preview.digest, deps: f.deps });
  assert.equal(await readFile(path.join(f.installDir, "local-test/1.0.0/server/index.mjs"), "utf8"), "throw new Error('INSTALL EXECUTED PLUGIN');");
  assert.deepEqual(await f.repo.listAll(), []);
  const listed = await discoverPlugins({ builtIns: [], installDir: f.installDir });
  assert.equal(listed[0]?.status, "valid");
  assert.deepEqual(await readdir(path.join(f.root, "plugins-staging")), []);
});

for (const kind of ["missing", "extra", "mismatch", "symlink", "hardlink", "traversal", "changed", "builtin", "trash", "enabled", "case", "tier"] as const) {
  test(`folder install refuses ${kind} without publishing`, async (t) => {
    const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
    const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps });
    const entry = path.join(f.sourceDir, "server/index.mjs");
    if (kind === "missing") { f.manifest.integrity = {}; await f.save(); }
    if (kind === "extra") await writeFile(path.join(f.sourceDir, "unlisted.mjs"), "unsafe");
    if (kind === "mismatch") await writeFile(entry, "changed");
    if (kind === "symlink") await symlink(entry, path.join(f.sourceDir, "link"));
    if (kind === "hardlink") await link(entry, path.join(f.root, "hardlink"));
    if (kind === "traversal") { f.manifest.id = "../escape"; await f.save(); }
    if (kind === "changed") { f.manifest.name = "Changed consent"; await f.save(); }
    if (kind === "builtin") { f.manifest.id = "word-count"; await f.save(); }
    if (kind === "trash") await mkdir(path.join(f.root, "plugins-trash/local-test"), { recursive: true });
    if (kind === "enabled") await f.repo.save({ pluginId: "local-test", workspaceId: "other-workspace", version: "1.0.0", enabled: true, updatedAt: "now" });
    if (kind === "case") await mkdir(path.join(f.installDir, "LOCAL-TEST"), { recursive: true });
    if (kind === "tier") { f.manifest.tier = "tier-1"; await f.save(); }
    const codes = { missing: "PLUGIN_INTEGRITY_INVALID", extra: "PLUGIN_INTEGRITY_INVALID", mismatch: "PLUGIN_INTEGRITY_INVALID", symlink: "PLUGIN_PACKAGE_UNSAFE", hardlink: "PLUGIN_PACKAGE_UNSAFE", traversal: "PLUGIN_MANIFEST_INVALID", changed: "PLUGIN_CHANGED_SINCE_PREVIEW", builtin: "PLUGIN_SHADOWS_BUILT_IN", trash: "PLUGIN_IN_TRASH", enabled: "PLUGIN_ENABLED", case: "PLUGIN_ID_CONFLICT", tier: "PLUGIN_MANIFEST_INVALID" };
    await assert.rejects(installSitePlugin({ sourceDir: f.sourceDir, expectedDigest: preview.digest, deps: f.deps }), { code: codes[kind] });
    assert.deepEqual(await readdir(f.installDir).catch(() => []), kind === "case" ? ["LOCAL-TEST"] : []);
  });
}

test("version collisions require explicit replacement, upgrades refuse downgrades", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const run = async (replace = false) => {
    const p = await previewSitePluginInstall({ sourceDir: f.sourceDir, replace, deps: f.deps });
    return installSitePlugin({ sourceDir: f.sourceDir, expectedDigest: p.digest, replace, deps: f.deps });
  };
  await run();
  await assert.rejects(run(), { code: "PLUGIN_VERSION_EXISTS" });
  await run(true);
  f.manifest.version = "2.0.0"; await f.save(); await run();
  assert.deepEqual(await readdir(path.join(f.installDir, "local-test")), ["2.0.0"]);
  f.manifest.version = "1.0.0"; await f.save();
  await assert.rejects(run(), { code: "PLUGIN_DOWNGRADE" });
});

test("mid-install failure removes staging and lock while preserving installed bytes", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps });
  await installSitePlugin({ sourceDir: f.sourceDir, expectedDigest: preview.digest, deps: f.deps });
  const original = await readFile(path.join(f.installDir, "local-test/1.0.0/server/index.mjs"), "utf8");
  f.manifest.version = "2.0.0"; await f.save();
  const next = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps });
  let calls = 0;
  const deps = { ...f.deps, repo: { listAll: async () => { if (++calls === 2) throw new Error("repo unavailable during publish"); return []; } } };
  await assert.rejects(installSitePlugin({ sourceDir: f.sourceDir, expectedDigest: next.digest, deps }), /repo unavailable/);
  assert.deepEqual(await readdir(path.join(f.installDir, "local-test")), ["1.0.0"]);
  assert.equal(await readFile(path.join(f.installDir, "local-test/1.0.0/server/index.mjs"), "utf8"), original);
  assert.deepEqual(await readdir(path.join(f.root, "plugins-staging")), []);
  await assert.rejects(readdir(path.join(f.root, "plugins-install-lock")), { code: "ENOENT" });
});

test("source within the installed tree is refused, and oversized files fail before hashing", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  await assert.rejects(previewSitePluginInstall({ sourceDir: f.sourceDir, deps: { ...f.deps, installDir: f.root } }), { code: "PLUGIN_SOURCE_INVALID" });
  const handle = await open(path.join(f.sourceDir, "oversized"), "w");
  try { await handle.truncate(16 * 1024 * 1024 + 1); } finally { await handle.close(); }
  await assert.rejects(previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps }), { code: "PLUGIN_PACKAGE_TOO_LARGE" });
});

test("same-version replacement evaluates the new entry on enable, never on install", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const marker = `pluginInstallTest_${path.basename(f.root).replaceAll("-", "_")}`;
  const globals = globalThis as unknown as Record<string, unknown>; t.after(() => { delete globals[marker]; });
  async function update(value: number) {
    const code = `export default { definition: { setup() { globalThis[${JSON.stringify(marker)}] = ${value}; } } };`;
    await writeFile(path.join(f.sourceDir, "server/index.mjs"), code);
    f.manifest.integrity["server/index.mjs"] = `sha256-${createHash("sha256").update(code).digest("hex")}`;
    await f.save();
    const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, replace: true, deps: f.deps });
    await installSitePlugin({ sourceDir: f.sourceDir, replace: true, expectedDigest: preview.digest, deps: f.deps });
  }
  const runtime = composePluginRuntime({ workspaceId: "workspace-local", clock: { nowMs: () => 0, nowIso: () => new Date(0).toISOString() }, activationRepo: f.repo, sources: [], installDir: f.installDir });
  await update(1); assert.equal(globals[marker], undefined);
  await runtime.onPluginEnabled("local-test"); assert.equal(globals[marker], 1);
  runtime.onPluginDisabled("local-test");
  await update(2); assert.equal(globals[marker], 1);
  await runtime.onPluginEnabled("local-test"); assert.equal(globals[marker], 2);
});
