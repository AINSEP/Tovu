/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Produced from `src/db/schema.ts` by `development/scripts/generate-postgres-schema.ts`.
 * Edit the SQLite schema and regenerate; editing this file directly will be overwritten and will
 * fail the drift check in CI.
 *
 * FTS5 search objects are absent on purpose — they are raw-SQL virtual tables, not `sqliteTable`
 * declarations, and PostgreSQL's tsvector/GIN equivalent is hand-authored. See the generator's
 * module doc.
 *
 * Tables: 76
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

export const adminExecutionCredentials = pgTable("admin_execution_credentials", {
  workspaceId: text("workspace_id").notNull(),
  principalId: text("principal_id").notNull(),
  protocol: text("protocol").notNull().default("anthropic"),
  providerId: text("provider_id"),
  baseUrl: text("base_url"),
  model: text("model"),
  maxTokens: bigint("max_tokens", { mode: "number" }),
  sealedKeyId: text("sealed_key_id"),
  sealedCiphertext: text("sealed_ciphertext"),
  sealedNonce: text("sealed_nonce"),
  sealedAlg: text("sealed_alg"),
  masked: text("masked"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.principalId] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.principalId], foreignColumns: [principals.id] }).onDelete("cascade"),
    check("admin_execution_credentials_sealed_shape", sql`(sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL AND masked IS NULL) OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL AND masked IS NOT NULL)`),
  ]);

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
  eventPropsJson: text("event_props_json"),
}, (t) => [
    index("idx_analytics_events_workspace_list").on(t.workspaceId, t.id),
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
  inversePayloadJson: text("inverse_payload_json"),
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

export const commerceOrderItems = pgTable("commerce_order_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  orderId: text("order_id").notNull(),
  priceId: text("price_id").notNull(),
  productId: text("product_id").notNull(),
  description: text("description").notNull(),
  unitAmountCents: bigint("unit_amount_cents", { mode: "number" }).notNull(),
  quantity: bigint("quantity", { mode: "number" }).notNull().default(1),
  currency: text("currency").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.orderId], foreignColumns: [commerceOrders.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.priceId], foreignColumns: [commercePrices.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.productId], foreignColumns: [commerceProducts.id] }).onDelete("restrict"),
    check("commerce_order_items_unit_amount_cents_check", sql`unit_amount_cents >= 0`),
    check("commerce_order_items_quantity_check", sql`quantity > 0`),
    index("idx_commerce_order_items_order").on(t.orderId),
  ]);

export const commerceOrders = pgTable("commerce_orders", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  status: text("status").notNull(),
  currency: text("currency").notNull(),
  totalAmountCents: bigint("total_amount_cents", { mode: "number" }).notNull(),
  provider: text("provider").notNull(),
  providerCustomerRef: text("provider_customer_ref"),
  providerPaymentRef: text("provider_payment_ref"),
  providerEventAt: text("provider_event_at"),
  placedAt: text("placed_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.memberId], foreignColumns: [members.id] }).onDelete("restrict"),
    check("commerce_orders_total_amount_cents_check", sql`total_amount_cents >= 0`),
    check("commerce_orders_currency_check", sql`length(currency) = 3 AND currency = lower(currency)`),
    check("commerce_orders_status_check", sql`status IN ('pending', 'paid', 'failed', 'canceled')`),
    index("idx_commerce_orders_workspace_member").on(t.workspaceId, t.memberId),
  ]);

export const commercePrices = pgTable("commerce_prices", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  productId: text("product_id").notNull(),
  unitAmountCents: bigint("unit_amount_cents", { mode: "number" }).notNull(),
  compareAtAmountCents: bigint("compare_at_amount_cents", { mode: "number" }),
  currency: text("currency").notNull(),
  billingInterval: text("billing_interval"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.productId], foreignColumns: [commerceProducts.id] }).onDelete("restrict"),
    check("commerce_prices_unit_amount_cents_check", sql`unit_amount_cents >= 0`),
    check("commerce_prices_compare_at_amount_cents_check", sql`compare_at_amount_cents IS NULL OR compare_at_amount_cents > unit_amount_cents`),
    check("commerce_prices_currency_check", sql`length(currency) = 3 AND currency = lower(currency)`),
    check("commerce_prices_status_check", sql`status IN ('active', 'archived')`),
    check("commerce_prices_billing_interval_check", sql`billing_interval IS NULL OR billing_interval IN ('month', 'year')`),
    index("idx_commerce_prices_product").on(t.productId),
  ]);

export const commerceProductImages = pgTable("commerce_product_images", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  productId: text("product_id").notNull(),
  mediaId: text("media_id").notNull(),
  position: bigint("position", { mode: "number" }).notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.productId], foreignColumns: [commerceProducts.id] }).onDelete("cascade"),
    foreignKey({ columns: [t.mediaId], foreignColumns: [media.id] }).onDelete("restrict"),
    uniqueIndex("commerce_product_images_product_media_unique").on(t.productId, t.mediaId),
    index("idx_commerce_product_images_product_position").on(t.productId, t.position),
  ]);

export const commerceProducts = pgTable("commerce_products", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  description: text("description"),
  grantsMemberTierId: text("grants_member_tier_id"),
  specsJson: text("specs_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.workspaceId, t.grantsMemberTierId], foreignColumns: [memberTiers.workspaceId, memberTiers.id] }).onDelete("restrict"),
    check("commerce_products_status_check", sql`status IN ('active', 'archived')`),
    uniqueIndex("commerce_products_workspace_slug_unique").on(t.workspaceId, t.slug),
  ]);

export const commerceWebhookEvents = pgTable("commerce_webhook_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  eventOccurredAt: text("event_occurred_at").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull(),
  receivedAt: text("received_at").notNull(),
  processedAt: text("processed_at"),
  lastError: text("last_error"),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    check("commerce_webhook_events_status_check", sql`status IN ('received', 'applied', 'ignored', 'failed')`),
    uniqueIndex("commerce_webhook_events_provider_event_unique").on(t.provider, t.eventId),
    index("idx_commerce_webhook_events_claim").on(t.status, t.receivedAt),
  ]);

export const composioConfig = pgTable("composio_config", {
  workspaceId: text("workspace_id").primaryKey(),
  sealedKeyId: text("sealed_key_id"),
  sealedCiphertext: text("sealed_ciphertext"),
  sealedNonce: text("sealed_nonce"),
  sealedAlg: text("sealed_alg"),
  keyTail: text("key_tail"),
  authConfigIds: text("auth_config_ids"),
  keyGeneration: bigint("key_generation", { mode: "number" }).notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    check("composio_config_sealed_shape", sql`(sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL AND key_tail IS NULL) OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL AND key_tail IS NOT NULL)`),
  ]);

export const composioConnectorCredentials = pgTable("composio_connector_credentials", {
  workspaceId: text("workspace_id").notNull(),
  connectorId: text("connector_id").notNull(),
  accountLabel: text("account_label"),
  sealedKeyId: text("sealed_key_id"),
  sealedCiphertext: text("sealed_ciphertext"),
  sealedNonce: text("sealed_nonce"),
  sealedAlg: text("sealed_alg"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.connectorId] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    check("composio_connector_credentials_sealed_shape", sql`(sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL) OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL)`),
  ]);

export const contentTypeRevisions = pgTable("content_type_revisions", {
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  contentTypeKey: text("content_type_key").notNull(),
  workspaceId: text("workspace_id").notNull(),
  op: text("op").notNull(),
  stateJson: text("state_json").notNull(),
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
  fieldsJson: text("fields_json").notNull(),
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

export const deploymentEnvironments = pgTable("deployment_environments", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isProduction: bigint("is_production", { mode: "number" }).notNull(),
  createdAt: text("created_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(1),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    check("deployment_environments_is_production_check", sql`is_production IN (0, 1)`),
    uniqueIndex("idx_deployment_environments_workspace_slug").on(t.workspaceId, t.slug),
  ]);

export const deploymentRunEvents = pgTable("deployment_run_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  runId: text("run_id").notNull(),
  at: text("at").notNull(),
  level: text("level").notNull(),
  message: text("message").notNull(),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.runId], foreignColumns: [deploymentRuns.id] }).onDelete("restrict"),
    check("deployment_run_events_level_check", sql`level IN ('info', 'warning', 'error')`),
    index("idx_deployment_run_events_run").on(t.runId, t.at),
  ]);

export const deploymentRuns = pgTable("deployment_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  providerId: text("provider_id").notNull(),
  targetId: text("target_id"),
  environmentId: text("environment_id"),
  releaseId: text("release_id"),
  status: text("status").notNull(),
  providerRunRef: text("provider_run_ref"),
  reconciliation: text("reconciliation").notNull(),
  requestedByPrincipalId: text("requested_by_principal_id").notNull(),
  requestedAt: text("requested_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  errorSummary: text("error_summary"),
  version: bigint("version", { mode: "number" }).notNull().default(1),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.targetId], foreignColumns: [deploymentTargets.id] }).onDelete("set null"),
    foreignKey({ columns: [t.environmentId], foreignColumns: [deploymentEnvironments.id] }).onDelete("set null"),
    foreignKey({ columns: [t.releaseId], foreignColumns: [releases.id] }).onDelete("set null"),
    check("deployment_runs_status_check", sql`status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`),
    check("deployment_runs_reconciliation_check", sql`reconciliation IN ('poll', 'callback', 'manual')`),
    uniqueIndex("idx_deployment_runs_provider_ref").on(t.providerId, t.providerRunRef),
    index("idx_deployment_runs_workspace").on(t.workspaceId, t.requestedAt),
  ]);

export const deploymentTargets = pgTable("deployment_targets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  environmentId: text("environment_id").notNull(),
  providerId: text("provider_id").notNull(),
  label: text("label").notNull(),
  configJson: text("config_json").notNull(),
  enabled: bigint("enabled", { mode: "number" }).notNull(),
  createdAt: text("created_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(1),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    foreignKey({ columns: [t.environmentId], foreignColumns: [deploymentEnvironments.id] }).onDelete("restrict"),
    check("deployment_targets_enabled_check", sql`enabled IN (0, 1)`),
    index("idx_deployment_targets_workspace_env").on(t.workspaceId, t.environmentId),
  ]);

export const entries = pgTable("entries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  type: text("type").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull(),
  title: text("title").notNull(),
  bodyJson: text("body_json"),
  fieldsJson: text("fields_json").notNull(),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
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
  stateJson: text("state_json").notNull(),
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
  transport: text("transport").notNull(),
  enabled: boolean("enabled").notNull(),
  command: text("command"),
  args: text("args"),
  allowedToolNames: text("allowed_tool_names"),
  envNames: text("env_names"),
  sealedKeyId: text("sealed_key_id"),
  sealedCiphertext: text("sealed_ciphertext"),
  sealedNonce: text("sealed_nonce"),
  sealedAlg: text("sealed_alg"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.serverId] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    check("external_mcp_servers_sealed_shape", sql`(sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL) OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL)`),
  ]);

export const formDefinitions = pgTable("form_definitions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  fieldsJson: text("fields_json").notNull(),
  notifyJson: text("notify_json").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    uniqueIndex("form_definitions_workspace_slug_unique").on(t.workspaceId, t.slug),
    index("idx_form_definitions_workspace").on(t.workspaceId),
  ]);

export const formSubmissions = pgTable("form_submissions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  formDefinitionId: text("form_definition_id").notNull(),
  dataJson: text("data_json").notNull(),
  sourceIp: text("source_ip").notNull(),
  submittedAt: text("submitted_at").notNull(),
}, (t) => [
    foreignKey({ columns: [t.formDefinitionId], foreignColumns: [formDefinitions.id] }).onDelete("restrict"),
    index("idx_form_submissions_definition").on(t.formDefinitionId, t.submittedAt),
    index("idx_form_submissions_workspace").on(t.workspaceId),
  ]);

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
  title: text("title").notNull(),
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
});

export const mediaProviderCredentials = pgTable("media_provider_credentials", {
  workspaceId: text("workspace_id").notNull(),
  providerId: text("provider_id").notNull(),
  baseUrl: text("base_url"),
  model: text("model"),
  sealedKeyId: text("sealed_key_id"),
  sealedCiphertext: text("sealed_ciphertext"),
  sealedNonce: text("sealed_nonce"),
  sealedAlg: text("sealed_alg"),
  keyTail: text("key_tail"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.providerId] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    check("media_provider_credentials_sealed_shape", sql`(sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL AND key_tail IS NULL) OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL AND key_tail IS NOT NULL)`),
  ]);

export const memberConsents = pgTable("member_consents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  memberId: text("member_id").notNull(),
  purpose: text("purpose").notNull(),
  status: text("status").notNull(),
  evidenceJson: text("evidence_json").notNull(),
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
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
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
  status: text("status").notNull(),
  note: text("note"),
  fieldsJson: text("fields_json"),
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
  docJson: text("doc_json").notNull(),
  locationsJson: text("locations_json").notNull(),
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
  stateJson: text("state_json").notNull(),
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
  countersJson: text("counters_json").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  createdByPrincipal: text("created_by_principal").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    index("idx_newsletter_campaigns_workspace").on(t.workspaceId),
  ]);

export const originSettings = pgTable("origin_settings", {
  workspaceId: text("workspace_id").primaryKey(),
  scheme: text("scheme").notNull(),
  host: text("host").notNull(),
  port: bigint("port", { mode: "number" }),
  basePath: text("base_path"),
  verifiedAt: text("verified_at").notNull(),
  source: text("source").notNull(),
  redirectAllowlistJson: text("redirect_allowlist_json").notNull().default("[]"),
  egressAllowlistJson: text("egress_allowlist_json").notNull().default("[]"),
});

export const outboxEvents = pgTable("outbox_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  eventJson: text("event_json").notNull(),
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
  constraintJson: text("constraint_json"),
}, (t) => [
    index("idx_policy_permissions_workspace_policy").on(t.workspaceId, t.policyId),
  ]);

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  bodyJson: text("body_json"),
  status: text("status").notNull(),
  kind: text("kind").notNull().default("post"),
  bodyFormat: text("body_format").notNull().default("doc"),
  bodyHtml: text("body_html"),
  updatedAt: text("updated_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  seoExtJson: text("seo_ext_json"),
  ext: text("ext").notNull().default("{}"),
  deletedAt: text("deleted_at"),
  templateChoice: text("template_choice"),
  overridesThemePage: boolean("overrides_theme_page"),
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

export const publishCredentialSets = pgTable("publish_credential_sets", {
  id: text("id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  providerId: text("provider_id").notNull(),
  label: text("label").notNull(),
  sealedKeyId: text("sealed_key_id").notNull(),
  sealedCiphertext: text("sealed_ciphertext").notNull(),
  sealedNonce: text("sealed_nonce").notNull(),
  sealedAlg: text("sealed_alg").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    uniqueIndex("publish_credential_sets_workspace_provider_label_unique").on(t.workspaceId, t.providerId, t.label),
  ]);

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
  stateJson: text("state_json").notNull(),
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

export const releases = pgTable("releases", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  label: text("label").notNull(),
  sourceKind: text("source_kind").notNull(),
  sourceRepoUrl: text("source_repo_url"),
  sourceCommitSha: text("source_commit_sha"),
  sourceUri: text("source_uri"),
  sourceChecksum: text("source_checksum"),
  createdByPrincipalId: text("created_by_principal_id").notNull(),
  createdAt: text("created_at").notNull(),
  version: bigint("version", { mode: "number" }).notNull().default(1),
}, (t) => [
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("restrict"),
    check("releases_source_kind_check", sql`source_kind IN ('git-revision', 'external-artifact')`),
    index("idx_releases_workspace_created").on(t.workspaceId, t.createdAt),
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
  schemaJson: text("schema_json").notNull(),
  defaultJson: text("default_json"),
  scopes: bigint("scopes", { mode: "number" }).notNull(),
  secret: bigint("secret", { mode: "number" }).notNull().default(0),
  status: text("status").notNull(),
  aliasOfKey: text("alias_of_key"),
  aliasOfNs: text("alias_of_ns"),
  coercionJson: text("coercion_json"),
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
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
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
  valueJson: text("value_json"),
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
  valueJson: text("value_json"),
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
  valueJson: text("value_json"),
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

export const siteAssistantCredentials = pgTable("site_assistant_credentials", {
  workspaceId: text("workspace_id").primaryKey(),
  provider: text("provider").notNull().default("google"),
  baseUrl: text("base_url"),
  model: text("model"),
  sealedKeyId: text("sealed_key_id"),
  sealedCiphertext: text("sealed_ciphertext"),
  sealedNonce: text("sealed_nonce"),
  sealedAlg: text("sealed_alg"),
  masked: text("masked"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    check("site_assistant_credentials_sealed_shape", sql`(sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL AND masked IS NULL) OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL AND masked IS NOT NULL)`),
  ]);

export const sourceControlCredentialSets = pgTable("source_control_credential_sets", {
  id: text("id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  providerId: text("provider_id").notNull(),
  label: text("label").notNull(),
  sealedKeyId: text("sealed_key_id").notNull(),
  sealedCiphertext: text("sealed_ciphertext").notNull(),
  sealedNonce: text("sealed_nonce").notNull(),
  sealedAlg: text("sealed_alg").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
    primaryKey({ columns: [t.workspaceId, t.id] }),
    foreignKey({ columns: [t.workspaceId], foreignColumns: [workspaces.id] }).onDelete("cascade"),
    uniqueIndex("source_control_credential_sets_workspace_provider_label_unique").on(t.workspaceId, t.providerId, t.label),
  ]);

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
  previousStateJson: text("previous_state_json"),
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
  paramsJson: text("params_json").notNull(),
  owner: text("owner").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
    uniqueIndex("idx_transform_registry_lookup").on(t.workspaceId, t.name, t.version),
  ]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  eventId: text("event_id").notNull(),
  topic: text("topic").notNull(),
  payloadJson: text("payload_json"),
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
  topicsJson: text("topics_json").notNull(),
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
