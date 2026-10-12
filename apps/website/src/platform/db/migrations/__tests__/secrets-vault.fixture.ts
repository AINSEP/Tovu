import { sql } from "kysely";
import { AesGcmSecretSealer, type SealedSecret } from "@jini-ai/platform/secrets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import type { VaultKind } from "@jini-ai/platform/secrets/credential-sets";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { CONTENT_MIGRATIONS } from "../index.js";
import { runMigrations } from "../runner.js";
import { secretsVault, SECRETS_VAULT_ID } from "../0012_secrets_vault.js";

/** S2 fixtures use the real pre-step schema and real GCM. Historical AAD literals are independent
 * of the copied codec implementation so a typo in a copied builder actually strands a fixture.
 */
export const stamp = "2026-10-11T12:00:00.000Z";
export const previous = CONTENT_MIGRATIONS.filter(step => step.id < SECRETS_VAULT_ID);
export const vaultStep = secretsVault({ checksum: "a".repeat(64) });
type Values = Record<string, string | number | boolean | null>;
export interface FixtureEnvelope {
  table: string; kind: VaultKind; id: string; workspaceId: string;
  plaintext: string; sealed: SealedSecret; prefix: string;
}

export async function insertFixture(kernel: StorageKernel<unknown>, table: string, values: Values): Promise<void> {
  await kernel.execute(sql`INSERT INTO ${sql.table(table)} (${sql.join(Object.keys(values).map(name => sql.ref(name)))})
    VALUES (${sql.join(Object.values(values).map(value => sql`${value}`))})`);
}

export async function vaultFixture(dialect: "sqlite" | "pglite") {
  const kernel = dialect === "sqlite" ? openMemorySqliteKernel<unknown>() : openPgliteKernel<unknown>();
  try {
    await runMigrations(kernel, previous);
    for (const id of ["ws", "ws-empty"]) await insertFixture(kernel, "workspaces", { id, name: id, slug: id, created_at: stamp });
    await insertFixture(kernel, "principals", { id: "p", workspace_id: "ws", kind: "user", display_name: "Person", status: "active", created_at: stamp });
    const keyring = new InMemoryKeyring({ hkdfSalt: "vault-step-test" });
    const sealer = new AesGcmSecretSealer({ keyring });
    const key = await keyring.activeKey({});
    const envelopes: FixtureEnvelope[] = [];
    async function envelope(table: string, kind: VaultKind, id: string, plaintext: string, aad: string, prefix = "") {
      const sealed = await sealer.seal({ plaintext, aad, key });
      envelopes.push({ table, kind, id, workspaceId: "ws", plaintext, sealed, prefix });
      return { [`${prefix}sealed_key_id`]: sealed.keyId, [`${prefix}sealed_ciphertext`]: sealed.ciphertext,
        [`${prefix}sealed_nonce`]: sealed.nonce, [`${prefix}sealed_alg`]: sealed.alg };
    }
    const common = { workspace_id: "ws", created_at: stamp, updated_at: stamp };
    const token = "long-token-1234567890";
    await insertFixture(kernel, "site_assistant_credentials", { ...common, provider: "google", model: "test-model", base_url: null,
      ...await envelope("site_assistant_credentials", "site-assistant", "ws", token, "site-assistant-credential:v1:ws"), masked: "••••7890", aad_version: 1 });
    await insertFixture(kernel, "admin_execution_credentials", { ...common, principal_id: "p", protocol: "openai", provider_id: "provider-test",
      base_url: "https://ai.example.test/v1", model: "personal-model", max_tokens: 333,
      ...await envelope("admin_execution_credentials", "personal-execution", "p", "personal-long-token", ""), masked: "••••oken", aad_version: 0 });
    await insertFixture(kernel, "media_provider_credentials", { ...common, provider_id: "media-test", model: "media-model", base_url: null,
      ...await envelope("media_provider_credentials", "media-provider", "media-test", "short", "media-provider-credential:v1:ws:media-test"), key_tail: "hort", aad_version: 1 });
    await insertFixture(kernel, "custom_credential_sets", { ...common, id: "custom", label: "Custom", category: "general",
      base_url: "https://api.example.test/v1", additional_hosts_json: '["https://other.example.test"]', username: null,
      ...await envelope("custom_credential_sets", "custom", "custom", JSON.stringify({ token, username: "login" }), "custom-credential-set:v1:ws:custom") });
    await insertFixture(kernel, "publish_content_peers", { ...common, id: "peer", label: "Peer", base_url: "https://peer.example.test",
      remote_workspace_id: "remote", masked: "••••7890", aad_version: 1,
      ...await envelope("publish_content_peers", "publish-peer", "peer", token, "publish-content-peer:v1:ws:peer") });
    await insertFixture(kernel, "database_transfer_destinations", { workspace_id: "ws", host: "db.example.test", port: "5432", database_name: "content", user_name: "writer",
      saved_at: stamp, aad_version: 1, last_run_json: JSON.stringify({ copied: true, snapshotAt: stamp, tableCount: 2, rowCount: 4 }),
      ...await envelope("database_transfer_destinations", "database-destination", "ws", "postgres://writer:password@db.example.test/content", "database-transfer-destination:v1:ws") });
    const bool = dialect === "sqlite" ? 1 : true;
    await insertFixture(kernel, "vendor_credential_sets", { ...common, id: "collision", vendor_id: "vendor-test", label: "Saved", is_default: bool, account_label: "vendor-account", token_tail: "7890",
      ...await envelope("vendor_credential_sets", "vendor", "collision", JSON.stringify({ vendorId: "vendor-test", token }), "vendor-credential-set:v1:ws:vendor-test:collision") });
    await insertFixture(kernel, "source_control_credential_sets", { ...common, id: "source", provider_id: "source-test", label: "Source", is_default: bool, account_label: "source-account",
      ...await envelope("source_control_credential_sets", "source-control", "source", JSON.stringify({ providerId: "source-test", token, username: "paired" }), "source-control-credential-set:v1:ws:source-test:source") });
    await insertFixture(kernel, "publish_credential_sets", { ...common, id: "collision", provider_id: "legacy-host", label: "Saved", is_default: bool, account_label: "legacy-account",
      ...await envelope("publish_credential_sets", "vendor", "collision", JSON.stringify({ providerId: "legacy-host", token: "different-legacy-token" }), "publish-credential-set:v1:ws:legacy-host:collision") });
    await insertFixture(kernel, "external_mcp_servers", { ...common, server_id: "server", label: "Server", transport: "streamable_http", auth_mode: "oauth", enabled: bool,
      url: "https://mcp.example.test", command: null, args: '["--safe"]', env_names: '["NAME"]',
      allowed_tool_names: '["read"]', write_allowed_tool_names: '["write"]', write_grants_updated_by_principal_id: "p", write_grants_updated_at: stamp,
      oauth_provider_id: "oauth-test", oauth_grant: "authorization_code", oauth_client_id: "client", oauth_status: "connected", oauth_expires_at: stamp,
      oauth_endpoints_json: '{"tokenEndpoint":"https://mcp.example.test/token"}', oauth_scopes_json: '["scope"]', oauth_refresh_lease_until: stamp,
      aad_version: 0, oauth_aad_version: 1,
      ...await envelope("external_mcp_servers", "mcp-env", "server", JSON.stringify({ NAME: "env-value" }), ""),
      ...await envelope("external_mcp_servers", "mcp-auth", "server", JSON.stringify({ schemaVersion: 1, clientSecret: "client-secret", tokens: { accessToken: "access-token" } }), "external-mcp-oauth:v1:ws:server", "oauth_") });
    await insertFixture(kernel, "external_mcp_tool_approvals", { workspace_id: "ws", server_id: "server", tool_name: "read", fingerprint: "fingerprint", granted_by_principal_id: "p", granted_at: stamp });
    await insertFixture(kernel, "oauth_pending_authorizations", { state: "pending", owner_key: "ws:server", provider_id: "oauth-test", redirect_uri: "https://site.example.test/callback", scopes_json: "[]", created_at: stamp, expires_at: stamp,
      sealed_key_id: "device-key", sealed_ciphertext: "pending-bytes", sealed_nonce: "pending-nonce", sealed_alg: "aes-256-gcm" });
    await insertFixture(kernel, "oauth_device_authorizations", { workspace_id: "ws", server_id: "server", user_code: "CODE", verification_uri: "https://oauth.example.test/device", verification_uri_complete: null,
      interval_seconds: 5, expires_at: stamp, created_at: stamp, sealed_key_id: "device-key", sealed_ciphertext: "device-bytes", sealed_nonce: "device-nonce", sealed_alg: "aes-256-gcm" });
    const empty = { workspace_id: "ws-empty", created_at: stamp, updated_at: stamp };
    await insertFixture(kernel, "site_assistant_credentials", { ...empty, provider: "google", model: "metadata-only", aad_version: 0 });
    await insertFixture(kernel, "media_provider_credentials", { ...empty, provider_id: "media-test", model: "metadata-only", aad_version: 0 });
    await insertFixture(kernel, "publish_content_peers", { ...common, id: "peer-empty", label: "Empty peer", base_url: "https://empty.example.test", remote_workspace_id: "remote-empty", aad_version: 1 });
    return { kernel, keyring, sealer, envelopes };
  } catch (error) { await kernel.close(); throw error; }
}
