import { savedKeysSameOrigin } from "@jini-ai/cms/admin-http/routes/system/site-share-password";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
import type { RouteDeps } from "#src/server/routes/types";
import { registerAdminSiteShareRoutes } from "#src/server/runtime/composition/modules/system-site-shares";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { sendSiteShareFailure, requireSavedKeysOwnerSession } from "@jini-ai/cms/admin-http/routes/system/site-share-password";
import { SiteShareExportFailure } from "@jini-ai/devops/backup/site/share-export-failure";
import { recordingComposedReporter } from "#src/server/__tests__/helpers/composed-reporter-probe";

type Sinks = ReturnType<typeof recordingComposedReporter>;
/** The one host record's metadata (the composed reporter's log line, which replaced the console line). */
const recordMeta = (sinks: Sinks, index = 0) => (sinks.records[index]![1] as { meta: { errorId: string; diagnostic: string } }).meta;

test("an archive failure returns the actual job step and redacted copyable details", async t => {
  const logged = t.mock.method(console, "error", () => {});
  const sinks = recordingComposedReporter();
  const cause = new Error("ZIP writer failed password=CANARY_EXPORT ERR-1234-5678-9ABC-DEF0");
  const response = await request(appFor(new SiteShareExportFailure({ step: "archive", cause, appVersion: "test-app", jiniVersion: "test-jini", time: "2026-11-04T12:00:00.000Z" }), sinks), "POST", "");
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
  assert.equal(sinks.reports.length, 1);
  const trackedError = sinks.reports[0]![0].error;
  assert.ok(trackedError instanceof Error);
  assert.notEqual(trackedError, cause, "the original Error is never forwarded");
  assert.equal(sinks.records.length, 1, "one host record");
  assert.equal(recordMeta(sinks).errorId, "ERR-1234-5678-9ABC-DEF0", "the host record carries the reply's id");
  assert.equal(logged.mock.callCount(), 0, "no legacy console line");
  // Error.message is nonenumerable; inspect the diagnostic the tracker receives, not JSON's empty object.
  // The composed reporter carries the incident id in the tracker report's context, beside the redacted error.
  for (const diagnostic of [JSON.stringify(sinks.records), `${trackedError.message} ${JSON.stringify(sinks.reports[0]![1])}`]) {
    assert.match(diagnostic, /ERR-1234-5678-9ABC-DEF0/);
    assert.equal(diagnostic.includes("CANARY_EXPORT"), false);
  }
});

const root = "/api/admin/v1/workspaces/ws/site-shares";

/** Exercise Express routing/auth/catches without a listening socket. */
async function request(app: express.Express, method: string, suffix: string, headers: Record<string, string> = {}) {
  const socket = new PassThrough(), req = new IncomingMessage(socket as unknown as Socket);
  req.method = method; req.url = root + suffix;
  req.headers = { host: "localhost", origin: "http://localhost", "sec-fetch-site": "same-origin", ...headers };
  req.push(null);
  const res = new ServerResponse(req); res.assignSocket(socket as unknown as Socket);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<{ status: number; body: any; cacheControl: unknown }>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("request timeout")), 2000);
      const chunks: Buffer[] = []; socket.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("finish", () => {
        const wire = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, body: JSON.parse(wire.slice(wire.indexOf("\r\n\r\n") + 4)), cacheControl: res.getHeader("cache-control") });
      });
      app(req, res);
    });
  } finally { clearTimeout(timer); socket.destroy(); }
}

function appFor(error: unknown, sinks: Sinks = recordingComposedReporter()) {
  const fail = async () => { throw error; };
  const app = express();
  app.use((req, res, next) => {
    res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; res.locals.failureReporter = sinks.reporter;
    req.body = req.method === "PUT" ? Buffer.from([0x50, 0x4b, 0x03, 0x04]) : {};
    next();
  });
  registerAdminSiteShareRoutes({ errors: { ...createRouteIncidentReporter().errors, reporter: sinks.reporter }, app, deps: {
    workspaceId: "ws", ownerPrincipalId: "owner", authorize: async () => ({ allowed: true }),
    siteShareBackend: {
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
    const secret = "ghp_" + "x".repeat(36), sinks = recordingComposedReporter();
    const response = await request(appFor(new Error("storage unavailable " + secret), sinks), method!, suffix!);
    assert.equal(response.status, 500);
    assert.equal(response.body.code, "SHARE_FAILED");
    assert.equal(typeof response.body.errorId, "string");
    assert.ok(response.body.errorId.length > 0);
    assert.ok(response.body.message.includes(response.body.errorId));
    assert.equal(logs.length, 0, "no legacy console line");
    assert.equal(sinks.records.length, 1, "one host record");
    const { errorId, diagnostic } = recordMeta(sinks);
    assert.equal(errorId, response.body.errorId);
    assert.match(diagnostic, /storage unavailable/);
    assert.equal(JSON.stringify(sinks.records).includes(secret), false);
    assert.equal(sinks.reports.length, 1);
    const trackedText = String(sinks.reports[0]![0].error.message);
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
  sendSiteShareFailure({ error: "storage unavailable", deps: {
    refusal: SiteShareRefusal, exportFailure: SiteShareExportFailure,
    json: (body, status) => res.status(status).json(body),
    failure: (error, options) => sendAdminFailure({ res, error }, options),
  } });
  assert.equal(status, 500);
  assert.equal(body.code, "SHARE_FAILED");
  assert.equal(typeof body.errorId, "string");
  assert.equal(body.details.failure.errorId, body.errorId);
  assert.ok(body.message.includes(body.errorId));
  assert.equal(logs.length, 1);
  assert.ok(JSON.stringify(logs).includes(body.errorId));
  assert.equal(body.message.includes("storage unavailable"), false);
});

test("a foreign-origin owner session gets a no-store refusal before the reveal backend", async () => {
  let revealed = 0;
  const sinks = recordingComposedReporter();
  const reveal = async () => { revealed += 1; return { password: "never" }; };
  const app = express();
  app.use((req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; res.locals.failureReporter = sinks.reporter; next(); });
  registerAdminSiteShareRoutes({ errors: { ...createRouteIncidentReporter().errors, reporter: sinks.reporter }, app, deps: {
    workspaceId: "ws", ownerPrincipalId: "owner", authorize: async () => ({ allowed: true }),
    siteShareBackend: { revealPassword: reveal },
  } as unknown as RouteDeps });
  // Browser facts say same-origin, but the Origin is not the exact serving origin (scheme + host).
  const foreign = await request(app, "POST", "/share/password", { origin: "https://localhost" });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.code, "FORBIDDEN");
  assert.match(String(foreign.cacheControl), /no-store/);
  assert.equal(revealed, 0, "the reveal backend is never reached");
  const missing = await request(app, "POST", "/share/password", { origin: "" });
  assert.equal(missing.status, 403);
  assert.equal(revealed, 0);
});


test("publish trust refuses saved-key access before reading owner identity or origin", async () => {
  const app = express();
  let ownerReads = 0, originReads = 0, revealed = 0;
  app.post("/api/admin/v1/workspaces/:workspaceId/site-shares/share/password", async (req, res) => {
    res.locals.authCredentialKind = "session";
    res.locals.publishTrust = { sourceInstallationId: "peer" };
    Object.defineProperty(res.locals, "principal", { get: () => { ownerReads++; return { id: "owner" }; } });
    const get = req.get.bind(req);
    req.get = ((name: string) => { if (name === "origin") originReads++; return get(name); }) as typeof req.get;
    if (await requireSavedKeysOwnerSession({ deps: {
      noStore: () => res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }),
      foreignWorkspace: () => String(req.params.workspaceId) !== "ws",
      requireSession: () => rejectUnlessSessionCredential({ res, message: "Use the site owner's signed-in browser for saved keys.", permission: "site-backup.push" }),
      publishTrustContext: () => getPublishTrustContext(res), principalId: () => getAuthedPrincipal(res).id,
      ownerPrincipalId: () => "owner",
      sameOrigin: () => savedKeysSameOrigin({ origin: req.get("origin"), host: req.get("host"), fetchSite: req.get("sec-fetch-site"), protocol: req.protocol }),
      json: (body, status) => res.status(status).json(body),
      ownerMessage: "Saved keys access requires the site owner’s signed-in browser on this Tovu site.",
    } })) {
      revealed++;
      res.json({ password: "never" });
    }
  });
  const response = await request(app, "POST", "/share/password");
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "FORBIDDEN");
  assert.match(String(response.cacheControl), /no-store/);
  assert.equal(ownerReads, 0);
  assert.equal(originReads, 0);
  assert.equal(revealed, 0);
});
