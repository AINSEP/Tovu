import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
/**
 * @file RED regression suite (2026-10-05): a site plugin's `content.entry.beforeSave` refusal
 * reached the model as a redacted `INTERNAL_ERROR`, so the model could not tell the user that a
 * plugin — not a crash — blocked the save.
 *
 * Driven through the REAL delegated-tool-call transport (`delegatedToolExecuteRoute` over a real
 * `ToolRegistry`/`ToolExecutor`), same as `tool-registrations.model-facing-errors.test.ts`: the
 * redaction lives in the transport, so a handler-level `assert.rejects` would pass against the bug.
 * The hook is the REAL `createHookRegistry().runBeforeSave` with one attached filter that throws a
 * message full of internals, so what is asserted is what a plugin failure actually produces.
 *
 * RED before the fix: every save case below answered
 * `{ code: "INTERNAL_ERROR", message: "an internal error occurred" }`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createHookRegistry } from "@jini-ai/plugins/host";
import { InMemoryPostRepo } from "../repo.memory.js";
import type { BeforeSaveHookPort } from "../post.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const WORKSPACE_ID = "ws-post-plugin-hook";
const NOW = "2026-10-05T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };
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

function makeDeps(hook: BeforeSaveHookPort) {
  let counter = 0;
  const postRepo = new InMemoryPostRepo();
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    postSearch: { search: async () => [] },
    pluginBeforeSaveHook: hook,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

let toolUseCounter = 0;

async function call(deps: PostToolDeps, toolId: string, input: unknown) {
  const registry = createToolRegistry({});
  for (const registration of buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) })) {
    registry.register(registration);
  }
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  const harness = { run, lifecycle, toolExecutor: createToolExecutor({ registry }), resolvePrincipal: () => ({ id: "p" }) };
  return delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: `tu-${++toolUseCounter}`, toolId, input },
    deps: harness as never,
  });
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

for (const kind of ["post", "page"] as const) {
  test(`content_post_create (${kind}) refused by a plugin hook says PLUGIN_HOOK_FAILED with the plugin id, saves nothing`, async () => {
    const { deps, postRepo } = makeDeps(refusingHook());

    const result = await call(deps, "content_post_create", { kind, title: "Hello", slug: "hello", bodyJson: EMPTY_DOC, status: "draft" });

    assertRefusal(result);
    assert.deepEqual(await postRepo.list({ workspaceId: WORKSPACE_ID }), []);
  });

  test(`content_post_update (${kind}) refused by a plugin hook says PLUGIN_HOOK_FAILED with the plugin id, saves nothing`, async () => {
    const { deps, postRepo } = makeDeps(refusingHook());
    const seeded = {
      id: "p1", workspaceId: WORKSPACE_ID, title: "Before", slug: "before", bodyJson: EMPTY_DOC,
      status: "draft", kind, updatedAt: NOW, version: 1,
    };
    await postRepo.save(seeded as never);

    const result = await call(deps, "content_post_update", { id: "p1", kind, title: "After" });

    assertRefusal(result);
    const stored = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "p1" });
    assert.equal(stored?.title, "Before");
    assert.equal(stored?.version, 1);
  });
}

test("a hook port throwing anything other than PluginHookFailedError stays a redacted INTERNAL_ERROR", async () => {
  const { deps } = makeDeps(async () => {
    throw new Error(RAW_PLUGIN_TEXT);
  });

  const result = await call(deps, "content_post_create", { kind: "post", title: "Hello", slug: "hello", bodyJson: EMPTY_DOC, status: "draft" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(result).includes("SQLITE_CORRUPT"), false);
});
