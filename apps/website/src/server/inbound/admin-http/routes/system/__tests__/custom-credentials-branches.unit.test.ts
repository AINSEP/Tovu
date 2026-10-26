import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createCapturingResponse, extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAdminCustomCredentialsRoutes } from "../custom-credentials.js";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";

/**
 * @file Branches of the custom-credentials routes that `custom-credentials-route.test.ts` (which runs
 * the full composition, where the deploy-target registry and publish-verification cache are always
 * wired) does not reach: a host WITHOUT those optional ports, the cache invalidation each write makes
 * when it IS wired (observed through a recording cache), every optional PUT field forwarded, the
 * absent-body and absent-param fallbacks (direct handler calls; Express always fills both), and the
 * fixed 500 a store failure maps to. Real in-memory repos, sealer and keyring from `createRouteDeps()`;
 * only the cache is a recording fake.
 */

const ROOT = "/api/admin/v1/workspaces/:workspaceId/system/custom/credentials";

function setup({ withTargets }: { withTargets: boolean }) {
  const base = createRouteDeps();
  const deleted: Array<{ workspaceId: string; target: string }> = [];
  const cache = { ...base.publishCredentialVerificationCache, delete: (input: { workspaceId: string; target: string }) => { deleted.push(input); } };
  const deps = {
    workspaceId: base.workspaceId, authorize: async () => ({ allowed: true as const, reason: "test" }), clock: base.clock, idGen: base.idGen,
    customCredentialSetRepo: base.customCredentialSetRepo, siteAssistantSecretSealer: base.siteAssistantSecretSealer,
    siteAssistantSecretKeyring: base.siteAssistantSecretKeyring,
    ...(withTargets ? { loadDeployTargets: base.loadDeployTargets, publishCredentialVerificationCache: cache } : {}),
  };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminCustomCredentialsRoutes(app, deps);
  return { app, deps, deleted };
}

async function client(t: import("node:test").TestContext, app: express.Express, workspaceId: string) {
  const url = `${await startTestServer(app, t)}/api/admin/v1/workspaces/${workspaceId}/system/custom/credentials`;
  const send = async (method: string, suffix: string, body?: unknown) => {
    const res = await fetch(url + suffix, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, json: res.status === 204 ? null : await res.json() };
  };
  return send;
}

const CREATE = { label: "Deploy token", category: "general", baseUrl: "https://api.vercel.com", connection: { token: "synthetic-branches-token" } };

test("custom-credentials: without the optional deploy-target ports every verb still works and nothing is invalidated", async (t) => {
  const { app, deps, deleted } = setup({ withTargets: false });
  const send = await client(t, app, deps.workspaceId);
  const created = await send("POST", "", { ...CREATE, additionalHosts: ["https://uploads.vercel.com"], worksFor: ["vercel"] });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.deepEqual(created.json.credential.additionalHosts, ["https://uploads.vercel.com"]);
  assert.deepEqual(created.json.credential.worksFor, ["vercel"]);
  const id = created.json.credential.id;
  const updated = await send("PUT", `/${id}`, { label: "Renamed token", category: "general", baseUrl: "https://api.vercel.com/v2",
    additionalHosts: [], worksFor: [], connection: { token: "synthetic-branches-token-2" }, username: "deployer" });
  assert.equal(updated.status, 200, JSON.stringify(updated.json));
  assert.deepEqual([updated.json.credential.label, updated.json.credential.baseUrl, updated.json.credential.additionalHosts, updated.json.credential.worksFor],
    ["Renamed token", "https://api.vercel.com/v2", [], []]);
  assert.equal((await send("DELETE", `/${id}`)).status, 204);
  assert.deepEqual((await send("GET", "")).json, { credentials: [] });
  assert.deepEqual(deleted, []);
});

test("custom-credentials: with the deploy-target ports wired, each write that changes a credential's publish hosts invalidates them", async (t) => {
  const { app, deps, deleted } = setup({ withTargets: true });
  const send = await client(t, app, deps.workspaceId);
  const created = await send("POST", "", { ...CREATE, worksFor: ["vercel"] });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.deepEqual(deleted, [{ workspaceId: deps.workspaceId, target: "vercel" }]);
  const id = created.json.credential.id;
  assert.equal((await send("PUT", `/${id}`, { worksFor: [] })).status, 200);
  assert.deepEqual(deleted.length, 2);
  assert.equal((await send("PUT", `/${id}`, { worksFor: ["vercel"] })).status, 200);
  assert.equal((await send("DELETE", `/${id}`)).status, 204);
  assert.deepEqual(deleted.map((d) => d.target), ["vercel", "vercel", "vercel", "vercel"]);
});

test("custom-credentials: missing params or body take the documented fallbacks (direct handler calls)", async () => {
  const { app, deps } = setup({ withTargets: false });
  const call = async (method: "get" | "post" | "put", path: string, req: object) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "owner" };
    await extractRouteHandler(app, method, path)(req, res);
    return capture;
  };
  assert.deepEqual(await call("get", ROOT, { params: {} }), { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  const noBodyCreate = await call("post", ROOT, { params: { workspaceId: deps.workspaceId } });
  assert.equal(noBodyCreate.statusCode, 400);
  assert.equal((noBodyCreate.jsonBody as { error: string }).error, "VALIDATION");
  const noBodyUpdate = await call("put", `${ROOT}/:id`, { params: { workspaceId: deps.workspaceId, id: "missing-id" } });
  assert.equal(noBodyUpdate.statusCode, 404);
  assert.equal((noBodyUpdate.jsonBody as { error: string }).error, "NOT_FOUND");
});

test("custom-credentials: an unexpected store failure on list or delete is a fixed 500 that never echoes the cause", async (t) => {
  const { app, deps } = setup({ withTargets: false });
  const logged = t.mock.method(console, "error", () => {});
  const fault = async () => { throw new Error("vault corrupted at /private/vault.db"); };
  t.mock.method(deps.customCredentialSetRepo, "listByWorkspace", fault);
  t.mock.method(deps.customCredentialSetRepo, "findById", fault);
  const send = await client(t, app, deps.workspaceId);
  for (const [method, suffix] of [["GET", ""], ["DELETE", "/some-id"]] as const) {
    assert.deepEqual(await send(method, suffix), { status: 500, json: { error: "internal error", code: "INTERNAL_ERROR" } });
  }
  assert.deepEqual(logged.mock.calls.map((c) => c.arguments), [["[custom-credentials] unexpected store error"], ["[custom-credentials] unexpected store error"]]);
});

test("custom-credentials: with a project store, keys save to the project unless scope is site; Share moves a site key to the project", async (t) => {
  const { app, deps } = setup({ withTargets: false });
  const keyring = new InMemoryKeyring();
  const project = { workspaceId: "project", repo: new InMemoryCustomCredentialSetRepo(), sealer: new AesGcmSecretSealer(keyring), keyring };
  const shared = { ...deps, customCredentialSetRepo: new CustomCredentialVaultRepo({ vault: new InMemoryVaultRepo({}) }, { project }) };
  const projectApp = express();
  projectApp.use(express.json());
  projectApp.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminCustomCredentialsRoutes(projectApp, shared);
  const send = await client(t, projectApp, deps.workspaceId);
  const everywhere = await send("POST", "", CREATE);
  assert.equal(everywhere.json.credential.scope, "project", JSON.stringify(everywhere.json));
  const own = await send("POST", "", { ...CREATE, label: "Site token", scope: "site" });
  assert.equal(own.json.credential.scope, "site");
  const moved = await send("POST", `/${own.json.credential.id}/share`);
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.deepEqual([moved.json.credential.id, moved.json.credential.scope], [own.json.credential.id, "project"]);
  assert.equal(JSON.stringify(moved.json).includes(CREATE.connection.token), false);
  assert.equal((await send("POST", `/${own.json.credential.id}/share`)).status, 404, "no longer a site-only key");
  assert.equal((await send("POST", "", { ...CREATE, label: "x", scope: "nowhere" })).status, 400);
  // A server without a project store (Fly) has nothing to share with.
  const siteOnly = await client(t, app, deps.workspaceId);
  const plain = await siteOnly("POST", "", CREATE);
  assert.equal("scope" in plain.json.credential, false);
  assert.equal((await siteOnly("POST", `/${plain.json.credential.id}/share`)).status, 400);
});
