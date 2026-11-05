import assert from "node:assert/strict";
import test from "node:test";
import { deriveApiConnectionKey } from "@jini-ai/integrations/api-connections";
import { InMemoryVaultRepo, prepareVaultArchiveRestore, type VaultArchiveEntry } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { rebindApiConnectionArchive, createApiConnectionVault, createApiConnectionVaultRecordStore, createApiConnectionVaultTokenStore } from "../../api-connections/vault-stores.js";

const owner = { workspaceId: "source", pluginId: "office", connectionId: "main", clientId: "client" };
const key = deriveApiConnectionKey(owner);
const base = { kind: "api-connection" as const, ownerKey: "tovu", binding: null, provider: null, label: key, isDefault: false };
function entries(): VaultArchiveEntry[] {
  return [
    { ...base, id: `record:${key}`, meta: { credentialFormat: "api-connection-record" }, payload: { record: {
      ...owner, key, status: "connected", revision: 4, generation: 3, account: { accountId: "account", displayName: "Account" }, grantedScopes: ["read"],
      staged: { actorId: "source-person", code: "transient" }, revocationFailure: null, updatedAt: "2026-10-31T00:00:00Z" } } },
    { ...base, id: key, meta: { credentialFormat: "oauth-token-set", status: "active", leaseHolder: "source-process", leaseExpiresAtMs: 123 }, payload: {
      format: "oauth-token-set", version: 1, key, owner, generation: 3,
      tokens: { accessToken: "access-token", refreshToken: "refresh-token", tokenType: "Bearer", scopes: ["read"], expiresAt: null } } },
    { ...base, id: `attempt:${key}`, meta: { credentialFormat: "api-connection-attempt", expiresAtMs: 456 }, payload: { attempt: { codeVerifier: "pkce-secret" } } },
    { ...base, id: `${key}#staged`, meta: { credentialFormat: "oauth-token-set", status: "active", leaseHolder: null, leaseExpiresAtMs: null }, payload: { tokens: { accessToken: "staged-token" } } },
  ];
}
test("API transport re-derives workspace keys and retains matched durable record/token only", { timeout: 10000 }, () => {
  const input = entries(), result = rebindApiConnectionArchive({ entries: input, workspaceId: "recipient" });
  const rebound = deriveApiConnectionKey({ ...owner, workspaceId: "recipient" });
  assert.deepEqual(result.entries.map(row => row.id), [`record:${rebound}`, rebound]);
  const record = result.entries[0]!.payload!.record as Record<string, unknown>;
  assert.equal(record.key, rebound);
  assert.equal(record.workspaceId, "recipient");
  assert.equal(record.staged, null);
  assert.equal(result.entries[1]!.payload!.key, rebound);
  assert.equal((result.entries[1]!.payload!.owner as Record<string, unknown>).workspaceId, "recipient");
  assert.equal(result.entries[1]!.meta.leaseHolder, null);
  assert.equal(result.entries[1]!.meta.leaseExpiresAtMs, null);
  for (const transient of ["pkce-secret", "staged-token", "source-process", "source-person"]) assert.equal(JSON.stringify(result.entries).includes(transient), false);
  assert.equal((input[0]!.payload!.record as Record<string, unknown>).workspaceId, "source");
});
test("unmatched or invalid API token rows are omitted with safe notices", { timeout: 10000 }, () => {
  const input = entries();
  input[1]!.payload!.key = "other";
  const result = rebindApiConnectionArchive({ entries: input.slice(0, 2), workspaceId: "recipient" });
  assert.deepEqual(result.entries, []);
  assert.equal(result.notices.length, 1);
  assert.equal(JSON.stringify(result.notices).includes("access-token"), false);
});

test("the real recipient record and OAuth token stores can use the re-sealed connection", { timeout: 10000 }, async () => {
  const workspaceId = "recipient", clock = { nowMs: () => 0 }, repo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring({ hkdfSalt: "api-archive" }), sealer = new AesGcmSecretSealer({ keyring });
  const vault = createApiConnectionVault({ repo, keyring, sealer, clock, workspaceId });
  const rebound = rebindApiConnectionArchive({ entries: entries(), workspaceId });
  const prepared = await prepareVaultArchiveRestore({ entries: rebound.entries, vault, workspaceId });
  await repo.applyBatch({ ops: prepared.map(record => ({ put: { record, expectedRevision: null } })) });
  const records = createApiConnectionVaultRecordStore({ vault, workspaceId, clock });
  const targetOwner = { ...owner, workspaceId }, targetKey = deriveApiConnectionKey(targetOwner);
  const tokens = createApiConnectionVaultTokenStore({ vault, records, owner: targetOwner, clock });
  assert.equal((await records.read({ key: targetKey }))?.generation, 3);
  assert.equal((await tokens.load({ key: targetKey }))?.accessToken, "access-token");
  assert.equal(await tokens.load({ key }), null);
  assert.equal((await records.read({ key: targetKey }))?.staged, null);
});


test("archive transport excludes owner references and shared OAuth bindings, preserving ordinary plugin state", () => {
  const state = (id: string, value: Record<string, string>): VaultArchiveEntry => ({
    ...base, id, meta: { credentialFormat: "agent-plugin-state" }, payload: { value },
  });
  const references = [
    state("plugin-state:tovu-key-references:reference", { credentialId: "owner-key" }),
    state("plugin-state:tovu-shared-oauth-binding:consumer", { credentialId: "owner-oauth" }),
  ];
  const ordinary = state("plugin-state:office:preferences", { view: "compact" });
  const result = rebindApiConnectionArchive({ entries: [...references, ordinary], workspaceId: "recipient" });
  assert.deepEqual(result.entries, [ordinary]);
  assert.equal(JSON.stringify(result.entries).includes("owner-oauth"), false);
  assert.equal(JSON.stringify(result.entries).includes("owner-key"), false);
});
