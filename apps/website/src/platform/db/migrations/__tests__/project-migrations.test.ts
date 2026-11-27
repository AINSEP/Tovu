import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";

import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { projectVault } from "../project/0000_project_vault.js";
import { projectCredentialKinds } from "../project/0001_project_credential_kinds.js";

test("SQLite-only project vault steps leave an existing Postgres site vault untouched", async t => {
  const kernel = openPgliteKernel<unknown>();
  t.after(() => kernel.close());
  await kernel.execute(sql`CREATE TABLE secrets_vault (id TEXT PRIMARY KEY, kind TEXT NOT NULL, revision BIGINT NOT NULL)`);
  await kernel.execute(sql`INSERT INTO secrets_vault VALUES ('site-assistant-key', 'site-assistant', 4)`);
  const migrationContext = { note() {} };
  const readVault = () => kernel.query(sql`SELECT id, kind, CAST(revision AS text) AS revision FROM secrets_vault`);
  const readTables = () => kernel.query(sql`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'secrets_vault%' ORDER BY table_name`);
  const siteRow = [{ id: "site-assistant-key", kind: "site-assistant", revision: "4" }];

  await projectVault("a".repeat(64)).up(kernel, migrationContext);
  assert.deepEqual(await readVault(), siteRow);
  assert.deepEqual(await readTables(), [{ table_name: "secrets_vault" }]);
  await projectCredentialKinds("b".repeat(64)).up(kernel, migrationContext);
  assert.deepEqual(await readVault(), siteRow);
  assert.deepEqual(await readTables(), [{ table_name: "secrets_vault" }]);
});
