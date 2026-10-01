import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
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
