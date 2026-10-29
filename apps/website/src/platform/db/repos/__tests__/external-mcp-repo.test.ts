import { randomUUID } from "node:crypto";
import { heldUntil } from "../../kernel/__tests__/dialect-matrix.js";
import { ensureVaultRepoFixture } from "#src/platform/db/repos/__tests__/vault-repo.fixture";
import { externalMcpVaultEnvelope, externalMcpVaultRecord } from "#src/assistant/external-mcp-vault";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contentKernel } from "../../content-kernel.js";
import { openContentDb, openSqliteContentConnection } from "../../sqlite/content-db.js";

import type { ExternalMcpServerRecord } from "#src/assistant/index";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect, freshSqliteContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlExternalMcpServerRepo } from "../../../../assistant/external-mcp-repo.js";

/**
 * @file `SqlExternalMcpServerRepo` against a real, migrated content database on every dialect
 * (SQLite + PGlite, storage plan §4).
 *
 * Had ZERO test coverage of any kind before this file — confirmed via the combined-lcov cross-check
 * (toRecord/listByWorkspaceId/findByServerId/upsert/deleteByServerId all read 0 hits, deduped). What
 * the real DB proves pointer FKs, atomic payload/status writes, bounded roster queries and the
 * server-table refresh lease. The prepared vault step is applied only to disposable fixtures;
 * it remains unregistered in the application migration runner.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-21T00:00:00.000Z";
const LATER = "2026-08-21T01:00:00.000Z";

function makeRecord(overrides: Partial<ExternalMcpServerRecord> = {}): ExternalMcpServerRecord {
  const record: ExternalMcpServerRecord = {
    workspaceId: WORKSPACE,
    serverId: "my-server",
    label: "My Server",
    provisionedByPluginId: null,
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: JSON.stringify(["-y", "my-mcp-server"]),
    allowedToolNames: JSON.stringify(["search", "fetch"]),
    writeAllowedToolNames: null,
    writeGrantsUpdatedByPrincipalId: null,
    writeGrantsUpdatedAt: null,
    envNames: JSON.stringify(["API_KEY"]),
    sealedEnv: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    authMode: "static_env",
    url: null,
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
    ...overrides,
  };
  for (const kind of ["mcp-env", "mcp-auth"] as const) {
    const field = kind === "mcp-env" ? "sealedEnv" : "sealedOAuth";
    const sealed = record[field];
    if (!sealed) continue;
    const id = randomUUID();
    record[field] = externalMcpVaultEnvelope({ record: { workspaceId: record.workspaceId, id, kind,
      ownerKey: record.serverId, principalId: null, binding: null, provider: null, label: id,
      isDefault: true, revision: 1, sealed, meta: {}, last4: null, tokenLength: null, createdAt: NOW, updatedAt: NOW } }, { staged: true });
  }
  return record;
}

/** A fully OAuth-configured row: the second auth mode, the second sealed group, and every plaintext
 *  OAuth column populated — so the round-trip test proves this adapter carries all of them, not just
 *  the ones the static-env fixture happens to set. */
function makeOAuthRecord(overrides: Partial<ExternalMcpServerRecord> = {}): ExternalMcpServerRecord {
  return makeRecord({
    serverId: "oauth-server",
    authMode: "oauth",
    envNames: null,
    sealedEnv: null,
    oauthProviderId: "example-oidc",
    oauthGrant: "device_code",
    oauthClientId: "tovu-client",
    oauthEndpointsJson: JSON.stringify({ tokenEndpoint: "https://auth.example.com/token" }),
    oauthScopesJson: JSON.stringify(["images:generate"]),
    oauthStatus: "connected",
    oauthExpiresAt: "2026-08-21T02:00:00.000Z",
    oauthTokenEnvName: "PROVIDER_TOKEN",
    oauthRefreshLeaseUntil: null,
    sealedOAuth: { keyId: "k2", ciphertext: "b2F1dGg=", nonce: "bjI=", alg: "aes-256-gcm" },
    ...overrides,
  });
}

/** The repo on `kernel`, every call held until both workspaces (the rows' FK parent) exist. */
async function prepareVault(kernel: ContentKernel): Promise<void> {
  await ensureVaultRepoFixture({ kernel });
}

function seededRepo(kernel: ContentKernel): SqlExternalMcpServerRepo {
  const seeded = kernel.run((db) =>
    db
      .insertInto("workspaces")
      .values([WORKSPACE, OTHER_WORKSPACE].map((id) => ({ id, name: id, slug: id, created_at: NOW })))
      .onConflict((oc) => oc.column("id").doNothing())
      .execute()
  );
  return new SqlExternalMcpServerRepo(heldUntil(kernel, seeded.then(() => prepareVault(kernel))));
}

test("independent SQLite connections race for one OAuth lease and persist exactly the winner", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-lease-race-"));
  let first: ReturnType<typeof openContentDb> | undefined;
  let second: ReturnType<typeof openSqliteContentConnection> | undefined;
  try {
    const file = path.join(dir, "content.db");
    first = openContentDb(file);
    first.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(WORKSPACE, WORKSPACE, WORKSPACE, NOW);
    await prepareVault(contentKernel(first));
    second = openSqliteContentConnection(file);
    const repos = [new SqlExternalMcpServerRepo(contentKernel(first)), new SqlExternalMcpServerRepo(contentKernel(second))];
    await repos[0].upsert(makeOAuthRecord());
    const claims = [
      { workspaceId: WORKSPACE, serverId: "oauth-server", nowIso: NOW, leaseUntil: LATER },
      { workspaceId: WORKSPACE, serverId: "oauth-server", nowIso: NOW, leaseUntil: "2026-08-21T02:00:00.000Z" },
    ];
    const results = await Promise.all(repos.map((repo, index) => repo.tryClaimOAuthRefreshLease(claims[index]!)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((result) => !result).length, 1);
    const winner = results.findIndex(Boolean);
    const expected = makeOAuthRecord({ oauthRefreshLeaseUntil: claims[winner]!.leaseUntil });
    for (const repo of repos) {
      assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "oauth-server" }), expected);
    }
  } finally {
    second?.$client.close();
    first?.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describeEachDialect("ExternalMcpServerRepoPort", { tables: ["workspaces", "external_mcp_servers"], make: seededRepo }, (makeRepo) => {
  test("listByWorkspaceId returns an empty array when no rows exist", async () => {
    assert.deepEqual(await makeRepo().listByWorkspaceId(WORKSPACE), []);
  });

  test("findByServerId returns null when no row matches", async () => {
    assert.equal(await makeRepo().findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), null);
  });

  test("upsert then findByServerId round-trips a record exactly, including JSON-as-stored string columns", async () => {
    const repo = makeRepo();
    const record = makeRecord();

    await repo.upsert(record);

    assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), record);
  });

  test("the write-authorization list and its attribution round-trip through a real column, not just the double", async () => {
    const repo = makeRepo();
    const record = makeRecord({
      writeAllowedToolNames: JSON.stringify(["fetch"]),
      writeGrantsUpdatedByPrincipalId: "principal-1",
      writeGrantsUpdatedAt: "2026-08-21T00:30:00.000Z",
    });

    await repo.upsert(record);

    assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), record);
  });

  test("a record with no sealed env round-trips with sealedEnv: null (no vault pointer)", async () => {
    const repo = makeRepo();
    const record = makeRecord({ sealedEnv: null, envNames: null });

    await repo.upsert(record);

    assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), record);
  });

  test("nullable plaintext fields (label, command, args, allowedToolNames) round-trip as null", async () => {
    const repo = makeRepo();
    const record = makeRecord({ label: null, command: null, args: null, allowedToolNames: null, sealedEnv: null, envNames: null });

    await repo.upsert(record);

    assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "my-server" }), record);
  });

  test("an OAuth row round-trips every plaintext OAuth column AND the second sealed group", async () => {
    const repo = makeRepo();
    const record = makeOAuthRecord();

    await repo.upsert(record);

    assert.deepEqual(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "oauth-server" }), record);
  });

  test("the two sealed groups are independent — an OAuth blob with no env block keeps the pointers independent", async () => {
    const repo = makeRepo();

    // A missing env pointer must not hide the OAuth pointer.
    await repo.upsert(makeOAuthRecord({ sealedEnv: null, envNames: null }));
    await repo.upsert(makeRecord({ serverId: "env-only", sealedOAuth: null }));

    const rows = await repo.listByWorkspaceId(WORKSPACE);
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.serverId === "oauth-server")?.sealedEnv, null);
    assert.equal(rows.find((row) => row.serverId === "env-only")?.sealedOAuth, null);
  });

  test("OAuth lease claims and releases isolate workspace and server and include the expiry boundary", async () => {
    const repo = makeRepo();
    const target = makeOAuthRecord();
    const foreign = makeOAuthRecord({ workspaceId: OTHER_WORKSPACE });
    const sibling = makeOAuthRecord({ serverId: "oauth-sibling" });
    for (const record of [target, foreign, sibling]) await repo.upsert(record);
    const key = { workspaceId: WORKSPACE, serverId: target.serverId };
    assert.equal(await repo.tryClaimOAuthRefreshLease({ ...key, nowIso: NOW, leaseUntil: LATER }), true);
    assert.deepEqual(await repo.findByServerId(foreign), foreign);
    assert.deepEqual(await repo.findByServerId(sibling), sibling);
    const foreignUntil = "2026-08-21T03:00:00.000Z";
    assert.equal(await repo.tryClaimOAuthRefreshLease({ workspaceId: OTHER_WORKSPACE, serverId: foreign.serverId, nowIso: NOW, leaseUntil: foreignUntil }), true);
    assert.equal(await repo.tryClaimOAuthRefreshLease({ ...key, nowIso: LATER, leaseUntil: "2026-08-21T02:00:00.000Z" }), true);
    assert.deepEqual(await repo.findByServerId(foreign), { ...foreign, oauthRefreshLeaseUntil: foreignUntil });
    await repo.releaseOAuthRefreshLease(key);
    assert.deepEqual(await repo.findByServerId(target), target);
    assert.deepEqual(await repo.findByServerId(foreign), { ...foreign, oauthRefreshLeaseUntil: foreignUntil });
    assert.deepEqual(await repo.findByServerId(sibling), sibling);
  });

  test("tryClaimOAuthRefreshLease is a compare-and-set: the second concurrent claimant loses", async () => {
    const repo = makeRepo();
    await repo.upsert(makeOAuthRecord());
    const claim = { workspaceId: WORKSPACE, serverId: "oauth-server", nowIso: NOW, leaseUntil: LATER };

    assert.equal(await repo.tryClaimOAuthRefreshLease(claim), true);
    // The loser must observe the loss. If this ever returns true, two processes redeem the same
    // single-use rotating refresh token and the connection dies until a human re-authorizes it.
    assert.equal(await repo.tryClaimOAuthRefreshLease(claim), false);
    assert.equal((await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "oauth-server" }))?.oauthRefreshLeaseUntil, LATER);
  });

  test("an EXPIRED lease is claimable again, so a crashed holder cannot wedge the connection", async () => {
    const repo = makeRepo();
    await repo.upsert(makeOAuthRecord());
    await repo.tryClaimOAuthRefreshLease({ workspaceId: WORKSPACE, serverId: "oauth-server", nowIso: NOW, leaseUntil: LATER });

    const afterExpiry = "2026-08-21T02:00:00.000Z";
    assert.equal(
      await repo.tryClaimOAuthRefreshLease({ workspaceId: WORKSPACE, serverId: "oauth-server", nowIso: afterExpiry, leaseUntil: "2026-08-21T03:00:00.000Z" }),
      true,
    );
  });

  test("releaseOAuthRefreshLease clears the lease so the next caller can claim immediately", async () => {
    const repo = makeRepo();
    await repo.upsert(makeOAuthRecord());
    await repo.tryClaimOAuthRefreshLease({ workspaceId: WORKSPACE, serverId: "oauth-server", nowIso: NOW, leaseUntil: LATER });

    await repo.releaseOAuthRefreshLease({ workspaceId: WORKSPACE, serverId: "oauth-server" });

    assert.equal((await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "oauth-server" }))?.oauthRefreshLeaseUntil, null);
    assert.equal(await repo.tryClaimOAuthRefreshLease({ workspaceId: WORKSPACE, serverId: "oauth-server", nowIso: NOW, leaseUntil: LATER }), true);
  });

  test("claiming a lease on a row that does not exist reports failure rather than inventing one", async () => {
    const repo = makeRepo();

    assert.equal(await repo.tryClaimOAuthRefreshLease({ workspaceId: WORKSPACE, serverId: "absent", nowIso: NOW, leaseUntil: LATER }), false);
  });

  test("upsert on the same (workspaceId, serverId) updates in place rather than duplicating", async () => {
    const repo = makeRepo();
    await repo.upsert(makeRecord({ enabled: true, updatedAt: NOW }));

    await repo.upsert(makeRecord({ enabled: false, label: "Renamed", updatedAt: LATER }));

    const rows = await repo.listByWorkspaceId(WORKSPACE);
    assert.equal(rows.length, 1, "the composite PK must make this an UPDATE, not a second row");
    assert.equal(rows[0].enabled, false);
    assert.equal(rows[0].label, "Renamed");
    assert.equal(rows[0].updatedAt, LATER);
  });

  test("listByWorkspaceId returns multiple servers for one workspace, scoped away from another workspace's rows", async () => {
    const repo = makeRepo();
    await repo.upsert(makeRecord({ serverId: "server-a" }));
    await repo.upsert(makeRecord({ serverId: "server-b" }));
    await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, serverId: "server-a" }));

    const rows = await repo.listByWorkspaceId(WORKSPACE);

    assert.deepEqual(
      rows.map((r) => r.serverId).sort(),
      ["server-a", "server-b"]
    );
  });

  test("deleteByServerId returns true and removes the row when it existed", async () => {
    const repo = makeRepo();
    await repo.upsert(makeRecord({ serverId: "server-a" }));

    const deleted = await repo.deleteByServerId({ workspaceId: WORKSPACE, serverId: "server-a" });

    assert.equal(deleted, true);
    assert.equal(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "server-a" }), null);
  });

  test("deleteByServerId returns false and changes nothing when no row matches", async () => {
    const repo = makeRepo();

    const deleted = await repo.deleteByServerId({ workspaceId: WORKSPACE, serverId: "does-not-exist" });

    assert.equal(deleted, false);
  });

  test("deleteByServerId never crosses a workspace boundary", async () => {
    const repo = makeRepo();
    await repo.upsert(makeRecord({ workspaceId: WORKSPACE, serverId: "server-a" }));
    await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, serverId: "server-a" }));

    const deleted = await repo.deleteByServerId({ workspaceId: WORKSPACE, serverId: "server-a" });

    assert.equal(deleted, true);
    assert.equal(await repo.findByServerId({ workspaceId: WORKSPACE, serverId: "server-a" }), null);
    assert.ok(
      await repo.findByServerId({ workspaceId: OTHER_WORKSPACE, serverId: "server-a" }),
      "the other workspace's row must survive"
    );
  });
  test("payloads, pointers, status and expiry roll back together when the server write fails", async () => {
    const repo = makeRepo();
    const original = makeOAuthRecord();
    await repo.upsert(original);
    const before = await repo.vaultRepo.list({ workspaceId: WORKSPACE, kind: "mcp-auth", ownerKey: original.serverId, principalId: null });
    const failed = makeOAuthRecord({ transport: null as unknown as string, oauthStatus: "needs_reauth", oauthExpiresAt: null });
    await assert.rejects(repo.upsert(failed)); // NOT NULL fails after the new vault payload was inserted.
    assert.deepEqual(await repo.findByServerId(original), original);
    assert.deepEqual(await repo.vaultRepo.list({ workspaceId: WORKSPACE, kind: "mcp-auth", ownerKey: original.serverId, principalId: null }), before);
  });

  test("a failed second secret write also rolls back the first payload and its default change", async () => {
    const repo = makeRepo();
    const original = makeRecord();
    await repo.upsert(original);
    const before = await repo.vaultRepo.list({ workspaceId: WORKSPACE, kind: "mcp-env", ownerKey: original.serverId, principalId: null });
    const wrongOwner = makeOAuthRecord().sealedOAuth;
    const failed = makeRecord({ oauthStatus: "connected", oauthExpiresAt: LATER });
    failed.sealedOAuth = wrongOwner;
    await assert.rejects(repo.upsert(failed));
    assert.deepEqual(await repo.findByServerId(original), original);
    assert.deepEqual(await repo.vaultRepo.list({ workspaceId: WORKSPACE, kind: "mcp-env", ownerKey: original.serverId, principalId: null }), before);
  });

  test("replacement and deletion unlink both vault pointers before removing their payloads", async () => {
    const repo = makeRepo();
    const original = makeOAuthRecord({ sealedEnv: makeRecord().sealedEnv });
    await repo.upsert(original);
    const keys = ["mcp-env", "mcp-auth"] as const;
    const old = keys.map(kind => externalMcpVaultRecord({ sealed: (kind === "mcp-env" ? original.sealedEnv : original.sealedOAuth)!, identity: original, kind }).id);
    const replacement = makeOAuthRecord({ sealedEnv: makeRecord().sealedEnv, updatedAt: LATER });
    await repo.upsert(replacement);
    for (const id of old) assert.equal(await repo.vaultRepo.find({ workspaceId: WORKSPACE, id }), null);
    assert.deepEqual(await repo.findByServerId(original), replacement);
    await repo.deleteByServerId(original);
    for (const kind of keys) assert.deepEqual(await repo.vaultRepo.list({ workspaceId: WORKSPACE, kind, ownerKey: original.serverId, principalId: null }), []);
  });

  test("roster reads hydrate every server's two payloads in one query", async () => {
    const repo = makeRepo();
    for (let n = 0; n < 8; n++) await repo.upsert(makeOAuthRecord({ serverId: `batch-${n}`, sealedEnv: makeRecord().sealedEnv }));
    const kernel = (repo as unknown as { kernel: ContentKernel }).kernel;
    let queries = 0;
    const observed = new SqlExternalMcpServerRepo({ ...kernel, query: async statement => { queries++; return kernel.query(statement); } });
    const rows = await observed.listByWorkspaceId(WORKSPACE);
    assert.equal(queries, 1);
    assert.equal(rows.length, 8);
    assert.ok(rows.every(row => row.sealedEnv && row.sealedOAuth));
  });

});

/** A server with both payloads stored for real, read back through a kernel whose roster query
 *  overlays `patch` on every joined row. The JOIN itself never returns a foreign or malformed
 *  payload, so this is the only way to reach the read path's defensive refusals. */
async function readTampered(patch: Record<string, unknown>): Promise<ExternalMcpServerRecord | null> {
  const kernel = freshSqliteContentKernel();
  await kernel.run((db) => db.insertInto("workspaces").values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, created_at: NOW }).execute());
  await prepareVault(kernel);
  const record = makeOAuthRecord({ sealedEnv: makeRecord().sealedEnv });
  await new SqlExternalMcpServerRepo(kernel).upsert(record);
  const tampered = new SqlExternalMcpServerRepo({
    ...kernel,
    query: async (statement) => (await kernel.query(statement)).map((row) => ({ ...row, ...patch })),
  });
  return tampered.findByServerId(record);
}

const CONTEXT_REFUSAL = { name: "VaultError", code: "context", message: "Secrets vault: context" };
const INVALID_RECORD = { name: "VaultError", code: "invalid-record", message: "Secrets vault: invalid-record" };

test("joined payload: a live env pointer whose payload row is missing is refused as a context error", async () => {
  await assert.rejects(readTampered({ env_id: null }), CONTEXT_REFUSAL);
});

test("joined payload: an env payload from another workspace is refused as a context error", async () => {
  await assert.rejects(readTampered({ env_workspace_id: OTHER_WORKSPACE }), CONTEXT_REFUSAL);
});

test("joined payload: an env payload owned by another server is refused as a context error", async () => {
  await assert.rejects(readTampered({ env_owner_key: "other-server" }), CONTEXT_REFUSAL);
});

test("joined payload: an env pointer to an OAuth-kind payload is refused as a context error", async () => {
  await assert.rejects(readTampered({ env_kind: "mcp-auth" }), CONTEXT_REFUSAL);
});

test("joined payload: an env payload bound to a principal is refused as a context error", async () => {
  await assert.rejects(readTampered({ env_principal_id: "principal-1" }), CONTEXT_REFUSAL);
});

test("joined payload: an env payload with a binding is refused as a context error", async () => {
  await assert.rejects(readTampered({ env_binding: "binding-1" }), CONTEXT_REFUSAL);
});

test("joined payload: the OAuth pointer is checked too — an env-kind payload behind it is refused", async () => {
  await assert.rejects(readTampered({ oauth_kind: "mcp-env" }), CONTEXT_REFUSAL);
});

for (const column of ["sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg"]) {
  test(`joined payload: an env payload with no ${column} is refused as an invalid record`, async () => {
    await assert.rejects(readTampered({ [`env_${column}`]: null }), INVALID_RECORD);
  });
}

test("joined payload: the context check runs before the sealed-parts check", async () => {
  await assert.rejects(readTampered({ env_owner_key: "other-server", env_sealed_nonce: null }), CONTEXT_REFUSAL);
});

test("joined payload: a NULL is_default reads as not default", async () => {
  const found = await readTampered({ env_is_default: null });

  assert.equal(externalMcpVaultRecord({ sealed: found!.sealedEnv!, identity: found!, kind: "mcp-env" }).isDefault, false);
});

test("joined payload: a stored revision string reads as a number", async () => {
  const found = await readTampered({ env_revision: "7" });

  assert.equal(externalMcpVaultRecord({ sealed: found!.sealedEnv!, identity: found!, kind: "mcp-env" }).revision, 7);
});

test("joined payload: meta stored as JSON text is parsed", async () => {
  const found = await readTampered({ env_meta: JSON.stringify({ source: "text" }) });

  assert.deepEqual(externalMcpVaultRecord({ sealed: found!.sealedEnv!, identity: found!, kind: "mcp-env" }).meta, { source: "text" });
});

test("joined payload: meta already decoded by the driver is kept as-is", async () => {
  const found = await readTampered({ env_meta: { source: "object" } });

  assert.deepEqual(externalMcpVaultRecord({ sealed: found!.sealedEnv!, identity: found!, kind: "mcp-env" }).meta, { source: "object" });
});

test("server row: a NULL enabled flag reads as disabled", async () => {
  assert.equal((await readTampered({ enabled: null }))?.enabled, false);
});
