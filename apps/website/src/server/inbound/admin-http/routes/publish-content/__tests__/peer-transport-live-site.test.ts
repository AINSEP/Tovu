import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { canPublishToLive, PUBLISH_FROM_LIVE_SITE_ERROR } from "#src/features/publish-content/live-site-policy";
import type { HttpClientPort } from "#src/platform/http/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { PublishContentRouteDeps } from "../deps.js";
import { registerPublishContentPeerTransportRoutes } from "../peer-transport.js";

/**
 * @file The live site (`TOVU_RUNTIME_MODE=production`, set in `fly.toml`) has nowhere to publish
 * to — it IS the destination. The admin hides every Publish entry point there; these tests pin the
 * server-side refusal behind that, so a stale tab or a direct call cannot push from the live site.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/publish-content/peers/peer-1`;

test("canPublishToLive is false only when TOVU_RUNTIME_MODE is production", () => {
  assert.equal(canPublishToLive({ env: { TOVU_RUNTIME_MODE: "production" } }), false);
  assert.equal(canPublishToLive({ env: { TOVU_RUNTIME_MODE: "local" } }), true);
  assert.equal(canPublishToLive({ env: {} }), true);
});

function buildApp(): { app: express.Express; outbound: string[] } {
  const outbound: string[] = [];
  const httpClient: HttpClientPort = {
    send: async (request) => {
      outbound.push(request.url);
      throw new Error("the live site must never call out to a peer");
    },
  };
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    publishContentPeerHttpClient: httpClient,
  } as unknown as PublishContentRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    res.locals.authCredentialKind = "session";
    next();
  });
  registerPublishContentPeerTransportRoutes(app, deps);
  return { app, outbound };
}

for (const action of ["push/plan", "push/confirm", "push/execute"] as const) {
  test(`${action} is refused with 403 on the live site`, async (t) => {
    const previous = process.env.TOVU_RUNTIME_MODE;
    process.env.TOVU_RUNTIME_MODE = "production";
    t.after(() => {
      if (previous === undefined) delete process.env.TOVU_RUNTIME_MODE;
      else process.env.TOVU_RUNTIME_MODE = previous;
    });

    const { app, outbound } = buildApp();
    const server = await startTestServer(app, t);
    const res = await fetch(`${server}${BASE}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "p", planHash: "h", bundleId: "b", confirmationToken: "c" }),
    });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: PUBLISH_FROM_LIVE_SITE_ERROR, code: "PUBLISH_FROM_LIVE_SITE" });
    assert.deepEqual(outbound, []);
  });
}
