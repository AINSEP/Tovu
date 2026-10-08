import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
/** AW-7 Tier 1 (2026-10-04): a manifest-only (tier-1) package installs with no code, and only that. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { pluginInstallConsent } from "#src/cli/commands/plugin/install";

import { installSitePlugin, previewSitePluginInstall } from "@jini-ai/plugins/host/node";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { discoverPlugins } from "@jini-ai/plugins/host/node";

const sha = (text: string) => `sha256-${createHash("sha256").update(text).digest("hex")}`;

async function fixture(files: Record<string, string> = { "README.md": "# Testimonials and FAQ\n" }) {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-declarative-"));
  const sourceDir = path.join(root, "source");
  const installDir = path.join(root, "plugins");
  const manifest: Record<string, unknown> = {
    id: "decl-test",
    name: "Declarative test",
    version: "1.0.0",
    sdkRange: "*",
    engine: 1,
    tier: "tier-1",
    capabilities: [],
    hooks: [],
    fields: [],
    integrity: {},
    contentTypes: [{ key: "faq", label: "FAQ", fields: [{ name: "answer", kind: "text", required: true }] }],
  };
  const writeAll = async () => {
    const integrity: Record<string, string> = {};
    for (const [name, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(sourceDir, name)), { recursive: true });
      await writeFile(path.join(sourceDir, name), text);
      integrity[name] = sha(text);
    }
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, "tovu.plugin.json"), JSON.stringify({ ...manifest, integrity }));
  };
  await writeAll();
  const deps = { ...pluginHostBinding, installDir, builtInIds: ["word-count"], repo: new InMemoryPluginActivationRepo(), conflicts: async () => [] };
  return { root, sourceDir, installDir, manifest, files, writeAll, deps };
}

test("a tier-1 package previews as code-free with its content types, installs, and lists valid", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps });
  assert.equal(preview.tier, "tier-1");
  assert.equal(preview.hasCode, false);
  assert.deepEqual(preview.contentTypes, ["faq"]);
  await installSitePlugin({ sourceDir: f.sourceDir, expectedDigest: preview.digest, deps: f.deps });
  const [listed] = await discoverPlugins({ ...pluginHostBinding, builtIns: [], installDir: f.installDir });
  assert.equal(listed?.status, "valid");
  assert.equal(listed?.tier, "tier-1");
});

test("preview carries the conflicts port's answer for the staged manifest (the plugin-conflicts install preview)", async (t) => {
  const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
  const held = { kind: "content-type", key: "faq", heldBy: "other", heldByName: "Other", heldKey: "faq" };
  const asked: unknown[] = [];
  const conflicts = async (required: { manifest: { id: string; contentTypes?: unknown } }) => { asked.push([required.manifest.id, required.manifest.contentTypes]); return [held]; };
  const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: { ...f.deps, conflicts } });
  assert.deepEqual(preview.conflicts, [held]);
  assert.deepEqual(asked, [["decl-test", f.manifest.contentTypes]]);
});

test("a tier-3 preview still reports code and lists its declared content types (none here)", async (t) => {
  const f = await fixture({ "server/index.mjs": "export default {};" }); t.after(() => rm(f.root, { recursive: true, force: true }));
  f.manifest.tier = "tier-3"; delete f.manifest.contentTypes; await f.writeAll();
  const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps });
  assert.equal(preview.hasCode, true);
  assert.deepEqual(preview.contentTypes, []);
});

const REFUSALS: Array<[string, (f: Awaited<ReturnType<typeof fixture>>) => void, RegExp]> = [
  ["ships server/index.mjs", (f) => { f.files["server/index.mjs"] = "export default {};"; }, /^A declarative \(tier-1\) plugin must not ship code: server\/index\.mjs$/],
  ["ships any script file", (f) => { f.files["assets/widget.js"] = "alert(1)"; }, /must not ship code: assets\/widget\.js$/],
  ["ships an unlisted file kind", (f) => { f.files["icon.svg"] = "<svg/>"; }, /must not ship code: icon\.svg$/],
  ["declares hooks", (f) => { f.manifest.hooks = ["content.entry.beforeSave"]; }, /cannot declare 'hooks'/],
  ["declares an invalid content type", (f) => { f.manifest.contentTypes = [{ key: "post", label: "P", fields: [{ name: "a", kind: "text" }] }]; }, /'post' is reserved by core/],
];

for (const [name, mutate, message] of REFUSALS) {
  test(`a tier-1 package is refused when it ${name}`, async (t) => {
    const f = await fixture(); t.after(() => rm(f.root, { recursive: true, force: true }));
    mutate(f); await f.writeAll();
    await assert.rejects(previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps }), (error: { code: string; message: string }) => {
      assert.equal(error.code, "PLUGIN_MANIFEST_INVALID");
      assert.match(error.message, message);
      return true;
    });
    assert.deepEqual(await readdir(f.installDir).catch(() => []), []);
  });
}

test("data files a declarative plugin may ship: json, md, txt, images, LICENSE", async (t) => {
  const f = await fixture({ "README.md": "r", "LICENSE": "l", "notes.txt": "n", "data/seed.json": "{}", "a.png": "p", "b.jpg": "j", "c.jpeg": "j", "d.gif": "g", "e.webp": "w" });
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const preview = await previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps });
  assert.equal(preview.hasCode, false);
});

test("tier-2 is still refused for a local package", async (t) => {
  const f = await fixture({ "server/index.mjs": "export default {};" }); t.after(() => rm(f.root, { recursive: true, force: true }));
  f.manifest.tier = "tier-2"; await f.writeAll();
  await assert.rejects(previewSitePluginInstall({ sourceDir: f.sourceDir, deps: f.deps }), { code: "PLUGIN_MANIFEST_INVALID" });
});

test("CLI consent: a code-free plugin says so and names its content types instead of the full-access warning", () => {
  const base = { id: "decl-test", name: "Declarative test", version: "1.0.0", capabilities: [], hooks: [], digest: "d", conflicts: [] };
  const declarative = pluginInstallConsent({ preview: { ...base, tier: "tier-1", hasCode: false, contentTypes: ["faq", "testimonial"] } });
  assert.match(declarative, /This plugin contains no code\. It adds content types: faq, testimonial\./);
  assert.doesNotMatch(declarative, /full access/);
  const code = pluginInstallConsent({ preview: { ...base, tier: "tier-3", hasCode: true, contentTypes: [] } });
  assert.match(code, /This plugin runs code with full access to this computer and every site on it\./);
  assert.doesNotMatch(code, /adds content types/);
});
