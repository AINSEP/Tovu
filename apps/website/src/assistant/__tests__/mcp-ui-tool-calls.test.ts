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
  assert.equal(isMcpUiToolCallAllowed("database_execute_migrate_forward"), false);
  assert.equal(isMcpUiToolCallAllowed("backup_execute_restore"), false);
  assert.equal(isMcpUiToolCallAllowed("collections_execute_cleanup"), false);
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

test("custom_credential_make_request is on the allowlist — its DELETE method holds up the same held-open-exchange shape content_post_delete does (2026-08-31)", () => {
  assert.equal(isMcpUiToolCallAllowed("custom_credential_make_request"), true);
  assert.ok(MCP_UI_REDEEMABLE_TOOL_IDS.has("custom_credential_make_request"));
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

/** Exactly what this endpoint will forward to. Adding an entry must be a deliberate edit HERE too. */
const EXPECTED_ALLOWLIST = [
  "assistant_ask_choice",
  "assistant_demo_choices",
  "content_post_delete",
  "content_post_search",
  "custom_credential_make_request",
  "custom_credential_set_token",
  "deployment_execute_static_publish",
  "deployment_propose_custom_provider_credential",
  "source_control_execute_commit",
];

test("SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently", () => {
  assert.deepEqual([...MCP_UI_REDEEMABLE_TOOL_IDS].sort(), [...EXPECTED_ALLOWLIST].sort());
});

test("SECURITY-CRITICAL: isMcpUiToolCallAllowed admits a tool id if and ONLY if it is on that set", () => {
  const probes = [
    // Real production tool ids that are not allowlisted, several of them destructive.
    "database_execute_migrate_forward",
    "backup_execute_restore",
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
