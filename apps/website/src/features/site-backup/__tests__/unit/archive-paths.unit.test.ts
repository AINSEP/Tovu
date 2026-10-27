import test from "node:test";
import assert from "node:assert/strict";
import { runtimeToArchivePath, archiveToRuntimePath } from "../../archive-paths.js";
test("theme tiers and original tiers round-trip from each staged manifest", () => {
  const files = new Map([["themes/roast/theme.json", Buffer.from('{"tier":"static"}')], ["themes/__originals__/roast/theme.json", Buffer.from('{"tier":"static"}')]]);
  for (const path of ["themes/static/roast/theme.json", "themes/__original-themes__/static/roast/theme.json", "overrides/style.css", "skills/help/SKILL.md"]) {
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
