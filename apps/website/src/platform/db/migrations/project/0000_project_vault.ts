import { sql } from "kysely";

import type { StorageKernel } from "../../kernel/port.js";
import type { MigrationStep } from "../step.js";

/**
 * @file Project step `0000_project_vault` (provider wave 2 fix, owner 2026-10-25): `project.db`'s one
 * table, `secrets_vault`, in the SAME row shape as a site's content.db `secrets_vault` (0012/0013/0020)
 * so the same `@jini-ai/db/secrets-vault` repo and vault service read it. Differences, on purpose:
 * no foreign keys (a project has no `workspaces`/`principals` tables; its rows use workspace
 * `'project'`), and only the `api-connection` kind (plugin-state rows: provider-plugin settings).
 * Every statement is `IF NOT EXISTS`. SQLite only: Postgres hosts are single-site (Fly), where the
 * project is the site and the site vault is used instead.
 *
 * Frozen here: the pinned checksum hashes this file.
 */

export const PROJECT_VAULT_ID = "0000_project_vault";

export const PROJECT_VAULT_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS secrets_vault (
  workspace_id      TEXT NOT NULL,
  id                TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('api-connection')),
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
  CHECK (last4 IS NULL OR (token_length IS NOT NULL AND token_length >= 12 AND length(last4) = 4))
)`,
  `CREATE INDEX IF NOT EXISTS secrets_vault_scope ON secrets_vault(workspace_id, kind, owner_key, principal_id, provider)`,
];

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect !== "sqlite") return;
  for (const statement of PROJECT_VAULT_STATEMENTS) await kernel.execute(sql.raw(statement));
}

export const projectVault = (checksum: string): MigrationStep => ({ id: PROJECT_VAULT_ID, checksum, up });
