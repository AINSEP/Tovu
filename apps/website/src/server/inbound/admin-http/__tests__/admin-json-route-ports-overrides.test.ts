import assert from "node:assert/strict";
import test from "node:test";
import { defineJsonRoute, ok } from "@jini-ai/core/contracts/server";

import { adminFailureResponse } from "#src/server/inbound/shared/admin-failure";
import { rejectUnlessSessionCredential } from "../dev-auth.js";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions } from "../admin-json-route-ports.js";
import { captureRes, fakeAdminApp, listen } from "./fixtures/port-harness.js";

/**
 * w3-rtfnd T3/T5/T7: per-mount port options that let the routes the rt-* lanes STOPPED on answer
 * through `mountAdminJsonRoute` with their hand-written wire — the session-credential-only 403, a
 * route's own 403/500 copy, and an authorization check that names no entity type.
 */
const path = "/api/admin/v1/workspaces/:workspaceId/probe";
const url = "/api/admin/v1/workspaces/local/probe";
type Probe = { calls: string[]; authorizeCalls: unknown[] };

async function serve(options: AdminJsonRouteMountOptions & { allowed?: boolean; crash?: Error; entityType?: string | null } = {}) {
  const { allowed = true, crash, entityType = "probe", ...mount } = options;
  const probe: Probe = { calls: [], authorizeCalls: [] };
  const authorize = async (input: unknown) => { probe.authorizeCalls.push(input); return { allowed, reason: "no_grant" }; };
  const app = fakeAdminApp();
  const spec = defineJsonRoute<void, { done: true }, object, { id: string }>({
    method: "post", path,
    parse: () => { probe.calls.push("parse"); return ok({ value: undefined }); },
    handle: async ({ authorize: check }) => {
      // An id-free, type-free check (users list-roles) passes no `entityType` key at all.
      await check!(entityType === null ? { permission: "probe.write" } as never : { permission: "probe.write", entityType });
      probe.calls.push("handle");
      if (crash) throw crash;
      return ok({ value: { done: true } });
    },
  });
  mountAdminJsonRoute({ app, spec, deps: { workspaceId: "local", authorize } as never }, mount);
  const server = await listen({ app });
  return { ...probe, ...server, post: (headers: Record<string, string> = {}) => server.call(url, { method: "POST", body: "{}", headers }) };
}

const gate = { message: "API keys cannot manage API keys.", permission: "admin.api_keys.manage" };

test("sessionCredentialOnly answers rejectUnlessSessionCredential's exact 403 before parse and authorization", async (t) => {
  const s = await serve({ sessionCredentialOnly: gate });
  t.after(s.close);
  for (const kind of ["api_key", "publish_key"]) {
    const legacy = captureRes({ locals: { authCredentialKind: kind } });
    rejectUnlessSessionCredential({ res: legacy.res as never, ...gate });
    assert.deepEqual(await s.post({ "x-kind": kind }), legacy.written);
  }
  assert.deepEqual(s.calls, []);
  assert.deepEqual(s.authorizeCalls, []);
  assert.deepEqual(await s.post({ "x-kind": "session" }), { status: 200, body: { done: true } });
});

test("without sessionCredentialOnly a machine credential still reaches the route, as before", async (t) => {
  const s = await serve();
  t.after(s.close);
  assert.deepEqual(await s.post({ "x-kind": "api_key" }), { status: 200, body: { done: true } });
});

test("forbidden replaces the denial body with the route's own copy, given the decision", async (t) => {
  const seen: unknown[] = [];
  const s = await serve({ allowed: false, forbidden: (args) => {
    seen.push(args);
    return { status: 403, body: { error: "not authorized for media.upload", code: "FORBIDDEN", details: { permission: args.permission, reason: args.reason } } };
  } });
  t.after(s.close);
  assert.deepEqual(await s.post(), { status: 403, body: { error: "not authorized for media.upload", code: "FORBIDDEN", details: { permission: "probe.write", reason: "no_grant" } } });
  assert.deepEqual(seen, [{ principalId: "caller", permission: "probe.write", entityType: "probe", reason: "no_grant" }]);
  assert.deepEqual(s.calls, ["parse"]);
});

test("failureFor picks per-error failure options; other errors keep the mount's failure", async (t) => {
  class DiskError extends Error {}
  const failureFor = (error: unknown) => error instanceof DiskError ? { operation: "agent-plugins:write-note", message: "The note could not be saved." } : undefined;
  const disk = await serve({ crash: new DiskError("EACCES /srv/notes"), failure: { operation: "routes/probe", code: "INTERNAL_ERROR" }, failureFor });
  t.after(disk.close);
  const saved = await disk.post();
  assert.equal(saved.status, 500);
  assert.match(String(saved.body?.error), /^The note could not be saved\. \(error \S+\)$/);
  const other = await serve({ crash: new Error("boom"), failure: { operation: "routes/probe", code: "INTERNAL_ERROR" }, failureFor });
  t.after(other.close);
  const generic = await other.post();
  assert.equal(generic.status, 500);
  assert.doesNotMatch(String(generic.body?.error), /note could not be saved/);
});

test("failureCopy 'operation' answers adminFailureResponse's operation-only body (presentation PATCH)", async (t) => {
  const failure = { operation: "routes/presentation/patch-active-theme" };
  const s = await serve({ crash: new Error("db locked"), failure, failureCopy: "operation" });
  t.after(s.close);
  const legacy = adminFailureResponse({ error: new Error("db locked") }, failure);
  const answered = await s.post();
  const normalize = (body: unknown) => JSON.parse(JSON.stringify(body).replaceAll(/ERR-[\w-]+/g, "<id>").replaceAll(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<t>"));
  assert.equal(answered.status, legacy.status);
  assert.deepEqual(normalize(answered.body), normalize(legacy.body));
  const routeCopy = await serve({ crash: new Error("db locked"), failure });
  t.after(routeCopy.close);
  assert.notDeepEqual(normalize((await routeCopy.post()).body), normalize(legacy.body));
});

test("an authorization check without an entity type sends no entityType key", async (t) => {
  const s = await serve({ entityType: null, allowed: false });
  t.after(s.close);
  assert.deepEqual(await s.post(), { status: 403, body: { error: "principal 'caller' is not authorized for 'probe.write' (no_grant)", code: "FORBIDDEN", details: { permission: "probe.write", reason: "no_grant" } } });
  assert.deepEqual(s.authorizeCalls, [{ principalId: "caller", permission: "probe.write", workspaceId: "local" }]);
});

// Mutation `defer-principal-skips-credential-gate`: accepting both options lets a request with no session
// principal return from `authenticate` before the credential-kind gate, so a session-only route would reach
// `parse` (and any body 400) for a non-session caller. No mount sets both; the combination is refused at
// registration (gating first would instead throw on the missing credential kind and defeat the deferral).
test("deferMissingPrincipal together with sessionCredentialOnly is refused at registration", async () => {
  await assert.rejects(() => serve({ sessionCredentialOnly: gate, deferMissingPrincipal: true }), /deferMissingPrincipal.*sessionCredentialOnly/);
});
