import assert from "node:assert/strict";
import test from "node:test";
import { MCP_UI_EXPIRES_AT_META_KEY } from "@jini-ai/ui/mcp-ui/surfaces";

import { buildConfirmationSurface, formatSnapshotTime } from "../confirmation-ui.js";
import type { DatabaseTransferPlan } from "../plan-store.js";

function plan(overrides: Partial<DatabaseTransferPlan> = {}): DatabaseTransferPlan {
  return { planId: "plan", workspaceId: "ws", principalId: "owner", expiresAtMs: 10_000, connectionString: "postgres://user:SECRET@db.example/catalog", destination: { host: "db.example", port: "5432", database: "catalog", user: "user" }, snapshot: Buffer.from("SECRET SNAPSHOT"), snapshotAt: "snapshot-one", site: "site", schema: "tovu_site", replaces: null, tableCount: 1, rowCount: 1, leftOut: [{ table: "users", rows: 2, reason: "logins" }, { table: "keys", rows: 5, reason: "keys" }], ...overrides };
}

test("first-copy card pluralizes counts and sums every left-out table without exposing secrets", () => {
  const ui = buildConfirmationSurface({ plan: plan(), exchangeId: "ex", expiresAtMs: 1_300_000 });
  assert.equal(ui.resource.uri, "ui://tovu/database-transfer-run/ex");
  assert.equal(ui.resource._meta?.[MCP_UI_EXPIRES_AT_META_KEY], 1_300_000);
  assert.match(ui.resource.text, /<dt>Destination<\/dt><dd>catalog on db\.example<\/dd>/);
  assert.match(ui.resource.text, /<dt>Copies<\/dt><dd>1 table, 1 row, as of snapshot-one<\/dd>/);
  assert.match(ui.resource.text, /<dt>Replaces<\/dt><dd>Nothing\. This is the first copy\.<\/dd>/);
  assert.match(ui.resource.text, /<dt>Left out<\/dt><dd>Logins and saved keys \(7 rows\)\. Photos and files stay where they are\.<\/dd>/);
  assert.doesNotMatch(ui.resource.text, /SECRET|postgres:\/\//);
  const match = ui.resource.text.match(/var PLAN = (.+);/);
  assert.ok(match);
  assert.deepEqual(JSON.parse(match[1]), {
    confirm: { toolName: "database_transfer_run", params: { __exchangeId: "ex", decision: "confirm" } },
    cancel: { toolName: "database_transfer_run", params: { __exchangeId: "ex", decision: "cancel" } },
  });
});

test("replacement card names the previous snapshot and formats large counts", () => {
  // F6.2/F4.3: the warning branch must run; invalid dates deliberately take the literal fallback.
  const ui = buildConfirmationSurface({ plan: plan({ replaces: "previous-snapshot", tableCount: 12, rowCount: 1234, leftOut: [{ table: "keys", rows: 1, reason: "key" }] }), exchangeId: "replacement", expiresAtMs: 1_300_000 });
  assert.match(ui.resource.text, /<dt>Copies<\/dt><dd>12 tables, 1,234 rows, as of snapshot-one<\/dd>/);
  assert.match(ui.resource.text, /<dt>Replaces<\/dt><dd>The earlier copy from previous-snapshot<\/dd>/);
  assert.match(ui.resource.text, /The earlier copy from previous-snapshot is replaced once this copy has been checked\./);
  assert.match(ui.resource.text, /Logins and saved keys \(1 row\)/);
});

test("snapshot time uses English formatting in an explicitly pinned timezone and preserves invalid input", (t) => {
  const prior = process.env.TZ;
  process.env.TZ = "UTC";
  t.after(() => { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; });
  assert.equal(formatSnapshotTime("2026-09-27T15:41:00Z"), "Sep 27, 3:41 PM");
  assert.equal(formatSnapshotTime("not-a-date"), "not-a-date");
});
