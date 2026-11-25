/**
 * A06 pin: the hosted sign-in link the Tovu sign-in service hands out is built from the SUPPLIED workspace and server id,
 * on the callback's own origin, through the host-bound `signInLink` (the real browser-binding link at the composition root).
 * The unauthenticated refusal and callback browser binding are pinned at the route level in
 * `server/__tests__/admin-external-mcp-oauth-routes.test.ts` ("the admin OAuth routes require a session",
 * "a forwarded provider URL cannot finish MCP sign-in in another browser").
 */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { createDeviceAuthorizationStore } from "@jini-ai/integrations/api-connections/hosted-mcp";
import type { OAuthProviderDescriptor } from "@jini-ai/core/contracts/oauth";
import { createTovuOAuthGuard } from "#src/platform/oauth/endpoint-safety";
import { hostedMcpSignInLink } from "../../../api-connections/browser-binding.js";
import { InMemoryKeyring } from "../../../webhooks/keyring.env.js";
import { InMemoryExternalMcpServerRepo } from "../../external-mcp-store.memory.js";
import { saveExternalMcpServer } from "../../external-mcp-store.js";
import { createExternalMcpOAuthService, createTovuSignInPorts } from "../../external-mcp-oauth.js";

const WS = "33333333-3333-4333-8333-333333333333" as never;
const SERVER = "docs-ws3";
const clock = { nowMs: () => Date.parse("2026-09-27T12:00:00.000Z"), nowIso: () => "2026-09-27T12:00:00.000Z" };
const provider: OAuthProviderDescriptor = { providerId: "acme-idp", label: "Acme IdP", supportedGrants: ["authorization_code"],
  authorizationEndpoint: "https://idp.acme.example/authorize", tokenEndpoint: "https://idp.acme.example/token", defaultScopes: [], usesPkce: true, clientAuth: "none" };

async function service(signInLink: Parameters<typeof createTovuSignInPorts>[0]["signInLink"]) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer({ keyring });
  await saveExternalMcpServer({ repo, sealer, keyring, clock } as never, {
    workspaceId: WS, serverId: SERVER, label: "Docs", transport: "streamable_http", authMode: "oauth", enabled: true,
    command: "", url: "https://mcp.acme.example/mcp", args: "", allowedToolNames: "search", writeAllowedToolNames: "", principalId: "operator-1",
    oauth: { providerId: "acme-idp", grant: "authorization_code", clientId: "client-1" },
  } as never);
  return createExternalMcpOAuthService({ workspaceId: WS, repo, sealer, keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}) } as never, lookupProvider: () => provider, signInLink });
}

test("hosted sign-in link uses the supplied workspace and server id on the callback origin", async () => {
  const svc = await service(hostedMcpSignInLink);
  const started = await svc.beginConnect({ serverId: SERVER, redirectUri: "https://host.example.com/api/mcp-servers/oauth/callback", delivery: "hosted" });
  assert.equal(started.kind, "redirect_required");
  assert.equal(started.kind === "redirect_required" && started.authorizationUrl,
    `https://host.example.com/api/admin/v1/workspaces/${WS}/mcp-servers/docs-ws3/oauth/sign-in`);
});

test("the service passes the exact callback, workspace and server id to the injected link builder", async () => {
  const seen: unknown[] = [];
  const svc = await service(input => { seen.push(input); return "/fixture-link"; });
  const redirectUri = "https://host.example.com/api/mcp-servers/oauth/callback";
  const started = await svc.beginConnect({ serverId: SERVER, redirectUri, delivery: "hosted" });
  assert.equal(started.kind === "redirect_required" && started.authorizationUrl, "/fixture-link");
  assert.deepEqual(seen, [{ callbackUrl: redirectUri, workspaceId: WS, serverId: SERVER }]);
});

test("createTovuSignInPorts binds the supplied link and nothing else changes per call", () => {
  const link = () => "/x";
  const a = createTovuSignInPorts({ signInLink: link });
  const b = createTovuSignInPorts({ signInLink: hostedMcpSignInLink });
  assert.equal(a.signInLink, link);
  assert.equal(b.signInLink, hostedMcpSignInLink);
  assert.equal(a.copy, b.copy);
  assert.equal(a.errors, b.errors);
});
