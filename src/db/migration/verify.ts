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
 * A strict RFC3339 date-time SHAPE: a literal `T` separator between date and time (rejects the
 * looser space-separated form `Date.parse`/`new Date(string)` accept on their own, e.g.
 * `"2026-08-12 10:00:00Z"`), optional fractional seconds, then the trailing UTC designator
 * `UTC_DESIGNATOR` above already requires. This regex says nothing about CALENDAR validity (month
 * 13, February 30th, hour 24, ...) — `isValidCalendarInstant` below handles that half separately,
 * because `Date.parse`'s failure mode there is not "reject", it is "silently normalize":
 * `"2026-02-30T00:00:00Z"` parses successfully as March 2nd rather than failing, which is worse than
 * an outright parse failure because nothing about the return value signals that anything happened.
 *
 * The offset branch captures its sign/hours/minutes as their own groups (rather than the single
 * unstructured `[+-]\d{2}:\d{2}` this used to be) so `isValidUtcOffset` below can range-check them.
 * Without that, this shape alone would happily match `+24:00`/`+23:60`/`+99:99` — any two-digit:two-digit
 * pair — which is exactly the bounds checking a bare `Date.parse` provides for free (V8 rejects an
 * out-of-range offset outright) and which this regex, considered in isolation, does not. See
 * `verifyUtcTimestampText`'s own doc for the live comparison against `Date.parse` that caught this.
 */
const STRICT_RFC3339_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Range-checks an offset captured by `STRICT_RFC3339_SHAPE`'s optional sign/hour/minute groups.
 * `offsetSign` is `undefined` for the `Z` form (nothing to range-check — always valid). UTC offsets
 * in real-world use never exceed ±14:00, but this deliberately checks only the wire-format bounds a
 * clock field can name at all (hours `00`-`23`, minutes `00`-`59`), matching exactly what
 * `Date.parse` itself enforces — not the narrower ±14:00 political range, which is a fact about
 * which offsets exist today, not about what this text shape can validly encode.
 */
function isValidUtcOffset(offsetSign: string | undefined, offsetHourStr: string | undefined, offsetMinuteStr: string | undefined): boolean {
  if (offsetSign === undefined) return true; // the "Z" form — no offset field to range-check
  const offsetHour = Number(offsetHourStr);
  const offsetMinute = Number(offsetMinuteStr);
  return offsetHour <= 23 && offsetMinute <= 59;
}

/**
 * Re-derives the instant via `Date.UTC` and confirms every field survives the round trip unchanged —
 * the standard technique for exact calendar validation without a date library. `Date.UTC` normalizes
 * an out-of-range field exactly the way `Date.parse` does (day 30 in a 28-day February rolls forward
 * into March), so reading the fields back off the constructed `Date` and comparing them against what
 * was actually written catches precisely the silent normalization `Date.parse` alone hides.
 */
function isValidCalendarInstant(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const roundTripped = new Date(ms);
  return (
    roundTripped.getUTCFullYear() === year &&
    roundTripped.getUTCMonth() === month - 1 &&
    roundTripped.getUTCDate() === day &&
    roundTripped.getUTCHours() === hour &&
    roundTripped.getUTCMinutes() === minute &&
    roundTripped.getUTCSeconds() === second
  );
}

/**
 * Verifies a value classified `utc-timestamp-text`. `null` passes — several timestamp columns in
 * this schema are nullable (e.g. `revoked_at`, `deleted_at`), and absence is not a violation of the
 * UTC contract, only a value would be.
 *
 * Deliberately stricter than a bare `Date.parse`/`new Date(string)` check in two independent ways:
 * both accept a space-separated date-time and silently normalize an impossible calendar date instead
 * of rejecting it (see `STRICT_RFC3339_SHAPE`'s own doc); this also range-checks the offset itself
 * (`isValidUtcOffset`) — a gap the first round of this fix introduced by replacing `Date.parse`
 * outright without noticing `Date.parse` had been providing offset-bounds checking for free.
 * `STRICT_RFC3339_SHAPE` alone matches any two-digit:two-digit offset (`+24:00`, `+23:60`, `+99:99`
 * all shape-match), and `isValidCalendarInstant` only round-trips the date/time fields through
 * `Date.UTC` — neither one, by itself, would have caught that. Verified against the live
 * `infra/content.db` before this tightened — every `schema.ts`-declared timestamp column's stored
 * values already match the literal `T`-separated, calendar-valid, range-valid-offset shape this
 * enforces (3,027 non-null values across 117 in-scope columns, zero rejections), so tightening does
 * not retroactively flag any value this manifest's scope actually covers (the handful of anomalous
 * `*_at`-named columns holding epoch-millisecond integers live in `__drizzle_migrations`/`_plugin_*`/
 * `ai_chat*` tables, none of which are exported from `schema.ts` — out of `classifyAllCoreColumns()`'s
 * scope entirely).
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
  const match = STRICT_RFC3339_SHAPE.exec(value);
  if (!match) {
    return {
      code: "UNPARSEABLE_TIMESTAMP",
      message:
        `"${value}" carries a UTC designator but is not a strict RFC3339 date-time — a literal "T" must separate ` +
        `the date and time (the looser space-separated form Date.parse alone would accept is rejected here).`,
    };
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, offsetSign, offsetHourStr, offsetMinuteStr] = match;
  if (!isValidUtcOffset(offsetSign, offsetHourStr, offsetMinuteStr)) {
    return {
      code: "INVALID_UTC_OFFSET",
      message:
        `"${value}" carries an offset of ${offsetSign}${offsetHourStr}:${offsetMinuteStr}, which is out of range — ` +
        `offset hours must be 00-23 and minutes must be 00-59, the same bounds Date.parse enforces on its own. ` +
        `The RFC3339 shape alone (STRICT_RFC3339_SHAPE) accepts any two-digit:two-digit pair here, so this range ` +
        `check exists specifically to restore the bounds checking Date.parse used to provide for free.`,
    };
  }
  const [year, month, day, hour, minute, second] = [yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr].map(Number);
  if (!isValidCalendarInstant(year, month, day, hour, minute, second)) {
    return {
      code: "INVALID_CALENDAR_DATE",
      message:
        `"${value}" has the right shape but names a calendar date/time that does not exist (e.g. a day past the ` +
        `end of its month). Date.parse would silently normalize this to a different, unrelated date instead of ` +
        `rejecting it.`,
    };
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
 * Verifies copy FIDELITY for `plain-text`, `json-text`, and `utc-timestamp-text` — the three classes
 * this round's no-transform TEXT policy applies to (see `manifest.ts`'s `JSON_TEXT_NOTE` /
 * `TIMESTAMP_REPRESENTATION`: both dialects store these as TEXT, byte-for-byte, this round, no
 * conversion of any kind). Exact string equality, not a semantic/structural comparison — no
 * `JSON.parse` + deep-equal that would tolerate key reordering or whitespace differences — because
 * the declared contract is "no transform at all", not "no transform that changes meaning". A future
 * transform (JSON reformatting, timestamp canonicalization to `Z`) must be added here as its own
 * DECLARED, versioned case this dispatcher is taught about, never as a silent exemption from this
 * check.
 *
 * Exists because a shape-only check (valid JSON, a UTC-designated string) cannot catch a copier bug
 * that silently substitutes a DIFFERENT but equally well-shaped value — the audited example:
 * `{"role":"admin"}` copied as `{"role":"member"}` is valid JSON on the destination side and would
 * pass a shape-only check with no complaint at all.
 */
export function verifyExactTextCopy(sqliteValue: unknown, postgresValue: unknown): VerificationFailure | null {
  if (sqliteValue === postgresValue) return null;
  return {
    code: "TEXT_COPY_FIDELITY_MISMATCH",
    message:
      `source value ${JSON.stringify(sqliteValue)} does not exactly match the copied value ` +
      `${JSON.stringify(postgresValue)}. plain-text/json-text/utc-timestamp-text columns have no transform this ` +
      `round — a byte-for-byte copy is the entire contract, and this pair fails it.`,
  };
}

/**
 * Dispatches one column's copied value to the check(s) its `manifest.ts` classification implies.
 *
 * `json-text` and `utc-timestamp-text` run TWO checks, in order: `verifyExactTextCopy` first (does
 * the copy match the source at all?), then the destination-shape check (is the matched value
 * well-formed?) — shape alone was the BLOCKER this dispatcher used to ship: it validated only
 * `postgresValue`, so a copier that silently substituted a different-but-valid value for either kind
 * passed verification. `plain-text` gets only the fidelity check — it has no shape of its own to
 * validate beyond matching the source.
 *
 * `reviewed-id` and `plain-integer` pass unconditionally, on purpose, NOT as an oversight carried
 * over from before this fix: their physical-type story (int4-vs-int8 capacity) is proven once,
 * structurally, by "GATE A" in migration-manifest.test.ts and the live capacity proof in
 * migration-manifest-postgres.test.ts, not per-row here — and per-row numeric equality for these
 * would need its own explicit design (e.g. how it should treat a `mode:"number"` bigint column that
 * has already lost precision past 2^53, see `manifest.ts`'s `PG_BIGINT53_SAFE_INTEGER_CEILING`),
 * which was not in this round's scope. `boolean-flag` also keeps its own dedicated path
 * (`verifyBooleanCopy`) unconditionally — it already checks a source/destination pair, just via an
 * explicit 0/1-to-boolean TRANSFORM rather than exact equality, which is the correct check for a
 * column whose representation genuinely changes across dialects.
 */
export function verifyClassifiedValue(columnClass: SemanticColumnClass, sqliteValue: unknown, postgresValue: unknown): VerificationFailure | null {
  switch (columnClass.kind) {
    case "utc-timestamp-text": {
      const fidelity = verifyExactTextCopy(sqliteValue, postgresValue);
      if (fidelity) return fidelity;
      return verifyUtcTimestampText(postgresValue as string | null);
    }
    case "json-text": {
      const fidelity = verifyExactTextCopy(sqliteValue, postgresValue);
      if (fidelity) return fidelity;
      return verifyJsonText(postgresValue as string | null);
    }
    case "plain-text":
      return verifyExactTextCopy(sqliteValue, postgresValue);
    case "boolean-flag":
      return verifyBooleanCopy(sqliteValue as number, postgresValue as boolean);
    case "reviewed-id":
    case "plain-integer":
      return null;
  }
}
