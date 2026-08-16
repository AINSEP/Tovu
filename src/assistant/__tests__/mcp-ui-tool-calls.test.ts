import assert from "node:assert/strict";
import test from "node:test";

import { MCP_UI_REDEEMABLE_TOOL_IDS, isMcpUiToolCallAllowed } from "../mcp-ui-tool-calls";

test("content_post_delete is on the allowlist — the one tool this mechanism was built for (ADR-053)", () => {
  assert.equal(isMcpUiToolCallAllowed("content_post_delete"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("content_post_delete"));
});

test("content_post_search is on the allowlist — the real execution path behind the /search composer capability", () => {
  assert.equal(isMcpUiToolCallAllowed("content_post_search"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("content_post_search"));
});

test("deployment_execute_static_publish is on the allowlist — it holds up the same held-open-exchange shape content_post_delete does (2026-08-15)", () => {
  assert.equal(isMcpUiToolCallAllowed("deployment_execute_static_publish"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("deployment_execute_static_publish"));
});

test("the two read-only static-publish tools are NOT on the allowlist — neither opens an exchange, so admitting them here would only widen this endpoint's reach for no reason", () => {
  assert.equal(isMcpUiToolCallAllowed("deployment_get_static_publish_capabilities"), false);
  assert.equal(isMcpUiToolCallAllowed("deployment_preview_static_publish"), false);
});

test("deployment_propose_custom_provider_credential is on the allowlist — it holds up the SAME held-open-exchange shape content_post_delete/deployment_execute_static_publish do (spec §6d)", () => {
  assert.equal(isMcpUiToolCallAllowed("deployment_propose_custom_provider_credential"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("deployment_propose_custom_provider_credential"));
});

test("deployment_generate_bucket_hosting_setup is NOT on the allowlist — it is a plain read tool that never opens an exchange (spec §3a)", () => {
  assert.equal(isMcpUiToolCallAllowed("deployment_generate_bucket_hosting_setup"), false);
});

test("SECURITY-CRITICAL: an arbitrary tool id is refused, including ones with their own destructive gate", () => {
  assert.equal(isMcpUiToolCallAllowed("database_execute_migrate_forward"), false);
  assert.equal(isMcpUiToolCallAllowed("backup_execute_restore"), false);
  assert.equal(isMcpUiToolCallAllowed("collections_execute_cleanup"), false);
  assert.equal(isMcpUiToolCallAllowed(""), false);
  assert.equal(isMcpUiToolCallAllowed("content_post_delete "), false, "no fuzzy/trimmed matching");
});
