import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { PluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";
import { sendPluginHookFailedError } from "../plugin-hook-error.js";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file P0c (hooks v2 plan, 2026-09-23) — `PluginHookFailedError`'s own doc comment has always
 * claimed it is "mapped to 500 `PLUGIN_HOOK_FAILED`" by its caller, but before this fix no route
 * actually did: `sendPostCreateError`/`sendPostUpdateError` both fell through to the generic
 * `{error:"internal error"}` 500 with no `code`, indistinguishable from any other server bug.
 */

/** Records `status().json()` calls; structurally a `PluginHookErrorResponse`, so no Express cast. */
interface CapturingRes {
  status(code: number): CapturingRes;
  json(body: unknown): CapturingRes;
}

function capturingResponse(): { res: CapturingRes; statusCode: () => number | undefined; jsonBody: () => unknown } {
  let statusCode: number | undefined;
  let jsonBody: unknown;
  const res: CapturingRes = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
      return res;
    },
  };
  return { res, statusCode: () => statusCode, jsonBody: () => jsonBody };
}

test("sendPluginHookFailedError: a PluginHookFailedError is mapped to 500 with code PLUGIN_HOOK_FAILED and the plugin id", () => {
  const { res, statusCode, jsonBody } = capturingResponse();
  const handled = sendPluginHookFailedError(res, new PluginHookFailedError("word-count", "provider request failed; token=sk-live-123"));

  assert.equal(handled, true);
  assert.equal(statusCode(), 500);
  // The registry's message quotes the plugin's own thrown error; only fixed text leaves the server.
  assert.deepEqual(jsonBody(), {
    error: "a site plugin (word-count) refused this save; the content was not saved",
    code: "PLUGIN_HOOK_FAILED",
    pluginId: "word-count",
  });
});

test("sendPluginHookFailedError: any other error is left unhandled (writes nothing, returns false)", () => {
  const { res, statusCode, jsonBody } = capturingResponse();
  const handled = sendPluginHookFailedError(res, new Error("not a plugin hook error"));

  assert.equal(handled, false);
  assert.equal(statusCode(), undefined);
  assert.equal(jsonBody(), undefined);
});

test("HTTP: creating a post through a throwing beforeSave filter returns 500 PLUGIN_HOOK_FAILED, not a bare 'internal error'", async (t) => {
  const deps = createRouteDeps();
  deps.pluginBeforeSaveHook = async () => {
    throw new PluginHookFailedError("throwing-plugin", "plugin 'throwing-plugin' content.entry.beforeSave filter failed: boom");
  };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/posts`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "Blocked post", status: "draft", bodyJson: { type: "doc", content: [] } }),
  });

  assert.equal(res.status, 500);
  const body = (await res.json()) as { code?: string; pluginId?: string };
  assert.equal(body.code, "PLUGIN_HOOK_FAILED");
  assert.equal(body.pluginId, "throwing-plugin");
});

test("HTTP: updating a post through a throwing beforeSave filter returns PLUGIN_HOOK_FAILED and leaves the stored post unchanged", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/posts`;
  const created = await fetch(base, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ title: "Original post", status: "draft", bodyJson: { type: "doc", content: [] } }) });
  assert.equal(created.status, 201);
  const { post } = await created.json() as { post: { id: string } };
  const before = await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: post.id });
  assert.ok(before);
  deps.pluginBeforeSaveHook = async () => { throw new PluginHookFailedError("throwing-plugin", "update filter failed: boom"); };
  // PUT validates the complete editable fields before invoking the hook; keep this request valid
  // so the failure exercises the plugin error mapping rather than input validation.
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
  assert.deepEqual(await updated.json(), { error: "a site plugin (throwing-plugin) refused this save; the content was not saved", code: "PLUGIN_HOOK_FAILED", pluginId: "throwing-plugin" });
  assert.deepEqual(await deps.postRepo.findById({ workspaceId: deps.workspaceId, id: post.id }), before);
});
