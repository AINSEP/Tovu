import assert from "node:assert/strict";
import test from "node:test";
import { buildExternalMcpRegistrations, externalMcpDerivedRisk } from "../../tool-registrations.js";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { buildExternalMcpOperationsRegistrations, externalMcpOperationsDerivedRisk } from "../../operations-tools.js";

const NOW = "2026-10-01T00:00:00.000Z";
function fixture(allow = true) {
  const calls: unknown[] = [];
  const deps = { workspaceId: "ws-n04", clock: { nowIso: () => NOW }, authorize: async (input: unknown) => {
    calls.push(input);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  } };
  const operations = {
    probe: async (receivedDeps: unknown, id: string) => {
      assert.equal(receivedDeps, deps);
      calls.push(id);
      return { ok: true as const, body: { tools: [], probedAt: NOW } };
    },
    admissions: async () => {
      calls.push("admissions");
      return { ok: true as const, connections: [{ connectionId: "hosted", report: { admitted: [], refused: [] }, isPreset: false }], configFailures: [{ connectionId: "broken", reason: "disabled" }] };
    },
  };
  const registrations = buildExternalMcpOperationsRegistrations(deps as never, operations);
  function call(id: string, input: unknown = {}) {
    return registrations.find(r => r.descriptor.id === id)!.handler({ executionId: "exec", principal: { id: "owner" }, run: { id: "run" }, input, signal: new AbortController().signal } as never);
  }
  return { calls, deps, operations, registrations, call };
}

test("admissions returns the live accounting with the shared integration permission", async () => {
  const f = fixture();
  assert.deepEqual(await f.call("external_mcp_get_admissions"), { connections: [{ connectionId: "hosted", report: { admitted: [], refused: [] }, isPreset: false }], configFailures: [{ connectionId: "broken", reason: "disabled" }] });
  assert.deepEqual(f.calls, [{ principalId: "owner", permission: "admin.integrations.manage", workspaceId: "ws-n04", entityType: "integration", entityId: undefined }, "admissions"]);
});

test("live probe delegates the saved server id to the same service as the admin route", async () => {
  const f = fixture();
  assert.deepEqual(await f.call("external_mcp_probe_connection", { id: "hosted" }), { tools: [], probedAt: NOW });
  assert.deepEqual(f.calls, [{ principalId: "owner", permission: "admin.integrations.manage", workspaceId: "ws-n04", entityType: "integration", entityId: "hosted" }, "hosted"]);
});

test("admissions unavailable is an actionable error rather than an empty roster", async () => {
  const f = fixture();
  f.operations.admissions = async () => ({ ok: false, body: { error: "the agent daemon token is not configured", code: "AGENT_DAEMON_UNAVAILABLE" } }) as never;
  await assert.rejects(f.call("external_mcp_get_admissions"), { name: "ToolInputError", message: "external_mcp_get_admissions: the agent daemon token is not configured. Start the assistant and try again; no live admissions report is available." });
});

test("an older admissions response keeps its exact key set", async () => {
  const f = fixture();
  f.operations.admissions = async () => ({ ok: true, connections: [] }) as never;
  assert.deepEqual(await f.call("external_mcp_get_admissions"), { connections: [] });
});

test("probe refusal remains visible to the model with an action", async () => {
  const f = fixture();
  f.operations.probe = async () => ({ ok: false, status: 400, body: { error: "this server is disabled — enable it before probing", code: "MCP_SERVER_DISABLED" } }) as never;
  await assert.rejects(f.call("external_mcp_probe_connection", { id: "hosted" }), { name: "ToolInputError", message: "external_mcp_probe_connection: this server is disabled — enable it before probing. Review the server in Settings → External MCP; use external_mcp_test_connection for a configuration-only check." });
});

for (const id of ["external_mcp_get_admissions", "external_mcp_probe_connection"]) {
  test(`${id} denies access before reading or contacting a server`, async () => {
    const f = fixture(false);
    await assert.rejects(f.call(id, id.includes("probe") ? { id: "hosted" } : {}), { message: "principal 'owner' is not authorized for 'admin.integrations.manage' (insufficient_permission)" });
    assert.equal(f.calls.length, 1);
  });
  test(`${id} rejects unsupported fields without I/O`, async () => {
    const f = fixture();
    await assert.rejects(f.call(id, { id: "hosted", token: "never-model-input" }), { name: "ToolInputError", message: `${id}: unsupported input fields. Never pass credentials through tool arguments.` });
    assert.deepEqual(f.calls, []);
  });
}

test("probe refuses blank ids and bounds repeated attempts across server ids", async () => {
  const f = fixture();
  await assert.rejects(f.call("external_mcp_probe_connection", { id: " " }), { name: "ToolInputError", message: "external_mcp_probe_connection: pass a non-empty saved server id. Use content_read.external_mcp to find it." });
  for (let n = 0; n < 12; n++) await f.call("external_mcp_probe_connection", { id: `server-${n}` });
  await assert.rejects(f.call("external_mcp_probe_connection", { id: "another" }), { name: "ToolInputError", message: "external_mcp_probe_connection: too many probe attempts. Try again in 60 seconds." });
  assert.equal(f.calls.filter(v => typeof v === "string").length, 12);
});

test("admissions is read-only; a probe may persist a refreshed OAuth grant", () => {
  const f = fixture();
  assert.deepEqual(f.registrations.map(r => [r.descriptor.id, r.descriptor.readOnly]), [["external_mcp_probe_connection", false], ["external_mcp_get_admissions", true]]);
  assert.equal(externalMcpOperationsDerivedRisk.get("external_mcp_probe_connection"), "mutates-durable-state");
  assert.equal(externalMcpOperationsDerivedRisk.get("external_mcp_get_admissions"), "none");
});

test("the configuration check also declares its potential OAuth refresh writes", () => {
  const f = fixture();
  const registrations = buildExternalMcpRegistrations(f.deps as never, { surfaceExchanges: createSurfaceExchangeStore() });
  assert.equal(registrations.find(r => r.descriptor.id === "external_mcp_test_connection")!.descriptor.readOnly, false);
  assert.equal(externalMcpDerivedRisk.get("external_mcp_test_connection"), "mutates-durable-state");
});
