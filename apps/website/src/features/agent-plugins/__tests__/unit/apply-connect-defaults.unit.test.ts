import { createTovuOAuthGuard } from "#src/platform/oauth/endpoint-safety";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createDeviceAuthorizationStore,
  createExternalMcpOAuthService,
  InMemoryExternalMcpServerRepo,
  saveExternalMcpServer,
} from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { createPendingAuthorizationStore, type OAuthFetch, type OAuthProviderDescriptor } from "#src/platform/oauth/index";

import { createApplyConnectDefaults } from "../../apply-connect-defaults.js";
import type { McpServerConfig } from "../../mcp-metadata.js";
import { packAgentPluginDirectory, createBundledSourceArchiveReader } from "../../bundled-source-archive.js";
import { installAgentPlugin } from "../../install.js";
import { resolveAgentPluginLayout } from "../../layout.js";
import { agentPluginActivations } from "../../activation-effects.js";
import { forceRemove } from "../fixtures/force-remove.js";

/**
 * @file `apply-connect-defaults.ts` — S-G2: a plugin's declared `tovuDefaultTools` are granted on the
 * operator's FIRST successful sign-in, through the real OAuth service's `onConnected` port and the
 * real in-memory store, so a pass here means the row the daemon reads actually changed.
 */

const WORKSPACE = "workspace-1";
const SERVER = "supabase";
const PLUGIN = "supabase";
const URL_ = "https://mcp.example.com/mcp";
const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/supabase";

const PROVIDER: OAuthProviderDescriptor = {
  providerId: "test-provider",
  label: "Test Provider",
  supportedGrants: ["authorization_code"],
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  defaultScopes: [],
  usesPkce: true,
  clientAuth: "none",
};

const DECLARED: Readonly<Record<string, McpServerConfig>> = {
  supabase: {
    type: "streamable-http",
    url: URL_,
    tovuAuthMode: "oauth",
    tovuDefaultTools: { allow: ["list_projects", "create_project"], write: ["create_project"] },
  },
};

const tokenFetch = (async () =>
  new Response(JSON.stringify({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as OAuthFetch;

async function makeHarness(row: { allowedToolNames?: string; provisionedByPluginId?: string; url?: string; enableThrows?: boolean; productionBindings?: boolean }) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse("2026-09-27T12:00:00.000Z"), nowIso: () => "2026-09-27T12:00:00.000Z" };

  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: SERVER,
      label: "supabase · supabase",
      transport: "streamable_http",
      authMode: "oauth",
      enabled: false,
      command: "",
      url: row.url ?? URL_,
      args: "",
      allowedToolNames: row.allowedToolNames ?? "",
      writeAllowedToolNames: "",
      principalId: "operator-1",
      oauth: { providerId: PROVIDER.providerId, grant: "authorization_code", clientId: "tovu-client" },
      ...(row.provisionedByPluginId === undefined ? {} : { provisionedByPluginId: row.provisionedByPluginId }),
    },
  );

  const enabledPlugins: string[] = [];
  let rosterNotifications = 0;
  const onConnected = createApplyConnectDefaults({
    workspaceId: WORKSPACE,
    repo,
    clock,
    ...(row.productionBindings ? {} : {
      resolveServers: async (input: { pluginId: string }) => (input.pluginId === PLUGIN ? DECLARED : {}),
      enablePlugin: async (input: { pluginId: string }) => {
        if (row.enableThrows) throw new Error("activation store unwritable");
        enabledPlugins.push(input.pluginId);
      },
    }),
    notifyRosterChanged: async () => {
      rosterNotifications += 1;
    },
  });

  const service = createExternalMcpOAuthService({
    workspaceId: WORKSPACE,
    repo,
    sealer,
    keyring,
    clock,
    pending: createPendingAuthorizationStore({ clock }),
    devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }),
      fetchFn: ({ url }, init) => (tokenFetch)(url, init) },
    lookupProvider: () => PROVIDER,
    onConnected,
  });

  async function signIn(): Promise<void> {
    const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
    assert.equal(started.kind, "redirect_required");
    const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
    await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "auth-code" } });
  }

  async function readRow() {
    const found = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(found);
    return found;
  }

  return { signIn, readRow, enabledPlugins, rosterNotifications: () => rosterNotifications };
}

test("after the first OAuth callback, a plugin-provisioned row with empty lists is enabled with the declared tools", async () => {
  const h = await makeHarness({ provisionedByPluginId: PLUGIN });
  await h.signIn();

  const row = await h.readRow();
  assert.equal(row.oauthStatus, "connected");
  assert.equal(row.enabled, true);
  assert.deepEqual(JSON.parse(row.allowedToolNames ?? "null"), ["list_projects", "create_project"]);
  assert.deepEqual(JSON.parse(row.writeAllowedToolNames ?? "null"), ["create_project"]);
  assert.equal(row.writeGrantsUpdatedAt, "2026-09-27T12:00:00.000Z");
  assert.deepEqual(h.enabledPlugins, [PLUGIN]);
  assert.equal(h.rosterNotifications(), 1);
});

test("OAuth callback composes installed defaults with real plugin activation storage", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-connect-defaults-"));
  const previous = process.env.TOVU_AGENT_PLUGINS_DIR;
  process.env.TOVU_AGENT_PLUGINS_DIR = path.join(dir, "installed");
  try {
    const source = path.join(dir, "source");
    await mkdir(source);
    await writeFile(path.join(source, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: PLUGIN, version: "1.0.0" }));
    await writeFile(path.join(source, "mcp.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: DECLARED }));
    const packed = await packAgentPluginDirectory(source);
    const layout = resolveAgentPluginLayout();
    await installAgentPlugin({ archive: packed.bytes, expectedSha256: packed.sha256,
      archiveReader: createBundledSourceArchiveReader(), layout, workspaceId: WORKSPACE });
    const workspaceRoot = layout.forWorkspace(WORKSPACE).root;
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot, pluginId: PLUGIN, enabled: false, actor: "test:operator" });
    const h = await makeHarness({ provisionedByPluginId: PLUGIN, productionBindings: true });
    await h.signIn();
    const row = await h.readRow();
    assert.equal(row.enabled, true);
    assert.deepEqual(JSON.parse(row.allowedToolNames!), ["list_projects", "create_project"]);
    assert.deepEqual(JSON.parse(row.writeAllowedToolNames!), ["create_project"]);
    const activation = (await agentPluginActivations.readAgentPluginActivations({ workspaceRoot })).plugins[PLUGIN];
    assert.equal(activation?.enabled, true);
    assert.equal(activation?.updatedBy, "system:connect-defaults");
    assert.equal(h.rosterNotifications(), 1);
  } finally {
    if (previous === undefined) delete process.env.TOVU_AGENT_PLUGINS_DIR;
    else process.env.TOVU_AGENT_PLUGINS_DIR = previous;
    await forceRemove(dir);
  }
});

test("a row the operator already edited is untouched by a sign-in", async () => {
  const h = await makeHarness({ provisionedByPluginId: PLUGIN, allowedToolNames: "list_projects" });
  const before = await h.readRow();
  await h.signIn();

  const row = await h.readRow();
  assert.equal(row.enabled, false);
  assert.equal(row.allowedToolNames, before.allowedToolNames);
  assert.equal(row.writeAllowedToolNames, before.writeAllowedToolNames);
  assert.deepEqual(h.enabledPlugins, []);
  assert.equal(h.rosterNotifications(), 0);
});

test("an operator's own row (no provisioning plugin) is untouched by a sign-in", async () => {
  const h = await makeHarness({});
  await h.signIn();

  const row = await h.readRow();
  assert.equal(row.enabled, false);
  assert.deepEqual(h.enabledPlugins, []);
});

test("a provisioned row whose url no longer matches the plugin's declaration is untouched", async () => {
  const h = await makeHarness({ provisionedByPluginId: PLUGIN, url: "https://elsewhere.example.com/mcp" });
  await h.signIn();

  const row = await h.readRow();
  assert.equal(row.enabled, false);
  assert.deepEqual(h.enabledPlugins, []);
});

test("a second sign-in after the defaults applied changes nothing further", async () => {
  const h = await makeHarness({ provisionedByPluginId: PLUGIN });
  await h.signIn();
  await h.signIn();

  assert.deepEqual(h.enabledPlugins, [PLUGIN]);
  assert.equal(h.rosterNotifications(), 1);
});

test("a failing post-connect step never fails the sign-in, and leaves the row for the next sign-in to retry", async () => {
  const h = await makeHarness({ provisionedByPluginId: PLUGIN, enableThrows: true });
  await h.signIn();

  const row = await h.readRow();
  assert.equal(row.oauthStatus, "connected");
  assert.equal(row.enabled, false);
  assert.equal(row.allowedToolNames, "[]");
});
