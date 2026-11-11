import assert from "node:assert/strict";
import test from "node:test";

import { checkRawTable } from "../backstop-policy.js";

/**
 * @file Owner-approved FU-A (2026-10-25): sealed credentials and private/per-install CORE tables are
 * denied BY NAME, independently of their column names, so a column rename can never make them
 * sendable. Plugin tables keep the generic rules.
 */

const REFUSAL = (table: string) => `Table '${table}' holds private or per-install data and is never sent.`;

// Classified from the real migrated schema (openContentDb(":memory:"), measured FU-A 2026-10-25).
const PRIVATE_CORE_TABLES = [
  "secrets_vault",
  // Per-recipient mail state: suppression decisions, their audit and raw provider feedback.
  "mail_suppression", "mail_suppression_removals", "mail_feedback_inbox",
  // A visitor-consent configuration is decided per site and per install, never copied.
  "site_consent_heads", "site_consent_revisions",
  // Per-principal settings and the settings audit log (before/after values of any setting).
  "setting_values_user", "setting_revisions",
  // Grants, audit and delivery queues bound to this install's principals, runs and adapters.
  "external_mcp_tool_approvals", "agent_tool_attempts", "form_delivery_jobs", "form_delivery_plans",
  // Hosting, deployment and install bookkeeping.
  "domain_binding", "publish_history", "deployments", "plugin_activations", "workspaces",
  "database_write_watermark", "site_title_preexisting_workspaces", "change_set_items",
  // Derived search indexes, rebuilt locally (FTS shadow tables must never be written directly).
  "search_index_retired", "search_index_targets", "search_index_watermarks",
  "post_search_document", "post_search_fts", "post_search_fts_config", "post_search_fts_data", "post_search_fts_docsize", "post_search_fts_idx",
] as const;

// Core tables that stay sendable under the generic rules (content the owner moves between sites).
const SENDABLE_CORE_TABLES = [
  "entries", "entry_refs", "entry_revisions", "entry_terms", "form_definitions", "media", "media_slug_history", "menus",
  "newsletter_campaign_revisions", "newsletter_campaigns", "posts", "presentation_settings", "redirect_revisions", "redirects",
  "setting_values_global", "setting_values_workspace", "taxonomies", "taxonomy_revisions", "terms", "transform_registry",
] as const;

test("secrets_vault is denied by name, with no columns and with only benign columns", () => {
  assert.equal(checkRawTable({ table: "secrets_vault", columns: [] }), REFUSAL("secrets_vault"));
  assert.equal(checkRawTable({ table: "secrets_vault", columns: ["id", "label", "provider"] }), REFUSAL("secrets_vault"));
  assert.equal(checkRawTable({ table: "SECRETS_VAULT", columns: ["id"] }), REFUSAL("SECRETS_VAULT"));
});

test("every private/per-install core table is denied by name, independent of its columns", () => {
  for (const table of PRIVATE_CORE_TABLES) {
    assert.equal(checkRawTable({ table, columns: ["id", "title"] }), REFUSAL(table), table);
    assert.equal(checkRawTable({ table: table.toUpperCase(), columns: [] }), REFUSAL(table.toUpperCase()), table);
  }
});

test("exact names only: plugin tables and look-alikes keep the generic rules", () => {
  for (const table of ["p_widgets", "p_mail_suppression", "mail_suppressionx", "x_workspaces", "workspaces2", "deploymentsx"]) {
    assert.equal(checkRawTable({ table, columns: ["id", "title"] }), null, table);
  }
  assert.equal(checkRawTable({ table: "p_widgets", columns: ["id", "api_key"] }), "Column 'api_key' may hold a key or password; this row is never sent.");
});

test("every table in the real migrated schema is classified: denied, or on the reviewed sendable list", async (t) => {
  const { openContentDb } = await import("#src/platform/db/sqlite/content-db");
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: { prepare(sql: string): { all(): Array<{ name: string }> }; close(): void } }).$client;
  t.after(() => client.close());
  const sendable: string[] = [];
  for (const { name } of client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()) {
    const columns = client.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name);
    if (checkRawTable({ table: name, columns }) === null) sendable.push(name);
  }
  // A new migration must be classified here before its rows become sendable by hand.
  assert.deepEqual(sendable, [...SENDABLE_CORE_TABLES]);
});
