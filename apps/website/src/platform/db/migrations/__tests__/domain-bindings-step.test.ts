import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { DOMAIN_BINDINGS_ID } from "../0024_domain_bindings.js";
import { CONTENT_MIGRATIONS, runMigrations } from "../index.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";

/**
 * @file Migration 0024 (`0024_domain_bindings`) on SQLite and PGlite: registered after 0023 with its
 * pinned checksum, creates `domain_binding` once, and its key and checks hold what the binding store
 * relies on: one row per (workspace, hostname), `manual` as the default provider, closed status and
 * delegation sets, and rows that go with their workspace.
 */

const DUPLICATE = { sqlite: /UNIQUE constraint failed/, pglite: /duplicate key value violates unique constraint/ };
const CHECK = { sqlite: /CHECK constraint failed/, pglite: /violates check constraint/ };
const AT = "2026-10-21T12:00:00.000Z";

for (const adapter of eachDialect({ tables: ["domain_binding", "workspaces"], make: kernel => kernel })) {
  const name = adapter.name as "sqlite" | "pglite";
  const withKernel = async (body: (kernel: StorageKernel<unknown>) => Promise<void>) => {
    const kernel = adapter.make() as StorageKernel<unknown>;
    try {
      await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT}), ('w2', 'W2', 'w2', ${AT})`);
      await body(kernel);
    } finally {
      if (name === "sqlite") await kernel.close();
    }
  };
  const bindingRow = (kernel: StorageKernel<unknown>, workspace: string, status = "pending") =>
    kernel.execute(sql`INSERT INTO domain_binding (workspace_id, hostname, zone, requirements_json, status, started_at, created_at, updated_at)
      VALUES (${workspace}, 'www.example.com', 'example.com', '[]', ${status}, ${AT}, ${AT}, ${AT})`);

  test(`[${name}] 0024 is registered after 0023 with its pinned checksum and creates its table once`, () => withKernel(async (kernel) => {
    const ids = CONTENT_MIGRATIONS.map(entry => entry.id);
    assert.equal(ids.indexOf(DOMAIN_BINDINGS_ID), ids.indexOf("0023_mail_ledgers") + 1, "0024 follows 0023");
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === DOMAIN_BINDINGS_ID)!;
    assert.equal(step.checksum, MIGRATION_CHECKSUMS[DOMAIN_BINDINGS_ID]);
    await kernel.execute(sql.raw("DROP TABLE domain_binding"));
    const options = { ledgerTable: "domain_bindings_step_contract_migrations" };
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [DOMAIN_BINDINGS_ID]);
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [], "a second run applies nothing");
    assert.deepEqual(await kernel.query(sql`SELECT * FROM domain_binding`), []);
  }));

  test(`[${name}] 0024 keeps one binding per (workspace, hostname), defaults to manual, and starts at attempt 0`, () => withKernel(async (kernel) => {
    await bindingRow(kernel, "w");
    await bindingRow(kernel, "w2");
    await assert.rejects(bindingRow(kernel, "w"), DUPLICATE[name]);
    const rows = await kernel.query<{ provider_id: string; attempt: number | string; delegation_state: string | null }>(sql`SELECT provider_id, attempt, delegation_state FROM domain_binding WHERE workspace_id = 'w'`);
    assert.deepEqual(rows.map(row => ({ ...row, attempt: Number(row.attempt) })), [{ provider_id: "manual", attempt: 0, delegation_state: null }]);
  }));

  test(`[${name}] 0024 closes the status and delegation sets and refuses a negative attempt`, () => withKernel(async (kernel) => {
    for (const status of ["pending", "propagated", "mismatch", "timeout", "unknown"]) {
      await kernel.execute(sql`DELETE FROM domain_binding`);
      await bindingRow(kernel, "w", status);
    }
    await assert.rejects(kernel.execute(sql`UPDATE domain_binding SET status = 'failed'`), CHECK[name]);
    await kernel.execute(sql`UPDATE domain_binding SET delegation_state = 'not_delegated'`);
    await assert.rejects(kernel.execute(sql`UPDATE domain_binding SET delegation_state = 'maybe'`), CHECK[name]);
    await assert.rejects(kernel.execute(sql`UPDATE domain_binding SET attempt = -1`), CHECK[name]);
  }));

  test(`[${name}] 0024 rows go with their workspace and require one that exists`, () => withKernel(async (kernel) => {
    await bindingRow(kernel, "w");
    await bindingRow(kernel, "w2");
    await kernel.execute(sql`DELETE FROM workspaces WHERE id = 'w'`);
    assert.deepEqual(await kernel.query(sql`SELECT workspace_id FROM domain_binding`), [{ workspace_id: "w2" }]);
    await assert.rejects(bindingRow(kernel, "missing"), /FOREIGN KEY|foreign key/);
  }));
}
