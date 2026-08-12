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
import { spawn } from "node:child_process";
import test from "node:test";

import { IDENTITY_COLUMN_INSERT_OVERRIDE, reseedSequenceSql } from "../migration/manifest";
import { dropDatabase, psql, recreateDatabase } from "../migration/pg-fixture";
import { verifyJsonText, verifyUtcTimestampText } from "../migration/verify";

/** Same admin-connection target `pg-fixture.ts` uses internally for `DROP`/`CREATE DATABASE` — not
 * exported from there (deliberately hardcoded, per that file's own doc, so no env var can redirect
 * it), so this file names it again for the one extra admin-connection query the stale-database sweep
 * below needs (listing `pg_database`). Duplicating the literal is cheaper than widening pg-fixture.ts's
 * exports for a single read-only query used by exactly one test file. */
const ADMIN_DATABASE_NAME = "postgres";

/**
 * Was a single hardcoded name (`"tovu_migration_fixture"`) shared by every run. Two concurrent runs
 * — expected in this repo, where several agents run scoped test suites in parallel against the same
 * host — raced each other's `test.before`/`test.after` DROP/CREATE against the SAME database,
 * reproduced live: 10/10 pass, then a run failing 5/10 with `database "tovu_migration_fixture" does
 * not exist` (one run's `test.after` dropped it out from under the other's still-running tests), then
 * 10/10 again. Structurally impossible in CI (each job gets its own throwaway Postgres service
 * container) but real on a shared local dev host — exactly this repo's normal operating mode.
 * Suffixing with `process.pid` gives every run its own database, so no two runs can ever collide.
 */
const FIXTURE_DB_PREFIX = "tovu_migration_fixture";
const FIXTURE_DB = `${FIXTURE_DB_PREFIX}_${process.pid}`;

/** True if `pid` names a still-running process on this host — `kill(pid, 0)` sends no signal, it only
 * probes for permission/existence. `ESRCH` ("no such process") means dead; any other outcome
 * (success, or `EPERM` for a live process owned by another user) means alive. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Polls `isProcessAlive` until it reports `pid` as dead, or throws after `timeoutMs`. Test-only
 * helper: the sweep tests below need a real process to genuinely finish dying (SIGKILL is not
 * synchronous) before asserting the sweep now treats its fixture database as reclaimable. */
async function waitUntilProcessDead(pid: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid)) {
    if (Date.now() > deadline) throw new Error(`process ${pid} did not die within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Reclaims fixture databases this same suite abandoned in a PAST run — never one a concurrently
 * RUNNING sibling still owns.
 *
 * Making `FIXTURE_DB` unique per run (above) fixes the collision, but trades it for a slow leak: a
 * run that crashes before `test.after` gets to execute (killed mid-test, an uncaught exception that
 * takes the process down, `kill -9` on a hung run — see this repo's own "Playwright zombie webServer"
 * lesson that `kill -9` leaves things bound behind it) leaves its uniquely-named database behind
 * forever, since nothing else is named to find and drop it. This sweep runs at the START of every
 * suite, before this run's own database is created, and reclaims exactly the databases whose owning
 * pid is no longer alive — i.e., provably abandoned by a crashed past run, not merely old. A database
 * whose pid IS alive is, by definition, a concurrent sibling run in progress; skipping it (rather than
 * e.g. an age-based sweep) is what keeps this safe to run at the top of every single invocation,
 * including ones running alongside several others right now.
 */
function sweepStaleFixtureDatabases(): void {
  const list = psql(ADMIN_DATABASE_NAME, `SELECT datname FROM pg_database;`);
  if (!list.ok) throw new Error(`failed to list databases for the stale fixture-database sweep: ${list.stderr}`);
  const allDatabaseNames = list.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const name of allDatabaseNames) {
    if (!name.startsWith(`${FIXTURE_DB_PREFIX}_`) || name === FIXTURE_DB) continue;
    const pid = Number(name.slice(FIXTURE_DB_PREFIX.length + 1));
    if (!Number.isInteger(pid) || pid <= 0) continue; // not one of ours (or predates this fix's pid-suffixed naming) — leave it alone
    if (isProcessAlive(pid)) continue; // a live concurrent sibling run's database — must not be touched
    dropDatabase(name);
  }
}

/** Reads the server's own catalog to answer "does this database exist right now" — never inferred
 * from a `psql` exit code alone, so the sweep tests below are checking Postgres's actual state. */
function databaseExists(name: string): boolean {
  const result = psql(ADMIN_DATABASE_NAME, `SELECT 1 FROM pg_database WHERE datname = '${name}';`);
  assert.equal(result.ok, true, result.stderr);
  return result.stdout.trim() === "1";
}

test.before(() => {
  sweepStaleFixtureDatabases();
  recreateDatabase(FIXTURE_DB);
});

test.after(() => {
  dropDatabase(FIXTURE_DB);
});

// --- fixture database name race (BLOCKER — reproduced live, see FIXTURE_DB's own doc) -------------

test("FIXTURE_DB is namespaced by this run's own process.pid — two different pids can never compute the same fixture database name, which is the entire fix for the collision", () => {
  assert.equal(FIXTURE_DB, `${FIXTURE_DB_PREFIX}_${process.pid}`);
  assert.notEqual(FIXTURE_DB, FIXTURE_DB_PREFIX, "must not collapse back to the old bare, unsuffixed, shared name");
});

test("sweepStaleFixtureDatabases: reclaims a fixture database whose owning pid has died, and leaves one whose pid is still alive completely untouched", async () => {
  // "Dead" case: an implausibly large pid — no process on this host will ever have it, so
  // isProcessAlive reports ESRCH ("no such process") and the sweep must treat the database as
  // abandoned by a crashed past run. Offset by this run's OWN pid (not a bare literal like
  // 999999999) so two concurrent copies of this very test — exactly what Fix 2 as a whole must
  // survive — don't collide on the SAME synthetic "dead" database name themselves (caught live: an
  // earlier version using a bare literal here failed under concurrent self-run with "duplicate key
  // value violates unique constraint" on this line, the identical race class this fix targets, just
  // reintroduced by the test fixture instead of by FIXTURE_DB).
  const deadPidName = `${FIXTURE_DB_PREFIX}_${900000000 + process.pid}`;

  // "Alive" case: a REAL, separate, currently-running process, standing in for a genuinely
  // concurrent sibling test run — the sweep must never drop a database while its owning pid is
  // still alive, since that is indistinguishable from "a sibling run is using it right now."
  const child = spawn("sleep", ["5"]);
  const childPid = await new Promise<number>((resolve, reject) => {
    child.once("spawn", () => (child.pid === undefined ? reject(new Error("sleep helper spawned with no pid")) : resolve(child.pid)));
    child.once("error", reject);
  });
  const alivePidName = `${FIXTURE_DB_PREFIX}_${childPid}`;

  recreateDatabase(deadPidName);
  recreateDatabase(alivePidName);
  try {
    assert.ok(databaseExists(deadPidName), "setup: the dead-pid fixture database must exist before sweeping");
    assert.ok(databaseExists(alivePidName), "setup: the alive-pid fixture database must exist before sweeping");

    sweepStaleFixtureDatabases();

    assert.equal(databaseExists(deadPidName), false, "a database owned by a dead pid must be reclaimed by the sweep — this is the leak fix");
    assert.equal(
      databaseExists(alivePidName),
      true,
      "a database owned by a still-alive pid must be left completely alone — it may be a concurrent sibling run in progress"
    );
  } finally {
    child.kill("SIGKILL");
    await waitUntilProcessDead(childPid);
    dropDatabase(deadPidName); // idempotent (DROP IF EXISTS) even if the sweep already reclaimed it
    dropDatabase(alivePidName); // sweepStaleFixtureDatabases only runs at the top of test.before, so this test must clean up its own alive-case database itself
  }
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
