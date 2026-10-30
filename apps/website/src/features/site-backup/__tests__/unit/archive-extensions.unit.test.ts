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
    const stat = fs.statSync(absPath); return { path: file, absPath, bytes: stat.size, mtimeMs: stat.mtimeMs, scope: "themes" };
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
