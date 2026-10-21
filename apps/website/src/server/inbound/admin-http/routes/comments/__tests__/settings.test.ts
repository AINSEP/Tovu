import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createCapturingResponse, extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminCommentsGetSettingsRoute } from "../get-settings.js";
import { registerAdminCommentsPutSettingsRoute } from "../put-settings.js";
import type { CommentsModerationRouteDeps } from "../deps.js";

/**
 * @file Branches of `get-settings.ts`/`put-settings.ts` that `comments-settings-routes.test.ts`
 * does not reach: the workspace-mismatch 404 (which must fire before `authorize()` or the settings
 * ledger is touched) and the catch-all 500 on both verbs — including that a non-validation failure
 * during PUT is a 500, not mis-mapped to the 400 reserved for `CommentsSettingsValidationError`.
 */

const WORKSPACE_ID = "workspace-local";
const PATH = (ws: string) => `/api/admin/v1/workspaces/${ws}/comments/settings`;

function buildApp(overrides: Partial<CommentsModerationRouteDeps> = {}): {
  app: express.Express;
  authorizeCalls: unknown[];
} {
  const base = createRouteDeps();
  const authorizeCalls: unknown[] = [];
  const deps: CommentsModerationRouteDeps = {
    ...base,
    authorize: async (input) => {
      authorizeCalls.push(input);
      return { allowed: true, reason: "matched" };
    },
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminCommentsGetSettingsRoute(app, deps);
  registerAdminCommentsPutSettingsRoute(app, deps);
  return { app, authorizeCalls };
}

test("comments settings: a workspace id that is not this site's is 404 on GET and PUT, before authorize() runs", async (t) => {
  const { app, authorizeCalls } = buildApp();
  const baseUrl = await startTestServer(app, t);

  const getRes = await fetch(`${baseUrl}${PATH("not-this-site")}`);
  assert.equal(getRes.status, 404);
  assert.deepEqual(await getRes.json(), { error: "workspace was not found" });

  const putRes = await fetch(`${baseUrl}${PATH("not-this-site")}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requireModeration: false }),
  });
  assert.equal(putRes.status, 404);
  assert.deepEqual(await putRes.json(), { error: "workspace was not found" });

  assert.equal(authorizeCalls.length, 0);
});

test("comments settings: the gate checks comments.configure on the comments-settings entity", async (t) => {
  const { app, authorizeCalls } = buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`);
  assert.equal(res.status, 200);
  assert.deepEqual(authorizeCalls[0], {
    principalId: "test-principal",
    permission: "comments.configure",
    workspaceId: WORKSPACE_ID,
    entityType: "comments-settings",
  });
});

test("comments settings: an unexpected failure is a 500 INTERNAL_ERROR on GET and PUT, never a leaked message or a 400", async (t) => {
  const { app } = buildApp({
    // Every ledger method throws — whichever one the settings service reaches first.
    settingsRepo: new Proxy(
      {},
      {
        get: (_target, prop) =>
          prop === "then"
            ? undefined
            : async () => {
                throw new Error("ledger exploded at /var/secret");
              },
      }
    ) as CommentsModerationRouteDeps["settingsRepo"],
  });
  const baseUrl = await startTestServer(app, t);

  const getRes = await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`);
  assert.equal(getRes.status, 500);
  assert.deepEqual(await getRes.json(), { error: "internal error", code: "INTERNAL_ERROR" });

  const putRes = await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requireModeration: false }),
  });
  assert.equal(putRes.status, 500);
  assert.deepEqual(await putRes.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("comments settings: a PUT with no request body is an empty patch — it echoes the stored settings unchanged", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);

  const before = await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`);
  assert.equal(before.status, 200);
  const stored = (await before.json()) as { data: unknown };

  // No content-type and no body: express.json() skips it and hands the route an empty object.
  const putRes = await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`, { method: "PUT" });
  assert.equal(putRes.status, 200);
  assert.deepEqual(((await putRes.json()) as { data: unknown }).data, stored.data);
});

test("comments settings: a host that mounts PUT without any JSON parser still gets an empty patch, not a 500", async (t) => {
  const deps: CommentsModerationRouteDeps = { ...createRouteDeps(), authorize: async () => ({ allowed: true, reason: "matched" }) };
  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminCommentsGetSettingsRoute(app, deps);
  registerAdminCommentsPutSettingsRoute(app, deps);
  const baseUrl = await startTestServer(app, t);

  const stored = (await (await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`)).json()) as { data: unknown };
  const putRes = await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requireModeration: false }),
  });
  assert.equal(putRes.status, 200);
  // The unparsed body is never read as a patch: the stored settings come back unchanged.
  assert.deepEqual(((await putRes.json()) as { data: unknown }).data, stored.data);
});

/**
 * `String(req.params.workspaceId ?? "")` (extractRouteHandler's own doc, `helpers/http-test-server.ts`):
 * Express guarantees a matched `:workspaceId` is always populated, so the right side of that `??` is
 * unreachable through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as
 * "unreachable dead code" -- the repo's established answer is to KEEP the guard and exercise it with a
 * hand-built `req` that deliberately violates that contract.
 */
for (const method of ["get", "put"] as const) {
  test(`comments settings ${method.toUpperCase()}: \`req.params.workspaceId ?? ""\` fallback, forced via a direct handler call, is the workspace 404 before authorize()`, async () => {
    const { app, authorizeCalls } = buildApp();
    const handler = extractRouteHandler(app, method, "/api/admin/v1/workspaces/:workspaceId/comments/settings");
    const { res, capture } = createCapturingResponse();

    await handler({ params: {}, body: { requireModeration: false } }, res);

    assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
    assert.equal(authorizeCalls.length, 0);
  });
}
