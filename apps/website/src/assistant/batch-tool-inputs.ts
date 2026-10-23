import { applyBatchInputs as applyCoreBatchInputs, defaultBatchableTools, ToolInputError, type ToolRegistration, type BatchableTool, type BatchOptOut } from '@jini-ai/core';
import { PERMANENT_DELETE_TOOLS } from '../contracts/headless/assistant-permanent-deletes-policy.js';
export { batchDescriptorFor, batchEligibilityFor, withBatchInput, DEFAULT_MAX_BATCH_ITEMS, type BatchableTool, type BatchOptOut, type BatchResult, type BatchItemResult } from '@jini-ai/core';

/** Cheap row-level writes the assistant repeats by the dozen (owner evidence, 2026-10-22: 145
 *  taxonomy_create_term, 83 redirects_tombstone, 51 taxonomy_assign_terms, 51
 *  seo_set_entry_overrides, 14 theme_trash_file single calls in one chat). */
const ROW_LEVEL_MAX_ITEMS = 100;

/** Explicit opt-ins for read tools whose alternative selectors leave no top-level required field.
 * MOVE: published Jini classifies these as list reads; settings alone cannot enable their wrapper.
 * Video previews can each return 8 MiB, so both expensive readers stay capped at eight items.
 */
export const BATCHABLE_TOOLS: readonly BatchableTool[] = [
  { toolId: "pages_read_html" },
  { toolId: "media_view_video", maxItems: 8 },
  { toolId: "web_screenshot_page", maxItems: 8 },
];

/** Per-tool batch settings over the default `{ toolId }` entry. Batching itself is default-on in
 *  Jini; this list only raises or lowers a cap or adds item defaults/validation. */
export const BATCH_TOOL_SETTINGS: readonly BatchableTool[] = [
  ...[
    "redirects_create", "redirects_update", "redirects_tombstone",
    "taxonomy_create_term", "taxonomy_rename_term", "taxonomy_assign_terms", "taxonomy_unassign_terms",
    "seo_set_entry_overrides", "theme_trash_file", "trash_item", "content_post_delete", "media_trash_asset",
    "widgets_trash_instance", "comments_trash_comment", "comments_approve_comment", "comments_mark_comment_spam",
  ].map(toolId => ({ toolId, maxItems: ROW_LEVEL_MAX_ITEMS })),
  { toolId: "theme_read_file", maxItems: 20 },
  { toolId: 'plugin_source_read', maxItems: 20 },
  // 10 pages x 8,000 characters keeps one result near what a single default fetch used to return.
  { toolId: "web_fetch_page", maxItems: 10, itemDefaults: { maxChars: 8_000 }, validateItem: ({ input }) => {
    if (typeof input === "object" && input !== null && "screenshot" in input && input.screenshot === true) {
      throw new ToolInputError({ message: "web_fetch_page: screenshot is unavailable in batch items; use a single render call with screenshot: true." });
    }
  } },
];

const ASKS = "asks a human per call; batched it would ask once per item";
const SINGLETON = "one site-wide setting or action; there is nothing per item to batch";

/** Tools kept single-call. Every other read-by-id or mutating tool takes `items` automatically
 *  (`batch-tool-inputs.test.ts` fails for a tool that is neither batched nor listed here). */
export const BATCH_OPT_OUT: readonly BatchOptOut[] = [
  // Leaves this site or acts on a live host.
  { toolId: "deployment_ops_deploy", reason: `deploys to a live host; ${ASKS}` },
  { toolId: "deployment_execute_static_publish", reason: `publishes the whole site to a live host; ${ASKS}` },
  { toolId: "deployment_ops_set_secret", reason: `replaces a live secret; ${ASKS}` },
  { toolId: "deployment_trigger_export", reason: "exports the whole site in one call" },
  { toolId: "deployment_set_dockerfile", reason: SINGLETON },
  { toolId: "publish_content_publish", reason: "already takes items and pushes them live in one call" },
  { toolId: "publish_content_execute_pull", reason: `overwrites local content from live; ${ASKS}` },
  { toolId: "source_control_execute_commit", reason: `pushes a commit to a git host; ${ASKS}` },
  { toolId: "newsletter_send_campaign", reason: `emails a whole list; ${ASKS}` },
  { toolId: "newsletter_schedule_campaign", reason: `schedules a list-wide email; ${ASKS}` },
  { toolId: "newsletter_resume_campaign", reason: `resumes a list-wide email; ${ASKS}` },
  { toolId: "mail_send_test", reason: `sends mail through the provider; ${ASKS}` },
  { toolId: "mail_remove_suppression", reason: `lets mail reach one address again, each with its own recorded reason; ${ASKS}` },
  { toolId: "consent_publish_settings", reason: `publishes consent settings live; ${ASKS}` },
  { toolId: "custom_credential_make_request", reason: `an outbound credentialed request whose DELETE ${ASKS}` },
  // Escalations, overwrites and permanent deletes that ask.
  { toolId: "mail_set_provider", reason: `changes the mail provider; ${ASKS}` },
  { toolId: "comments_set_provider", reason: `changes the comments provider; ${ASKS}` },
  { toolId: "consent_update_settings", reason: `site-wide consent draft; ${ASKS}` },
  { toolId: "plugins_set_enabled", reason: `enabling a plugin is an escalation that ${ASKS}` },
  { toolId: "settings_set_value", reason: `execution settings escalate and ${ASKS}` },
  { toolId: "settings_clear_value", reason: `execution settings escalate and ${ASKS}` },
  { toolId: "database_execute_migrate_forward", reason: `migrates the whole database; ${ASKS}` },
  { toolId: "database_transfer_run", reason: `overwrites the destination database; ${ASKS}` },
  { toolId: "backup_execute_restore", reason: `restores the whole site over current data; ${ASKS}` },
  { toolId: "theme_reset_file", reason: `overwrites current theme data; ${ASKS}` },
  { toolId: "change_sets_revert", reason: `overwrites current data; ${ASKS}` },
  { toolId: "taxonomy_execute_merge_term", reason: `permanently merges terms; ${ASKS}` },
  { toolId: "plugin_source_delete", reason: `permanently deletes plugin source; ${ASKS}` },
  // Batched through ONE combined confirmation plan in `tool-registrations.ts` instead.
  ...PERMANENT_DELETE_TOOLS.filter(tool => tool.id !== "trash_empty" && tool.id !== "deployment_ops_unset_secret")
    .map(tool => ({ toolId: tool.id, reason: "batched through one combined confirmation plan, not per-item asks" })),
  { toolId: "trash_empty", reason: "already empties the whole Trash in one call" },
  { toolId: "deployment_ops_unset_secret", reason: `removes a live secret; ${ASKS}` },
  // Server restart, site switch and whole-site actions.
  { toolId: "sites_switch_site", reason: "switches the active site; later calls run on the new site" },
  { toolId: "sites_create_site", reason: "creates and registers a whole site" },
  { toolId: "sites_duplicate_site", reason: "one call already copies a whole site" },
  { toolId: "preview_reload", reason: "reloads the preview server" },
  { toolId: "theme_rescan", reason: "rescans every theme in one call" },
  { toolId: "theme_set_active", reason: "only one theme can be active" },
  { toolId: "backup_create_restore_point", reason: "one restore point already covers the whole site" },
  { toolId: "site_import_backup", reason: "imports a whole site" },
  { toolId: "site_backup_push", reason: "pushes a whole-site backup plan" },
  { toolId: "site_share_create", reason: "one share already covers the whole site" },
  { toolId: "credential_copy_from_project", reason: "copies every matching credential in one call" },
  { toolId: "forms_pull_submissions", reason: "pulls every form's submissions in one call" },
  { toolId: "publish_content_connect", reason: SINGLETON },
  { toolId: "publish_content_disconnect", reason: SINGLETON },
  { toolId: "publish_content_plan_pull", reason: "plans one whole-site pull" },
  { toolId: "database_transfer_set_destination", reason: SINGLETON },
  { toolId: "comments_update_settings", reason: SINGLETON },
  { toolId: "seo_set_settings", reason: SINGLETON },
  { toolId: "seo_regenerate_sitemap", reason: SINGLETON },
  { toolId: "theme_update_preview_switcher", reason: SINGLETON },
  { toolId: "workspace_update", reason: SINGLETON },
  // Already take an array of targets, or an `items` field of their own.
  { toolId: "menus_create_menu", reason: "its own items field is the menu tree" },
  { toolId: "menus_update_menu_tree", reason: "its own items field is the menu tree" },
  { toolId: "redirects_import", reason: "already takes an array of rules" },
  { toolId: "custom_credential_write_files", reason: "already writes an array of files in one commit" },
  { toolId: "site_collect_page_evidence", reason: "already takes an array of paths" },
  { toolId: "assistant_render_ui", reason: "already renders an array of components as one surface" },
  // Interactive: each call waits for the person or a sign-in.
  { toolId: "assistant_ask_choice", reason: "interactive ask; blocks for the person's answer" },
  { toolId: "external_mcp_reauth_prompt", reason: "interactive notice; blocks until acknowledged" },
  { toolId: "credential_save", reason: "opens a secure credential card for the person" },
  { toolId: "identity_user_create", reason: "opens a dialog where the person types the new password" },
  { toolId: "agent_plugin_connect", reason: "interactive sign-in flow" },
  { toolId: "external_mcp_oauth_connect", reason: "interactive sign-in flow" },
  { toolId: "external_mcp_oauth_poll_device", reason: "polls one pending device sign-in" },
  { toolId: "deployment_ops_wait", reason: "waits on one deploy; a batch would chain long waits" },
];

/** Resolve default eligibility/settings plus {@link BATCHABLE_TOOLS}' explicit opt-ins.
 * @param required.registrations - The assembled registrations, before batch wrapping.
 * @returns Only tools present in the registration list, without mutating registrations.
 * @example resolveBatchableTools({ registrations });
 * @complexity O(r) time and space for r registrations; no I/O.
 */
export function resolveBatchableTools(
  { registrations }: { registrations: readonly ToolRegistration[] },
  _optional: Record<string, never> = {},
): BatchableTool[] {
  const toolsById = new Map(defaultBatchableTools({ registrations }, { optOut: BATCH_OPT_OUT, settings: BATCH_TOOL_SETTINGS })
    .map(tool => [tool.toolId, tool]));
  for (const tool of BATCHABLE_TOOLS) toolsById.set(tool.toolId, tool);
  return registrations.flatMap(registration => toolsById.get(registration.descriptor.id) ?? []);
}

/** Apply the shared batch wrapper; batching and per-item normalization belong to Jini.
 * Read batches reuse each scoped, authorized get handler. Merged cards route `items` to that
 * wrapper before deciding get/list, so an item without an id cannot turn into a list disclosure.
 * @param optional.tools - Explicit list replacing the default-on selection (tests, peer reads).
 */
export function applyBatchInputs(
  { registrations }: { registrations: readonly ToolRegistration[] },
  { tools }: { tools?: readonly BatchableTool[] } = {},
): ToolRegistration[] {
  return applyCoreBatchInputs({ registrations }, { tools: tools ?? resolveBatchableTools({ registrations }) });
}
