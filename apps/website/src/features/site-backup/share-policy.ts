/**
 * Why: a share is portable site content, including unpublished work, without the source's
 * identity or runtime state. Construct a NEW trusted database: deleting private rows from a
 * copied SQLite file leaves recoverable credentials in free pages. This policy is also the
 * import verifier's boundary; never broaden it from an archive's own schema or manifest.
 * Approved round17 deliberately buffered; v2 keeps those bounds while changing the archive contract.
 * Streaming remains a separate change.
 */
export const SHARE_LIMITS = {
  maxArchiveBytes: 300 * 1024 * 1024,
  maxExpandedBytes: 300 * 1024 * 1024,
  maxFiles: 2000,
  maxFileBytes: 64 * 1024 * 1024,
  maxManifestBytes: 2 * 1024 * 1024,
  maxPathSegments: 32,
} as const;

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

/** Reject before allocating or uploading. No required content is silently skipped. O(n). */
export function checkShareLimits(required: { files: readonly { path: string; bytes: number }[]; totalBytes?: number }, _optional: Record<string, never> = {}): void {
  if (required.files.length > SHARE_LIMITS.maxFiles) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share exceeds the 2,000-file cap. Reduce the site or wait for streaming exports." });
  const total = required.files.reduce((sum, file) => sum + file.bytes, 0);
  if (Math.max(total, required.totalBytes ?? 0) > SHARE_LIMITS.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Share exceeds the 300 MiB expanded cap. Reduce the site or wait for streaming exports." });
  const large = required.files.find(file => file.path !== "database/content.db" && file.path !== "content.db" && file.bytes > SHARE_LIMITS.maxFileBytes);
  if (large) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: `Share file '${large.path}' exceeds the 64 MiB ordinary-file cap.` });
}

export interface ShareDatabaseProjection {
  readonly archiveMedia?: readonly import("./archive-media.js").ArchiveMediaSource[];
  readonly bytes: Buffer;
  readonly media: readonly { storageKey: string; sha256?: string; destinationStorageKey?: string }[];
  /** Original document policies travel separately from deduplicated blob references. */
  readonly documents?: readonly { storageKey: string; sha256: string; originalFilename: string }[];
}
export type ShareDatabaseSanitizer = (required: { snapshot: Buffer }, optional?: { signal?: AbortSignal }) => Promise<ShareDatabaseProjection>;
