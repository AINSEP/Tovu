import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { dropDatabase, freshPostgresDatabase, psql } from "#src/platform/db/__tests__/postgres-database";

import { initSite } from "#src/server/runtime/composition/site-dir";

/** `initSite`'s empty-database admission names few occupied tables exactly. Real Postgres, one temp database. */
const DATABASE = "tovu_init_site_occupied";
const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-init-site-pg-"));

after(() => {
  dropDatabase({ database: DATABASE });
  fs.rmSync(parent, { recursive: true, force: true });
});

test("a Postgres database holding one foreign table is refused by name, before any folder is made", async () => {
  const connectionString = freshPostgresDatabase(DATABASE);
  const created = psql({ database: DATABASE, sql: "CREATE TABLE someone_elses (id int); INSERT INTO someone_elses VALUES (1);" });
  assert.ok(created.ok, created.stderr);
  const dir = path.join(parent, "site");
  await assert.rejects(initSite({ dir, storage: { kind: "postgres", secretRef: "site" }, connectionString }), {
    name: "ValidationError",
    message: "initSite: the Postgres database already holds data (public.someone_elses); a new site needs an empty database. " +
      "Adopting an existing Tovu database into a new site folder is a separate step that is not available yet.",
  });
  assert.equal(fs.existsSync(dir), false);
});
