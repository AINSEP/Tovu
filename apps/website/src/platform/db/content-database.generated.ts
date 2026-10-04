/**
 * @file GENERATED — do not edit. Kysely types for ContentDatabase, read from a fresh PGlite database with the content schema (`__tests__/pg-content-schema.ts`)
 * by `platform/db/kernel/typegen.ts`. Regenerate: `UPDATE_DATABASE_TYPES=1` + `kernel/__tests__/database-types.test.ts`
 */
import type { ColumnType, Generated, SqlBool } from "kysely";

/** A boolean column: reads `true`/`false` (Postgres) or `1`/`0` (SQLite); convert with `toBool`. */
export type Bool = ColumnType<SqlBool, boolean, boolean>;
export type GeneratedBool = ColumnType<SqlBool, boolean | undefined, boolean>;
export type NullableBool = ColumnType<SqlBool | null, boolean | null | undefined, boolean | null>;

export interface ContentDatabase {
  admin_execution_credentials: AdminExecutionCredentialsTable;
  agent_tool_attempts: AgentToolAttemptsTable;
  analytics_events: AnalyticsEventsTable;
  api_keys: ApiKeysTable;
  asset_blobs: AssetBlobsTable;
  asset_renditions: AssetRenditionsTable;
  change_set_items: ChangeSetItemsTable;
  change_sets: ChangeSetsTable;
  commerce_order_items: CommerceOrderItemsTable;
  commerce_orders: CommerceOrdersTable;
  commerce_prices: CommercePricesTable;
  commerce_product_images: CommerceProductImagesTable;
  commerce_products: CommerceProductsTable;
  commerce_webhook_events: CommerceWebhookEventsTable;
  content_type_revisions: ContentTypeRevisionsTable;
  content_types: ContentTypesTable;
  custom_credential_sets: CustomCredentialSetsTable;
  database_transfer_destinations: DatabaseTransferDestinationsTable;
  database_write_watermark: DatabaseWriteWatermarkTable;
  entries: EntriesTable;
  entry_refs: EntryRefsTable;
  entry_revisions: EntryRevisionsTable;
  entry_terms: EntryTermsTable;
  external_mcp_servers: ExternalMcpServersTable;
  external_mcp_tool_approvals: ExternalMcpToolApprovalsTable;
  form_definitions: FormDefinitionsTable;
  form_submissions: FormSubmissionsTable;
  gated_mutation_tokens: GatedMutationTokensTable;
  identity_users: IdentityUsersTable;
  media: MediaTable;
  media_provider_credentials: MediaProviderCredentialsTable;
  media_slug_history: MediaSlugHistoryTable;
  member_consents: MemberConsentsTable;
  member_magic_tokens: MemberMagicTokensTable;
  member_revisions: MemberRevisionsTable;
  member_sessions: MemberSessionsTable;
  member_subscriptions: MemberSubscriptionsTable;
  member_tiers: MemberTiersTable;
  members: MembersTable;
  menus: MenusTable;
  nav_location_bindings: NavLocationBindingsTable;
  newsletter_campaign_revisions: NewsletterCampaignRevisionsTable;
  newsletter_campaigns: NewsletterCampaignsTable;
  oauth_device_authorizations: OauthDeviceAuthorizationsTable;
  oauth_pending_authorizations: OauthPendingAuthorizationsTable;
  origin_settings: OriginSettingsTable;
  outbox_events: OutboxEventsTable;
  plugin_activations: PluginActivationsTable;
  policies: PoliciesTable;
  policy_permissions: PolicyPermissionsTable;
  post_revisions: PostRevisionsTable;
  posts: PostsTable;
  presentation_settings: PresentationSettingsTable;
  principal_policies: PrincipalPoliciesTable;
  principal_roles: PrincipalRolesTable;
  principals: PrincipalsTable;
  publish_backstop_log: PublishBackstopLogTable;
  publish_content_baselines: PublishContentBaselinesTable;
  publish_content_bundles: PublishContentBundlesTable;
  publish_content_peers: PublishContentPeersTable;
  publish_content_runs: PublishContentRunsTable;
  publish_credential_sets: PublishCredentialSetsTable;
  publish_history: PublishHistoryTable;
  publish_trust_revocations: PublishTrustRevocationsTable;
  redirect_hits: RedirectHitsTable;
  redirect_revisions: RedirectRevisionsTable;
  redirects: RedirectsTable;
  role_policies: RolePoliciesTable;
  roles: RolesTable;
  sessions: SessionsTable;
  setting_definitions: SettingDefinitionsTable;
  setting_revisions: SettingRevisionsTable;
  setting_values_global: SettingValuesGlobalTable;
  setting_values_user: SettingValuesUserTable;
  setting_values_workspace: SettingValuesWorkspaceTable;
  site_assistant_credentials: SiteAssistantCredentialsTable;
  site_title_preexisting_workspaces: SiteTitlePreexistingWorkspacesTable;
  source_control_credential_sets: SourceControlCredentialSetsTable;
  taxonomies: TaxonomiesTable;
  taxonomy_revisions: TaxonomyRevisionsTable;
  terms: TermsTable;
  transform_registry: TransformRegistryTable;
  trashed_items: TrashedItemsTable;
  vendor_credential_sets: VendorCredentialSetsTable;
  webhook_deliveries: WebhookDeliveriesTable;
  webhook_subscriptions: WebhookSubscriptionsTable;
  widget_region_bindings: WidgetRegionBindingsTable;
  workspaces: WorkspacesTable;
}

export interface AdminExecutionCredentialsTable {
  workspace_id: string;
  principal_id: string;
  protocol: Generated<string>;
  provider_id: string | null;
  base_url: string | null;
  model: string | null;
  max_tokens: number | null;
  sealed_key_id: string | null;
  sealed_ciphertext: string | null;
  sealed_nonce: string | null;
  sealed_alg: string | null;
  masked: string | null;
  aad_version: Generated<number>;
  created_at: string;
  updated_at: string;
}

export interface AgentToolAttemptsTable {
  id: Generated<number>;
  attempt_id: string;
  execution_id: string | null;
  workspace_id: string;
  run_id: string;
  tool_id: string;
  principal_id: string;
  phase: string;
  at: string;
  detail: string | null;
}

export interface AnalyticsEventsTable {
  id: Generated<number>;
  workspace_id: string;
  occurred_at: string;
  kind: string;
  path: string;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  country: string | null;
  region: string | null;
  device_class: string;
  browser_family: string | null;
  os_family: string | null;
  visitor_hash: string;
  session_id: string;
  event_name: string | null;
  event_props_json: string | null;
}

export interface ApiKeysTable {
  id: string;
  workspace_id: string;
  principal_id: string;
  label: string;
  key_hash: string;
  prefix: string;
  issued_policy_id: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface AssetBlobsTable {
  id: string;
  workspace_id: string;
  sha256: string;
  storage_key: string;
  created_by_principal: string;
  created_at: string;
  status: string;
  tombstoned_at: string | null;
  content_type: string | null;
}

export interface AssetRenditionsTable {
  id: string;
  workspace_id: string;
  asset_id: string;
  transform_name: string;
  version: number;
  storage_key: string;
  created_at: string;
}

export interface ChangeSetItemsTable {
  id: string;
  change_set_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  before_revision_id: string | null;
  after_revision_id: string | null;
  inverse_payload_json: string | null;
  entity_version_at_apply: number | null;
  position: number;
}

export interface ChangeSetsTable {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  status: string;
  summary: string;
  idempotency_key: string | null;
  intent_ref: string | null;
  created_at: string;
  applied_at: string | null;
  reverted_at: string | null;
}

export interface CommerceOrderItemsTable {
  id: string;
  workspace_id: string;
  order_id: string;
  price_id: string;
  product_id: string;
  description: string;
  unit_amount_cents: number;
  quantity: Generated<number>;
  currency: string;
  created_at: string;
}

export interface CommerceOrdersTable {
  id: string;
  workspace_id: string;
  member_id: string;
  status: string;
  currency: string;
  total_amount_cents: number;
  provider: string;
  provider_customer_ref: string | null;
  provider_payment_ref: string | null;
  provider_event_at: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface CommercePricesTable {
  id: string;
  workspace_id: string;
  product_id: string;
  unit_amount_cents: number;
  compare_at_amount_cents: number | null;
  currency: string;
  billing_interval: string | null;
  status: string;
  created_at: string;
  version: number;
}

export interface CommerceProductImagesTable {
  id: string;
  workspace_id: string;
  product_id: string;
  media_id: string;
  position: Generated<number>;
  created_at: string;
}

export interface CommerceProductsTable {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  kind: string;
  status: string;
  description: string | null;
  grants_member_tier_id: string | null;
  specs_json: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface CommerceWebhookEventsTable {
  id: string;
  workspace_id: string;
  provider: string;
  event_id: string;
  event_type: string;
  event_occurred_at: string;
  payload_json: string;
  status: string;
  received_at: string;
  processed_at: string | null;
  last_error: string | null;
}

export interface ContentTypeRevisionsTable {
  seq: Generated<number>;
  content_type_key: string;
  workspace_id: string;
  op: string;
  state_json: string;
  actor_id: string;
  principal_kind: string | null;
  delegated_by_workspace_id: string | null;
  delegated_by_id: string | null;
  recorded_at: string;
}

export interface ContentTypesTable {
  id: string;
  workspace_id: string;
  key: string;
  label: string;
  fields_json: string;
  status: string;
  version: number;
  tombstoned_at: string | null;
}

export interface CustomCredentialSetsTable {
  id: string;
  workspace_id: string;
  label: string;
  category: string;
  base_url: string;
  additional_hosts_json: string | null;
  username: string | null;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseTransferDestinationsTable {
  workspace_id: string;
  host: string;
  port: string;
  database_name: string;
  user_name: string;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  aad_version: number;
  saved_at: string;
  last_run_json: string | null;
}

export interface DatabaseWriteWatermarkTable {
  id: number;
  value: Generated<number>;
  last_stamped_at: string | null;
}

export interface EntriesTable {
  id: string;
  workspace_id: string;
  type: string;
  slug: string;
  status: string;
  title: string;
  body_json: string | null;
  fields_json: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

export interface EntryRefsTable {
  id: Generated<number>;
  workspace_id: string;
  source_entry_id: string;
  source_kind: string;
  field_path: string;
  target_kind: string;
  target_id: string;
}

export interface EntryRevisionsTable {
  seq: Generated<number>;
  entry_id: string;
  workspace_id: string;
  op: string;
  state_json: string;
  actor_id: string;
  delegated_by_workspace_id: string | null;
  delegated_by_id: string | null;
  recorded_at: string;
}

export interface EntryTermsTable {
  id: Generated<number>;
  workspace_id: string;
  content_type: string;
  content_id: string;
  term_id: string;
  added_at: string;
}

export interface ExternalMcpServersTable {
  workspace_id: string;
  server_id: string;
  label: string | null;
  provisioned_by_plugin_id: string | null;
  transport: string;
  auth_mode: Generated<string>;
  enabled: Bool;
  command: string | null;
  url: string | null;
  args: string | null;
  allowed_tool_names: string | null;
  write_allowed_tool_names: string | null;
  write_grants_updated_by_principal_id: string | null;
  write_grants_updated_at: string | null;
  env_names: string | null;
  sealed_key_id: string | null;
  sealed_ciphertext: string | null;
  sealed_nonce: string | null;
  sealed_alg: string | null;
  oauth_provider_id: string | null;
  oauth_grant: string | null;
  oauth_client_id: string | null;
  oauth_endpoints_json: string | null;
  oauth_scopes_json: string | null;
  oauth_status: string | null;
  oauth_expires_at: string | null;
  oauth_token_env_name: string | null;
  oauth_refresh_lease_until: string | null;
  oauth_sealed_key_id: string | null;
  oauth_sealed_ciphertext: string | null;
  oauth_sealed_nonce: string | null;
  oauth_sealed_alg: string | null;
  aad_version: Generated<number>;
  oauth_aad_version: Generated<number>;
  created_at: string;
  updated_at: string;
}

export interface ExternalMcpToolApprovalsTable {
  workspace_id: string;
  server_id: string;
  tool_name: string;
  fingerprint: string;
  granted_by_principal_id: string;
  granted_at: string;
}

export interface FormDefinitionsTable {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  fields_json: string;
  notify_json: string;
  status: Generated<string>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: Generated<number>;
}

export interface FormSubmissionsTable {
  id: string;
  workspace_id: string;
  form_definition_id: string;
  data_json: string;
  source_ip: string | null;
  submitted_at: string;
  deleted_at: string | null;
  version: Generated<number>;
}

export interface GatedMutationTokensTable {
  confirmation_token: string;
  plan_hash: string;
  scope_id: string;
  confirmer_principal_id: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface IdentityUsersTable {
  principal_id: string;
  workspace_id: string;
  username: string;
  email: string | null;
  password_hash: string;
  last_login_at: string | null;
}

export interface MediaTable {
  id: string;
  workspace_id: string;
  created_by: string | null;
  title: string;
  slug: string | null;
  alt: string;
  caption: string;
  credit: string;
  source_sha256: string;
  status: string;
  created_at: string;
  updated_at: string;
  version: number;
  width: number | null;
  height: number | null;
  css_class: string | null;
  html_attributes: string | null;
}

export interface MediaProviderCredentialsTable {
  workspace_id: string;
  provider_id: string;
  base_url: string | null;
  model: string | null;
  sealed_key_id: string | null;
  sealed_ciphertext: string | null;
  sealed_nonce: string | null;
  sealed_alg: string | null;
  key_tail: string | null;
  aad_version: Generated<number>;
  created_at: string;
  updated_at: string;
}

export interface MediaSlugHistoryTable {
  workspace_id: string;
  slug: string;
  media_id: string;
  retired_at: string;
}

export interface MemberConsentsTable {
  id: string;
  workspace_id: string;
  member_id: string;
  purpose: string;
  status: string;
  evidence_json: string;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface MemberMagicTokensTable {
  id: string;
  workspace_id: string;
  member_id: string;
  token_hash: string;
  purpose: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface MemberRevisionsTable {
  seq: Generated<number>;
  entity_kind: string;
  entity_id: string;
  workspace_id: string;
  member_id: string;
  purpose: string | null;
  op: string;
  before_json: string | null;
  after_json: string | null;
  origin_module: string | null;
  created_at: string;
}

export interface MemberSessionsTable {
  id: string;
  workspace_id: string;
  member_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  user_agent: string | null;
  ip: string | null;
}

export interface MemberSubscriptionsTable {
  id: string;
  workspace_id: string;
  member_id: string;
  tier_id: string;
  status: string;
  source: string;
  external_ref: string | null;
  started_at: string;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface MemberTiersTable {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string | null;
  welcome_page_path: string | null;
  visible_in_portal: Generated<number>;
  monthly_price_cents: number | null;
  yearly_price_cents: number | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface MembersTable {
  id: string;
  workspace_id: string;
  email: string;
  name: string | null;
  email_verified_at: string | null;
  status: string;
  note: string | null;
  fields_json: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface MenusTable {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  status: string;
  doc_json: string;
  locations_json: string;
  updated_at: string;
  version: number;
}

export interface NavLocationBindingsTable {
  workspace_id: string;
  location_key: string;
  menu_id: string;
  bound_at: string;
}

export interface NewsletterCampaignRevisionsTable {
  seq: Generated<number>;
  campaign_id: string;
  workspace_id: string;
  state_json: string;
  actor_id: string;
  recorded_at: string;
}

export interface NewsletterCampaignsTable {
  id: string;
  workspace_id: string;
  status: string;
  subject: string;
  preheader: string | null;
  from_name: string;
  from_email: string;
  reply_to: string;
  list_id: string;
  scheduled_at: string | null;
  send_started_at: string | null;
  audience_snapshot_id: string | null;
  counters_json: string;
  version: number;
  created_by_principal: string;
  created_at: string;
  updated_at: string;
}

export interface OauthDeviceAuthorizationsTable {
  workspace_id: string;
  server_id: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string | null;
  interval_seconds: number;
  expires_at: string;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  created_at: string;
}

export interface OauthPendingAuthorizationsTable {
  state: string;
  owner_key: string;
  provider_id: string;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  redirect_uri: string;
  scopes_json: string;
  created_at: string;
  expires_at: string;
}

export interface OriginSettingsTable {
  workspace_id: string;
  scheme: string;
  host: string;
  port: number | null;
  base_path: string | null;
  verified_at: string;
  source: string;
  redirect_allowlist_json: Generated<string>;
  egress_allowlist_json: Generated<string>;
}

export interface OutboxEventsTable {
  id: string;
  workspace_id: string;
  event_json: string;
  status: string;
  attempts: Generated<number>;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
}

export interface PluginActivationsTable {
  workspace_id: string;
  plugin_id: string;
  version: string;
  enabled: Bool;
  updated_at: string;
  quarantined_at: string | null;
  quarantine_reason: string | null;
  quarantine_failure_count: number | null;
}

export interface PoliciesTable {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_builtin: number;
  is_frozen: number;
}

export interface PolicyPermissionsTable {
  id: string;
  workspace_id: string;
  policy_id: string;
  permission: string;
  resource_type: string | null;
  constraint_json: string | null;
}

export interface PostRevisionsTable {
  id: string;
  post_id: string;
  workspace_id: string;
  seq: number;
  op: string;
  state_json: string;
  content_hash: string;
  actor_id: string;
  delegated_by_workspace_id: string | null;
  delegated_by_id: string | null;
  restored_from: string | null;
  recorded_at: string;
}

export interface PostsTable {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  body_json: string | null;
  status: string;
  kind: Generated<string>;
  body_format: Generated<string>;
  body_html: string | null;
  updated_at: string;
  version: number;
  seo_ext_json: string | null;
  ext: Generated<string>;
  deleted_at: string | null;
  template_choice: string | null;
  overrides_theme_page: NullableBool;
  member_access_json: string | null;
  autosave_json: string | null;
  created_by_principal_id: string | null;
  created_at: string | null;
}

export interface PresentationSettingsTable {
  workspace_id: string;
  active_theme_id: string;
  updated_at: string;
}

export interface PrincipalPoliciesTable {
  id: string;
  workspace_id: string;
  principal_id: string;
  policy_id: string;
}

export interface PrincipalRolesTable {
  id: string;
  workspace_id: string;
  principal_id: string;
  role_id: string;
}

export interface PrincipalsTable {
  id: string;
  workspace_id: string;
  kind: string;
  display_name: string;
  status: string;
  disabled_at: string | null;
  created_at: string;
}

export interface PublishBackstopLogTable {
  id: string;
  workspace_id: string;
  direction: string;
  actor_id: string;
  destination: string;
  reason: string;
  at: string;
  items_json: string;
  gap_labels_json: string;
  result: string;
  run_id: string | null;
  details_json: string;
  inverses_json: string;
}

export interface PublishContentBaselinesTable {
  workspace_id: string;
  peer_principal_id: string;
  entity_type: string;
  entity_id: string;
  hash_at_last_sync: string;
  hash_version: number;
  synced_at: string;
  run_id: string;
}

export interface PublishContentBundlesTable {
  id: string;
  workspace_id: string;
  source_principal_id: string;
  artifact_format_version: Generated<number>;
  hash_version: number;
  entities_json: string;
  blob_manifest_json: string;
  size_bytes: number;
  received_at: string;
  expires_at: string;
}

export interface PublishContentPeersTable {
  id: string;
  workspace_id: string;
  label: string;
  base_url: string;
  remote_workspace_id: string;
  sealed_key_id: string | null;
  sealed_ciphertext: string | null;
  sealed_nonce: string | null;
  sealed_alg: string | null;
  masked: string | null;
  aad_version: Generated<number>;
  created_at: string;
  updated_at: string;
}

export interface PublishContentRunsTable {
  id: string;
  workspace_id: string;
  direction: string;
  peer_principal_id: string;
  peer_label: string | null;
  phase: string;
  restore_point_id: string | null;
  change_set_ids_json: string | null;
  actor_id: string;
  started_at: string;
  finished_at: string | null;
  report_json: string | null;
  items_json: string | null;
}

export interface PublishCredentialSetsTable {
  id: string;
  workspace_id: string;
  provider_id: string;
  label: string;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  is_default: GeneratedBool;
  account_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishHistoryTable {
  id: Generated<number>;
  workspace_id: string;
  target: string;
  url: string;
  reachable: Bool;
  status: string;
  project_name: string;
  published_at: string;
  owner: string | null;
  repo: string | null;
  base_path: string | null;
  deployment_id: string | null;
  commit_sha: string | null;
  branch: string | null;
  triggered_by: string;
}

export interface PublishTrustRevocationsTable {
  source_installation_id: string;
  revoked_at: string;
  note: string | null;
}

export interface RedirectHitsTable {
  redirect_id: string;
  workspace_id: string;
  hit_count: Generated<number>;
  last_hit_at: string | null;
}

export interface RedirectRevisionsTable {
  id: Generated<number>;
  redirect_id: string;
  workspace_id: string;
  seq: number;
  state_json: string;
  tombstoned: number;
  actor_id: string;
  plugin_id: string | null;
  recorded_at: string;
}

export interface RedirectsTable {
  id: string;
  workspace_id: string;
  match_type: string;
  from_pattern: string;
  to_target: string;
  status_code: number;
  status: string;
  override: number;
  priority: number;
  source: string;
  source_entry_id: string | null;
  from_path_at_capture: string | null;
  to_path_at_capture: string | null;
  created_by_principal: string;
  created_by_plugin_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface RolePoliciesTable {
  id: string;
  workspace_id: string;
  role_id: string;
  policy_id: string;
}

export interface RolesTable {
  id: string;
  workspace_id: string;
  name: string;
  is_builtin: number;
}

export interface SessionsTable {
  id: string;
  workspace_id: string;
  principal_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  ip: string | null;
  user_agent: string | null;
}

export interface SettingDefinitionsTable {
  setting_id: string;
  version: Generated<number>;
  workspace_id: string | null;
  namespace: string;
  key: string;
  owner_kind: string;
  owner_id: string | null;
  schema_json: string;
  default_json: string | null;
  scopes: number;
  secret: Generated<number>;
  status: string;
  alias_of_key: string | null;
  alias_of_ns: string | null;
  coercion_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingRevisionsTable {
  seq: Generated<number>;
  entity_kind: string;
  setting_id: string;
  scope: string | null;
  workspace_id: string | null;
  principal_id: string | null;
  op: string;
  before_json: string | null;
  after_json: string | null;
  def_version: number;
  actor: string;
  origin_plugin_id: string | null;
  change_set_id: string | null;
  created_at: string;
}

export interface SettingValuesGlobalTable {
  setting_id: string;
  value_json: string | null;
  state: Generated<string>;
  def_version: number;
  seq: number;
  updated_by: string;
  updated_at: string;
  origin_plugin_id: string | null;
}

export interface SettingValuesUserTable {
  setting_id: string;
  workspace_id: string;
  principal_id: string;
  value_json: string | null;
  state: Generated<string>;
  def_version: number;
  seq: number;
  updated_by: string;
  updated_at: string;
  origin_plugin_id: string | null;
}

export interface SettingValuesWorkspaceTable {
  setting_id: string;
  workspace_id: string;
  value_json: string | null;
  state: Generated<string>;
  def_version: number;
  seq: number;
  updated_by: string;
  updated_at: string;
  origin_plugin_id: string | null;
}

export interface SiteAssistantCredentialsTable {
  workspace_id: string;
  provider: Generated<string>;
  base_url: string | null;
  model: string | null;
  sealed_key_id: string | null;
  sealed_ciphertext: string | null;
  sealed_nonce: string | null;
  sealed_alg: string | null;
  masked: string | null;
  aad_version: Generated<number>;
  created_at: string;
  updated_at: string;
}

export interface SiteTitlePreexistingWorkspacesTable {
  workspace_id: string;
  preserved_at: string | null;
}

export interface SourceControlCredentialSetsTable {
  id: string;
  workspace_id: string;
  provider_id: string;
  label: string;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  is_default: GeneratedBool;
  account_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxonomiesTable {
  id: string;
  workspace_id: string;
  name: string;
  hierarchical: number;
  status: string;
  updated_at: string;
  version: number;
}

export interface TaxonomyRevisionsTable {
  seq: Generated<number>;
  workspace_id: string;
  taxonomy_id: string;
  op: string;
  previous_state_json: string | null;
  actor_id: string;
  recorded_at: string;
}

export interface TermsTable {
  id: string;
  workspace_id: string;
  taxonomy_id: string;
  parent_id: string | null;
  name: string;
  status: string;
  updated_at: string;
  version: number;
}

export interface TransformRegistryTable {
  id: string;
  workspace_id: string;
  name: string;
  version: number;
  params_json: string;
  owner: string;
  created_at: string;
}

export interface TrashedItemsTable {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  trashed_at: string;
  purge_after: string;
  actor_principal_id: string;
  actor_plugin_id: string | null;
  display_title: string;
  display_subtitle: string | null;
  entity_version: number | null;
  prior_marker: string | null;
  purge_lease_owner: string | null;
  purge_lease_expires_at: string | null;
}

export interface VendorCredentialSetsTable {
  id: string;
  workspace_id: string;
  vendor_id: string;
  label: string;
  sealed_key_id: string;
  sealed_ciphertext: string;
  sealed_nonce: string;
  sealed_alg: string;
  token_tail: string;
  is_default: GeneratedBool;
  account_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDeliveriesTable {
  id: string;
  workspace_id: string;
  subscription_id: string;
  event_id: string;
  topic: string;
  payload_json: string | null;
  status: string;
  attempts: number;
  next_attempt_at: string;
  last_response_status: number | null;
  last_error: string | null;
  signed_with_version: number | null;
  created_at: string;
  delivered_at: string | null;
  dead_at: string | null;
}

export interface WebhookSubscriptionsTable {
  id: string;
  workspace_id: string;
  owner_principal_id: string;
  label: string;
  target_url: string;
  topics_json: string;
  secret_version: number;
  previous_secret_version: number | null;
  status: string;
  created_by_principal_id: string;
  created_by_plugin_id: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}

export interface WidgetRegionBindingsTable {
  workspace_id: string;
  region_key: string;
  area_entry_id: string;
  updated_at: string;
}

export interface WorkspacesTable {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}
