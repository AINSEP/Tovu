import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { heldUntil } from "../../kernel/__tests__/dialect-matrix.js";
import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import { externalMcpVaultEnvelope } from "../../../../features/external-mcp/external-mcp-vault.js";
import { externalMcpAccessSnapshot } from "../../../../features/external-mcp/external-mcp-store.js";
import type { ExternalMcpServerRecord } from "../../../../features/external-mcp/contracts.js";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlExternalMcpServerRepo } from "../../../../features/external-mcp/external-mcp-repo.js";

/**
 * @file The edit / runtime / access writes of `SqlExternalMcpServerRepo` on every dialect (lost-update
 * design S1, rules M1/M7), the SQL twin of Jini's memory-repo contract tests: a save from an old
 * screen is refused with the first save kept, an edit and a runtime write never overwrite each
 * other's columns, and an access approval advances `version`.
 */

const WS = "workspace-1";
const KEY = { workspaceId: WS, serverId: "oauth-server" };
const NOW = "2026-11-17T00:00:00.000Z";
const LATER = "2026-11-17T01:00:00.000Z";

function oauthEnvelope(ciphertext: string) {
  const id = randomUUID();
  return externalMcpVaultEnvelope({ record: { workspaceId: WS, id, kind: "mcp-auth", ownerKey: KEY.serverId, principalId: null, binding: null, provider: null,
    label: id, isDefault: true, revision: 1, sealed: { keyId: "k", ciphertext, nonce: "bg==", alg: "aes-256-gcm" }, meta: {}, last4: null, tokenLength: null, createdAt: NOW, updatedAt: NOW } }, { staged: true })!;
}

function record(overrides: Partial<ExternalMcpServerRecord> = {}): ExternalMcpServerRecord {
  return { ...KEY, label: "Linear", provisionedByPluginId: null, transport: "streamable_http", authMode: "oauth", enabled: true, command: null, url: "https://mcp.example/mcp",
    args: null, allowedToolNames: '["a"]', writeAllowedToolNames: "[]", writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: null, sealedEnv: null,
    oauthProviderId: null, oauthGrant: "authorization_code", oauthClientId: "client", oauthEndpointsJson: null, oauthScopesJson: null, oauthStatus: "connected",
    oauthExpiresAt: LATER, oauthTokenEnvName: null, oauthRefreshLeaseUntil: null, sealedOAuth: oauthEnvelope("c1"), aadVersion: 1, oauthAadVersion: 1,
    createdAt: NOW, updatedAt: NOW, version: 1, ...overrides };
}

function seeded(kernel: ContentKernel): SqlExternalMcpServerRepo {
  const done = kernel.run(db => db.insertInto("workspaces").values([{ id: WS, name: WS, slug: WS, created_at: NOW }]).onConflict(oc => oc.column("id").doNothing()).execute());
  return new SqlExternalMcpServerRepo(heldUntil(kernel, done.then(() => ensureVaultRepoFixture({ kernel }))));
}

const replaces = (r: ExternalMcpServerRecord) => ({ sealedEnv: r.sealedEnv, sealedOAuth: r.sealedOAuth });
const patch = (sealedOAuth: ExternalMcpServerRecord["sealedOAuth"], overrides = {}) => ({ oauthStatus: "connected", oauthExpiresAt: LATER, oauthRefreshLeaseUntil: null, sealedOAuth, oauthAadVersion: 1, updatedAt: LATER, ...overrides });

describeEachDialect("ExternalMcpServerRepoPort lost updates", { tables: ["workspaces", "external_mcp_servers"], make: seeded }, (makeRepo) => {
  async function seededRow(repo: SqlExternalMcpServerRepo) {
    assert.equal(await repo.insert({ record: record() }), true);
    return (await repo.findByServerId(KEY))!;
  }

  test("insert stores version 1 and refuses a second create without overwriting", async () => {
    const repo = makeRepo();
    const stored = await seededRow(repo);
    assert.equal(stored.version, 1);
    assert.equal(await repo.insert({ record: record({ label: "Second", version: 9 }) }), false);
    assert.equal((await repo.findByServerId(KEY))?.label, "Linear");
  });

  test("T-stale: a save from an old screen is refused after another save landed; the first save stays", async () => {
    const repo = makeRepo();
    const stored = await seededRow(repo);
    assert.equal(await repo.updateIfVersion({ record: { ...stored, label: "Writer 1" }, expectedVersion: 1, replaces: replaces(stored) }), true);
    assert.equal((await repo.findByServerId(KEY))?.version, 2);
    assert.equal(await repo.updateIfVersion({ record: { ...stored, label: "Writer 2" }, expectedVersion: 1, replaces: replaces(stored) }), false);
    assert.equal((await repo.findByServerId(KEY))?.label, "Writer 1");
  });

  test("T-cas: two saves with the same basis started together, exactly one applies", async () => {
    const repo = makeRepo();
    const stored = await seededRow(repo);
    const results = await Promise.all(["A", "B"].map(label => repo.updateIfVersion({ record: { ...stored, label }, expectedVersion: 1, replaces: replaces(stored) })));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await repo.findByServerId(KEY))?.version, 2);
  });

  test("a credential replaced since the read refuses the edit even though the version is unchanged", async () => {
    const repo = makeRepo();
    const stored = await seededRow(repo);
    assert.equal(await repo.updateOAuthRuntime({ key: KEY, expectedSealedOAuth: stored.sealedOAuth, patch: patch(oauthEnvelope("c2")) }), true);
    assert.equal(await repo.updateIfVersion({ record: { ...stored, label: "Edit" }, expectedVersion: 1, replaces: replaces(stored) }), false);
    assert.equal((await repo.findByServerId(KEY))?.label, "Linear");
  });

  test("refresh-vs-disable: a runtime write after an admin's access change keeps the row disabled and its version", async () => {
    const repo = makeRepo();
    const stored = await seededRow(repo);
    const approved = await repo.updateAccessIfCurrent({ ...KEY, expected: externalMcpAccessSnapshot({ record: stored }),
      access: { enabled: false, allowedToolNames: "[]", writeAllowedToolNames: "[]" }, principalId: "admin", nowIso: LATER });
    assert.equal(approved, true);
    assert.equal(await repo.updateOAuthRuntime({ key: KEY, expectedSealedOAuth: stored.sealedOAuth, patch: patch(oauthEnvelope("c2")) }), true);
    const now = (await repo.findByServerId(KEY))!;
    assert.equal(now.enabled, false);
    assert.equal(now.allowedToolNames, "[]");
    assert.equal(now.version, 2);
    assert.equal(now.sealedOAuth?.ciphertext, "c2");
  });

  test("refresh-after-credential-replaced: a late token set is dropped and the replacement stays", async () => {
    const repo = makeRepo();
    const stored = await seededRow(repo);
    assert.equal(await repo.updateIfVersion({ record: { ...stored, sealedOAuth: oauthEnvelope("c9") }, expectedVersion: 1, replaces: replaces(stored) }), true);
    assert.equal(await repo.updateOAuthRuntime({ key: KEY, expectedSealedOAuth: stored.sealedOAuth, patch: patch(oauthEnvelope("late")) }), false);
    assert.equal((await repo.findByServerId(KEY))?.sealedOAuth?.ciphertext, "c9");
  });

  test("access-revoked-then-stale-save: the approval advances the version so a form from before it is refused", async () => {
    const repo = makeRepo();
    const stored = await seededRow(repo);
    await repo.updateAccessIfCurrent({ ...KEY, expected: externalMcpAccessSnapshot({ record: stored }),
      access: { enabled: false, allowedToolNames: "[]", writeAllowedToolNames: "[]" }, principalId: "admin", nowIso: LATER });
    assert.equal(await repo.updateIfVersion({ record: { ...stored, label: "Stale form" }, expectedVersion: stored.version, replaces: replaces(stored) }), false);
    const now = (await repo.findByServerId(KEY))!;
    assert.equal(now.enabled, false);
    assert.equal(now.version, 2);
  });
});
