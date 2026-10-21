/** @file ADR-066: 0021 upgrades retain MCP credentials/approvals and match Postgres cascades. */
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { sqliteKernel } from "../../kernel/drivers/sqlite.js";
import type { StorageKernel } from "../../kernel/port.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { WORKSPACE_MCP_CASCADE_ID, WORKSPACE_MCP_CASCADE_SQLITE } from "../0022_workspace_mcp_cascade.js";
import { CONTENT_MIGRATIONS } from "../index.js";
import { runMigrations } from "../runner.js";
import { insertFixture, seedParityRows, stamp, vaultFixture } from "./secrets-vault.fixture.js";

type Row = Record<string, unknown>;

/** Observe every column, including opaque envelopes, pointers, and approval fingerprints. */
async function snapshot({ kernel }: { kernel: StorageKernel<unknown> }, _options = {}) {
  return {
    vault: await kernel.query<Row>(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`),
    servers: await kernel.query<Row>(sql`SELECT * FROM external_mcp_servers ORDER BY workspace_id,server_id`),
    approvals: await kernel.query<Row>(sql`SELECT * FROM external_mcp_tool_approvals ORDER BY workspace_id,server_id,tool_name`),
  };
}

for (const dialect of ["sqlite", "pglite"] as const) {
  test(`${dialect}: 0022 preserves 0021 rows, retains vault restrictions, and permits an isolated workspace cascade`, async () => {
    const fixture = await vaultFixture(dialect);
    const { kernel } = fixture;
    try {
      await seedParityRows(fixture, dialect);
      await runMigrations(kernel, CONTENT_MIGRATIONS.filter(step => step.id < WORKSPACE_MCP_CASCADE_ID));
      const before = await snapshot({ kernel });
      const server = before.servers.find(row => row.workspace_id === "ws" && row.server_id === "server")!;
      assert.equal(typeof server.env_secret_id, "string");
      assert.equal(typeof server.oauth_secret_id, "string");
      assert.ok(before.approvals.some(row => row.workspace_id === "ws"));
      assert.ok(before.servers.some(row => row.workspace_id === "ws2"));
      if (dialect === "sqlite") {
        await assert.rejects(kernel.execute(sql`DELETE FROM workspaces WHERE id = 'ws'`), /FOREIGN KEY constraint failed/);
        assert.deepEqual(await snapshot({ kernel }), before, "the failed 0021 delete is atomic");
      }

      assert.deepEqual((await runMigrations(kernel, CONTENT_MIGRATIONS.filter(step => step.id <= WORKSPACE_MCP_CASCADE_ID))).applied, [WORKSPACE_MCP_CASCADE_ID]);
      assert.deepEqual(await snapshot({ kernel }), before, "0022 must preserve every stored column");
      for (const pointer of [server.env_secret_id, server.oauth_secret_id]) {
        await assert.rejects(kernel.execute(sql`DELETE FROM secrets_vault WHERE workspace_id = 'ws' AND id = ${String(pointer)}`),
          /FOREIGN KEY|foreign key/);
      }
      await assert.rejects(kernel.execute(sql`UPDATE secrets_vault SET owner_key = 'wrong-server'
        WHERE workspace_id = 'ws' AND id = ${String(server.env_secret_id)}`), /linked vault MCP identity/);
      await assert.rejects(kernel.execute(sql`UPDATE external_mcp_servers SET env_secret_id = 'missing'
        WHERE workspace_id = 'ws' AND server_id = 'server'`), /invalid vault MCP pointer/);

      await kernel.execute(sql`DELETE FROM workspaces WHERE id = 'ws'`);
      assert.deepEqual(await kernel.query(sql`SELECT id FROM workspaces WHERE id = 'ws'`), []);
      const after = await snapshot({ kernel });
      for (const key of ["vault", "servers", "approvals"] as const) {
        assert.deepEqual(after[key], before[key].filter(row => row.workspace_id !== "ws"), key);
      }
      assert.deepEqual((await runMigrations(kernel, CONTENT_MIGRATIONS.filter(step => step.id <= WORKSPACE_MCP_CASCADE_ID))).applied, [], "rerun is a no-op");
    } finally {
      await kernel.close();
    }
  });
}

test("sqlite: fresh databases install the same ordering trigger and can delete linked MCP secrets", async () => {
  const db = openContentDb(":memory:");
  const kernel = sqliteKernel<unknown>(db);
  try {
    assert.deepEqual(await kernel.query(sql`SELECT sql FROM sqlite_schema WHERE name = 'workspaces_mcp_delete_first'`),
      [{ sql: WORKSPACE_MCP_CASCADE_SQLITE }]);
    await insertFixture(kernel, "workspaces", { id: "ws", name: "Workspace", slug: "ws", created_at: stamp });
    await insertFixture(kernel, "secrets_vault", { workspace_id: "ws", id: "secret", kind: "mcp-env", owner_key: "server",
      label: "Environment", is_default: 0, revision: 1, meta: "{}", created_at: stamp, updated_at: stamp });
    await insertFixture(kernel, "external_mcp_servers", { workspace_id: "ws", server_id: "server", transport: "stdio",
      enabled: 1, env_secret_id: "secret", created_at: stamp, updated_at: stamp });
    await kernel.execute(sql`DELETE FROM workspaces WHERE id = 'ws'`);
    assert.deepEqual(await snapshot({ kernel }), { vault: [], servers: [], approvals: [] });
    assert.deepEqual((await runMigrations(kernel, CONTENT_MIGRATIONS)).applied, [], "fresh ledger is at head");
  } finally {
    db.$client.close();
  }
});
