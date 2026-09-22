import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/sqlite-core";

/**
 * @file Reusable SQLite JSONB `customType` for Drizzle schema columns.
 *
 * ⚠️ NOT RECOMMENDED FOR STORAGE. Read this before reaching for `sqliteJsonb` on a real column.
 * SQLite's own documentation (https://sqlite.org/json1.html, section 3.2.1 "The JSONB format")
 * says, verbatim (re-verified 2026-08-12 against the live page, not transcribed from memory):
 *
 *   "JSONB is a binary representation of JSON used by SQLite and is intended for internal use
 *    by SQLite only. Applications should not use JSONB outside of SQLite nor try to
 *    reverse-engineer the JSONB format."
 *
 *   "There is space in the on-disk JSONB format to add enhancements and future versions of
 *    SQLite might include options to provide O(1) lookup of elements in JSONB, but no such
 *    capability is currently available."
 *
 * ⚠️ CORRECTED 2026-08-12 — an earlier version of this comment claimed persisting JSONB is a
 * data-durability risk because a `better-sqlite3` upgrade could change the format under existing
 * rows. **That was WRONG.** A second, separate SQLite page (https://sqlite.org/jsonb.html) states
 * the opposite explicitly: *"JSONB is intended to be portable and backwards compatible for all
 * future versions of SQLite… you should not have to export and reimport your SQLite database files
 * when you upgrade to a newer SQLite version,"* and that the format is documented *"so that it too
 * can be stable and enduring."* Storing `jsonb()` output is safe on that axis.
 *
 * What the "internal use only" rule actually prohibits is narrower, and this module violates it:
 * *"Applications should access JSONB only through the JSON SQL functions, not by looking at
 * individual bytes of the BLOB."* `decodeSqliteJsonb()` below reads individual bytes. It exists
 * only because Drizzle's `customType.fromDriver` receives the raw driver value and cannot rewrite
 * the SELECT to wrap the column in `json(...)` — see the read-path note further down.
 *
 * **So the blocker is Drizzle, not SQLite.** The compliant shape is: write through `jsonb()`, read
 * through `json(col)` in the query itself, which means NOT using a `customType` for reads. Until
 * something implements that, `db/schema.sqlite.ts`'s `text("*_json")` remains the pragmatic default —
 * a choice about tooling ergonomics, NOT about on-disk durability.
 *
 * This module exists anyway, alongside its tests, purely as **verified reference material**:
 * concrete proof of what `jsonb()`/`jsonb_extract()`/expression indexes actually do against this
 * repo's better-sqlite3 3.49.2, in case a future decision needs that evidence. It is deliberately
 * NOT wired into any schema column, and this file is not a recommendation to do so. Tovu's own
 * `db/schema.sqlite.ts` deliberately keeps `text("*_json")` for SQLite, including for new columns —
 * Postgres `jsonb` and MySQL `JSON` carry no equivalent caveat, so that decision is SQLite-only.
 * The byte-format test in the sibling `__tests__` file pins the observed 3.49.2 encoding so a
 * driver upgrade that moves the format fails loudly there instead of silently in stored data.
 *
 * Purpose:
 * SQLite 3.45+ (this repo runs better-sqlite3's bundled 3.49.2) has a binary JSON storage
 * format ("JSONB") that is smaller than storing JSON as text and lets `jsonb_extract()`-based
 * expression indexes work over it. `sqliteJsonb<T>()` is a Drizzle `customType` factory that
 * writes through SQLite's `jsonb()` function and reads back a parsed JS value of shape `T`.
 * `decodeSqliteJsonb()` below is, in the terms of the warning above, exactly the
 * "reverse-engineer the format" applications are told not to do — deliberately, for this file's
 * reference-material purpose, and not as a pattern to reuse for a real storage column.
 *
 * Affinity trap (verified against this repo's better-sqlite3 3.49.2, do not "fix" by trying
 * `CREATE TABLE t(x JSONB)`): SQLite assigns column affinity by matching the declared type
 * string against a fixed keyword list (`INT`, `CHAR`/`CLOB`/`TEXT`, `BLOB`/empty, `REAL`/
 * `FLOA`/`DOUB`, else NUMERIC). "JSONB" matches none of those, so it falls through to NUMERIC
 * affinity. `pragma_table_info` happily reports the column type as "JSONB", masking the
 * problem — but NUMERIC affinity means SQLite will opportunistically cast an inserted value
 * that looks numeric. Probed directly: `CREATE TABLE t(x JSONB); INSERT INTO t VALUES ('123')`
 * stores `123` as an `INTEGER`, not the 3-byte text `'123'`.
 *
 * NARROWED 2026-08-12 (external audit finding, re-probed live against better-sqlite3 / SQLite
 * 3.49.2 rather than reasoned about): that coercion does **not** reach anything THIS helper
 * writes. `toDriver()` emits a `jsonb(...)` SQL fragment, and `jsonb(...)` returns a BLOB, which
 * NUMERIC affinity does not cast. Measured, all three declared types:
 *
 *     jsonb('123')     -> JSONB-declared col -> typeof = blob      (not coerced)
 *     jsonb('123')     -> BLOB-declared  col -> typeof = blob
 *     '123' (raw text) -> JSONB-declared col -> typeof = integer   (COERCED — the real trap)
 *     '123' (raw text) -> BLOB-declared  col -> typeof = text
 *
 * So the accurate claim is narrower than the one this comment used to make: the trap fires on
 * RAW numeric-looking TEXT written into a JSONB-declared column, not on a JSONB document written
 * through `sqliteJsonb`. `dataType()` below should still keep returning `"blob"` and never
 * `"jsonb"` — it costs nothing and it is what protects an accidental raw-text write to the same
 * column — but do not repeat the stronger "it would corrupt this helper's own documents" claim,
 * because the measurement above says otherwise.
 *
 * Why `toDriver` returns a `sql` fragment instead of a plain value:
 * `customType`'s `toDriver` may return `T['driverData'] | SQL` (see
 * `drizzle-orm/sqlite-core/columns/custom.d.ts`). When the mapped value is a Drizzle `SQL`
 * object, `SQL.buildQueryFromSourceParams` (drizzle-orm/sql/sql.js) recurses into its chunks
 * instead of binding it as a parameter, so `sql\`jsonb(${json})\`` compiles to literal
 * `jsonb(?)` in the emitted statement with `json` bound as the parameter — confirmed by
 * reading that source path, not assumed. That is what actually produces a BLOB storage-class
 * value (verified: `typeof(col)` is `'blob'` after insert); passing a plain JSON string through
 * as the driver value would store JSON as TEXT with no encoding at all.
 *
 * Why reads decode the binary format in JS instead of round-tripping through SQL `json()`:
 * `customType.fromDriver` only receives the raw driver value already fetched for a plain
 * column reference (drizzle-orm/utils.js's row mapper calls `decoder.mapFromDriverValue`
 * directly on what the driver returned) — it cannot rewrite the `SELECT` to wrap the column
 * in `json(...)`. better-sqlite3 returns a `Buffer` for a BLOB-affinity value, so
 * `decodeSqliteJsonb` below implements SQLite's documented on-disk JSONB element format
 * (https://sqlite.org/jsonb.html: one header byte = `(sizeNibble << 4) | elementType`, size
 * either embedded in the high nibble (0-11) or following as a 1/2/4/8-byte big-endian integer
 * for nibble values 12/13/14/15). Every byte pattern this decoder branches on was captured by
 * inserting `jsonb(<literal>)` into a real in-memory `better-sqlite3` connection and dumping the
 * stored bytes (probe script, not transcribed from the spec by hand) — see the round-trip and
 * `typeof`/`jsonb_extract` tests in `__tests__/jsonb-column.test.ts` for the end-to-end proof.
 * `INT5`/`FLOAT5`/`TEXT5` (JSON5-only spellings: unquoted keys, hex ints, leading-dot floats,
 * `Infinity`/`NaN`, single-quoted strings) can never come out of *our own* write path, because
 * `toDriver` only ever feeds `jsonb()` output from `JSON.stringify`, which never emits JSON5
 * syntax. `decodeElement` throws rather than guessing if one is ever encountered (e.g. a
 * document written by some other, non-this-helper JSONB producer), instead of silently
 * misinterpreting it.
 */

/** SQLite JSONB element type codes (low nibble of the header byte), per sqlite.org/jsonb.html. */
const ELEMENT_TYPE = {
  NULL: 0x0,
  TRUE: 0x1,
  FALSE: 0x2,
  INT: 0x3,
  INT5: 0x4,
  FLOAT: 0x5,
  FLOAT5: 0x6,
  TEXT: 0x7,
  TEXTJ: 0x8,
  TEXT5: 0x9,
  TEXTRAW: 0xa,
  ARRAY: 0xb,
  OBJECT: 0xc,
} as const;

/** Header byte high-nibble values 12-15 mean "payload size follows in N bytes", not a literal size. */
const SIZE_FOLLOWS_1_BYTE = 12;
const SIZE_FOLLOWS_2_BYTES = 13;
const SIZE_FOLLOWS_4_BYTES = 14;
const SIZE_FOLLOWS_8_BYTES = 15;

/** One decoded JSONB element plus the buffer offset immediately after it. */
interface DecodedElement {
  value: unknown;
  nextOffset: number;
}

/**
 * Reads the header at `offset` (element type + payload byte range) without interpreting the
 * payload itself.
 *
 * @throws {Error} if `offset` runs past the buffer while reading a multi-byte size field.
 * @complexity O(1) — reads at most 9 bytes.
 */
function readHeader(buf: Buffer, offset: number): { elementType: number; payloadStart: number; payloadLength: number } {
  const headerByte = buf.readUInt8(offset);
  const elementType = headerByte & 0x0f;
  const sizeNibble = (headerByte >> 4) & 0x0f;

  if (sizeNibble <= 11) {
    return { elementType, payloadStart: offset + 1, payloadLength: sizeNibble };
  }
  if (sizeNibble === SIZE_FOLLOWS_1_BYTE) {
    return { elementType, payloadStart: offset + 2, payloadLength: buf.readUInt8(offset + 1) };
  }
  if (sizeNibble === SIZE_FOLLOWS_2_BYTES) {
    return { elementType, payloadStart: offset + 3, payloadLength: buf.readUInt16BE(offset + 1) };
  }
  if (sizeNibble === SIZE_FOLLOWS_4_BYTES) {
    return { elementType, payloadStart: offset + 5, payloadLength: buf.readUInt32BE(offset + 1) };
  }
  // sizeNibble === SIZE_FOLLOWS_8_BYTES: an 8-byte length only matters for payloads far beyond
  // what Buffer/Node can address anyway; Number() truncation is not a realistic concern here.
  return { elementType, payloadStart: offset + 9, payloadLength: Number(buf.readBigUInt64BE(offset + 1)) };
}

/**
 * Decodes JSON string-escape sequences (`\n`, `\"`, `\uXXXX`, ...) in a JSONB TEXT/TEXTJ
 * payload by delegating to `JSON.parse`, rather than hand-rolling RFC 8259 escape handling:
 * the payload bytes are — by the JSONB format's own definition — exactly the bytes that would
 * appear between the quotes of a canonical JSON string, so wrapping them in quotes and parsing
 * reuses the engine's own (correct) string-escape decoder instead of a second, riskier one.
 */
function decodeJsonStringPayload(payloadUtf8: string): string {
  return JSON.parse(`"${payloadUtf8}"`) as string;
}

/** Element type codes this decoder never expects to see (see the `@file` note on JSON5 spellings). */
const JSON5_ONLY_ELEMENT_TYPES: ReadonlySet<number> = new Set([ELEMENT_TYPE.INT5, ELEMENT_TYPE.FLOAT5, ELEMENT_TYPE.TEXT5]);

/**
 * Builds the error for an element type `decodeScalarPayload` does not support. Split out purely
 * to keep `decodeScalarPayload` itself under the repo's cyclomatic-complexity budget — folding
 * this two-way message choice back into that function's `switch` is what pushed it over (10 vs.
 * the ceiling of 9). Same two messages, same conditions, no behavior change.
 */
function unsupportedScalarElementTypeError(elementType: number, payloadStart: number): Error {
  if (JSON5_ONLY_ELEMENT_TYPES.has(elementType)) {
    return new Error(
      `decodeSqliteJsonb: JSON5-only element type ${elementType} at offset ${payloadStart} is not supported ` +
        "(this column's own writes only ever produce strict-JSON element types; a JSON5 spelling means this " +
        "blob was not written through sqliteJsonb's toDriver)"
    );
  }
  return new Error(`decodeSqliteJsonb: unknown JSONB element type ${elementType} at offset ${payloadStart}`);
}

/**
 * Decodes a leaf (non-container) element's payload into its JS value. Split out of
 * `decodeElement` purely to keep each function's branching under the repo's complexity budget —
 * this half has no recursion, the container half (ARRAY/OBJECT) is what needs it.
 *
 * @throws {Error} on an element type this decoder does not support (INT5/FLOAT5/TEXT5, or an
 *   unrecognized code — corruption or a non-JSONB blob).
 * @complexity O(payloadEnd - payloadStart) — a single `Buffer.toString` slice.
 */
function decodeScalarPayload(elementType: number, buf: Buffer, payloadStart: number, payloadEnd: number): unknown {
  switch (elementType) {
    case ELEMENT_TYPE.NULL:
      return null;
    case ELEMENT_TYPE.TRUE:
      return true;
    case ELEMENT_TYPE.FALSE:
      return false;
    case ELEMENT_TYPE.INT:
    case ELEMENT_TYPE.FLOAT:
      return Number(buf.toString("utf8", payloadStart, payloadEnd));
    case ELEMENT_TYPE.TEXT:
    case ELEMENT_TYPE.TEXTJ:
      return decodeJsonStringPayload(buf.toString("utf8", payloadStart, payloadEnd));
    case ELEMENT_TYPE.TEXTRAW:
      // Raw text carries no escape sequences at all (guaranteed by the producer) — used as-is.
      return buf.toString("utf8", payloadStart, payloadEnd);
    default:
      throw unsupportedScalarElementTypeError(elementType, payloadStart);
  }
}

/**
 * Decodes an ARRAY element's payload, recursing into `decodeElement` for each item. Split out of
 * what used to be one combined ARRAY/OBJECT function purely to keep branching under the repo's
 * cognitive-complexity budget — the combined version's `if (ARRAY) {...} else {...}` wrapped two
 * unrelated loop-plus-guard bodies in one extra nesting level apiece, for no shared logic between
 * them; each half here is exactly as nested as its own bounds-checking requires and no more.
 *
 * @throws {Error} if an item's payload runs past `payloadEnd`.
 * @complexity O(n) in the number of bytes making up the array and its descendants.
 */
function decodeArrayPayload(buf: Buffer, payloadStart: number, payloadEnd: number): unknown[] {
  const items: unknown[] = [];
  let cursor = payloadStart;
  while (cursor < payloadEnd) {
    const item = decodeElement(buf, cursor);
    // Starting inside the container is not the same as FITTING inside it. Without this, an item whose
    // payload runs past `payloadEnd` is absorbed and the cursor jumps beyond the end, exiting the loop
    // quietly — the container silently swallows bytes belonging to its parent.
    if (item.nextOffset > payloadEnd) {
      throw new Error(
        `decodeSqliteJsonb: array item at offset ${cursor} ends at ${item.nextOffset}, past its container's payload end ${payloadEnd} (overflowing element)`
      );
    }
    items.push(item.value);
    cursor = item.nextOffset;
  }
  return items;
}

/**
 * Decodes an OBJECT element's payload, recursing into `decodeElement` for each key and value.
 * See `decodeArrayPayload` for why this is a separate function rather than one branch of a
 * combined ARRAY/OBJECT decoder.
 *
 * @throws {Error} if a key element decodes to a non-string, if the payload ends right after a
 *   key with no value element, or if a value's payload runs past `payloadEnd`.
 * @complexity O(n) in the number of bytes making up the object and its descendants.
 */
function decodeObjectPayload(buf: Buffer, payloadStart: number, payloadEnd: number): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  let cursor = payloadStart;
  while (cursor < payloadEnd) {
    const key = decodeElement(buf, cursor);
    if (typeof key.value !== "string") {
      throw new Error(`decodeSqliteJsonb: object key at offset ${cursor} decoded to a non-string (${typeof key.value})`);
    }
    // The key must be followed by its value INSIDE this object's own payload. Without this check a
    // payload ending right after a key reads on into the enclosing container and consumes the next
    // sibling element as if it were this key's value — silent structural corruption rather than a
    // reported truncation (2026-08-12 external audit; regression test in this file's __tests__).
    if (key.nextOffset >= payloadEnd) {
      throw new Error(
        `decodeSqliteJsonb: object payload ends after key "${key.value}" at offset ${cursor} with no value element (truncated object)`
      );
    }
    const val = decodeElement(buf, key.nextOffset);
    // …and the value must FIT, not merely start inside. The check above only proved where the value
    // BEGINS; round 2 of the audit showed a value beginning inside the object and ending past it still
    // decoded, stealing the enclosing array's next byte and returning [{"a":"b"}, false] with no error.
    // `>` not `>=`: a value whose last byte is the container's last byte is legal and must stay legal.
    if (val.nextOffset > payloadEnd) {
      throw new Error(
        `decodeSqliteJsonb: value for key "${key.value}" ends at ${val.nextOffset}, past the object's payload end ${payloadEnd} (overflowing element)`
      );
    }
    obj[key.value] = val.value;
    cursor = val.nextOffset;
  }
  return obj;
}

/**
 * Dispatches an ARRAY or OBJECT element's payload to the decoder for its kind. Kept as a thin
 * wrapper (rather than inlining the ternary at `decodeElement`'s one call site) so the ARRAY/OBJECT
 * choice reads the same way `decodeScalarPayload`'s dispatch does.
 *
 * @throws {Error} propagated from `decodeArrayPayload`/`decodeObjectPayload` — see those.
 * @complexity O(n) in the number of bytes making up the container and its descendants.
 */
function decodeContainerPayload(elementType: number, buf: Buffer, payloadStart: number, payloadEnd: number): unknown {
  return elementType === ELEMENT_TYPE.ARRAY
    ? decodeArrayPayload(buf, payloadStart, payloadEnd)
    : decodeObjectPayload(buf, payloadStart, payloadEnd);
}

/**
 * Decodes one JSONB element starting at `offset` and returns it plus the offset just past it.
 *
 * @throws {Error} propagated from `decodeScalarPayload`/`decodeContainerPayload` — see those.
 * @complexity O(n) in the number of bytes making up this element and its descendants.
 */
function decodeElement(buf: Buffer, offset: number): DecodedElement {
  const { elementType, payloadStart, payloadLength } = readHeader(buf, offset);
  const payloadEnd = payloadStart + payloadLength;
  const nextOffset = payloadEnd;
  const value =
    elementType === ELEMENT_TYPE.ARRAY || elementType === ELEMENT_TYPE.OBJECT
      ? decodeContainerPayload(elementType, buf, payloadStart, payloadEnd)
      : decodeScalarPayload(elementType, buf, payloadStart, payloadEnd);
  return { value, nextOffset };
}

/**
 * Decodes a buffer in SQLite's binary JSONB format (as produced by the `jsonb()` SQL function)
 * back into a plain JS value.
 *
 * @throws {Error} if `buf` is empty, contains an unsupported/unknown element type, or has
 *   trailing bytes after the single top-level value (corruption or a non-JSONB blob).
 * @complexity O(n) in `buf.length`.
 */
export function decodeSqliteJsonb(buf: Buffer): unknown {
  if (buf.length === 0) {
    throw new Error("decodeSqliteJsonb: empty buffer is not a valid JSONB value");
  }
  const { value, nextOffset } = decodeElement(buf, 0);
  if (nextOffset !== buf.length) {
    throw new Error(`decodeSqliteJsonb: ${buf.length - nextOffset} trailing byte(s) after the top-level value`);
  }
  return value;
}

/**
 * Drizzle `customType` factory for a SQLite JSONB column.
 *
 * `TDocument` is the shape callers get back on select and must supply on insert/update, e.g.
 * `data: sqliteJsonb<{ tag: string; count: number }>()("data")`. Every value round-trips through
 * `JSON.stringify`/`JSON.parse` semantics (same fidelity limits as any JSON-backed column: no
 * `undefined`, `Date`, or `bigint` beyond `Number` precision).
 *
 * @example
 * ```ts
 * const widgets = sqliteTable("widgets", {
 *   id: text("id").primaryKey(),
 *   config: sqliteJsonb<{ theme: string; slots: string[] }>()("config").notNull(),
 * });
 * ```
 */
export function sqliteJsonb<TDocument>() {
  return customType<{ data: TDocument; driverData: Buffer }>({
    dataType() {
      // MUST stay "blob" — see the affinity-trap note in the @file comment. Never "jsonb".
      return "blob";
    },
    toDriver(value: TDocument) {
      // Returns an SQL fragment (not the plain string) so the value is written through SQLite's
      // jsonb() function rather than stored as text — see the @file note on why this works.
      return sql`jsonb(${JSON.stringify(value)})`;
    },
    fromDriver(value: Buffer): TDocument {
      return decodeSqliteJsonb(value) as TDocument;
    },
  });
}
