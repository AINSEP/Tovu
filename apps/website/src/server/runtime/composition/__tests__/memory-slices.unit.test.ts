/**
 * @file The in-memory composition root's publish-apply ports bag and trash slice, driven directly:
 * the theme-files port rescans the SAME theme roster the routes serve after a publish replaced the
 * theme folder, the post port reports a rollback failure on the console, and the trash slice fails
 * fast when the taxonomy trash registry is missing any of the three entries it binds.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { memoryPublishContentPorts, type MemoryPublishPortsInput } from "../memory-deps/slices/publish-apply.js";
import { composeMemoryTrash, type MemoryTrashInput } from "../memory-deps/slices/memory-trash.js";
import { builtInThemesDir } from "../site-paths.js";

function publishPorts(siteThemes: MemoryPublishPortsInput["siteThemes"]) {
  return memoryPublishContentPorts({ siteThemes, content: {} } as unknown as MemoryPublishPortsInput);
}

test("publish apply: a replaced theme folder rescans the served roster in place from the built-in themes dir", () => {
  const siteThemes: MemoryPublishPortsInput["siteThemes"] = [];
  const ports = publishPorts(siteThemes);
  const themeFiles = ports["theme-files"];
  assert.equal(themeFiles.themesDir, builtInThemesDir());
  const expectedIds = discoverAllBuiltInThemes({ dir: builtInThemesDir() }).map(theme => theme.manifest.id).sort();
  assert.ok(expectedIds.length > 0, "the built-in themes dir ships at least one theme");
  themeFiles.onReplaced?.();
  assert.deepEqual(siteThemes.map(theme => theme.manifest.id).sort(), expectedIds);
});

test("publish apply: a post rollback failure is reported on the console with its message and diagnostic", t => {
  const errors = t.mock.method(console, "error", () => undefined);
  publishPorts([]).post.reportRollbackError("rollback failed", "post p-1: restore threw");
  assert.deepEqual(errors.mock.calls.map(call => call.arguments), [["rollback failed", "post p-1: restore threw"]]);
});

for (const missing of ["term", "taxonomy", "form"] as const) {
  test(`memory trash refuses to compose when the trash registry has no ${missing} entry`, () => {
    const entries = (["term", "taxonomy", "form"] as const).filter(type => type !== missing).map(type => [type, { entityType: type }] as const);
    const trashRegistry = new Map<string, unknown>(entries);
    assert.throws(() => composeMemoryTrash({ trashRegistry } as unknown as MemoryTrashInput),
      { message: "memory trash registry is missing a term, taxonomy, or form entry" });
  });
}
