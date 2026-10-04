import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildStaticPublishRegistrations, type StaticPublishToolDeps } from "#src/features/deployments/publish-agent-tools";
import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";
import type { PublishCredentialSource } from "#src/features/deployments/static-publish/index";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { loadBundledDeployTargets } from "#src/features/deployments/deploy-targets/__tests__/bundled-deploy-targets.fixture";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file Real, non-mocked proof of how the static-publish tools meet the MCP-UI callback route a
 * browser's click posts to.
 *
 * Until 2026-10-01 this proved A4's "approval gate" — the MCP-UI held-open-exchange mechanism
 * (ADR-055 Decisions 1/2) that `content_post_delete` proved out — fired for
 * `deployment_execute_static_publish`, and that a human's "Publish" click over real HTTP reached
 * `MCP_UI_REDEEMABLE_TOOL_IDS`. That hop mattered because `publish-agent-tools.unit.test.ts` only
 * ever called `surfaceExchanges.deliver(...)` directly, which never consults the allowlist; only
 * `registerMcpUiToolCallsRoute` does.
 *
 * 6eac86229 ("confirm destructive and protected actions only", 2026-10-01) removed that gate on
 * the owner's call that publishing is an ordinary action the agent may take, and took the id off
 * the allowlist (`mcp-ui-tool-calls.test.ts`: "runs normally and cannot be executed by a surface
 * callback"). So this file now proves, against the real handler and route: the publish completes in
 * one call with no confirmation exchange, and this route refuses to run it. The read-only sibling
 * (`deployment_get_static_publish_capabilities`) is still refused here too, and still runs through
 * the ordinary executor path.
 */

const WORKSPACE_ID = "ws-mcp-ui-static-publish-integration";
const PRINCIPAL = "principal-admin-1";

/** Records every `publish()` call's file set and returns a canned success result — never touches
 *  `fetch` (mirrors `publish-agent-tools.unit.test.ts`'s identical helper). */
function fakeDeployTarget(captured: { value: DeployFile[] | null }): DeployTarget {
  return {
    id: "fake",
    async publish(input: DeployPublishInput): Promise<DeployPublishResult> {
      captured.value = input.files;
      return { targetId: "fake", url: "https://example.test/published", status: "ready" };
    },
    async checkReachability() {
      return { reachable: true, status: "ready" as const };
    },
  };
}

const CONFIGURED_CREDENTIAL_SOURCE: PublishCredentialSource = {
  async resolve() {
    return { ok: true, token: "fake-token-never-real" };
  },
  async isConfigured() {
    return { configured: true };
  },
};

/** Builds the real tool surface for the static-publish domain: one registry, one
 *  production-shaped executor (no `delegate`, matching `agent-daemon-server.ts`'s own
 *  construction), over the real hermetic `createRouteDeps()` fixture. */
function buildRealStaticPublishToolExecutor(
  surfaceExchanges: SurfaceExchangeStore,
  options: { credentialSource?: PublishCredentialSource; captured?: { value: DeployFile[] | null } } = {},
) {
  const captured = options.captured ?? { value: null };
  const deps: StaticPublishToolDeps = {
    ...createRouteDeps(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
    credentialSource: options.credentialSource ?? CONFIGURED_CREDENTIAL_SOURCE,
    buildTarget: () => fakeDeployTarget(captured),
    loadDeployTargets: loadBundledDeployTargets,
  };

  const registry = createToolRegistry({});
  for (const registration of buildStaticPublishRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  // Same construction as `agent-daemon-server.ts`'s own `createToolExecutor({ registry })` call —
  // no `delegate` — so this exercises the real production configuration, not an idealized one.
  const toolExecutor = createToolExecutor({ registry });
  return { toolExecutor, captured };
}

/** The emitted surface's HTML, the way the rendered iframe would read it. */
function surfaceHtml(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  return resource?.resource?.text ?? "";
}

const PUBLISH_INPUT = { target: "vercel", projectName: "demo-site" };

test("deployment_execute_static_publish publishes in one call and opens no confirmation exchange", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor, captured } = buildRealStaticPublishToolExecutor(surfaceExchanges);

  const emitted: SurfaceEmission[] = [];
  const executed = await toolExecutor.execute({ principal: { id: PRINCIPAL }, run: { id: "run-1" }, toolId: "deployment_execute_static_publish", input: PUBLISH_INPUT }, { emitSurface: async (emission: SurfaceEmission) => {
    emitted.push(emission);
  } });

  assert.equal(executed.status, "completed", `the call must complete on its own: ${JSON.stringify(executed)}`);
  const output = executed.output as { published: boolean; target: string; url: string };
  assert.equal(output.published, true, `expected a real publish to have happened: ${JSON.stringify(output)}`);
  assert.equal(output.target, "vercel");
  assert.equal(output.url, "https://example.test/published");
  assert.ok(captured.value && captured.value.length > 0, "the real hermetic fixture must have actually exported files for the fake deploy target to receive");
  // Whatever it shows (an outcome card), nothing it emits asks a human for an answer.
  for (const emission of emitted) {
    assert.doesNotMatch(surfaceHtml(emission), new RegExp(SURFACE_EXCHANGE_ID_PARAM), "a publish must not open a confirmation exchange");
  }
});

test("SECURITY: a surface callback cannot run deployment_execute_static_publish — the route refuses it with 403 and never reaches the executor", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor, captured } = buildRealStaticPublishToolExecutor(surfaceExchanges);

  let routeExecutions = 0;
  const countingExecutor = {
    ...toolExecutor,
    execute: (...args: Parameters<typeof toolExecutor.execute>) => {
      routeExecutions += 1;
      return toolExecutor.execute(...args);
    },
  };
  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor: countingExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({ toolName: "deployment_execute_static_publish", params: PUBLISH_INPUT }),
  });

  const body = (await res.json()) as { code?: string };
  assert.equal(res.status, 403, `expected the allowlist to refuse this call: ${JSON.stringify(body)}`);
  assert.equal(body.code, "TOOL_NOT_ALLOWLISTED");
  assert.equal(routeExecutions, 0, "a refused callback must never reach the tool executor");
  assert.equal(captured.value, null, "nothing may have been published");
});

test("SECURITY: deployment_get_static_publish_capabilities is refused by this same route — it is a read tool with nothing to confirm, and must not become reachable through the confirmation channel", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor } = buildRealStaticPublishToolExecutor(surfaceExchanges);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  // Shape 2 framing (no exchangeId) — the closest thing to "just call it through this route" a
  // misbehaving or malicious client could attempt, since this tool never opens an exchange for
  // Shape 1 to apply to.
  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({ toolName: "deployment_get_static_publish_capabilities", params: {} }),
  });

  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "TOOL_NOT_ALLOWLISTED");
});

test("deployment_get_static_publish_capabilities still runs fine through the ordinary (non-MCP-UI) executor path — being excluded from the confirmation allowlist does not mean it is broken or unreachable", async () => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor } = buildRealStaticPublishToolExecutor(surfaceExchanges);

  const result = await toolExecutor.execute({ principal: { id: PRINCIPAL }, run: { id: "run-1" }, toolId: "deployment_get_static_publish_capabilities", input: {} });

  assert.equal(result.status, "completed", `expected the read tool to complete normally: ${JSON.stringify(result)}`);
  const output = result.output as { providers: { providerId: string }[] };
  // 5 providers as of the s3-compatible ("Custom" tab) addition — spec
  // `custom-publish-provider-contract.md` §10.7 — not 4.
  assert.deepEqual(output.providers.map(({ providerId }) => providerId).sort(),
    ["cloudflare-pages", "github-pages", "netlify", "s3-compatible", "vercel"]);
});
