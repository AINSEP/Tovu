import assert from "node:assert/strict";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/sqlite-core";

import { collectCoreTables } from "#src/platform/db/migration/manifest";
import { collectTransferTables } from "../copy-engine.js";
import { EXCLUDED_CORE_TABLES, SECRET_COLUMN_PATTERN } from "../exclusions.js";

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

test("every excluded name is a real core table, and none of them is copied", () => {
  const coreNames = new Set(collectCoreTables().map(({ table }) => getTableConfig(table).name));
  assert.deepEqual(Object.keys(EXCLUDED_CORE_TABLES).filter((name) => !coreNames.has(name)), []);
  const copied = new Set(collectTransferTables().map((table) => table.name));
  assert.deepEqual(Object.keys(EXCLUDED_CORE_TABLES).filter((name) => copied.has(name)), []);
});


test("the copy excludes every agreed login, saved-key and confirmation table", () => {
  assert.deepEqual(Object.keys(EXCLUDED_CORE_TABLES).sort(), [
    "identity_users", "sessions", "api_keys", "member_sessions", "member_magic_tokens",
    "admin_execution_credentials", "custom_credential_sets", "database_transfer_destinations",
    "external_mcp_servers", "external_mcp_tool_approvals", "media_provider_credentials",
    "oauth_device_authorizations", "oauth_pending_authorizations", "publish_content_peers",
    "publish_credential_sets", "site_assistant_credentials", "source_control_credential_sets",
    "vendor_credential_sets", "gated_mutation_tokens",
  ].sort());
});
