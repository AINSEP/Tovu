/**
 * @file Which core tables a database COPY leaves out, and why. Owner decision 2026-09-27 (Q2 in
 * `ADS-memory/reports/2026-09-27-assistant-db-transfer-plan.md`): a plain copy excludes logins and
 * saved keys — password hashes, session and sign-in tokens, and every sealed credential. They are
 * copied only at switch time, when the site will actually run on the target.
 *
 * {@link SECRET_COLUMN_PATTERN} is the backstop: a table that grows a column shaped like a secret and
 * is not named here fails `exclusions.unit.test.ts`, so a new credential table can never ride along
 * silently.
 */

export type TransferExclusionReason = "login" | "saved-key" | "temporary";

export const TRANSFER_EXCLUSION_REASON_TEXT: Readonly<Record<TransferExclusionReason, string>> = {
  login: "logins (password hashes, sessions and sign-in links) are not copied",
  "saved-key": "saved keys and credentials are not copied",
  temporary: "short-lived confirmation data is not copied",
};

/** SQL table name -> why it is left out. */
export const EXCLUDED_CORE_TABLES: Readonly<Record<string, TransferExclusionReason>> = {
  identity_users: "login",
  sessions: "login",
  api_keys: "login",
  member_sessions: "login",
  member_magic_tokens: "login",
  admin_execution_credentials: "saved-key",
  custom_credential_sets: "saved-key",
  external_mcp_servers: "saved-key",
  media_provider_credentials: "saved-key",
  oauth_device_authorizations: "saved-key",
  oauth_pending_authorizations: "saved-key",
  publish_content_peers: "saved-key",
  publish_credential_sets: "saved-key",
  site_assistant_credentials: "saved-key",
  source_control_credential_sets: "saved-key",
  vendor_credential_sets: "saved-key",
  gated_mutation_tokens: "temporary",
};

/** A column name that holds (or seals) a secret: `sealed_*`, `*_sealed_*`, `password*`, `*_token_hash`, `key_hash`. */
export const SECRET_COLUMN_PATTERN = /(^|_)(sealed|password|token_hash|key_hash)(_|$)/;
