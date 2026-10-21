import assert from "node:assert/strict";
import { test } from "node:test";

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { columnRow } from "../prepare-content-store.js";

/**
 * @file `columnRow` applies Drizzle's insert-time conversions to a seed object: `$defaultFn`, then
 * `$onUpdateFn`, for an omitted key; the column's driver mapping; real column names; unknown keys dropped.
 */

const things = sqliteTable("things", {
  id: text("id").primaryKey(),
  token: text("token").$defaultFn(() => "generated-token"),
  touchedAt: text("touched_at").$onUpdateFn(() => "on-update-stamp"),
  both: text("both").$defaultFn(() => "default-wins").$onUpdateFn(() => "update-loses"),
  enabled: integer("enabled", { mode: "boolean" }),
  meta: text("meta", { mode: "json" }),
  note: text("note"),
});

test("an omitted key takes its $defaultFn, else its $onUpdateFn, and $defaultFn wins when both exist", () => {
  assert.deepEqual(columnRow(things, { id: "t-1" }), {
    id: "t-1", token: "generated-token", touched_at: "on-update-stamp", both: "default-wins",
  });
});

test("supplied values map to driver values under real column names; null passes through; unknown keys drop", () => {
  const row = columnRow(things, {
    id: "t-2", token: "given", touchedAt: "given-stamp", both: "given-both",
    enabled: true, meta: { a: 1 }, note: null, notAColumn: "dropped",
  });

  assert.deepEqual(row, {
    id: "t-2", token: "given", touched_at: "given-stamp", both: "given-both", enabled: 1, meta: '{"a":1}', note: null,
  });
});
