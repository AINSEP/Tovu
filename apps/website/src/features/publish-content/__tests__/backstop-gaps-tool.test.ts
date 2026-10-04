import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { buildPublishContentRegistrations, publishContentDerivedRisk, type PublishContentToolDeps } from "../tool-registrations.js";
import { publishContentAgentToolCatalog } from "../agent-tools.js";

test("the assistant may read gaps but has no backstop send, confirm or undo tool", async () => {
  let reads = 0;
  const gaps = [{ label: "table:p_widgets", count: 4, lastReason: "Emergency footer fix", lastAt: "2026-10-04T00:00:00.000Z" }];
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), publishTrustProvisioning: {},
    makePublishContentDeps: () => ({ backstop: { audit: { ready: async () => true, gaps: async () => { reads++; return gaps; } } } }),
  } as unknown as PublishContentToolDeps;
  const tools = buildPublishContentRegistrations(deps, {} as never);
  const tool = tools.find((r) => r.descriptor.id === "publish_backstop_gaps");
  assert.ok(tool);
  assert.equal(publishContentDerivedRisk.get("publish_backstop_gaps"), "none");
  const context = { principal: { id: "assistant" }, input: {}, signal: new AbortController().signal,
    executionId: "exec", run: { id: "run" } } as ToolExecutionContext;
  assert.deepEqual(await tool.handler(context), { gaps });
  assert.equal(reads, 1);
  assert.deepEqual(publishContentAgentToolCatalog.filter((t) => /backstop/.test(t.name)).map((t) => t.name), ["publish_backstop_gaps"]);
});

test("gap reads enforce publish_content.read and return an empty list before schema installation", async () => {
  const permissions: string[] = [];
  const deps = { workspaceId: "ws", authorize: async ({ permission }: { permission: string }) => { permissions.push(permission); return { allowed: true, reason: "test" }; },
    publishTrustProvisioning: {}, makePublishContentDeps: () => ({ backstop: { audit: { ready: async () => false, gaps: async () => { throw new Error("must not read missing storage"); } } } }),
  } as unknown as PublishContentToolDeps;
  const tool = buildPublishContentRegistrations(deps, {} as never).find((r) => r.descriptor.id === "publish_backstop_gaps")!;
  assert.deepEqual(await tool.handler({ principal: { id: "assistant" }, input: {} } as ToolExecutionContext), { gaps: [] });
  assert.deepEqual(permissions, ["publish_content.read"]);
});
