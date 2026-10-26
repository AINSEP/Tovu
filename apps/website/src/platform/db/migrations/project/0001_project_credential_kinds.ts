import { sql } from "kysely";

import type { StorageKernel } from "../../kernel/port.js";
import type { MigrationStep } from "../step.js";

/**
 * @file Project step `0001_project_credential_kinds` (owner 2026-10-25: every key saves to the project
 * by default, so every site of the project can use it). `0000` admitted only `api-connection` rows
 * (provider-plugin settings); credentials are `vendor`/`custom` rows (custom API credentials,
 * publish hosts) and `source-control`/`publish-peer`/`media-provider` rows. SQLite cannot widen a
 * CHECK in place, so the table is rebuilt with the site's kind list (0012/0020, minus the kinds a
 * project never holds: personal and assistant rows, MCP env/auth) and the site's uniqueness indexes
 * (one default per group, unique labels), rows copied as they are. The runner holds the step in one
 * transaction, so a failure leaves `0000`'s table untouched. SQLite only, like `0000`.
 *
 * Frozen here: the pinned checksum hashes this file.
 */

export const PROJECT_CREDENTIAL_KINDS_ID = "0001_project_credential_kinds";

const GROUP = "workspace_id, kind, owner_key, (principal_id IS NULL), coalesce(principal_id, ''), (provider IS NULL), coalesce(provider, '')";

export const PROJECT_CREDENTIAL_KINDS_STATEMENTS: readonly string[] = [
  `CREATE TABLE secrets_vault_next (
  workspace_id      TEXT NOT NULL,
  id                TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('api-connection', 'vendor', 'custom', 'source-control', 'publish-peer', 'media-provider')),
  owner_key         TEXT NOT NULL CHECK (owner_key = 'tovu'),
  principal_id      TEXT CHECK (principal_id IS NULL),
  binding           TEXT,
  provider          TEXT,
  label             TEXT NOT NULL,
  is_default        INTEGER NOT NULL CHECK (is_default IN (0,1)),
  revision          INTEGER NOT NULL CHECK (revision > 0),
  sealed_key_id     TEXT,
  sealed_ciphertext TEXT,
  sealed_nonce      TEXT,
  sealed_alg        TEXT,
  last4             TEXT,
  token_length      INTEGER CHECK (token_length IS NULL OR token_length >= 0),
  meta              TEXT NOT NULL CHECK (json_valid(meta) AND json_type(meta) = 'object'),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CHECK ((sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL AND sealed_alg IS NULL)
    OR (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL AND sealed_alg IS NOT NULL)),
  CHECK (kind <> 'media-provider' OR provider IS NOT NULL),
  CHECK (kind NOT IN ('custom', 'publish-peer') OR provider IS NULL),
  CHECK (last4 IS NULL OR (token_length IS NOT NULL AND token_length >= 12 AND length(last4) = 4))
)`,
  `INSERT INTO secrets_vault_next SELECT workspace_id, id, kind, owner_key, principal_id, binding, provider, label, is_default, revision,
  sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg, last4, token_length, meta, created_at, updated_at FROM secrets_vault`,
  `DROP TABLE secrets_vault`,
  `ALTER TABLE secrets_vault_next RENAME TO secrets_vault`,
  `CREATE INDEX secrets_vault_scope ON secrets_vault(workspace_id, kind, owner_key, principal_id, provider)`,
  `CREATE UNIQUE INDEX secrets_vault_media ON secrets_vault(workspace_id, kind, provider) WHERE kind = 'media-provider'`,
  `CREATE UNIQUE INDEX secrets_vault_default ON secrets_vault(${GROUP}) WHERE is_default = 1`,
  `CREATE UNIQUE INDEX secrets_vault_group_label ON secrets_vault(${GROUP}, label) WHERE kind IN ('vendor', 'source-control')`,
  `CREATE UNIQUE INDEX secrets_vault_label ON secrets_vault(workspace_id, kind, label) WHERE kind IN ('custom', 'publish-peer')`,
];

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect !== "sqlite") return;
  for (const statement of PROJECT_CREDENTIAL_KINDS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

export const projectCredentialKinds = (checksum: string): MigrationStep => ({ id: PROJECT_CREDENTIAL_KINDS_ID, checksum, up });
