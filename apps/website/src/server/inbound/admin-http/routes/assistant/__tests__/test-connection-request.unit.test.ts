import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemoryAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-store.memory";
import { InMemorySiteAssistantCredentialRepo } from "#src/assistant/site-credential-store.memory";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminAssistantTestConnectionRoute } from "../test-connection.js";

test("test-connection returns a validation error for an absent or null request body", async () => {
  const app = express();
  registerAdminAssistantTestConnectionRoute(app, {
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    siteAssistantCredentialRepo: new InMemorySiteAssistantCredentialRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(new InMemoryKeyring()),
    workspaceId: "workspace-test",
    authorize: async () => ({ allowed: true, reason: "granted" }),
  });
  const run = extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/assistant/execution/test-connection");
  // Invoke the handler directly: body parsers can normalize an absent body before it reaches us.
  for (const body of [undefined, null]) {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-test" };
    await run({ params: { workspaceId: "workspace-test" }, body }, res);
    assert.equal(capture.statusCode, 400);
    assert.deepEqual(capture.jsonBody, {
      error: "protocol must be one of anthropic|openai|azure|google",
      code: "VALIDATION_ERROR",
    });
  }
});

function buildConnectionRoute(overrides: Partial<Parameters<typeof registerAdminAssistantTestConnectionRoute>[1]> = {}) {
  const app = express();
  registerAdminAssistantTestConnectionRoute(app, {
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    siteAssistantCredentialRepo: new InMemorySiteAssistantCredentialRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(new InMemoryKeyring()),
    workspaceId: "workspace-test",
    authorize: async () => ({ allowed: true, reason: "granted" }),
    ...overrides,
  });
  return extractRouteHandler(app, "post", "/api/admin/v1/workspaces/:workspaceId/assistant/execution/test-connection");
}

test("test-connection reports a successful probe that carries no detail as 'Connection succeeded', probing with redirects refused", async () => {
  const probes: unknown[][] = [];
  const run = buildConnectionRoute({
    testProviderConnection: async (...args) => {
      probes.push(args);
      return { ok: true, kind: "success", latencyMs: 5, model: "guard-model", status: 200 };
    },
  });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await run({
    params: { workspaceId: "workspace-test" },
    body: { protocol: "openai", baseUrl: "https://provider.example", apiKey: "typed-key", model: "guard-model" },
  }, res);

  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.jsonBody, { ok: true, message: "Connection succeeded" });
  assert.equal(probes.length, 1);
  const [request, options] = probes[0] as [Record<string, unknown>, { requestInit: { redirect: string } }];
  assert.deepEqual(request, { protocol: "openai", baseUrl: "https://provider.example", apiKey: "typed-key", model: "guard-model" });
  assert.equal(options.requestInit.redirect, "error");
});

test("test-connection answers an unexpected failure with a private 500, never the thrown message", async () => {
  const run = buildConnectionRoute({ authorize: async () => { throw new Error("private credential detail"); } });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-test" };
  await run({ params: { workspaceId: "workspace-test" }, body: {} }, res);
  assert.equal(capture.statusCode, 500);
  assert.deepEqual(capture.jsonBody, { error: "internal error", code: "INTERNAL_ERROR" });
});
