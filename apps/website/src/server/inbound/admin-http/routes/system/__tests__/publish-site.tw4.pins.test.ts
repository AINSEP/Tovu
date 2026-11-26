import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import assert from "node:assert/strict";
import { createPublishSiteContext, registerAdminPublishTriggerRoute, publishPreviewFor, publishTargetsFor } from "../publish-site.js";
import test from "node:test";
import express from "express";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { registerAdminPublishSiteRoutes } from "#src/server/runtime/composition/modules/system-deploy";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import type { LoadedDeployTarget, DeployTargetRegistry } from "@jini-ai/devops/deploy/site/deploy-targets/types";

// Real registry/config/plan code runs; no provider or export can be reached by these refusals.
test("publish trigger preserves shape errors, validation order, and domain confirmation before consent", async t => {
  const routeErrors = createRouteIncidentReporter().errors;
  const calls: string[] = [];
  const target: LoadedDeployTarget = {
    pluginId: "fixture", descriptor: { id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [{ name: "customDomain", label: "Domain", required: false }] },
    module: { create: () => { throw new Error("must not construct provider"); }, validateConfig: config => config.customDomain === "invalid" ? "invalid domain" : null },
  };
  const registry: DeployTargetRegistry = { get: id => id === "fixture" ? target : undefined, list: () => [target], refusals: [] };
  const ports = {
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "fixture" }),
    loadDeployTargets: async () => { calls.push("registry"); return registry; },
    publishExecutionMode: "hosted-api-only", tracker: createNoopTracker({}),
  } satisfies Pick<RouteDeps, "workspaceId" | "authorize" | "loadDeployTargets" | "publishExecutionMode" | "tracker">;
  const app = express(); app.use(express.json({ strict: false }));
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  const deps = { ...createRouteDeps(), ...ports };
  // This pin exercises the missing-consent-service refusal, not the bootstrap owner's authorization.
  delete deps.siteConsent;
  registerAdminPublishSiteRoutes({ errors: routeErrors, app, deps });
  const base = await startTestServer(app, t), root = `${base}/api/admin/v1/workspaces/ws/system/publish`;
  const post = ({ body }: { body: unknown }, _options = {}) => fetch(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const cases: readonly [unknown, string][] = [
    [null, "request body must be a JSON object"], [[], "request body must be a JSON object"], [7, "request body must be a JSON object"],
    [{}, "'projectName' (non-empty string) is required"], [{ projectName: " " }, "'projectName' (non-empty string) is required"],
    [{ projectName: 7 }, "'projectName' (non-empty string) is required"],
    ...[null, 7, "", " "].map(credentialId => [{ projectName: "site", credentialId }, "'credentialId' must be a non-empty string when present"] as [unknown, string]),
    ...[undefined, 7, "", " "].map(target => [{ projectName: "site", target }, "'target' (non-empty string) is required"] as [unknown, string]),
  ];
  for (const [body, error] of cases) {
    const response = await post({ body }); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error });
  }
  assert.deepEqual(calls, []);
  for (const credentialId of [undefined, " selected "]) {
    const response = await post({ body: { projectName: " site ", target: "fixture", customDomain: "example.test", credentialId } });
    assert.equal(response.status, 409); assert.equal((await response.json()).code, "DOMAIN_CONFIRMATION_REQUIRED");
  }
  for (const [body, error] of [
    [{ target: "missing" }, "publish target 'missing' is not available; choose one of: fixture"],
    [{ target: "fixture", customDomain: 1 }, "'customDomain' must be a string"],
    [{ target: "fixture", customDomain: "invalid" }, "invalid domain"],
  ] as const) {
    const response = await post({ body: { projectName: "site", ...body } }); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error });
  }
  const consent = await post({ body: { projectName: "site", target: "fixture" } });
  assert.equal(consent.status, 409); assert.match(JSON.stringify(await consent.json()), /CONSENT_UNAVAILABLE/);
});


test("chosen credential reaches the start unchanged and busy or consent refusal starts nothing", { timeout: 5000 }, async t => {
  const target: LoadedDeployTarget = { pluginId: "fixture", descriptor: { id: "fixture", label: "Fixture", module: "fixture.mjs", configFields: [] }, module: { create: () => assert.fail("no provider") } };
  const registry: DeployTargetRegistry = { get: id => id === "fixture" ? target : undefined, list: () => [target], refusals: [] };
  const deps = { ...createRouteDeps(), workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "fixture" }), loadDeployTargets: async () => registry };
  assert.ok(deps.siteConsent);
  let blocked = true;
  deps.siteConsent.deploymentCheck = async () => blocked ? { code: "CONSENT_REVIEW_REQUIRED", error: "Review consent", blockingProblems: [], choices: [] } : null;
  let entered!: () => void, release!: () => void, settled!: () => void;
  const seen = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { settled = resolve; });
  t.after(() => release());
  deps.tracker = { ...deps.tracker, capture: async event => { if (event.name === "deploy_finished") settled(); } };
  const chosen: string[] = [];
  const context = createPublishSiteContext({ deps });
  context.credentialSource = {
    isConfigured: async () => ({ configured: false, reason: "fixture" }),
    resolve: async input => { chosen.push(input.credentialId!); entered(); await held; return { ok: false, reason: "fixture" }; },
  };
  const app = express(); app.use(express.json()); app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminPublishTriggerRoute({ app, context });
  const base = await startTestServer(app, t), root = `${base}/api/admin/v1/workspaces/ws/system/publish`;
  const post = () => fetch(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "fixture", projectName: "site", credentialId: " selected " }) });
  assert.equal((await post()).status, 409); assert.deepEqual(chosen, []);
  blocked = false;
  const started = await post(); assert.equal(started.status, 202);
  await seen;
  assert.deepEqual(chosen, [" selected "]);
  assert.equal((await post()).status, 409);
  assert.deepEqual(chosen, [" selected "]);
  release(); await finished;
});


test('preview skips inspection after failed planning or readiness and target descriptors expose only public fields', async () => {
  let invalid = true;
  let configured = true;
  let inspections = 0;
  const target: LoadedDeployTarget = {
    pluginId: 'fixture', descriptor: { id: 'fixture', label: 'Fixture', module: 'private.mjs', configFields: [] },
    module: { create: () => { throw new Error('no provider'); }, validateConfig: () => invalid ? 'invalid config' : null,
      preview: async () => { inspections++; throw new Error('must not inspect'); } },
  };
  const registry: DeployTargetRegistry = { get: id => id === 'fixture' ? target : undefined, list: () => [target], refusals: [] };
  const deps = { ...createRouteDeps(), loadDeployTargets: async () => registry };
  const context = { deps, credentialSource: {
    isConfigured: async () => configured ? { configured: true as const } : { configured: false as const, reason: 'not ready' },
    resolve: async () => { throw new Error('must not resolve'); },
  } };
  const preview = publishPreviewFor({ context });
  const planned = await preview({ query: { target: 'fixture' } });
  assert.equal(planned.ok && planned.value.valid, false);
  invalid = false; configured = false;
  const unready = await preview({ query: { target: 'fixture' } });
  assert.equal(unready.ok && unready.value.credentialsConfigured, false);
  assert.equal(inspections, 0);
  assert.deepEqual(await publishTargetsFor({ deps })(), [{ id: 'fixture', label: 'Fixture', defaultForNewDestination: false,
    authenticatedPreview: true, configFields: [] }]);
});
