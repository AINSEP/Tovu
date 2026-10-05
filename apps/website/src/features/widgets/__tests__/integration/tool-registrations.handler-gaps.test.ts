import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { memoryWidgetTrash } from "../support/memory-widget-trash.js";
import { PRE_AUTHORIZED } from "../../authorize-helper.js";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory.js";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../../tool-registrations.js";

/**
 * @file Handler arms of `tool-registrations.ts` no other suite reaches: `widgets_list_instances`
 * with no input object and with a `widgetType` filter, `widgets_create_instance` with an explicit
 * slug, `widgets_get_region` when the bound area entry is gone or is not an area, the trash reply
 * when the Trash reports no new version, and an error the model-facing mapper does not know (it
 * must pass through unchanged, not be dressed up as a widgets input error).
 *
 * Real in-memory adapters, the same rig as `tool-registrations.region-gaps.test.ts`.
 */

const WORKSPACE_ID = "ws-handler-gaps";
const NOW = "2026-08-20T00:00:00.000Z";

function makeDeps(): WidgetsToolDeps {
  let counter = 0;
  const widgetTrash = memoryWidgetTrash();
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: widgetTrash.entryRepo,
    removeWidget: widgetTrash.remove,
    forgetRemovedPost: async () => undefined,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: new InMemoryPostRepo(),
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: undefined as unknown as WidgetsToolDeps["pluginBeforeSaveHook"],
    authorize: PRE_AUTHORIZED,
  };
}

function executionContext(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal } as ToolExecutionContext;
}

function wired(toolId: string, deps: WidgetsToolDeps): ToolRegistration {
  const found = buildWidgetsRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

async function createInstance(deps: WidgetsToolDeps, input: Record<string, unknown>): Promise<{ id: string; slug: string; version: number; widgetType: string }> {
  const out = (await wired("widgets_create_instance", deps).handler(executionContext(input))) as {
    instance: { id: string; slug: string; version: number; widgetType: string };
  };
  return out.instance;
}

test("widgets_list_instances: a missing input object lists every active instance instead of failing", async () => {
  const deps = makeDeps();
  const note = await createInstance(deps, { widgetType: "text", title: "Note", config: { body: "hi" } });
  const out = (await wired("widgets_list_instances", deps).handler(executionContext(undefined))) as { instances: Array<{ id: string }> };
  assert.deepEqual(out.instances.map((i) => i.id), [note.id]);
});

test("widgets_list_instances: a string widgetType filters by type", async () => {
  const deps = makeDeps();
  const note = await createInstance(deps, { widgetType: "text", title: "Note", config: { body: "hi" } });
  const list = wired("widgets_list_instances", deps);
  const text = (await list.handler(executionContext({ widgetType: "text" }))) as { instances: Array<{ id: string }> };
  assert.deepEqual(text.instances.map((i) => i.id), [note.id]);
  const other = (await list.handler(executionContext({ widgetType: "html" }))) as { instances: Array<{ id: string }> };
  assert.deepEqual(other.instances, []);
});

test("widgets_create_instance: an explicit slug is kept", async () => {
  const deps = makeDeps();
  const instance = await createInstance(deps, { widgetType: "text", title: "Note", config: { body: "hi" }, slug: "footer-note" });
  assert.equal(instance.slug, "footer-note");
});

for (const [label, prepare] of [
  ["missing", async (_deps: WidgetsToolDeps) => "area-that-was-deleted"],
  ["not an area entry", async (deps: WidgetsToolDeps) => (await createInstance(deps, { widgetType: "text", title: "Not an area", config: { body: "x" } })).id],
] as const) {
  test(`widgets_get_region: a bound area entry that is ${label} is WIDGETS_AREA_NOT_FOUND`, async () => {
    const deps = makeDeps();
    const areaEntryId = await prepare(deps);
    deps.widgetBindingRepo = new InMemoryWidgetRegionBindingRepo([{ workspaceId: WORKSPACE_ID, regionKey: "footer", areaEntryId, updatedAt: NOW }]);
    await assert.rejects(wired("widgets_get_region", deps).handler(executionContext({ regionKey: "footer" })), (err: unknown) => {
      assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${String(err)}`);
      assert.equal(err.message, "WIDGETS_AREA_NOT_FOUND: region area entry for 'footer' was not found");
      return true;
    });
  });
}

test("widgets_trash_instance: when the Trash reports no new version, the reply carries the row's version", async () => {
  const deps = makeDeps();
  const note = await createInstance(deps, { widgetType: "text", title: "Note", config: { body: "hi" } });
  const remove = deps.removeWidget;
  deps.removeWidget = async (args) => {
    const removed = await remove(args);
    return removed.ok ? { ...removed, version: null } : removed;
  };
  const out = await wired("widgets_trash_instance", deps).handler(executionContext({ widgetInstanceId: note.id }));
  assert.deepEqual(out, { trashed: true, cancelled: false, widgetInstanceId: note.id, title: "Note", slug: note.slug, version: note.version });
});

test("an error the widgets mapper does not know reaches the executor unchanged", async () => {
  const deps = makeDeps();
  const failure = new Error("binding store unavailable");
  deps.widgetBindingRepo = { ...new InMemoryWidgetRegionBindingRepo(), findByRegion: async () => { throw failure; } } as unknown as WidgetsToolDeps["widgetBindingRepo"];
  await assert.rejects(wired("widgets_get_region", deps).handler(executionContext({ regionKey: "footer" })), (err: unknown) => err === failure);
});
