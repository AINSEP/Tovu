import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMarketplaceThemeDownloadRoute } from "../download.js";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The guard branches of `download.ts` that `marketplace-download-route.integration.test.ts`
 * does not reach: the workspace-mismatch 404 and the `theme.set` 403. Both must answer before the
 * installer runs — this route writes theme files to disk, so a missing gate is a write by an
 * unauthorized principal, not just a wrong status code. `themesDir` points at a path that does not
 * exist, so any call that slipped past the gate would surface as a non-403/404 status.
 */

const WORKSPACE_ID = "workspace-local";
const PATH = (ws: string) => `/api/admin/v1/workspaces/${ws}/marketplace/themes/aurora/download`;

function buildApp(allowed: boolean): { app: express.Express; authorizeCalls: Array<Record<string, unknown>> } {
  const base = createRouteDeps();
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const deps = {
    ...base,
    themesDir: "/nonexistent/b02-marketplace-download-guard",
    authorize: async (input: Record<string, unknown>) => {
      authorizeCalls.push(input);
      return allowed ? { allowed: true, reason: "matched" } : { allowed: false, reason: "no_grant" };
    },
  } as unknown as RouteDeps;

  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminMarketplaceThemeDownloadRoute(app, deps);
  return { app, authorizeCalls };
}

test("marketplace download: a workspace id that is not this site's is 404, before authorize() runs", async (t) => {
  const { app, authorizeCalls } = buildApp(true);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("other-ws")}`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
  assert.equal(authorizeCalls.length, 0);
});

test("marketplace download: a principal without theme.set is 403 FORBIDDEN naming the permission", async (t) => {
  const { app, authorizeCalls } = buildApp(false);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH(WORKSPACE_ID)}`, { method: "POST" });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    error: "principal 'test-principal' is not authorized for 'theme.set' (no_grant)",
    code: "FORBIDDEN",
    details: { permission: "theme.set", reason: "no_grant" },
  });
  assert.deepEqual(authorizeCalls, [
    { principalId: "test-principal", permission: "theme.set", workspaceId: WORKSPACE_ID, entityType: "presentation" },
  ]);
});
