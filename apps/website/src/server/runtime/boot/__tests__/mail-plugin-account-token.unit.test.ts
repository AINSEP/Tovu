import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryExternalMcpServerRepo } from "#src/assistant/external-mcp-store.memory";
import { saveExternalMcpServer } from "#src/assistant/external-mcp-store";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import type { MailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import type { HttpClientPort } from "#src/platform/http/index";
import { createPluginAccountTokenResolver } from "../mail-plugin-account-token.js";
import { resolveMailDomainReadCredential } from "../mail-provider-catalog.js";

const workspaceId = "ws";
const pluginId = "mail-plugin";
const serverId = "mail-account";
const id = "plugin_mail";
const baseUrl = "https://api.vendor.example.com";

/** Exercise both guards through the catalog's real plugin owner and the extracted row resolver. */
async function harness(options: { owner?: string; enabled?: boolean; authMode?: string; missingRow?: boolean; baseUrl?: string } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  if (!options.missingRow) {
    await saveExternalMcpServer({ repo, keyring, sealer, clock: { nowMs: () => 0 } }, {
      workspaceId, serverId, provisionedByPluginId: options.owner ?? pluginId,
      transport: "streamable_http", url: "https://mcp.vendor.example.com/mcp",
      authMode: "static_env", enabled: options.enabled ?? true, principalId: "operator",
      command: "", args: "", allowedToolNames: "", writeAllowedToolNames: "",
      accessToken: "full-access-key",
    });
    const row = await repo.findByServerId({ workspaceId, serverId });
    assert.ok(row);
    // Leave a static key in the payload to prove non-static rows are refused before decryption.
    if (options.authMode) await repo.upsert({ ...row, authMode: options.authMode });
  }
  const adapters: MailAdapterRegistry = { refusals: [], list: () => [{
    pluginId,
    descriptor: { id, label: "Mail", module: "mail.mjs", credentialLabel: "Sending key" },
    module: {
      domainReadConnection: { serverId, baseUrl: options.baseUrl ?? baseUrl },
      create: () => { throw new Error("domain reads must never create a sending mailer"); },
    },
  }] };
  const lookups: unknown[] = [];
  const resolvePluginAccountToken = createPluginAccountTokenResolver({ workspaceId, sealer, repo: {
    findByServerId: async (input) => { lookups.push(input); return repo.findByServerId(input); },
  } });
  const deps = { workspaceId, sealer, customCredentialRepo: new InMemoryCustomCredentialSetRepo(),
    httpClient: {} as HttpClientPort, loadMailAdapters: async () => adapters, resolvePluginAccountToken };
  return { deps, sealer, lookups };
}

for (const scenario of [
  { name: "wrong plugin", options: { owner: "other-plugin" } },
  { name: "disabled account", options: { enabled: false } },
  { name: "missing row", options: { missingRow: true } },
  { name: "OAuth MCP account", options: { authMode: "oauth" } },
  { name: "unknown auth mode", options: { authMode: "unknown" } },
] as const) {
  test(`domain-read fallback refuses a ${scenario.name} before decryption`, async (t) => {
    const { deps, sealer, lookups } = await harness(scenario.options);
    const decrypt = t.mock.method(sealer, "open");

    assert.equal(await resolveMailDomainReadCredential({ deps, id }), null);
    assert.deepEqual(lookups, [{ workspaceId, serverId }]);
    assert.equal(decrypt.mock.callCount(), 0);
  });
}

test("domain-read fallback refuses HTTP before looking up an account key", async (t) => {
  const { deps, sealer, lookups } = await harness({ baseUrl: "http://api.vendor.example.com" });
  const decrypt = t.mock.method(sealer, "open");

  assert.equal(await resolveMailDomainReadCredential({ deps, id }), null);
  assert.deepEqual(lookups, []);
  assert.equal(decrypt.mock.callCount(), 0);
});

test("domain-read fallback returns the active plugin's enabled static key at its declared HTTPS API", async () => {
  const { deps, lookups } = await harness();

  assert.deepEqual(await resolveMailDomainReadCredential({ deps, id }), { token: "full-access-key", baseUrl });
  assert.deepEqual(lookups, [{ workspaceId, serverId }]);
});
