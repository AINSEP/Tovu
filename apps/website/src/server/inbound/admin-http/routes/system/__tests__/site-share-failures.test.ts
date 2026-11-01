import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
import type { RouteDeps } from "#src/server/routes/types";
import { registerAdminSiteShareRoutes } from "../site-shares.js";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";

const root = "/api/admin/v1/workspaces/ws/site-shares";

/** Exercise Express routing/auth/catches without a listening socket. */
async function request(app: express.Express, method: string, suffix: string) {
  const socket = new PassThrough(), req = new IncomingMessage(socket as unknown as Socket);
  req.method = method; req.url = root + suffix;
  req.headers = { host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin" };
  req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; body: any }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("request timeout")), 2000);
      const chunks: Buffer[] = []; socket.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("finish", () => {
        const wire = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, body: JSON.parse(wire.slice(wire.indexOf("\r\n\r\n") + 4)) });
      });
      app(req, res);
    });
  } finally { clearTimeout(timer); socket.destroy(); }
}

function appFor(error: unknown, tracked: unknown[] = []) {
  const fail = async () => { throw error; };
  const app = express();
  app.use((req, res, next) => {
    res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session";
    req.body = req.method === "PUT" ? Buffer.from([0x50, 0x4b, 0x03, 0x04]) : req.path === root ? { includeSavedKeys: true } : {};
    next();
  });
  registerAdminSiteShareRoutes({ app, deps: {
    workspaceId: "ws", ownerPrincipalId: "owner", authorize: async () => ({ allowed: true }),
    tracker: { error: (report: unknown) => tracked.push(report) }, siteShareBackend: {
      create: fail, list: fail, staticOptions: fail, revoke: fail, revealPassword: fail,
      registry: { get: fail, list: fail, reserveToken: fail },
    },
  } as unknown as RouteDeps });
  return app;
}

for (const [method, suffix] of [["POST", ""], ["GET", ""], ["GET", "/static/options"], ["POST", "/static"],
  ["GET", "/share/download"], ["DELETE", "/share"], ["PUT", "/artifacts/ABCDEFGHIJKLMNOP/site.tovu.zip"],
  ["DELETE", "/artifacts/ABCDEFGHIJKLMNOP/site.tovu.zip"], ["POST", "/share/password"]]) {
  test(`${method} ${suffix || "/"} logs unexpected share failures with the public error id`, async t => {
    const logs: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
    const secret = "ghp_" + "x".repeat(36), tracked: unknown[] = [];
    const response = await request(appFor(new Error("storage unavailable " + secret), tracked), method!, suffix!);
    assert.equal(response.status, 500);
    assert.equal(response.body.code, "SHARE_FAILED");
    assert.equal(typeof response.body.errorId, "string");
    assert.ok(response.body.errorId.length > 0);
    assert.ok(response.body.message.includes(response.body.errorId));
    assert.equal(logs.length, 1);
    const diagnostic = logs.flat().map(value => value instanceof Error ? value.stack : JSON.stringify(value)).join(" ");
    assert.ok(diagnostic.includes(response.body.errorId));
    assert.match(diagnostic, /storage unavailable/);
    assert.equal(diagnostic.includes(secret), false);
    assert.equal(tracked.length, 1);
    const trackedText = String((tracked[0] as { error: Error }).error.message);
    assert.match(trackedText, /storage unavailable/);
    assert.equal(trackedText.includes(secret), false, "tracker report must be redacted too");
    assert.equal(JSON.stringify(response.body).includes("storage unavailable"), false);
  });
}

test("share refusals retain their public diagnosis and do not log an internal incident", async t => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const response = await request(appFor(new SiteShareRefusal({ code: "FORBIDDEN", message: "Only the site owner can export saved keys." })), "POST", "");
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { code: "FORBIDDEN", message: "Only the site owner can export saved keys." });
  assert.deepEqual(logs, []);
});
