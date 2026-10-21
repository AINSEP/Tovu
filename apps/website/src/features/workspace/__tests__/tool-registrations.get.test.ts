import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { type ToolExecutionContext } from "@jini-ai/core";
import { WorkspaceNotFoundError } from "@jini-ai/cms/workspace";
import { buildWorkspaceRegistrations } from "../tool-registrations.js";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";

/** @file The host `workspace_get` wrapper: optional input, served-id check, and the narrow missing-row translation. */

const workspace = { id: "ws", name: "Site", slug: "site", createdAt: "now" };
const ctx = (input: unknown) => ({ input, principal: { id: "owner" } } as ToolExecutionContext);

function getTool(findById: (input: { id: string }) => Promise<typeof workspace | null>) {
  const deps = toAssistantRegistryDeps({ routeDeps: { ...createRouteDeps(), workspaceId: "ws",
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } });
  deps.workspaceRepo.findById = findById;
  const get = buildWorkspaceRegistrations(deps).find((registration) => registration.descriptor.id === "workspace_get");
  assert.ok(get);
  return get;
}

test("workspace_get reads the served workspace with no input, an empty input, or its own id", async () => {
  const get = getTool(async () => workspace);
  assert.deepEqual(await get.handler(ctx(undefined)), { workspace });
  assert.deepEqual(await get.handler(ctx({})), { workspace });
  assert.deepEqual(await get.handler(ctx({ workspaceId: "ws" })), { workspace });
});

test("workspace_get translates only the served workspace's missing-row refusal into WorkspaceNotFoundError", async () => {
  const get = getTool(async () => null);
  await assert.rejects(get.handler(ctx(undefined)), (error: unknown) => {
    assert.ok(error instanceof WorkspaceNotFoundError);
    assert.equal(error.message, "workspace 'ws' was not found");
    return true;
  });
});

test("workspace_get rethrows other repository failures unchanged, Error or not", async () => {
  const diskError = new Error("disk unavailable");
  await assert.rejects(getTool(async () => { throw diskError; }).handler(ctx({})), (error: unknown) => error === diskError);
  const thrown = { reason: "not an Error" };
  await assert.rejects(getTool(async () => { throw thrown; }).handler(ctx({})), (error: unknown) => error === thrown);
});

test("buildWorkspaceRegistrations fails fast when the shared builder registers no workspace_get read owner", () => {
  const deps = toAssistantRegistryDeps({ routeDeps: { ...createRouteDeps(), workspaceId: "ws" } });
  assert.throws(() => buildWorkspaceRegistrations(deps, { buildShared: () => [] }), /workspace read owner is not registered/);
});
