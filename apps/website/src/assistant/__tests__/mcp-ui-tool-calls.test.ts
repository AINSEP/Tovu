import assert from "node:assert/strict";
import test from "node:test";

import { MCP_UI_REDEEMABLE_TOOL_IDS, isMcpUiToolCallAllowed } from "../mcp-ui-tool-calls.js";

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
  assert.equal(isMcpUiToolCallAllowed("collections_execute_cleanup"), false);
  assert.equal(isMcpUiToolCallAllowed("source_control_execute_push"), false);
  assert.equal(isMcpUiToolCallAllowed(""), false);
  assert.equal(isMcpUiToolCallAllowed("content_post_delete "), false, "no fuzzy/trimmed matching");
});

// Moved here from the former `mcp-ui-tool-calls.demo-enabled.test.ts` when the
// `TOVU_ENABLE_DEMO_TOOLS` gate was removed (2026-08-26). That file existed ONLY because this
// entry's membership was computed once at module-import time from the env var, so proving it
// needed a dynamic import in its own process; with the gate gone there is nothing left to isolate,
// and the coverage belongs in the file that already owns this area. The assertion is inverted from
// what it used to be: membership is now unconditional.
test("assistant_demo_choices is on the allowlist unconditionally — it performs no token redemption because it has nothing to redeem", () => {
  assert.equal(isMcpUiToolCallAllowed("assistant_demo_choices"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("assistant_demo_choices"));
});

test("assistant_ask_choice is on the allowlist — it holds up the same held-open-exchange shape content_post_delete does, not assistant_demo_choices's carve-out", () => {
  assert.equal(isMcpUiToolCallAllowed("assistant_ask_choice"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("assistant_ask_choice"));
});

// S4 (2026-09-24): the standalone `agent_plugins_uninstall` tool this allowlist used to carry a
// separate entry for (2026-09-14) was deleted — its Agent Plugin branch now redeems through this SAME
// `plugins_uninstall` entry, covering BOTH plugin families with the one id.
test("plugins_uninstall is on the allowlist — it parks on the human's confirm/cancel click the same way media_trash_asset does, for either plugin family (2026-09-16)", () => {
  assert.equal(isMcpUiToolCallAllowed("plugins_uninstall"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("plugins_uninstall"));
});

test("custom_credential_make_request is on the allowlist — its DELETE method holds up the same held-open-exchange shape content_post_delete does (2026-08-31)", () => {
  assert.equal(isMcpUiToolCallAllowed("custom_credential_make_request"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("custom_credential_make_request"));
});

test("custom_credential_create is on the allowlist — it holds up the same held-open-exchange shape custom_credential_set_token does (2026-09-03)", () => {
  assert.equal(isMcpUiToolCallAllowed("custom_credential_create"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("custom_credential_create"));
});

test("external_mcp_reauth_prompt is on the allowlist — it holds up the same held-open-exchange shape content_post_delete does (2026-09-02)", () => {
  assert.equal(isMcpUiToolCallAllowed("external_mcp_reauth_prompt"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("external_mcp_reauth_prompt"));
});

// 2026-09-08 — `external_mcp_save` (`features/external-mcp/tool-registrations.ts`) holds up the SAME
// held-open-exchange shape `content_post_delete`/`media_trash_asset` do: its handler opens a
// `SurfaceExchangeStore` exchange and parks on the human's "Add server"/Cancel click before writing
// anything. Found missing by a live product test (ADS-memory/reports/
// 2026-09-08-dock-recovery-product-test.md): the assistant's own proposed connection-recovery flow
// rendered the form correctly, then every submission 403'd with TOOL_NOT_ALLOWLISTED — the exact
// gap `media_trash_asset` shipped with for one commit, this time on the tool the report calls "the
// one path available through the audited tools".
test("external_mcp_save is on the allowlist — it holds up the same held-open-exchange shape content_post_delete does (2026-09-08 dock-recovery product test)", () => {
  assert.equal(isMcpUiToolCallAllowed("external_mcp_save"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("external_mcp_save"));
});

test("custom_credential_write_files is on the allowlist — every call holds up the same held-open-exchange shape content_post_delete does (2026-09-15)", () => {
  assert.equal(isMcpUiToolCallAllowed("custom_credential_write_files"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("custom_credential_write_files"));
});

// ---------------------------------------------------------------------------
// The closed-set property
// ---------------------------------------------------------------------------
//
// Everything above names one id at a time, which proves the CURRENT answers but not the property
// that matters: that this endpoint refuses everything it was not explicitly told to allow. A
// per-id test suite stays green under a `isMcpUiToolCallAllowed` rewritten to `return true`, to
// substring-match, or to prefix-match on a domain — each of which turns this endpoint into general
// remote execution reachable by any HTML an agent's tool result can render (see this module's own
// header). The two tests below are the ones that fail in those cases.

/**
 * Exactly what this endpoint will forward to. Adding an entry must be a deliberate edit HERE too.
 *
 * This list was stale from the moment the 2026-09-08 delete-confirmation family
 * (`comments_trash_comment`/`widgets_trash_instance`/`theme_trash_file`/`redirects_tombstone`/
 * `webhooks_delete_subscription`/`media_trash_asset`) landed in `MCP_UI_REDEEMABLE_TOOL_IDS` without
 * a matching edit here — this closed-set test was RED against the real production allowlist before
 * this comment was written (six entries under-counted), an instance of the exact "fix lands in one
 * arm, leaves the sibling assertion behind" defect class `external_mcp_save`'s own gap belongs to.
 * Brought current in the same pass that adds `external_mcp_save`, rather than left red for an
 * unrelated-looking reason.
 */
const EXPECTED_ALLOWLIST = [
  "assistant_ask_choice",
  "assistant_demo_choices",
  "assistant_tool_failure_recovery",
  "comments_trash_comment",
  "content_post_delete",
  "content_post_search",
  "custom_credential_create",
  "custom_credential_make_request",
  "custom_credential_set_token",
  "custom_credential_write_files",
  "deployment_execute_static_publish",
  "deployment_propose_custom_provider_credential",
  "external_mcp_reauth_prompt",
  "external_mcp_save",
  "backup_execute_restore",
  "database_execute_migrate_forward",
  "identity_policy_delete",
  "identity_role_delete",
  "identity_user_create",
  "media_trash_asset",
  "plugins_set_enabled",
  "plugins_uninstall",
  "redirects_tombstone",
  "site_backup_push",
  "source_control_execute_commit",
  "supabase_set_access_token",
  "supabase_set_project_scope",
  "taxonomy_execute_merge_term",
  "theme_trash_file",
  "trash_item",
  "webhooks_delete_subscription",
  "widgets_trash_instance",
];

test("SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently", () => {
  assert.deepEqual([...MCP_UI_REDEEMABLE_TOOL_IDS].sort(), [...EXPECTED_ALLOWLIST].sort());
});

test("SECURITY-CRITICAL: isMcpUiToolCallAllowed admits a tool id if and ONLY if it is on that set", () => {
  const probes = [
    // Real production tool ids that are not allowlisted, several of them destructive.
    "collections_execute_cleanup",
    "deployment_get_static_publish_capabilities",
    "deployment_generate_bucket_hosting_setup",
    "deployment_preview_static_publish",
    "source_control_execute_push",
    "identity_execute_delete_user",
    "assistant_demo_a2ui",
    "assistant_demo_image",
    "assistant_render_ui",
    // Near-misses of allowlisted ids. A prefix, suffix, substring, case-insensitive or
    // separator-normalizing match would admit at least one of these; exact `Set.has` admits none.
    "content_post_deleted",
    "content_post_delet",
    "not_content_post_delete",
    "CONTENT_POST_DELETE",
    "content-post-delete",
    "content_post_delete\n",
    "deployment_execute_static_publish_all",
    "source_control_execute_commit2",
    "assistant_demo_choices_admin",
    "external_mcp_reauth_prompts",
    "not_external_mcp_reauth_prompt",
    "EXTERNAL_MCP_REAUTH_PROMPT",
    "external_mcp_saved",
    "external_mcp_sav",
    "not_external_mcp_save",
    "EXTERNAL_MCP_SAVE",
    "external-mcp-save",
    // Shapes a caller controls that must never be treated as a match.
    "",
    " ",
    "*",
    "__proto__",
    "constructor",
    "toString",
  ];

  for (const probe of probes) {
    assert.equal(
      isMcpUiToolCallAllowed(probe),
      MCP_UI_REDEEMABLE_TOOL_IDS.has(probe),
      `isMcpUiToolCallAllowed disagreed with the allowlist for ${JSON.stringify(probe)}`,
    );
    assert.equal(isMcpUiToolCallAllowed(probe), false, `${JSON.stringify(probe)} must be refused`);
  }

  // And every id that IS on the list is still admitted — a check tightened to refuse everything
  // would break the feature just as surely as one widened to admit everything.
  for (const allowed of EXPECTED_ALLOWLIST) {
    assert.equal(isMcpUiToolCallAllowed(allowed), true, `${allowed} must be admitted`);
  }
});
