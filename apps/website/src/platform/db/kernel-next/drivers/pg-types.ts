/**
 * @file How every Postgres transport turns column text into JS values where the defaults differ
 * from what the repos (and SQLite) expect. One table, used by the PGlite and node-postgres drivers,
 * so a row reads the same on both.
 *
 * - `json`/`jsonb` stay JSON TEXT: the repos store and parse JSON themselves (SQLite has no JSON
 *   type), so a `string` column type holds on every dialect. Postgres returns its normalised
 *   spelling (`{"a": 1}`), which parses to the same value.
 * - `int8` (`bigint`) is a `number` when it fits in a double exactly, else a `bigint` — PGlite's own
 *   rule, which node-postgres (default: string) is aligned to.
 */

export const PG_OID = { int8: 20, json: 114, jsonb: 3802 } as const;

export function parseInt8(text: string): number | bigint {
  const value = BigInt(text);
  return value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER) ? value : Number(value);
}

const asText = (text: string) => text;

/** Parser overrides by type oid. */
export const PG_PARSERS: Readonly<Record<number, (text: string) => unknown>> = {
  [PG_OID.int8]: parseInt8,
  [PG_OID.json]: asText,
  [PG_OID.jsonb]: asText,
};
