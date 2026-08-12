/**
 * @file Migration-verification consumer for `./manifest.ts`.
 *
 * Pure, driver-agnostic checks — no live-DB access here on purpose. Each function takes a value
 * already read from wherever it came from (a source SQLite row, a copied Postgres row) and answers
 * one question: does this value satisfy the semantic contract `manifest.ts` classified its column
 * under? A migration runner calls these per row/column during or after a bulk copy; the live-Postgres
 * fixture tests in `__tests__/migration-manifest-postgres.test.ts` prove the underlying database
 * behavior these checks are guarding against (see that file's own doc for why each proof is executed
 * against a real server, not asserted in the abstract).
 *
 * Why these checks matter even though row copying itself does no dialect conversion for text/JSON
 * columns this round (both stay TEXT — see manifest.ts's `JSON_TEXT_NOTE`/`TIMESTAMP_REPRESENTATION`):
 * a byte-for-byte copy is exactly the case where a WRONG value copies perfectly cleanly. Neither
 * dialect's plain text column notices a malformed JSON payload or a timezone-naive timestamp — the
 * type system offers no protection at all here, which is precisely why this semantic layer has to.
 */
import type { SemanticColumnClass } from "./manifest";

export interface VerificationFailure {
  readonly code: string;
  readonly message: string;
}

/**
 * A UTC-designated ISO-8601 string ends in `Z` or an explicit `+HH:MM`/`-HH:MM` offset. A string
 * with neither is exactly the naive-local shape a WordPress import (or any other non-canonical
 * source) introduces — see `manifest.ts`'s `TIMESTAMP_REPRESENTATION` for why that is dangerous the
 * moment anyone casts the column to `timestamptz`, and
 * `migration-manifest-postgres.test.ts` for the live proof that the same naive string means two
 * different instants depending on the reading session's timezone.
 */
const UTC_DESIGNATOR = /(Z|[+-]\d{2}:\d{2})$/;

/**
 * Verifies a value classified `utc-timestamp-text`. `null` passes — several timestamp columns in
 * this schema are nullable (e.g. `revoked_at`, `deleted_at`), and absence is not a violation of the
 * UTC contract, only a value would be.
 */
export function verifyUtcTimestampText(value: string | null): VerificationFailure | null {
  if (value === null) return null;
  if (!UTC_DESIGNATOR.test(value)) {
    return {
      code: "NAIVE_LOCAL_TIMESTAMP",
      message:
        `"${value}" has no UTC designator (a trailing "Z" or "+HH:MM"/"-HH:MM" offset). Postgres would apply ` +
        `the reading session's own timezone if this were ever cast to timestamptz, silently producing a ` +
        `different instant depending on who reads it and when.`,
    };
  }
  if (Number.isNaN(Date.parse(value))) {
    return { code: "UNPARSEABLE_TIMESTAMP", message: `"${value}" carries a UTC designator but is not a parseable date.` };
  }
  return null;
}

/** Verifies a value classified `json-text`. `null` passes — several `*_json` columns in this schema
 * are nullable (e.g. `posts.body_json` is null for html-format posts). */
export function verifyJsonText(value: string | null): VerificationFailure | null {
  if (value === null) return null;
  try {
    JSON.parse(value);
    return null;
  } catch (error) {
    return {
      code: "INVALID_JSON",
      message: `column classified json-text does not parse as JSON: ${(error as Error).message}`,
    };
  }
}

/**
 * Verifies a boolean copy transform (SQLite's stored `0`/`1` against the Postgres native boolean it
 * should have become — see `manifest.ts`'s `BOOLEAN_COPY_TRANSFORM`). Rejects a source value that is
 * neither `0` nor `1` as its own distinct failure, rather than coercing it truthy/falsy and reporting
 * a possibly-correct-by-accident match.
 */
export function verifyBooleanCopy(sourceSqliteValue: number, copiedPostgresValue: boolean): VerificationFailure | null {
  if (sourceSqliteValue !== 0 && sourceSqliteValue !== 1) {
    return {
      code: "INVALID_SQLITE_BOOLEAN_SOURCE",
      message: `source value ${sourceSqliteValue} is neither 0 nor 1 — not a valid input to the boolean copy transform.`,
    };
  }
  const expected = sourceSqliteValue === 1;
  if (copiedPostgresValue !== expected) {
    return {
      code: "BOOLEAN_COPY_MISMATCH",
      message: `sqlite ${sourceSqliteValue} should have copied to postgres ${expected}, got ${copiedPostgresValue}.`,
    };
  }
  return null;
}

/**
 * Dispatches one column's copied value to the check its `manifest.ts` classification implies.
 * Classes with no copy-time semantic to check (`plain-integer`, `plain-text`, `bigint-id`,
 * `int4-safe-id`) pass unconditionally here — an id column's *value* needs no per-row check, only
 * the identity-reseed step (`manifest.ts`'s `reseedSequenceSql`) and the live capacity proof
 * (`migration-manifest-postgres.test.ts`), neither of which is a per-row concern.
 */
export function verifyClassifiedValue(columnClass: SemanticColumnClass, sqliteValue: unknown, postgresValue: unknown): VerificationFailure | null {
  switch (columnClass.kind) {
    case "utc-timestamp-text":
      return verifyUtcTimestampText(postgresValue as string | null);
    case "json-text":
      return verifyJsonText(postgresValue as string | null);
    case "boolean-flag":
      return verifyBooleanCopy(sqliteValue as number, postgresValue as boolean);
    case "bigint-id":
    case "int4-safe-id":
    case "plain-integer":
    case "plain-text":
      return null;
  }
}
