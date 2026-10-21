import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";

import { collectCoreTables } from "#src/platform/db/migration/manifest";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { collectTransferTables, countPartialExclusions, planSnapshotTables } from "../copy-engine.js";
import { EXCLUDED_CORE_TABLES, SECRET_COLUMN_PATTERN } from "../exclusions.js";
import { openSqliteSnapshotSource } from "../sqlite-source.js";

/**
 * @file Owner decision Q2 (2026-09-27): a copy never carries logins or saved keys. A core table that
 * gains a secret-shaped column and is not on the exclusion list fails here, before it can ride along.
 */

test("every core table with a secret-shaped column is excluded from the copy", () => {
  const leaking = collectCoreTables().flatMap(({ table }) => {
    const cfg = getTableConfig(table);
    const secrets = cfg.columns.map((column) => column.name).filter((name) => SECRET_COLUMN_PATTERN.test(name));
    return secrets.length > 0 && !(cfg.name in EXCLUDED_CORE_TABLES) ? [`${cfg.name} (${secrets.join(", ")})`] : [];
  });
  assert.deepEqual(leaking, []);
});

test("every excluded name is a current or migrated-away core table, and none of them is copied", () => {
  const coreNames = new Set(collectCoreTables().map(({ table }) => getTableConfig(table).name));
  // Old snapshots must still exclude the tables folded/dropped by the vault cutover.
  const retiredNames = ["admin_execution_credentials", "custom_credential_sets", "database_transfer_destinations",
    "media_provider_credentials", "oauth_pending_authorizations", "publish_content_peers", "publish_credential_sets",
    "site_assistant_credentials", "source_control_credential_sets", "vendor_credential_sets"];
  // Raw-SQL migration tables have no Drizzle declaration, so they are not "core" by that catalog.
  const rawSqlNames = ["mail_capture"];
  assert.deepEqual(Object.keys(EXCLUDED_CORE_TABLES).filter((name) => !coreNames.has(name)).sort(), [...retiredNames, ...rawSqlNames].sort());
  const copied = new Set(collectTransferTables().map((table) => table.name));
  assert.deepEqual(Object.keys(EXCLUDED_CORE_TABLES).filter((name) => copied.has(name)), []);
});

test("partial exclusion counts skip settings tables absent from an older snapshot", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE setting_definitions (setting_id TEXT PRIMARY KEY, secret INTEGER);
    CREATE TABLE setting_values_global (setting_id TEXT, value_json TEXT);
    INSERT INTO setting_definitions VALUES ('public', 0), ('secret-a', 1), ('secret-b', 1);
    INSERT INTO setting_values_global VALUES ('public', 'visible'), ('secret-a', 'private-a'), ('secret-b', 'private-b');
  `);
  const source = openSqliteSnapshotSource(db.serialize());
  t.after(() => source.close());

  assert.deepEqual(countPartialExclusions(source), [{
    table: "setting_values_global", rows: 2,
    reason: "settings marked secret, and their history, are not copied",
  }]);
});


test("the copy excludes every agreed login, saved-key, confirmation and running-lock table", () => {
  assert.deepEqual(Object.keys(EXCLUDED_CORE_TABLES).sort(), [
    "identity_users", "sessions", "api_keys", "member_sessions", "member_magic_tokens",
    "admin_execution_credentials", "custom_credential_sets", "database_transfer_destinations",
    "external_mcp_servers", "external_mcp_tool_approvals", "media_provider_credentials",
    "oauth_device_authorizations", "oauth_pending_authorizations", "publish_content_peers",
    "publish_credential_sets", "site_assistant_credentials", "source_control_credential_sets",
    "vendor_credential_sets", "gated_mutation_tokens", "secrets_vault", "form_receiver_pulls", "mail_capture",
  ].sort());
});

test("a copy carries form delivery plans and job index rows with their outbox rows, never the receiver pull lease", () => {
  const copied = new Set(collectTransferTables().map((table) => table.name));
  assert.deepEqual(["form_delivery_plans", "form_delivery_jobs", "outbox_events", "form_submission_remote_receipts", "form_receiver_pulls"]
    .map((name) => [name, copied.has(name)]), [
    ["form_delivery_plans", true], ["form_delivery_jobs", true], ["outbox_events", true], ["form_submission_remote_receipts", true],
    ["form_receiver_pulls", false],
  ]);
  assert.equal(EXCLUDED_CORE_TABLES.form_receiver_pulls, "running-lock");
});

test("a copy plan names the receiver pull lease as left out because it is a lock held by the running site", () => {
  const db = openContentDb(":memory:");
  try {
    db.$client.prepare("INSERT INTO form_receiver_pulls (workspace_id, receiver_key, lease_token, lease_expires_at, last_started_at) VALUES ('ws', 'host:https://r.example', 't', '2026-10-20T12:06:15.000Z', '2026-10-20T12:00:00.000Z')").run();
    const { leftOut } = planSnapshotTables(openSqliteSnapshotSource(db.$client.serialize()));
    assert.deepEqual(leftOut.filter(entry => entry.table === "form_receiver_pulls"),
      [{ table: "form_receiver_pulls", reason: "locks held by the running site are not copied" }]);
  } finally {
    db.$client.close();
  }
});
