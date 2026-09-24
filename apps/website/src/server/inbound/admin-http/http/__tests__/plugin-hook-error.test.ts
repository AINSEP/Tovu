import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { PluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";
import { sendPluginHookFailedError } from "../plugin-hook-error.js";

/**
 * @file P0c (hooks v2 plan, 2026-09-23) — `PluginHookFailedError`'s own doc comment has always
 * claimed it is "mapped to 500 `PLUGIN_HOOK_FAILED`" by its caller, but before this fix no route
 * actually did: `sendPostCreateError`/`sendPostUpdateError` both fell through to the generic
 * `{error:"internal error"}` 500 with no `code`, indistinguishable from any other server bug.
 */

function capturingResponse(): { res: { status(code: number): unknown; json(body: unknown): unknown }; statusCode: () => number | undefined; jsonBody: () => unknown } {
  let statusCode: number | undefined;
  let jsonBody: unknown;
  const res = {
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
  const handled = sendPluginHookFailedError(res, new PluginHookFailedError("word-count", "boom"));

  assert.equal(handled, true);
  assert.equal(statusCode(), 500);
  assert.deepEqual(jsonBody(), { error: "boom", code: "PLUGIN_HOOK_FAILED", pluginId: "word-count" });
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
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

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
