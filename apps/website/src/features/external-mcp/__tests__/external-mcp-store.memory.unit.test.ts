import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import type { SealedSecret } from "../../webhooks/index.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { externalMcpVaultRecord, sealExternalMcpVaultPayload } from "../external-mcp-vault.js";
import type { ExternalMcpServerRecord } from "../contracts.js";

const keyring = new InMemoryKeyring();
const deps = { keyring, sealer: new AesGcmSecretSealer(keyring) };
const IDENTITY = { workspaceId: "ws-1", serverId: "srv-1" };

function serverRecord(overrides: Partial<ExternalMcpServerRecord> = {}): ExternalMcpServerRecord {
  return { ...IDENTITY, label: null, provisionedByPluginId: null, transport: "stdio", authMode: "none", enabled: true, command: "node",
    url: null, args: null, allowedToolNames: null, writeAllowedToolNames: null, writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null,
    envNames: null, sealedEnv: null, oauthProviderId: null, oauthGrant: null, oauthClientId: null, oauthEndpointsJson: null,
    oauthScopesJson: null, oauthStatus: null, oauthExpiresAt: null, oauthTokenEnvName: null, oauthRefreshLeaseUntil: null, sealedOAuth: null,
    aadVersion: 1, oauthAadVersion: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}
const sealEnv = (value: string): Promise<SealedSecret> => sealExternalMcpVaultPayload({ deps, identity: IDENTITY, kind: "mcp-env", payload: { TOKEN: value } });
const sealOAuth = (value: string): Promise<SealedSecret> => sealExternalMcpVaultPayload({ deps, identity: IDENTITY, kind: "mcp-auth", payload: { clientSecret: value } });
const vaultId = (sealed: SealedSecret | null, kind: "mcp-env" | "mcp-auth"): string => externalMcpVaultRecord({ sealed: sealed!, identity: IDENTITY, kind }).id;

/** Saves a row holding both envelopes and returns the hydrated read. */
async function savedWithBoth(repo: InMemoryExternalMcpServerRepo): Promise<ExternalMcpServerRecord> {
  await repo.upsert(serverRecord({ sealedEnv: await sealEnv("one"), sealedOAuth: await sealOAuth("two") }));
  return (await repo.findByServerId(IDENTITY))!;
}

test("a saved row reads back with both envelopes bound to this server's vault rows", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const env = await sealEnv("one");
  const oauth = await sealOAuth("two");
  await repo.upsert(serverRecord({ sealedEnv: env, sealedOAuth: oauth }));
  const found = await repo.findByServerId(IDENTITY);
  assert.equal(vaultId(found!.sealedEnv, "mcp-env"), vaultId(env, "mcp-env"));
  assert.equal(vaultId(found!.sealedOAuth, "mcp-auth"), vaultId(oauth, "mcp-auth"));
  assert.deepEqual({ ...found!.sealedEnv }, { ...env });
});

test("a row without envelopes reads back with null envelopes", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.upsert(serverRecord());
  assert.deepEqual(await repo.findByServerId(IDENTITY), serverRecord());
});

test("re-saving the hydrated envelopes keeps them", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const saved = await savedWithBoth(repo);
  await repo.upsert({ ...saved, label: "renamed" });
  const found = await repo.findByServerId(IDENTITY);
  assert.equal(found!.label, "renamed");
  assert.equal(vaultId(found!.sealedEnv, "mcp-env"), vaultId(saved.sealedEnv, "mcp-env"));
  assert.equal(vaultId(found!.sealedOAuth, "mcp-auth"), vaultId(saved.sealedOAuth, "mcp-auth"));
});

test("rotating the env envelope deletes the replaced vault row", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const saved = await savedWithBoth(repo);
  const rotated = await sealEnv("three");
  await repo.upsert({ ...saved, sealedEnv: rotated });
  assert.equal(vaultId((await repo.findByServerId(IDENTITY))!.sealedEnv, "mcp-env"), vaultId(rotated, "mcp-env"));
  await assert.rejects(repo.upsert(saved), { name: "VaultError", code: "conflict" });
});

test("clearing the OAuth envelope deletes its vault row and reads back null", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const saved = await savedWithBoth(repo);
  await repo.upsert({ ...saved, sealedOAuth: null });
  assert.equal((await repo.findByServerId(IDENTITY))!.sealedOAuth, null);
  await assert.rejects(repo.upsert(saved), { name: "VaultError", code: "conflict" });
});

test("a failed save leaves the live row untouched and later writes still run", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const saved = await savedWithBoth(repo);
  const foreign = new InMemoryExternalMcpServerRepo();
  const unknownEnvelope = (await savedWithBoth(foreign)).sealedEnv;
  await repo.upsert({ ...saved, sealedEnv: null, sealedOAuth: null });
  await assert.rejects(repo.upsert({ ...saved, label: "never", sealedEnv: unknownEnvelope }), { name: "VaultError", code: "conflict" });
  assert.deepEqual(await repo.findByServerId(IDENTITY), { ...saved, sealedEnv: null, sealedOAuth: null });
  await repo.upsert({ ...saved, sealedEnv: null, sealedOAuth: null, label: "after" });
  assert.equal((await repo.findByServerId(IDENTITY))!.label, "after");
});

test("list returns only the requested workspace's rows", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.upsert(serverRecord());
  await repo.upsert(serverRecord({ workspaceId: "ws-2" }));
  assert.deepEqual((await repo.listByWorkspaceId("ws-1")).map(row => row.workspaceId), ["ws-1"]);
});

test("finding an unknown server returns null", async () => {
  assert.equal(await new InMemoryExternalMcpServerRepo().findByServerId(IDENTITY), null);
});

test("deleting an unknown server reports false", async () => {
  assert.equal(await new InMemoryExternalMcpServerRepo().deleteByServerId(IDENTITY), false);
});

test("deleting a server removes the row and both vault payloads", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  const saved = await savedWithBoth(repo);
  assert.equal(await repo.deleteByServerId(IDENTITY), true);
  assert.equal(await repo.findByServerId(IDENTITY), null);
  await assert.rejects(repo.upsert(saved), { name: "VaultError", code: "conflict" });
});

test("deleting a server with only an env envelope succeeds", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.upsert(serverRecord({ sealedEnv: await sealEnv("one") }));
  assert.equal(await repo.deleteByServerId(IDENTITY), true);
  assert.equal(await repo.findByServerId(IDENTITY), null);
});

test("a refresh lease is claimable on a row with no lease and is recorded", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.upsert(serverRecord());
  assert.equal(await repo.tryClaimOAuthRefreshLease({ ...IDENTITY, nowIso: "2026-01-01T00:00:00.000Z", leaseUntil: "2026-01-01T00:01:00.000Z" }), true);
  assert.equal((await repo.findByServerId(IDENTITY))!.oauthRefreshLeaseUntil, "2026-01-01T00:01:00.000Z");
});

test("a live refresh lease cannot be claimed by a second claimant", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.upsert(serverRecord({ oauthRefreshLeaseUntil: "2026-01-01T00:01:00.000Z" }));
  assert.equal(await repo.tryClaimOAuthRefreshLease({ ...IDENTITY, nowIso: "2026-01-01T00:00:59.999Z", leaseUntil: "2026-01-01T00:02:00.000Z" }), false);
});

test("a lease expiring exactly now is abandoned and can be reclaimed", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.upsert(serverRecord({ oauthRefreshLeaseUntil: "2026-01-01T00:01:00.000Z" }));
  assert.equal(await repo.tryClaimOAuthRefreshLease({ ...IDENTITY, nowIso: "2026-01-01T00:01:00.000Z", leaseUntil: "2026-01-01T00:02:00.000Z" }), true);
});

test("a lease cannot be claimed on an unknown server", async () => {
  assert.equal(await new InMemoryExternalMcpServerRepo().tryClaimOAuthRefreshLease({ ...IDENTITY, nowIso: "2026-01-01T00:00:00.000Z",
    leaseUntil: "2026-01-01T00:01:00.000Z" }), false);
});

test("releasing a lease clears it", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.upsert(serverRecord({ oauthRefreshLeaseUntil: "2026-01-01T00:01:00.000Z" }));
  await repo.releaseOAuthRefreshLease(IDENTITY);
  assert.equal((await repo.findByServerId(IDENTITY))!.oauthRefreshLeaseUntil, null);
});

test("releasing a lease on an unknown server creates no row", async () => {
  const repo = new InMemoryExternalMcpServerRepo();
  await repo.releaseOAuthRefreshLease(IDENTITY);
  assert.equal(await repo.findByServerId(IDENTITY), null);
});
