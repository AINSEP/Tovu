import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import { createToolExecutor } from "@jini-ai/daemon";
import { InMemoryMcpSession } from "../mcp-federation/adapter.memory.js";
import { federateSession } from "../mcp-federation/registrations.js";
import { constrainPrincipalToReadOnlyTools, readOnlyToolRefusalMessage, withReadOnlyToolConstraint } from "../read-only-tool-constraint.js";

test("read-only gateway executes operator-listed federation reads and refuses unlisted remote-hinted reads verbatim", async () => {
  const session = new InMemoryMcpSession({ tools: [
    { name: "models_explore", inputSchema: { type: "object" } },
    { name: "generate", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  ], onCall: () => ({ content: [{ type: "text", text: "models: []" }] }) });
  const { registrations } = await federateSession({ session, nativeToolIds: new Set(), config: {
    connectionId: "higgsfield", label: "Higgsfield", allowedToolNames: ["models_explore", "generate"], writeAllowedToolNames: [],
    readOnlyRemoteNames: new Set(["models_explore"]), connectTimeoutMs: 1000, callTimeoutMs: 1000, maxResultBytes: 4096, maxTools: 8,
  }, deps: { workspaceId: "workspace", authorize: async () => ({ allowed: true, reason: "matched" }) } });
  const registry = createToolRegistry();
  for (const registration of registrations) registry.register(registration);
  const executor = withReadOnlyToolConstraint(createToolExecutor({ registry }), { registry });
  const principal = constrainPrincipalToReadOnlyTools({ id: "owner" });
  const allowed = await executor.execute(principal, { id: "run" }, "mcp__higgsfield__models_explore", {});
  assert.equal(allowed.status, "completed");
  assert.deepEqual(session.calls, [{ name: "models_explore", arguments: {} }]);
  const refused = await executor.execute(principal, { id: "run" }, "mcp__higgsfield__generate", {});
  assert.equal(refused.status, "denied");
  assert.equal(refused.error, readOnlyToolRefusalMessage("mcp__higgsfield__generate"));
  assert.deepEqual(session.calls, [{ name: "models_explore", arguments: {} }], "the refused tool must never reach the remote");
});
