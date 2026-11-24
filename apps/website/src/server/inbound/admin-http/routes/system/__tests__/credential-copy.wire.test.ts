import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ToolInputError } from "@jini-ai/core";
import { registerAdminCredentialCopyRoutes } from "#src/server/runtime/composition/modules/system-credential-copy";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

/**
 * w4-routes K (RT-K1-adm-system-1): the exact wire of the credential-copy door, captured through the
 * real registrar on the hand-written route BEFORE its move to a Jini spec and kept green after. Pins
 * every refusal in the route's own order — non-session credential (ahead of the workspace 404),
 * foreign workspace, owner-only, RBAC, instance admission, local-host-only (after authorization),
 * request validation, the selected key's own permission, a 409 `ToolInputError` and the redacted 500 —
 * plus both success bodies and `Cache-Control: no-store` on every answer.
 */

type Deps = Parameters<typeof registerAdminCredentialCopyRoutes>[0]["deps"];
const selection = { sourceSiteId: "shared-keys", ids: ["key"], overwrite: false };

interface Scenario {
  actor?: string | null; credential?: string; rbac?: boolean; instance?: boolean | "absent";
  keyRbac?: boolean; keyInstance?: boolean; projectKeys?: boolean; useError?: Error; listError?: Error;
}

async function serve(t: test.TestContext, scenario: Scenario = {}) {
  const { actor = "owner", credential = "session", rbac = true, instance = true, keyRbac = true, keyInstance = true, projectKeys = true, useError, listError } = scenario;
  const calls: unknown[] = [];
  const deps = {
    workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async (params: { permission: string }) => { calls.push(["rbac", params]); return { allowed: params.permission === "system.write" ? rbac : keyRbac, reason: "pin" }; },
    gatedMutations: { gatewayDeps: { authorizeInstance: instance === "absent" ? undefined : async (params: { permission: string }) => {
      calls.push(["instance", params]); return { allowed: params.permission === "system.write" ? instance : keyInstance, reason: "pin" };
    } } },
    projectKeys: projectKeys ? {
      list: async () => [], listGranted: async () => [], savedResult: async ({ result }: { result: unknown }) => result,
      listChoices: async () => { calls.push("list"); if (listError) throw listError; return [
        { keyId: "key", name: "Saved key", kind: "vendor", usedByThisSite: false, usedBy: [], siteName: "Source site", omittedCount: 2 },
        { keyId: "bare", name: "Bare key", kind: "custom", usedByThisSite: false, usedBy: [], locked: "locked-reason" },
      ]; },
      permissionFor: async () => "custom-credentials.write",
      use: async (input: { keyId: string; use: boolean }) => { calls.push(["use", input]); if (useError) throw useError; return { keyId: input.keyId, usedByThisSite: input.use, usedBy: [], appliesAt: "now" }; },
    } : undefined,
  } as unknown as Deps;
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => {
    if (actor !== null) res.locals.principal = { id: actor };
    res.locals.authCredentialKind = credential;
    next();
  });
  registerAdminCredentialCopyRoutes({ app, deps });
  const base = await startTestServer(app, t);
  const request = async ({ method = "GET", workspaceId = "ws", body: sent, headers = {} }: { method?: "GET" | "POST"; workspaceId?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const body = method === "GET" ? undefined : sent;
    const response = await fetch(`${base}/api/admin/v1/workspaces/${workspaceId}/system/credential-copy`, {
      method, headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, type: response.headers.get("content-type"), cache: response.headers.get("cache-control"), body: JSON.parse(text.replaceAll(/ERR-[\w-]+/g, "<id>").replaceAll(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<t>")) as unknown };
  };
  return { calls, request };
}

const json = "application/json; charset=utf-8";
const reply = (status: number, body: unknown) => ({ status, type: json, cache: "no-store", body });
const sessionOnly = reply(403, { error: "Use the owner's session to use saved keys.", code: "FORBIDDEN", details: { permission: "system.write", reason: "credential_kind_not_permitted" } });
const ownerOnly = reply(403, { reasonCode: "owner-only" });
const localOnly = reply(403, { reasonCode: "local-host-only" });
const rbacDenied = (permission: string) => reply(403, { error: `principal 'owner' is not authorized for '${permission}' (pin)`, code: "FORBIDDEN", details: { permission, reason: "pin" } });
const gate = [["rbac", { principalId: "owner", permission: "system.write", workspaceId: "ws" }], ["instance", { principalId: "owner", permission: "system.write" }]];

test("credential-copy: the credential gate answers before the workspace 404, then owner-only before any authorization", async (t) => {
  for (const method of ["GET", "POST"] as const) {
    const apiKey = await serve(t, { credential: "api_key", actor: "other" });
    assert.deepEqual(await apiKey.request({ method, workspaceId: "other", body: selection }), sessionOnly);
    const other = await serve(t, { actor: "other" });
    assert.deepEqual(await other.request({ method, workspaceId: "other", body: selection }), reply(404, { error: "workspace was not found" }));
    assert.deepEqual(await other.request({ method, body: selection }), ownerOnly);
    assert.deepEqual(other.calls, []);
  }
});

test("credential-copy: RBAC, then instance admission, then the local-host check", async (t) => {
  for (const method of ["GET", "POST"] as const) {
    const rbac = await serve(t, { rbac: false });
    assert.deepEqual(await rbac.request({ method, body: selection, headers: { "x-forwarded-for": "203.0.113.9" } }), rbacDenied("system.write"));
    assert.deepEqual(rbac.calls, gate.slice(0, 1));
    const instance = await serve(t, { instance: false });
    assert.deepEqual(await instance.request({ method, body: selection, headers: { "x-forwarded-for": "203.0.113.9" } }), ownerOnly);
    assert.deepEqual(instance.calls, gate);
    const remote = await serve(t);
    assert.deepEqual(await remote.request({ method, body: { bad: true }, headers: { "x-forwarded-for": "203.0.113.9" } }), localOnly);
    assert.deepEqual(remote.calls, gate);
    const noKeys = await serve(t, { projectKeys: false, instance: "absent" });
    assert.deepEqual(await noKeys.request({ method, body: selection }), localOnly);
    assert.deepEqual(noKeys.calls, gate.slice(0, 1));
  }
});

test("credential-copy: a missing session principal is the route's redacted copy-failed 500", async (t) => {
  const anonymous = await serve(t, { actor: null });
  assert.deepEqual(await anonymous.request(), reply(500, {
    code: "INTERNAL_ERROR", errorId: "<id>", message: "The system information could not be loaded. Try loading them again. If it still fails, Report this error ID. (error <id>)",
  }));
});

test("credential-copy: GET lists the shared-keys source exactly", async (t) => {
  const f = await serve(t);
  assert.deepEqual(await f.request(), reply(200, { sources: [{ siteId: "shared-keys", name: "Shared Keys", keys: [
    { kind: "vendor", id: "key", label: "Saved key", provider: null, worksFor: [], siteName: "Source site", omittedCount: 2 },
    { kind: "custom", id: "bare", label: "Bare key", provider: null, worksFor: [], locked: "locked-reason" },
  ] }] }));
  assert.deepEqual(f.calls, [...gate, "list"]);
  const failing = await serve(t, { listError: new Error("driver detail /secret") });
  const message = "Using the saved key failed. Reopen Shared Keys and choose the key again.";
  const action = "Try loading them again. If it still fails, copy details and report this problem.";
  const cause = "The error ID identifies the server report.";
  // Never the thrown text (`driver detail /secret`): only the route's own copy and the error id.
  assert.deepEqual(await failing.request(), reply(500, {
    reasonCode: "copy-failed", code: "INTERNAL_ERROR", errorId: "<id>",
    details: { failure: { message, action, step: "Load system information", cause, errorId: "<id>", time: "<t>",
      copyText: `Message: ${message}\nNext action: ${action}\nError ID: <id>\nStep: Load system information\nCause: ${cause}\nTime: <t>` } },
    message: `${message} (error <id>)`,
  }));
});

test("credential-copy: POST validates after the gates, re-checks the key's permission, then grants one reference", async (t) => {
  const invalid = reply(400, { reasonCode: "invalid-request" });
  const f = await serve(t);
  for (const body of [{ ...selection, siteId: "victim" }, { ...selection, sourceSiteId: "another-site" }, { ...selection, ids: ["key", "other"] }, { ...selection, ids: [""] }, { ...selection, overwrite: true }, [selection]]) {
    assert.deepEqual(await f.request({ method: "POST", body }), invalid);
  }
  assert.deepEqual(await f.request({ method: "POST" }), invalid);
  assert.deepEqual(await f.request({ method: "POST", body: selection }), reply(200, { results: [{ kind: "reference", id: "key", status: "granted" }] }));
  const keyGate = [["rbac", { principalId: "owner", permission: "custom-credentials.write", workspaceId: "ws" }], ["instance", { principalId: "owner", permission: "custom-credentials.write" }]];
  assert.deepEqual(f.calls.slice(-5), [...gate, ...keyGate, ["use", { keyId: "key", use: true }]]);
  const keyRbac = await serve(t, { keyRbac: false });
  assert.deepEqual(await keyRbac.request({ method: "POST", body: selection }), rbacDenied("custom-credentials.write"));
  const keyInstance = await serve(t, { keyInstance: false });
  assert.deepEqual(await keyInstance.request({ method: "POST", body: selection }), ownerOnly);
  assert.equal(keyInstance.calls.some(call => Array.isArray(call) && call[0] === "use"), false);
  const refused = await serve(t, { useError: new ToolInputError({ message: "This saved key is no longer on that site." }) });
  assert.deepEqual(await refused.request({ method: "POST", body: selection }), reply(409, { reasonCode: "saved-key-refused", message: "This saved key is no longer on that site." }));
});
