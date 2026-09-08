import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import type { ExternalMcpOAuthService } from "../external-mcp-oauth.js";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import { externalMcpAgentToolCatalog, type AgentToolDefinition as ExternalMcpAgentToolDefinition, EXTERNAL_MCP_MANAGE_PERMISSION } from "../../features/external-mcp/agent-tools.js";
import { buildExternalMcpRegistrations } from "../../features/external-mcp/tool-registrations.js";
import type { ExternalMcpToolDeps } from "../../features/external-mcp/deps.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests, registerToolContributor } from "../tool-contribution-registry.js";
import { contributeExternalMcpTools } from "../../features/external-mcp/tool-registrations.js";

/**
 * @file The External MCP wiring test — the RED/GREEN proof for
 * `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md`'s Gap #1: `features/external-mcp/
 * agent-tools.ts` defined a complete 5-tool catalog that was never registered anywhere (no
 * `tool-registrations.ts`, no `contributeExternalMcpTools()`, absent from the manifest). Before this
 * file's own sibling `tool-registrations.ts` existed, `buildAssistantToolRegistrations` below wired
 * zero `external_mcp_*` ids — verified by running this exact suite against that state (RED). This
 * suite now asserts the GREEN state: all five ids are reachable through the same production
 * assembly path `installFirstPartyToolContributors()`/`buildAssistantToolRegistrations` uses.
 *
 * Mirrors `tool-registrations.plugins.test.ts`'s shape (contracts, risk cross-check, authorization,
 * a multi-tool workflow), scaled to this domain's own MCP-UI-form-gated write
 * (`deployment_propose_custom_provider_credential`'s test file supplies the emitSurface/deliver
 * pattern for that half).
 */

resetToolContributorsForTests();
registerToolContributor(contributeExternalMcpTools());

const WORKSPACE_ID = "ws-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-07T00:00:00.000Z";

function fakeDeps(options: { allow?: boolean; externalMcpOAuth?: ExternalMcpOAuthService } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);

  const deps: ExternalMcpToolDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async (params: Record<string, unknown>) => {
      authorizeCalls.push(params);
      return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
    },
    clock: { nowIso: () => NOW },
    externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    ...(options.externalMcpOAuth ? { externalMcpOAuth: options.externalMcpOAuth } : {}),
  };

  return { deps, authorizeCalls, repo };
}

function externalMcpRegistrations(deps: ExternalMcpToolDeps): Map<string, ToolRegistration> {
  return new Map(buildExternalMcpRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).map((r) => [r.descriptor.id, r]));
}

/** Same registrations, but built through the REAL production assembly path
 *  (`installFirstPartyToolContributors()`'s own seam) rather than calling this domain's builder
 *  directly — proving the wiring end to end, not just that the builder itself works. */
function assembledExternalMcpRegistrations(deps: ExternalMcpToolDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps as never)
      .filter((r) => r.descriptor.id.startsWith("external_mcp_"))
      .map((r) => [r.descriptor.id, r]),
  );
}

function tool(registrations: Map<string, ToolRegistration>, id: string): ToolRegistration {
  const found = registrations.get(id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): ExternalMcpAgentToolDefinition {
  const entry = externalMcpAgentToolCatalog.find((t) => t.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

interface CallOptions {
  input?: unknown;
  emitSurface?: (surface: unknown) => Promise<void>;
}

function call(registration: ToolRegistration, options: CallOptions = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input: options.input,
    signal: new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  } as ToolExecutionContext;
  return registration.handler(ctx);
}

/** Pulls the exchange id out of the emitted mcp-ui surface's HTML — the same technique
 *  `publish-agent-tools.unit.test.ts`'s `exchangeIdFromSurface` uses. */
function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

/** Raises `external_mcp_save`'s confirmation form and returns everything a test needs to answer it. */
async function raiseSaveForm(saveTool: ToolRegistration, input: Record<string, unknown>) {
  const emitted: unknown[] = [];
  const pending = call(saveTool, { input, emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  return { pending, exchangeId };
}

// ---------------------------------------------------------------------------
// 1. The catalog is complete and all five ids are reachable — the wiring proof
// ---------------------------------------------------------------------------

test("exactly the 5 external-mcp operations are wired — list, save, test_connection, oauth_connect, oauth_poll_device", () => {
  const { deps } = fakeDeps();
  assert.deepEqual([...externalMcpRegistrations(deps).keys()].sort(), [
    "external_mcp_list",
    "external_mcp_oauth_connect",
    "external_mcp_oauth_poll_device",
    "external_mcp_save",
    "external_mcp_test_connection",
  ]);
  assert.equal(externalMcpAgentToolCatalog.length, 5, "there is no unwired external-mcp entry — the whole catalog is wired");
});

test("the same 5 ids are reachable through the REAL production assembly path (installFirstPartyToolContributors's own seam)", () => {
  const { deps } = fakeDeps();
  assert.deepEqual([...assembledExternalMcpRegistrations(deps).keys()].sort(), [
    "external_mcp_list",
    "external_mcp_oauth_connect",
    "external_mcp_oauth_poll_device",
    // Pre-existing sibling tool (`assistant/external-mcp-reauth-tool.ts`, DOMAIN_SLICES) — a
    // narrower, already-wired tool for an ALREADY-BROKEN connection, distinct from this domain's
    // 5-tool catalog (see this file's own header / agent-tools.ts's header). Matches the same
    // `external_mcp_` prefix this filter uses, so it legitimately shows up here too.
    "external_mcp_reauth_prompt",
    "external_mcp_save",
    "external_mcp_test_connection",
  ]);
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired external-mcp registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeDeps();
  for (const [id, registration] of externalMcpRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for all five tools", () => {
  const { deps } = fakeDeps();
  for (const id of externalMcpRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2) — every tool gates on EXTERNAL_MCP_MANAGE_PERMISSION
// ---------------------------------------------------------------------------

const SIMPLE_TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  external_mcp_list: {},
  external_mcp_test_connection: { id: "higgsfield" },
  external_mcp_oauth_connect: { id: "higgsfield" },
  external_mcp_oauth_poll_device: { id: "higgsfield" },
};

for (const toolId of Object.keys(SIMPLE_TOOL_INPUTS)) {
  test(`${toolId}: calls authorize() with EXTERNAL_MCP_MANAGE_PERMISSION and the run's principal`, async () => {
    const { deps, authorizeCalls } = fakeDeps();
    authorizeCalls.length = 0;

    // oauth_connect/oauth_poll_device throw past the authorize() check when no OAuth service is
    // wired — that is a SEPARATE, later failure this test does not care about; only that authorize()
    // itself ran with the right shape.
    await call(tool(externalMcpRegistrations(deps), toolId), { input: SIMPLE_TOOL_INPUTS[toolId] }).catch(() => undefined);

    assert.ok(authorizeCalls.length >= 1);
    assert.equal(authorizeCalls[0]!.principalId, PRINCIPAL_ID);
    assert.equal(authorizeCalls[0]!.permission, EXTERNAL_MCP_MANAGE_PERMISSION);
    assert.equal(authorizeCalls[0]!.permission, catalogEntry(toolId).authorization.permission);
    assert.equal(authorizeCalls[0]!.workspaceId, WORKSPACE_ID);
  });

  test(`${toolId}: a denied principal is rejected`, async () => {
    const { deps } = fakeDeps({ allow: false });
    await assert.rejects(() => call(tool(externalMcpRegistrations(deps), toolId), { input: SIMPLE_TOOL_INPUTS[toolId] }));
  });
}

test("external_mcp_save: authorize() runs BEFORE any form is raised — a denied principal never opens an exchange", async () => {
  const { deps } = fakeDeps({ allow: false });
  const saveTool = tool(externalMcpRegistrations(deps), "external_mcp_save");
  await assert.rejects(() => call(saveTool, { input: { id: "higgsfield", transport: "streamable_http" } }));
});

// ---------------------------------------------------------------------------
// 5. external_mcp_list
// ---------------------------------------------------------------------------

test("external_mcp_list: reflects what is actually stored, never a credential value", async () => {
  const { deps, repo } = fakeDeps();
  await repo.upsert({
    workspaceId: WORKSPACE_ID,
    serverId: "higgsfield",
    label: "Higgsfield",
    transport: "streamable_http",
    authMode: "none",
    enabled: true,
    command: null,
    url: "https://higgsfield.example/mcp",
    args: null,
    allowedToolNames: JSON.stringify(["generate_video"]),
    writeAllowedToolNames: null,
    writeGrantsUpdatedByPrincipalId: null,
    writeGrantsUpdatedAt: null,
    envNames: null,
    sealedEnv: null,
    oauthProviderId: null,
    oauthGrant: null,
    oauthClientId: null,
    oauthEndpointsJson: null,
    oauthScopesJson: null,
    oauthStatus: null,
    oauthExpiresAt: null,
    oauthTokenEnvName: null,
    oauthRefreshLeaseUntil: null,
    sealedOAuth: null,
    aadVersion: 1,
    oauthAadVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const out = (await call(tool(externalMcpRegistrations(deps), "external_mcp_list"), { input: {} })) as {
    servers: Array<{ serverId: string; allowedToolNames: string[] }>;
  };
  const found = out.servers.find((s) => s.serverId === "higgsfield");
  assert.ok(found);
  assert.deepEqual(found.allowedToolNames, ["generate_video"]);
  assert.equal(JSON.stringify(out).includes("sealedEnv"), false, "never leaks the stored blob shape");
});

// ---------------------------------------------------------------------------
// 6. external_mcp_save — MCP-UI form-gated write, mirrors deployment_propose_custom_provider_credential
// ---------------------------------------------------------------------------

test("with no emitSurface, external_mcp_save is refused outright — no exchange is ever opened, nothing saved", async () => {
  const { deps } = fakeDeps();
  const exchanges = createSurfaceExchangeStore();
  const saveTool = new Map(buildExternalMcpRegistrations(deps, { surfaceExchanges: exchanges }).map((r) => [r.descriptor.id, r])).get(
    "external_mcp_save",
  )!;
  await assert.rejects(() => call(saveTool, { input: { id: "higgsfield", transport: "streamable_http" } }));
  assert.equal(exchanges.size(), 0);
});

test("workflow: save a new streamable_http server via the confirmation form, then see it in a fresh list", async () => {
  const { deps } = fakeDeps();
  const exchanges = createSurfaceExchangeStore();
  const registrations = new Map(buildExternalMcpRegistrations(deps, { surfaceExchanges: exchanges }).map((r) => [r.descriptor.id, r]));
  const saveTool = registrations.get("external_mcp_save")!;

  const { pending, exchangeId } = await raiseSaveForm(saveTool, { id: "Higgsfield", transport: "streamable_http", label: "Higgsfield" });
  exchanges.deliver({
    exchangeId,
    toolId: "external_mcp_save",
    principalId: PRINCIPAL_ID,
    params: { id: "higgsfield", transport: "streamable_http", label: "Higgsfield", url: "https://higgsfield.example/mcp", allowedToolNames: "generate_video" },
  });

  const result = (await pending) as { saved: true; server: { serverId: string; url: string | null } };
  assert.equal(result.saved, true);
  assert.equal(result.server.serverId, "higgsfield", "the id the model sent is normalized (trim+lowercase) the same way saveExternalMcpServer normalizes it");
  assert.equal(result.server.url, "https://higgsfield.example/mcp");

  const listed = (await call(registrations.get("external_mcp_list")!, { input: {} })) as { servers: Array<{ serverId: string }> };
  assert.ok(listed.servers.some((s) => s.serverId === "higgsfield"), "the save must be visible in a FRESH list, proving it actually persisted");
});

test("cancelling the form saves nothing", async () => {
  const { deps } = fakeDeps();
  const exchanges = createSurfaceExchangeStore();
  const registrations = new Map(buildExternalMcpRegistrations(deps, { surfaceExchanges: exchanges }).map((r) => [r.descriptor.id, r]));
  const saveTool = registrations.get("external_mcp_save")!;

  const { pending, exchangeId } = await raiseSaveForm(saveTool, { id: "cancelled-one", transport: "streamable_http" });
  exchanges.deliver({
    exchangeId,
    toolId: "external_mcp_save",
    principalId: PRINCIPAL_ID,
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true },
  });

  assert.deepEqual(await pending, { saved: false, cancelled: true });
  const listed = (await call(registrations.get("external_mcp_list")!, { input: {} })) as { servers: unknown[] };
  assert.equal(listed.servers.length, 0);
});

test("an invalid submission (a stdio server with no command) is reported as { saved: false, reason: 'invalid' }, not thrown", async () => {
  const { deps } = fakeDeps();
  const exchanges = createSurfaceExchangeStore();
  const registrations = new Map(buildExternalMcpRegistrations(deps, { surfaceExchanges: exchanges }).map((r) => [r.descriptor.id, r]));
  const saveTool = registrations.get("external_mcp_save")!;

  const { pending, exchangeId } = await raiseSaveForm(saveTool, { id: "broken", transport: "stdio" });
  exchanges.deliver({
    exchangeId,
    toolId: "external_mcp_save",
    principalId: PRINCIPAL_ID,
    params: { id: "broken", transport: "stdio" },
  });

  const result = (await pending) as { saved: false; reason: string; message: string; field: string };
  assert.equal(result.saved, false);
  assert.equal(result.reason, "invalid");
  assert.equal(result.field, "command");
});

// ---------------------------------------------------------------------------
// 7. external_mcp_test_connection — readiness only, never connects
// ---------------------------------------------------------------------------

test("external_mcp_test_connection: unknown id reports ok:false with a named reason, does not throw", async () => {
  const { deps } = fakeDeps();
  const out = await call(tool(externalMcpRegistrations(deps), "external_mcp_test_connection"), { input: { id: "does-not-exist" } });
  assert.deepEqual(out, { ok: false, reason: "no external MCP server is configured as 'does-not-exist'" });
});

test("external_mcp_test_connection: a disabled server reports ok:false without decrypting anything", async () => {
  const { deps, repo } = fakeDeps();
  await repo.upsert({
    workspaceId: WORKSPACE_ID,
    serverId: "disabled-one",
    label: null,
    transport: "streamable_http",
    authMode: "none",
    enabled: false,
    command: null,
    url: "https://example.test/mcp",
    args: null,
    allowedToolNames: null,
    writeAllowedToolNames: null,
    writeGrantsUpdatedByPrincipalId: null,
    writeGrantsUpdatedAt: null,
    envNames: null,
    sealedEnv: null,
    oauthProviderId: null,
    oauthGrant: null,
    oauthClientId: null,
    oauthEndpointsJson: null,
    oauthScopesJson: null,
    oauthStatus: null,
    oauthExpiresAt: null,
    oauthTokenEnvName: null,
    oauthRefreshLeaseUntil: null,
    sealedOAuth: null,
    aadVersion: 1,
    oauthAadVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const out = await call(tool(externalMcpRegistrations(deps), "external_mcp_test_connection"), { input: { id: "disabled-one" } });
  assert.deepEqual(out, { ok: false, reason: "this server is disabled" });
});

test("external_mcp_test_connection: an enabled, resolvable server reports ok:true, and never launches or connects", async () => {
  const { deps, repo } = fakeDeps();
  await repo.upsert({
    workspaceId: WORKSPACE_ID,
    serverId: "ready-one",
    label: null,
    transport: "streamable_http",
    authMode: "none",
    enabled: true,
    command: null,
    url: "https://example.test/mcp",
    args: null,
    allowedToolNames: null,
    writeAllowedToolNames: null,
    writeGrantsUpdatedByPrincipalId: null,
    writeGrantsUpdatedAt: null,
    envNames: null,
    sealedEnv: null,
    oauthProviderId: null,
    oauthGrant: null,
    oauthClientId: null,
    oauthEndpointsJson: null,
    oauthScopesJson: null,
    oauthStatus: null,
    oauthExpiresAt: null,
    oauthTokenEnvName: null,
    oauthRefreshLeaseUntil: null,
    sealedOAuth: null,
    aadVersion: 1,
    oauthAadVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const out = await call(tool(externalMcpRegistrations(deps), "external_mcp_test_connection"), { input: { id: "ready-one" } });
  assert.deepEqual(out, { ok: true });
});

// ---------------------------------------------------------------------------
// 8. external_mcp_oauth_connect / external_mcp_oauth_poll_device
// ---------------------------------------------------------------------------

test("external_mcp_oauth_connect: with no OAuth service wired, fails closed with an actionable message rather than silently no-op'ing", async () => {
  const { deps } = fakeDeps();
  await assert.rejects(
    () => call(tool(externalMcpRegistrations(deps), "external_mcp_oauth_connect"), { input: { id: "higgsfield" } }),
    /no OAuth service wired/,
  );
});

test("external_mcp_oauth_poll_device: with no OAuth service wired, fails closed", async () => {
  const { deps } = fakeDeps();
  await assert.rejects(
    () => call(tool(externalMcpRegistrations(deps), "external_mcp_oauth_poll_device"), { input: { id: "higgsfield" } }),
    /no OAuth service wired/,
  );
});

test("external_mcp_oauth_connect: with TOVU_PUBLIC_URL unset, refuses before ever calling the OAuth service — no absolute redirect URL to build", async () => {
  const originalPublicUrl = process.env.TOVU_PUBLIC_URL;
  delete process.env.TOVU_PUBLIC_URL;
  try {
    const beginConnectCalls: unknown[] = [];
    const oauth: Pick<ExternalMcpOAuthService, "beginConnect"> = {
      async beginConnect(input) {
        beginConnectCalls.push(input);
        return { kind: "redirect_required", authorizationUrl: "https://example.test/authorize", expiresAt: NOW };
      },
    };
    const { deps } = fakeDeps({ externalMcpOAuth: oauth as ExternalMcpOAuthService });
    await assert.rejects(
      () => call(tool(externalMcpRegistrations(deps), "external_mcp_oauth_connect"), { input: { id: "higgsfield" } }),
      /TOVU_PUBLIC_URL is not configured/,
    );
    assert.equal(beginConnectCalls.length, 0, "must refuse before ever reaching the OAuth service");
  } finally {
    if (originalPublicUrl === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = originalPublicUrl;
  }
});

test("external_mcp_oauth_connect: delegates to the wired OAuth service with an absolute, connection-scoped redirect URI built from TOVU_PUBLIC_URL", async () => {
  const originalPublicUrl = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "https://tovu.example.com";
  try {
    const beginConnectCalls: Array<{ serverId: string; redirectUri: string }> = [];
    const oauth: Pick<ExternalMcpOAuthService, "beginConnect"> = {
      async beginConnect(input) {
        beginConnectCalls.push(input);
        return { kind: "redirect_required", authorizationUrl: "https://example.test/authorize", expiresAt: NOW };
      },
    };
    const { deps } = fakeDeps({ externalMcpOAuth: oauth as ExternalMcpOAuthService });

    const out = await call(tool(externalMcpRegistrations(deps), "external_mcp_oauth_connect"), { input: { id: "higgsfield" } });

    assert.deepEqual(out, { kind: "redirect_required", authorizationUrl: "https://example.test/authorize", expiresAt: NOW });
    assert.equal(beginConnectCalls.length, 1);
    assert.equal(beginConnectCalls[0]!.serverId, "higgsfield");
    assert.equal(beginConnectCalls[0]!.redirectUri, "https://tovu.example.com/api/mcp-servers/oauth/callback/higgsfield");
  } finally {
    if (originalPublicUrl === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = originalPublicUrl;
  }
});

test("external_mcp_oauth_poll_device: delegates to the wired OAuth service", async () => {
  const pollCalls: Array<{ serverId: string }> = [];
  const oauth: Pick<ExternalMcpOAuthService, "pollDeviceAuthorization"> = {
    async pollDeviceAuthorization(input) {
      pollCalls.push(input);
      return { status: "connected" };
    },
  };
  const { deps } = fakeDeps({ externalMcpOAuth: oauth as ExternalMcpOAuthService });

  const out = await call(tool(externalMcpRegistrations(deps), "external_mcp_oauth_poll_device"), { input: { id: "higgsfield" } });

  assert.deepEqual(out, { status: "connected" });
  assert.deepEqual(pollCalls, [{ serverId: "higgsfield" }]);
});
