import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createToolRegistry, type SurfaceEmission } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { buildMediaRegistrationsForTovu, type MediaPublicUrlDeps, type MediaToolDeps, type MediaTrashToolDeps } from "#src/features/media/tool-registrations";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { RUN_PRINCIPAL_HEADER } from "../daemon-access.js";
import { MCP_UI_TOOL_CALLS_PATH, registerMcpUiToolCallsRoute } from "../mcp-ui-tool-calls-route.js";
import { createSurfaceExchangeStore, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


/**
 * @file Real, non-mocked proof of how `media_trash_asset` meets the MCP-UI callback route a
 * browser's click posts to.
 *
 * Moving to Trash is reversible and completes in one call without confirmation. The callback
 * allowlist must therefore refuse this id without reaching its executor. Route-level coverage
 * exercises that admission boundary, which handler-level tests never visit.
 */

const WORKSPACE_ID = "ws-mcp-ui-media-trash-integration";
const PRINCIPAL = "principal-admin-1";
const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Builds the real tool surface for the media domain: one registry, one production-shaped executor
 *  (no `delegate`, matching `agent-daemon-server.ts`'s own construction), over the real hermetic
 *  `createRouteDeps()` fixture — same discipline as the static-publish integration test this mirrors. */
function buildRealMediaToolExecutor(surfaceExchanges: SurfaceExchangeStore) {
  const deps: MediaToolDeps & MediaPublicUrlDeps & MediaTrashToolDeps = {
    ...createRouteDeps(),
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
  };

  const registry = createToolRegistry({});
  for (const registration of buildMediaRegistrationsForTovu(deps, { surfaceExchanges })) {
    registry.register(registration);
  }
  const toolExecutor = createToolExecutor({ registry });
  return { toolExecutor };
}

async function seedAsset(toolExecutor: ReturnType<typeof buildRealMediaToolExecutor>["toolExecutor"], filename: string): Promise<string> {
  const uploaded = await toolExecutor.execute({ principal: { id: PRINCIPAL }, run: { id: "run-0" }, toolId: "media_upload_asset", input: {
    filename,
    contentType: "image/png",
    dataBase64: ONE_PIXEL_PNG_BASE64,
  } });
  assert.equal(uploaded.status, "completed", `seed upload must succeed: ${JSON.stringify(uploaded)}`);
  return (uploaded.output as { media: { id: string } }).media.id;
}

test("media_trash_asset trashes the asset in one call and emits no dialog", async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const { toolExecutor } = buildRealMediaToolExecutor(surfaceExchanges);
  const mediaId = await seedAsset(toolExecutor, "logo.png");

  const emitted: SurfaceEmission[] = [];
  const executed = await toolExecutor.execute({ principal: { id: PRINCIPAL }, run: { id: "run-1" }, toolId: "media_trash_asset", input: { mediaId } }, { emitSurface: async (emission: SurfaceEmission) => {
    emitted.push(emission);
  } });

  assert.equal(emitted.length, 0, "a reversible Trash move must not raise a confirmation dialog");
  assert.equal(executed.status, "completed", `the call must complete on its own: ${JSON.stringify(executed)}`);
  const output = executed.output as { trashed: boolean; cancelled: boolean; media: { status: string } };
  assert.equal(output.trashed, true);
  assert.equal(output.cancelled, false);
  assert.equal(output.media.status, "trashed");
});

test("SECURITY: a surface callback cannot run media_trash_asset — the route refuses it with 403 and never reaches the executor", async (t) => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const { toolExecutor } = buildRealMediaToolExecutor(surfaceExchanges);
  const mediaId = await seedAsset(toolExecutor, "keep-me.png");

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
    body: JSON.stringify({ toolName: "media_trash_asset", params: { mediaId } }),
  });

  const body = (await res.json()) as { code?: string };
  assert.equal(res.status, 403, `expected the allowlist to refuse this call: ${JSON.stringify(body)}`);
  assert.equal(body.code, "TOOL_NOT_ALLOWLISTED");
  // The route's executor is the only way this callback could have trashed anything.
  assert.equal(routeExecutions, 0, "a refused callback must never reach the tool executor");
});
