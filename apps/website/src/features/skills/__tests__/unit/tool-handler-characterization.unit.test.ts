import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import {
  buildSkillToolRegistrations,
  type SkillToolSource,
} from "../../tool-registrations.js";

function context({ input }: { input?: unknown }, _options = {}): ToolExecutionContext {
  return {
    executionId: "skill-handler-pin",
    principal: { id: "principal" },
    run: { id: "run" },
    input,
    signal: new AbortController().signal,
  };
}

function registration({ readFile }: { readFile?: SkillToolSource["readFile"] }, _options = {}) {
  const [tool] = buildSkillToolRegistrations({ sources: [{
    id: "skill_handler_pin",
    skillName: "Handler Pin",
    description: "Characterization fixture.",
    markdown: "Original instructions.",
    bundledFiles: [{ kind: "references", path: "skills/references/guide.md" }],
    ...(readFile ? { readFile } : {}),
  }], withExtensionApprovalPolicy });
  assert.ok(tool);
  return tool;
}

for (const input of [undefined, {}, { file: "references/guide.md" }]) {
  test(`readerless handler preserves fallback and file-refusal behavior for ${JSON.stringify(input)}`, async () => {
    const output = await registration({}).handler(context({ input }));
    assert.deepEqual(output, {
      skillName: "Handler Pin",
      guidance: "Original instructions.",
      files: [],
      ...(input?.file !== undefined ? {
        note: "File request refused: no supporting-file reader is available. Valid supporting files: (none).",
      } : {}),
      bundledFiles: [{ kind: "references", root: "site", path: "skills/references/guide.md" }],
    });
  });
}

for (const content of [
  { text: "Supporting text.", files: ["references/guide.md"] },
  { text: "Supporting text.", files: [], note: "Inventory incomplete." },
  { text: "", files: [], note: "File request refused." },
  { text: "", files: [] },
  { text: "", files: [], note: "" },
]) {
  test(`handler preserves reader text, fallback and note presence for ${JSON.stringify(content)}`, async () => {
    const tool = registration({ readFile: async () => content });
    assert.deepEqual(await tool.handler(context({})), {
      skillName: "Handler Pin",
      guidance: content.note && !content.text ? "Original instructions." : content.text,
      files: content.files,
      ...(content.note ? { note: content.note } : {}),
      bundledFiles: [{ kind: "references", root: "site", path: "skills/references/guide.md" }],
    });
  });
}

for (const [input, expectedOptions] of [
  [undefined, {}],
  [{}, {}],
  [{ file: "  references/guide.md  " }, { file: "  references/guide.md  " }],
  [{ file: "" }, { file: "" }],
  [{ file: "   " }, { file: "   " }],
] as const) {
  test(`handler forwards the unchanged optional file for ${JSON.stringify(input)}`, async () => {
    const calls: unknown[] = [];
    const tool = registration({ readFile: async (required, options) => {
      calls.push({ required, options });
      return { text: "Reader instructions.", files: [] };
    } });
    await tool.handler(context({ input }));
    assert.deepEqual(calls, [{ required: {}, options: expectedOptions }]);
  });
}

// The generic object reader accepts arrays; the skill handler must enforce its object-only schema.
for (const input of [null, [], Object.assign([], { file: "references/guide.md" }), "text", 1, { file: 42 }, { unexpected: true }, { file: "guide.md", unexpected: true }]) {
  test(`handler rejects invalid arguments before reading for ${JSON.stringify(input)}`, async () => {
    let reads = 0;
    const tool = registration({ readFile: async () => {
      reads++;
      return { text: "Unused.", files: [] };
    } });
    await assert.rejects(() => tool.handler(context({ input })), Error);
    assert.equal(reads, 0);
  });
}

test("handler propagates reader rejection without replacing it with cached instructions", async () => {
  const error = new Error("Reader unavailable.");
  const tool = registration({ readFile: async () => { throw error; } });
  await assert.rejects(() => tool.handler(context({})), error);
});
