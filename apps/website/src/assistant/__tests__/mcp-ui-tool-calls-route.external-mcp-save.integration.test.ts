import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildExternalMcpRegistrations } from "#src/features/external-mcp/tool-registrations";
import type { ExternalMcpToolDeps } from "#src/features/external-mcp/deps";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file Real, non-mocked proof that `external_mcp_save`'s confirmation gate reaches the actual
 * allowlist a browser's "Add server" click posts to — the exact hop `mcp-ui-tool-calls-route.
 * static-publish.integration.test.ts`'s own module doc names as "previously-unproven": neither
 * `tool-registrations.external-mcp.test.ts` (this domain's own handler-level file, which calls
 * `surfaceExchanges.deliver()` directly) nor the catalog/wiring tests ever call this route, and
 * `deliver()` itself never consults `isMcpUiToolCallAllowed` — only `registerMcpUiToolCallsRoute`
 * does (`mcp-ui-tool-calls-route.ts:184`). That gap is exactly how `external_mcp_save` shipped
 * missing from `MCP_UI_REDEEMABLE_TOOL_IDS` (`assistant/mcp-ui-tool-calls.ts`) with every
 * handler-level test green — caught only by a live "Add server" click through the real admin dock
 * while attempting to recover a deleted connection (ADS-memory/reports/
 * 2026-09-08-dock-recovery-product-test.md, Part 2's verbatim transcript), which returned
 * `403 TOOL_NOT_ALLOWLISTED` instead of ever reaching `saveExternalMcpServer`. This file is the test
 * that would have caught it: `res.status === 202` here is proof the allowlist itself accepted this
 * specific tool id, not merely that the tool is declared and wired somewhere in source. Mirrors
 * `mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts`'s shape exactly.
 */

const WORKSPACE_ID = "ws-mcp-ui-external-mcp-save-integration";
const PRINCIPAL = "principal-admin-1";

/** Builds the real tool surface for the external-mcp domain: one registry, one production-shaped
 *  executor (no `delegate`, matching `agent-daemon-server.ts`'s own construction), over the real
 *  hermetic `createRouteDeps()` fixture — same discipline as the media/static-publish integration
 *  tests this mirrors. */
function buildRealExternalMcpToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
  const deps: ExternalMcpToolDeps = {
    ...createRouteDeps(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
  };

  const registry = createToolRegistry();
  for (const registration of buildExternalMcpRegistrations(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return { toolExecutor };
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe
 *  would (same technique the media/static-publish integration tests use). */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

test("real round trip: a browser confirmation click for external_mcp_save is accepted by the allowlist and actually saves the server", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor } = buildRealExternalMcpToolExecutor(surfaceExchanges);

  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    "external_mcp_save",
    { id: "higgsfield", transport: "streamable_http" },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the connection form must be emitted before the call parks");
  const exchangeId = exchangeIdFromEmission(emitted[0]!);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: "external_mcp_save",
      params: {
        [SURFACE_EXCHANGE_ID_PARAM]: exchangeId,
        id: "higgsfield",
        transport: "streamable_http",
        url: "https://mcp.higgsfield.ai/mcp",
        allowedToolNames: "generate_image",
      },
    }),
  });

  const body = (await res.json()) as { delivered: boolean };
  // The load-bearing status code: if `external_mcp_save` were missing from
  // `MCP_UI_REDEEMABLE_TOOL_IDS`, this route refuses BEFORE ever touching the exchange
  // (`mcp-ui-tool-calls-route.ts:184`) and this would be 403 TOOL_NOT_ALLOWLISTED, not 202 — the
  // exact failure a live "Add server" click through the admin dock produced against the unfixed
  // build (ADS-memory/reports/2026-09-08-dock-recovery-product-test.md, Part 2).
  assert.equal(res.status, 202, `expected the allowlist to accept this delivery: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  const executed = await pending;
  assert.equal(executed.status, "completed", `the parked call must resolve completed: ${JSON.stringify(executed)}`);
  const output = executed.output as { saved: boolean; server: { serverId: string; url: string | null } };
  assert.equal(output.saved, true);
  assert.equal(output.server.serverId, "higgsfield");
  assert.equal(output.server.url, "https://mcp.higgsfield.ai/mcp");
});

test("SECURITY: a Cancel click for external_mcp_save also reaches the allowlist and reports the cancellation, not a 403", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor } = buildRealExternalMcpToolExecutor(surfaceExchanges);

  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    "external_mcp_save",
    { id: "cancelled-one", transport: "streamable_http" },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromEmission(emitted[0]!);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: "external_mcp_save",
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true },
    }),
  });

  assert.equal(res.status, 202, "Cancel must reach the exchange too — the allowlist gates the tool, not the decision");

  const executed = await pending;
  const output = executed.output as { saved: boolean; cancelled: boolean };
  assert.equal(output.saved, false);
  assert.equal(output.cancelled, true);
});
