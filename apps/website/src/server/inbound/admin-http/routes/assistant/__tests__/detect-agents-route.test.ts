import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-store.memory";
import { InMemorySiteAssistantCredentialRepo } from "#src/assistant/site-credential-store.memory";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { createNativeAgentRuntime, type DetectedAgent } from "@jini-ai/agent-runtime";
import { createAssistantAgentInventory, listAssistantAgents, setAgentModelProberForTesting } from "#src/assistant/agents";
import type { AssistantExecutionRouteDeps } from "../execution-deps.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

// Detection is the external PATH/process boundary. Keep route registration and projection real.
let calls = 0;
let failure: Error | undefined;
const agents = [{
  id: "codex", name: "Codex", bin: "codex", versionArgs: ["--version"], streamFormat: "text",
  available: true, version: "1.2.3", path: "/usr/local/bin/codex", modelsSource: "live",
  models: [{ id: "model-pro", label: "Model Pro" }], authStatus: "ok", authMessage: "Signed in",
  reasoningOptions: [{ id: "high", label: "High" }],
}, {
  id: "claude", name: "Claude Code", bin: "claude", versionArgs: ["--version"], streamFormat: "text",
  available: false, models: [], modelsSource: "fallback", authStatus: "missing", authMessage: "Run claude login",
}] as DetectedAgent[];
const { registerAdminAssistantDetectAgentsRoute } = await import("../detect-agents.js");
const routePath = "/api/admin/v1/workspaces/:workspaceId/assistant/execution/detect-agents";

function handler(allowed: boolean, options: Partial<AssistantExecutionRouteDeps> = {}) {
  const app = express();
  registerAdminAssistantDetectAgentsRoute(app, {
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    siteAssistantCredentialRepo: new InMemorySiteAssistantCredentialRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(new InMemoryKeyring()),
    detectAgents: async () => { calls += 1; if (failure) throw failure; return agents; },
    workspaceId: "workspace-test", authorize: async (params) => {
      assert.deepEqual(params, { principalId: "principal-test", permission: "admin.assistant.manage", workspaceId: "workspace-test", entityType: "assistant-execution" });
      return { allowed, reason: allowed ? "granted" : "no_grant" };
    },
    ...options,
  });
  return extractRouteHandler(app, "post", routePath);
}

test("detect-agents returns the default catalog and discovery status without an injected inventory", async () => {
  // Reuse the compatibility inventory's model-probe seam so discovery never spawns real CLIs.
  setAgentModelProberForTesting(async ({ def }) => ({ models: def.fallbackModels, source: "fallback" }));
  try {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-test" };
    await handler(true, { detectAgents: undefined })({ params: { workspaceId: "workspace-test" } }, res);
    assert.equal(capture.statusCode, 200);
    const { data } = capture.jsonBody as { data: { id: string; label: string; discoveryPending: boolean }[] };
    const codex = data.find(agent => agent.id === "codex");
    assert.ok(codex);
    assert.equal(codex.label, "Codex CLI");
    assert.equal(codex.discoveryPending, true);
  } finally {
    await listAssistantAgents({}, { waitForProbe: true });
    setAgentModelProberForTesting(null);
  }
});

test("detect-agents handler returns the complete projected catalog", async () => {
  calls = 0;
  failure = undefined;
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  const run = handler(true);
  await run({ params: { workspaceId: "workspace-test" } }, res);
  assert.equal(calls, 0, "the HTTP response precedes background discovery");
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
  await run({ params: { workspaceId: "workspace-test" } }, res);
  assert.equal(calls, 1);
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, { data: [{
    id: "codex", label: "Codex", installed: true, discoveryPending: false, version: "1.2.3", path: "/usr/local/bin/codex", modelsSource: "live",
    models: [{ id: "model-pro", label: "Model Pro" }], authStatus: "ok", authMessage: "Signed in", reasoningOptions: [{ id: "high", label: "High" }],
  }, { id: "claude", label: "Claude Code", installed: false, discoveryPending: false, modelsSource: "fallback", authStatus: "missing", authMessage: "Run claude login" }] });
});

test("detect-agents handler denies missing permission before probing local agents", async () => {
  calls = 0;
  failure = undefined;
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await handler(false)({ params: { workspaceId: "workspace-test" } }, res);
  assert.equal(calls, 0);
  assert.equal(capture.statusCode, 403);
  assert.deepEqual(capture.jsonBody, {
    error: "principal 'principal-test' is not authorized for 'admin.assistant.manage' (no_grant)",
    code: "FORBIDDEN", details: { permission: "admin.assistant.manage", reason: "no_grant" },
  });
});

test("detect-agents handler keeps cached data when background discovery fails", async () => {
  calls = 0;
  failure = new Error("private host details");
  try {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-test" };
    const run = handler(true);
    await run({ params: { workspaceId: "workspace-test" } }, res);
    const previous = capture.jsonBody as { data: Record<string, unknown>[] };
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    await run({ params: { workspaceId: "workspace-test" } }, res);
    assert.equal(calls, 1);
    assert.equal(capture.statusCode, 200);
    assert.deepEqual(capture.jsonBody, { data: previous.data.map(agent => ({ ...agent, discoveryPending: false })) });
    assert.ok(!JSON.stringify(capture.jsonBody).includes("private host details"));
  } finally {
    failure = undefined;
  }
});

// This route-level case proves the strict body flag reaches discovery, not just the cache helper.
test("Rescan forces discovery once after the cached response and preserves exact model IDs", async () => {
  const forces: boolean[] = [];
  let calls = 0;
  const app = express();
  registerAdminAssistantDetectAgentsRoute(app, {
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    siteAssistantCredentialRepo: new InMemorySiteAssistantCredentialRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(new InMemoryKeyring()),
    detectAgents: async (_input, options = {}) => { calls++; forces.push(options.force === true); return agents; },
    workspaceId: "workspace-test", authorize: async () => ({ allowed: true, reason: "granted" }),
  });
  const run = extractRouteHandler(app, "post", routePath);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await run({ params: { workspaceId: "workspace-test" } }, res);
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
  await run({ params: { workspaceId: "workspace-test" }, body: { force: true } }, res);
  assert.equal(calls, 1);
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
  await run({ params: { workspaceId: "workspace-test" } }, res);
  assert.equal(calls, 2);
  assert.deepEqual(forces, [false, true]);
  assert.deepEqual((capture.jsonBody as { data: { models: unknown[] }[] }).data[0]?.models, [{ id: "model-pro", label: "Model Pro" }]);
});


test("each route uses its composition's inventory rather than the process compatibility inventory", async () => {
  const inventories = ["host-a", "host-b"].map(model => createAssistantAgentInventory({
    runtime: createNativeAgentRuntime({ env: { PATH: "/missing", HOME: "/missing" } }),
    detector: async () => [{ ...agents[0]!, models: [{ id: model, label: model }] }],
  }));
  try {
    const received: unknown[] = [];
    for (const assistantAgentInventory of inventories) {
      await assistantAgentInventory.listAssistantAgents({}, { waitForProbe: true });
      const app = express();
      registerAdminAssistantDetectAgentsRoute(app, {
        assistantAgentInventory,
        adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
        siteAssistantCredentialRepo: new InMemorySiteAssistantCredentialRepo(),
        siteAssistantSecretSealer: new AesGcmSecretSealer(new InMemoryKeyring()),
        workspaceId: "workspace-test", authorize: async () => ({ allowed: true, reason: "granted" }),
      });
      const { res, capture } = createCapturingResponse();
      res.locals.principal = { id: "principal-test" };
      await extractRouteHandler(app, "post", routePath)({ params: { workspaceId: "workspace-test" } }, res);
      assert.equal(capture.statusCode, 200);
      received.push((capture.jsonBody as { data: { models: unknown[] }[] }).data[0]?.models);
    }
    assert.deepEqual(received, [[{ id: "host-a", label: "host-a" }], [{ id: "host-b", label: "host-b" }]]);
  } finally { await Promise.all(inventories.map(inventory => inventory.dispose({}))); }
});

test("detect-agents redacts an authorization failure as a generic 500 without probing", async () => {
  calls = 0;
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await handler(true, { authorize: async () => { throw new Error("policy store at /private/policies.db is down"); } })(
    { params: { workspaceId: "workspace-test" } }, res);
  assert.equal(calls, 0);
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
});

test("an injected detector seeds its first snapshot from the composition inventory's runtime, not process.env", async (t) => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const binDir = await mkdtemp(join(tmpdir(), "detect-agents-runtime-"));
  t.after(() => rm(binDir, { recursive: true, force: true }));
  await writeFile(join(binDir, "codex"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const assistantAgentInventory = createAssistantAgentInventory({
    runtime: createNativeAgentRuntime({ env: { PATH: binDir, HOME: binDir } }),
    detector: async () => agents,
  });
  t.after(() => assistantAgentInventory.dispose({}));
  calls = 0;
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await handler(true, { assistantAgentInventory })({ params: { workspaceId: "workspace-test" } }, res);
  assert.equal(capture.statusCode, 200);
  const { data } = capture.jsonBody as { data: { id: string; installed: boolean; path?: string; discoveryPending: boolean }[] };
  const codex = data.find(agent => agent.id === "codex");
  assert.deepEqual(codex && { installed: codex.installed, path: codex.path, discoveryPending: codex.discoveryPending },
    { installed: true, path: join(binDir, "codex"), discoveryPending: true });
  assert.equal(data.find(agent => agent.id === "claude")?.installed, false, "only binaries on the injected runtime's PATH count");
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
});
