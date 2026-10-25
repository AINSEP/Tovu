import assert from "node:assert/strict";
import test from "node:test";

import { BACKSTOP_DENIED_COLUMN_PATTERN, checkRawTable } from "../backstop-policy.js";

/**
 * @file One table per deny regex in `backstop-policy.ts` (Stryker lane L14: 21 Regex survivors, AP4).
 * These boundaries decide which tables/columns "send by hand" may NEVER copy between sites, so every
 * alternation branch, singular/plural form, case variant and `_` boundary gets its own case. The few
 * ALLOWED cases are deliberately benign look-alikes (a word that merely starts like a denied one).
 */

const denied = (table: string) => checkRawTable({ table, columns: [] }) !== null;

test("identity tables: every alternative, singular and plural, as a whole word or a '_' segment, any case", () => {
  for (const word of ["member", "members", "identity", "principal", "principals", "session", "sessions", "role", "roles", "policy", "policies"]) {
    for (const table of [word, `${word}_x`, `x_${word}`, `x_${word}_y`, word.toUpperCase()]) {
      assert.equal(denied(table), true, table);
    }
  }
  for (const table of ["membership", "roleplay", "policyholder", "sessionless", "xmembers", "principality"]) {
    assert.equal(denied(table), false, table);
  }
});

test("credential tables: api_keys (prefix), anything containing 'credential', composio_ (prefix)", () => {
  for (const table of ["api_keys", "api_keys_v2", "API_KEYS", "credential", "vault_credentials", "x_credential_y", "composio_tokens", "Composio_x"]) {
    assert.equal(denied(table), true, table);
  }
  assert.equal(denied("api_keysmith"), false, "api_keys must end or continue with '_'");
});

test("system tables: every listed prefix as the WHOLE name or a '_' prefix; bookkeeping and migration tables", () => {
  const system = ["origin_settings", "deployment", "publish_content", "publish_trust", "publish_backstop", "webhook", "form_submissions",
    "analytics", "redirect_hits", "change_sets", "outbox", "trashed_items"];
  for (const name of system) {
    assert.equal(denied(name), true, name);
    assert.equal(denied(`${name}_log`), true, `${name}_log`);
  }
  // `deployments` is classified as a per-install table by name (FU-A); the anchor is pinned by a benign look-alike.
  assert.equal(denied("outboxed"), false, "a system prefix must end or continue with '_'");
  assert.equal(denied("deployments"), true, "classified per-install (backstop-policy.private-tables.unit.test.ts)");
  for (const table of ["sqlite_sequence", "__drizzle_migrations", "_drizzle_x", "drizzle_meta", "migrations", "migration_x",
    "tovu_migrations", "tovu_chat_migrations", "schema_migrations", "schema_migrations_lock", "SQLITE_STAT1"]) {
    assert.equal(denied(table), true, table);
  }
});

test("column names: secret/token/password/key anywhere (any case), '_hash' only as a suffix", () => {
  for (const column of ["secret", "client_secret", "TOKEN", "refresh_token_x", "password", "PasswordResetAt", "key", "api_key", "monkey", "password_hash", "x_hash"]) {
    assert.equal(BACKSTOP_DENIED_COLUMN_PATTERN.test(column), true, column);
  }
  for (const column of ["content_hash_version", "hashtag", "title", "slug", "id"]) {
    assert.equal(BACKSTOP_DENIED_COLUMN_PATTERN.test(column), false, column);
  }
});

test("checkRawTable: identifier shape is checked first, then the table deny-list, then each column in order", () => {
  assert.equal(checkRawTable({ table: "1bad", columns: [] }), "The table name is not a valid database identifier.");
  assert.equal(checkRawTable({ table: "bad-name", columns: [] }), "The table name is not a valid database identifier.");
  assert.equal(checkRawTable({ table: "ok\n", columns: [] }), "The table name is not a valid database identifier.");
  assert.equal(checkRawTable({ table: "members", columns: ["bad col"] }), "Table 'members' holds private or per-install data and is never sent.");
  assert.equal(checkRawTable({ table: "p_x", columns: ["id", "bad col", "secret"] }), "The column name is not a valid database identifier.");
  assert.equal(checkRawTable({ table: "p_x", columns: ["id", "__proto__"] }), "The column name is not a valid database identifier.");
  assert.equal(checkRawTable({ table: "p_x", columns: ["id", "secret", "bad col"] }), "Column 'secret' may hold a key or password; this row is never sent.");
  assert.equal(checkRawTable({ table: "_p_x", columns: ["_id", "title"] }), null);
});

test("REGRESSION PIN: on the real migrated schema, sealed-credential tables are never sendable by hand", async (t) => {
  // `secrets_vault` is now denied by name (owner-approved FU-A 2026-10-25), no longer only because its
  // `owner_key` column matches the column rule. This pins the outcome on the real schema.
  const { openContentDb } = await import("#src/platform/db/sqlite/content-db");
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: { prepare(sql: string): { all(): Array<{ name: string }> }; close(): void } }).$client;
  t.after(() => client.close());
  for (const table of ["secrets_vault", "external_mcp_servers", "mail_send_ledger"]) {
    const columns = client.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
    assert.ok(columns.length > 0, `${table} exists in the migrated schema`);
    assert.notEqual(checkRawTable({ table, columns }), null, `${table} rows must never be sendable`);
  }
});
