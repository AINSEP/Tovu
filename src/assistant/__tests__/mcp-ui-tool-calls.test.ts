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

test("SECURITY-CRITICAL: an arbitrary tool id is refused, including ones with their own destructive gate", () => {
  assert.equal(isMcpUiToolCallAllowed("database_execute_migrate_forward"), false);
  assert.equal(isMcpUiToolCallAllowed("backup_execute_restore"), false);
  assert.equal(isMcpUiToolCallAllowed("collections_execute_cleanup"), false);
  assert.equal(isMcpUiToolCallAllowed(""), false);
  assert.equal(isMcpUiToolCallAllowed("content_post_delete "), false, "no fuzzy/trimmed matching");
});
