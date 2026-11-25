/**
 * @file The storage domain's agent-tool catalog (ST-15c): `site_storage_report` (read-only) and
 * `site_storage_cleanup` (a dry run unless `dryRun: false`, and then only after the owner's card).
 * Wiring lives in `tool-registrations.ts`.
 */

export const STORAGE_REPORT_TOOL_ID = "site_storage_report";
export const STORAGE_CLEANUP_TOOL_ID = "site_storage_cleanup";
export const STORAGE_TOOL_PERMISSION = "storage.manage";

/** This domain's fixed catalog. @complexity O(1). */
export const storageAgentToolCatalog = [{
  name: STORAGE_REPORT_TOOL_ID,
  description: "Shows how much disk this site uses, by category (databases, uploads, themes, screenshots, shares, old copies, logs, temporary files) and by class (cleaned automatically, yours, shown only), plus the last cleanup pass. Never shows file paths. Read-only. Site owner only.",
  sideEffects: "none" as const,
  authorization: { permission: STORAGE_TOOL_PERMISSION },
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
}, {
  name: STORAGE_CLEANUP_TOOL_ID,
  description: "Cleans up storage the site may remove by itself: expired share files, old pre-migration copies beyond the newest five, and leftover temporary folders. By default (dryRun omitted or true) it only reports what a cleanup would free and deletes nothing. With dryRun: false it first shows the site owner a card listing what will be removed and how many bytes, and removes nothing unless they approve (approval is never remembered). Never touches chats, revisions, screenshots or media; naming them is refused. Returns {cleaned, dryRun, pass}. Site owner only.",
  sideEffects: "mutates-durable-state" as const,
  authorization: { permission: STORAGE_TOOL_PERMISSION },
  inputSchema: { type: "object", additionalProperties: false, properties: {
    dryRun: { type: "boolean", description: "Omit or true to only report what would be freed; false to clean up after the owner approves." },
    classes: { type: "array", items: { type: "string", enum: ["cache", "derived", "old-copy"] }, description: "Optional kinds of storage to include; content kinds are refused." },
  } },
}];
