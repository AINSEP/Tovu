import test from "node:test";
import assert from "node:assert/strict";
import { runtimeToArchivePath, archiveToRuntimePath, archiveCodeUnit } from "../../archive-paths.js";
test("theme tiers and original tiers round-trip from each staged manifest", () => {
  const files = new Map([["themes/roast/theme.json", Buffer.from('{"tier":"static"}')], ["themes/__originals__/roast/theme.json", Buffer.from('{"tier":"static"}')]]);
  for (const path of ["themes/static/roast/theme.json", "themes/__original-themes__/static/roast/theme.json", "overrides/style.css"]) {
    const archivePath = runtimeToArchivePath({ path });
    assert.ok(archivePath);
    assert.equal(archiveToRuntimePath({ path: archivePath, files }), path);
  }
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
