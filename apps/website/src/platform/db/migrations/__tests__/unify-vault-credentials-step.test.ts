import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { unifyVaultCredentials } from "../0013_unify_vault_credentials.js";
import { vaultFixture, vaultStep, insertFixture } from "./secrets-vault.fixture.js";

const step = unifyVaultCredentials({ checksum: "b".repeat(64) });
type Row = Record<string, unknown>;
const meta = (row: Row) => typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
for (const dialect of ["sqlite", "pglite"] as const) {
  test(`${dialect}: data-only credential conversion preserves envelopes and identities and is idempotent`, async () => {
    const { kernel } = await vaultFixture(dialect);
    try {
      await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
      const [custom] = await kernel.query<Row>(sql`SELECT * FROM secrets_vault WHERE kind='custom'`);
      for (const [id, label] of [["case", "Vercel"], ["vendor", "github"], ["host", "github-pages"],
        ["dns", "name.com"], ["fly", "fly.io"], ["spaces", " Vercel"], ["nonexact", "Vercel production"], ["ambiguous", "github / vercel"]]) {
        await insertFixture(kernel, "secrets_vault", { ...custom, id, label, meta: JSON.stringify({ category: "general", baseUrl: "https://example.test", additionalHosts: [], username: null }) } as Parameters<typeof insertFixture>[2]);
      }
      const before = await kernel.query<Row>(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`);
      await kernel.transaction(() => step.up(kernel, { note: () => {} }));
      const after = await kernel.query<Row>(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`);
      assert.equal(after.length, before.length);
      for (const old of before) {
        const row = after.find(row => row.workspace_id === old.workspace_id && row.id === old.id)!;
        const { kind: _k, meta: _m, revision: _r, ...stable } = old;
        const { kind: _nk, meta: _nm, revision: _nr, ...actualStable } = row;
        assert.deepEqual(actualStable, stable);
        if (old.kind !== "custom" && old.kind !== "vendor") { assert.deepEqual(row, old); continue; }
        assert.equal(row.kind, "vendor");
        assert.equal(row.revision, Number(old.revision) + 1);
        assert.equal(meta(row).credentialType, old.kind);
        if (old.kind === "vendor") assert.deepEqual(meta(row).worksFor, [old.provider]);
      }
      for (const [id, expected] of [["case", ["vercel"]], ["vendor", ["github"]], ["host", ["github-pages"]],
        ["dns", []], ["fly", []], ["spaces", []], ["nonexact", []], ["ambiguous", []]] as const) {
        const row = after.find(row => row.id === id)!;
        assert.deepEqual(meta(row).worksFor, expected);
        assert.equal(meta(row).legacyAad.table, "secrets_vault_custom_v1");
        assert.equal(meta(row).migration.mappedId, id);
      }
      assert.equal(meta(after.find(row => row.id === "custom")!).legacyAad.table, "custom_credential_sets", "older AAD lineage survives");
      await kernel.transaction(() => step.up(kernel, { note: () => {} }));
      assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`), after);
    } finally { await kernel.close(); }
  });
  test(`${dialect}: runner transaction can roll back conversion`, async () => {
    const { kernel } = await vaultFixture(dialect);
    try {
      await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
      const before = await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`);
      await assert.rejects(kernel.transaction(async () => { await step.up(kernel, { note: () => {} }); throw new Error("rollback"); }), /rollback/);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY workspace_id,id`), before);
    } finally { await kernel.close(); }
  });
}
