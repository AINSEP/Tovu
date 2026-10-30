import assert from "node:assert/strict";
import { chmod, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createAssistantToolExecutor } from "#src/assistant/tool-recovery-preset";
import { installSupportingFilesFixture, FOUNDATIONS, SKILL_MARKDOWN } from "#src/features/agent-plugins/__tests__/fixtures/supporting-files.js";

type Result = { guidance: string; skillName: string; files: string[]; availableSkills: { name: string; description: string }[]; note?: string };

/** Exercise the same authorization/execution stack used by the assistant, never a direct handler. */
function reader(fixture: Awaited<ReturnType<typeof installSupportingFilesFixture>>) {
  const executor = createAssistantToolExecutor({ registry: fixture.registry, surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) }, {});
  return async (input: unknown): Promise<Result> => {
    const result = await executor.execute({ principal: { id: "skill-reader" }, run: { id: "skill-read-run" }, toolId: "agent_plugin_ui_ux_design", input });
    assert.equal(result.status, "completed");
    return result.output as Result;
  };
}

test("real installed plugin reads supporting references, resources and examples, with sorted recursive files and skill descriptions", async t => {
  const fixture = await installSupportingFilesFixture({}, { files: {
    "skills/ui-ux-design/resources/z.md": "Resource text.\n",
    "skills/ui-ux-design/examples/button.tsx": "export const Button = () => <button>Go</button>;\n",
    "skills/ui-ux-design/references/nested/x.md": "Nested reference.\n",
  } });
  t.after(fixture.cleanup);
  const read = reader(fixture);
  const overview = await read({});
  assert.equal(overview.guidance, SKILL_MARKDOWN);
  const expectedFiles = ["examples/button.tsx", "references/foundations.md", "references/nested/x.md", "resources/z.md"];
  assert.deepEqual(overview.files, expectedFiles);
  assert.deepEqual(overview.availableSkills, [{ name: "frontend-accessibility", description: "Use when checking accessible controls." }]);
  for (const input of [{ skill: "ui-ux-design", file: "references/foundations.md" }, { file: "references/foundations.md" }]) {
    const result = await read(input);
    assert.equal(result.guidance, FOUNDATIONS);
    assert.equal(result.skillName, "ui-ux-design");
    assert.deepEqual(result.files, expectedFiles);
    assert.deepEqual(result.availableSkills, overview.availableSkills);
  }
  assert.equal((await read({ file: "resources/z.md" })).guidance, "Resource text.\n");
  assert.equal((await read({ file: "examples/button.tsx" })).guidance, "export const Button = () => <button>Go</button>;\n");
  const descriptor = fixture.registry.list({})[0]!;
  assert.ok(descriptor.description!.includes("supporting text"));
  const schema = descriptor.inputSchema as { properties: { file: { description: string } } };
  assert.ok(schema.properties.file.description.includes("relative to the chosen skill folder"));
});

test("unknown and unsafe file requests recover with valid files and never disclose host paths or another skill", async t => {
  const fixture = await installSupportingFilesFixture({});
  t.after(fixture.cleanup);
  const read = reader(fixture);
  const canonicalRoot = await realpath(fixture.root);
  const inputs = [
    { file: "../frontend-accessibility/SKILL.md" },
    { file: "references/../../frontend-accessibility/SKILL.md" },
    { file: "references/../references/foundations.md" },
    { file: path.join(fixture.skillRoot, "references/foundations.md") },
    { file: "C:\\private\\foundations.md" },
    { file: "references/missing.md" },
  ];
  for (const input of inputs) {
    const result = await read(input);
    assert.equal(result.guidance, SKILL_MARKDOWN);
    assert.deepEqual(result.files, ["references/foundations.md"]);
    assert.ok(result.note!.startsWith("File request refused:"));
    assert.ok(result.note!.includes("Valid supporting files: references/foundations.md."));
    const output = JSON.stringify(result);
    assert.equal(output.includes(fixture.root), false);
    assert.equal(output.includes(canonicalRoot), false);
    assert.equal(output.includes(fixture.installed.packageRoot), false);
    assert.equal(output.includes("# Accessibility"), false);
  }
  const unknownSkill = await read({ skill: fixture.skillRoot });
  assert.equal(JSON.stringify(unknownSkill).includes(fixture.skillRoot), false);
  assert.equal(unknownSkill.skillName, "ui-ux-design");
});

test("realpath refuses file and directory symlinks into another skill or outside the package", async t => {
  const fixture = await installSupportingFilesFixture({});
  // The frozen-tree cleanup chmods leaves; remove links first so it cannot chmod their targets.
  t.after(async () => {
    for (const link of ["escape.md", "sibling.md", "linked-directory"]) await unlink(path.join(fixture.skillRoot, link)).catch(() => {});
    await fixture.cleanup();
  });
  const outside = path.join(fixture.root, "outside.md");
  await writeFile(outside, "OUTSIDE_SKILL_CANARY");
  await chmod(fixture.skillRoot, 0o700);
  await symlink(outside, path.join(fixture.skillRoot, "escape.md"));
  await symlink(path.join(fixture.installed.packageRoot, "skills/frontend-accessibility/SKILL.md"), path.join(fixture.skillRoot, "sibling.md"));
  await symlink(path.dirname(outside), path.join(fixture.skillRoot, "linked-directory"));
  const read = reader(fixture);
  for (const file of ["escape.md", "sibling.md", "linked-directory/outside.md"]) {
    const result = await read({ file });
    assert.equal(result.guidance, SKILL_MARKDOWN);
    assert.deepEqual(result.files, ["references/foundations.md"]);
    assert.ok(result.note!.includes("outside this skill folder"));
    assert.equal(JSON.stringify(result).includes("OUTSIDE_SKILL_CANARY"), false);
    assert.equal(JSON.stringify(result).includes(fixture.root), false);
  }
});

test("binary, disallowed extensions and oversize files are refused and excluded from readable files", async t => {
  const fixture = await installSupportingFilesFixture({}, { files: {
    "skills/ui-ux-design/references/binary.md": new Uint8Array([0, 1, 2, 3]),
    "skills/ui-ux-design/references/invalid.txt": new Uint8Array([0xff, 0xfe]),
    "skills/ui-ux-design/resources/asset.png": "DISALLOWED_EXTENSION_CANARY",
    "skills/ui-ux-design/references/large.md": "x".repeat(256 * 1024 + 1),
  } });
  t.after(fixture.cleanup);
  const read = reader(fixture);
  for (const [file, reason] of [["references/binary.md", "binary content"], ["references/invalid.txt", "invalid UTF-8"], ["resources/asset.png", "supported text extensions"], ["references/large.md", "256 KiB text limit"]]) {
    const result = await read({ file });
    assert.equal(result.guidance, SKILL_MARKDOWN);
    assert.deepEqual(result.files, ["references/foundations.md"]);
    assert.ok(result.note!.includes(reason));
    assert.ok(result.note!.includes("Valid supporting files: references/foundations.md."));
    assert.equal(JSON.stringify(result).includes(fixture.installed.packageRoot), false);
    assert.equal(JSON.stringify(result).includes("DISALLOWED_EXTENSION_CANARY"), false);
  }
});
