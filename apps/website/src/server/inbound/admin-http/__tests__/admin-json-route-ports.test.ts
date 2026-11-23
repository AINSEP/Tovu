import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { defineJsonRoute, err, ok, type RouteInputContext } from "@jini-ai/core/contracts/server";
import { rejectRoute } from "@jini-ai/core/errors/route-refusal";
import { CONTENT_ENTRY_MAX_BODY_BYTES } from "@jini-ai/cms/admin-http/limits";

import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import { authorizeOrRespond } from "../authorize-guard.js";
import { mountAdminJsonRoute, mountPublicJsonRoute } from "../admin-json-route-ports.js";

/**
 * B8 gate for every Jini route spec mounted through the host ports: a returned parse failure, a
 * returned handler failure and a thrown refusal reach the caller in Tovu's flat envelope; the
 * Express 413 keeps its exact legacy body; the 404/403/500 come from the hand-written helpers.
 */
type Mode = "ok" | "parse" | "handle" | "refuse" | "crash";
const path = "/api/admin/v1/workspaces/:workspaceId/probe";

function probeRoute(calls: string[]) {
  return defineJsonRoute<{ mode: Mode }, { done: true }, { probe: true }, { id: string }>({
    method: "post", path,
    parse: (raw: RouteInputContext) => {
      const mode = (raw.body as { mode?: Mode } | null)?.mode ?? "ok";
      return mode === "parse" ? err({ error: { code: "BAD_REQUEST", message: "mode is invalid" } }) : ok({ value: { mode } });
    },
    handle: async ({ input, authorize }) => {
      await authorize!({ permission: "probe.write", entityType: "probe" });
      calls.push(input.mode);
      if (input.mode === "handle") return err({ error: { code: "NOT_FOUND", message: "probe not found" } });
      if (input.mode === "refuse") rejectRoute({ status: 409, error: "probe is busy", code: "PROBE_BUSY" });
      if (input.mode === "crash") throw new Error("secret driver detail /var/db/site.sqlite");
      return ok({ value: { done: true } });
    },
  }, { successStatus: 201 });
}

async function serve(options: { allowed?: boolean; publishTrust?: boolean; direct?: boolean } = {}) {
  const calls: string[] = [];
  const authorizeCalls: unknown[] = [];
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use((_req, res, next) => {
    res.locals.principal = { id: "caller", kind: "user" };
    if (options.publishTrust) res.locals.publishTrust = { sourceInstallationId: "src", capabilities: ["probe.write"], entityTypes: ["probe"], generation: 1 };
    next();
  });
  app.post(path, rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES }));
  const authorize = async (input: unknown) => { authorizeCalls.push(input); return { allowed: options.allowed ?? true, reason: "no_grant" }; };
  mountAdminJsonRoute({ app, spec: probeRoute(calls), deps: { probe: true, workspaceId: "local", authorize } as never },
    options.direct ? { authorization: "direct" } : {});
  mountPublicJsonRoute({ app, spec: defineJsonRoute<void, void, object>({ method: "get", path: "/public/probe",
    parse: () => ok({ value: undefined }), handle: async () => { throw new Error("private"); } }), deps: {},
  failure: { operation: "probe:public", visitorError: "The site couldn’t load the probe." } });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = async (body: unknown, workspace = "local") => {
    const response = await fetch(`${base}/api/admin/v1/workspaces/${workspace}/probe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { calls, authorizeCalls, base, send, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("returned parse, returned handler and thrown refusal all answer in the flat envelope", async (t) => {
  const s = await serve();
  t.after(s.close);
  assert.deepEqual(await s.send({ mode: "parse" }), { status: 400, body: { error: "mode is invalid", code: "BAD_REQUEST" } });
  assert.deepEqual(await s.send({ mode: "handle" }), { status: 404, body: { error: "probe not found", code: "NOT_FOUND" } });
  assert.deepEqual(await s.send({ mode: "refuse" }), { status: 409, body: { error: "probe is busy", code: "PROBE_BUSY" } });
  assert.deepEqual(await s.send({ mode: "ok" }), { status: 201, body: { done: true } });
});

test("the Express cap answers the exact legacy 413 before the route runs", async (t) => {
  const s = await serve();
  t.after(s.close);
  const atCap = { mode: "ok", pad: "" };
  atCap.pad = "x".repeat(CONTENT_ENTRY_MAX_BODY_BYTES - JSON.stringify(atCap).length);
  assert.equal((await s.send(atCap)).status, 201);
  const over = { ...atCap, pad: `${atCap.pad}x` };
  assert.deepEqual(await s.send(over), { status: 413, body: { error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" } });
  assert.deepEqual(s.calls, ["ok"]);
});

test("a foreign workspace is the shared 404 and never reaches authorization", async (t) => {
  const s = await serve();
  t.after(s.close);
  assert.deepEqual(await s.send({ mode: "ok" }, "other"), { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(s.authorizeCalls, []);
});

test("a deployment-level path without :workspaceId never runs the workspace guard", async (t) => {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "caller", kind: "user" }; next(); });
  mountAdminJsonRoute({ app, spec: defineJsonRoute<void, { ok: true }, object, { id: string }>({ method: "get", path: "/api/admin/v1/deployment-probe",
    parse: () => ok({ value: undefined }), handle: async () => ok({ value: { ok: true as const } }) }),
  deps: { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) } as never });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/v1/deployment-probe`);
  assert.deepEqual({ status: response.status, body: await response.json() }, { status: 200, body: { ok: true } });
});

test("a denial writes the same 403 body as authorizeOrRespond", async (t) => {
  const s = await serve({ allowed: false });
  t.after(s.close);
  const legacy = { status: 0, body: undefined as unknown };
  const res = { locals: {}, status(code: number) { legacy.status = code; return this; }, json(body: unknown) { legacy.body = body; return this; } };
  await authorizeOrRespond({ res: res as never, authorize: async () => ({ allowed: false, reason: "no_grant" }),
    params: { principalId: "caller", permission: "probe.write", workspaceId: "local", entityType: "probe" } });
  assert.deepEqual(await s.send({ mode: "ok" }), legacy);
  assert.deepEqual(s.authorizeCalls, [{ principalId: "caller", permission: "probe.write", workspaceId: "local", entityType: "probe" }]);
});

test("a publishing credential answers from its grant unless the route is mounted direct", async (t) => {
  const guarded = await serve({ allowed: false, publishTrust: true });
  t.after(guarded.close);
  assert.equal((await guarded.send({ mode: "ok" })).status, 201);
  assert.deepEqual(guarded.authorizeCalls, []);
  const direct = await serve({ allowed: false, publishTrust: true, direct: true });
  t.after(direct.close);
  assert.equal((await direct.send({ mode: "ok" })).status, 403);
  assert.equal(direct.authorizeCalls.length, 1);
});

test("an unexpected failure is the redacted admin 500 and the visitor-safe public 500", async (t) => {
  const s = await serve();
  t.after(s.close);
  const admin = await s.send({ mode: "crash" });
  assert.equal(admin.status, 500);
  assert.equal(admin.body.code, "INTERNAL_ERROR");
  assert.match(admin.body.errorId, /\S/);
  assert.doesNotMatch(JSON.stringify(admin.body), /secret driver detail|site\.sqlite/);
  const visitor = await fetch(`${s.base}/public/probe`);
  const body = await visitor.json() as { error: string; errorId: string };
  assert.equal(visitor.status, 500);
  assert.equal(body.error, "The site couldn’t load the probe.");
  assert.match(body.errorId, /\S/);
  assert.deepEqual(Object.keys(body).sort(), ["error", "errorId"]);
});
