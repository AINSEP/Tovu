import { createNoopObservabilityPort } from "@jini-ai/diagnostics/observability";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { InMemoryVendorCredentialSetRepo } from "#src/features/deployments/publish-credentials/repo.memory";
import { createPublishCredential, describeCredential, resolveForPublish } from "#src/features/deployments/publish-credentials/index";
import { InMemoryPublishCredentialVerificationCache } from "#src/features/deployments/static-publish/verify";
import type { DeployTargetRegistry, LoadedDeployTarget } from "#src/features/deployments/deploy-targets/types";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminPublishCredentialsRoutes, type AdminPublishCredentialsDeps } from "../publish-credentials.js";

const path = "/api/admin/v1/workspaces/:workspaceId/system/publish/credentials/:id";
async function fixture({ accountLabel }: { accountLabel?: string } = {}, _options = {}) {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryVendorCredentialSetRepo({});
  const sealer = new AesGcmSecretSealer(keyring);
  const cache = new InMemoryPublishCredentialVerificationCache();
  let probes = 0, id = 0, allowed = true;
  const target: LoadedDeployTarget = { pluginId: "pin", descriptor: { id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [],
    credential: { vendorId: "fixture", tokenField: "token", fields: [{ name: "token", label: "Token", required: true, secret: true }] } },
    module: { create: () => { throw new Error("no publish in route pins"); }, verifyCredential: async () => { probes++; return { ok: true, accountLabel }; } } };
  const registry: DeployTargetRegistry = { get: name => name === "fixture" ? target : undefined, list: () => [target], refusals: [] };
  const clock = { nowMs: () => 0, nowIso: () => "2026-10-20T00:00:00.000Z" };
  const writeDeps = { repo, sealer, keyring, clock, idGen: { newId: () => `credential-${++id}` }, loadDeployTargets: async () => registry };
  const saved = await createPublishCredential(writeDeps, { workspaceId: "ws", label: "Original", connection: { providerId: "fixture", token: ["fixture", "original"].join("-") } });
  const ports = { observability: createNoopObservabilityPort({}), workspaceId: "ws", authorize: async () => ({ allowed, reason: "pin" }), clock, idGen: writeDeps.idGen,
    vendorCredentialSetRepo: repo, siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring,
    publishExecutionMode: "hosted-api-only", publishCredentialVerificationCache: cache, loadDeployTargets: writeDeps.loadDeployTargets,
  } satisfies Omit<AdminPublishCredentialsDeps, "contentKernel">;
  const app = express();
  // PUT never uses contentKernel; the fake provider performs no outbound request/observability work.
  registerAdminPublishCredentialsRoutes(app, ports as AdminPublishCredentialsDeps);
  return { saved, cache, repo, ports, probes: () => probes, deny: () => { allowed = false; },
    async call(method: "get" | "post" | "delete", routePath: string, { params = { workspaceId: "ws" }, body }: { params?: Record<string, string>; body?: unknown } = {}) {
      const { res, capture } = createCapturingResponse(); res.locals.principal = { id: "owner" };
      res.end = (() => res) as typeof res.end;
      await extractRouteHandler(app, method, routePath)({ params, body }, res);
      return capture;
    },
    summary: () => describeCredential(writeDeps, { workspaceId: "ws", id: saved.id }),
    stored: () => repo.findById({ workspaceId: "ws", id: saved.id }),
    resolve: () => resolveForPublish(writeDeps, { workspaceId: "ws", id: saved.id }),
    async put({ body, workspaceId = "ws", credentialId = saved.id }: { body?: unknown; workspaceId?: string; credentialId?: string }, _options = {}) {
      const { res, capture } = createCapturingResponse(); res.locals.principal = { id: "owner" };
      await extractRouteHandler(app, "put", path)({ params: { workspaceId, id: credentialId }, body }, res);
      return capture;
    },
  };
}

test("publish update omits undefined fields, preserves false/empty values and verifies only a supplied connection", async () => {
  const f = await fixture();
  for (const body of [undefined, null, {}, { label: undefined, connection: undefined, isDefault: undefined, worksFor: undefined }]) {
    const response = await f.put({ body }); assert.equal(response.statusCode, 200);
    assert.equal(Object.hasOwn(response.jsonBody as object, "verification"), false);
    assert.equal((await f.resolve())?.label, "Original");
  }
  assert.equal((await f.put({ body: { label: "Renamed", isDefault: false, worksFor: [] } })).statusCode, 200);
  const renamed = await f.summary(); assert.equal(renamed?.label, "Renamed"); assert.equal((await f.stored())?.isDefault, true); assert.deepEqual(renamed?.worksFor, []);
  assert.equal(await f.resolve(), null);
  assert.equal(f.probes(), 0);
  await f.put({ body: { worksFor: ["fixture"] } });
  const changed = await f.put({ body: { connection: { providerId: "fixture", token: ["fixture", "replacement"].join("-") } } });
  assert.equal(changed.statusCode, 200); assert.equal(f.probes(), 1);
  assert.equal((changed.jsonBody as { verification: { status: string } }).verification.status, "valid");
  assert.equal((await f.resolve())?.connection.token, ["fixture", "replacement"].join("-"));
});

test("publish update passes explicit invalid values to store validation and keeps missing-row and auth refusals", async () => {
  for (const body of [{ label: null }, { connection: null }, { isDefault: null }, { worksFor: null }, { label: "" }]) {
    const f = await fixture(); assert.equal((await f.put({ body })).statusCode, 400); assert.equal(f.probes(), 0);
  }
  const f = await fixture();
  assert.equal((await f.put({ body: {}, workspaceId: "other" })).statusCode, 404);
  assert.equal((await f.put({ body: {}, credentialId: "missing" })).statusCode, 404);
  f.deny(); assert.equal((await f.put({ body: {} })).statusCode, 403);
});

test("publish update invalidates cached compatibility only when worksFor changes eligibility", async () => {
  const f = await fixture();
  const key = { workspaceId: "ws", target: "fixture" };
  const result = { status: "valid" as const, message: "cached", checkedAt: "2026-10-20T00:00:00.000Z" };
  f.cache.set(key, result);
  await f.put({ body: { label: "Rename" } }); assert.deepEqual(f.cache.get(key), result);
  await f.put({ body: { worksFor: [] } }); assert.equal(f.cache.get(key), undefined);
});


test("account-label healing failure returns 500 after saving and logs only a safe code", async t => {
  const f = await fixture({ accountLabel: "fixture-account" });
  const failure = new Error("provider token=private-token; email=private@example.test");
  t.mock.method(f.repo, "updateAccountLabel", async () => { throw failure; });
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const token = ["fixture", "saved-before-heal"].join("-");
  assert.deepEqual(await f.put({ body: { connection: { providerId: "fixture", token } } }), {
    statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" },
  });
  assert.equal((await f.resolve())?.connection.token, token);
  assert.deepEqual(logs, [["[publish-credentials]", "INTERNAL_ERROR"]]);
});

const collection = "/api/admin/v1/workspaces/:workspaceId/system/publish/credentials";

test("publish list and delete map an unexpected store failure to a fixed 500 that logs only a safe code", async t => {
  const f = await fixture();
  const logged = t.mock.method(console, "error", () => {});
  const fault = async () => { throw new Error("vault unreachable at /private/vault.db"); };
  t.mock.method(f.repo.vault, "list", fault);
  assert.deepEqual(await f.call("get", collection), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
  assert.deepEqual(await f.call("delete", path, { params: { workspaceId: "ws", id: f.saved.id } }), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
  assert.deepEqual(logged.mock.calls.map(c => c.arguments), [["[publish-credentials]", "INTERNAL_ERROR"], ["[publish-credentials]", "INTERNAL_ERROR"]]);
});

test("publish list still answers when the after-response account-label heal cannot load deploy targets", async t => {
  const f = await fixture();
  const logged = t.mock.method(console, "error", () => {});
  let loads = 0;
  const loadFailure = new Error("deploy target plugins unavailable");
  // The list reads targets through the read ports bound at registration; only the heal that runs
  // after the response re-reads `deps.loadDeployTargets`, so this failure can reach the heal alone.
  f.ports.loadDeployTargets = async () => { loads++; throw loadFailure; };
  const listed = await f.call("get", collection);
  assert.equal(listed.statusCode, 200);
  assert.deepEqual((listed.jsonBody as { credentials: Array<{ id: string }> }).credentials.map(c => c.id), [f.saved.id]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 1);
  assert.deepEqual(logged.mock.calls.map(c => c.arguments), [["[publish-credentials] account-label heal skipped: deploy targets could not be loaded", loadFailure]]);
});

test("publish create reports no verification when the new row vanished before it could be verified", async t => {
  const f = await fixture();
  // The save's compatibility invalidation runs between the write and its verification; from that
  // point on, simulate a concurrent delete by making the vault inventory come back empty.
  t.mock.method(f.cache, "delete", () => { t.mock.method(f.repo.vault, "list", async () => []); });
  const created = await f.call("post", collection, { body: { label: "Second", worksFor: ["fixture"], connection: { providerId: "fixture", token: ["fixture", "second"].join("-") } } });
  assert.equal(created.statusCode, 201, JSON.stringify(created.jsonBody));
  assert.equal(Object.hasOwn(created.jsonBody as object, "verification"), false);
  assert.equal((created.jsonBody as { credential: { label: string } }).credential.label, "Second");
  assert.equal(f.probes(), 0);
});
