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

import { IDENTITY_COLUMN_INSERT_OVERRIDE, reseedSequenceSql } from "../migration/manifest";
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

// --- BLOCKER #2: reseedSequenceSql must not reject legitimate non-positive source ids --------------
//
// SQLite's INTEGER PRIMARY KEY AUTOINCREMENT accepts 0 and negative values; Postgres's default
// identity sequence has a minimum of 1. The OLD reseedSequenceSql emitted
// `setval(seq, COALESCE(max(id),1), max(id) IS NOT NULL)`, which — for a table whose max(id) is 0 or
// negative — passed that non-positive value straight through as BOTH the target and the "is_called"
// flag, and Postgres's setval() rejects any target below the sequence's minimum outright: "value 0 is
// out of bounds for sequence ... (1..9223372036854775807)". Critically, this happened AFTER the bulk
// copy's rows had already landed, so the failure mode was "rows copy, then migration aborts."

test("reseedSequenceSql: a table containing ONLY non-positive copied ids (0 and -1) reseeds to 1, not a collision and not a jump to 2", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_nonpositive (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text);`);
  assert.equal(create.ok, true, create.stderr);

  const bulkCopy = psql(FIXTURE_DB, `INSERT INTO fx_nonpositive (id, title) OVERRIDING SYSTEM VALUE VALUES (-1, 'a'), (0, 'b');`);
  assert.equal(bulkCopy.ok, true, `the OLD reseedSequenceSql would still let this bulk copy through — the bug is in the reseed step, not the copy: ${bulkCopy.stderr}`);

  const reseed = psql(FIXTURE_DB, reseedSequenceSql("fx_nonpositive", "id"));
  assert.equal(reseed.ok, true, `reseed must succeed — the OLD formula failed here with "value 0 is out of bounds": ${reseed.stderr}`);

  const insert = psql(FIXTURE_DB, `INSERT INTO fx_nonpositive (title) VALUES ('next') RETURNING id;`);
  assert.equal(insert.ok, true, insert.stderr);
  assert.equal(insert.stdout.trim(), "1", "next id must be 1 — not a collision with 0/-1, and NOT 2 (a too-broad fix would over-advance past 1 even though nothing occupies it)");

  // Copied rows must keep their original non-positive ids untouched — only the sequence's future
  // allocation position may change, never a stored value.
  const rows = psql(FIXTURE_DB, `SELECT id, title FROM fx_nonpositive ORDER BY id;`);
  assert.equal(rows.stdout.trim(), "-1|a\n0|b\n1|next", "the copied -1/0 rows must survive unmodified, with the new row landing at 1");
});

test("reseedSequenceSql: a mixed-sign table (some non-positive, some positive ids) still reseeds to max+1 — the non-positive-id fix does not regress the ordinary case", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_mixed_sign (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title text);`);
  assert.equal(create.ok, true, create.stderr);

  const bulkCopy = psql(FIXTURE_DB, `INSERT INTO fx_mixed_sign (id, title) OVERRIDING SYSTEM VALUE VALUES (-1, 'a'), (0, 'b'), (3, 'c');`);
  assert.equal(bulkCopy.ok, true, bulkCopy.stderr);

  const reseed = psql(FIXTURE_DB, reseedSequenceSql("fx_mixed_sign", "id"));
  assert.equal(reseed.ok, true, reseed.stderr);

  const insert = psql(FIXTURE_DB, `INSERT INTO fx_mixed_sign (title) VALUES ('next') RETURNING id;`);
  assert.equal(insert.ok, true, insert.stderr);
  assert.equal(insert.stdout.trim(), "4", "expected max(id)+1 = 4, the same ordinary-case behavior as the all-positive test above");
});

// --- HIGH #5: OVERRIDING SYSTEM VALUE is required for INSERT, forbidden/unnecessary for COPY -------

test("a plain INSERT naming an explicit identity-column value fails WITHOUT OVERRIDING SYSTEM VALUE, and succeeds WITH it", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_identity_insert (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, v text);`);
  assert.equal(create.ok, true, create.stderr);

  const withoutOverride = psql(FIXTURE_DB, `INSERT INTO fx_identity_insert (id, v) VALUES (5, 'x');`);
  assert.equal(withoutOverride.ok, false, "expected the bare INSERT to be rejected");
  assert.match(withoutOverride.stderr, /identity column/i);

  const withOverride = psql(FIXTURE_DB, `INSERT INTO fx_identity_insert (id, v) ${IDENTITY_COLUMN_INSERT_OVERRIDE} VALUES (5, 'x');`);
  assert.equal(withOverride.ok, true, `expected the INSERT to succeed once IDENTITY_COLUMN_INSERT_OVERRIDE is applied: ${withOverride.stderr}`);
});

test("COPY accepts an explicit identity-column value with NO override syntax at all — the override clause this manifest exports must never be prepended to a COPY statement", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_identity_copy (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, v text);`);
  assert.equal(create.ok, true, create.stderr);

  // `pg-fixture.ts`'s psql() runs one `-c` string per call with no client-side stdin channel (by
  // design — see that file's own doc, which this task does not touch), so a real `COPY ... FROM
  // STDIN` (client-streamed data) cannot be driven through it. `COPY ... FROM PROGRAM` exercises the
  // identical server-side "no override needed" code path — the same COPY statement grammar, the same
  // identity-column acceptance — entirely within one SQL string, by having the server itself run a
  // trivial program that emits the row.
  const copy = psql(FIXTURE_DB, `COPY fx_identity_copy (id, v) FROM PROGRAM 'printf "6\\ty\\n"';`);
  assert.equal(copy.ok, true, `COPY must accept an explicit identity value with no override clause at all: ${copy.stderr}`);

  const rows = psql(FIXTURE_DB, `SELECT id, v FROM fx_identity_copy;`);
  assert.equal(rows.stdout.trim(), "6|y");
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

// --- MEDIUM #9: Z and offset forms both verify as valid, but do not sort consistently against each
// other under plain string collation — a SEPARATE hazard from the naive-local ambiguity above -------

test("string-collation ORDER BY on a text timestamp column disagrees with chronological ORDER BY when Z and offset forms mix — the concrete mechanism TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z documents", () => {
  const create = psql(FIXTURE_DB, `CREATE TABLE fx_ts_collation (id integer PRIMARY KEY, at text);`);
  assert.equal(create.ok, true, create.stderr);

  const EARLIER_Z = "2026-08-12T12:00:00Z"; // 12:00 UTC — chronologically EARLIER
  const LATER_OFFSET = "2026-08-12T10:00:00-05:00"; // 15:00 UTC — chronologically LATER, but string-sorts first

  const insert = psql(FIXTURE_DB, `INSERT INTO fx_ts_collation (id, at) VALUES (1, '${EARLIER_Z}'), (2, '${LATER_OFFSET}');`);
  assert.equal(insert.ok, true, insert.stderr);

  const byCollation = psql(FIXTURE_DB, `SELECT id FROM fx_ts_collation ORDER BY at;`);
  assert.equal(byCollation.ok, true, byCollation.stderr);
  const collationOrder = byCollation.stdout.trim().split("\n");

  const byInstant = psql(FIXTURE_DB, `SELECT id FROM fx_ts_collation ORDER BY at::timestamptz;`);
  assert.equal(byInstant.ok, true, byInstant.stderr);
  const instantOrder = byInstant.stdout.trim().split("\n");

  assert.deepEqual(instantOrder, ["1", "2"], "chronologically, the Z row (12:00 UTC) precedes the offset row (15:00 UTC)");
  assert.notDeepEqual(
    collationOrder,
    instantOrder,
    "plain string-collation ORDER BY on the raw text column must disagree with chronological order here — that " +
      "disagreement IS the hazard TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z documents, not a test bug"
  );

  // Both forms remain individually valid per verifyUtcTimestampText — the hazard is about mixing
  // them under a string sort, not about either form being rejected on its own.
  assert.equal(verifyUtcTimestampText(EARLIER_Z), null);
  assert.equal(verifyUtcTimestampText(LATER_OFFSET), null);
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
