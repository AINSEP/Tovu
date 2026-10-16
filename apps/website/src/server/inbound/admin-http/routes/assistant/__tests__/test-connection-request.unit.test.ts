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
