/**
 * @file Characterization of the Widgets agent-tool contract, built THROUGH THE HOST CONTRIBUTOR
 * (`contributeWidgetsTools().build(deps, surfaces)`), so it pins what the assistant's composition
 * root receives regardless of which package the catalog and handlers live in. It must stay green,
 * unedited, across the move of the tool catalog and handlers into `@jini-ai/cms/widgets`.
 *
 * Pinned: registration ids and their order (saved in permissions and audit rows), every descriptor
 * byte-for-byte against a committed golden (including `metadata`: the host's search vocabulary and
 * approval policy), the derived-risk map, the per-tool permission refusal, one success view per
 * tool, and that a plugin save-hook refusal thrown inside an embed handler reaches the model as the
 * same fixed refusal.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createHookRegistry } from "@jini-ai/plugins/host";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
import { InMemoryPostRepo, type BeforeSaveHookPort } from "#src/features/post/index";
import { contributeWidgetsTools, type WidgetsToolDeps } from "../tool-registrations.js";
import { memoryWidgetTrash } from "./support/memory-widget-trash.js";

const WORKSPACE_ID = "ws-widgets-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-11-17T00:00:00.000Z";
const HOST_ID = "post-1";
const PLUGIN_ID = "seo-helper";
const RAW_PLUGIN_TEXT = "SQLITE_CORRUPT reading /Users/owner/site/.tovu/data.sqlite with token=sk-live-123";

const TOOL_IDS = [
  "widgets_list_instances",
  "widgets_get_instance",
  "widgets_list_regions",
  "widgets_get_region",
  "widgets_create_instance",
  "widgets_update_instance",
  "widgets_trash_instance",
  "widgets_bind_region",
  "widgets_set_region_placements",
  "widgets_insert_embed",
  "widgets_remove_embed",
  "widgets_reorder_embeds",
] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["widgets_list_instances", "none"],
  ["widgets_get_instance", "none"],
  ["widgets_list_regions", "none"],
  ["widgets_get_region", "none"],
  ["widgets_create_instance", "mutates-durable-state"],
  ["widgets_update_instance", "mutates-durable-state"],
  ["widgets_trash_instance", "mutates-durable-state"],
  ["widgets_bind_region", "mutates-durable-state"],
  ["widgets_set_region_placements", "mutates-durable-state"],
  ["widgets_insert_embed", "mutates-durable-state"],
  ["widgets_remove_embed", "mutates-durable-state"],
  ["widgets_reorder_embeds", "mutates-durable-state"],
];

/** The permission each tool's refusal names: the gate is one evaluator whichever layer calls it. */
const REFUSAL_PERMISSION: Readonly<Record<(typeof TOOL_IDS)[number], string>> = {
  widgets_list_instances: "widgets.read",
  widgets_get_instance: "widgets.read",
  widgets_list_regions: "widgets.read",
  widgets_get_region: "widgets.read",
  widgets_create_instance: "widgets.create",
  widgets_update_instance: "widgets.update",
  widgets_trash_instance: "widgets.read",
  widgets_bind_region: "widgets.place",
  widgets_set_region_placements: "widgets.place",
  widgets_insert_embed: "widgets.place",
  widgets_remove_embed: "widgets.place",
  widgets_reorder_embeds: "widgets.place",
};

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

interface Fixture {
  deps: WidgetsToolDeps;
  /** Flip to `false` to make every authorize() call refuse. */
  allow: { value: boolean };
  hook: { current: BeforeSaveHookPort };
}

async function makeFixture(): Promise<Fixture> {
  let counter = 0;
  const widgetTrash = memoryWidgetTrash();
  const allow = { value: true };
  const hook: Fixture["hook"] = { current: async () => ({}) };
  const deps: WidgetsToolDeps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: widgetTrash.entryRepo,
    removeWidget: widgetTrash.remove,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: new InMemoryPostRepo({}),
    forgetRemovedPost: async () => {},
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: (entry) => hook.current(entry),
    authorize: async () => (allow.value ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  };
  await deps.postRepo.save({
    id: HOST_ID, workspaceId: WORKSPACE_ID, title: "Host Post", slug: "host-post",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [] }] }, bodyFormat: "doc", bodyHtml: null,
    status: "draft", kind: "post", updatedAt: NOW, version: 1,
  } as never);
  return { deps, allow, hook };
}

function buildThroughContributor(deps: WidgetsToolDeps): ToolRegistration[] {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  return contributeWidgetsTools().build(deps, { surfaceExchanges });
}

function ctx(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function caller(registrations: ToolRegistration[]) {
  return (id: string, input: unknown): Promise<unknown> => {
    const found = registrations.find((registration) => registration.descriptor.id === id);
    assert.ok(found, `expected '${id}' to be wired`);
    return Promise.resolve(found.handler(ctx(input)));
  };
}

test("(a) registration ids, in order, are the twelve widgets tools", async () => {
  const ids = buildThroughContributor((await makeFixture()).deps).map((registration) => registration.descriptor.id);
  assert.deepEqual(ids, [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", async () => {
  for (const registration of buildThroughContributor((await makeFixture()).deps)) {
    const descriptor = JSON.parse(JSON.stringify(registration.descriptor));
    assert.deepStrictEqual(descriptor, GOLDEN[registration.descriptor.id], registration.descriptor.id);
  }
  assert.deepEqual(Object.keys(GOLDEN), [...TOOL_IDS]);
});

test("(c) the contributor's derived-risk map is the twelve authored entries", () => {
  assert.deepEqual([...contributeWidgetsTools().risk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
});

/** Seeds one instance, a bound region holding it and a post host, so every tool has state to act on. */
async function seedAll(call: ReturnType<typeof caller>): Promise<{ widgetId: string }> {
  const created = (await call("widgets_create_instance", { widgetType: "text", title: "Note", config: { body: "hi" } })) as { instance: { id: string } };
  const bound = (await call("widgets_bind_region", { regionKey: "footer" })) as { area: { version: number } };
  await call("widgets_set_region_placements", { regionKey: "footer", baseVersion: bound.area.version, placements: [{ widgetEntryId: created.instance.id, enabled: true }] });
  return { widgetId: created.instance.id };
}

function refusalInputs(widgetId: string): Record<(typeof TOOL_IDS)[number], unknown> {
  return {
    widgets_list_instances: {},
    widgets_get_instance: { widgetInstanceId: widgetId },
    widgets_list_regions: {},
    widgets_get_region: { regionKey: "footer" },
    widgets_create_instance: { widgetType: "text", title: "Other", config: { body: "x" } },
    widgets_update_instance: { widgetInstanceId: widgetId, baseVersion: 1, config: { body: "z" } },
    widgets_trash_instance: { widgetInstanceId: widgetId },
    widgets_bind_region: { regionKey: "footer" },
    widgets_set_region_placements: { regionKey: "footer", baseVersion: 2, placements: [] },
    widgets_insert_embed: { hostEntryId: HOST_ID, baseVersion: 1, widgetEntryId: widgetId },
    widgets_remove_embed: { hostEntryId: HOST_ID, baseVersion: 1, placementId: "placement-x" },
    widgets_reorder_embeds: { hostEntryId: HOST_ID, baseVersion: 1, orderedWidgetEntryIds: [widgetId] },
  };
}

for (const toolId of TOOL_IDS) {
  test(`(d) ${toolId}: a principal without the permission is refused with the model-facing forbidden error`, async () => {
    const fixture = await makeFixture();
    const call = caller(buildThroughContributor(fixture.deps));
    const { widgetId } = await seedAll(call);
    fixture.allow.value = false;
    await assert.rejects(call(toolId, refusalInputs(widgetId)[toolId]), (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
      assert.equal(error.message, `WIDGETS_FORBIDDEN: principal '${PRINCIPAL_ID}' lacks permission '${REFUSAL_PERMISSION[toolId]}' (insufficient_permission)`);
      return true;
    });
  });
}

test("(e) one success call per tool returns the model-facing view", async () => {
  const fixture = await makeFixture();
  const call = caller(buildThroughContributor(fixture.deps));
  const view = (id: string, version: number, body: string) => ({ id, slug: "note-id-1", title: "Note", status: "active", widgetType: "text", config: { body }, version });

  assert.deepEqual(await call("widgets_create_instance", { widgetType: "text", title: "Note", config: { body: "hi" } }), { instance: view("id-2", 1, "hi") });
  assert.deepEqual(await call("widgets_list_instances", {}), { instances: [view("id-2", 1, "hi")] });
  assert.deepEqual(await call("widgets_get_instance", { widgetInstanceId: "id-2" }), { instance: view("id-2", 1, "hi"), whereUsed: { count: 0, references: [] } });
  assert.deepEqual(await call("widgets_bind_region", { regionKey: "footer" }), { area: { id: "id-4", regionKey: "footer", version: 1, updatedAt: NOW } });
  assert.deepEqual(
    await call("widgets_set_region_placements", { regionKey: "footer", baseVersion: 1, placements: [{ widgetEntryId: "id-2", enabled: true }] }),
    { area: { id: "id-4", regionKey: "footer", version: 2, updatedAt: NOW } },
  );
  assert.deepEqual(await call("widgets_list_regions", {}), { regions: [{ regionKey: "footer", areaEntryId: "id-4", updatedAt: NOW, placementCount: 1 }] });
  assert.deepEqual(await call("widgets_get_region", { regionKey: "footer" }), {
    area: { id: "id-4", regionKey: "footer", version: 2, updatedAt: NOW },
    placements: [{ placementId: "id-6", widgetEntryId: "id-2", enabled: true, widgetTitle: "Note", widgetType: "text", broken: false }],
  });
  assert.deepEqual(await call("widgets_update_instance", { widgetInstanceId: "id-2", baseVersion: 1, config: { body: "bye" } }), { instance: view("id-2", 2, "bye") });

  const inserted = (await call("widgets_insert_embed", { hostEntryId: HOST_ID, baseVersion: 1, widgetEntryId: "id-2" })) as { entryId: string; entryVersion: number; placementId: string };
  assert.deepEqual(inserted, { entryId: HOST_ID, entryVersion: 2, placementId: "id-9" });
  assert.deepEqual(await call("widgets_remove_embed", { hostEntryId: HOST_ID, baseVersion: 2, placementId: inserted.placementId }), { entryId: HOST_ID, entryVersion: 3 });
  await call("widgets_insert_embed", { hostEntryId: HOST_ID, baseVersion: 3, widgetEntryId: "id-2" });
  assert.deepEqual(await call("widgets_reorder_embeds", { hostEntryId: HOST_ID, baseVersion: 4, orderedWidgetEntryIds: ["id-2"] }), { entryId: HOST_ID, entryVersion: 5 });

  assert.deepEqual(await call("widgets_trash_instance", { widgetInstanceId: "id-2" }), { trashed: true, cancelled: false, widgetInstanceId: "id-2", title: "Note", slug: "note-id-1", version: 3 });
});

test("(f) a plugin save-hook refusal thrown inside an embed handler reaches the model as the same fixed refusal", async () => {
  const fixture = await makeFixture();
  const call = caller(buildThroughContributor(fixture.deps));
  const created = (await call("widgets_create_instance", { widgetType: "text", title: "Note", config: { body: "hi" } })) as { instance: { id: string } };
  const registry = createHookRegistry({ pluginSdkBinding: pluginHostBinding.pluginSdkBinding });
  registry.attach({ pluginId: PLUGIN_ID, source: "site", filter: async () => { throw new Error(RAW_PLUGIN_TEXT); }, declaredFields: [] });
  fixture.hook.current = (entry) => registry.runBeforeSave({ entry });
  await assert.rejects(call("widgets_insert_embed", { hostEntryId: HOST_ID, baseVersion: 1, widgetEntryId: created.instance.id }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
    assert.equal(error.message, `PLUGIN_HOOK_FAILED: a site plugin (${PLUGIN_ID}) refused this save; the content was not saved`);
    assert.equal(error.message.includes("SQLITE_CORRUPT"), false);
    return true;
  });
});

test("(g) a config shape rejection is decorated with the published schema of the tool", async () => {
  const fixture = await makeFixture();
  const call = caller(buildThroughContributor(fixture.deps));
  await assert.rejects(call("widgets_create_instance", { widgetType: "text", title: "Note", config: { unexpected: true } }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
    assert.match(error.message, /widgets_create_instance/);
    return true;
  });
});
