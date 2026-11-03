import type { TransformParams } from "@jini-ai/cms/media";

import { SHARE_LIMITS } from "@tovu/contracts/site-share-limits";
export { SHARE_LIMITS } from "@tovu/contracts/site-share-limits";

/** A version mismatch needs a new export from the source, never an update to the recipient. */
export const SHARE_VERSION_MISMATCH_MESSAGE = "This ZIP was made by a different Tovu version. Export the site again from an updated Tovu, then import the new ZIP.";
/** Private worker exit contract: distinguish schema refusal without exposing untrusted SQL/errors. */
export const IMPORT_SCHEMA_MISMATCH_EXIT_CODE = 2;
/** Private worker exit contract: exit 3 accompanies application-owned refusal.txt, never raw SQL errors. */
export const IMPORT_REFUSAL_EXIT_CODE = 3;

export const SHARE_TABLES = new Set([
  "workspaces", "posts", "presentation_settings", "menus", "nav_location_bindings",
  "content_types", "entries", "taxonomies", "terms", "entry_terms", "media",
  "media_slug_history", "asset_blobs", "asset_renditions", "transform_registry",
  "entry_refs", "widget_region_bindings", "form_definitions", "redirects", "member_tiers",
  "site_consent_revisions", "site_consent_heads",
]);

/** These obsolete/private tables can exist outside today's schema after an upgrade. */
export const SHARE_LEGACY_PRIVATE_TABLES = new Set([
  "site_assistant_credentials", "admin_execution_credentials", "media_provider_credentials",
  "custom_credential_sets", "publish_content_peers", "database_transfer_destinations",
  "vendor_credential_sets", "source_control_credential_sets", "publish_credential_sets",
  "principals", "identity_users", "sessions", "api_keys", "principal_roles", "principal_policies",
  "roles", "policies", "role_policies", "policy_permissions", "setting_values_user",
  "members", "member_sessions", "member_magic_tokens", "member_subscriptions", "member_consents",
  "member_revisions", "secrets_vault", "external_mcp_servers", "external_mcp_tool_approvals",
  "oauth_device_authorizations", "oauth_pending_authorizations", "agent_tool_attempts",
  "conversation_tool_approvals", "assistant_conversation_tool_approvals", "assistant_run_attempts", "assistant_run_attempt_events",
  "_plugin_identity", "_plugin_migrations", "_plugin_migration_journal",
]);

export class SiteShareRefusal extends Error {
  readonly code: string;
  constructor(required: { code: string; message: string }, _optional: Record<string, never> = {}) { super(required.message); this.code = required.code; this.name = "SiteShareRefusal"; }
}

/** Display an archive-controlled name in a refusal, never use this value for lookup.
 * Strip invisible controls before quoting, and bound each name to 120 UTF-16 units so a
 * hostile ZIP cannot flood or visually reorder a refusal. Pure; O(name.length) time/space.
 */
export function archiveRefusalName({ name }: { name: string }, _options = {}): string {
  const clean = name.replace(/[\p{Cc}\p{Cf}]/gu, "");
  if (clean.length <= 120) return clean;
  // Do not split an astral character at the truncation boundary.
  return clean.slice(0, 119).replace(/[\uD800-\uDBFF]$/, "") + "…";
}

/** Reject before allocating or uploading. No required content is silently skipped. O(n). */
export function checkShareLimits(required: { files: readonly { path: string; bytes: number }[]; totalBytes?: number }, _optional: Record<string, never> = {}): void {
  if (required.files.length > SHARE_LIMITS.maxFiles) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share exceeds the 2,000-file cap. Reduce the site or wait for streaming exports." });
  const total = required.files.reduce((sum, file) => sum + file.bytes, 0);
  if (Math.max(total, required.totalBytes ?? 0) > SHARE_LIMITS.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB expanded cap. Reduce the site or wait for streaming exports." });
  const large = required.files.find(file => file.path !== "database/content.db" && file.path !== "content.db" && file.bytes > SHARE_LIMITS.maxFileBytes);
  if (large) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: `Share file '${archiveRefusalName({ name: large.path })}' exceeds the 64 MiB ordinary-file cap.` });
}

/** Snapshot-owned metadata, never a read from mutable live media repositories. */
export interface ArchiveMediaSource {
  readonly id: string; readonly workspaceId: string; readonly slug: string;
  readonly originalFilename: string | null; readonly kind: string;
  readonly storageKey: string; readonly sha256: string;
  readonly documentOwned?: boolean;
  readonly public?: { readonly storageKey?: string; readonly sha256?: string; readonly version: number; readonly params: TransformParams };
}

export interface ShareDatabaseProjection {
  readonly credentialWarnings?: readonly import("./credential-warnings.js").CredentialWarning[];
  readonly notices?: readonly string[];
  readonly archiveMedia?: readonly ArchiveMediaSource[];
  readonly bytes: Buffer;
  readonly media: readonly { storageKey: string; sha256?: string; destinationStorageKey?: string }[];
  /** Original document policies travel separately from deduplicated blob references. */
  readonly documents?: readonly { storageKey: string; sha256: string; originalFilename: string }[];
}
export type ShareDatabaseSanitizer = (required: { snapshot: Buffer; omittedMediaIds?: readonly string[] }, optional?: { signal?: AbortSignal }) => Promise<ShareDatabaseProjection>;
