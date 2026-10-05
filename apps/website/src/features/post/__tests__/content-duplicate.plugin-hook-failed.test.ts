/**
 * @file RED regression suite (2026-10-05): `content_duplicate` over a `post`/`page` source runs
 * `createPost`'s plugin `content.entry.beforeSave` hook (`duplicatePostOrPage`), but the
 * content-duplication domain did not wrap its handler with `withPluginHookRefusals` — so a plugin
 * refusal there reached the model as a redacted `INTERNAL_ERROR`, unlike `content_post_create`/
 * `content_post_update` (fixed in 8a2f75bf8, `tool-registrations.plugin-hook-failed.test.ts`).
 *
 * Driven through the REAL delegated-tool-call transport for the same reason as that suite: the
 * redaction lives in the transport, so a handler-level `assert.rejects` would pass against the bug.
 * The hook is the REAL `createHookRegistry().runBeforeSave` with one attached filter that throws a
 * message full of internals, and the resource handlers are this domain's REAL
 * `contributePostDuplicateHandlers`, so the copy actually reaches `createPost`.
 *
 * RED before the fix: both duplicate cases answered
 * `{ code: "INTERNAL_ERROR", message: "an internal error occurred" }`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { delegatedToolExecuteRoute } from "@jini-ai/daemon/http";

import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildContentDuplicationRegistrations } from "#src/features/content-duplication/tool-registrations";
import { createHookRegistry } from "#src/features/plugin-runtime/hook-registry";
import { InMemoryPostRepo } from "../repo.memory.js";
import type { BeforeSaveHookPort } from "../post.js";
import { contributePostDuplicateHandlers } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-duplicate-plugin-hook";
const NOW = "2026-10-05T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };
const PLUGIN_ID = "seo-helper";
/** Everything a plugin's own error text could carry that must never reach the model. */
const RAW_PLUGIN_TEXT = "SQLITE_CORRUPT reading /Users/owner/site/.tovu/data.sqlite with token=sk-live-123";
const REFUSAL = `PLUGIN_HOOK_FAILED: a site plugin (${PLUGIN_ID}) refused this save; the content was not saved`;

function refusingHook(): BeforeSaveHookPort {
  const registry = createHookRegistry();
  registry.attach(PLUGIN_ID, "site", async () => {
    throw new Error(RAW_PLUGIN_TEXT);
  }, []);
  return registry.runBeforeSave;
}

/** Deps carrying one seeded source row of `kind`, so the only thing that can refuse is the hook. */
async function makeDeps(hook: BeforeSaveHookPort, kind: "post" | "page") {
  let counter = 0;
  const postRepo = new InMemoryPostRepo();
  await postRepo.save({
    id: "source-1", workspaceId: WORKSPACE_ID, title: "Landing", slug: "landing", bodyJson: EMPTY_DOC,
    bodyFormat: "doc", bodyHtml: null, status: "draft", kind, updatedAt: NOW, version: 1,
  } as never);
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse(NOW) },
    idGen: { newId: () => `id-${++counter}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    pluginBeforeSaveHook: hook,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as AssistantToolRegistryDeps;
  return { deps, postRepo };
}

let toolUseCounter = 0;

async function duplicate(deps: AssistantToolRegistryDeps, input: unknown) {
  const registry = createToolRegistry({});
  for (const registration of buildContentDuplicationRegistrations(deps, { listResourceHandlers: contributePostDuplicateHandlers })) {
    registry.register(registration);
  }
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const { run } = await lifecycle.start({ contextRef: "ctx-1" });
  const harness = { run, lifecycle, toolExecutor: createToolExecutor({ registry }), resolvePrincipal: () => ({ id: "p" }) };
  return delegatedToolExecuteRoute.handle({
    input: { runId: run.id, toolUseId: `tu-${++toolUseCounter}`, toolId: "content_duplicate", input },
    deps: harness as never,
  });
}

for (const kind of ["post", "page"] as const) {
  test(`content_duplicate (${kind}) refused by a plugin hook says PLUGIN_HOOK_FAILED with the plugin id, saves nothing`, async () => {
    const { deps, postRepo } = await makeDeps(refusingHook(), kind);

    const result = await duplicate(deps, { resource: kind, id: "source-1" });

    assert.equal(result.ok, false, JSON.stringify(result));
    if (result.ok) return;
    assert.deepEqual({ code: result.error.code, message: result.error.message }, { code: "BAD_REQUEST", message: REFUSAL });
    const wire = JSON.stringify(result);
    for (const fragment of [RAW_PLUGIN_TEXT, "SQLITE_CORRUPT", "/Users/owner", "sk-live-123", "beforeSave filter failed"]) {
      assert.equal(wire.includes(fragment), false, `leaked ${fragment}: ${wire}`);
    }
    // Only the seeded source remains — no copy row was written.
    assert.deepEqual((await postRepo.list({ workspaceId: WORKSPACE_ID })).map((row) => row.id), ["source-1"]);
  });
}

test("content_duplicate: a hook port throwing anything other than PluginHookFailedError stays a redacted INTERNAL_ERROR", async () => {
  const { deps, postRepo } = await makeDeps(async () => {
    throw new Error(RAW_PLUGIN_TEXT);
  }, "post");

  const result = await duplicate(deps, { resource: "post", id: "source-1" });

  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) return;
  assert.equal(result.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(result).includes("SQLITE_CORRUPT"), false);
  assert.deepEqual((await postRepo.list({ workspaceId: WORKSPACE_ID })).map((row) => row.id), ["source-1"]);
});
