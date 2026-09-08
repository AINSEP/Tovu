import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildMediaRegistrationsForTovu, type MediaPublicUrlDeps, type MediaToolDeps } from "#src/features/media/tool-registrations";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../run-ownership.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file Real, non-mocked proof that `media_trash_asset`'s confirmation gate reaches the actual
 * allowlist a browser's click posts to — the exact hop
 * `mcp-ui-tool-calls-route.static-publish.integration.test.ts`'s own module doc names as
 * "previously-unproven": neither `agent-tools.trash-confirmation.test.ts` (this domain's own
 * handler-level file) nor `assistant/__tests__/tool-registrations.media.test.ts` ever calls
 * `surfaceExchanges.deliver()` through this route, and `deliver()` itself never consults
 * `isMcpUiToolCallAllowed` — only `registerMcpUiToolCallsRoute` does
 * (`mcp-ui-tool-calls-route.ts:184`). That gap is exactly how `media_trash_asset` shipped for one
 * commit (31fdf17d, 2026-09-08) missing from `MCP_UI_REDEEMABLE_TOOL_IDS`
 * (`assistant/mcp-ui-tool-calls.ts`) with every other test green: the tool registered, its dialog
 * rendered with real asset data, and a human's "Trash asset"/"Cancel" click both failed with
 * `TOOL_NOT_ALLOWLISTED` — caught only by a live click through the admin assistant (ADS-memory/
 * reports/2026-09-08-delete-confirmation-build.md's verification section), not by any test. This
 * file is the test that would have caught it: `res.status === 202` here is proof the allowlist
 * itself accepted this specific tool id, not merely that the tool is declared somewhere in source.
 */

const WORKSPACE_ID = "ws-mcp-ui-media-trash-integration";
const PRINCIPAL = "principal-admin-1";
const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Builds the real tool surface for the media domain: one registry, one production-shaped executor
 *  (no `delegate`, matching `agent-daemon-server.ts`'s own construction), over the real hermetic
 *  `createRouteDeps()` fixture — same discipline as the static-publish integration test this mirrors. */
function buildRealMediaToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
  const deps: MediaToolDeps & MediaPublicUrlDeps = {
    ...createRouteDeps(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
  };

  const registry = createToolRegistry();
  for (const registration of buildMediaRegistrationsForTovu(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return { toolExecutor };
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the way the rendered iframe
 *  would (same technique the static-publish integration test uses). */
function exchangeIdFromEmission(emission: SurfaceEmission): string {
  const resource = (emission.payload as { resource?: { resource?: { text?: string } } }).resource;
  const html = resource?.resource?.text ?? "";
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

test("real round trip: a browser confirmation click for media_trash_asset is accepted by the allowlist and actually trashes the asset", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor } = buildRealMediaToolExecutor(surfaceExchanges);

  const uploaded = await toolExecutor.execute({ id: PRINCIPAL }, { id: "run-0" }, "media_upload_asset", {
    filename: "logo.png",
    contentType: "image/png",
    dataBase64: ONE_PIXEL_PNG_BASE64,
  });
  assert.equal(uploaded.status, "completed", `seed upload must succeed: ${JSON.stringify(uploaded)}`);
  const mediaId = (uploaded.output as { media: { id: string } }).media.id;

  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute(
    { id: PRINCIPAL },
    { id: "run-1" },
    "media_trash_asset",
    { mediaId },
    undefined,
    async (emission: SurfaceEmission) => {
      emitted.push(emission);
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const exchangeId = exchangeIdFromEmission(emitted[0]!);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({
      toolName: "media_trash_asset",
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    }),
  });

  const body = (await res.json()) as { delivered: boolean };
  // The load-bearing status code: if `media_trash_asset` were missing from
  // `MCP_UI_REDEEMABLE_TOOL_IDS`, this route refuses BEFORE ever touching the exchange
  // (`mcp-ui-tool-calls-route.ts:184`) and this would be 403 TOOL_NOT_ALLOWLISTED, not 202 — the
  // exact failure a live click through the admin assistant produced against the unfixed build.
  assert.equal(res.status, 202, `expected the allowlist to accept this delivery: ${JSON.stringify(body)}`);
  assert.equal(body.delivered, true);

  const executed = await pending;
  assert.equal(executed.status, "completed", `the parked call must resolve completed: ${JSON.stringify(executed)}`);
  const output = executed.output as { trashed: boolean; media: { status: string } };
  assert.equal(output.trashed, true);
  assert.equal(output.media.status, "trashed");
});

test("SECURITY: a Cancel click for media_trash_asset also reaches the allowlist and reports the cancellation, not a 403", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore();
  const { toolExecutor } = buildRealMediaToolExecutor(surfaceExchanges);

  const uploaded = await toolExecutor.execute({ id: PRINCIPAL }, { id: "run-0" }, "media_upload_asset", {
    filename: "keep-me.png",
    contentType: "image/png",
    dataBase64: ONE_PIXEL_PNG_BASE64,
  });
  const mediaId = (uploaded.output as { media: { id: string } }).media.id;

  const emitted: SurfaceEmission[] = [];
  const pending = toolExecutor.execute({ id: PRINCIPAL }, { id: "run-1" }, "media_trash_asset", { mediaId }, undefined, async (emission: SurfaceEmission) => {
    emitted.push(emission);
  });
  await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = exchangeIdFromEmission(emitted[0]!);

  const app = express();
  app.use(express.json());
  registerMcpUiToolCallsRoute(app, { toolExecutor, surfaceExchanges });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [RUN_PRINCIPAL_HEADER]: PRINCIPAL },
    body: JSON.stringify({ toolName: "media_trash_asset", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } }),
  });

  assert.equal(res.status, 202, "Cancel must reach the exchange too — the allowlist gates the tool, not the decision");

  const executed = await pending;
  const output = executed.output as { trashed: boolean; cancelled: boolean };
  assert.equal(output.trashed, false);
  assert.equal(output.cancelled, true);
});
