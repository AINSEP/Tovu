/**
 * @file Security pins for 0020: widening the vault kind CHECK must keep every sealed row byte for
 * byte, keep the external-MCP pointers and their RESTRICT protection, and still refuse unknown kinds.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { vaultApiConnectionKind } from "../0020_vault_api_connection_kind.js";
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
    } finally {
      await kernel.close();
    }
  });
}
