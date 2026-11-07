import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareArchiveExtensions } from "../../archive-extensions.js";
import { resolveAgentPluginLayout } from "../../../agent-plugins/layout.js";
import type { PlannedDiskFile, SiteBackupSources } from "../../sources.js";
function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archive-originals-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources: SiteBackupSources = { siteDir: root, mediaUploadsDir: null, themesDir: path.join(root, "themes"), skillsDir: path.join(root, "skills"), agentPlugins: resolveAgentPluginLayout({ siteDir: root }, { env: {} }), tovuVersion: "test" };
  const put = (file: string, text: string): PlannedDiskFile => {
    const absPath = path.join(root, file); fs.mkdirSync(path.dirname(absPath), { recursive: true }); fs.writeFileSync(absPath, text);
    const ids = fs.statSync(absPath, { bigint: true });
    const stat = fs.statSync(absPath); return { root, identity: ids.ino === 0n ? null : `${ids.dev}:${ids.ino}`, nlink: Number(ids.nlink), path: file, absPath, bytes: stat.size, mtimeMs: stat.mtimeMs, scope: "themes" };
  };
  return { root, sources, put };
}
test("every theme gets an original baseline even when none was previously recorded", async t => {
  const h = fixture(t), files = [h.put("themes/static/site/theme.json", '{"tier":"static","id":"site"}'), h.put("themes/static/site/index.html", "live")];
  const result = await prepareArchiveExtensions({ sources: h.sources, files });
  const original = result.files.find(file => file.path === "themes/__original-themes__/static/site/index.html");
  assert.ok(original);
  assert.equal(fs.readFileSync(original.absPath, "utf8"), "live");
  assert.equal(files.length, 2, "the input plan is unchanged");
});
test("the theme owner's package original takes precedence over a live-tree fallback", async t => {
  const h = fixture(t), files = [h.put("themes/static/site/theme.json", '{"tier":"static","id":"site"}'), h.put("themes/static/site/index.html", "live")];
  h.put("stock/__original-themes__/static/site/theme.json", '{"tier":"static","id":"site"}');
  h.put("stock/__original-themes__/static/site/index.html", "package original");
  const result = await prepareArchiveExtensions({ sources: h.sources, files }, { packageThemesRoot: path.join(h.root, "stock") });
  assert.equal(fs.readFileSync(result.files.find(file => file.path === "themes/__original-themes__/static/site/index.html")!.absPath, "utf8"), "package original");
});
test("flattening two plugin workspaces refuses before any package is selected", async t => {
  const h = fixture(t), files = [h.put("agent-plugins/ws/one/activations.json", "{}"), h.put("agent-plugins/ws/two/activations.json", "{}")];
  await assert.rejects(prepareArchiveExtensions({ sources: h.sources, files }), /single plugin workspace/);
});

test("a bundled upgrade exports its selected revision even when an older retained copy is no longer indexable", async t => {
  const h = fixture(t), oldDigest = "a".repeat(64), currentDigest = "b".repeat(64);
  const base = "agent-plugins/ws/site/google-workspace/package/sha256/";
  const files = [
    h.put(`${base}${oldDigest}/plugin.json`, '{"name":"google-workspace","version":"old"}'),
    h.put(`${base}${oldDigest}/skills/custom/SKILL.md`, "person's retained edits"),
    h.put(`${base}${currentDigest}/plugin.json`, '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"google-workspace","version":"2.0.0"}'),
    h.put(`${base}${currentDigest}/skills/custom/SKILL.md`, "current selected edits"),
    h.put("agent-plugins/ws/site/bundled-digests.json", JSON.stringify({ schemaVersion: 1, plugins: { "google-workspace": { archiveDigest: currentDigest } } })),
  ];
  const result = await prepareArchiveExtensions({ sources: h.sources, files });
  assert.deepEqual(result.plugins, [{ kind: "agent", id: "google-workspace", version: "2.0.0", digest: currentDigest, enabled: true, shipped: true }]);
  assert.deepEqual(result.files.map(file => file.path), [`${base}${currentDigest}/plugin.json`, `${base}${currentDigest}/skills/custom/SKILL.md`]);
  assert.equal(fs.readFileSync(result.files[1]!.absPath, "utf8"), "current selected edits");
  assert.equal(fs.readFileSync(path.join(h.root, `${base}${oldDigest}/skills/custom/SKILL.md`), "utf8"), "person's retained edits");
});

test("an unrecorded or absent bundled selection never guesses between retained revisions", async t => {
  const h = fixture(t), firstDigest = "a".repeat(64), secondDigest = "b".repeat(64);
  const base = "agent-plugins/ws/site/custom-plugin/package/sha256/";
  const manifest = '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"custom-plugin","version":"1.0.0"}';
  const files = [h.put(`${base}${firstDigest}/plugin.json`, manifest), h.put(`${base}${secondDigest}/plugin.json`, manifest)];
  await assert.rejects(prepareArchiveExtensions({ sources: h.sources, files }), /one installed digest/);
  files.push(h.put("agent-plugins/ws/site/bundled-digests.json", JSON.stringify({ schemaVersion: 1, plugins: { "custom-plugin": { archiveDigest: "c".repeat(64) } } })));
  await assert.rejects(prepareArchiveExtensions({ sources: h.sources, files }), /one installed digest/);
});
