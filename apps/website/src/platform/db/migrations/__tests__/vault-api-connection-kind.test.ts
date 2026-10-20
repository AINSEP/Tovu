/**
 * @file Security pins for 0020: widening the vault kind CHECK must keep every sealed row byte for
 * byte, keep the external-MCP pointers and their RESTRICT protection, and still refuse unknown kinds.
 * Phase C: it refuses to run without the 0012 table and refuses DDL that is not the 0012 shape.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { openMemorySqliteKernel } from "../../kernel/drivers/sqlite.js";
import { vaultApiConnectionKind, widenedVaultTableDdl } from "../0020_vault_api_connection_kind.js";
import { insertFixture, stamp, vaultFixture, vaultStep } from "./secrets-vault.fixture.js";

const step = vaultApiConnectionKind({ checksum: "c".repeat(64) });
type Row = Record<string, unknown>;
const vaultRow = (id: string, kind: string) => ({ workspace_id: "ws", id, kind, owner_key: "tovu", principal_id: null, binding: null,
  provider: null, label: id, is_default: false, revision: 1, meta: "{}", created_at: stamp, updated_at: stamp });

for (const dialect of ["sqlite", "pglite"] as const) {
  test(`${dialect}: 0020 admits api-connection rows and preserves every vault row, MCP pointer and restriction`, async () => {
    const { kernel } = await vaultFixture(dialect);
    try {
      await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
      const before = await kernel.query<Row>(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`);
      const pointersBefore = await kernel.query<Row>(sql`SELECT server_id, env_secret_id, oauth_secret_id FROM external_mcp_servers ORDER BY server_id`);
      assert.ok(pointersBefore.some((row) => row.oauth_secret_id !== null), "fixture must hold a live MCP vault pointer");

      await kernel.transaction(() => step.up(kernel, { note: () => {} }));

      assert.deepEqual(await kernel.query<Row>(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`), before);
      assert.deepEqual(await kernel.query<Row>(sql`SELECT server_id, env_secret_id, oauth_secret_id FROM external_mcp_servers ORDER BY server_id`), pointersBefore);
      const row = vaultRow("api-connection:v1:ws:p:c", "api-connection");
      await insertFixture(kernel, "secrets_vault", { ...row, is_default: dialect === "sqlite" ? 0 : false } as Parameters<typeof insertFixture>[2]);
      await assert.rejects(insertFixture(kernel, "secrets_vault", { ...vaultRow("x", "not-a-kind"), is_default: dialect === "sqlite" ? 0 : false } as Parameters<typeof insertFixture>[2]),
        /secrets_vault_kind|CHECK constraint failed/);
      const pointed = pointersBefore.find((entry) => entry.oauth_secret_id !== null)!;
      await assert.rejects(kernel.execute(sql`DELETE FROM secrets_vault WHERE workspace_id = 'ws' AND id = ${String(pointed.oauth_secret_id)}`),
        /FOREIGN KEY|foreign key/);
      // The SQLite rebuild drops the table's own triggers; a linked MCP secret must still keep its identity.
      await assert.rejects(kernel.execute(sql`UPDATE secrets_vault SET owner_key = 'someone-else' WHERE workspace_id = 'ws' AND id = ${String(pointed.oauth_secret_id)}`),
        /linked vault MCP identity/);
    } finally {
      await kernel.close();
    }
  });
}

test("sqlite: 0020 refuses to run when secrets_vault is missing (0012 must run first), changing nothing", async () => {
  const kernel = openMemorySqliteKernel<unknown>();
  try {
    await assert.rejects(kernel.transaction(() => step.up(kernel, { note: () => {} })), { message: "secrets_vault is missing; 0012_secrets_vault must run first" });
    assert.deepEqual(await kernel.query<Row>(sql`SELECT name FROM sqlite_master WHERE name LIKE 'secrets_vault%' OR name = '_vault_0020_pointers'`), []);
  } finally {
    await kernel.close();
  }
});

test("0020 refuses vault DDL that is not the 0012 shape instead of guessing at an edit", () => {
  const kinds = "'source-control','mcp-env','mcp-auth')";
  const refused = { message: "secrets_vault does not have the 0012 shape; revise this migration before applying it" };
  assert.throws(() => widenedVaultTableDdl({ original: "CREATE TABLE secrets_vault (kind TEXT CHECK(kind IN ('custom')))" }), refused, "no 0012 kind list");
  assert.throws(() => widenedVaultTableDdl({ original: `CREATE TABLE secrets_vault (a CHECK(a IN (${kinds}, b CHECK(b IN (${kinds}))` }), refused, "the kind list twice");
  assert.throws(() => widenedVaultTableDdl({ original: `CREATE TABLE "secrets_vault" (kind CHECK(kind IN (${kinds}))` }), refused, "another table header");
  assert.equal(widenedVaultTableDdl({ original: `CREATE TABLE secrets_vault (kind CHECK(kind IN (${kinds}))` }),
    "CREATE TABLE secrets_vault_0020 (kind CHECK(kind IN ('source-control','mcp-env','mcp-auth','api-connection')))");
});
