/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Produced from `src/platform/db/schema.sqlite.ts` by `development/scripts/generate-postgres-schema.ts`.
 * Edit the SQLite schema and regenerate; editing this file directly will be overwritten and will
 * fail the drift check in CI.
 *
 * FTS5 search objects are absent on purpose — they are raw-SQL virtual tables, not `sqliteTable`
 * declarations, and PostgreSQL's tsvector/GIN equivalent is hand-authored. See the generator's
 * module doc.
 *
 * Tables: 77
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, check, customType, foreignKey, index, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

/** Native jsonb column exposed as the same serialised `string` the SQLite schema stores. */
const jsonText = customType<{ data: string; driverData: unknown }>({
  dataType: () => "jsonb",
  toDriver: (value) => value,
  fromDriver: (value) => (typeof value === "string" ? value : JSON.stringify(value)),
});

export const agentToolAttempts = pgTable("agent_tool_attempts", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  attemptId: text("attempt_id").notNull(),
  executionId: text("execution_id"),
  workspaceId: text("workspace_id").notNull(),
  runId: text("run_id").notNull(),
  toolId: text("tool_id").notNull(),
  principalId: text("principal_id").notNull(),
  phase: text("phase").notNull(),
  at: text("at").notNull(),
  detail: text("detail"),
}, (t) => [
    index("idx_agent_tool_attempts_workspace_list").on(t.workspaceId, t.id),
    index("idx_agent_tool_attempts_attempt").on(t.workspaceId, t.attemptId),
  ]);

export const analyticsEvents = pgTable("analytics_events", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  occurredAt: text("occurred_at").notNull(),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  referrerHost: text("referrer_host"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmTerm: text("utm_term"),
  utmContent: text("utm_content"),
  country: text("country"),
  region: text("region"),
  deviceClass: text("device_class").notNull(),
  browserFamily: text("browser_family"),
  osFamily: text("os_family"),
  visitorHash: text("visitor_hash").notNull(),
  sessionId: text("session_id").notNull(),
  eventName: text("event_name"),
  eventPropsJson: jsonText("event_props_json"),
}, (t) => [
    index("idx_analytics_events_workspace_list").on(t.workspaceId, t.id),
  ]);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  principalId: text("principal_id").notNull(),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  issuedPolicyId: text("issued_policy_id"),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),
  revokedAt: text("revoked_at"),
}, (t) => [
    uniqueIndex("idx_api_keys_workspace_prefix").on(t.workspaceId, t.prefix),
    index("idx_api_keys_workspace_principal").on(t.workspaceId, t.principalId),
  ]);

export const assetBlobs = pgTable("asset_blobs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  createdByPrincipal: text("created_by_principal").notNull(),
  createdAt: text("created_at").notNull(),
  status: text("status").notNull(),
  tombstonedAt: text("tombstoned_at"),
  documentOwned: boolean("document_owned").notNull().default(false),
  contentType: text("content_type"),
}, (t) => [
    uniqueIndex("idx_asset_blobs_workspace_sha256").on(t.workspaceId, t.sha256),
  ]);

export const assetRenditions = pgTable("asset_renditions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  assetId: text("asset_id").notNull(),
  transformName: text("transform_name").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
    index("idx_asset_renditions_asset").on(t.workspaceId, t.assetId),
    uniqueIndex("idx_asset_renditions_lookup").on(t.workspaceId, t.assetId, t.transformName, t.version),
  ]);

export const changeSetItems = pgTable("change_set_items", {
  id: text("id").primaryKey(),
  changeSetId: text("change_set_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation").notNull(),
  beforeRevisionId: text("before_revision_id"),
  afterRevisionId: text("after_revision_id"),
  inversePayloadJson: jsonText("inverse_payload_json"),
  entityVersionAtApply: bigint("entity_version_at_apply", { mode: "number" }),
  position: bigint("position", { mode: "number" }).notNull(),
}, (t) => [
    index("idx_change_set_items_change_set").on(t.changeSetId, t.position),
  ]);

export const changeSets = pgTable("change_sets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actorId: text("actor_id"),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  idempotencyKey: text("idempotency_key"),
  intentRef: text("intent_ref"),
  createdAt: text("created_at").notNull(),
  appliedAt: text("applied_at"),
  revertedAt: text("reverted_at"),
}, (t) => [
    index("idx_change_sets_workspace").on(t.workspaceId, t.createdAt),
    uniqueIndex("idx_change_sets_idempotency").on(t.workspaceId, t.idempotencyKey),
  ]);

export const contentTypeRevisions = pgTable("content_type_revisions", {
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  contentTypeKey: text("content_type_key").notNull(),
  workspaceId: text("workspace_id").notNull(),
  op: text("op").notNull(),
  stateJson: jsonText("state_json").notNull(),
  actorId: text("actor_id").notNull(),
  principalKind: text("principal_kind"),
  delegatedByWorkspaceId: text("delegated_by_workspace_id"),
  delegatedById: text("delegated_by_id"),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [
    index("idx_content_type_revisions_workspace_key").on(t.workspaceId, t.contentTypeKey, t.seq),
  ]);

export const contentTypes = pgTable("content_types", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  fieldsJson: jsonText("fields_json").notNull(),
  status: text("status").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  tombstonedAt: text("tombstoned_at"),
}, (t) => [
    uniqueIndex("content_types_workspace_key_unique").on(t.workspaceId, t.key),
    index("idx_content_types_workspace").on(t.workspaceId),
  ]);

export const databaseWriteWatermark = pgTable("database_write_watermark", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  lastStampedAt: text("last_stamped_at"),
});

export const entries = pgTable("entries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  type: text("type").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  bodyJson: jsonText("body_json"),
  fieldsJson: jsonText("fields_json").notNull(),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  deletedAt: text("deleted_at"),
}, (t) => [
    uniqueIndex("entries_workspace_type_slug_unique").on(t.workspaceId, t.type, t.slug),
    index("idx_entries_workspace").on(t.workspaceId, t.type),
  ]);

export const entryRefs = pgTable("entry_refs", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  sourceEntryId: text("source_entry_id").notNull(),
  sourceKind: text("source_kind").notNull(),
  fieldPath: text("field_path").notNull(),
  targetKind: text("target_kind").notNull(),
  targetId: text("target_id").notNull(),
}, (t) => [
    index("idx_entry_refs_source").on(t.workspaceId, t.sourceEntryId),
    index("idx_entry_refs_target").on(t.workspaceId, t.targetKind, t.targetId),
  ]);

export const entryRevisions = pgTable("entry_revisions", {
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  entryId: text("entry_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  op: text("op").notNull(),
  stateJson: jsonText("state_json").notNull(),
  actorId: text("actor_id").notNull(),
  delegatedByWorkspaceId: text("delegated_by_workspace_id"),
  delegatedById: text("delegated_by_id"),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [
    index("idx_entry_revisions_workspace_entry").on(t.workspaceId, t.entryId, t.seq),
  ]);

export const entryTerms = pgTable("entry_terms", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  contentType: text("content_type").notNull(),
  contentId: text("content_id").notNull(),
  termId: text("term_id").notNull(),
  addedAt: text("added_at").notNull(),
}, (t) => [
    uniqueIndex("entry_terms_unique").on(t.workspaceId, t.contentType, t.contentId, t.termId),
  ]);

export const externalMcpServers = pgTable("external_mcp_servers", {
  workspaceId: text("workspace_id").notNull(),
  serverId: text("server_id").notNull(),
  label: text("label"),
  provisionedByPluginId: text("provisioned_by_plugin_id"),
  transport: text("transport").notNull(),
  authMode: text("auth_mode").notNull().default("static_env"),
  enabled: boolean("enabled").notNull(),
  command: text("command"),
  url: text("url"),
  args: jsonText("args"),
  allowedToolNames: jsonText("allowed_tool_names"),
  writeAllowedToolNames: jsonText("write_allowed_tool_names"),
  writeGrantsUpdatedByPrincipalId: text("write_grants_updated_by_principal_id"),
  writeGrantsUpdatedAt: text("write_grants_updated_at"),
  envNames: jsonText("env_names"),
  envSecretId: text("env_secret_id"),
  oauthSecretId: text("oauth_secret_id"),
  oauthProviderId: text("oauth_provider_id"),
  oauthGrant: text("oauth_grant"),
  oauthClientId: text("oauth_client_id"),
  oauthEndpointsJson: jsonText("oauth_endpoints_json"),
  oauthScopesJson: jsonText("oauth_scopes_json"),
  oauthStatus: text("oauth_status"),
  oauthExpiresAt: text("oauth_expires_at"),
  oauthTokenEnvName: text("oauth_token_env_name"),
  oauthRefreshLeaseUntil: text("oauth_refresh_lease_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.serverId] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    foreignKey({ name: "external_mcp_env_secret_fk", columns: [t.workspaceId, t.envSecretId], foreignColumns: [secretsVault.workspaceId, secretsVault.id] }).onDelete("restrict"),
    foreignKey({ name: "external_mcp_oauth_secret_fk", columns: [t.workspaceId, t.oauthSecretId], foreignColumns: [secretsVault.workspaceId, secretsVault.id] }).onDelete("restrict"),
  ]);

export const externalMcpToolApprovals = pgTable("external_mcp_tool_approvals", {
  workspaceId: text("workspace_id").notNull(),
  serverId: text("server_id").notNull(),
  toolName: text("tool_name").notNull(),
  fingerprint: text("fingerprint").notNull(),
  grantedByPrincipalId: text("granted_by_principal_id").notNull(),
  grantedAt: text("granted_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.serverId, t.toolName] }),
    foreignKey({ name: "external_mcp_tool_approvals_workspace_id_server_id_ext_37c98be6", columns: [t.workspaceId, t.serverId], foreignColumns: [externalMcpServers.workspaceId, externalMcpServers.serverId] }).onDelete("cascade"),
  ]);

export const formDefinitions = pgTable("form_definitions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  fieldsJson: jsonText("fields_json").notNull(),
  notifyJson: jsonText("notify_json").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  version: bigint("version", { mode: "number" }).notNull().default(1),
}, (t) => [
    uniqueIndex("form_definitions_workspace_slug_unique").on(t.workspaceId, t.slug),
    index("idx_form_definitions_workspace").on(t.workspaceId),
  ]);

export const formDeliveryJobs = pgTable("form_delivery_jobs", {
  jobId: text("job_id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  submissionId: text("submission_id").notNull(),
  bindingId: text("binding_id").notNull(),
  adapterId: text("adapter_id").notNull(),
}, (t) => [
    uniqueIndex("ux_form_delivery_jobs_binding").on(t.workspaceId, t.submissionId, t.bindingId),
  ]);

export const formDeliveryPlans = pgTable("form_delivery_plans", {
  workspaceId: text("workspace_id").notNull(),
  submissionId: text("submission_id").notNull(),
  formId: text("form_id").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.submissionId] }),
  ]);

export const formReceiverPulls = pgTable("form_receiver_pulls", {
  workspaceId: text("workspace_id").notNull(),
  receiverKey: text("receiver_key").notNull(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"),
  lastStartedAt: text("last_started_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.receiverKey] }),
  ]);

export const formSubmissionRemoteReceipts = pgTable("form_submission_remote_receipts", {
  workspaceId: text("workspace_id").notNull(),
  destinationKey: text("destination_key").notNull(),
  remoteId: text("remote_id").notNull(),
  submissionId: text("submission_id").notNull(),
  importedAt: text("imported_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.destinationKey, t.remoteId] }),
  ]);

export const formSubmissions = pgTable("form_submissions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  formDefinitionId: text("form_definition_id").notNull(),
  dataJson: jsonText("data_json").notNull(),
  sourceIp: text("source_ip"),
  submittedAt: text("submitted_at").notNull(),
  deletedAt: text("deleted_at"),
  version: bigint("version", { mode: "number" }).notNull().default(1),
}, (t) => [
    foreignKey({ columns: [t.formDefinitionId], foreignColumns: [formDefinitions.id] }).onDelete("restrict"),
    index("idx_form_submissions_definition").on(t.formDefinitionId, t.submittedAt),
    index("idx_form_submissions_workspace").on(t.workspaceId),
    index("idx_form_submissions_ip_retention").on(t.submittedAt, t.id).where(sql`source_ip IS NOT NULL`),
  ]);

export const gatedMutationTokens = pgTable("gated_mutation_tokens", {
  confirmationToken: text("confirmation_token").primaryKey(),
  planHash: text("plan_hash").notNull(),
  scopeId: text("scope_id").notNull(),
  confirmerPrincipalId: text("confirmer_principal_id").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const identityUsers = pgTable("identity_users", {
  principalId: text("principal_id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  username: text("username").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  lastLoginAt: text("last_login_at"),
}, (t) => [
    uniqueIndex("idx_identity_users_workspace_username").on(t.workspaceId, t.username),
  ]);

export const media = pgTable("media", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  createdBy: text("created_by"),
  kind: text("kind").notNull().default("media"),
  originalFilename: text("original_filename"),
  title: text("title").notNull(),
  slug: text("slug"),
  alt: text("alt").notNull(),
  caption: text("caption").notNull(),
  credit: text("credit").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  width: bigint("width", { mode: "number" }),
  height: bigint("height", { mode: "number" }),
  cssClass: text("css_class"),
  htmlAttributes: text("html_attributes"),
}, (t) => [
    check("media_kind_check", sql`kind IN ('media', 'document')`),
    uniqueIndex("idx_media_workspace_slug").on(t.workspaceId, t.slug),
  ]);

export const mediaSlugHistory = pgTable("media_slug_history", {
  workspaceId: text("workspace_id").notNull(),
  slug: text("slug").notNull(),
  mediaId: text("media_id").notNull(),
  retiredAt: text("retired_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.slug] }),
    index("idx_media_slug_history_media_id").on(t.workspaceId, t.mediaId),
  ]);

export const memberConsents = pgTable("member_consents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull(),
  evidenceJson: jsonText("evidence_json").notNull(),
  grantedAt: text("granted_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    uniqueIndex("member_consents_workspace_member_purpose_unique").on(t.workspaceId, t.memberId, t.purpose),
  ]);

export const memberMagicTokens = pgTable("member_magic_tokens", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  email: text("email"),
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
}, (t) => [
    uniqueIndex("member_magic_tokens_workspace_tokenhash_unique").on(t.workspaceId, t.tokenHash),
  ]);

export const memberRevisions = pgTable("member_revisions", {
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  entityKind: text("entity_kind").notNull(),
  entityId: text("entity_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  purpose: text("purpose"),
  op: text("op").notNull(),
  beforeJson: jsonText("before_json"),
  afterJson: jsonText("after_json"),
  originModule: text("origin_module"),
  createdAt: text("created_at").notNull(),
}, (t) => [
    index("idx_member_revisions_workspace_member").on(t.workspaceId, t.memberId),
  ]);

export const memberSessions = pgTable("member_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  lastSeenAt: text("last_seen_at"),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (t) => [
    uniqueIndex("member_sessions_workspace_tokenhash_unique").on(t.workspaceId, t.tokenHash),
    index("idx_member_sessions_workspace_member").on(t.workspaceId, t.memberId),
  ]);

export const memberSubscriptions = pgTable("member_subscriptions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  tierId: text("tier_id").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  externalRef: text("external_ref"),
  startedAt: text("started_at").notNull(),
  currentPeriodEnd: text("current_period_end"),
  canceledAt: text("canceled_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    index("idx_member_subscriptions_workspace_member").on(t.workspaceId, t.memberId),
  ]);

export const memberTiers = pgTable("member_tiers", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  description: text("description"),
  welcomePagePath: text("welcome_page_path"),
  visibleInPortal: bigint("visible_in_portal", { mode: "number" }).notNull().default(0),
  monthlyPriceCents: bigint("monthly_price_cents", { mode: "number" }),
  yearlyPriceCents: bigint("yearly_price_cents", { mode: "number" }),
  currency: text("currency"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    uniqueIndex("member_tiers_workspace_slug_unique").on(t.workspaceId, t.slug),
    uniqueIndex("member_tiers_workspace_id_unique").on(t.workspaceId, t.id),
  ]);

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  emailVerifiedAt: text("email_verified_at"),
  credentialsRevokedAt: text("credentials_revoked_at"),
  status: text("status").notNull(),
  note: text("note"),
  fieldsJson: jsonText("fields_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    uniqueIndex("members_workspace_email_unique").on(t.workspaceId, t.email),
  ]);

export const menus = pgTable("menus", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  docJson: jsonText("doc_json").notNull(),
  locationsJson: jsonText("locations_json").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    uniqueIndex("menus_workspace_slug_unique").on(t.workspaceId, t.slug),
    index("idx_menus_workspace").on(t.workspaceId),
  ]);

export const navLocationBindings = pgTable("nav_location_bindings", {
  workspaceId: text("workspace_id").notNull(),
  locationKey: text("location_key").notNull(),
  menuId: text("menu_id").notNull(),
  boundAt: text("bound_at").notNull(),
}, (t) => [
    uniqueIndex("nav_location_bindings_workspace_location_unique").on(t.workspaceId, t.locationKey),
    index("idx_nav_location_bindings_menu").on(t.workspaceId, t.menuId),
  ]);

export const newsletterCampaignRevisions = pgTable("newsletter_campaign_revisions", {
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  campaignId: text("campaign_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  stateJson: jsonText("state_json").notNull(),
  actorId: text("actor_id").notNull(),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [
    index("idx_newsletter_campaign_revisions_campaign").on(t.campaignId, t.seq),
  ]);

export const newsletterCampaigns = pgTable("newsletter_campaigns", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  status: text("status").notNull(),
  subject: text("subject").notNull(),
  preheader: text("preheader"),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  replyTo: text("reply_to").notNull(),
  listId: text("list_id").notNull(),
  scheduledAt: text("scheduled_at"),
  sendStartedAt: text("send_started_at"),
  audienceSnapshotId: text("audience_snapshot_id"),
  countersJson: jsonText("counters_json").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  createdByPrincipal: text("created_by_principal").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    index("idx_newsletter_campaigns_workspace").on(t.workspaceId),
  ]);

export const oauthDeviceAuthorizations = pgTable("oauth_device_authorizations", {
  workspaceId: text("workspace_id").notNull(),
  serverId: text("server_id").notNull(),
  userCode: text("user_code").notNull(),
  verificationUri: text("verification_uri").notNull(),
  verificationUriComplete: text("verification_uri_complete"),
  intervalSeconds: bigint("interval_seconds", { mode: "number" }).notNull(),
  expiresAt: text("expires_at").notNull(),
  sealedKeyId: text("sealed_key_id").notNull(),
  sealedCiphertext: text("sealed_ciphertext").notNull(),
  sealedNonce: text("sealed_nonce").notNull(),
  sealedAlg: text("sealed_alg").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.serverId] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
  ]);

export const originSettings = pgTable("origin_settings", {
  workspaceId: text("workspace_id").primaryKey(),
  scheme: text("scheme").notNull(),
  host: text("host").notNull(),
  port: bigint("port", { mode: "number" }),
  basePath: text("base_path"),
  verifiedAt: text("verified_at").notNull(),
  source: text("source").notNull(),
  redirectAllowlistJson: jsonText("redirect_allowlist_json").notNull().default("[]"),
  egressAllowlistJson: jsonText("egress_allowlist_json").notNull().default("[]"),
});

export const outboxEvents = pgTable("outbox_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  eventJson: jsonText("event_json").notNull(),
  status: text("status").notNull(),
  attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
  nextAttemptAt: text("next_attempt_at").notNull(),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
}, (t) => [
    index("idx_outbox_events_claim").on(t.status, t.nextAttemptAt),
  ]);

export const pluginActivations = pgTable("plugin_activations", {
  workspaceId: text("workspace_id").notNull(),
  pluginId: text("plugin_id").notNull(),
  version: text("version").notNull(),
  enabled: boolean("enabled").notNull(),
  updatedAt: text("updated_at").notNull(),
  quarantinedAt: text("quarantined_at"),
  quarantineReason: text("quarantine_reason"),
  quarantineFailureCount: bigint("quarantine_failure_count", { mode: "number" }),
}, (t) => [
    uniqueIndex("pk_plugin_activations").on(t.workspaceId, t.pluginId),
  ]);

export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isBuiltin: bigint("is_builtin", { mode: "number" }).notNull(),
  isFrozen: bigint("is_frozen", { mode: "number" }).notNull(),
}, (t) => [
    uniqueIndex("idx_policies_workspace_name").on(t.workspaceId, t.name),
  ]);

export const policyPermissions = pgTable("policy_permissions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  policyId: text("policy_id").notNull(),
  permission: text("permission").notNull(),
  resourceType: text("resource_type"),
  constraintJson: jsonText("constraint_json"),
}, (t) => [
    index("idx_policy_permissions_workspace_policy").on(t.workspaceId, t.policyId),
  ]);

export const postRevisions = pgTable("post_revisions", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  op: text("op").notNull(),
  stateJson: jsonText("state_json").notNull(),
  contentHash: text("content_hash").notNull(),
  actorId: text("actor_id").notNull(),
  delegatedByWorkspaceId: text("delegated_by_workspace_id"),
  delegatedById: text("delegated_by_id"),
  restoredFrom: text("restored_from"),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [
    index("idx_post_revisions_workspace_post").on(t.workspaceId, t.postId, t.seq),
  ]);

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  bodyJson: jsonText("body_json"),
  status: text("status").notNull(),
  kind: text("kind").notNull().default("post"),
  bodyFormat: text("body_format").notNull().default("doc"),
  bodyHtml: text("body_html"),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  seoExtJson: jsonText("seo_ext_json"),
  ext: jsonText("ext").notNull().default("{}"),
  deletedAt: text("deleted_at"),
  templateChoice: text("template_choice"),
  overridesThemePage: boolean("overrides_theme_page"),
  memberAccessJson: jsonText("member_access_json"),
  autosaveJson: jsonText("autosave_json"),
  createdByPrincipalId: text("created_by_principal_id"),
  createdAt: text("created_at"),
  publishAt: text("publish_at"),
  featuredMediaId: text("featured_media_id"),
  author: text("author"),
  showAuthor: boolean("show_author").notNull().default(false),
}, (t) => [
    check("posts_body_format_shape", sql`(body_format = 'doc' AND body_json IS NOT NULL AND body_html IS NULL) OR (body_format = 'html' AND body_html IS NOT NULL AND body_json IS NULL)`),
    uniqueIndex("posts_workspace_slug_unique").on(t.workspaceId, t.slug),
    index("idx_posts_workspace").on(t.workspaceId),
  ]);

export const presentationSettings = pgTable("presentation_settings", {
  workspaceId: text("workspace_id").primaryKey(),
  activeThemeId: text("active_theme_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const principalPolicies = pgTable("principal_policies", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  principalId: text("principal_id").notNull(),
  policyId: text("policy_id").notNull(),
}, (t) => [
    index("idx_principal_policies_workspace_principal").on(t.workspaceId, t.principalId),
  ]);

export const principalRoles = pgTable("principal_roles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  principalId: text("principal_id").notNull(),
  roleId: text("role_id").notNull(),
}, (t) => [
    index("idx_principal_roles_workspace_principal").on(t.workspaceId, t.principalId),
  ]);

export const principals = pgTable("principals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  kind: text("kind").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull(),
  disabledAt: text("disabled_at"),
  createdAt: text("created_at").notNull(),
});

export const publishBackstopLog = pgTable("publish_backstop_log", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  direction: text("direction").notNull(),
  actorId: text("actor_id").notNull(),
  destination: text("destination").notNull(),
  reason: text("reason").notNull(),
  at: text("at").notNull(),
  itemsJson: jsonText("items_json").notNull(),
  gapLabelsJson: jsonText("gap_labels_json").notNull(),
  result: text("result").notNull(),
  runId: text("run_id"),
  detailsJson: jsonText("details_json").notNull(),
  inversesJson: jsonText("inverses_json").notNull(),
}, (t) => [
    check("publish_backstop_log_direction_check", sql`direction IN ('source','destination')`),
    index("publish_backstop_log_workspace_at").on(t.workspaceId, t.at),
    index("publish_backstop_log_run").on(t.workspaceId, t.runId),
  ]);

export const publishContentBaselines = pgTable("publish_content_baselines", {
  workspaceId: text("workspace_id").notNull(),
  peerPrincipalId: text("peer_principal_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  hashAtLastSync: text("hash_at_last_sync").notNull(),
  hashVersion: bigint("hash_version", { mode: "number" }).notNull(),
  syncedAt: text("synced_at").notNull(),
  runId: text("run_id").notNull(),
}, (t) => [
    uniqueIndex("publish_content_baselines_unique").on(t.workspaceId, t.peerPrincipalId, t.entityType, t.entityId),
  ]);

export const publishContentBundles = pgTable("publish_content_bundles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  sourcePrincipalId: text("source_principal_id").notNull(),
  artifactFormatVersion: bigint("artifact_format_version", { mode: "number" }).notNull().default(1),
  hashVersion: bigint("hash_version", { mode: "number" }).notNull(),
  entitiesJson: jsonText("entities_json").notNull(),
  blobManifestJson: jsonText("blob_manifest_json").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  receivedAt: text("received_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (t) => [
    index("idx_publish_content_bundles_workspace").on(t.workspaceId, t.expiresAt),
  ]);

export const publishContentRuns = pgTable("publish_content_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  direction: text("direction").notNull(),
  peerPrincipalId: text("peer_principal_id").notNull(),
  peerLabel: text("peer_label"),
  phase: text("phase").notNull(),
  restorePointId: text("restore_point_id"),
  changeSetIdsJson: jsonText("change_set_ids_json"),
  actorId: text("actor_id").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  reportJson: jsonText("report_json"),
  itemsJson: jsonText("items_json"),
}, (t) => [
    index("idx_publish_content_runs_workspace").on(t.workspaceId, t.startedAt),
  ]);

export const publishHistory = pgTable("publish_history", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  target: text("target").notNull(),
  url: text("url").notNull(),
  reachable: boolean("reachable").notNull(),
  status: text("status").notNull(),
  projectName: text("project_name").notNull(),
  credentialId: text("credential_id"),
  configFieldsJson: jsonText("config_fields_json"),
  kind: text("kind").default("static"),
  publishedAt: text("published_at").notNull(),
  owner: text("owner"),
  repo: text("repo"),
  basePath: text("base_path"),
  deploymentId: text("deployment_id"),
  commitSha: text("commit_sha"),
  branch: text("branch"),
  triggeredBy: text("triggered_by").notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    index("idx_publish_history_workspace_id").on(t.workspaceId, t.id),
    index("idx_publish_history_workspace_target_id").on(t.workspaceId, t.target, t.id),
  ]);

export const publishTrustRevocations = pgTable("publish_trust_revocations", {
  sourceInstallationId: text("source_installation_id").primaryKey(),
  revokedAt: text("revoked_at").notNull(),
  note: text("note"),
});

export const redirectHits = pgTable("redirect_hits", {
  redirectId: text("redirect_id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  hitCount: bigint("hit_count", { mode: "number" }).notNull().default(0),
  lastHitAt: text("last_hit_at"),
});

export const redirectRevisions = pgTable("redirect_revisions", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  redirectId: text("redirect_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  stateJson: jsonText("state_json").notNull(),
  tombstoned: bigint("tombstoned", { mode: "number" }).notNull(),
  actorId: text("actor_id").notNull(),
  pluginId: text("plugin_id"),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [
    uniqueIndex("idx_redirect_revisions_redirect_seq").on(t.redirectId, t.seq),
  ]);

export const redirects = pgTable("redirects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  matchType: text("match_type").notNull(),
  fromPattern: text("from_pattern").notNull(),
  toTarget: text("to_target").notNull(),
  statusCode: bigint("status_code", { mode: "number" }).notNull(),
  status: text("status").notNull(),
  override: bigint("override", { mode: "number" }).notNull(),
  priority: bigint("priority", { mode: "number" }).notNull(),
  source: text("source").notNull(),
  sourceEntryId: text("source_entry_id"),
  fromPathAtCapture: text("from_path_at_capture"),
  toPathAtCapture: text("to_path_at_capture"),
  createdByPrincipal: text("created_by_principal").notNull(),
  createdByPluginId: text("created_by_plugin_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    index("idx_redirects_workspace_frompattern").on(t.workspaceId, t.fromPattern),
    index("idx_redirects_workspace_status").on(t.workspaceId, t.status),
  ]);

export const rolePolicies = pgTable("role_policies", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  roleId: text("role_id").notNull(),
  policyId: text("policy_id").notNull(),
}, (t) => [
    index("idx_role_policies_workspace_role").on(t.workspaceId, t.roleId),
  ]);

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  isBuiltin: bigint("is_builtin", { mode: "number" }).notNull(),
}, (t) => [
    uniqueIndex("idx_roles_workspace_name").on(t.workspaceId, t.name),
  ]);

export const secretsVault = pgTable("secrets_vault", {
  workspaceId: text("workspace_id").notNull(),
  id: text("id").notNull(),
  kind: text("kind").notNull(),
  ownerKey: text("owner_key").notNull(),
  principalId: text("principal_id"),
  binding: text("binding"),
  provider: text("provider"),
  label: text("label").notNull(),
  isDefault: boolean("is_default").notNull(),
  revision: bigint("revision", { mode: "number" }).notNull(),
  sealedKeyId: text("sealed_key_id"),
  sealedCiphertext: text("sealed_ciphertext"),
  sealedNonce: text("sealed_nonce"),
  sealedAlg: text("sealed_alg"),
  last4: text("last4"),
  tokenLength: bigint("token_length", { mode: "number" }),
  meta: jsonText("meta").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({ name: "secrets_vault_workspace_id_fkey", columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    foreignKey({ name: "secrets_vault_principal_id_fkey", columns: [t.principalId], foreignColumns: [principals.id] }).onDelete("cascade"),
    check("secrets_vault_kind", sql`kind IN ('site-assistant','personal-execution','media-provider','custom','publish-peer','database-destination','vendor','source-control','mcp-env','mcp-auth','api-connection')`),
    check("secrets_vault_revision", sql`revision > 0`),
    check("secrets_vault_token_length", sql`token_length IS NULL OR token_length >= 0`),
    check("secrets_vault_meta", sql`jsonb_typeof(meta) = 'object'`),
    check("secrets_vault_boolean", sql`is_default IN (false,true)`),
    check("secrets_vault_sealed_shape", sql`(sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL) OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL)`),
    check("secrets_vault_personal_principal", sql`kind <> 'personal-execution' OR principal_id IS NOT NULL`),
    check("secrets_vault_media_provider", sql`kind <> 'media-provider' OR provider IS NOT NULL`),
    check("secrets_vault_principal_scope", sql`kind = 'personal-execution' OR principal_id IS NULL`),
    check("secrets_vault_owner", sql`kind IN ('mcp-env','mcp-auth') OR owner_key = 'tovu'`),
    check("secrets_vault_provider_scope", sql`kind NOT IN ('custom','publish-peer','database-destination') OR provider IS NULL`),
    check("secrets_vault_hint", sql`last4 IS NULL OR (token_length IS NOT NULL AND token_length >= 12 AND length(last4) = 4)`),
    index("secrets_vault_scope").on(t.workspaceId, t.kind, t.ownerKey, t.principalId, t.provider),
    index("secrets_vault_principal").on(t.principalId, t.workspaceId, t.kind),
    uniqueIndex("secrets_vault_singleton").on(t.workspaceId, t.kind).where(sql`kind IN ('site-assistant','database-destination')`),
    uniqueIndex("secrets_vault_personal").on(t.workspaceId, t.kind, t.principalId).where(sql`kind = 'personal-execution'`),
    uniqueIndex("secrets_vault_media").on(t.workspaceId, t.kind, t.provider).where(sql`kind = 'media-provider'`),
    uniqueIndex("secrets_vault_default").on(t.workspaceId, t.kind, t.ownerKey, sql`(${t.principalId} IS NULL)`, sql`coalesce(${t.principalId},'')`, sql`(${t.provider} IS NULL)`, sql`coalesce(${t.provider},'')`).where(sql`is_default = true`),
    uniqueIndex("secrets_vault_group_label").on(t.workspaceId, t.kind, t.ownerKey, sql`(${t.principalId} IS NULL)`, sql`coalesce(${t.principalId},'')`, sql`(${t.provider} IS NULL)`, sql`coalesce(${t.provider},'')`, t.label).where(sql`kind IN ('vendor','source-control')`),
    uniqueIndex("secrets_vault_label").on(t.workspaceId, t.kind, t.label).where(sql`kind IN ('custom','publish-peer')`),
  ]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  principalId: text("principal_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [
    uniqueIndex("idx_sessions_workspace_token_hash").on(t.workspaceId, t.tokenHash),
  ]);

export const settingDefinitions = pgTable("setting_definitions", {
  settingId: text("setting_id").notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  workspaceId: text("workspace_id"),
  namespace: text("namespace").notNull(),
  key: text("key").notNull(),
  ownerKind: text("owner_kind").notNull(),
  ownerId: text("owner_id"),
  schemaJson: jsonText("schema_json").notNull(),
  defaultJson: jsonText("default_json"),
  scopes: bigint("scopes", { mode: "number" }).notNull(),
  secret: bigint("secret", { mode: "number" }).notNull().default(0),
  status: text("status").notNull(),
  aliasOfKey: text("alias_of_key"),
  aliasOfNs: text("alias_of_ns"),
  coercionJson: jsonText("coercion_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    uniqueIndex("pk_setting_definitions").on(t.settingId, t.version),
    index("idx_def_namespace_key_workspace").on(t.namespace, t.key, t.workspaceId),
  ]);

export const settingRevisions = pgTable("setting_revisions", {
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  entityKind: text("entity_kind").notNull(),
  settingId: text("setting_id").notNull(),
  scope: text("scope"),
  workspaceId: text("workspace_id"),
  principalId: text("principal_id"),
  op: text("op").notNull(),
  beforeJson: jsonText("before_json"),
  afterJson: jsonText("after_json"),
  defVersion: bigint("def_version", { mode: "number" }).notNull(),
  actor: text("actor").notNull(),
  originPluginId: text("origin_plugin_id"),
  changeSetId: text("change_set_id"),
  createdAt: text("created_at").notNull(),
}, (t) => [
    index("idx_rev_setting").on(t.settingId, t.seq),
  ]);

export const settingValuesGlobal = pgTable("setting_values_global", {
  settingId: text("setting_id").primaryKey(),
  valueJson: jsonText("value_json"),
  state: text("state").notNull().default("set"),
  defVersion: bigint("def_version", { mode: "number" }).notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  originPluginId: text("origin_plugin_id"),
});

export const settingValuesUser = pgTable("setting_values_user", {
  settingId: text("setting_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  principalId: text("principal_id").notNull(),
  valueJson: jsonText("value_json"),
  state: text("state").notNull().default("set"),
  defVersion: bigint("def_version", { mode: "number" }).notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  originPluginId: text("origin_plugin_id"),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    uniqueIndex("pk_setting_values_user").on(t.workspaceId, t.principalId, t.settingId),
  ]);

export const settingValuesWorkspace = pgTable("setting_values_workspace", {
  settingId: text("setting_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  valueJson: jsonText("value_json"),
  state: text("state").notNull().default("set"),
  defVersion: bigint("def_version", { mode: "number" }).notNull(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  originPluginId: text("origin_plugin_id"),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    uniqueIndex("pk_setting_values_workspace").on(t.workspaceId, t.settingId),
  ]);

export const siteTitlePreexistingWorkspaces = pgTable("site_title_preexisting_workspaces", {
  workspaceId: text("workspace_id").primaryKey(),
  preservedAt: text("preserved_at"),
});

export const taxonomies = pgTable("taxonomies", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  hierarchical: bigint("hierarchical", { mode: "number" }).notNull(),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    index("idx_taxonomies_workspace").on(t.workspaceId),
  ]);

export const taxonomyRevisions = pgTable("taxonomy_revisions", {
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  taxonomyId: text("taxonomy_id").notNull(),
  op: text("op").notNull(),
  previousStateJson: jsonText("previous_state_json"),
  actorId: text("actor_id").notNull(),
  recordedAt: text("recorded_at").notNull(),
}, (t) => [
    index("idx_taxonomy_revisions_workspace_taxonomy").on(t.workspaceId, t.taxonomyId, t.seq),
  ]);

export const terms = pgTable("terms", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  taxonomyId: text("taxonomy_id").notNull(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    index("idx_terms_workspace_taxonomy").on(t.workspaceId, t.taxonomyId),
  ]);

export const transformDefinitions = pgTable("transform_registry", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  paramsJson: jsonText("params_json").notNull(),
  owner: text("owner").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
    uniqueIndex("idx_transform_registry_lookup").on(t.workspaceId, t.name, t.version),
  ]);

export const trashedItems = pgTable("trashed_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  trashedAt: text("trashed_at").notNull(),
  purgeAfter: text("purge_after").notNull(),
  actorPrincipalId: text("actor_principal_id").notNull(),
  actorPluginId: text("actor_plugin_id"),
  displayTitle: text("display_title").notNull(),
  displaySubtitle: text("display_subtitle"),
  entityVersion: bigint("entity_version", { mode: "number" }),
  priorMarker: text("prior_marker"),
  purgeLeaseOwner: text("purge_lease_owner"),
  purgeLeaseExpiresAt: text("purge_lease_expires_at"),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    uniqueIndex("trashed_items_identity_unique").on(t.workspaceId, t.entityType, t.entityId),
    index("idx_trashed_items_purge_after").on(t.purgeAfter),
    index("idx_trashed_items_workspace_trashed_at").on(t.workspaceId, t.trashedAt),
  ]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  eventId: text("event_id").notNull(),
  topic: text("topic").notNull(),
  payloadJson: jsonText("payload_json"),
  status: text("status").notNull(),
  attempts: bigint("attempts", { mode: "number" }).notNull(),
  nextAttemptAt: text("next_attempt_at").notNull(),
  lastResponseStatus: bigint("last_response_status", { mode: "number" }),
  lastError: text("last_error"),
  signedWithVersion: bigint("signed_with_version", { mode: "number" }),
  createdAt: text("created_at").notNull(),
  deliveredAt: text("delivered_at"),
  deadAt: text("dead_at"),
}, (t) => [
    uniqueIndex("idx_webhook_deliveries_workspace_sub_event").on(t.workspaceId, t.subscriptionId, t.eventId),
    index("idx_webhook_deliveries_status_next_attempt").on(t.status, t.nextAttemptAt),
  ]);

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  ownerPrincipalId: text("owner_principal_id").notNull(),
  label: text("label").notNull(),
  targetUrl: text("target_url").notNull(),
  topicsJson: jsonText("topics_json").notNull(),
  secretVersion: bigint("secret_version", { mode: "number" }).notNull(),
  previousSecretVersion: bigint("previous_secret_version", { mode: "number" }),
  status: text("status").notNull(),
  createdByPrincipalId: text("created_by_principal_id").notNull(),
  createdByPluginId: text("created_by_plugin_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  disabledAt: text("disabled_at"),
}, (t) => [
    index("idx_webhook_subscriptions_workspace").on(t.workspaceId),
  ]);

export const widgetRegionBindings = pgTable("widget_region_bindings", {
  workspaceId: text("workspace_id").notNull(),
  regionKey: text("region_key").notNull(),
  areaEntryId: text("area_entry_id").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    uniqueIndex("widget_region_bindings_workspace_region_unique").on(t.workspaceId, t.regionKey),
    index("idx_widget_region_bindings_area").on(t.workspaceId, t.areaEntryId),
  ]);

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull(),
});
