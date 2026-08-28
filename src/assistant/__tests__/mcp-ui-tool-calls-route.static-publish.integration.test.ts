import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildStaticPublishRegistrations, type StaticPublishToolDeps } from "#src/features/deployments/publish-agent-tools";
// Real implementation of `StaticPublishToolDeps.vendorCredentials` — production wiring for this lives
// in `assistant/tool-registrations.ts`'s `buildAssistantToolRegistrations`, which this test bypasses
// (it calls `buildStaticPublishRegistrations` directly, same as `publish-agent-tools.unit.test.ts`).
import { createVendorCredential, listVendorCredentials, PUBLISH_PROVIDER_TO_VENDOR, updateVendorCredential } from "#src/features/vendor-credentials/index";
import type { DeployFile, DeployPublishInput, DeployPublishResult, DeployTarget } from "@jini-ai/devops/deploy";
import type { PublishCredentialSource } from "#src/features/deployments/static-publish/index";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file Real, non-mocked proof that A4's "approval gate" — the pre-existing MCP-UI
 * held-open-exchange mechanism (ADR-055 Decisions 1/2), the same one `content_post_delete` proved
 * out (`mcp-ui-tool-calls-route.integration.test.ts`, which this file mirrors closely) — actually
 * fires for `deployment_execute_static_publish`, and that the read-only sibling tool
 * (`deployment_get_static_publish_capabilities`) is correctly NOT subject to it.
 *
 * This is deliberately a level below `publish-agent-tools.unit.test.ts`'s own execute-tool coverage:
 * that file calls `surfaceExchanges.deliver(...)` directly (the store's own API), which proves the
 * HANDLER's state machine but never touches `isMcpUiToolCallAllowed` or the real HTTP route a
 * browser's confirmation click actually posts to. A tool absent from `MCP_UI_REDEEMABLE_TOOL_IDS`
 * would still pass every one of that file's tests — `surfaceExchanges.deliver()` does not consult
 * the allowlist at all, only `registerMcpUiToolCallsRoute` does (`mcp-ui-tool-calls-route.ts:184`).
 * So the allowlist gate is a genuinely separate, previously-unproven hop: this file proves it by
 * going over real HTTP into the real route, exactly as `apps/admin`'s rendered confirmation dialog
 * would when a human clicks "Publish".
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
    vendorCredentials: { list: listVendorCredentials, create: createVendorCredential, update: updateVendorCredential, providerToVendor: PUBLISH_PROVIDER_TO_VENDOR },
  };

  const registry = createToolRegistry();
  for (const registration of buildStaticPublishRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  // Same construction as `agent-daemon-server.ts`'s own `createToolExecutor({ registry })` call —
  // no `delegate` — so this exercises the real production configuration, not an idealized one.
  const toolExecutor = createToolExecutor({ registry });
  return { toolExecutor, captured };
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe
 *  would (same technique `mcp-ui-tool-calls-route.integration.test.ts` uses for `content_post_delete`). */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Calls `deployment_execute_static_publish` through the REAL executor, exactly as a spawned
 *  agent's first (and only) call would — including the `emitSurface` `delegated-tool-bridge.ts`
 *  always supplies. */
async function openRealDialog(
  toolExecutor: ReturnType<typeof buildRealStaticPublishToolExecutor>["toolExecutor"],
): Promise<{ pending: ReturnType<typeof toolExecutor.execute>; exchangeId: string }> {
  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    "deployment_execute_static_publish",
    { target: "vercel", projectName: "demo-site" },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  return { pending, exchangeId: exchangeIdFromEmission(emitted[0]) };
}

test("real round trip: a browser confirmation click for deployment_execute_static_publish is accepted by the allowlist and actually publishes", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor, captured } = buildRealStaticPublishToolExecutor(surfaceExchanges);

  const { pending, exchangeId } = await openRealDialog(toolExecutor);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: "deployment_execute_static_publish",
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    }),
  });

  const body = (await res.json()) as { delivered: boolean };
  // The load-bearing status code: if `deployment_execute_static_publish` were missing from
  // `MCP_UI_REDEEMABLE_TOOL_IDS`, this route refuses BEFORE ever touching the exchange
  // (`mcp-ui-tool-calls-route.ts:184`) and this would be 403 TOOL_NOT_ALLOWLISTED, not 202 — so a
  // 202 here is proof the allowlist gate let this specific tool id through, not merely that it is
  // declared somewhere in source.
  assert.equal(res.status, 202, `expected the allowlist to accept this delivery: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  const executed = await pending;
  assert.equal(executed.status, "completed", `the parked call must resolve completed: ${JSON.stringify(executed)}`);
  const output = executed.output as { published: boolean; target: string; url: string };
  assert.equal(output.published, true, `expected a real publish to have happened: ${JSON.stringify(output)}`);
  assert.equal(output.target, "vercel");
  assert.equal(output.url, "https://example.test/published");
  assert.ok(captured.value && captured.value.length > 0, "the real hermetic fixture must have actually exported files for the fake deploy target to receive");
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

  const result = await toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, "deployment_get_static_publish_capabilities", {});

  assert.equal(result.status, "completed", `expected the read tool to complete normally: ${JSON.stringify(result)}`);
  const output = result.output as { providers: unknown[] };
  // 5 providers as of the s3-compatible ("Custom" tab) addition — spec
  // `custom-publish-provider-contract.md` §10.7 — not 4.
  assert.equal(output.providers.length, 5);
});
