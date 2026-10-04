import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRawFilePath, checkRawTable, checkRawValues, gapLabelFor } from "../backstop-policy.js";

describe("publish backstop hard boundaries", () => {
  for (const table of [
    "members", "member_access", "identity", "principals", "principal_roles", "sessions", "roles", "policies", "policy_permissions",
    "api_keys", "provider_credentials", "credential_store", "composio_accounts", "site_assistant_credentials",
    "origin_settings", "deployment_targets", "publish_content_runs", "publish_trust_grants", "publish_backstop_log",
    "webhook_endpoints", "form_submissions", "analytics_events", "redirect_hits", "change_sets", "outbox",
    "trashed_items", "__drizzle_migrations", "drizzle_migrations", "sqlite_sequence", "tovu_migrations", "tovu_chat_migrations", "schema_migrations", "p_sessions",
  ]) it(`never sends ${table}`, () => {
    assert.equal(checkRawTable({ table, columns: ["id", "title"] }), `Table '${table}' holds private or per-install data and is never sent.`);
  });
  for (const column of ["client_secret", "token", "password", "content_hash", "api_key", "monkey"]) it(`fails closed for column ${column}`, () => {
    assert.equal(checkRawTable({ table: "p_widgets", columns: ["id", column] }), `Column '${column}' may hold a key or password; this row is never sent.`);
  });
  it("allows plugin rows but cannot widen the policy", () => {
    assert.equal(checkRawTable({ table: "p_widgets", columns: ["id", "title", "body"] }), null);
    assert.equal(checkRawTable({ table: "p_credentials", columns: ["id"] }), "Table 'p_credentials' holds private or per-install data and is never sent.");
    assert.equal(checkRawTable({ table: 'widgets; DROP TABLE posts', columns: ["id"] }), "The table name is not a valid database identifier.");
  });
  for (const key of ["core.execution.model", "core.privacy.mode", "core.instructions.custom", "site.assistant.public_enabled"]) it(`blocks private setting ${key}`, () => {
    assert.equal(checkRawValues({ values: { key, value: "ordinary" }, table: "setting_values_workspace" }), `Setting '${key}' belongs to this installation and is never sent.`);
  });
  it("blocks secret settings and scans every string without leaking the value", () => {
    assert.equal(checkRawValues({ values: { secret: 1, value: "ordinary" }, table: "setting_values_workspace" }), "Secret settings are never sent.");
    const planted = "sk-ant-api03-" + "X".repeat(120);
    const reason = checkRawValues({ values: { body: planted } });
    assert.match(reason ?? "", /^Value 'body' looks like it holds a key \(.+\); it was not sent\.$/);
    assert.ok(!reason?.includes(planted));
    assert.equal(checkRawValues({ values: { body: "ordinary text", count: 1, empty: null } }), null);
  });
  for (const relPath of [
    ".env", ".env.production", ".environment", ".npmrc", ".netrc", ".mcp.local.json", ".fs-custom-root.json", ".site-meta.json", "config.json",
    "x/key.pem", "id_rsa", "x/content.db", "x/content.db-wal", "x/content.db.bak", "x/.git/config", "node_modules/x",
    "agent-plugins/x", "plugins/x", "skills/x", "uploads/x", "ops/x", "out/x", "restore-point-x/a", ".publish-staging/a", ".publish-previous/a",
    "../x", "a/../x", "a/./x", "/x", "a\\x", "a//x", "a\0x", "a/.env/x", "C:/x", "a/%2e%2e/x",
  ]) it(`blocks file ${relPath}`, () => assert.notEqual(checkRawFilePath({ relPath }), null));
  it("checks path caps and rejects links explicitly", () => {
    assert.notEqual(checkRawFilePath({ relPath: "x".repeat(513) }), null);
    assert.equal(checkRawFilePath({ relPath: "snippets/footer.html", isSymbolicLink: true }), "Links are never sent; choose a regular file inside the site folder.");
    assert.equal(checkRawFilePath({ relPath: "snippets/footer.html" }), null);
    assert.notEqual(checkRawValues({ values: { file: "sk-ant-api03-" + "X".repeat(120) } }), null);
  });
  it("derives stable gap labels", () => {
    assert.equal(gapLabelFor({ entityType: "raw-row", table: "p_widgets" }), "table:p_widgets");
    assert.equal(gapLabelFor({ entityType: "raw-file", relPath: "snippets/footer/custom.html" }), "folder:snippets/footer");
  });
});
