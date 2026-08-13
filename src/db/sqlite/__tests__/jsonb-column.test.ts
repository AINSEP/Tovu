import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

import { decodeSqliteJsonb, sqliteJsonb } from "../jsonb-column";

/**
 * @file Direct coverage for `sqliteJsonb`/`decodeSqliteJsonb` (`jsonb-column.ts`) against a real
 * in-memory better-sqlite3 connection — no app schema or migrations involved, since this is
 * testing the reusable column type itself, not any of the 37 existing `text("*_json")` columns
 * in `db/schema.ts` (those are untouched; a separate design debate owns migrating them).
 *
 * Table shapes here are minimal ad hoc `CREATE TABLE ... BLOB` statements rather than
 * `drizzle-kit generate`d migrations, matching what `dataType()` itself would emit.
 */

interface WidgetDoc {
  theme: string;
  slots: string[];
  meta: { count: number; enabled: boolean; note: string | null };
}

const widgets = sqliteTable("widgets", {
  id: integer("id").primaryKey(),
  data: sqliteJsonb<WidgetDoc>()("data").notNull(),
});

const numbers = sqliteTable("numbers", {
  id: integer("id").primaryKey(),
  data: sqliteJsonb<number>()("data").notNull(),
});

function openWidgetsDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY, data BLOB NOT NULL)");
  return { sqlite, db: drizzle(sqlite) };
}

function openNumbersDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE numbers (id INTEGER PRIMARY KEY, data BLOB NOT NULL)");
  return { sqlite, db: drizzle(sqlite) };
}

const sampleDoc: WidgetDoc = {
  theme: "dark",
  slots: ["header", "footer"],
  meta: { count: 3, enabled: true, note: null },
};

test("sqliteJsonb: declared SQL type is blob, never jsonb (the affinity trap)", () => {
  // NUMERIC affinity (what a literal "JSONB" declared type resolves to) would opportunistically
  // cast a stored value that looks numeric — see the @file note in jsonb-column.ts. This pins the
  // migration-facing contract directly, independent of any particular insert's behavior.
  assert.equal(widgets.data.getSQLType(), "blob");
});

test("sqliteJsonb: round-trips a non-trivial nested object", () => {
  const { db } = openWidgetsDb();
  db.insert(widgets).values({ id: 1, data: sampleDoc }).run();

  const [row] = db.select().from(widgets).where(eq(widgets.id, 1)).all();
  assert.deepEqual(row?.data, sampleDoc);
});

test("sqliteJsonb: stores the column as BLOB storage class, not TEXT", () => {
  const { sqlite, db } = openWidgetsDb();
  db.insert(widgets).values({ id: 1, data: sampleDoc }).run();

  const row = sqlite.prepare("SELECT typeof(data) AS storageClass FROM widgets WHERE id = 1").get() as {
    storageClass: string;
  };
  assert.equal(row.storageClass, "blob");
});

test("sqliteJsonb: jsonb_extract reads a nested field from the stored value", () => {
  const { sqlite, db } = openWidgetsDb();
  db.insert(widgets).values({ id: 1, data: sampleDoc }).run();

  const row = sqlite
    .prepare("SELECT jsonb_extract(data, '$.meta.count') AS extractedCount FROM widgets WHERE id = 1")
    .get() as { extractedCount: number };
  assert.equal(row.extractedCount, 3);
});

test("sqliteJsonb: an expression index over jsonb_extract is created and used by the query planner", () => {
  const { sqlite, db } = openWidgetsDb();
  sqlite.exec("CREATE INDEX widgets_theme_idx ON widgets (jsonb_extract(data, '$.theme'))");

  for (let i = 0; i < 25; i += 1) {
    db.insert(widgets)
      .values({
        id: i + 1,
        data: { theme: i === 12 ? "special" : "common", slots: [], meta: { count: i, enabled: false, note: null } },
      })
      .run();
  }

  const plan = sqlite
    .prepare("EXPLAIN QUERY PLAN SELECT id FROM widgets WHERE jsonb_extract(data, '$.theme') = 'special'")
    .all() as Array<{ detail: string }>;
  const usesExpressionIndex = plan.some((step) => step.detail.includes("widgets_theme_idx"));
  assert.ok(usesExpressionIndex, `expected the plan to use widgets_theme_idx, got: ${JSON.stringify(plan)}`);
});

test("sqliteJsonb: a bare-number document round-trips as a number, not affinity-coerced", () => {
  const { sqlite, db } = openNumbersDb();
  db.insert(numbers).values({ id: 1, data: 123 }).run();

  // The affinity trap (see @file note) would coerce a JSONB blob written with an actually-broken
  // declared type ("JSONB") into a real SQLite INTEGER for a document that is just a bare number.
  // Confirms the fix holds specifically for the case that trap silently breaks.
  const row = sqlite.prepare("SELECT typeof(data) AS storageClass FROM numbers WHERE id = 1").get() as {
    storageClass: string;
  };
  assert.equal(row.storageClass, "blob");

  const [selected] = db.select().from(numbers).where(eq(numbers.id, 1)).all();
  assert.equal(selected?.data, 123);
  assert.equal(typeof selected?.data, "number");
});

test("sqliteJsonb: pins the current on-disk JSONB byte layout for jsonb('{\"a\":1}') — NOT a stable contract", () => {
  // SQLite's docs (quoted in full at the top of jsonb-column.ts) say the on-disk JSONB format is
  // an internal implementation detail SQLite reserves the right to change between releases. This
  // test does not assert a contract Tovu depends on — it records what SQLite 3.49.2
  // (better-sqlite3's bundled version, as of this test) actually produces, so that a driver/SQLite
  // upgrade that changes the encoding shows up here as a failure instead of silently doing
  // nothing (this repo stores no real JSONB, so nothing else would notice). A failure here means
  // "the format moved, re-verify jsonb-column.ts's reference material" — it is not a bug report.
  const { sqlite } = openWidgetsDb();
  const buf = sqlite.prepare("SELECT jsonb(?) AS blob").get(JSON.stringify({ a: 1 })) as { blob: Buffer };

  // OBJECT (type 0xc) with a 4-byte payload (TEXT key "a" + INT value "1", 2 bytes each) packs
  // into a single header byte: (4 << 4) | 0xc = 0x4c. Observed directly, not hand-derived only —
  // see the probe methodology note in jsonb-column.ts's @file comment.
  assert.equal(buf.blob.length, 5);
  assert.equal(buf.blob[0], 0x4c);
});

test("decodeSqliteJsonb: rejects an empty buffer", () => {
  assert.throws(() => decodeSqliteJsonb(Buffer.alloc(0)), /empty buffer/);
});

test("decodeSqliteJsonb: rejects trailing bytes after the top-level value", () => {
  // A single top-level `true` (header byte 0x01) followed by one stray byte.
  assert.throws(() => decodeSqliteJsonb(Buffer.from([0x01, 0xff])), /trailing byte/);
});

test("decodeSqliteJsonb: an object payload that ends after a key throws, instead of silently consuming the next sibling element", () => {
  // REGRESSION (2026-08-12, external audit): the object branch of `decodeContainerPayload` decoded a
  // value at `key.nextOffset` without first checking that offset was still inside the object's own
  // `payloadEnd`. A blob whose object payload ends right after a key therefore read PAST the object
  // and consumed the next element of the ENCLOSING array — corrupting the decoded structure silently
  // rather than reporting the truncation.
  //
  // Hand-built bytes (header byte = (sizeNibble << 4) | elementType, per readHeader):
  //   0x5b  ARRAY(0xb), payload 5 bytes
  //   0x2c    OBJECT(0xc), payload 2 bytes  <- only large enough for the KEY, no value
  //   0x17      TEXT(0x7), payload 1 byte
  //   0x61        "a"                        <- object's key, and the payload ends HERE
  //   0x17    TEXT(0x7), payload 1 byte      <- second ARRAY element, NOT the object's value
  //   0x62      "b"
  const truncatedObject = Buffer.from([0x5b, 0x2c, 0x17, 0x61, 0x17, 0x62]);

  assert.throws(
    () => decodeSqliteJsonb(truncatedObject),
    /truncat|payload/i,
    'a truncated object must be reported, not silently decoded as {"a":"b"} by stealing the array\'s next element'
  );
});

test("decodeSqliteJsonb: an object VALUE whose payload straddles the container end throws — bounding where a value starts is not the same as bounding where it ends", () => {
  // REGRESSION round 2 (2026-08-13, Terra F1 + Gemini-Pro F2, converged independently). The first
  // bounds fix checked only `key.nextOffset >= payloadEnd` — i.e. where the value BEGINS. A value that
  // begins inside the object but whose own payload runs past `payloadEnd` sailed straight through, so
  // the container contract the comment claimed to enforce was still unenforced.
  //
  //   0x6b  ARRAY, payload 6
  //   0x3c    OBJECT, payload 3  <- ends at offset 5
  //   0x17      TEXT len 1
  //   0x61        "a"            <- key
  //   0x17      TEXT len 1       <- value HEADER is inside the object…
  //   0x62      "b"              <- …but its PAYLOAD is at offset 5, outside it
  //   0x01    TRUE               <- the array's real next element
  //
  // Before the fix this decoded as [{"a":"b"}, false] with no error.
  assert.throws(
    () => decodeSqliteJsonb(Buffer.from([0x6b, 0x3c, 0x17, 0x61, 0x17, 0x62, 0x01])),
    /overflow|truncat|payload|bound/i,
    "a value crossing its container boundary must be reported, not silently decoded by stealing bytes"
  );
});

test("decodeSqliteJsonb: an ARRAY item whose payload straddles the container end throws too — same contract, other branch", () => {
  // The array branch had the identical gap: `while (cursor < payloadEnd)` admits an item that STARTS
  // inside the payload and ends past it, then jumps the cursor beyond payloadEnd and exits quietly.
  //   0x2b  ARRAY, payload 2
  //   0x17    TEXT len 1   <- starts inside…
  //   0x61      "a"
  //   0x62    trailing byte the item's payload would have to reach for
  assert.throws(
    () => decodeSqliteJsonb(Buffer.from([0x2b, 0x37, 0x61, 0x62, 0x63])),
    /overflow|truncat|payload|bound/i,
    "an array item crossing its container boundary must be reported, not silently absorbed"
  );
});

test("decodeSqliteJsonb: a value ending EXACTLY at the container end is still valid — the bounds fix must not reject the legitimate edge", () => {
  // The boundary case the guard must NOT break: `{"a":"b"}` where the value's last byte is the object's
  // last byte. Equality is legal; only strictly-past is a violation.
  const exact = Buffer.from([0x4c, 0x17, 0x61, 0x17, 0x62]);
  assert.deepEqual(decodeSqliteJsonb(exact), { a: "b" }, "a value ending exactly at payloadEnd must decode");
});
