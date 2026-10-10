import assert from "node:assert/strict";
import test from "node:test";
import { type ToolExecutionContext } from "@jini-ai/core";
import { deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { contributeWorkspaceTools } from "../tool-registrations.js";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";

test("workspace card lists only the boot-addressable workspace through its existing read owner", async () => {
  const workspace = { id: "ws", name: "Site", slug: "site", createdAt: "now" };
  let reads = 0;
  const deps = toAssistantRegistryDeps({ routeDeps: { ...createRouteDeps(), workspaceId: "ws",
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } });
  deps.workspaceRepo.findById = async ({ id }) => { reads++; assert.equal(id, "ws"); return workspace; };
  deps.workspaceRepo.list = async () => { throw new Error("must not disclose inaccessible workspace rows"); };
  const card = () => deriveContentReadRegistrations(contributeWorkspaceTools().build(deps)).find(r => r.descriptor.id === "content_read.workspace")!;
  const ctx = (input: unknown) => ({ input, principal: { id: "owner" } } as ToolExecutionContext);
  assert.deepEqual(await card().handler(ctx({})), { workspaces: [workspace] });
  assert.deepEqual(await card().handler(ctx({ workspaceId: "ws" })), { workspace });
  await assert.rejects(card().handler(ctx({ workspaceId: "other" })), { message: "workspace 'other' is not addressable — only 'ws' is available in this server" });
  deps.authorize = async () => ({ allowed: false, reason: "denied" });
  await assert.rejects(card().handler(ctx({})));
  assert.equal(reads, 3);
});


test("workspace list reports the missing current workspace with its real safe error", async () => {
  const deps = toAssistantRegistryDeps({ routeDeps: { ...createRouteDeps(), workspaceId: "missing",
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } });
  deps.workspaceRepo.findById = async () => null;
  const card = deriveContentReadRegistrations(contributeWorkspaceTools().build(deps)).find(r => r.descriptor.id === "content_read.workspace");
  assert.ok(card);
  await assert.rejects(card.handler({ input: {}, principal: { id: "owner" } } as ToolExecutionContext),
    { message: "WORKSPACE_NOT_FOUND: workspace 'missing' was not found" });
});
