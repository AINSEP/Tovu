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

/** `options.kernel`: an empty database of the given dialect's family (real Postgres for the
 * `*.postgres.test.ts` parity file); otherwise a fresh in-memory one. */
export async function vaultFixture(dialect: "sqlite" | "pglite", options: { kernel?: StorageKernel<unknown> } = {}) {
  const kernel = options.kernel ?? (dialect === "sqlite" ? openMemorySqliteKernel<unknown>() : openPgliteKernel<unknown>());
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

/** Query-parity rows the S2 fixture lacks (DBMERGE-PLAN §2d): a second workspace for isolation, a
 * second principal per workspace, a vendor group whose rows share `updated_at` (tie-break), two media
 * providers, two custom categories, a keyed and a keyless peer, MCP servers that are env-only,
 * oauth-only and bare, and a real `github` source row. Same historical AAD literals as above; rows
 * are added on the pre-0012 schema so 0012 and the boot re-seal carry them like a live site's.
 */
export async function seedParityRows(fixture: { kernel: StorageKernel<unknown>; keyring: InMemoryKeyring; sealer: AesGcmSecretSealer },
  dialect: "sqlite" | "pglite"): Promise<void> {
  const { kernel, keyring, sealer } = fixture;
  const key = await keyring.activeKey({});
  const bool = (value: boolean) => dialect === "sqlite" ? (value ? 1 : 0) : value;
  async function seal(plaintext: string, aad: string, prefix = "") {
    const sealed = await sealer.seal({ plaintext, aad, key });
    return { [`${prefix}sealed_key_id`]: sealed.keyId, [`${prefix}sealed_ciphertext`]: sealed.ciphertext,
      [`${prefix}sealed_nonce`]: sealed.nonce, [`${prefix}sealed_alg`]: sealed.alg };
  }
  await insertFixture(kernel, "workspaces", { id: "ws2", name: "ws2", slug: "ws2", created_at: stamp });
  await insertFixture(kernel, "principals", { id: "p2", workspace_id: "ws", kind: "user", display_name: "Second", status: "active", created_at: stamp });
  await insertFixture(kernel, "principals", { id: "q", workspace_id: "ws2", kind: "user", display_name: "Other", status: "active", created_at: stamp });
  const ws = { workspace_id: "ws", created_at: stamp, updated_at: stamp };
  const ws2 = { workspace_id: "ws2", created_at: stamp, updated_at: stamp };
  await insertFixture(kernel, "site_assistant_credentials", { ...ws2, provider: "openai", model: "ws2-model", base_url: null,
    ...await seal("ws2-site-token-1234567890", "site-assistant-credential:v1:ws2"), masked: "••••7890", aad_version: 1 });
  for (const [workspace, principal, token] of [["ws", "p2", "second-personal-token-1234"], ["ws2", "q", "other-personal-token-1234"]] as const) {
    await insertFixture(kernel, "admin_execution_credentials", { workspace_id: workspace, created_at: stamp, updated_at: stamp, principal_id: principal,
      protocol: "anthropic", provider_id: `provider-${principal}`, base_url: null, model: `model-${principal}`, max_tokens: null,
      ...await seal(token, ""), masked: "••••1234", aad_version: 0 });
  }
  await insertFixture(kernel, "media_provider_credentials", { ...ws, provider_id: "openai", model: "two-model", base_url: "https://media.example.test",
    ...await seal("media-two-token-123456", "media-provider-credential:v1:ws:openai"), key_tail: "3456", aad_version: 1 });
  await insertFixture(kernel, "media_provider_credentials", { ...ws2, provider_id: "media-test", model: "ws2-media", base_url: null,
    ...await seal("ws2-media-token-123456", "media-provider-credential:v1:ws2:media-test"), key_tail: "3456", aad_version: 1 });
  await insertFixture(kernel, "custom_credential_sets", { ...ws, id: "custom-ai", label: "AI keys", category: "ai",
    base_url: "https://ai.example.test", additional_hosts_json: "[]", username: "column-login",
    ...await seal(JSON.stringify({ token: "custom-ai-token-1234567890" }), "custom-credential-set:v1:ws:custom-ai") });
  await insertFixture(kernel, "custom_credential_sets", { ...ws2, id: "custom-ws2", label: "Custom", category: "general",
    base_url: "https://ws2.example.test", additional_hosts_json: "[]", username: null,
    ...await seal(JSON.stringify({ token: "custom-ws2-token-1234567890" }), "custom-credential-set:v1:ws2:custom-ws2") });
  for (const [id, label, isDefault] of [["tie-a", "Tie A", false], ["tie-b", "Tie B", true], ["tie-c", "Tie C", false]] as const) {
    await insertFixture(kernel, "vendor_credential_sets", { ...ws, id, vendor_id: "vendor-tie", label, is_default: bool(isDefault), account_label: null, token_tail: "",
      ...await seal(JSON.stringify({ vendorId: "vendor-tie", token: `${id}-token-1234567890` }), `vendor-credential-set:v1:ws:vendor-tie:${id}`) });
  }
  await insertFixture(kernel, "vendor_credential_sets", { ...ws2, id: "ws2-vendor", vendor_id: "vendor-test", label: "Saved", is_default: bool(true), account_label: null, token_tail: "",
    ...await seal(JSON.stringify({ vendorId: "vendor-test", token: "ws2-vendor-token-1234567890" }), "vendor-credential-set:v1:ws2:vendor-test:ws2-vendor") });
  await insertFixture(kernel, "source_control_credential_sets", { ...ws, id: "gh", provider_id: "github", label: "GitHub", is_default: bool(true), account_label: "octo",
    ...await seal(JSON.stringify({ providerId: "github", token: "ghp-parity-token-1234567890", username: "octo" }), "source-control-credential-set:v1:ws:github:gh") });
  await insertFixture(kernel, "source_control_credential_sets", { ...ws2, id: "gh-ws2", provider_id: "github", label: "GitHub", is_default: bool(true), account_label: null,
    ...await seal(JSON.stringify({ providerId: "github", token: "ghp-ws2-token-1234567890" }), "source-control-credential-set:v1:ws2:github:gh-ws2") });
  await insertFixture(kernel, "publish_content_peers", { ...ws2, id: "peer-ws2", label: "Peer", base_url: "https://ws2-peer.example.test",
    remote_workspace_id: "remote-ws2", masked: "••••7890", aad_version: 1,
    ...await seal("ws2-peer-token-1234567890", "publish-content-peer:v1:ws2:peer-ws2") });
  await insertFixture(kernel, "database_transfer_destinations", { workspace_id: "ws2", host: "ws2.example.test", port: "5433", database_name: "ws2", user_name: "ws2-writer",
    saved_at: stamp, aad_version: 1, last_run_json: null,
    ...await seal("postgres://ws2-writer:secret@ws2.example.test:5433/ws2", "database-transfer-destination:v1:ws2") });
  const mcp = { url: null, command: "mcp-server", args: "[]", allowed_tool_names: "[]", write_allowed_tool_names: "[]",
    write_grants_updated_by_principal_id: null, write_grants_updated_at: null, oauth_provider_id: null, oauth_grant: null, oauth_client_id: null,
    oauth_status: null, oauth_expires_at: null, oauth_endpoints_json: null, oauth_scopes_json: null, oauth_refresh_lease_until: null, enabled: bool(true) };
  await insertFixture(kernel, "external_mcp_servers", { ...ws, ...mcp, server_id: "env-only", label: "Env only", transport: "stdio", auth_mode: "static_env",
    env_names: '["TOKEN"]', aad_version: 0, oauth_aad_version: 0, ...await seal(JSON.stringify({ TOKEN: "env-only-secret" }), "") });
  await insertFixture(kernel, "external_mcp_servers", { ...ws, ...mcp, server_id: "oauth-only", label: "OAuth only", transport: "streamable_http", auth_mode: "oauth",
    url: "https://oauth-only.example.test", command: null, env_names: "[]", oauth_provider_id: "oauth-test", oauth_grant: "authorization_code", oauth_client_id: "client-2",
    oauth_status: "connected", oauth_endpoints_json: '{"tokenEndpoint":"https://oauth-only.example.test/token"}', oauth_scopes_json: "[]", aad_version: 0, oauth_aad_version: 1,
    ...await seal(JSON.stringify({ schemaVersion: 1, tokens: { accessToken: "oauth-only-access" } }), "external-mcp-oauth:v1:ws:oauth-only", "oauth_") });
  await insertFixture(kernel, "external_mcp_servers", { ...ws, ...mcp, server_id: "bare", label: "Bare", transport: "stdio", auth_mode: "none",
    env_names: "[]", enabled: bool(false), aad_version: 0, oauth_aad_version: 0 });
  await insertFixture(kernel, "external_mcp_servers", { ...ws2, ...mcp, server_id: "server", label: "Other workspace", transport: "stdio", auth_mode: "static_env",
    env_names: '["NAME"]', aad_version: 0, oauth_aad_version: 0, ...await seal(JSON.stringify({ NAME: "ws2-env-value" }), "") });
}
