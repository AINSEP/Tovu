import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createCapturingResponse, extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createPublishCredential } from "#src/features/deployments/publish-credentials/index";
import type { DeployTargetRegistry, LoadedDeployTarget } from "#src/features/deployments/deploy-targets/types";
import { InMemoryPublishHistoryStore } from "#src/features/deployments/static-publish/publish-history";
import { registerAdminPublishSiteRoutes } from "../publish-site.js";

/**
 * @file The read-only publish routes (`publish-targets`, `publish/destinations`, `publish/preview`)
 * against a hand-built deploy-target registry, so each projection branch is pinned exactly rather
 * than inferred from whatever the bundled plugins happen to declare (the route suite in
 * `server/__tests__/routes/publish-site-route.test.ts` uses those): registry refusals are logged and
 * never returned, optional descriptor parts appear only when declared, a publishing-grant request
 * reads peers through its grant rather than the session authorizer, an invalid `credentialId` on an
 * authenticated preview is a 400, and an unexpected failure is a fixed 500. No provider `create`
 * can run — the fixture target throws if constructed.
 */

const ROOT = "/api/admin/v1/workspaces/:workspaceId/system";
const REFUSAL = "plugin 'broken' refused: descriptor id collides with 'fixture'";

const credentialTarget: LoadedDeployTarget = {
  pluginId: "fixture-plugin",
  descriptor: {
    id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [],
    credential: { vendorId: "fixture-vendor", vendorLabel: "Fixture Co", help: "Paste a fixture token.", tokenField: "token",
      fields: [{ name: "token", label: "Token", required: true, secret: true }] },
    i18n: { es: { "Fixture": "Accesorio" } },
  },
  module: { create: () => { throw new Error("no provider may be constructed by a read route"); } },
};
const bareTarget: LoadedDeployTarget = {
  pluginId: "bare-plugin",
  descriptor: { id: "bare", label: "Bare", module: "bare.mjs", configFields: [] },
  module: { create: () => { throw new Error("no provider may be constructed by a read route"); } },
};
const userHelpTarget: LoadedDeployTarget = {
  pluginId: "user-help-plugin",
  descriptor: { id: "user-help", label: "User help", module: "user-help.mjs", configFields: [],
    credential: { vendorId: "user-help-vendor", userHelp: "Ask your admin for a key.", tokenPageUrl: "https://tokens.example.test/", tokenField: "key",
      fields: [{ name: "key", label: "Key", required: true, secret: true }] } },
  module: { create: () => { throw new Error("no provider may be constructed by a read route"); } },
};
const TARGETS = [credentialTarget, bareTarget, userHelpTarget];
const registry: DeployTargetRegistry = {
  get: (id) => TARGETS.find((t) => t.descriptor.id === id),
  list: () => TARGETS,
  refusals: [REFUSAL],
};

function setup(overrides: Partial<ReturnType<typeof createRouteDeps>> = {}) {
  const base = createRouteDeps();
  const permissions: string[] = [];
  const deps = {
    ...base,
    loadDeployTargets: async () => registry,
    publishHistoryStore: new InMemoryPublishHistoryStore(),
    authorize: async (input: { permission: string }) => { permissions.push(input.permission); return { allowed: input.permission !== "publish_content.read", reason: "fixture" }; },
    ...overrides,
  };
  const app = express();
  return { app, deps, permissions, register: () => registerAdminPublishSiteRoutes(app, deps) };
}

async function direct(app: express.Express, path: string, req: object, locals: Record<string, unknown> = { principal: { id: "owner" } }) {
  const { res, capture } = createCapturingResponse();
  Object.assign(res.locals, locals);
  await extractRouteHandler(app, "get", ROOT + path)({ query: {}, ...req }, res);
  return capture;
}

test("publish-targets: refusals are logged, never returned; optional descriptor parts appear only when declared", async (t) => {
  const warned = t.mock.method(console, "warn", () => {});
  const { app, deps, register } = setup();
  register();
  const listed = await direct(app, "/publish-targets", { params: { workspaceId: deps.workspaceId } });
  assert.deepEqual(listed, { statusCode: 200, jsonBody: { targets: [
    { id: "fixture", label: "Fixture", defaultForNewDestination: false, authenticatedPreview: false, configFields: [],
      credential: { vendorLabel: "Fixture Co", help: "Paste a fixture token.", tokenField: "token",
        fields: [{ name: "token", label: "Token", required: true, secret: true }] },
      i18n: { es: { "Fixture": "Accesorio" } } },
    { id: "bare", label: "Bare", defaultForNewDestination: false, authenticatedPreview: false, configFields: [] },
    { id: "user-help", label: "User help", defaultForNewDestination: false, authenticatedPreview: false, configFields: [],
      credential: { userHelp: "Ask your admin for a key.", tokenPageUrl: "https://tokens.example.test/", tokenField: "key",
        fields: [{ name: "key", label: "Key", required: true, secret: true }] } },
  ] } });
  assert.deepEqual(warned.mock.calls.map((c) => c.arguments), [[`[publish-site] ${REFUSAL}`]]);
});

test("publish-targets and destinations: a request with no :workspaceId param 404s (direct handler call)", async () => {
  const { app, register } = setup();
  register();
  for (const path of ["/publish-targets", "/publish/destinations"]) {
    assert.deepEqual(await direct(app, path, { params: {} }), { statusCode: 404, jsonBody: { error: "workspace was not found" } }, path);
  }
});

test("publish-targets and destinations: a registry load failure is a fixed 500 that never echoes the cause", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const cause = new Error("plugin directory unreadable at /private/plugins");
  const { app, deps, register } = setup({ loadDeployTargets: async () => { throw cause; } });
  register();
  for (const path of ["/publish-targets", "/publish/destinations"]) {
    assert.deepEqual(await direct(app, path, { params: { workspaceId: deps.workspaceId } }),
      { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } }, path);
  }
  assert.deepEqual(logged.mock.calls.map((c) => c.arguments), [
    ["[publish-site] unexpected error listing publish targets", cause],
    ["[publish-site] unexpected error listing publish destinations", cause],
  ]);
});

test("publish destinations: a publishing-grant request reads peers through its grant, not the session authorizer", async () => {
  const { app, deps, permissions, register } = setup();
  register();
  await deps.publishContentPeerRepo.insert({ workspaceId: deps.workspaceId, id: "peer-saved", label: "Live",
    baseUrl: "https://live.example.test", remoteWorkspaceId: "remote", sealed: null, masked: null,
    aadVersion: 1, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" });
  await deps.publishHistoryStore.recordSuccess({ workspaceId: deps.workspaceId, entry: {
    kind: "tovu-peer", target: "peer-saved", projectName: "", url: "https://live.example.test/", reachable: true,
    status: "applied", publishedAt: "2026-10-18T03:00:00Z", triggeredBy: "admin_ui" } });
  const publishTrust = { sourceInstallationId: "install-a", capabilities: ["system.read", "publish_content.read"], entityTypes: [], generation: 1 };
  const granted = await direct(app, "/publish/destinations", { params: { workspaceId: deps.workspaceId } }, { principal: { id: "owner" }, publishTrust });
  assert.equal(granted.statusCode, 200);
  assert.deepEqual((granted.jsonBody as Array<{ kind: string; peerId?: string }>).map((row) => [row.kind, row.peerId]), [["tovu-peer", "peer-saved"]]);
  // The session authorizer (which denies publish_content.read here) was never consulted.
  assert.deepEqual(permissions, []);
  const session = await direct(app, "/publish/destinations", { params: { workspaceId: deps.workspaceId } });
  assert.deepEqual(session, { statusCode: 200, jsonBody: [] });
  assert.deepEqual(permissions, ["system.read", "publish_content.read"]);
});

test("publish preview: refusals are logged; with a configured credential an invalid credentialId is a 400, an absent one inspects the named project", async (t) => {
  const warned = t.mock.method(console, "warn", () => {});
  const { app, deps, register } = setup();
  await createPublishCredential({ repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock, idGen: deps.idGen, loadDeployTargets: deps.loadDeployTargets },
  { workspaceId: deps.workspaceId, label: "Fixture token", connection: { providerId: "fixture", token: ["fixture", "preview"].join("-") } });
  register();
  const url = `${await startTestServer(express().use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); }).use(app), t)}/api/admin/v1/workspaces/${deps.workspaceId}/system/publish/preview`;
  const invalid = await fetch(`${url}?target=fixture&credentialId=%20`);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "credentialId must be a non-empty string naming the selected connection. Reload and choose it again.", code: "PROVIDER_INSPECTION_FAILED" });
  const inspected = await fetch(`${url}?target=fixture&projectName=site`);
  assert.equal(inspected.status, 200);
  const body = await inspected.json() as { target: string; valid: boolean; credentialsConfigured: boolean; credentialGuidance: unknown };
  assert.deepEqual([body.target, body.valid, body.credentialsConfigured, body.credentialGuidance], ["fixture", true, true, null]);
  assert.deepEqual(warned.mock.calls.map((c) => c.arguments), [[`[publish-site] ${REFUSAL}`], [`[publish-site] ${REFUSAL}`]]);
});
