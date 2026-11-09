/**
 * EXTRACT-S5 H3: the gate body moved to `@jini-ai/mcp/federation/hosted` and the sign-in body, device store and shared
 * sign-in to `@jini-ai/integrations/api-connections/hosted-mcp`. Tovu's old paths are thin bound shims: the moved values
 * are re-exported by identity, Tovu's own names keep their signatures and bindings, and no moved body is left behind.
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import * as signIn from "@jini-ai/integrations/api-connections/hosted-mcp";
import * as oldOAuth from "../../external-mcp-oauth.js";
import * as oldShared from "../../external-mcp-shared-oauth.js";

const here = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("old paths re-export the moved Jini values by identity", () => {
  assert.equal(oldOAuth.createHostedMcpConnectionGate, hosted.createHostedMcpConnectionGate);
  assert.equal(oldOAuth.createHostedMcpSignInService, signIn.createHostedMcpSignInService);
  assert.equal(oldOAuth.createDeviceAuthorizationStore, signIn.createDeviceAuthorizationStore);
  assert.equal(oldShared.createSharedExternalMcpOAuth, signIn.createSharedExternalMcpOAuth);
});

test("Tovu's own names keep their arity and bindings", () => {
  assert.equal(oldOAuth.createExternalMcpConnectionGate.length, 1);
  assert.equal(oldOAuth.createExternalMcpOAuthService.length, 1);
  assert.equal(oldOAuth.createDeviceAuthorizationStore.length, 0);
  assert.equal(oldOAuth.tovuSignInPorts.errors.reauthRequired, oldOAuth.createExternalMcpReauthRequiredError);
  const error = oldOAuth.createExternalMcpReauthRequiredError({ serverId: "docs" });
  assert.ok(error instanceof oldOAuth.ExternalMcpReauthRequiredError);
  assert.equal(error.settingsLink, oldOAuth.externalMcpSettingsDeepLink("docs"));
  assert.equal(oldOAuth.externalMcpSettingsDeepLink("a b"), "/settings/external-mcp?server=a%20b");
});

test("no moved body is left in the old files", () => {
  const oauth = here("../../external-mcp-oauth.ts");
  for (const body of ["function readConnectionRowOrRefuse", "function assertNotAwaitingReauth", "function oauthClientOptions", "function setOAuthStatus", "CONNECT_TIMEOUT_MS =", "new Map<string, DeviceAuthorization>"]) {
    assert.ok(!oauth.includes(body), `old external-mcp-oauth.ts still holds ${body}`);
  }
  assert.ok(!here("../../external-mcp-shared-oauth.ts").includes("function createSharedExternalMcpOAuth"));
});
