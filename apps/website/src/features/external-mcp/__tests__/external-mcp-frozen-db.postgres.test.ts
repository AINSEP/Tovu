import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql } from "kysely";
import type { FederatedCallTarget } from "@jini-ai/mcp/federation";
import { dropDatabase, freshPostgresDatabase } from "../../../platform/db/__tests__/postgres-database.js";
import type { ContentDatabase } from "../../../platform/db/content-database.generated.js";
import type { ContentKernel } from "../../../platform/db/content-kernel.js";
import { openPostgresKernel } from "../../../platform/db/kernel/drivers/postgres.js";
import type { StorageKernel } from "../../../platform/db/kernel/port.js";
import { migrateContentDatabase } from "../../../platform/db/migrations/index.js";
import { ensureVaultRepoFixture } from "../../../platform/db/repos/__tests__/vault-repo.fixture.js";
import { createExternalMcpConnectionGate } from "../external-mcp-oauth.js";
import { externalMcpAdmissionRevision, listExternalMcpServerViews, saveExternalMcpServer } from "../external-mcp-store.js";
import { FROZEN_PLAINTEXT, FROZEN_SERVERS, FROZEN_TABLES, FROZEN_WORKSPACE, closeFrozenDb, loadFrozenSql, openFrozenDb, readFrozenSql,
  snapshotFrozenRows } from "./fixtures/mcp-credentials-frozen.fixture.js";
import { AFTER_RESTART_AT, EXPIRED_AT, NEW_ENV_KEY, REFRESHED, type Row, VALID_AT, assertOpensAllThree, changedColumns, nonZero, requireRecord,
  resetCounts, serverRow, vaultRow, wire } from "./fixtures/frozen-db-harness.js";

/**
 * @file G-mcp on REAL PostgreSQL (EXTRACT-S5 H0): the frozen fixture's rows — the exact sealed bytes
 * minted on SQLite — replayed into a migrated Postgres content database, then read, refreshed, re-saved
 * and reopened after a reconnect through the same retained `SqlExternalMcpServerRepo` and store. Needs
 * a local server (`PGHOST`/`PGUSER`, see `platform/db/__tests__/postgres-database.ts`); like the other
 * `*.postgres.test.ts` files it fails, never skips, when the server is down.
 */

const database = "tovu_external_mcp_frozen_test";
const BOOLEAN_COLUMNS = new Set(["enabled", "is_default"]);
let connectionString = "";
let kernel: ContentKernel;

/** The fixture's rows as SQLite stores them (loaded through the same SQL text), minus SQLite's rowid. */
async function fixtureRows(): Promise<Record<string, Row[]>> {
  const { db } = await openFrozenDb(":memory:");
  loadFrozenSql({ db, sqlText: readFrozenSql() });
  const rows = snapshotFrozenRows({ db });
  closeFrozenDb(db);
  return Object.fromEntries(Object.entries(rows).map(([table, list]) => [table, list.map(({ __rowid: _rowid, ...row }) => row)]));
}

async function pgSnapshot(target: ContentKernel): Promise<Record<string, Row[]>> {
  const entries = await Promise.all(FROZEN_TABLES.map(async ([table, column]) => [table,
    await target.query<Row>(sql`SELECT * FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ${FROZEN_WORKSPACE} ORDER BY created_at, ${sql.ref(table === "external_mcp_servers" ? "server_id" : "id")}`)] as const));
  return Object.fromEntries(entries);
}

before(async () => {
  connectionString = freshPostgresDatabase(database);
  kernel = openPostgresKernel<ContentDatabase>({ connectionString });
  await migrateContentDatabase(kernel as StorageKernel<unknown>);
  await ensureVaultRepoFixture({ kernel });
  const rows = await fixtureRows();
  for (const [table] of FROZEN_TABLES) {
    for (const row of rows[table] ?? []) {
      const values = Object.fromEntries(Object.entries(row).map(([column, value]) => [column, BOOLEAN_COLUMNS.has(column) ? value === 1 : value]));
      await kernel.execute(sql`INSERT INTO ${sql.table(table)} (${sql.join(Object.keys(values).map((column) => sql.ref(column)))})
        VALUES (${sql.join(Object.values(values))})`);
    }
  }
});
after(async () => {
  await kernel?.close();
  dropDatabase({ database });
});

test("frozen fixture [postgres]: replayed sealed bytes open, refresh under the lease, re-save and survive a reconnect", async () => {
  const before = await pgSnapshot(kernel);
  const read = wire({ kernel, clockIso: VALID_AT });
  await listExternalMcpServerViews({ repo: read.repo, sealer: read.sealer }, FROZEN_WORKSPACE);
  assert.deepEqual(Object.values(FROZEN_SERVERS).map((serverId) => read.openedAad.filter((aad) => aad.includes(serverId)).length), [1, 1, 2]);
  assert.deepEqual(nonZero(read.io.kernel), { query: 1 });
  await assertOpensAllThree(read, { envKey: FROZEN_PLAINTEXT.envBlock.FAKE_API_KEY, accessToken: FROZEN_PLAINTEXT.accessToken, refreshToken: FROZEN_PLAINTEXT.refreshToken });

  const record = await requireRecord(read.repo, FROZEN_SERVERS.oauth);
  const gate = createExternalMcpConnectionGate({ workspaceId: FROZEN_WORKSPACE, repo: read.repo, isPluginEnabled: async () => true });
  const call: FederatedCallTarget = { remoteName: "generate_image", declaredAnnotations: undefined, origin: { kind: "roster", admissionRevision: externalMcpAdmissionRevision(record) } };
  resetCounts(read.io.kernel, read.io.repo, read.io.sealer);
  assert.equal(await gate(FROZEN_SERVERS.oauth, call), "current-grants-checked");
  assert.deepEqual(nonZero(read.io.repo), { findByServerId: 1 });
  assert.deepEqual(nonZero(read.io.kernel), { query: 1 });
  assert.deepEqual(nonZero(read.io.sealer), {});

  const h = wire({ kernel, clockIso: EXPIRED_AT, reply: ({ form }) => form.grant_type === "refresh_token" && form.refresh_token === FROZEN_PLAINTEXT.refreshToken
    ? { json: { token_type: "Bearer", access_token: REFRESHED.accessToken, refresh_token: REFRESHED.refreshToken, expires_in: 3600 } }
    : { status: 400, json: { error: "invalid_grant" } } });
  assert.equal(await h.service.tokenResolver.resolveAccessToken({ serverId: FROZEN_SERVERS.oauth }), REFRESHED.accessToken);
  assert.equal(h.server.requests.length, 1);
  assert.deepEqual(nonZero(h.io.repo), { findByServerId: 4, releaseOAuthRefreshLease: 1, tryClaimOAuthRefreshLease: 1, upsert: 1 });
  assert.deepEqual(nonZero(h.io.sealer), { open: 4, seal: 1 });
  const common = { workspaceId: FROZEN_WORKSPACE, enabled: true, writeAllowedToolNames: "", principalId: "principal-frozen" };
  await saveExternalMcpServer(h.store, { ...common, serverId: FROZEN_SERVERS.static, label: "Static HTTP renamed", transport: "streamable_http",
    authMode: "static_env", command: "", url: "https://mcp.static.example.com/mcp", args: "", allowedToolNames: "lookup" });
  await saveExternalMcpServer(h.store, { ...common, serverId: FROZEN_SERVERS.env, label: "Env Tool", transport: "stdio", authMode: "none",
    command: "npx", args: "-y env-tool-mcp", allowedToolNames: "search", env: `FAKE_API_KEY=${NEW_ENV_KEY}\nFAKE_REGION=${FROZEN_PLAINTEXT.envBlock.FAKE_REGION}` });

  // Reconnect: a new pool, repo, keyring, sealer and service over the same database.
  await kernel.close();
  kernel = openPostgresKernel<ContentDatabase>({ connectionString });
  const r = wire({ kernel, clockIso: AFTER_RESTART_AT });
  await assertOpensAllThree(r, { envKey: NEW_ENV_KEY, ...REFRESHED });
  assert.equal(r.server.requests.length, 0);
  const now = await pgSnapshot(kernel);

  assert.deepEqual(now.workspaces, before.workspaces);
  const vaultBefore = before.secrets_vault as Row[];
  const vaultAfter = now.secrets_vault as Row[];
  assert.equal(vaultAfter.length, vaultBefore.length);
  for (const untouched of [{ owner: FROZEN_SERVERS.static, kind: "mcp-auth" }, { owner: FROZEN_SERVERS.oauth, kind: "mcp-env" }]) {
    assert.deepEqual(vaultRow(vaultAfter, untouched), vaultRow(vaultBefore, untouched));
  }
  for (const rewritten of [{ owner: FROZEN_SERVERS.env, kind: "mcp-env" }, { owner: FROZEN_SERVERS.oauth, kind: "mcp-auth" }]) {
    assert.deepEqual(changedColumns(vaultRow(vaultBefore, rewritten), vaultRow(vaultAfter, rewritten)),
      ["created_at", "id", "label", "sealed_ciphertext", "sealed_nonce", "updated_at"]);
  }
  const expectedChanges: Record<string, string[]> = {
    [FROZEN_SERVERS.env]: ["env_secret_id", "updated_at"],
    [FROZEN_SERVERS.static]: ["label", "updated_at"],
    [FROZEN_SERVERS.oauth]: ["oauth_expires_at", "oauth_secret_id", "updated_at"],
  };
  for (const serverId of Object.values(FROZEN_SERVERS)) {
    assert.deepEqual(changedColumns(serverRow(before.external_mcp_servers as Row[], serverId), serverRow(now.external_mcp_servers as Row[], serverId)), expectedChanges[serverId]);
  }
});
