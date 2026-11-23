import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import {
  registerAdminRedirectGetRoute,
  registerAdminRedirectHitsRoute,
  registerAdminRedirectImportRoute,
  registerAdminRedirectListRoute,
  registerAdminRedirectTombstoneRoute,
  registerAdminRedirectUpdateRoute,
  type RedirectRouteDeps,
} from "#src/server/runtime/composition/modules/redirects";
import { createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * The redirects routes moved to Jini specs mounted through the admin ports. Before the move, the
 * by-id routes (get, hits, update, tombstone) passed the requested `entityId` to `deps.authorize`;
 * list and import act on no single rule and never did. These mounted requests pin both halves.
 * The authorizer refuses, so no handler reaches a repo: only the authorization call is observed.
 */
async function serve() {
  const calls: Array<Record<string, unknown>> = [];
  const deps: RedirectRouteDeps = {
    ...createRouteDeps(),
    workspaceId: "ws-1",
    authorize: async (params) => { calls.push({ ...params }); return { allowed: false, reason: "pinned" }; },
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  for (const register of [registerAdminRedirectListRoute, registerAdminRedirectImportRoute, registerAdminRedirectGetRoute,
    registerAdminRedirectUpdateRoute, registerAdminRedirectTombstoneRoute, registerAdminRedirectHitsRoute]) register({ app, deps });
  return { app, calls };
}

const MANAGE = { principalId: "test-principal", permission: "admin.redirects.manage", workspaceId: "ws-1", entityType: "redirect" };

test("redirects by-id routes hand the requested id to the authorizer", async (t) => {
  const { app, calls } = await serve();
  const base = await startTestServer(app, t);
  const rule = `${base}/api/admin/v1/workspaces/ws-1/redirects/red-42`;
  const requests: Array<[string, RequestInit]> = [
    [rule, { method: "GET" }],
    [`${rule}/hits`, { method: "GET" }],
    [rule, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ toTarget: "/x" }) }],
    [rule, { method: "DELETE" }],
  ];
  for (const [url, init] of requests) {
    calls.length = 0;
    const res = await fetch(url, init);
    assert.equal(res.status, 403, `${init.method} ${url}`);
    assert.deepEqual(calls, [{ ...MANAGE, entityId: "red-42" }], `${init.method} ${url}`);
  }
});

test("redirects list and import stay id-free", async (t) => {
  const { app, calls } = await serve();
  const base = await startTestServer(app, t);
  const collection = `${base}/api/admin/v1/workspaces/ws-1/redirects`;
  const requests: Array<[string, RequestInit]> = [
    [collection, { method: "GET" }],
    [`${collection}/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rules: [{ fromPattern: "/a", toTarget: "/b" }] }) }],
  ];
  for (const [url, init] of requests) {
    calls.length = 0;
    const res = await fetch(url, init);
    assert.equal(res.status, 403, `${init.method} ${url}`);
    assert.deepEqual(calls, [MANAGE], `${init.method} ${url}`);
  }
});
