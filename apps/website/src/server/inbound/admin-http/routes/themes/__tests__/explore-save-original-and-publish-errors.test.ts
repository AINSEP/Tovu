import assert from "node:assert/strict";
import test from "node:test";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemePagePublishRoute, registerAdminThemeSaveOriginalRoute } from "../explore.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * Save-as-original's access gate and both routes' generic failure envelope, driven by a
 * hand-written `authorize` port — the theme registry and files are never reached.
 */
const ROOT = "/api/admin/v1/workspaces/:workspaceId/themes/:themeId";
async function invoke(authorize: ContentRouteDeps["authorize"], suffix: "/original" | "/page/publish") {
  const app = express();
  const deps = portFake<ContentRouteDeps>({ workspaceId: "ws-1", authorize, themes: [], themesDir: "/nonexistent" });
  registerAdminThemeSaveOriginalRoute(app, deps);
  registerAdminThemePagePublishRoute(app, deps);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-1" };
  await extractRouteHandler(app, "post", `${ROOT}${suffix}`)({ params: { workspaceId: "ws-1", themeId: "plain" }, body: { page: "index", published: true } }, res);
  return capture;
}

test("save-as-original refuses a caller without theme.set with the standard 403", async () => {
  const capture = await invoke(async () => ({ allowed: false, reason: "no_grant" }), "/original");
  assert.equal(capture.statusCode, 403);
  assert.deepEqual((capture.jsonBody as { code: string; details: unknown }).code, "FORBIDDEN");
  assert.deepEqual((capture.jsonBody as { details: unknown }).details, { permission: "theme.set", reason: "no_grant" });
});

test("save-as-original and page publish hide an unexpected failure behind a bare 500", async () => {
  const offline: ContentRouteDeps["authorize"] = async () => { throw new Error("SECRET authorizer detail"); };
  for (const suffix of ["/original", "/page/publish"] as const) {
    assert.deepEqual(await invoke(offline, suffix), { statusCode: 500, jsonBody: { error: "internal error" } });
  }
});
