import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";

/**
 * @file Regression coverage for the 2026-09-08 tool-keywords dispatch
 * (`ADS-memory/reports/2026-09-08-tool-keywords.md`): 22 tool ids had NO `TOOL_SEARCH_KEYWORDS`
 * entry at all, which — per this file's own header — means each was indexed on its raw
 * `description` alone and could silently fail to rank for a plainly-phrased operator request even
 * though the tool exists and works. Pins that every one of the 22 now has a non-empty entry, and
 * that `sites_duplicate_site` (the duplicate tool whose missing "duplicate" keyword was the direct
 * cause of a real production miss — "copy Landing sample" found nothing) carries the required
 * copy/duplicate/clone vocabulary.
 */

const PREVIOUSLY_MISSING_TOOL_IDS = [
  "backup_execute_restore",
  "collections_execute_cleanup",
  "collections_plan_cleanup",
  "custom_credential_set_username",
  "custom_credential_set_token",
  "custom_credential_create",
  "database_execute_migrate_forward",
  "database_get_restore_guidance",
  "external_mcp_list",
  "external_mcp_save",
  "external_mcp_test_connection",
  "external_mcp_oauth_connect",
  "external_mcp_oauth_poll_device",
  "redirects_import",
  "settings_clear",
  "settings_register_definitions",
  "settings_reset",
  "settings_set",
  "sites_duplicate_site",
  "taxonomy_execute_merge_term",
  "workspace_create",
  "workspace_delete",
] as const;

test("every one of the 22 previously-missing tool ids now has a non-empty TOOL_SEARCH_KEYWORDS entry", () => {
  for (const toolId of PREVIOUSLY_MISSING_TOOL_IDS) {
    const keywords = TOOL_SEARCH_KEYWORDS[toolId];
    assert.ok(keywords, `expected ${toolId} to have a TOOL_SEARCH_KEYWORDS entry`);
    assert.ok(keywords!.trim().length > 0, `expected ${toolId}'s entry to be non-empty`);
  }
});

test("sites_duplicate_site carries the duplicate/copy vocabulary from the production miss it closes", () => {
  const keywords = TOOL_SEARCH_KEYWORDS["sites_duplicate_site"];
  assert.ok(keywords, "expected sites_duplicate_site to have a TOOL_SEARCH_KEYWORDS entry");
  assert.match(keywords!, /\bcopy\b/);
  assert.match(keywords!, /\bduplicate\b/);
  assert.match(keywords!, /\bclone\b/);
});
