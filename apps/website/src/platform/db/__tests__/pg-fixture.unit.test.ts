import assert from "node:assert/strict";
import test from "node:test";

import { dropDatabase, psql, recreateDatabase } from "../migration/pg-fixture.js";

/**
 * @file Direct unit coverage of `pg-fixture.ts`'s own failure paths — every one of which read 0%
 * scoped (worst branch coverage in the src/platform/db baseline: 41.67%, 5/12). This file exercises real
 * `psql`/Postgres failure conditions rather than mocking `spawnSync` (no injection seam exists,
 * and this file is test infrastructure only — adding one purely to move a number would be exactly
 * the kind of production-code seam the coverage-integrity policy forbids). Requires a real local
 * `psql` binary and a reachable Postgres server, same assumption `migration-manifest-postgres.test.ts`
 * already makes for this whole file.
 *
 * `recreateDatabase`/`dropDatabase`'s happy paths (drop + create both succeed) are already proven
 * by `migration-manifest-postgres.test.ts`'s `test.before`/`test.after` fixture lifecycle — not
 * duplicated here.
 */

const FIXTURE_DB = `tovu_pg_fixture_unit_${process.pid}`;

test("psql() returns ok:true with stdout for a successful query", () => {
  const result = psql("postgres", "SELECT 1;");
  assert.equal(result.ok, true);
  assert.equal(result.stdout.trim(), "1");
});

test("psql() returns ok:false with stderr populated, never throwing, for a failing statement", () => {
  const result = psql("postgres", "SELECT * FROM this_table_does_not_exist_xyz;");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /this_table_does_not_exist_xyz/);
});

test("psql() throws when the psql binary cannot be found on PATH", () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "/nonexistent-empty-dir-for-pg-fixture-test";
  try {
    assert.throws(() => psql("postgres", "SELECT 1;"), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(
        (err as Error).message,
        /^psql could not be run \(spawnSync psql ENOENT\)\. This test suite requires a local psql binary on PATH and a Postgres server reachable at host ".*" as role ".*" — see this file's own doc\.$/
      );
      return true;
    });
  } finally {
    process.env.PATH = originalPath;
  }
});

test("dropDatabase() throws the exact wrapped message when the underlying DROP fails", () => {
  // Postgres refuses to drop the database a connection is currently open against -- a real,
  // reliably-reproducible failure with no risk to the actual "postgres" database (nothing is
  // dropped; the statement errors before any change).
  const probe = psql("postgres", "DROP DATABASE IF EXISTS postgres;");
  assert.equal(probe.ok, false, "sanity check: dropping the currently-open admin database must fail");

  assert.throws(() => dropDatabase("postgres"), {
    message: `failed to drop fixture database "postgres": ${probe.stderr}`,
  });
});

test("recreateDatabase() throws the exact wrapped DROP message and never attempts CREATE when DROP fails", () => {
  const probe = psql("postgres", "DROP DATABASE IF EXISTS postgres;");
  assert.equal(probe.ok, false, "sanity check: dropping the currently-open admin database must fail");

  assert.throws(() => recreateDatabase("postgres"), {
    message: `failed to drop fixture database "postgres": ${probe.stderr}`,
  });

  // If CREATE had been attempted despite the DROP failure, "postgres" (a real pre-existing
  // database) would now report a duplicate-database error on an independent CREATE attempt --
  // asserting the opposite (rejected by "already exists", not silently succeeded) would only
  // prove CREATE never got a chance to run. Simplest direct proof: "postgres" is still reachable
  // and unchanged.
  const stillThere = psql("postgres", "SELECT current_database();");
  assert.equal(stillThere.ok, true);
  assert.equal(stillThere.stdout.trim(), "postgres");
});

test("recreateDatabase() + dropDatabase() happy path round-trips a real throwaway database", () => {
  recreateDatabase(FIXTURE_DB);
  try {
    const created = psql(FIXTURE_DB, "SELECT 1;");
    assert.equal(created.ok, true, "the newly created database must be connectable");
  } finally {
    dropDatabase(FIXTURE_DB);
  }

  const gone = psql("postgres", `SELECT 1 FROM pg_database WHERE datname = '${FIXTURE_DB}';`);
  assert.equal(gone.ok, true);
  assert.equal(gone.stdout.trim(), "", "the fixture database must no longer exist after dropDatabase()");
});
