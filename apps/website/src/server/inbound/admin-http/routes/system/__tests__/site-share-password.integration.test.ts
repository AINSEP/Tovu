/** k1 T1/T4: session-only, exact-origin, owner-only reveal; no listening server. */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
import { registerAdminSiteShareRoutes } from "../site-shares.js";
import type { RouteDeps } from "#src/server/routes/types";

async function request(app: express.Express, url: string, origin = "http://localhost", body: unknown = {}, fetchSite = "same-origin") {
  const socket = new PassThrough(), req = new IncomingMessage(socket as unknown as Socket);
  req.method = "POST"; req.url = url; req.headers = { host: "localhost", origin, "sec-fetch-site": fetchSite };
  Object.assign(req, { body }); req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  const chunks: Buffer[] = []; socket.on("data", c => chunks.push(Buffer.from(c)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; cache: unknown; wire: string }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("request timed out")), 2000);
      res.on("finish", () => resolve({ status: res.statusCode, cache: res.getHeader("cache-control"), wire: Buffer.concat(chunks).toString() }));
      app(req, res);
    });
  } finally { clearTimeout(timer); socket.destroy(); }
}
test("password reveal denies other principals, workspaces, origins, tools and machine credentials", { timeout: 120000 }, async () => {
  let principal = "owner", credential = "session", trusted = false, reveals = 0;
  const app = express();
  app.use((_req, res, next) => {
    res.locals.principal = { id: principal }; res.locals.authCredentialKind = credential;
    if (trusted) res.locals.publishTrust = { sourceInstallationId: "peer", capabilities: ["publish_content.apply"], entityTypes: [], generation: 1 };
    next();
  });
  registerAdminSiteShareRoutes({ app, deps: { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"), authorize: async () => ({ allowed: true }),
    siteShareBackend: { revealPassword: async () => { reveals++; return { password: "private-export-password" }; }, create: async () => ({ ok: true }) },
  } as unknown as RouteDeps });
  const root = "/api/admin/v1/workspaces/ws/site-shares", endpoint = root + "/00000000-0000-0000-0000-000000000000/password";
  for (const kind of ["api_key", "tool", "connected_computer"]) {
    credential = kind; assert.equal((await request(app, endpoint)).status, 403);
  }
  credential = "session"; trusted = true; assert.equal((await request(app, endpoint)).status, 403); trusted = false;
  principal = "other"; assert.equal((await request(app, endpoint)).status, 403); principal = "owner";
  assert.equal((await request(app, endpoint, "https://sibling.example")).status, 403);
  assert.equal((await request(app, endpoint.replace("/ws/", "/other/"))).status, 404);
  assert.equal((await request(app, endpoint, "http://localhost", {}, "cross-site")).status, 403);
  assert.equal(reveals, 0);
  const revealed = await request(app, endpoint);
  assert.equal(revealed.status, 200); assert.equal(revealed.cache, "no-store"); assert.match(revealed.wire, /private-export-password/);
  credential = "api_key";
  assert.equal((await request(app, root, "http://localhost", { includeSavedKeys: true })).status, 400);
});
