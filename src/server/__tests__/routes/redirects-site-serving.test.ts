import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../app";
import { registerAdminRedirectCreateRoute } from "../../routes/admin/redirects/create";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerSiteRoutes } from "../../routes/site/pages";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Coordinator-authored (2026-07-13), post-session-limit resume. Proves
 * the real HTTP boundary — not just the domain layer — actually serves a
 * redirect. `tasks.md`'s own Phase-1 note calls this "the single most
 * important test in this feature" (T041); it did not exist before this pass
 * because the killed implementation agent never reached Phase 3 (site-route
 * wiring). `src/server/routes/site/pages.ts` now calls
 * `runPreContentPhase`/`runPostContentPhase` before/after its own content
 * lookup — this test exercises that wiring against a real running server,
 * not a mocked resolver.
 */

const WORKSPACE_ID = "workspace-local";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminRedirectCreateRoute(app, deps);
  registerSiteRoutes(app, deps);
  return { app, deps };
}

async function boot(app: express.Express, t: import("node:test").TestContext) {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function loginCookie(baseUrl: string): Promise<string> {
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("T041/INV-03: a real GET request to a redirect rule's source path is actually redirected by the live site route, not just resolvable in-domain", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await boot(app, t);
  const cookie = await loginCookie(baseUrl);

  const create = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/redirects`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      matchType: "exact",
      fromPattern: "/old-page",
      toTarget: "/new-page",
      statusCode: 301,
      override: true,
    }),
  });
  assert.equal(create.status, 201, await create.text());

  const visit = await fetch(`${baseUrl}/old-page`, { redirect: "manual" });
  assert.equal(visit.status, 301);
  assert.equal(visit.headers.get("location"), "/new-page");
});

test("T041b: a path with no matching redirect rule still 404s through the normal site route (no false-positive redirect)", async (t) => {
  const { app } = buildTestApp();
  const baseUrl = await boot(app, t);

  const visit = await fetch(`${baseUrl}/definitely-not-a-real-page-or-rule`, { redirect: "manual" });
  assert.equal(visit.status, 404);
});
