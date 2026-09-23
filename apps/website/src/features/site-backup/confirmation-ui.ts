import { buildConfirmationSurface as buildJiniConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { SiteBackupPlan } from "./plan-store.js";
import { formatByteSize, SITE_BACKUP_SCOPES } from "./sources.js";

/**
 * @file The confirmation dialog `site_backup_push` raises before anything is uploaded. Same
 * mechanism as `custom-credentials/write-files-confirmation-ui.ts`: a held-open exchange, and a
 * confirm/cancel pair carrying `SURFACE_EXCHANGE_ID_PARAM` back to the SAME tool call.
 *
 * What it must make impossible to miss: the target is a private repository, the folder there is
 * REPLACED as a whole, the database inside holds members, form submissions, admin accounts and the
 * (encrypted) credentials, and the commit cannot be undone from Tovu. It lists what is going in,
 * capped at {@link MAX_LISTED_FILES} lines so a large media library keeps the dialog bounded.
 */

export const SITE_BACKUP_PUSH_TOOL_ID = "site_backup_push";

/** Enough to review a typical site in full; a larger one ends in "…and N more". */
const MAX_LISTED_FILES = 200;

export function siteBackupPushConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/site-backup-push/${exchangeId}` as UIResourceUri;
}

/** Every file the backup writes, one `path (size)` line each, capped. The manifest is listed too:
 *  the human is agreeing to every path the folder will hold.
 *
 * @complexity O(min(files, MAX_LISTED_FILES)).
 */
function fileListing(plan: SiteBackupPlan): string {
  const lines = [
    "tovu-backup.json (manifest)",
    ...(plan.database ? [`database/content.db (${formatByteSize(plan.database.bytes.length)})`] : []),
    ...plan.files.map((file) => `${file.path} (${formatByteSize(file.bytes)})`),
  ];
  if (lines.length <= MAX_LISTED_FILES) return lines.join("\n");
  return [...lines.slice(0, MAX_LISTED_FILES), `…and ${lines.length - MAX_LISTED_FILES} more`].join("\n");
}

/** `database, themes, settings` — the scopes switched on, with anything left out named. */
function scopeSummary(plan: SiteBackupPlan): string {
  const included = SITE_BACKUP_SCOPES.filter((scope) => plan.include[scope]);
  const excluded = SITE_BACKUP_SCOPES.filter((scope) => !plan.include[scope]);
  return excluded.length === 0 ? included.join(", ") : `${included.join(", ")} (not included: ${excluded.join(", ")})`;
}

/**
 * Renders the dialog for one planned backup.
 *
 * @complexity O(min(files, MAX_LISTED_FILES)) for the listing, O(skipped) for the left-out row.
 */
export function buildConfirmationSurface(spec: { plan: SiteBackupPlan; exchangeId: string }): UIResource {
  const { plan, exchangeId } = spec;
  const repoName = `${plan.owner}/${plan.repo}`;
  const fileCount = plan.files.length + (plan.database ? 1 : 0);
  const notes = SITE_BACKUP_SCOPES.flatMap((scope) => (plan.scopeNotes[scope] ? [plan.scopeNotes[scope]] : []));

  const details = [
    { label: "Credential", value: plan.credentialLabel },
    { label: "Repository", value: `${repoName} (private)` },
    { label: "Branch", value: plan.repository.branch },
    { label: "Folder", value: plan.repository.folderExists ? `${plan.folder}/ (replaced: its current contents are removed)` : `${plan.folder}/ (created)` },
    { label: "Scopes", value: scopeSummary(plan) },
    { label: "Files", value: `${fileCount} files, ${formatByteSize(plan.totalBytes)}, plus the tovu-backup.json manifest` },
    { label: "Database", value: plan.database ? `${formatByteSize(plan.database.bytes.length)} snapshot` : "not included" },
    ...(plan.skipped.length > 0 ? [{ label: "Left out", value: plan.skipped.map((entry) => `${entry.path}: ${entry.reason}`).join("\n") }] : []),
    ...(notes.length > 0 ? [{ label: "Notes", value: notes.join("\n") }] : []),
    { label: "Contents", value: fileListing(plan) },
  ];

  const warning = [
    plan.database
      ? "The database in this backup holds your members, form submissions, admin accounts and saved credentials (encrypted with this site's Site Token)."
      : "The database is not included in this backup.",
    `The folder '${plan.folder}' in ${repoName} is replaced as a whole: files that are there now and not in this backup are removed from it. Nothing outside that folder changes.`,
    "This makes a real commit. Tovu cannot undo it.",
  ].join(" ");

  return buildJiniConfirmationSurface({
    uri: siteBackupPushConfirmationUri(exchangeId),
    title: `Back up this site to ${repoName}?`,
    description: `One commit on '${plan.repository.branch}' with this site's content, pushed with the saved credential '${plan.credentialLabel}'.`,
    details,
    warning,
    danger: true,
    confirm: { label: "Back up", toolName: SITE_BACKUP_PUSH_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } },
    cancel: { label: "Cancel", toolName: SITE_BACKUP_PUSH_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } },
    app: { appName: "tovu-site-backup-push", appVersion: "1" },
    preferredFrameSize: ["100%", "480px"],
  });
}
