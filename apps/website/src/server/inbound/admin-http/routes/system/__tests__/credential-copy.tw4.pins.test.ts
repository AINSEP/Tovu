import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminCredentialCopyRoutes } from "../credential-copy.js";

type Deps = Parameters<typeof registerAdminCredentialCopyRoutes>[0]["deps"];
const path = "/api/admin/v1/workspaces/:workspaceId/system/credential-copy";
const selection = { sourceSiteId: "shared-keys", ids: ["key"], overwrite: false };
function fixture({ instance = true }: { instance?: boolean } = {}, _options = {}) {
  const calls: unknown[] = [];
  let allowed = true, instanceAllowed = true;
  const deps: Deps = { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => { calls.push("rbac"); return { allowed, reason: "pin" }; },
    gatedMutations: { gatewayDeps: { authorizeInstance: instance ? async () => { calls.push("instance"); return { allowed: instanceAllowed, reason: "pin" }; } : undefined } } as Deps["gatedMutations"],
    projectKeys: {
      listChoices: async () => { calls.push("list"); return [{ keyId: "key", name: "Saved key", kind: "vendor", usedByThisSite: false, usedBy: [] }]; },
      listGranted: async () => [], savedResult: async ({ result }) => result,
      permissionFor: async () => "custom-credentials.write",
      use: async input => { calls.push(input); return { keyId: input.keyId, usedByThisSite: input.use, usedBy: [], appliesAt: "now" }; },
    },
  };
  const app = express(); registerAdminCredentialCopyRoutes({ app, deps });
  return { calls, deps, deny: () => { allowed = false; }, denyInstance: () => { instanceAllowed = false; },
    async request(input: {
      method?: "get" | "post"; body?: unknown; local?: string; remote?: string; host?: string; origin?: string;
      headers?: Record<string, string>; actor?: string; credential?: string; workspaceId?: string; protocol?: string;
    }, _options = {}) {
      const { method, body, local, remote, host, origin, headers, actor, credential, workspaceId, protocol } = {
        method: "get" as const, body: undefined, local: "127.0.0.1", remote: "127.0.0.1", host: "127.0.0.1:4242",
        origin: undefined, headers: {}, actor: "owner", credential: "session", workspaceId: "ws", protocol: "http", ...input,
      };
      const response = createCapturingResponse();
      const writtenHeaders: Record<string, unknown> = {};
      response.res.setHeader = (name, value) => { writtenHeaders[name] = value; return response.res; };
      response.res.locals.principal = { id: actor }; response.res.locals.authCredentialKind = credential;
      const requestHeaders = { host, ...headers, ...(origin === undefined ? {} : { origin }) };
      await extractRouteHandler(app, method, path)({ params: { workspaceId }, body, protocol,
        socket: { localAddress: local, remoteAddress: remote }, headers: requestHeaders,
        get: (name: string) => requestHeaders[name as keyof typeof requestHeaders],
      }, response.res);
      assert.equal(writtenHeaders["Cache-Control"], "no-store");
      return response.capture;
    },
  };
}

test("owner browser approval grants one reference and never submits a target site identity", async () => {
  const f = fixture();
  const listed = await f.request({ method: "get" });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.jsonBody, { sources: [{ siteId: "shared-keys", name: "Shared Keys", keys: [{ kind: "vendor", id: "key", label: "Saved key", provider: null, worksFor: [] }] }] });
  const result = await f.request({ method: "post", body: selection });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(f.calls.at(-1), { keyId: "key", use: true });
  for (const body of [{ ...selection, siteId: "victim" }, { ...selection, sourceSiteId: "another-site" }, { ...selection, ids: ["key", "other"] }, { ...selection, overwrite: true }]) {
    assert.equal((await f.request({ method: "post", body })).statusCode, 400);
  }
});

test("API credentials, other actors, foreign workspaces and nonlocal requests cannot browse or grant", async () => {
  for (const method of ["get", "post"] as const) {
    for (const input of [{ credential: "api_key" }, { actor: "other" }, { workspaceId: "other" }, { remote: "203.0.113.9" }]) {
      const f = fixture();
      const response = await f.request({ method, body: selection, ...input });
      assert.ok(response.statusCode >= 400);
      assert.equal(f.calls.some(call => call === "list" || typeof call === "object"), false);
    }
  }
});

test("revoked RBAC or instance admission refuses before discovery", async () => {
  const f = fixture(); f.deny();
  assert.equal((await f.request({})).statusCode, 403);
  assert.deepEqual(f.calls, ["rbac"]);
  const instance = fixture(); instance.denyInstance();
  assert.equal((await instance.request({})).statusCode, 403);
  assert.deepEqual(instance.calls, ["rbac", "instance"]);
});


test("the selected key's instance permission is checked before granting", async () => {
  const f = fixture();
  f.deps.gatedMutations.gatewayDeps.authorizeInstance = async ({ permission }) => ({ allowed: permission !== 'custom-credentials.write', reason: 'pin' });
  assert.equal((await f.request({ method: 'post', body: selection })).statusCode, 403);
  assert.equal(f.calls.some(call => typeof call === 'object'), false);
});
