import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-store.memory";
import { InMemorySiteAssistantCredentialRepo } from "#src/assistant/site-credential-store.memory";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import type { DetectedAgent } from "@jini-ai/agent-runtime";
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

function handler(allowed: boolean) {
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
  });
  return extractRouteHandler(app, "post", routePath);
}

test("detect-agents handler returns the complete projected catalog", async () => {
  calls = 0;
  failure = undefined;
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await handler(true)({ params: { workspaceId: "workspace-test" } }, res);
  assert.equal(calls, 1);
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, { data: [{
    id: "codex", label: "Codex", installed: true, version: "1.2.3", path: "/usr/local/bin/codex", modelsSource: "live",
    models: [{ id: "model-pro", label: "Model Pro" }], authStatus: "ok", authMessage: "Signed in", reasoningOptions: [{ id: "high", label: "High" }],
  }, { id: "claude", label: "Claude Code", installed: false, modelsSource: "fallback", authStatus: "missing", authMessage: "Run claude login" }] });
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

test("detect-agents handler maps a detector failure to a private 500 envelope", async () => {
  calls = 0;
  failure = new Error("private host details");
  try {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-test" };
    await handler(true)({ params: { workspaceId: "workspace-test" } }, res);
    assert.equal(calls, 1);
    assert.equal(capture.statusCode, 500);
    assert.deepEqual(capture.jsonBody, { error: "internal error", code: "INTERNAL_ERROR" });
  } finally {
    failure = undefined;
  }
});
