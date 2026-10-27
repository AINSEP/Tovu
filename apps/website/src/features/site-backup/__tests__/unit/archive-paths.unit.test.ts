import test from "node:test";
import assert from "node:assert/strict";
import { runtimeToArchivePath, archiveToRuntimePath, archiveCodeUnit, OVERRIDES_UNIT } from "../../archive-paths.js";
import { excludedSharePath } from "../../share-file-policy.js";
test("theme tiers and original tiers round-trip from each staged manifest", () => {
  const files = new Map([["themes/roast/theme.json", Buffer.from('{"tier":"static"}')], ["themes/__originals__/roast/theme.json", Buffer.from('{"tier":"static"}')]]);
  for (const path of ["themes/static/roast/theme.json", "themes/__original-themes__/static/roast/theme.json", "overrides/style.css"]) {
    const archivePath = runtimeToArchivePath({ path });
    assert.ok(archivePath);
    assert.equal(archiveToRuntimePath({ path: archivePath, files }), path);
  }
});
test("a theme named overrides and the overrides folder map to distinct archive paths and units", () => {
  const files = new Map([["themes/overrides/theme.json", Buffer.from('{"tier":"static"}')]]);
  assert.equal(runtimeToArchivePath({ path: "themes/static/overrides/index.html" }), "themes/overrides/index.html");
  assert.equal(runtimeToArchivePath({ path: "overrides/index.html" }), "themes/__overrides__/index.html");
  assert.equal(archiveToRuntimePath({ path: "themes/overrides/index.html", files }), "themes/static/overrides/index.html");
  assert.equal(archiveToRuntimePath({ path: "themes/__overrides__/index.html", files }), "overrides/index.html");
  assert.equal(archiveCodeUnit({ path: "themes/overrides/index.html" }), "themes/overrides");
  assert.equal(archiveCodeUnit({ path: "themes/__overrides__/index.html" }), OVERRIDES_UNIT);
});
test("plugin package digest and workspace flatten; runtime ledgers never ship", () => {
  assert.equal(runtimeToArchivePath({ path: `agent-plugins/ws/ws/demo/package/sha256/${"a".repeat(64)}/plugin.json` }), "agent-plugins/demo/package/plugin.json");
  assert.equal(runtimeToArchivePath({ path: "agent-plugins/ws/ws/demo/memory/notes/readme.md" }), "agent-plugins/demo/memory/notes/readme.md");
  assert.equal(runtimeToArchivePath({ path: "agent-plugins/ws/ws/activations.json" }), null);
});
// Before: `plugins/demo/plugin.json` and tier folders were remapped under package/. After: the share walks a
// site plugin's Jini-listed files as `plugins/<id>/package/...` already (sources.ts walkSitePlugins).
test("a site package file is already its archive path; tier folders are not remapped", () => {
  assert.equal(runtimeToArchivePath({ path: "plugins/demo/package/plugin.json" }), "plugins/demo/package/plugin.json");
  assert.equal(runtimeToArchivePath({ path: "plugins/static/demo/index.js" }), "plugins/static/demo/index.js");
});
test("skills flatten out of their workspace folder; a skill folder is one code unit", () => {
  assert.equal(runtimeToArchivePath({ path: "skills/ws/workspace-local/help/SKILL.md" }), "skills/help/SKILL.md");
  assert.equal(runtimeToArchivePath({ path: "skills/ws/workspace-local/help/scripts/run.sh" }), "skills/help/scripts/run.sh");
  assert.equal(archiveCodeUnit({ path: "skills/help/scripts/run.sh" }), "skills/help");
  // Archive skills have no workspace level, so a skill named "ws" is still one unit.
  assert.equal(archiveCodeUnit({ path: "skills/ws/scripts/lib/run.sh" }), "skills/ws");
  // Imported skills always land in quarantine, so their archive path is kept as is.
  assert.equal(archiveToRuntimePath({ path: "skills/help/SKILL.md", files: new Map() }), "skills/help/SKILL.md");
});

// RED (Codex check 2026-10-27): `1.2` plus any dotted tail counted as a version, so a flat plugin's
// `1.2.docs/index.js` lost its folder and collided with the plugin's own `index.js` (export refused the
// duplicate). A folder name never makes a version (design 2026-10-27): Jini's discovery picks it before the
// walk (share-site-plugin-versions). The mapping and the private-data exclusion keep every package folder.
test("a folder name never makes a site plugin version: the mapping and the private-data exclusion keep it", () => {
  for (const folder of ["1", "2fa", "1.0", "1.2", "1.2.3", "1.0.0-beta.1", "1.2.3+build.7", "1.2.docs"]) {
    assert.equal(runtimeToArchivePath({ path: `plugins/demo/package/${folder}/index.js` }), `plugins/demo/package/${folder}/index.js`, folder);
    assert.equal(excludedSharePath({ path: `plugins/demo/package/${folder}/data/help.md` }), false, folder);
  }
});
