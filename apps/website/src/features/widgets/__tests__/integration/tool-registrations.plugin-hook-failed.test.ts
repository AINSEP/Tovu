import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { createHookRegistry } from "@jini-ai/plugins/host";
import { InMemoryPostRepo, type BeforeSaveHookPort, type PostRecord } from "#src/features/post/index";
import { PRE_AUTHORIZED } from "@jini-ai/cms/widgets";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import { buildWidgetsRegistrations, type WidgetsToolDeps } from "../../tool-registrations.js";
import { memoryWidgetTrash } from "../support/memory-widget-trash.js";

/**
 * @file RED regression suite (2026-10-05): the three embed tools write a post/page host through
 * `updatePost`, which runs the plugin `content.entry.beforeSave` hook — but Widgets' handler map was
 * only wrapped with `toModelFacingWidgetsError`, which passes a `PluginHookFailedError` through
 * untouched, so a plugin refusal reached the model as a redacted `INTERNAL_ERROR` (the same gap
 * 8a2f75bf8 closed for `content_post_create`/`content_post_update`).
 *
 * Driven through the REAL delegated-tool-call transport (same harness as
 * `tool-registrations.delegated-error-status.test.ts`): the redaction lives in the transport, so a
 * handler-level `assert.rejects` would pass against the bug. The refusing hook is the REAL
 * `createHookRegistry().runBeforeSave` with one attached filter that throws a message full of
 * internals. The hook is switchable so each case can first place a real embed (hook passing), then
 * prove the refused write left the host exactly as it was.
 *
 * RED before the fix: every embed case below answered
 * `{ code: "INTERNAL_ERROR", message: "an internal error occurred" }`.
 */

const WORKSPACE_ID = "ws-widgets-plugin-hook";
const NOW = "2026-10-05T00:00:00.000Z";
const PLUGIN_ID = "seo-helper";
/** Everything a plugin's own error text could carry that must never reach the model. */
const RAW_PLUGIN_TEXT = "SQLITE_CORRUPT reading /Users/owner/site/.tovu/data.sqlite with token=sk-live-123";
const REFUSAL = `PLUGIN_HOOK_FAILED: a site plugin (${PLUGIN_ID}) refused this save; the content was not saved`;

function refusingHook(): BeforeSaveHookPort {
  const registry = createHookRegistry({ pluginSdkBinding: pluginHostBinding.pluginSdkBinding });
  registry.attach({ pluginId: PLUGIN_ID, source: "site", filter: async () => {
    throw new Error(RAW_PLUGIN_TEXT);
  }, declaredFields: [] });
  return (entry) => registry.runBeforeSave({ entry });
}

/** A hook port whose behavior a case swaps mid-test; starts as "no plugin contributes a patch". */
function switchableHook() {
  const state: { current: BeforeSaveHookPort } = { current: async () => ({}) };
  return { state, port: ((entry) => state.current(entry)) as BeforeSaveHookPort };
}

function makeRouteDeps(hook: BeforeSaveHookPort): WidgetsToolDeps {
  let counter = 0;
  const widgetTrash = memoryWidgetTrash();
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    outbox: { enqueue: async () => undefined } as unknown as WidgetsToolDeps["outbox"],
    entryRepo: widgetTrash.entryRepo,
    removeWidget: widgetTrash.remove,
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    widgetBindingRepo: new InMemoryWidgetRegionBindingRepo(),
    postRepo: new InMemoryPostRepo(),
    forgetRemovedPost: async () => {},
    changeSets: new InMemoryChangeSetRepo(),
    pluginBeforeSaveHook: hook,
    authorize: PRE_AUTHORIZED,
  };
}

async function buildHarness(routeDeps: WidgetsToolDeps) {
  const registry = createToolRegistry({});
  for (const registration of buildWidgetsRegistrations(routeDeps)) registry.register(registration);
  const toolExecutor = createToolExecutor({ registry });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  return { run, lifecycle, toolExecutor, resolvePrincipal: () => ({ id: "principal-1" }) };
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

let toolUseCounter = 0;

async function call(harness: Harness, toolId: string, input: unknown) {
  return delegatedToolExecuteRoute.handle({ input: { runId: harness.run.id, toolUseId: `tu-${++toolUseCounter}`, toolId, input }, deps: harness });
}

/** A post host carrying one real embed (placed while the hook passes), then the hook switched to refuse. */
async function hostWithOneEmbed() {
  const hook = switchableHook();
  const routeDeps = makeRouteDeps(hook.port);
  await routeDeps.postRepo.save({
    id: "post-1", workspaceId: WORKSPACE_ID, title: "Host Post", slug: "host-post-1",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [] }] }, bodyFormat: "doc", bodyHtml: null,
    status: "draft", kind: "post", updatedAt: NOW, version: 1,
  } as PostRecord as never);
  const harness = await buildHarness(routeDeps);
  const created = await call(harness, "widgets_create_instance", { widgetType: "text", title: "Sidebar note", config: { body: "hi" } });
  assert.equal(created.ok, true, `setup: widgets_create_instance failed: ${JSON.stringify(created)}`);
  if (!created.ok) throw new Error("unreachable");
  const widgetId = (created.value.result.output as { instance: { id: string } }).instance.id;
  const placed = await call(harness, "widgets_insert_embed", { hostEntryId: "post-1", baseVersion: 1, widgetEntryId: widgetId });
  assert.equal(placed.ok, true, `setup: widgets_insert_embed failed: ${JSON.stringify(placed)}`);
  if (!placed.ok) throw new Error("unreachable");
  const placementId = (placed.value.result.output as { placementId: string }).placementId;
  const before = structuredClone(await routeDeps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }));
  assert.equal(before?.version, 2);
  return { hook, routeDeps, harness, widgetId, placementId, before };
}

/** The model sees the fixed refusal naming the plugin, and none of the plugin's own text. */
function assertRefusal(result: Awaited<ReturnType<typeof call>>): void {
  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.deepEqual({ code: result.error.code, message: result.error.message }, { code: "BAD_REQUEST", message: REFUSAL });
  const wire = JSON.stringify(result);
  for (const fragment of [RAW_PLUGIN_TEXT, "SQLITE_CORRUPT", "/Users/owner", "sk-live-123", "beforeSave filter failed"]) {
    assert.equal(wire.includes(fragment), false, `leaked ${fragment}: ${wire}`);
  }
}

const REFUSED_CALLS: Array<[string, (setup: Awaited<ReturnType<typeof hostWithOneEmbed>>) => unknown]> = [
  ["widgets_insert_embed", ({ widgetId }) => ({ hostEntryId: "post-1", baseVersion: 2, widgetEntryId: widgetId })],
  ["widgets_remove_embed", ({ placementId }) => ({ hostEntryId: "post-1", baseVersion: 2, placementId })],
  ["widgets_reorder_embeds", ({ widgetId }) => ({ hostEntryId: "post-1", baseVersion: 2, orderedWidgetEntryIds: [widgetId] })],
];

for (const [toolId, inputFor] of REFUSED_CALLS) {
  test(`${toolId} on a post host refused by a plugin hook says PLUGIN_HOOK_FAILED with the plugin id, saves nothing`, async () => {
    const setup = await hostWithOneEmbed();
    setup.hook.state.current = refusingHook();

    const result = await call(setup.harness, toolId, inputFor(setup));

    assertRefusal(result);
    assert.deepEqual(await setup.routeDeps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }), setup.before);
  });
}

test("widgets_insert_embed: a hook port throwing anything other than PluginHookFailedError stays a redacted INTERNAL_ERROR", async () => {
  const setup = await hostWithOneEmbed();
  setup.hook.state.current = async () => {
    throw new Error(RAW_PLUGIN_TEXT);
  };

  const result = await call(setup.harness, "widgets_insert_embed", { hostEntryId: "post-1", baseVersion: 2, widgetEntryId: setup.widgetId });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(result).includes("SQLITE_CORRUPT"), false);
  assert.deepEqual(await setup.routeDeps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }), setup.before);
});
