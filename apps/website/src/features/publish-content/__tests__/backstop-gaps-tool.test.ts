import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { buildPublishContentRegistrations, contributePublishContentTools } from "../tool-registrations.js";
import { publishContentDerivedRisk } from "@jini-ai/cms/publish/content/tool-helpers";
import type { PublishContentDeps } from "../type-registry.js";
import type { PublishContentToolDeps } from "../tool-deps.js";
import { publishContentAgentToolCatalog } from "@jini-ai/cms/publish/content/agent-tools";

test("the assistant may read gaps but has no backstop send, confirm or undo tool", async () => {
  let reads = 0;
  const gaps = [{ label: "table:p_widgets", count: 4, lastReason: "Emergency footer fix", lastAt: "2026-10-04T00:00:00.000Z" }];
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), publishTrustProvisioning: {},
    makePublishContentDeps: () => ({ backstop: { audit: { ready: async () => true, gaps: async () => { reads++; return gaps; } } } }),
  } as unknown as PublishContentToolDeps;
  const tools = buildPublishContentRegistrations({ routeDeps: deps, surfaces: {} as never });
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
  const tool = buildPublishContentRegistrations({ routeDeps: deps, surfaces: {} as never }).find((r) => r.descriptor.id === "publish_backstop_gaps")!;
  assert.deepEqual(await tool.handler({ principal: { id: "assistant" }, input: {} } as ToolExecutionContext), { gaps: [] });
  assert.deepEqual(permissions, ["publish_content.read"]);
});

test("gap reads accept an absent input, and answer no gaps when the host wires no backstop audit", async () => {
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), publishTrustProvisioning: {},
    makePublishContentDeps: () => ({}) } as unknown as PublishContentToolDeps;
  const tool = buildPublishContentRegistrations({ routeDeps: deps, surfaces: {} as never }).find((r) => r.descriptor.id === "publish_backstop_gaps")!;
  assert.deepEqual(await tool.handler({ principal: { id: "assistant" }, input: undefined } as ToolExecutionContext), { gaps: [] });
  await assert.rejects(tool.handler({ principal: { id: "assistant" }, input: { extra: true } } as ToolExecutionContext), /extra/);
});

test("the tool contributor reads the mounted workspace's audit through the injected projection", async () => {
  const workspaceId = "site-north";
  const projected: PublishContentToolDeps[] = [];
  const auditReads: unknown[] = [];
  const gaps = [{ label: "folder:snippets/headers", count: 3, lastReason: "Restore the header", lastAt: "2026-10-04T00:00:00.000Z" }];
  const deps = {
    workspaceId, authorize: async () => ({ allowed: true, reason: "fixture" }), publishTrustProvisioning: {},
    makePublishContentDeps: () => assert.fail("the composition's injected projection should take precedence"),
  } as unknown as PublishContentToolDeps;
  const contributor = contributePublishContentTools({
    buildPublishContentDeps: source => {
      projected.push(source);
      return { backstop: { audit: {
        ready: async () => true,
        gaps: async (input: unknown) => { auditReads.push(input); return gaps; },
      } } } as unknown as PublishContentDeps;
    },
  });
  const registration = contributor.build(deps, {} as never).find(entry => entry.descriptor.id === "publish_backstop_gaps");
  assert.ok(registration);
  assert.deepEqual(projected, [], "discovery does not read the projection");
  const result = await registration.handler({
    executionId: "exec", run: { id: "run" }, principal: { id: "assistant" }, signal: new AbortController().signal, input: {},
  });
  assert.deepEqual(result, { gaps });
  assert.deepEqual(projected, [deps]);
  assert.deepEqual(auditReads, [{ workspaceId }]);
});
