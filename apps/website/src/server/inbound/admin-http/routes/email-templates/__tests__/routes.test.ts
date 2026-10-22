import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { ContentRouteDeps } from "../../content/deps.js";
import { registerAdminEmailTemplateRoutes } from "../routes.js";

const WS = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WS}/email-templates`;
const HTML = '<html><head><meta name="email-fields" content="name=Ada"><title>Hi {{name}}</title></head><body><p onclick="x()">Hello {{name}}</p><script>x()</script></body></html>';

async function boot(t: TestContext, options: { granted?: ReadonlySet<string>; override?: Partial<ContentRouteDeps>; jsonParser?: boolean } = {}) {
  const granted = options.granted ?? new Set(["content.read", "pages.edit_html", "admin.forms.manage"]);
  const asked: string[] = [];
  const deps = {
    ...createRouteDeps(),
    authorize: async (request: { permission: string }) => {
      asked.push(request.permission);
      return granted.has(request.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "no grant" };
    },
    ...options.override,
  } as unknown as ContentRouteDeps;
  const app = express();
  if (options.jsonParser !== false) app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminEmailTemplateRoutes(app, deps);
  const baseUrl = await startTestServer(app, t);
  const send = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
  return { send, asked, deps };
}

test("create -> get -> edit -> list -> preview -> render, each behind its permission", async (t) => {
  const { send, asked } = await boot(t);
  const created = await send("POST", BASE, { name: "Welcome", html: HTML });
  assert.equal(created.status, 201);
  const id = String(created.json.id);
  assert.equal((await send("GET", `${BASE}/${id}`)).json.subject, "Hi {{name}}");
  const edited = await send("PUT", `${BASE}/${id}/html`, { html: HTML.replace("Hello", "Hey"), expectedVersion: created.json.version });
  assert.equal(edited.status, 200);
  assert.match(String(edited.json.html), /Hey/);
  const list = await send("GET", BASE);
  assert.deepEqual((list.json.templates as { id: string }[]).map((tpl) => tpl.id), [id]);
  const preview = await send("POST", `${BASE}/preview`, { id });
  assert.equal(preview.json.subject, "Hi Ada");
  assert.equal(preview.json.scriptsStripped, false);
  const rendered = await send("POST", `${BASE}/${id}/render`, { values: { name: "Bo" } });
  assert.deepEqual({ subject: rendered.json.subject, text: rendered.json.text, missingFields: rendered.json.missingFields }, { subject: "Hi Bo", text: "Hey Bo", missingFields: [] });
  assert.doesNotMatch(String(rendered.json.html), /script|onclick/);
  assert.deepEqual(asked, ["pages.edit_html", "content.read", "pages.edit_html", "content.read", "content.read", "admin.forms.manage"]);
});

test("render with no body renders every field empty; a non-object body reads as empty", async (t) => {
  const { send } = await boot(t);
  const id = String((await send("POST", BASE, { name: "W", html: HTML })).json.id);
  assert.deepEqual((await send("POST", `${BASE}/${id}/render`)).json.missingFields, ["name"]);
  assert.deepEqual((await send("POST", `${BASE}/${id}/render`, [1])).json.missingFields, ["name"]);
});

test("a principal without the permission gets 403 before any validation", async (t) => {
  const { send } = await boot(t, { granted: new Set(["content.read"]) });
  assert.equal((await send("POST", BASE, {})).status, 403);
  assert.equal((await send("POST", `${BASE}/x/render`, {})).status, 403);
});

test("a foreign workspace is 404 and nothing runs", async (t) => {
  const { send, asked } = await boot(t);
  assert.deepEqual(await send("GET", "/api/admin/v1/workspaces/other/email-templates"), { status: 404, json: { error: "workspace was not found" } });
  assert.deepEqual(asked, []);
});

test("operation failures map to 400 / 404 / 409, a trashed row to its not-live response, anything else to 500", async (t) => {
  const { send } = await boot(t);
  assert.equal((await send("POST", BASE, { html: HTML })).json.code, "VALIDATION_ERROR");
  assert.equal((await send("GET", `${BASE}/nope`)).json.code, "ENTRY_NOT_FOUND");
  const id = String((await send("POST", BASE, { name: "W", html: HTML })).json.id);
  const conflict = await send("PUT", `${BASE}/${id}/html`, { html: HTML, expectedVersion: 99 });
  assert.deepEqual([conflict.status, conflict.json.code], [409, "CONCURRENT_EDIT"]);
});

test("a real already-trashed template is not found by get/edit/preview", async (t) => {
  const { send, deps } = await boot(t);
  const created = await send("POST", BASE, { name: "Trashed", html: HTML }); const id = String(created.json.id);
  const row = await deps.postRepo.findById({ workspaceId: WS, id });
  await deps.postRepo.save({ ...row!, deletedAt: "2026-10-22T01:00:00Z" });
  for (const [method, path, body] of [["GET", `${BASE}/${id}`, undefined], ["PUT", `${BASE}/${id}/html`, { html: HTML }], ["POST", `${BASE}/preview`, { id }]] as const) {
    const response = await send(method, path, body); assert.equal(response.status, 404); assert.equal(response.json.code, "ENTRY_NOT_FOUND");
  }
});

test("trash between a successful lookup and real Pages store access returns not-live", async (t) => {
  const base = createRouteDeps(); let race = false;
  const r = await boot(t, { override: { ...base, pagesHtmlStore: scope => {
    const store = base.pagesHtmlStore(scope);
    return { ...store, read: async () => {
      if (race) { const row = await base.postRepo.findById({ workspaceId: WS, id: scope.postId }); await base.postRepo.save({ ...row!, deletedAt: "2026-10-22T01:00:00Z" }); }
      return store.read();
    }, capturedVersion: () => store.capturedVersion(), write: html => store.write(html), ensureHtmlFormat: seed => store.ensureHtmlFormat(seed) };
  } } });
  const id = String((await r.send("POST", BASE, { name: "Racy", html: HTML })).json.id); race = true;
  const response = await r.send("PUT", `${BASE}/${id}/html`, { html: HTML }); assert.equal(response.status, 409);
});

test("an unexpected listing failure is a bare 500", async (t) => {
  const broken = await boot(t, { override: { postRepo: { listHtmlByKind: async () => { throw new Error("disk"); } } as never } });
  assert.deepEqual(await broken.send("GET", BASE), { status: 500, json: { error: "internal error" } });
});
