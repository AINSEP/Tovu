import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { findSiteKeyDependentData } from "../../site-key-dependent-data.js";
import { dropDatabase, psql } from "#src/platform/db/migration/pg-fixture";
import { freshPostgresDatabase } from "#src/platform/db/__tests__/postgres-database";

/**
 * @file `findSiteKeyDependentData` on a Postgres site whose connection string comes from an
 * environment variable (ADR-067): the database itself is scanned. Needs the local server
 * (`pg_ctl -D /usr/local/var/postgresql@14 start`); fails, never skips, when it is down.
 */

const DATABASE = "tovu_site_key_dependent_data_test";
const ENV_NAME = "TOVU_TEST_SITE_PG_URL";

after(() => dropDatabase(DATABASE));

function postgresSite(t: import("node:test").TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "tovu-site-key-data-pg-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, ".site-meta.json"), JSON.stringify({ storage: { kind: "postgres", secretRef: { env: ENV_NAME } } }));
  return dir;
}

test("findSiteKeyDependentData: Postgres (env) site — a clean database is no data; a sealed row is data", async (t) => {
  const url = freshPostgresDatabase(DATABASE);
  const dir = postgresSite(t);
  const env = { [ENV_NAME]: url };

  const created = psql(DATABASE, "CREATE TABLE publish_credential_sets (id serial PRIMARY KEY, sealed_ciphertext text);");
  assert.ok(created.ok, created.stderr);
  assert.equal(await findSiteKeyDependentData(dir, { env }), false);

  const inserted = psql(DATABASE, "INSERT INTO publish_credential_sets (sealed_ciphertext) VALUES ('cipher-bytes');");
  assert.ok(inserted.ok, inserted.stderr);
  assert.equal(await findSiteKeyDependentData(dir, { env }), true);
});

test("findSiteKeyDependentData: Postgres (env) site whose database cannot be reached fails closed", async (t) => {
  const dir = postgresSite(t);
  const env = { [ENV_NAME]: "postgresql://nobody@/tovu_no_such_database_for_key_scan?host=/tmp" };
  assert.equal(await findSiteKeyDependentData(dir, { env }), true);
});
