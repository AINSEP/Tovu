import assert from "node:assert/strict";
import test from "node:test";

import { TOVU_TRANSFER_MESSAGES as messages } from "../transfer-messages.js";

/** @file Tovu's "this site" wording for the transfer tools' parameterised messages. */

test("the plan description names the real default schema and per-site prefix", () => {
  const text = messages.plan({ naming: { defaultSchema: "tovu", schemaPrefix: "tovu_" } } as Parameters<typeof messages.plan>[0]);
  assert.match(text, /'tovu' for the first site copied there, 'tovu_<site name>' for any other/);
  assert.match(text, /^Plans a COPY of this site's data into a Postgres database/);
});

test("the parameterised refusals and confirmations speak of this site and name what is missing", () => {
  assert.equal(messages.privateAreasTaken({ where: "db.example.com/app" }), "every private area this site could use in db.example.com/app already holds other data. Nothing will be overwritten.");
  assert.equal(messages.destinationSaved({ database: "app", host: "db.example.com" }), "Copies of this site's data will go to app on db.example.com.");
  assert.equal(messages.missingSourceTable({ table: "entries" }), "this site's database has no 'entries' table");
  assert.equal(messages.missingSourceColumn({ table: "entries", column: "slug" }), "this site's database has no 'entries.slug' column");
});
