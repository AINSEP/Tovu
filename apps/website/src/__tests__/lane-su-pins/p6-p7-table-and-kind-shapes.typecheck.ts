/**
 * @file P6 + P7 (S0), type level: the persisted table shapes and the `entry_refs` kinds that lanes S/U move
 * code around. Compiled ONLY by `npm run typecheck:tests` (`tsconfig.tests.json`; the normal tsconfig
 * excludes `__tests__`), so that command is this pin's gate and the node test runner proves nothing here.
 *
 * P6: for every table named in a lane S/U facts file, `keyof ContentDatabase["<table>"]` equals the literal
 * union below. A Jini adapter copies these column sets into its own row interface; if the generated
 * database type or a copy drifts, this file stops compiling and names the table. The unions are in the
 * generated type's key order (the order the Jini copies use).
 * P7: the literal unions of `entry_refs` source and target kinds.
 */
import type { EntryRefSourceKind, EntryRefTargetKind } from "#src/contracts/core/entry-refs/types";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type ColumnsOf<Table extends keyof ContentDatabase> = keyof ContentDatabase[Table];

export type EntryRefKindPins = [
  Expect<Equal<EntryRefSourceKind, "widget-area-placement" | "widget-embed" | "config-field" | "page-html-embed">>,
  Expect<Equal<EntryRefTargetKind, "entry" | "term" | "asset">>,
];

export type LaneSuTableShapes = [
  Expect<Equal<ColumnsOf<"api_keys">, "id" | "workspace_id" | "principal_id" | "label" | "key_hash" | "prefix" | "issued_policy_id" | "created_at" | "last_used_at" | "expires_at" | "revoked_at">>,
  Expect<Equal<ColumnsOf<"asset_blobs">, "id" | "workspace_id" | "sha256" | "storage_key" | "created_by_principal" | "created_at" | "status" | "tombstoned_at" | "document_owned" | "content_type">>,
  Expect<Equal<ColumnsOf<"asset_renditions">, "id" | "workspace_id" | "asset_id" | "transform_name" | "version" | "storage_key" | "created_at">>,
  Expect<Equal<ColumnsOf<"change_set_items">, "id" | "change_set_id" | "entity_type" | "entity_id" | "operation" | "before_revision_id" | "after_revision_id" | "inverse_payload_json" | "entity_version_at_apply" | "position">>,
  Expect<Equal<ColumnsOf<"change_sets">, "id" | "workspace_id" | "actor_id" | "status" | "summary" | "idempotency_key" | "intent_ref" | "created_at" | "applied_at" | "reverted_at">>,
  Expect<Equal<ColumnsOf<"content_type_revisions">, "seq" | "content_type_key" | "workspace_id" | "op" | "state_json" | "actor_id" | "principal_kind" | "delegated_by_workspace_id" | "delegated_by_id" | "recorded_at">>,
  Expect<Equal<ColumnsOf<"content_types">, "id" | "workspace_id" | "key" | "label" | "fields_json" | "status" | "version" | "tombstoned_at">>,
  Expect<Equal<ColumnsOf<"entries">, "id" | "workspace_id" | "type" | "slug" | "status" | "title" | "body_json" | "fields_json" | "published_at" | "created_at" | "updated_at" | "version" | "deleted_at">>,
  Expect<Equal<ColumnsOf<"entry_refs">, "id" | "workspace_id" | "source_entry_id" | "source_kind" | "field_path" | "target_kind" | "target_id">>,
  Expect<Equal<ColumnsOf<"entry_revisions">, "seq" | "entry_id" | "workspace_id" | "op" | "state_json" | "actor_id" | "delegated_by_workspace_id" | "delegated_by_id" | "recorded_at">>,
  Expect<Equal<ColumnsOf<"entry_terms">, "id" | "workspace_id" | "content_type" | "content_id" | "term_id" | "added_at">>,
  Expect<Equal<ColumnsOf<"form_delivery_jobs">, "job_id" | "workspace_id" | "submission_id" | "binding_id" | "adapter_id">>,
  Expect<Equal<ColumnsOf<"form_delivery_plans">, "workspace_id" | "submission_id" | "form_id">>,
  Expect<Equal<ColumnsOf<"form_receiver_pulls">, "workspace_id" | "receiver_key" | "lease_token" | "lease_expires_at" | "last_started_at">>,
  Expect<Equal<ColumnsOf<"form_submission_remote_receipts">, "workspace_id" | "destination_key" | "remote_id" | "submission_id" | "imported_at">>,
  Expect<Equal<ColumnsOf<"gated_mutation_tokens">, "confirmation_token" | "plan_hash" | "scope_id" | "confirmer_principal_id" | "status" | "created_at" | "expires_at">>,
  Expect<Equal<ColumnsOf<"identity_users">, "principal_id" | "workspace_id" | "username" | "email" | "password_hash" | "last_login_at" | "version">>,
  Expect<Equal<ColumnsOf<"media">, "id" | "workspace_id" | "created_by" | "kind" | "original_filename" | "title" | "slug" | "alt" | "caption" | "credit" | "source_sha256" | "source_metadata_json" | "status" | "created_at" | "updated_at" | "version" | "width" | "height" | "css_class" | "html_attributes">>,
  Expect<Equal<ColumnsOf<"media_slug_history">, "workspace_id" | "slug" | "media_id" | "retired_at">>,
  Expect<Equal<ColumnsOf<"member_consents">, "id" | "workspace_id" | "member_id" | "purpose" | "status" | "evidence_json" | "granted_at" | "revoked_at" | "created_at" | "updated_at" | "version">>,
  Expect<Equal<ColumnsOf<"member_external_identities">, "id" | "workspace_id" | "member_id" | "provider_id" | "issuer" | "subject" | "linked_at" | "unlinked_at">>,
  Expect<Equal<ColumnsOf<"member_magic_tokens">, "id" | "workspace_id" | "member_id" | "email" | "token_hash" | "code_hash" | "failed_attempts" | "purpose" | "created_at" | "expires_at" | "consumed_at">>,
  Expect<Equal<ColumnsOf<"member_revisions">, "seq" | "entity_kind" | "entity_id" | "workspace_id" | "member_id" | "purpose" | "op" | "before_json" | "after_json" | "origin_module" | "created_at">>,
  Expect<Equal<ColumnsOf<"member_sessions">, "id" | "workspace_id" | "member_id" | "token_hash" | "created_at" | "expires_at" | "revoked_at" | "last_seen_at" | "user_agent" | "ip">>,
  Expect<Equal<ColumnsOf<"member_subscriptions">, "id" | "workspace_id" | "member_id" | "tier_id" | "status" | "source" | "external_ref" | "started_at" | "current_period_end" | "canceled_at" | "created_at" | "updated_at" | "version">>,
  Expect<Equal<ColumnsOf<"member_tiers">, "id" | "workspace_id" | "name" | "slug" | "type" | "status" | "description" | "welcome_page_path" | "visible_in_portal" | "monthly_price_cents" | "yearly_price_cents" | "currency" | "created_at" | "updated_at" | "version">>,
  Expect<Equal<ColumnsOf<"members">, "id" | "workspace_id" | "email" | "name" | "email_verified_at" | "credentials_revoked_at" | "password_hash" | "status" | "note" | "fields_json" | "created_at" | "updated_at" | "version">>,
  Expect<Equal<ColumnsOf<"menus">, "id" | "workspace_id" | "slug" | "title" | "status" | "doc_json" | "locations_json" | "updated_at" | "version">>,
  Expect<Equal<ColumnsOf<"nav_location_bindings">, "workspace_id" | "location_key" | "menu_id" | "bound_at">>,
  Expect<Equal<ColumnsOf<"origin_settings">, "workspace_id" | "scheme" | "host" | "port" | "base_path" | "verified_at" | "source" | "redirect_allowlist_json" | "egress_allowlist_json">>,
  Expect<Equal<ColumnsOf<"outbox_events">, "id" | "workspace_id" | "event_json" | "status" | "attempts" | "next_attempt_at" | "last_error" | "created_at">>,
  Expect<Equal<ColumnsOf<"owner_mfa_factors">, "workspace_id" | "principal_id" | "sealed_secret" | "last_step">>,
  Expect<Equal<ColumnsOf<"owner_mfa_pending">, "workspace_id" | "principal_id" | "purpose" | "token_hash" | "expires_at" | "attempts" | "sealed_secret">>,
  Expect<Equal<ColumnsOf<"owner_passkeys">, "workspace_id" | "principal_id" | "credential_id" | "public_key" | "counter" | "rp_id">>,
  Expect<Equal<ColumnsOf<"owner_recovery_codes">, "workspace_id" | "principal_id" | "code_hash">>,
  Expect<Equal<ColumnsOf<"policies">, "id" | "workspace_id" | "name" | "description" | "is_builtin" | "is_frozen" | "version">>,
  Expect<Equal<ColumnsOf<"policy_permissions">, "id" | "workspace_id" | "policy_id" | "permission" | "resource_type" | "constraint_json">>,
  Expect<Equal<ColumnsOf<"presentation_settings">, "workspace_id" | "active_theme_id" | "updated_at">>,
  Expect<Equal<ColumnsOf<"principal_policies">, "id" | "workspace_id" | "principal_id" | "policy_id">>,
  Expect<Equal<ColumnsOf<"principal_roles">, "id" | "workspace_id" | "principal_id" | "role_id">>,
  Expect<Equal<ColumnsOf<"principals">, "id" | "workspace_id" | "kind" | "display_name" | "status" | "disabled_at" | "created_at">>,
  Expect<Equal<ColumnsOf<"role_policies">, "id" | "workspace_id" | "role_id" | "policy_id">>,
  Expect<Equal<ColumnsOf<"roles">, "id" | "workspace_id" | "name" | "is_builtin" | "version">>,
  Expect<Equal<ColumnsOf<"secrets_vault">, "workspace_id" | "id" | "kind" | "owner_key" | "principal_id" | "binding" | "provider" | "label" | "is_default" | "revision" | "sealed_key_id" | "sealed_ciphertext" | "sealed_nonce" | "sealed_alg" | "last4" | "token_length" | "meta" | "created_at" | "updated_at">>,
  Expect<Equal<ColumnsOf<"sessions">, "id" | "workspace_id" | "principal_id" | "token_hash" | "created_at" | "expires_at" | "revoked_at" | "ip" | "user_agent">>,
  Expect<Equal<ColumnsOf<"setting_definitions">, "setting_id" | "version" | "workspace_id" | "namespace" | "key" | "owner_kind" | "owner_id" | "schema_json" | "default_json" | "scopes" | "secret" | "status" | "alias_of_key" | "alias_of_ns" | "coercion_json" | "created_at" | "updated_at">>,
  Expect<Equal<ColumnsOf<"setting_revisions">, "seq" | "entity_kind" | "setting_id" | "scope" | "workspace_id" | "principal_id" | "op" | "before_json" | "after_json" | "def_version" | "actor" | "origin_plugin_id" | "change_set_id" | "created_at">>,
  Expect<Equal<ColumnsOf<"setting_values_global">, "setting_id" | "value_json" | "state" | "def_version" | "seq" | "updated_by" | "updated_at" | "origin_plugin_id">>,
  Expect<Equal<ColumnsOf<"setting_values_user">, "setting_id" | "workspace_id" | "principal_id" | "value_json" | "state" | "def_version" | "seq" | "updated_by" | "updated_at" | "origin_plugin_id">>,
  Expect<Equal<ColumnsOf<"setting_values_workspace">, "setting_id" | "workspace_id" | "value_json" | "state" | "def_version" | "seq" | "updated_by" | "updated_at" | "origin_plugin_id">>,
  Expect<Equal<ColumnsOf<"taxonomies">, "id" | "workspace_id" | "name" | "hierarchical" | "status" | "updated_at" | "version">>,
  Expect<Equal<ColumnsOf<"taxonomy_revisions">, "seq" | "workspace_id" | "taxonomy_id" | "op" | "previous_state_json" | "actor_id" | "recorded_at">>,
  Expect<Equal<ColumnsOf<"terms">, "id" | "workspace_id" | "taxonomy_id" | "parent_id" | "name" | "status" | "updated_at" | "version">>,
  Expect<Equal<ColumnsOf<"transform_registry">, "id" | "workspace_id" | "name" | "version" | "params_json" | "owner" | "created_at">>,
  Expect<Equal<ColumnsOf<"trashed_items">, "id" | "workspace_id" | "entity_type" | "entity_id" | "trashed_at" | "purge_after" | "actor_principal_id" | "actor_plugin_id" | "display_title" | "display_subtitle" | "entity_version" | "prior_marker" | "purge_lease_owner" | "purge_lease_expires_at">>,
  Expect<Equal<ColumnsOf<"webhook_deliveries">, "id" | "workspace_id" | "subscription_id" | "event_id" | "topic" | "payload_json" | "status" | "attempts" | "next_attempt_at" | "last_response_status" | "last_error" | "signed_with_version" | "created_at" | "delivered_at" | "dead_at">>,
  Expect<Equal<ColumnsOf<"webhook_subscriptions">, "id" | "workspace_id" | "owner_principal_id" | "label" | "target_url" | "topics_json" | "secret_version" | "previous_secret_version" | "status" | "created_by_principal_id" | "created_by_plugin_id" | "created_at" | "updated_at" | "version" | "disabled_at">>,
  Expect<Equal<ColumnsOf<"workspaces">, "id" | "name" | "slug" | "created_at" | "version">>,
];
