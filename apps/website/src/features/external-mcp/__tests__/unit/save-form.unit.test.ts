import assert from "node:assert/strict";
import test from "node:test";

import type { ExternalMcpServerView } from "#src/assistant/index";

import { buildExternalMcpSaveFormFields, mergeExternalMcpSavePrefill, type ExternalMcpSaveInput } from "../../save-form.js";

/**
 * @file Direct coverage for `save-form.ts`'s two decision-bearing functions —
 * `mergeExternalMcpSavePrefill` (the prefill merge) and `buildExternalMcpSaveFormFields` (the
 * per-call field list), which this repo's complexity gate previously flagged at cyclomatic 18/21 and
 * cognitive 36 before being decomposed into small named helpers. These tests pin the exact behavior
 * that decomposition had to preserve: field order, which fields appear per transport/authMode/update
 * combination, and the merge's "explicit input wins, else existing, else unset" precedence.
 */

const BASE_INPUT: ExternalMcpSaveInput = { id: "srv-1", transport: "stdio" };

function existingView(overrides: Partial<ExternalMcpServerView> = {}): ExternalMcpServerView {
  return {
    serverId: "srv-1",
    label: "Existing Label",
    transport: "stdio",
    authMode: "api_key",
    enabled: true,
    command: "npx some-server",
    url: null,
    args: ["--flag"],
    allowedToolNames: ["tool_a", "tool_b"],
    writeAllowedToolNames: [],
    writeGrantsUpdatedByPrincipalId: null,
    writeGrantsUpdatedAt: null,
    envNames: [],
    oauth: { providerId: null, grant: null, clientId: null, scopes: ["read", "write"], status: "disconnected", expiresAt: null, tokenEnvName: null },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mergeExternalMcpSavePrefill
// ---------------------------------------------------------------------------

test("mergeExternalMcpSavePrefill: with no existing row, returns the input untouched", () => {
  const result = mergeExternalMcpSavePrefill(BASE_INPUT, undefined);
  assert.equal(result, BASE_INPUT);
});

test("mergeExternalMcpSavePrefill: explicit input fields win over the existing row's values", () => {
  const input: ExternalMcpSaveInput = { id: "srv-1", transport: "stdio", label: "New Label", command: "node new-server.js" };
  const result = mergeExternalMcpSavePrefill(input, existingView());
  assert.equal(result.label, "New Label");
  assert.equal(result.command, "node new-server.js");
});

test("mergeExternalMcpSavePrefill: unset input fields fall back to the existing row's values, joining array fields", () => {
  const result = mergeExternalMcpSavePrefill(BASE_INPUT, existingView());
  assert.equal(result.label, "Existing Label");
  assert.equal(result.command, "npx some-server");
  assert.equal(result.args, "--flag");
  assert.equal(result.allowedToolNames, "tool_a, tool_b");
  assert.equal(result.authMode, "api_key");
});

test("mergeExternalMcpSavePrefill: an existing row's write grants prefill writeAllowedToolNames — an update's form does not start from a blank that would read as 'no write access'", () => {
  const result = mergeExternalMcpSavePrefill(BASE_INPUT, existingView({ writeAllowedToolNames: ["tool_a"] }));
  assert.equal(result.writeAllowedToolNames, "tool_a");
});

test("mergeExternalMcpSavePrefill: a row with no write grants prefills an empty writeAllowedToolNames, not undefined", () => {
  const result = mergeExternalMcpSavePrefill(BASE_INPUT, existingView({ writeAllowedToolNames: [] }));
  assert.equal(result.writeAllowedToolNames, "");
});

test("mergeExternalMcpSavePrefill: explicit input writeAllowedToolNames wins over the existing row's value", () => {
  const input: ExternalMcpSaveInput = { id: "srv-1", transport: "stdio", writeAllowedToolNames: "tool_b" };
  const result = mergeExternalMcpSavePrefill(input, existingView({ writeAllowedToolNames: ["tool_a"] }));
  assert.equal(result.writeAllowedToolNames, "tool_b");
});

test("mergeExternalMcpSavePrefill: a null existing OAuth field falls back to unset (undefined), not null", () => {
  const result = mergeExternalMcpSavePrefill(BASE_INPUT, existingView());
  assert.equal(result.oauthProviderId, undefined);
  assert.equal(result.oauthGrant, undefined);
  assert.equal(result.oauthClientId, undefined);
  assert.equal(result.oauthTokenEnvName, undefined);
  assert.equal(result.oauthScopes, "read write");
});

test("mergeExternalMcpSavePrefill: a non-null existing OAuth field is used as fallback", () => {
  const result = mergeExternalMcpSavePrefill(
    BASE_INPUT,
    existingView({ oauth: { providerId: "google", grant: "device_code", clientId: "client-1", scopes: [], status: "connected", expiresAt: null, tokenEnvName: "TOKEN_ENV" } }),
  );
  assert.equal(result.oauthProviderId, "google");
  assert.equal(result.oauthGrant, "device_code");
  assert.equal(result.oauthClientId, "client-1");
  assert.equal(result.oauthTokenEnvName, "TOKEN_ENV");
});

test("mergeExternalMcpSavePrefill: OAuth endpoint fields are never merged from existing — carried through from input as-is", () => {
  const input: ExternalMcpSaveInput = { id: "srv-1", transport: "stdio", oauthAuthorizationEndpoint: "https://example.com/authorize" };
  const result = mergeExternalMcpSavePrefill(input, existingView());
  assert.equal(result.oauthAuthorizationEndpoint, "https://example.com/authorize");
  assert.equal(result.oauthTokenEndpoint, undefined);
  assert.equal(result.oauthDeviceAuthorizationEndpoint, undefined);
});

// ---------------------------------------------------------------------------
// buildExternalMcpSaveFormFields
// ---------------------------------------------------------------------------

function fieldNames(input: ExternalMcpSaveInput, isUpdate: boolean): string[] {
  return buildExternalMcpSaveFormFields(input, isUpdate).map((f) => f.name);
}

test("stdio, create: id, label, command, args, allowedToolNames, writeAllowedToolNames, env — in that order, no oauth fields", () => {
  assert.deepEqual(fieldNames({ id: "srv-1", transport: "stdio" }, false), ["id", "label", "command", "args", "allowedToolNames", "writeAllowedToolNames", "env"]);
});

test("stdio, update: id field is omitted", () => {
  assert.deepEqual(fieldNames({ id: "srv-1", transport: "stdio" }, true), ["label", "command", "args", "allowedToolNames", "writeAllowedToolNames", "env"]);
});

test("streamable_http transport: url field instead of command/args, and no env field", () => {
  assert.deepEqual(fieldNames({ id: "srv-1", transport: "streamable_http" }, false), ["id", "label", "url", "allowedToolNames", "writeAllowedToolNames"]);
});

test("oauth + stdio: oauth core fields, then the stdio-only token-env field, then the endpoint fields", () => {
  assert.deepEqual(fieldNames({ id: "srv-1", transport: "stdio", authMode: "oauth" }, false), [
    "id",
    "label",
    "command",
    "args",
    "allowedToolNames",
    "writeAllowedToolNames",
    "env",
    "oauthProviderId",
    "oauthGrant",
    "oauthClientId",
    "oauthClientSecret",
    "oauthScopes",
    "oauthTokenEnvName",
    "oauthAuthorizationEndpoint",
    "oauthTokenEndpoint",
    "oauthDeviceAuthorizationEndpoint",
  ]);
});

test("oauth + streamable_http: no oauthTokenEnvName field (stdio-only)", () => {
  const names = fieldNames({ id: "srv-1", transport: "streamable_http", authMode: "oauth" }, false);
  assert.ok(!names.includes("oauthTokenEnvName"));
  assert.deepEqual(names, ["id", "label", "url", "allowedToolNames", "writeAllowedToolNames", "oauthProviderId", "oauthGrant", "oauthClientId", "oauthClientSecret", "oauthScopes", "oauthAuthorizationEndpoint", "oauthTokenEndpoint", "oauthDeviceAuthorizationEndpoint"]);
});

test("a provided value pre-fills the field; an omitted value leaves no `value` key at all", () => {
  const fields = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio", label: "My Server" }, false);
  const label = fields.find((f) => f.name === "label") as { value?: string };
  const command = fields.find((f) => f.name === "command") as { value?: string };
  assert.equal(label.value, "My Server");
  assert.equal("value" in command, false);
});

test("writeAllowedToolNames: a provided value pre-fills the field; an omitted value leaves no `value` key", () => {
  const withValue = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio", writeAllowedToolNames: "tool_a" }, false).find(
    (f) => f.name === "writeAllowedToolNames",
  ) as { value?: string };
  const withoutValue = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio" }, false).find((f) => f.name === "writeAllowedToolNames") as {
    value?: string;
  };
  assert.equal(withValue.value, "tool_a");
  assert.equal("value" in withoutValue, false);
});

test("env field's hint differs between create and update", () => {
  const createEnv = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio" }, false).find((f) => f.name === "env") as { hint?: string };
  const updateEnv = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio" }, true).find((f) => f.name === "env") as { hint?: string };
  assert.equal(createEnv.hint, undefined);
  assert.equal(updateEnv.hint, "Leave blank to keep the stored values.");
});

test("oauthClientSecret's hint differs between create and update", () => {
  const createSecret = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio", authMode: "oauth" }, false).find((f) => f.name === "oauthClientSecret") as { hint?: string };
  const updateSecret = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio", authMode: "oauth" }, true).find((f) => f.name === "oauthClientSecret") as { hint?: string };
  assert.equal(createSecret.hint, "Leave blank if this provider needs none (a public/PKCE client).");
  assert.equal(updateSecret.hint, "Leave blank to keep the stored secret.");
});

test("neither env nor secret fields ever carry a `value` key, regardless of input", () => {
  const fields = buildExternalMcpSaveFormFields({ id: "srv-1", transport: "stdio", authMode: "oauth" }, false);
  const env = fields.find((f) => f.name === "env") as Record<string, unknown>;
  const secret = fields.find((f) => f.name === "oauthClientSecret") as Record<string, unknown>;
  assert.equal("value" in env, false);
  assert.equal("value" in secret, false);
});
