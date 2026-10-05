import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { PluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file Pages arm of the P0c fix (`plugin-hook-error.ts`). `pages/create.ts` and `pages/update.ts`
 * run the same `pluginBeforeSaveHook` as the posts routes (a page is a `post` row with
 * `kind: "page"`), but their local error mappers never called `sendPluginHookFailedError`, so a
 * plugin hook failure on a page reached the admin client as a bare `{error:"internal error"}` 500
 * while the identical failure on a post carried `PLUGIN_HOOK_FAILED` and the plugin id. These pin
 * the page routes to the exact body `plugin-hook-error.test.ts` pins for posts.
 */

test("HTTP: creating a page through a throwing beforeSave filter returns 500 PLUGIN_HOOK_FAILED, not a bare 'internal error'", async (t) => {
  const deps = createRouteDeps();
  deps.pluginBeforeSaveHook = async () => {
    throw new PluginHookFailedError("throwing-plugin", "create filter failed: boom");
  };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/pages`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Blocked page", status: "draft", bodyJson: { type: "doc", content: [] } }),
  });

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "create filter failed: boom", code: "PLUGIN_HOOK_FAILED", pluginId: "throwing-plugin" });
});

test("HTTP: updating a page through a throwing beforeSave filter returns PLUGIN_HOOK_FAILED and leaves the stored page unchanged", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/pages`;
  const created = await fetch(base, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Original page", status: "draft", bodyJson: { type: "doc", content: [] } }),
  });
  assert.equal(created.status, 201);
  const { post } = (await created.json()) as { post: { id: string } };
  const before = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: post.id });
  assert.ok(before);
  deps.pluginBeforeSaveHook = async () => {
    throw new PluginHookFailedError("throwing-plugin", "update filter failed: boom");
  };

  // A fully valid PUT, so the failure exercises the plugin error mapping rather than validation.
  const updated = await fetch(`${base}/${post.id}`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Blocked update",
      slug: before.slug,
      status: before.status,
      expectedVersion: before.version,
      bodyJson: { type: "doc", content: [] },
    }),
  });

  assert.equal(updated.status, 500);
  assert.deepEqual(await updated.json(), { error: "update filter failed: boom", code: "PLUGIN_HOOK_FAILED", pluginId: "throwing-plugin" });
  assert.deepEqual(await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: post.id }), before);
});
