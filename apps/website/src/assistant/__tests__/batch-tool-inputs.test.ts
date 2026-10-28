import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
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
 * 6. The guard: every pure read is batchable, owns native items, or is opted out; opt-outs carry a reason.
 *    Writes that ask per call stay single-call, avoiding one approval per item.
 * 7. The real composition: every batchable tool publishes `items` with its cap, and a real theme batch
 *    reads and writes several files in one call through the same handlers a single call uses.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createContributionRegistry, ToolInputError, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { invokeRegisteredTool as invokeRegistration } from "./fixtures/execute-registered-tool.js";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import { type RegistryDepsWithoutLimiter, toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";

import { discoverAllBuiltInThemes } from "../../features/theme/index.js";
import { buildImportThemeFileRegistrations } from "../../features/theme/import-theme-file-tool.js";
import { contributeThemesTools } from "../../features/theme/tool-registrations.js";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { installFirstPartyToolContributors } from "../../server/runtime/composition/tool-catalog-manifest.js";
import { applyBatchInputs, BATCH_OPT_OUT, batchDescriptorFor, batchEligibilityFor, DEFAULT_MAX_BATCH_ITEMS, resolveBatchableTools, withBatchInput, type BatchResult } from "../batch-tool-inputs.js";
import { ALL_CHAT_DELETE_TOOLS } from "../permanent-delete-tool-gate.js";
import { approvalClassAsks, toolApprovalPolicyFor } from "../../contracts/headless/assistant-tool-approval-policy.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { currentToolIdFor } from "../content-read-tool.js";

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
  assert.deepEqual(await invokeRegistration(wrapped, executionContext({ themeId: "t", path: "a.css" })), { read: "a.css" });
  assert.deepEqual(recorder.inputs, [{ themeId: "t", path: "a.css" }], "item defaults apply to batch items only");
});

test("a batch runs every item in order with defaults < shared fields < the item's own fields", async () => {
  const recorder = recordingHandler();
  const wrapped = withBatchInput({ registration: fakeRegistration("tool_x", recorder.handler), tool: { toolId: "tool_x", itemDefaults: { maxChars: 10 } } });
  const result = await invokeRegistration(wrapped, executionContext({ themeId: "shared", items: [{ path: "a.css" }, { path: "b.css", themeId: "own", maxChars: 99 }] }));
  assert.deepEqual(recorder.inputs, [
    { maxChars: 10, themeId: "shared", path: "a.css" },
    { maxChars: 99, themeId: "own", path: "b.css" },
  ]);
  assert.deepEqual(result, {
    batch: true, outcome: "completed", total: 2, succeeded: 2, failed: 0,
    results: [{ index: 0, ok: true, result: { read: "a.css" } }, { index: 1, ok: true, result: { read: "b.css" } }],
  } satisfies BatchResult);
});

test("a failing item does not stop the rest, and its error drops the appended schema", async () => {
  const recorder = recordingHandler();
  const wrapped = withBatchInput({ registration: fakeRegistration("tool_x", recorder.handler), tool: { toolId: "tool_x" } });
  const result = await invokeRegistration(wrapped, executionContext({ themeId: "t", items: [{ path: "boom" }, { path: "c.css" }] }));
  assert.deepEqual(result, {
    batch: true, outcome: "partial_failure", total: 2, succeeded: 1, failed: 1,
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
    await assert.rejects(() => invokeRegistration(wrapped, executionContext({ items })), (error: unknown) => error instanceof ToolInputError && error.message === message);
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
  await assert.rejects(() => invokeRegistration(wrapped, executionContext({ themeId: "t", items: [{ path: "a" }, { path: "b" }] }, controller.signal)), { name: "AbortError" });
  assert.equal(inputs.length, 1);
});

test("the published descriptor adds items and moves the top-level required list into its description", () => {
  const descriptor = batchDescriptorFor({ descriptor: fakeRegistration("tool_x", async () => ({})).descriptor, tool: { toolId: "tool_x" } });
  const schema = descriptor.inputSchema as { required?: string[]; additionalProperties: boolean; properties: Record<string, { maxItems?: number; description?: string }> };
  assert.equal(schema.required, undefined);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), ["themeId", "path", "maxChars", "items"]);
  assert.equal(schema.properties.items?.maxItems, DEFAULT_MAX_BATCH_ITEMS);
  assert.match(schema.properties.items?.description ?? "", /Each item needs themeId, path \(inside each item\)\./);
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

function productionContributions() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  return contributions;
}

test("a pure read with only optional selectors batches by default; native items stay unshadowed", async () => {
  const inputs: unknown[] = [];
  const read = { ...fakeRegistration("pure_list_read", async ctx => { inputs.push(ctx.input); return ctx.input; }, {
    type: "object", additionalProperties: false, properties: { query: { type: "string" } },
  }), descriptor: { id: "pure_list_read", sideEffects: "none" as const, readOnly: true,
    inputSchema: { type: "object", additionalProperties: false, properties: { query: { type: "string" } } } } };
  const native = fakeRegistration("native_items", async () => ({}), { type: "object", properties: { items: { type: "array" } } });
  const [wrapped, untouched] = applyBatchInputs({ registrations: [read, native] });
  assert.equal(untouched, native, "native items must not be shadowed");
  const output = await invokeRegistration(wrapped!, executionContext({ items: [{}, { query: "own" }, { invented: true }, { query: "last" }] })) as BatchResult;
  assert.deepEqual(output.results.map(item => item.ok), [true, true, false, true]);
  assert.deepEqual(inputs, [{}, { query: "own" }, { query: "last" }]);
  const cap = Array.from({ length: DEFAULT_MAX_BATCH_ITEMS + 1 }, () => ({}));
  await assert.rejects(invokeRegistration(wrapped!, executionContext({ items: cap })), /most one call takes is 25/);
  assert.equal(inputs.length, 3, "the cap fails before any item runs");
});

test("guard: every production pure read batches; other tools retain explicit write opt-outs", () => {
  // Raw, pre-batch registrations with every permanent delete granted, so the guard sees them all.
  const raw = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: createRouteDeps() }), undefined, {
    contributions: productionContributions(), includeContentReadCollapse: false, batchableTools: [], permanentDeletePolicy: ALL_CHAT_DELETE_TOOLS,
  });
  const optOut = new Set(BATCH_OPT_OUT.map(entry => entry.toolId));
  const ids = new Set(raw.map(registration => registration.descriptor.id));
  const selected = new Set(resolveBatchableTools({ registrations: raw }).map(tool => tool.toolId));
  assert.deepEqual(raw.filter(registration => registration.descriptor.sideEffects === "none" && !selected.has(registration.descriptor.id)
    && batchEligibilityFor({ registration }, { optOut }) === "list-read").map(registration => registration.descriptor.id), [], "every pure read must accept items unless opted out");
  const unclassified = raw.filter(registration => !selected.has(registration.descriptor.id) && !optOut.has(registration.descriptor.id)
    && !["no-object-schema", "takes-items"].includes(batchEligibilityFor({ registration })));
  assert.deepEqual(unclassified.map(registration => registration.descriptor.id), [], "add these to BATCH_OPT_OUT with a one-line reason, or make them batchable");
  const asking = raw.filter(registration => {
    const policy = toolApprovalPolicyFor({ registration });
    return registration.descriptor.sideEffects !== "none" && (policy.rule !== undefined || approvalClassAsks({ class: policy.class })) && !optOut.has(registration.descriptor.id);
  });
  assert.deepEqual(asking.map(registration => registration.descriptor.id), [], "a tool that asks per call would ask once per item: opt it out");
  assert.deepEqual(BATCH_OPT_OUT.filter(entry => !ids.has(entry.toolId)).map(entry => entry.toolId), [], "stale opt-out entries");
  assert.equal(optOut.size, BATCH_OPT_OUT.length, "each opt-out appears once");
  for (const entry of BATCH_OPT_OUT) assert.ok(entry.reason.length > 0, `${entry.toolId} needs a reason`);
});

test("the real composition: every default batchable tool publishes items with its cap", () => {
  const contributions = productionContributions();
  const deps = toAssistantRegistryDeps({ routeDeps: createRouteDeps() });
  const raw = buildAssistantToolRegistrations(deps, undefined, { contributions, includeContentReadCollapse: false, batchableTools: [] });
  const byId = new Map(buildAssistantToolRegistrations(deps, undefined, { contributions }).map((r) => [r.descriptor.id, r]));
  const tools = resolveBatchableTools({ registrations: raw });
  assert.ok(tools.length > 150, `expected default-on batching, got ${tools.length} tools`);
  for (const { toolId, maxItems = DEFAULT_MAX_BATCH_ITEMS } of tools) {
    const schema = byId.get(currentToolIdFor(toolId))?.descriptor.inputSchema as { properties?: Record<string, { type?: string; maxItems?: number }> } | undefined;
    assert.ok(schema, `expected '${toolId}' in the production catalog`);
    assert.equal(schema.properties?.items?.type, "array", `${toolId} must accept items`);
    if (byId.has(toolId)) assert.equal(schema.properties?.items?.maxItems, maxItems, `${toolId}'s cap`);
  }
  for (const toolId of ["redirects_tombstone", "taxonomy_create_term", "taxonomy_assign_terms", "seo_set_entry_overrides", "theme_trash_file"]) {
    assert.equal(tools.find(tool => tool.toolId === toolId)?.maxItems, 100, `${toolId} is a cheap row-level write`);
  }
  for (const { toolId } of BATCH_OPT_OUT) assert.equal(tools.some(tool => tool.toolId === toolId), false, `${toolId} is opted out`);
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

    const written = await invokeRegistration(byId.get("theme_write_file")!, executionContext({
      themeId: "plain",
      items: [{ path: "assets/a.css", content: "a{}" }, { path: "../escape.css", content: "x" }, { path: "assets/b.css", content: "b{}" }],
    })) as BatchResult;
    assert.equal(written.total, 3);
    assert.deepEqual(written.results.map((r) => r.ok), [true, false, true]);
    assert.equal(fs.readFileSync(path.join(dir, "assets", "b.css"), "utf8"), "b{}");
    assert.equal(fs.existsSync(path.join(root, "escape.css")), false);

    const read = await invokeRegistration(byId.get("theme_read_file")!, executionContext({ themeId: "plain", items: [{ path: "assets/a.css" }, { path: "styles.css" }] })) as BatchResult;
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
  const batch = await invokeRegistration(registration, executionContext({ items: [{ method: "GET" }, { method: "DELETE" }, { method: "PUT" }] })) as BatchResult;
  assert.deepEqual(batch.results.map((r) => r.ok), [true, false, true]);
  assert.match((batch.results[1] as { error: string }).error, /^TOOL_APPROVAL_NO_CONFIRMATION_CHANNEL: tool_batch_probe:/);
  assert.deepEqual(ran, [{ method: "GET" }, { method: "PUT" }], "the DELETE item never reached the handler");
});

test("web fetch batches refuse screenshots from shared or item fields before rendering and continue other items", async () => {
  const inputs: unknown[] = [];
  const registration = fakeRegistration("web_fetch_page", async ctx => { inputs.push(ctx.input); return { text: "bounded" }; }, { type: "object", required: ["url"], properties: { url: { type: "string" }, screenshot: { type: "boolean" } } });
  const wrapped = applyBatchInputs({ registrations: [registration] })[0]!;
  const result = await invokeRegistration(wrapped, executionContext({ screenshot: true, items: [
    { url: "https://a.example/" }, { url: "https://b.example/", screenshot: false }, { url: "https://c.example/", screenshot: true },
  ] })) as BatchResult;
  assert.deepEqual([result.total, result.succeeded, result.failed], [3, 1, 2]);
  // BATCH_TOOL_SETTINGS gives web_fetch_page items a bounded maxChars default.
  assert.deepEqual(inputs, [{ url: "https://b.example/", screenshot: false, maxChars: 8000 }]);
  for (const item of result.results.filter(item => !item.ok)) assert.match(item.error, /screenshot is unavailable in batch items; use a single render call/);
  assert.ok(!JSON.stringify(result).includes('"type":"image"'));
  await invokeRegistration(wrapped, executionContext({ url: "https://single.example/", screenshot: true }));
  assert.equal(inputs.length, 2, "single calls still reach the image-producing handler");
});

test("local theme asset batches inherit root/theme, allow item overrides and continue after a refusal", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-batch-local-theme-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 }));
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{}");
  fs.writeFileSync(path.join(dir, "pages/index.html"), "<html><body>Page</body></html>");
  const font = Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0xff]);
  const icon = Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0xff]);
  fs.writeFileSync(path.join(root, "font.woff2"), font);
  fs.writeFileSync(path.join(root, "icon.ico"), icon);
  const permissions: string[] = [];
  const registrations = buildImportThemeFileRegistrations({
    workspaceId: "ws-batch-local", themesDir: root, siteBinding: { dir: root }, resolveActiveThemeId: async () => "plain",
    themes: discoverAllBuiltInThemes({ dir: root, source: "built-in" }),
    resolveRoots: () => ({ repo: root, site: root, custom: root }),
    authorize: async (request) => { permissions.push(request.permission); return { allowed: true, reason: "matched" }; },
    mediaImportHttpClient: { send: async () => { throw new Error("local imports must not fetch"); } },
  });
  const registration = applyBatchInputs({ registrations }).find(r => r.descriptor.id === "theme_import_local_file")!;
  const batch = await invokeRegistration(registration, executionContext({
    themeId: "plain", root: "custom", sourcePath: "font.woff2",
    items: [{ path: "assets/font.woff2" }, { sourcePath: ".env", path: "assets/denied.woff2" }, { root: "site", sourcePath: "icon.ico", path: "assets/icon.ico" }],
  })) as BatchResult;
  assert.deepEqual(batch.results.map(r => r.ok), [true, false, true]);
  assert.deepEqual([batch.total, batch.succeeded, batch.failed], [3, 2, 1]);
  assert.deepEqual(permissions, ["theme.edit", "theme.edit", "theme.edit"]);
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(dir, "assets/font.woff2"))), font);
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(dir, "assets/icon.ico"))), icon);
  assert.equal(fs.existsSync(path.join(dir, "assets/denied.woff2")), false);
});
