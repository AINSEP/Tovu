/**
 * @file Live-Postgres proofs behind `src/db/migration/manifest.ts`'s semantic classifications.
 *
 * Why these run against a REAL server rather than asserting behavior in the abstract: the whole
 * point of this manifest is to name facts about Postgres's actual runtime behavior that a schema
 * diff cannot see (see manifest.ts's own module doc). A test that asserts "int8 accepts values int4
 * rejects" without ever executing an INSERT against a real int4/int8 column would be trusting the
 * same assumption the manifest exists to stop trusting. Every test below executes real DDL/DML
 * against a throwaway Postgres database via `psql` (see `../migration/pg-fixture.ts` for why a shell-
 * out rather than a driver) and checks the server's actual response — an exit code, a returned row, a
 * value computed by the server itself — never a value this test file computed independently and
 * merely hopes agrees.
 *
 * These fixture tables are hand-built, NOT `schema.postgres.ts` — that generated file is being
 * concurrently edited by another agent this round (widening SQLiteInteger's Postgres mapping); this
 * file proves the underlying Postgres SEMANTICS the manifest's classifications rest on, decoupled
 * from whatever that file currently contains. Wiring the manifest's `REVIEWED_INTEGER_ID_COLUMNS`
 * into the generator's column-builder choice is the explicit next step, not done here.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { reseedSequenceSql } from "../migration/manifest";
import { dropDatabase, psql, recreateDatabase } from "../migration/pg-fixture";
import { verifyJsonText, verifyUtcTimestampText } from "../migration/verify";

const FIXTURE_DB = "tovu_migration_fixture";

test.before(() => {
  recreateDatabase(FIXTURE_DB);
});

test.after(() => {
  dropDatabase(FIXTURE_DB);
});

// --- 1. 64-bit IDs: int4 genuinely rejects 2,147,483,648; int8 genuinely accepts it -------------

test("int4 rejects 2147483648 on a live server; int8 accepts the identical value", () => {
  const OVER_INT32_MAX = "2147483648"; // 2^31, one past int4's max (2^31 - 1)

  const int4 = psql(FIXTURE_DB, `CREATE TABLE fx_int4_capacity (v int4); INSERT INTO fx_int4_capacity VALUES (${OVER_INT32_MAX});`);
  assert.equal(int4.ok, false, "expected the INSERT into an int4 column to fail");
  assert.match(int4.stderr, /out of range/i);

  const int8 = psql(FIXTURE_DB, `CREATE TABLE fx_int8_capacity (v int8); INSERT INTO fx_int8_capacity VALUES (${OVER_INT32_MAX});`);
  assert.equal(int8.ok, true, `expected the INSERT into an int8 column to succeed: ${int8.stderr}`);

  const readBack = psql(FIXTURE_DB, `SELECT v FROM fx_int8_capacity;`);
  assert.equal(readBack.stdout.trim(), OVER_INT32_MAX, "the exact value must round-trip, not just insert without erroring");
});

// --- 4. Identity/sequence reseeding: manifest's reseedSequenceSql actually prevents a collision --

test("reseedSequenceSql, executed after a copy that preserved original ids, makes the next plain insert land at max+1 with no collision", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_posts (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text);`);
  assert.equal(create.ok, true, create.stderr);

  // Simulates a bulk copy from SQLite that preserved the source's original (non-contiguous) ids —
  // exactly what a real migration copier does, and exactly the case that leaves the identity
  // sequence at its untouched starting position (next value 1) unless reseeded.
  const bulkCopy = psql(FIXTURE_DB, `INSERT INTO fx_posts (id, title) OVERRIDING SYSTEM VALUE VALUES (1, 'a'), (2, 'b'), (5, 'e');`);
  assert.equal(bulkCopy.ok, true, bulkCopy.stderr);

  const reseed = psql(FIXTURE_DB, reseedSequenceSql("fx_posts", "id"));
  assert.equal(reseed.ok, true, reseed.stderr);

  const insert = psql(FIXTURE_DB, `INSERT INTO fx_posts (title) VALUES ('next') RETURNING id;`);
  assert.equal(insert.ok, true, `plain insert after reseed must not collide with a copied id: ${insert.stderr}`);
  assert.equal(insert.stdout.trim(), "6", "expected the next identity value to be max(id)+1 = 6, not a collision or an arbitrary restart");
});

test("reseedSequenceSql handles the empty-table edge case: reseeding an empty table still starts identity at 1", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_empty (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text);`);
  assert.equal(create.ok, true, create.stderr);

  const reseed = psql(FIXTURE_DB, reseedSequenceSql("fx_empty", "id"));
  assert.equal(reseed.ok, true, reseed.stderr);

  const insert = psql(FIXTURE_DB, `INSERT INTO fx_empty (title) VALUES ('first') RETURNING id;`);
  assert.equal(insert.ok, true, insert.stderr);
  assert.equal(insert.stdout.trim(), "1", "an empty table reseeded via the 3-arg setval(...,is_called=false) form must start at 1, not 2");
});

// --- 2. UTC timestamps: the concrete mechanism behind the reversibility deadline ------------------

test("a naive-local timestamp string casts to a DIFFERENT instant depending on the reading session's timezone; a UTC-offset string does not", () => {
  const CANONICAL = "2026-08-12T10:00:00-04:00"; // this manifest's utc-timestamp-text contract: explicit offset
  const NAIVE_LOCAL = "2026-08-12T10:00:00"; // no offset — exactly what a WordPress import produces

  const underEst = psql(
    FIXTURE_DB,
    `SET timezone = 'America/New_York'; SELECT extract(epoch from '${CANONICAL}'::timestamptz)::bigint, extract(epoch from '${NAIVE_LOCAL}'::timestamptz)::bigint;`
  );
  assert.equal(underEst.ok, true, underEst.stderr);
  const [canonicalUnderEst, naiveUnderEst] = underEst.stdout.trim().split("|");

  const underJst = psql(
    FIXTURE_DB,
    `SET timezone = 'Asia/Tokyo'; SELECT extract(epoch from '${CANONICAL}'::timestamptz)::bigint, extract(epoch from '${NAIVE_LOCAL}'::timestamptz)::bigint;`
  );
  assert.equal(underJst.ok, true, underJst.stderr);
  const [canonicalUnderJst, naiveUnderJst] = underJst.stdout.trim().split("|");

  assert.equal(canonicalUnderEst, canonicalUnderJst, "a UTC-offset timestamp must resolve to the same instant regardless of session timezone");
  assert.notEqual(
    naiveUnderEst,
    naiveUnderJst,
    "a naive-local timestamp string resolving to the SAME instant under two different session timezones would mean the ambiguity this manifest warns about does not actually exist — it does"
  );

  // Ties the live proof back to the pure classifier: the naive string this proof used is exactly
  // what verifyUtcTimestampText rejects, and the canonical string is exactly what it accepts.
  assert.equal(verifyUtcTimestampText(NAIVE_LOCAL)?.code, "NAIVE_LOCAL_TIMESTAMP");
  assert.equal(verifyUtcTimestampText(CANONICAL), null);
});

// --- 3. JSON vs text: a plain text column enforces nothing, on Postgres exactly as on SQLite -----

test("a plain Postgres text column silently accepts malformed JSON — proving the manifest's verifyJsonText check is necessary, not redundant with either dialect's type system", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_json_gap (id integer PRIMARY KEY, payload text);`);
  assert.equal(create.ok, true, create.stderr);

  const MALFORMED = "{not valid json";
  const insert = psql(FIXTURE_DB, `INSERT INTO fx_json_gap VALUES (1, '${MALFORMED}');`);
  assert.equal(insert.ok, true, "Postgres's plain text column must accept this — it carries no JSON validity constraint, same as SQLite's TEXT");

  const readBack = psql(FIXTURE_DB, `SELECT payload FROM fx_json_gap WHERE id = 1;`);
  assert.equal(readBack.stdout.trim(), MALFORMED, "the malformed payload round-trips byte-for-byte, exactly the silent-corruption shape this manifest's classifier exists to catch downstream");

  // The layer that actually catches it is verify.ts, not the schema:
  assert.equal(verifyJsonText(readBack.stdout.trim())?.code, "INVALID_JSON");
});
