import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminCredentialCopyRoutes } from "../credential-copy.js";
import { LocalCredentialCopyError } from "#src/server/runtime/composition/local-credential-copy";

type Deps = Parameters<typeof registerAdminCredentialCopyRoutes>[0]["deps"];
const path = "/api/admin/v1/workspaces/:workspaceId/system/credential-copy";
const selection = { sourceSiteId: "source", ids: ["key"], overwrite: false };
function fixture({ instance = true }: { instance?: boolean } = {}, _options = {}) {
  const calls: unknown[] = [];
  let allowed = true, instanceAllowed = true;
  const deps = { workspaceId: "ws", ownerPrincipalId: Promise.resolve("owner"),
    authorize: async () => { calls.push("rbac"); return { allowed, reason: "pin" }; },
    gatedMutations: { gatewayDeps: { authorizeInstance: instance ? async () => { calls.push("instance"); return { allowed: instanceAllowed, reason: "pin" }; } : undefined } } as Deps["gatedMutations"],
    localCredentialCopy: { localHost: true, list: async () => { calls.push("list"); return []; },
      copy: async input => { calls.push(input); return []; } },
  } satisfies Deps;
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

test("copy admission preserves session, workspace, owner, RBAC, instance and capability order", async () => {
  for (const method of ["get", "post"] as const) {
    for (const options of [{ credential: "api_key" }, { actor: "admin" }, { workspaceId: "other" }]) {
      const f = fixture(); assert.equal((await f.request({ method, body: selection, ...options })).statusCode, options.workspaceId ? 404 : 403); assert.deepEqual(f.calls, []);
    }
    const denied = fixture(); denied.deny(); assert.equal((await denied.request({ method })).statusCode, 403); assert.deepEqual(denied.calls, ["rbac"]);
    const instance = fixture(); instance.denyInstance(); assert.deepEqual((await instance.request({ method })).jsonBody, { reasonCode: "owner-only" }); assert.deepEqual(instance.calls, ["rbac", "instance"]);
    const local = fixture(); local.deps.localCredentialCopy.localHost = false;
    assert.deepEqual((await local.request({ method })).jsonBody, { reasonCode: "local-host-only" });
    const noInstance = fixture({ instance: false }); assert.equal((await noInstance.request({ method, body: selection })).statusCode, 200);
  }
});

test("copy local admission rejects socket, forwarding, URL, Host and Origin mismatches", async () => {
  const invalid = [
    { local: "192.0.2.1" }, { remote: "192.0.2.1" }, { local: "" }, { remote: "" },
    { headers: { forwarded: "for=127.0.0.1" } }, { headers: { "x-forwarded-host": "localhost" } },
    { host: "example.test" }, { host: "LOCALHOST:4242" }, { host: "[" }, { protocol: "ftp" }, { origin: "http://localhost:4242" },
  ];
  for (const input of invalid) {
    const f = fixture(); assert.deepEqual((await f.request(input)).jsonBody, { reasonCode: "local-host-only" }); assert.deepEqual(f.calls, ["rbac", "instance"]);
  }
  for (const input of [{}, { origin: "http://127.0.0.1:4242" }, { local: "::ffff:127.0.0.1", remote: "::ffff:127.0.0.1" }]) {
    assert.deepEqual((await fixture().request(input)).jsonBody, { sources: [] });
  }
});

test("copy selection pins every shape and length check before the injected transfer", async () => {
  const malformed: unknown[] = [undefined, null, 1, [], {}, { ...selection, extra: true },
    ...[1, "", "../source", "a".repeat(129)].map(sourceSiteId => ({ ...selection, sourceSiteId })),
    ...[null, [], Array(101).fill("id"), [1], [""], ["a".repeat(513)], ["a\nb"], ["a\x7fb"]].map(ids => ({ ...selection, ids })),
    { ...selection, overwrite: "false" }];
  for (const body of malformed) {
    const f = fixture(); assert.deepEqual(await f.request({ method: "post", body }), { statusCode: 400, jsonBody: { reasonCode: "invalid-request" } }); assert.deepEqual(f.calls, ["rbac", "instance"]);
  }
  for (const body of [selection, { sourceSiteId: "a".repeat(128), ids: Array(100).fill("a".repeat(512)), overwrite: true }]) {
    const f = fixture(); assert.deepEqual((await f.request({ method: "post", body })).jsonBody, { results: [] });
    assert.deepEqual(f.calls[2], { ...body, actorId: "owner" });
  }
});

test("a transfer refusal is a 409 carrying its own reason, and any other failure a fixed 500 that never echoes the cause", async () => {
  const refused = fixture();
  refused.deps.localCredentialCopy.copy = async () => { throw new LocalCredentialCopyError({ reasonCode: "source-locked", message: "The source site is open in another window." }); };
  assert.deepEqual(await refused.request({ method: "post", body: selection }), {
    statusCode: 409, jsonBody: { reasonCode: "source-locked", message: "The source site is open in another window." },
  });
  const crashed = fixture();
  crashed.deps.localCredentialCopy.list = async () => { throw new Error("sqlite: cannot open /private/source/vault.db with key material"); };
  assert.deepEqual(await crashed.request({ method: "get" }), {
    statusCode: 500, jsonBody: { reasonCode: "copy-failed", message: "Copying keys failed. Try again." },
  });
});
