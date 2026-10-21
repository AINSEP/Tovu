import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { assistantVaultRepo, assistantVaultContext } from "#src/assistant/assistant-vault";
import { InMemoryAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-store.memory";
import { InMemorySiteAssistantCredentialRepo } from "#src/assistant/site-credential-store.memory";
import { InMemorySettingsRepo, createSettingsPrincipalLookup, set, type ResolvedSetting } from "#src/features/settings/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { AssistantSettingsRouteDeps, AssistantSettingsRouteRegistrar } from "../deps.js";
import { registerAdminAssistantGetExecutionCredentialRoute } from "../get-execution-credential.js";
import { registerAdminAssistantPutExecutionCredentialRoute } from "../put-execution-credential.js";
import { registerAdminAssistantDeleteExecutionCredentialRoute } from "../delete-execution-credential.js";
import { registerAdminAssistantGetSiteCredentialRoute } from "../get-site-credential.js";
import { registerAdminAssistantDeleteSiteCredentialRoute } from "../delete-site-credential.js";
import { registerAdminAssistantGetSettingsRoute } from "../get-settings.js";
import { registerAdminAssistantPutSettingsRoute } from "../put-settings.js";

// Canonical Jini clocks read `nowMs`; `nowIso` formats it with toISOString(), so NOW keeps millis.
const NOW = "2026-09-15T01:02:03.000Z";
const BASE = "/api/admin/v1/workspaces/:workspaceId/assistant";

/** A resolved `site.assistant.public_enabled` read, as `getEffective` returns it. */
function resolved(value: boolean): ResolvedSetting {
  return { value, sourceLayer: "workspace", defVersion: 1 };
}

function depsForHandler(): AssistantSettingsRouteDeps {
  // These tests start after authentication and do not claim middleware/permission coverage.
  // Credential services and memory repositories remain real; only explicit I/O faults are mocked.
  const principals = new InMemoryPrincipalRepo({});
  const keyring = new InMemoryKeyring();
  return {
    workspaceId: "ws-7", clock: { nowMs: () => Date.parse(NOW), nowIso: () => NOW }, idGen: { newId: () => "setting-9" },
    authorize: async () => ({ allowed: true, reason: "test_grant" }),
    assistantSettingsReady: Promise.resolve(), adminAssistantEnabled: false,
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    siteAssistantCredentialRepo: new InMemorySiteAssistantCredentialRepo(),
    siteAssistantSecretKeyring: keyring,
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    settingsRepo: new InMemorySettingsRepo(),
    getEffective: async () => resolved(false),
    set,
    principalRepo: Object.assign(principals, createSettingsPrincipalLookup({ repo: principals })),
  };
}

async function invoke(
  register: AssistantSettingsRouteRegistrar, deps: AssistantSettingsRouteDeps,
  method: "get" | "put" | "delete", suffix: string, body: unknown = {},
) {
  const app = express();
  register(app, deps);
  const handler = extractRouteHandler(app, method, `${BASE}/${suffix}`);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "admin-9" };
  await handler({ params: { workspaceId: "ws-7" }, body }, res);
  return capture;
}

function assertInternalError(capture: unknown) {
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
}

const fail = async () => { throw new Error("db failed at /private/credentials.db; secret=do-not-leak"); };

// F4.4/F6.2: prove the intended dependency was reached, so an unrelated setup failure cannot
// satisfy the 500 assertion. Mutation: echo the thrown error or let its rejection escape.
test("execution GET redacts an owner-scoped repository read failure", async (t) => {
  const deps = depsForHandler();
  const fault = t.mock.method(assistantVaultRepo({ repo: deps.adminExecutionCredentialRepo }), "findOne", fail);
  assertInternalError(await invoke(registerAdminAssistantGetExecutionCredentialRoute, deps, "get", "execution-credential"));
  assert.deepEqual(fault.mock.calls.map(({ arguments: args }) => args), [[assistantVaultContext({ kind: "personal-execution", workspaceId: "ws-7", principalId: "admin-9" })]]);
});

test("execution DELETE redacts a clear-key failure for the caller's row", async (t) => {
  const deps = depsForHandler();
  const fault = t.mock.method(deps.adminExecutionCredentialRepo, "clearKey", fail);
  assertInternalError(await invoke(registerAdminAssistantDeleteExecutionCredentialRoute, deps, "delete", "execution-credential"));
  assert.deepEqual(fault.mock.calls.map(({ arguments: args }) => args), [[{ workspaceId: "ws-7", principalId: "admin-9", updatedAt: NOW }]]);
});

test("execution PUT redacts a failed write and leaves the repository empty", async (t) => {
  const deps = depsForHandler();
  const fault = t.mock.method(assistantVaultRepo({ repo: deps.adminExecutionCredentialRepo }), "put", fail);
  assertInternalError(await invoke(registerAdminAssistantPutExecutionCredentialRoute, deps, "put", "execution-credential", {
    protocol: "openai", providerId: "local-provider", baseUrl: "https://example.org/v1", model: "custom-model", maxTokens: 1234,
  }));
  assert.equal(fault.mock.callCount(), 1);
  const write = fault.mock.calls[0].arguments[0];
  assert.ok(write);
  const { record, expectedRevision } = write;
  assert.equal(expectedRevision, null);
  assert.equal(record.kind, "personal-execution");
  assert.equal(record.principalId, "admin-9");
  assert.equal(record.provider, "local-provider");
  assert.deepEqual(record.meta, { protocol: "openai", baseUrl: "https://example.org/v1", model: "custom-model", maxTokens: 1234 });
  assert.equal(record.sealed, null);
  assert.equal(await deps.adminExecutionCredentialRepo.findByWorkspaceAndPrincipal({ workspaceId: "ws-7", principalId: "admin-9" }), null);
});

test("site credential GET redacts a workspace repository read failure", async (t) => {
  const deps = depsForHandler();
  const fault = t.mock.method(assistantVaultRepo({ repo: deps.siteAssistantCredentialRepo }), "findOne", fail);
  assertInternalError(await invoke(registerAdminAssistantGetSiteCredentialRoute, deps, "get", "site-credential"));
  assert.deepEqual(fault.mock.calls.map(({ arguments: args }) => args), [[assistantVaultContext({ kind: "site-assistant", workspaceId: "ws-7" })]]);
});

test("site credential DELETE redacts a workspace clear-key failure", async (t) => {
  const deps = depsForHandler();
  const fault = t.mock.method(deps.siteAssistantCredentialRepo, "clearKey", fail);
  assertInternalError(await invoke(registerAdminAssistantDeleteSiteCredentialRoute, deps, "delete", "site-credential"));
  assert.deepEqual(fault.mock.calls.map(({ arguments: args }) => args), [[{ workspaceId: "ws-7", updatedAt: NOW }]]);
});

test("settings GET redacts an effective-setting read failure", async (t) => {
  const deps = depsForHandler();
  const fault = t.mock.method(deps, "getEffective", fail);
  assertInternalError(await invoke(registerAdminAssistantGetSettingsRoute, deps, "get", "settings"));
  assert.equal(fault.mock.callCount(), 1);
  assert.deepEqual(fault.mock.calls[0].arguments[1], {
    namespace: "site.assistant", key: "public_enabled", scopeContext: { workspaceId: "ws-7" },
  });
});

test("settings PUT redacts a failed ledger write instead of returning the requested setting", async () => {
  const deps = depsForHandler();
  const writes: unknown[] = [];
  deps.set = async (request) => { writes.push(request.input); return fail(); };
  assertInternalError(await invoke(registerAdminAssistantPutSettingsRoute, deps, "put", "settings", { publicEnabled: true }));
  assert.deepEqual(writes, [{
    namespace: "site.assistant", key: "public_enabled", scope: "workspace", value: true,
    workspaceId: "ws-7", authWorkspaceId: "ws-7", callerPrincipalId: "admin-9", requiredPermissionOverride: "admin.assistant.manage",
  }]);
});

// F7.1: removing the readiness await would let a request read the ledger before boot finishes.
// Hold that promise, flush queued microtasks, assert while held, then release it in finally.
for (const { method, register, expectedBody } of [
  { method: "get", register: registerAdminAssistantGetSettingsRoute, expectedBody: { data: { publicEnabled: true, widget: "react" }, adminAssistantEnabled: false } },
  { method: "put", register: registerAdminAssistantPutSettingsRoute, expectedBody: { data: { publicEnabled: true, widget: "react" } } },
] as const) {
  test(`settings ${method.toUpperCase()} waits for boot definitions before resolving current values`, { timeout: 5000 }, async () => {
    const deps = depsForHandler();
    let release!: () => void;
    deps.assistantSettingsReady = new Promise<void>((resolve) => { release = resolve; });
    const reads: unknown[] = [];
    deps.getEffective = async (_deps, input) => { reads.push(input); return resolved(true); };
    let settled = false;
    const pending = invoke(register, deps, method, "settings").then((capture) => { settled = true; return capture; });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(reads, []);
      assert.equal(settled, false);
    } finally {
      release();
      await pending;
    }
    assert.deepEqual(await pending, { statusCode: 200, jsonBody: expectedBody });
    assert.deepEqual(reads, ["public_enabled", "widget"].map(key => ({ namespace: "site.assistant", key, scopeContext: { workspaceId: "ws-7" } })));
  });
}

// F4.4: each fixture violates only one shape requirement. No secret/keyring needed, so a
// validation omission cannot hide behind a missing site key. F6.3: read back the real repo.
for (const [field, value, message] of [
  ["apiKey", 123, "apiKey must be a string"],
  ["protocol", false, "protocol must be a string"],
  ["baseUrl", {}, "baseUrl must be a string"],
  ["model", [], "model must be a string"],
  ["providerId", 123, "providerId must be a string or null"],
  ["maxTokens", "1234", "maxTokens must be a number"],
  ["maxTokens", null, "maxTokens must be a number"],
] as const) {
  test(`execution PUT rejects malformed ${field}=${JSON.stringify(value)} before any write`, async () => {
    const deps = depsForHandler();
    await deps.adminExecutionCredentialRepo.upsert({
      workspaceId: "ws-7", principalId: "admin-9", protocol: "openai", providerId: "custom-provider",
      baseUrl: "https://example.org/v1", model: "keep-model", maxTokens: 2048,
      sealed: null, masked: null, aadVersion: 0, createdAt: NOW, updatedAt: NOW,
    });
    const before = structuredClone(await deps.adminExecutionCredentialRepo.findByWorkspaceAndPrincipal({ workspaceId: "ws-7", principalId: "admin-9" }));
    const result = await invoke(registerAdminAssistantPutExecutionCredentialRoute, deps, "put", "execution-credential", { [field]: value });
    assert.deepEqual(result, { statusCode: 400, jsonBody: { error: message, code: "EXECUTION_CREDENTIAL_VALIDATION_ERROR" } });
    assert.deepEqual(await deps.adminExecutionCredentialRepo.findByWorkspaceAndPrincipal({ workspaceId: "ws-7", principalId: "admin-9" }), before);
  });
}

test("execution PUT accepts numeric maxTokens and explicitly clears providerId with null", async () => {
  const deps = depsForHandler();
  await deps.adminExecutionCredentialRepo.upsert({
    workspaceId: "ws-7", principalId: "admin-9", protocol: "openai", providerId: "old-provider",
    baseUrl: "https://example.org/v1", model: "keep-model", maxTokens: 2048,
    sealed: null, masked: null, aadVersion: 0, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
  });
  assert.deepEqual(await invoke(registerAdminAssistantPutExecutionCredentialRoute, deps, "put", "execution-credential", { providerId: null, maxTokens: 4096 }), {
    statusCode: 200, jsonBody: { data: {
      isSet: false, masked: null, tokenHint: null, protocol: "openai", providerId: null, baseUrl: "https://example.org/v1", model: "keep-model", maxTokens: 4096, updatedAt: NOW,
    } },
  });
  assert.deepEqual(await deps.adminExecutionCredentialRepo.findByWorkspaceAndPrincipal({ workspaceId: "ws-7", principalId: "admin-9" }), {
    workspaceId: "ws-7", principalId: "admin-9", protocol: "openai", providerId: null,
    baseUrl: "https://example.org/v1", model: "keep-model", maxTokens: 4096,
    sealed: null, masked: null, aadVersion: 0, createdAt: "2026-08-01T00:00:00Z", updatedAt: NOW,
  });
});

test("execution PUT with a null body preserves the caller's saved settings", async () => {
  const deps = depsForHandler();
  const stored = {
    workspaceId: "ws-7", principalId: "admin-9", protocol: "openai", providerId: "custom-provider",
    baseUrl: "https://example.org/v1", model: "keep-model", maxTokens: 2048,
    sealed: null, masked: null, aadVersion: 0,
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
  };
  await deps.adminExecutionCredentialRepo.upsert(stored);
  assert.deepEqual(await invoke(registerAdminAssistantPutExecutionCredentialRoute, deps, "put", "execution-credential", null), {
    statusCode: 200, jsonBody: { data: {
      isSet: false, masked: null, tokenHint: null, protocol: "openai", providerId: "custom-provider",
      baseUrl: "https://example.org/v1", model: "keep-model", maxTokens: 2048, updatedAt: NOW,
    } },
  });
  assert.deepEqual(await deps.adminExecutionCredentialRepo.findByWorkspaceAndPrincipal({ workspaceId: "ws-7", principalId: "admin-9" }), {
    ...stored, updatedAt: NOW,
  });
});

import { registerAdminAssistantPutSiteCredentialRoute } from "../put-site-credential.js";
import { ValueValidationFailedError } from "#src/features/settings/index";

test("settings PUT maps ledger value validation to the public validation envelope", async () => {
  const deps = depsForHandler();
  const writes: unknown[] = [];
  deps.set = async (input) => { writes.push(input.input); throw new ValueValidationFailedError("widget must be supported"); };
  const result = await invoke(registerAdminAssistantPutSettingsRoute, deps, "put", "settings", { publicEnabled: true });
  assert.deepEqual(result, { statusCode: 400, jsonBody: { error: "widget must be supported", code: "ASSISTANT_SETTINGS_VALIDATION_ERROR" } });
  assert.deepEqual(writes, [{
    namespace: "site.assistant", key: "public_enabled", scope: "workspace", value: true,
    workspaceId: "ws-7", authWorkspaceId: "ws-7", callerPrincipalId: "admin-9", requiredPermissionOverride: "admin.assistant.manage",
  }]);
});

test("site credential PUT redacts a failed metadata write", async (t) => {
  const deps = depsForHandler();
  const write = t.mock.method(assistantVaultRepo({ repo: deps.siteAssistantCredentialRepo }), "put", fail);
  assertInternalError(await invoke(registerAdminAssistantPutSiteCredentialRoute, deps, "put", "site-credential", { provider: "openai", baseUrl: "https://example.org/v1", model: "example-model" }));
  assert.equal(write.mock.callCount(), 1);
  assert.equal(await deps.siteAssistantCredentialRepo.findByWorkspaceId("ws-7"), null);
});

for (const [field, value] of [["apiKey", 123], ["provider", null], ["baseUrl", false], ["model", []]] as const) {
  test(`site credential PUT rejects a non-string ${field} before saving`, async () => {
    const deps = depsForHandler();
    const result = await invoke(registerAdminAssistantPutSiteCredentialRoute, deps, "put", "site-credential", { [field]: value });
    assert.deepEqual(result, { statusCode: 400, jsonBody: { error: `${field} must be a string`, code: "SITE_CREDENTIAL_VALIDATION_ERROR" } });
    assert.equal(await deps.siteAssistantCredentialRepo.findByWorkspaceId("ws-7"), null);
  });
}

// A host that mounts no JSON body parser hands the handler `req.body === undefined` (modelled here as
// null, like the execution PUT case above): both PUTs must treat that as an empty patch, not crash.
test("settings PUT with a null body is an empty patch that returns the current values unchanged", async () => {
  const deps = depsForHandler();
  const writes: unknown[] = [];
  deps.set = async (request) => { writes.push(request.input); return fail(); };
  deps.getEffective = async (_deps, input) => resolved(input.key === "public_enabled");
  const result = await invoke(registerAdminAssistantPutSettingsRoute, deps, "put", "settings", null);
  assert.equal(result.statusCode, 200);
  assert.deepEqual((result.jsonBody as { data: { publicEnabled: boolean } }).data.publicEnabled, true);
  assert.deepEqual(writes, []);
});

test("site credential PUT with a null body keeps the stored metadata and writes no key", async () => {
  const deps = depsForHandler();
  const saved = await invoke(registerAdminAssistantPutSiteCredentialRoute, deps, "put", "site-credential", { provider: "openai", baseUrl: "https://example.org/v1", model: "kept-model" });
  assert.equal(saved.statusCode, 200);
  const result = await invoke(registerAdminAssistantPutSiteCredentialRoute, deps, "put", "site-credential", null);
  assert.equal(result.statusCode, 200);
  const { data } = result.jsonBody as { data: { isSet: boolean; provider: string; baseUrl: string; model: string } };
  assert.deepEqual({ isSet: data.isSet, provider: data.provider, baseUrl: data.baseUrl, model: data.model },
    { isSet: false, provider: "openai", baseUrl: "https://example.org/v1", model: "kept-model" });
});

/**
 * `String(req.params.workspaceId ?? "")` (extractRouteHandler's own doc, `helpers/http-test-server.ts`):
 * Express guarantees a matched `:workspaceId` is always populated, so the right side of that `??` is
 * unreachable through any real HTTP request. Restored 2026-09-03 after being wrongly deleted as
 * "unreachable dead code" -- the repo's established answer is to KEEP the guard and exercise it with a
 * hand-built `req` that deliberately violates that contract. The empty fallback never equals the
 * deployment's workspace, so each route answers the ordinary foreign-workspace 404 before authorizing.
 */
for (const { label, register, method, suffix } of [
  { label: "execution GET", register: registerAdminAssistantGetExecutionCredentialRoute, method: "get", suffix: "execution-credential" },
  { label: "execution PUT", register: registerAdminAssistantPutExecutionCredentialRoute, method: "put", suffix: "execution-credential" },
  { label: "execution DELETE", register: registerAdminAssistantDeleteExecutionCredentialRoute, method: "delete", suffix: "execution-credential" },
  { label: "site credential GET", register: registerAdminAssistantGetSiteCredentialRoute, method: "get", suffix: "site-credential" },
  { label: "site credential PUT", register: registerAdminAssistantPutSiteCredentialRoute, method: "put", suffix: "site-credential" },
  { label: "site credential DELETE", register: registerAdminAssistantDeleteSiteCredentialRoute, method: "delete", suffix: "site-credential" },
  { label: "settings GET", register: registerAdminAssistantGetSettingsRoute, method: "get", suffix: "settings" },
  { label: "settings PUT", register: registerAdminAssistantPutSettingsRoute, method: "put", suffix: "settings" },
] as const) {
  test(`${label}: \`req.params.workspaceId ?? ""\` fallback, forced via a direct handler call, is a 404 before any authorization`, async () => {
    const deps = depsForHandler();
    const authorizations: unknown[] = [];
    deps.authorize = async (params) => { authorizations.push(params); return { allowed: true, reason: "test_grant" }; };
    const app = express();
    register(app, deps);
    const handler = extractRouteHandler(app, method, `${BASE}/${suffix}`);
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "admin-9" };

    await handler({ params: {}, body: {} }, res);

    assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
    assert.deepEqual(authorizations, []);
  });
}
