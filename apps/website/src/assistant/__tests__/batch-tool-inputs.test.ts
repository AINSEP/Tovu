/**
 * @file `items: [...]` batch inputs (2026-10-08, owner: "prefer batching the requests, not asking me
 * 50 times"). Pinned here:
 *
 * 1. A single call (no `items`) reaches the original handler untouched and returns its result as is.
 * 2. A batch runs each item through the original handler in order, merging item defaults < shared
 *    top-level fields < the item's own fields, and returns one result with per-item outcomes.
 * 3. Partial failure: a failing item never stops the rest; its error drops the appended schema.
 * 4. Malformed `items` is refused before any item runs, with the exact message.
 * 5. The published descriptor: `items` added, top-level `required` moved into its description.
 * 6. The real composition: every batchable tool publishes `items`, and a real theme batch reads and
 *    writes several files in one call through the same handlers a single call uses.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createContributionRegistry, ToolInputError, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import { type RegistryDepsWithoutLimiter, toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";

import { discoverAllBuiltInThemes } from "../../features/theme/index.js";
import { contributeThemesTools } from "../../features/theme/tool-registrations.js";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { applyBatchInputs, BATCHABLE_TOOLS, batchDescriptorFor, DEFAULT_MAX_BATCH_ITEMS, withBatchInput, type BatchResult } from "../batch-tool-inputs.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";

function executionContext(input: unknown, signal: AbortSignal = new AbortController().signal): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "principal-under-test" }, run: { id: "run-1" }, input, signal };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId", "path"],
  properties: { themeId: { type: "string" }, path: { type: "string" }, maxChars: { type: "integer" } },
} as const;

function fakeRegistration(id: string, handler: ToolHandler, inputSchema: Record<string, unknown> = SCHEMA): ToolRegistration {
  return { descriptor: { id, description: `${id} does one thing.`, inputSchema, readOnly: true }, handler, policy: { authorize: () => "allow" } };
}

/** Records every input the original handler receives; throws for a path of "boom". */
function recordingHandler(): { handler: ToolHandler; inputs: unknown[] } {
  const inputs: unknown[] = [];
  return {
    inputs,
    handler: async (ctx) => {
      inputs.push(ctx.input);
      const input = ctx.input as Record<string, unknown>;
      if (input.path === "boom") throw new ToolInputError({ message: `path 'boom' was not found. Retrying is futile. Schema for 'tool_x': {"type":"object"}` });
      return { read: input.path };
    },
  };
}

test("a single call without items reaches the original handler untouched", async () => {
  const recorder = recordingHandler();
  const wrapped = withBatchInput({ registration: fakeRegistration("tool_x", recorder.handler), tool: { toolId: "tool_x", itemDefaults: { maxChars: 10 } } });
  assert.deepEqual(await wrapped.handler(executionContext({ themeId: "t", path: "a.css" })), { read: "a.css" });
  assert.deepEqual(recorder.inputs, [{ themeId: "t", path: "a.css" }], "item defaults apply to batch items only");
});

test("a batch runs every item in order with defaults < shared fields < the item's own fields", async () => {
  const recorder = recordingHandler();
  const wrapped = withBatchInput({ registration: fakeRegistration("tool_x", recorder.handler), tool: { toolId: "tool_x", itemDefaults: { maxChars: 10 } } });
  const result = await wrapped.handler(executionContext({ themeId: "shared", items: [{ path: "a.css" }, { path: "b.css", themeId: "own", maxChars: 99 }] }));
  assert.deepEqual(recorder.inputs, [
    { maxChars: 10, themeId: "shared", path: "a.css" },
    { maxChars: 99, themeId: "own", path: "b.css" },
  ]);
  assert.deepEqual(result, {
    batch: true, total: 2, succeeded: 2, failed: 0,
    results: [{ index: 0, ok: true, result: { read: "a.css" } }, { index: 1, ok: true, result: { read: "b.css" } }],
  } satisfies BatchResult);
});

test("a failing item does not stop the rest, and its error drops the appended schema", async () => {
  const recorder = recordingHandler();
  const wrapped = withBatchInput({ registration: fakeRegistration("tool_x", recorder.handler), tool: { toolId: "tool_x" } });
  const result = await wrapped.handler(executionContext({ themeId: "t", items: [{ path: "boom" }, { path: "c.css" }] }));
  assert.deepEqual(result, {
    batch: true, total: 2, succeeded: 1, failed: 1,
    results: [{ index: 0, ok: false, error: "path 'boom' was not found. Retrying is futile." }, { index: 1, ok: true, result: { read: "c.css" } }],
  });
});

test("malformed items are refused with the exact message before any item runs", async () => {
  const recorder = recordingHandler();
  const wrapped = withBatchInput({ registration: fakeRegistration("tool_x", recorder.handler), tool: { toolId: "tool_x", maxItems: 2 } });
  const cases: [unknown, string][] = [
    [[], "tool_x: 'items' must be a non-empty array of inputs"],
    ["a.css", "tool_x: 'items' must be a non-empty array of inputs"],
    [[{ path: "a" }, { path: "b" }, { path: "c" }], "tool_x: 'items' has 3 entries; the most one call takes is 2. Split them into several calls."],
    [[{ path: "a" }, ["b"]], "tool_x: items[1] must be an object of this tool's input fields"],
  ];
  for (const [items, message] of cases) {
    await assert.rejects(() => wrapped.handler(executionContext({ items })), (error: unknown) => error instanceof ToolInputError && error.message === message);
  }
  assert.deepEqual(recorder.inputs, []);
});

test("a cancelled call stops before the next item", async () => {
  const controller = new AbortController();
  const inputs: unknown[] = [];
  const wrapped = withBatchInput({
    registration: fakeRegistration("tool_x", async (ctx) => { inputs.push(ctx.input); controller.abort(); return {}; }),
    tool: { toolId: "tool_x" },
  });
  await assert.rejects(() => wrapped.handler(executionContext({ themeId: "t", items: [{ path: "a" }, { path: "b" }] }, controller.signal)), { name: "AbortError" });
  assert.equal(inputs.length, 1);
});

test("the published descriptor adds items and moves the top-level required list into its description", () => {
  const descriptor = batchDescriptorFor({ descriptor: fakeRegistration("tool_x", async () => ({})).descriptor, tool: { toolId: "tool_x" } });
  const schema = descriptor.inputSchema as { required?: string[]; additionalProperties: boolean; properties: Record<string, { maxItems?: number; description?: string }> };
  assert.equal(schema.required, undefined);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), ["themeId", "path", "maxChars", "items"]);
  assert.equal(schema.properties.items?.maxItems, DEFAULT_MAX_BATCH_ITEMS);
  assert.match(schema.properties.items?.description ?? "", /Each item needs themeId, path \(here or once at the top level\)\./);
  assert.match(descriptor.description ?? "", /^tool_x does one thing\. Batch: to do several at once, pass items: /);
  assert.equal(descriptor.readOnly, true, "a read-only tool stays read-only when batched");
});

test("a tool that already takes an 'items' field is refused at composition time", () => {
  const schema = { type: "object", properties: { items: { type: "array" } } };
  assert.throws(() => batchDescriptorFor({ descriptor: fakeRegistration("tool_x", async () => ({}), schema).descriptor, tool: { toolId: "tool_x" } }), /already has an 'items' input/);
});

test("applyBatchInputs wraps only the listed tools and returns every other registration as the same object", () => {
  const listed = fakeRegistration("tool_x", async () => ({}));
  const other = fakeRegistration("tool_y", async () => ({}));
  const [wrappedListed, sameOther] = applyBatchInputs({ registrations: [listed, other] }, { tools: [{ toolId: "tool_x" }, { toolId: "absent_tool" }] });
  assert.notEqual(wrappedListed, listed);
  assert.equal(sameOther, other);
});

test("the real composition: every batchable tool is registered and publishes items", () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const byId = new Map(buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: createRouteDeps() }), undefined, { contributions }).map((r) => [r.descriptor.id, r]));
  for (const { toolId } of BATCHABLE_TOOLS) {
    const schema = byId.get(toolId)?.descriptor.inputSchema as { properties?: Record<string, { type?: string }> } | undefined;
    assert.ok(schema, `expected '${toolId}' in the production catalog`);
    assert.equal(schema.properties?.items?.type, "array", `${toolId} must accept items`);
  }
});

test("a real theme batch writes then reads several files in one call each, through the single-call handlers", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-batch-theme-"));
  const dir = path.join(root, "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{}\n", "utf8");
  try {
    const contributions = {
      contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
      derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
    };
    contributions.contributors.register({ contribution: contributeThemesTools() });
    const deps = {
      workspaceId: "ws-batch", themesDir: root,
      themes: discoverAllBuiltInThemes({ dir: root, source: "built-in" }),
      authorize: async () => ({ allowed: true, reason: "matched" }),
    } as unknown as RegistryDepsWithoutLimiter;
    const byId = new Map(buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: deps }), undefined, { contributions }).map((r) => [r.descriptor.id, r]));

    const written = await byId.get("theme_write_file")!.handler(executionContext({
      themeId: "plain",
      items: [{ path: "assets/a.css", content: "a{}" }, { path: "../escape.css", content: "x" }, { path: "assets/b.css", content: "b{}" }],
    })) as BatchResult;
    assert.equal(written.total, 3);
    assert.deepEqual(written.results.map((r) => r.ok), [true, false, true]);
    assert.equal(fs.readFileSync(path.join(dir, "assets", "b.css"), "utf8"), "b{}");
    assert.equal(fs.existsSync(path.join(root, "escape.css")), false);

    const read = await byId.get("theme_read_file")!.handler(executionContext({ themeId: "plain", items: [{ path: "assets/a.css" }, { path: "styles.css" }] })) as BatchResult;
    assert.deepEqual(read.results.map((r) => r.ok && (r.result as { content?: string }).content), ["a{}", "body{}\n"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("approval runs per item, inside the batch: an item whose class asks is refused alone, the rest still run", async () => {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
  };
  const ran: unknown[] = [];
  // The 'http-method' rule classifies by each input's own method: DELETE is a 'delete' (asks), anything else an edit.
  const probe: ToolRegistration = {
    ...fakeRegistration("tool_batch_probe", async (ctx) => { ran.push(ctx.input); return { done: true }; }, { type: "object", properties: { method: { type: "string" } } }),
    descriptor: { id: "tool_batch_probe", description: "Probe.", inputSchema: { type: "object", properties: { method: { type: "string" } } }, metadata: { approval: { class: "edit", confirmation: "direct", rule: "http-method" } } },
  };
  contributions.contributors.register({ contribution: { domain: "probe", build: () => [probe], risk: new Map([["tool_batch_probe", "mutates-durable-state"]]) } });
  const registration = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: createRouteDeps() }), undefined, { contributions, batchableTools: [{ toolId: "tool_batch_probe" }] })
    .find((r) => r.descriptor.id === "tool_batch_probe");
  assert.ok(registration);

  // No emitSurface: an item whose class asks is refused rather than parked.
  const batch = await registration.handler(executionContext({ items: [{ method: "GET" }, { method: "DELETE" }, { method: "PUT" }] })) as BatchResult;
  assert.deepEqual(batch.results.map((r) => r.ok), [true, false, true]);
  assert.match((batch.results[1] as { error: string }).error, /^TOOL_APPROVAL_NO_CONFIRMATION_CHANNEL: tool_batch_probe:/);
  assert.deepEqual(ran, [{ method: "GET" }, { method: "PUT" }], "the DELETE item never reached the handler");
});
