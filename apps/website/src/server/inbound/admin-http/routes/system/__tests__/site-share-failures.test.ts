import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
import type { RouteDeps } from "#src/server/routes/types";
import { registerAdminSiteShareRoutes } from "../site-shares.js";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { sendSiteShareFailure } from "../site-share-errors.js";
import { SiteShareExportFailure } from "#src/features/site-backup/share-export-failure";

test("an archive failure returns the actual job step and redacted copyable details", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const tracked: unknown[] = [];
  const cause = new Error("ZIP writer failed password=CANARY_EXPORT ERR-1234-5678-9ABC-DEF0");
  const response = await request(appFor(new SiteShareExportFailure({ step: "archive", cause, appVersion: "test-app", jiniVersion: "test-jini", time: "2026-11-04T12:00:00.000Z" }), tracked), "POST", "");
  assert.equal(response.status, 500);
  assert.equal(response.body.errorId, "ERR-1234-5678-9ABC-DEF0");
  const failure = response.body.details.failure;
  assert.equal(failure.errorId, response.body.errorId);
  assert.match(response.body.message, new RegExp(response.body.errorId));
  assert.equal(failure.message, "The export stopped while building the ZIP.");
  assert.equal(failure.action, "Copy details and report this problem. Check export history before starting another export.");
  assert.equal(failure.step, "archive");
  assert.equal(failure.appVersion, "test-app");
  assert.equal(failure.jiniVersion, "test-jini");
  assert.equal(failure.time, "2026-11-04T12:00:00.000Z");
  assert.match(failure.copyText, /ZIP writer failed/);
  assert.equal(failure.copyText.includes("CANARY_EXPORT"), false);
  assert.equal(failure.copyText.includes("Check storage configuration"), false);
  assert.equal(tracked.length, 1);
  const trackedError = (tracked[0] as { error: Error }).error;
  assert.ok(trackedError instanceof Error);
  // Error.message is nonenumerable; inspect the diagnostic the tracker receives, not JSON's empty object.
  for (const diagnostic of [JSON.stringify(logged.mock.calls.map(call => call.arguments)), trackedError.message]) {
    assert.match(diagnostic, /ERR-1234-5678-9ABC-DEF0/);
    assert.equal(diagnostic.includes("CANARY_EXPORT"), false);
  }
});

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
    req.body = req.method === "PUT" ? Buffer.from([0x50, 0x4b, 0x03, 0x04]) : {};
    next();
  });
  registerAdminSiteShareRoutes({ app, deps: {
    workspaceId: "ws", ownerPrincipalId: "owner", authorize: async () => ({ allowed: true }),
    tracker: { error: (report: unknown) => tracked.push(report) }, siteShareBackend: {
      create: fail, list: fail, staticOptions: fail, revoke: fail, acknowledge: fail, revealPassword: fail,
      registry: { get: fail, list: fail, reserveToken: fail },
    },
  } as unknown as RouteDeps });
  return app;
}

for (const [method, suffix] of [["POST", ""], ["GET", ""], ["GET", "/static/options"], ["POST", "/static"],
  ["POST", "/share/acknowledge"], ["GET", "/share/download"], ["DELETE", "/share"], ["PUT", "/artifacts/ABCDEFGHIJKLMNOP/site.tovu.zip"],
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
  assert.deepEqual(response.body, { code: "FORBIDDEN", message: "Export creation failed: Only the site owner can export saved keys." });
  assert.deepEqual(logs, []);
});

test("shared diagnostics remain correlated without a telemetry provider", t => {
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  let status = 0, body: any;
  const res = { status: (value: number) => { status = value; return { json: (value: unknown) => { body = value; } }; } };
  sendSiteShareFailure({ res: res as any, error: "storage unavailable" });
  assert.equal(status, 500);
  assert.equal(body.code, "SHARE_FAILED");
  assert.equal(typeof body.errorId, "string");
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.ok(body.message.includes(body.errorId));
  assert.equal(logs.length, 1);
  assert.ok(JSON.stringify(logs).includes(body.errorId));
  assert.equal(body.message.includes("storage unavailable"), false);
});
