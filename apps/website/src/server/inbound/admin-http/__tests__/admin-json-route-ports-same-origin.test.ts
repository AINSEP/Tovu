import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { defineJsonRoute, ok, type RouteHostContext } from "@jini-ai/core/contracts/server";

import { mountAdminJsonRoute } from "../admin-json-route-ports.js";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";

/**
 * P3-T1a.T: a JSON admin spec with `requireSameOrigin: true` (the Jini routine writes) must reach
 * http-kit's same-origin gate with an origin context. Before the fix the mount handed none, so every
 * guarded write — same-origin or not — failed as a redacted 500 instead of the cross-origin 403.
 */
const path = "/api/admin/v1/workspaces/:workspaceId/guarded";

function guardedRoute(calls: string[], requireSameOrigin = true) {
  return defineJsonRoute<object, { done: true }, object, { id: string }>({
    method: "post", path,
    parse: () => ok({ value: {} }),
    handle: async () => { calls.push("write"); return ok({ value: { done: true } }); },
  }, { requireSameOrigin, successStatus: 201 });
}

async function serve(t: { after: (fn: () => void) => void }, { requireSameOrigin = true, origin }: { requireSameOrigin?: boolean; origin?: RouteHostContext } = {}) {
  const calls: string[] = [];
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner", kind: "user" }; next(); });
  const deps = { workspaceId: "ws-1", authorize: async () => ({ allowed: true, reason: "ok" }) } as never;
  mountAdminJsonRoute({ errors: createRouteIncidentReporter().errors, app, spec: guardedRoute(calls, requireSameOrigin), deps, ...(origin ? { origin } : {}) });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (headers: Record<string, string> = {}) => fetch(`${root}/api/admin/v1/workspaces/ws-1/guarded`, { method: "POST", body: "{}", headers: { "content-type": "application/json", ...headers } });
  return { calls, root, post };
}

test("a same-origin admin JSON spec refuses a cross-origin write with a plain 403 and writes nothing", async (t) => {
  const { calls, post } = await serve(t);
  const foreign = await post({ origin: "https://evil.example" });
  assert.equal(foreign.status, 403);
  assert.match(JSON.stringify(await foreign.json()), /cross-origin request rejected/);
  const headless = await post();
  assert.equal(headless.status, 403, "a write with no Origin header is not a same-origin browser write");
  const crossSite = await post({ origin: "https://evil.example", "sec-fetch-site": "cross-site" });
  assert.equal(crossSite.status, 403);
  assert.deepEqual(calls, []);
});

test("a same-origin admin JSON spec admits the site's own browser write", async (t) => {
  const { calls, root, post } = await serve(t);
  const own = await post({ origin: root, "sec-fetch-site": "same-origin" });
  assert.equal(own.status, 201);
  assert.deepEqual(await own.json(), { done: true });
  assert.deepEqual(calls, ["write"]);
});

test("a mount's explicit origin context replaces the default browser-write policy", async (t) => {
  const allowEvil: RouteHostContext = { originPolicy: { isSameOrigin: ({ req }) => req.headers?.origin === "https://evil.example" } };
  const { calls, root, post } = await serve(t, { origin: allowEvil });
  assert.equal((await post({ origin: root })).status, 403);
  assert.equal((await post({ origin: "https://evil.example" })).status, 201);
  assert.deepEqual(calls, ["write"]);
});

test("a spec without requireSameOrigin is untouched by the origin gate", async (t) => {
  const { calls, post } = await serve(t, { requireSameOrigin: false });
  assert.equal((await post({ origin: "https://evil.example" })).status, 201);
  assert.deepEqual(calls, ["write"]);
});
