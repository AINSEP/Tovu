/**
 * EXTRACT-S5 H3: the gate body moved to `@jini-ai/mcp/federation/hosted` and the sign-in body, device store and shared
 * sign-in to `@jini-ai/integrations/api-connections/hosted-mcp`. Tovu's old paths are thin bound shims: Tovu's own names
 * keep their signatures and bindings, and no moved body is left behind.
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as signIn from "@jini-ai/integrations/api-connections/hosted-mcp";
import * as oldOAuth from "../../external-mcp-oauth.js";

const here = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Tovu's own names keep their arity and bindings", () => {
  assert.equal(oldOAuth.createExternalMcpConnectionGate.length, 1);
  assert.equal(oldOAuth.createExternalMcpOAuthService.length, 1);
  assert.equal(signIn.createDeviceAuthorizationStore.length, 0);
  assert.equal(oldOAuth.tovuSignInPorts.errors.reauthRequired, oldOAuth.createExternalMcpReauthRequiredError);
  const error = oldOAuth.createExternalMcpReauthRequiredError({ serverId: "docs" });
  assert.ok(error instanceof oldOAuth.ExternalMcpReauthRequiredError);
  assert.equal(error.settingsLink, oldOAuth.externalMcpSettingsDeepLink({ serverId: "docs" }));
  assert.equal(oldOAuth.externalMcpSettingsDeepLink({ serverId: "a b" }), "/addons/integrations?tab=external-mcp&server=a%20b");
});

test("no moved body is left in the old files", () => {
  const oauth = here("../../external-mcp-oauth.ts");
  for (const body of ["function readConnectionRowOrRefuse", "function assertNotAwaitingReauth", "function oauthClientOptions", "function setOAuthStatus", "CONNECT_TIMEOUT_MS =", "new Map<string, DeviceAuthorization>"]) {
    assert.ok(!oauth.includes(body), `old external-mcp-oauth.ts still holds ${body}`);
  }
});
