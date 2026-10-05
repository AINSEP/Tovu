import assert from "node:assert/strict";
import test from "node:test";

import type { ServerLogEntry } from "#src/platform/server-logs/index";
import { parseServerLogFilters, readServerLogs, ServerLogFilterError, type ServerLogSourcePort } from "../../read-server-logs.js";

function entry(seq: number, level: ServerLogEntry["level"], message: string, at = `2026-10-05T12:00:0${seq}.000Z`): ServerLogEntry {
  return { seq, at, level, source: "server", message };
}
const ENTRIES = [entry(1, "debug", "tick"), entry(2, "info", "listening on 3000"), entry(3, "warn", "slow query"), entry(4, "error", "Route POST /x failed"), entry(5, "error", "DB locked")];
const source = (entries: readonly ServerLogEntry[] = ENTRIES, capturing = true): ServerLogSourcePort => ({ entries: () => entries, isCapturing: () => capturing });

test("no filters returns everything oldest first with counts", () => {
  assert.deepEqual(readServerLogs({ logs: source() }), { entries: ENTRIES, matched: 5, buffered: 5, truncated: false, capturing: true });
});

test("level is a minimum severity", () => {
  assert.deepEqual(readServerLogs({ logs: source() }, { level: "warn" }).entries.map(e => e.seq), [3, 4, 5]);
  assert.deepEqual(readServerLogs({ logs: source() }, { level: "error" }).entries.map(e => e.seq), [4, 5]);
});

test("sinceIso is inclusive and contains is case-insensitive", () => {
  assert.deepEqual(readServerLogs({ logs: source() }, { sinceIso: "2026-10-05T12:00:03.000Z" }).entries.map(e => e.seq), [3, 4, 5]);
  assert.deepEqual(readServerLogs({ logs: source() }, { contains: "db LOCK" }).entries.map(e => e.seq), [5]);
});

test("limit keeps the NEWEST matches and reports truncation", () => {
  const result = readServerLogs({ logs: source() }, { limit: 2 });
  assert.deepEqual(result.entries.map(e => e.seq), [4, 5]);
  assert.equal(result.matched, 5);
  assert.equal(result.truncated, true);
});

test("capturing false is passed through so an empty list is not read as no errors", () => {
  assert.deepEqual(readServerLogs({ logs: source([], false) }), { entries: [], matched: 0, buffered: 0, truncated: false, capturing: false });
});

test("parse accepts tool JSON and HTTP query strings alike", () => {
  assert.deepEqual(parseServerLogFilters({ raw: { level: "error", sinceIso: "2026-10-05T12:00:00Z", contains: "x", limit: 5 } }), { level: "error", sinceIso: "2026-10-05T12:00:00.000Z", contains: "x", limit: 5 });
  assert.deepEqual(parseServerLogFilters({ raw: { limit: "20", level: "" } }), { level: undefined, sinceIso: undefined, contains: undefined, limit: 20 });
  assert.deepEqual(parseServerLogFilters({ raw: {} }), { level: undefined, sinceIso: undefined, contains: undefined, limit: undefined });
});

test("parse rejects each unusable field with a message naming it", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ level: "fatal" }, "level must be one of debug, info, warn, error"],
    [{ sinceIso: "yesterday" }, "sinceIso must be an ISO-8601 date-time, e.g. 2026-10-05T12:00:00Z"],
    [{ contains: "x".repeat(201) }, "contains must be a string of at most 200 characters"],
    [{ contains: 5 }, "contains must be a string of at most 200 characters"],
    [{ limit: 0 }, "limit must be an integer from 1 to 500"],
    [{ limit: 501 }, "limit must be an integer from 1 to 500"],
    [{ limit: "2.5" }, "limit must be an integer from 1 to 500"],
  ];
  for (const [raw, message] of cases) {
    assert.throws(() => parseServerLogFilters({ raw }), (err: unknown) => err instanceof ServerLogFilterError && err.message === message, JSON.stringify(raw));
  }
});
