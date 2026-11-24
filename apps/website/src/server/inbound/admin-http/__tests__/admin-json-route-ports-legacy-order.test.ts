import assert from "node:assert/strict";
import test from "node:test";
import { defineJsonRoute, ok } from "@jini-ai/core/contracts/server";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { defineRawRoute } from "@jini-ai/http-kit";

import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminMountPreflight } from "../admin-json-route-ports.js";
import { mountAdminRawRoute } from "../admin-raw-route-ports.js";
import { fakeAdminApp, listen } from "./fixtures/port-harness.js";

/**
 * w4-routes batch K: the two opt-in mount options that reproduce a hand-written admin route's legacy
 * gate ORDER (`authenticateBeforeWorkspace`: the session / credential gates before the workspace 404)
 * and its legacy workspace refusal WORDING (`workspaceRefusal`: `res.sendStatus(404)`'s text, or a
 * route's own JSON body). Every existing mount sets neither and keeps workspace 404 → authenticate.
 * w4-routes batch P adds `preflight`: a mount-declared check answered BEFORE every other gate (the
 * admin-surface writes' own cross-origin 403 came ahead of the credential gate and the workspace 404).
 */
const path = "/api/admin/v1/workspaces/:workspaceId/probe";
const gate = { message: "Use the owner's session.", permission: "system.write" };

async function serve(options: AdminJsonRouteMountOptions & { principal?: boolean; requireSameOrigin?: boolean } = {}) {
  const { principal = true, requireSameOrigin, ...mount } = options;
  const calls: string[] = [];
  const app = fakeAdminApp({ principal });
  const spec = defineJsonRoute<void, { done: true }, object, { id: string }>({
    method: "post", path,
    parse: () => { calls.push("parse"); return ok({ value: undefined }); },
    handle: async ({ context }) => {
      // A deferred missing session answers the spec's own 401 (widget preview).
      if (!context) throw new RouteRefusalError({ status: 401, body: { error: "authentication required" } });
      calls.push("handle");
      return ok({ value: { done: true } });
    },
  }, requireSameOrigin ? { requireSameOrigin } : {});
  mountAdminJsonRoute({ app, spec, deps: { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) } as never }, mount);
  const server = await listen({ app });
  // Raw text, so a `sendStatus` reply's plain-text body is visible as written.
  const post = async (workspaceId: string, headers: Record<string, string> = {}) => {
    const response = await fetch(`${server.base}/api/admin/v1/workspaces/${workspaceId}/probe`, { method: "POST", body: "{}", headers: { "content-type": "application/json", ...headers } });
    return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
  };
  return { calls, post, close: server.close };
}

test("by default the workspace 404 still precedes the session-credential gate (every existing mount)", async (t) => {
  const s = await serve({ sessionCredentialOnly: gate });
  t.after(s.close);
  const answered = await s.post("other", { "x-kind": "api_key" });
  assert.equal(answered.status, 404);
  assert.deepEqual(JSON.parse(answered.text), { error: "workspace was not found" });
});

// Mutation `workspace-before-session`: ignoring `authenticateBeforeWorkspace` (keeping the workspace
// port ahead of `authenticate`) answers these with the 404 instead — RED on all three assertions.
test("authenticateBeforeWorkspace answers the session and credential gates before the workspace 404", async (t) => {
  const credential = await serve({ sessionCredentialOnly: gate, authenticateBeforeWorkspace: true });
  t.after(credential.close);
  const refused = await credential.post("other", { "x-kind": "api_key" });
  assert.deepEqual({ status: refused.status, body: JSON.parse(refused.text) }, {
    status: 403, body: { error: gate.message, code: "FORBIDDEN", details: { permission: gate.permission, reason: "credential_kind_not_permitted" } },
  });
  // A session caller still meets the workspace 404, and only after the gates.
  const foreign = await credential.post("other", { "x-kind": "session" });
  assert.deepEqual({ status: foreign.status, body: JSON.parse(foreign.text) }, { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(credential.calls, []);
  assert.equal((await credential.post("local", { "x-kind": "session" })).status, 200);

  const deferred = await serve({ principal: false, deferMissingPrincipal: true, authenticateBeforeWorkspace: true });
  t.after(deferred.close);
  const anonymous = await deferred.post("other");
  assert.deepEqual({ status: anonymous.status, body: JSON.parse(anonymous.text) }, { status: 401, body: { error: "authentication required" } });
});

// Mutation `workspace-refusal-ignored`: dropping the option answers the shared JSON 404 — RED.
test("workspaceRefusal answers a route's legacy workspace refusal: sendStatus text or its own JSON body", async (t) => {
  const text = await serve({ workspaceRefusal: () => ({ status: 404 }) });
  t.after(text.close);
  const bare = await text.post("other");
  assert.deepEqual(bare, { status: 404, type: "text/plain; charset=utf-8", text: "Not Found" });
  assert.equal((await text.post("local")).status, 200);

  const seen: unknown[] = [];
  const json = await serve({ workspaceRefusal: (args) => {
    seen.push(args);
    return { status: 404, body: { code: "NOT_FOUND", message: "Probe failed: this workspace is not available." } };
  } });
  t.after(json.close);
  const own = await json.post("other");
  assert.deepEqual({ status: own.status, body: JSON.parse(own.text) }, { status: 404, body: { code: "NOT_FOUND", message: "Probe failed: this workspace is not available." } });
  assert.deepEqual(seen, [{ workspaceId: "local", requested: "other" }]);
  assert.deepEqual(json.calls, []);
});

test("authenticateBeforeWorkspace on a same-origin spec is refused at registration", async () => {
  // The same-origin gate sits between the workspace and authenticate ports; moving the workspace
  // check after authenticate would silently reorder it too. No hand-written route needed both.
  const mounted = await serve({ authenticateBeforeWorkspace: true, requireSameOrigin: true }).catch((error: unknown) => error);
  if (!(mounted instanceof Error)) {
    await (mounted as Awaited<ReturnType<typeof serve>>).close();
    assert.fail("the mount accepted authenticateBeforeWorkspace on a same-origin spec");
  }
  assert.match(mounted.message, /authenticateBeforeWorkspace.*same-origin/);
});

/** A preflight that admits only `x-probe-origin: ok` and records what it was given. */
function probePreflight(seen: unknown[]): AdminMountPreflight {
  return {
    readHeaders: ["x-probe-origin"],
    check: ({ headers, deps }) => {
      seen.push({ headers, workspaceId: deps.workspaceId });
      return headers["x-probe-origin"] === "ok" ? undefined : { status: 403, body: { error: "refused first", code: "CROSS_ORIGIN_REFUSED" } };
    },
  };
}

const refusedFirst = { status: 403, body: { error: "refused first", code: "CROSS_ORIGIN_REFUSED" } };

// Mutation `preflight-after-credential-gate`: evaluating the preflight inside `authenticate` after the
// credential gate (or after the workspace check) answers the credential 403 / workspace 404 instead of
// the preflight's own refusal — RED on the first assertion of each mount.
test("preflight answers first: before the session-credential gate and the workspace 404, seeing only its declared headers", async (t) => {
  const seen: unknown[] = [];
  const gated = await serve({ preflight: probePreflight(seen), sessionCredentialOnly: gate, authenticateBeforeWorkspace: true });
  t.after(gated.close);
  const refused = await gated.post("other", { "x-kind": "api_key", "x-probe-origin": "evil", "x-unrelated": "1" });
  assert.deepEqual({ status: refused.status, body: JSON.parse(refused.text) }, refusedFirst);
  assert.deepEqual(seen, [{ headers: { "x-probe-origin": "evil" }, workspaceId: "local" }]);
  // Admitted by the preflight, the request meets the existing gates in their configured order.
  const machine = await gated.post("other", { "x-kind": "api_key", "x-probe-origin": "ok" });
  assert.equal(JSON.parse(machine.text).details.reason, "credential_kind_not_permitted");
  const foreign = await gated.post("other", { "x-kind": "session", "x-probe-origin": "ok" });
  assert.deepEqual({ status: foreign.status, body: JSON.parse(foreign.text) }, { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(gated.calls, []);
  assert.equal((await gated.post("local", { "x-kind": "session", "x-probe-origin": "ok" })).status, 200);
  assert.deepEqual(gated.calls, ["parse", "handle"]);

  // The default order (workspace 404 → authenticate) is preceded by the preflight too; an absent header has no key.
  const plainSeen: unknown[] = [];
  const plain = await serve({ preflight: probePreflight(plainSeen) });
  t.after(plain.close);
  const anonymous = await plain.post("other");
  assert.deepEqual({ status: anonymous.status, body: JSON.parse(anonymous.text) }, refusedFirst);
  assert.deepEqual(plainSeen, [{ headers: {}, workspaceId: "local" }]);
});

test("mountAdminRawRoute takes the same preflight, ahead of the workspace 404", async (t) => {
  const seen: unknown[] = [];
  const app = fakeAdminApp();
  const spec = defineRawRoute<object, { id: string }>({ method: "get", path, handle: async () => new Response("raw") });
  mountAdminRawRoute({ app, spec, deps: { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) } as never }, { preflight: probePreflight(seen) });
  const server = await listen({ app });
  t.after(server.close);
  const get = (workspaceId: string, origin: string) => fetch(`${server.base}/api/admin/v1/workspaces/${workspaceId}/probe`, { headers: { "x-probe-origin": origin } });
  const refused = await get("other", "evil");
  assert.deepEqual({ status: refused.status, body: await refused.json() }, refusedFirst);
  assert.equal((await get("other", "ok")).status, 404);
  const admitted = await get("local", "ok");
  assert.deepEqual({ status: admitted.status, text: await admitted.text() }, { status: 200, text: "raw" });
  assert.deepEqual(seen.length, 3);
});
