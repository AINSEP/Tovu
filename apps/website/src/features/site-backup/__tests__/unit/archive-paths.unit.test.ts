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
test("site package versions flatten while portable memory stays outside package", () => {
  assert.equal(runtimeToArchivePath({ path: "plugins/demo/1.0.0/plugin.json" }), "plugins/demo/package/plugin.json");
  assert.equal(runtimeToArchivePath({ path: "plugins/demo/1.0.0/memory/notes/note.md" }), "plugins/demo/memory/notes/note.md");
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

// One version-folder rule (share-file-policy PLUGIN_VERSION_FOLDER) for the archive mapping and the private-data exclusion.
test("a version-shaped folder is a site plugin version on both sides; any other folder is the flat plugin's own content", () => {
  for (const version of ["1.0.0-beta.1", "1.2"]) {
    assert.equal(runtimeToArchivePath({ path: `plugins/demo/${version}/index.js` }), "plugins/demo/package/index.js");
    assert.equal(excludedSharePath({ path: `plugins/demo/${version}/data/token.json` }), true);
  }
  for (const folder of ["1", "2fa"]) {
    assert.equal(runtimeToArchivePath({ path: `plugins/demo/${folder}/data/help.md` }), `plugins/demo/package/${folder}/data/help.md`);
    assert.equal(excludedSharePath({ path: `plugins/demo/${folder}/data/help.md` }), false);
  }
});

// RED (Codex check 2026-10-27): `1.2` plus any dotted tail counted as a version, so a flat plugin's
// `1.2.docs/index.js` lost its folder and collided with the plugin's own `index.js` (export refused the
// duplicate). Only names the installer can create (SemVer) and the legacy two-part `1.0` are versions.
test("a flat plugin's dotted content folder keeps its name, so it never collides with the plugin root", () => {
  const mapped = ["plugins/demo/index.js", "plugins/demo/1.2.docs/index.js"].map(path => runtimeToArchivePath({ path }));
  assert.deepEqual(mapped, ["plugins/demo/package/index.js", "plugins/demo/package/1.2.docs/index.js"]);
  assert.equal(excludedSharePath({ path: "plugins/demo/1.2.docs/data/help.md" }), false);
  for (const version of ["1.0", "1.2.3", "1.2.3-beta.1", "1.2.3+build.7", "1.2.3-rc.1+build"]) {
    assert.equal(runtimeToArchivePath({ path: `plugins/demo/${version}/index.js` }), "plugins/demo/package/index.js", version);
  }
});
