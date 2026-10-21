import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminThemeDuplicateRoute } from "../duplicate.js";
import type { ContentRouteDeps } from "../../content/deps.js";

/**
 * @file `POST .../themes/:themeId/duplicate` (`registerAdminThemeDuplicateRoute`) — the Themes
 * screen's Duplicate action over the same `duplicateDiscoveredTheme` service `theme_duplicate`
 * calls. Bare app + stubbed principal, over a scratch themes root holding a copy of a real stock theme.
 */

const WORKSPACE_ID = "workspace-local";
const REPO_THEMES = path.resolve(import.meta.dirname, "../../../../../../../../../content/themes");
const SOURCE_ID = "basic-declarative";

function buildApp(options: { allowed?: boolean; permissions?: string[] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-duplicate-route-"));
  fs.cpSync(path.join(REPO_THEMES, "declarative", SOURCE_ID), path.join(root, "declarative", SOURCE_ID), { recursive: true });
  const themes = discoverAllBuiltInThemes({ dir: root, source: "built-in" });
  const permissions: string[] = options.permissions ?? [];
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async (req: { permission: string }) => {
      permissions.push(req.permission);
      return options.allowed === false ? { allowed: false, reason: "no-grant" } : { allowed: true, reason: "matched" };
    },
    themes,
    themesDir: root,
  } as unknown as ContentRouteDeps;
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDuplicateRoute(app, deps);
  return { app, root, themes, permissions };
}

async function post(t: import("node:test").TestContext, app: express.Express, options: { themeId?: string; workspaceId?: string; body?: unknown } = {}) {
  const baseUrl = await startTestServer(app, t);
  const url = `${baseUrl}/api/admin/v1/workspaces/${options.workspaceId ?? WORKSPACE_ID}/themes/${encodeURIComponent(options.themeId ?? SOURCE_ID)}/duplicate`;
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(options.body ?? {}) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

test("duplicate: 201 with the copy's identity, the copy is live in deps.themes, and theme.edit was checked", async (t) => {
  const { app, root, themes, permissions } = buildApp();
  const { status, json } = await post(t, app, { body: { newName: "Basic Declarative copy" } });
  assert.equal(status, 201);
  assert.deepEqual(json.theme, { id: "basic-declarative-copy", name: "Basic Declarative copy", tier: "declarative", status: "valid", errors: [] });
  assert.equal(json.sourceThemeId, SOURCE_ID);
  assert.deepEqual(json.availableThemeIds, ["basic-declarative", "basic-declarative-copy"]);
  assert.ok(themes.some((theme) => theme.manifest.id === "basic-declarative-copy"));
  assert.ok(fs.existsSync(path.join(root, "declarative", "basic-declarative-copy", "theme.json")));
  assert.deepEqual(permissions, ["theme.edit"]);
});

test("duplicate: an explicit newId is honored", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, { body: { newName: "Roastery", newId: "roast" } });
  assert.equal(status, 201);
  assert.equal((json.theme as { id: string }).id, "roast");
});

test("duplicate: a taken newId is a 409 ID_TAKEN", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, { body: { newName: "X", newId: SOURCE_ID } });
  assert.equal(status, 409);
  assert.equal(json.code, "ID_TAKEN");
});

test("duplicate: a traversal newId is a 400 INVALID_ID and writes nothing", async (t) => {
  const { app, root } = buildApp();
  const before = fs.readdirSync(path.join(root, "declarative"));
  const { status, json } = await post(t, app, { body: { newName: "X", newId: "../../escape" } });
  assert.equal(status, 400);
  assert.equal(json.code, "INVALID_ID");
  assert.deepEqual(fs.readdirSync(path.join(root, "declarative")), before);
  assert.deepEqual(fs.readdirSync(root), ["declarative"]);
});

test("duplicate: a missing newName is a 400 INVALID_NAME", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, { body: {} });
  assert.equal(status, 400);
  assert.equal(json.code, "INVALID_NAME");
});

test("duplicate: an unknown source theme is a 404 SOURCE_NOT_FOUND", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, { themeId: "nope", body: { newName: "X" } });
  assert.equal(status, 404);
  assert.equal(json.code, "SOURCE_NOT_FOUND");
});

test("duplicate: a principal without theme.edit gets a 403 and nothing is copied", async (t) => {
  const { app, root } = buildApp({ allowed: false });
  const { status, json } = await post(t, app, { body: { newName: "X" } });
  assert.equal(status, 403);
  assert.equal(json.code, "FORBIDDEN");
  assert.deepEqual(fs.readdirSync(path.join(root, "declarative")), [SOURCE_ID]);
});

test("duplicate: a mismatched workspace id is a 404", async (t) => {
  const { app } = buildApp();
  const { status } = await post(t, app, { workspaceId: "other", body: { newName: "X" } });
  assert.equal(status, 404);
});

test("duplicate: an unreadable source manifest is a 400 BAD_MANIFEST", async (t) => {
  const { app, themes } = buildApp();
  const source = themes.find((theme) => theme.manifest.id === SOURCE_ID)!;
  fs.writeFileSync(path.join(source.dir, "theme.json"), "[]");
  const { status, json } = await post(t, app, { body: { newName: "Broken" } });
  assert.equal(status, 400);
  assert.equal(json.code, "BAD_MANIFEST");
});

test("duplicate: an unexpected failure is a bare 500", async (t) => {
  const failing = express();
  failing.use(express.json());
  failing.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminThemeDuplicateRoute(failing, {
    workspaceId: WORKSPACE_ID,
    authorize: async () => {
      throw new Error("authorizer offline");
    },
    themes: [],
    themesDir: "/nonexistent",
  } as unknown as ContentRouteDeps);
  const { status, json } = await post(t, failing, { body: { newName: "X" } });
  assert.equal(status, 500);
  assert.deepEqual(json, { error: "internal error" });
});

for (const newId of [undefined, "", null, 42]) {
  test(`duplicate: newId ${JSON.stringify(newId)} uses the name-derived id`, async (t) => {
    const { app, root } = buildApp();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const { status, json } = await post(t, app, { body: { newName: "Pinned Copy", newId } });
    assert.equal(status, 201);
    assert.equal((json.theme as { id: string }).id, "pinned-copy");
  });
}

for (const body of [[], { newName: null }, { newName: "" }]) {
  test(`duplicate: ${JSON.stringify(body)} retains INVALID_NAME refusal`, async (t) => {
    const { app, root } = buildApp();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const { status, json } = await post(t, app, { body });
    assert.equal(status, 400);
    assert.equal(json.code, "INVALID_NAME");
  });
}

test("duplicate: a non-string newName is stringified before validation", async (t) => {
  const { app, root } = buildApp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { status, json } = await post(t, app, { body: { newName: 123 } });
  assert.equal(status, 201);
  assert.equal((json.theme as { name: string }).name, "123");
});


test("duplicate: a missing source parameter is normalized to the empty id", async (t) => {
  const { app, root } = buildApp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let status: number | undefined;
  let body: unknown;
  const res = {
    locals: { principal: { id: "test-principal" } },
    status(value: number) { status = value; return res; },
    json(value: unknown) { body = value; return res; },
  };
  await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/themes/:themeId/duplicate")(
    { params: { workspaceId: WORKSPACE_ID }, body: { newName: "X" } }, res as never,
  );
  assert.equal(status, 404);
  assert.equal((body as { code: string }).code, "SOURCE_NOT_FOUND");
});

// Route-param guard (`String(req.params.workspaceId ?? "")`): an absent workspace param reads as "" and 404s.
test("duplicate: a missing workspace parameter is normalized to the empty id and 404s before authorizing", async (t) => {
  const { app, root, permissions } = buildApp();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let status: number | undefined;
  let body: unknown;
  const res = {
    locals: { principal: { id: "test-principal" } },
    status(value: number) { status = value; return res; },
    json(value: unknown) { body = value; return res; },
  };
  await extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/themes/:themeId/duplicate")(
    { params: {}, body: { newName: "X" } }, res as never,
  );
  assert.equal(status, 404);
  assert.deepEqual(body, { error: "workspace was not found" });
  assert.deepEqual(permissions, []);
});
