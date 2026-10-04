import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemesListRoute } from "../list.js";

function theme(id: string, source: string, errors: string[] = []) {
  return { manifest: { id, name: `Theme ${id}`, version: "2.3.4" }, source, status: errors.length ? "invalid" : "valid", errors };
}
async function invoke(themes: unknown[], settings: unknown, fail = false) {
  const app = express();
  registerAdminThemesListRoute(app, {
    workspaceId: "ws-7", themes, authorize: async () => ({ allowed: true, reason: "matched" }),
    presentationRepo: { findByWorkspaceId: async (required: { workspaceId: string }) => {
      assert.deepEqual(required, { workspaceId: "ws-7" }); if (fail) throw new Error("secret db failure"); return settings;
    } },
  } as any);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-7" };
  await extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/themes")({ params: { workspaceId: "ws-7" } }, res);
  return capture;
}
// F4.1/F4.3: source-rank inversion, dropping validator messages, or using the retired id literally must fail.
test("theme list sorts built-ins before site themes, maps errors, resolves retired active id, and preserves input order", async () => {
  const themes = [theme("a-site", "site", ["manifest broken", "missing index.html"]), theme("z-built", "built-in"), theme("tovu-theme", "site"), theme("b-built", "built-in")];
  const result = await invoke(themes, { activeThemeId: "basic" });
  assert.deepEqual(result, { statusCode: 200, jsonBody: { themes: [
    { id: "b-built", name: "Theme b-built", version: "2.3.4", source: "built-in", status: "valid", errors: [], active: false },
    { id: "z-built", name: "Theme z-built", version: "2.3.4", source: "built-in", status: "valid", errors: [], active: false },
    { id: "a-site", name: "Theme a-site", version: "2.3.4", source: "site", status: "invalid", errors: [
      { code: null, file: null, message: "manifest broken" }, { code: null, file: null, message: "missing index.html" },
    ], active: false },
    { id: "tovu-theme", name: "Theme tovu-theme", version: "2.3.4", source: "site", status: "valid", errors: [], active: true },
  ] } });
  assert.deepEqual(themes.map(t => t.manifest.id), ["a-site", "z-built", "tovu-theme", "b-built"]);
});
test("missing settings or an unknown stored theme leaves every theme inactive", async () => {
  for (const settings of [null, { activeThemeId: "unknown" }]) {
    assert.deepEqual(await invoke([theme("only", "site")], settings), { statusCode: 200, jsonBody: { themes: [
      { id: "only", name: "Theme only", version: "2.3.4", source: "site", status: "valid", errors: [], active: false },
    ] } });
  }
});
test("presentation read failure returns a generic error without leaking details", async () => {
  assert.deepEqual(await invoke([], null, true), { statusCode: 500, jsonBody: { error: "internal error" } });
});
