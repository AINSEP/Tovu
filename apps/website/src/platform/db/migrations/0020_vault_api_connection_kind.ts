import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Admits the `api-connection` vault kind (plugin-declared OAuth API connections: sealed token
 * sets, connection records and sign-in attempts) in `secrets_vault`'s kind CHECK.
 *
 * Why a migration: Jini's platform vault gained the kind, but the CHECK written by
 * `0012_secrets_vault` rejects it, and no existing kind can be borrowed (every other kind belongs to
 * a feature whose lists, copies and reseals would then see these rows).
 *
 * PostgreSQL swaps the named constraint. SQLite cannot alter a CHECK, so the table is rebuilt inside
 * the runner's transaction: `external_mcp_servers` points at vault rows with `ON DELETE RESTRICT`,
 * which SQLite never defers, so its pointers are parked in a temp table and nulled before the drop and
 * restored after. `legacy_alter_table` is on only for the rename, because the MCP pointer triggers name
 * `secrets_vault` and the modern rename re-checks them while the table is briefly absent. Dropping the
 * table also drops its own indexes and the `secrets_vault_mcp_identity` trigger, so both are re-created
 * from their stored text. This file owns its DDL edit: a database whose vault DDL is not the 0012 shape
 * is refused, never guessed at. The fresh-database constructor shares `widenedVaultTableDdl`.
 */
export const VAULT_API_CONNECTION_KIND_ID = "0020_vault_api_connection_kind";
const OLD_KINDS = "'source-control','mcp-env','mcp-auth')";
const NEW_KINDS = "'source-control','mcp-env','mcp-auth','api-connection')";
const KIND_LIST = "'site-assistant','personal-execution','media-provider','custom','publish-peer','database-destination','vendor','source-control','mcp-env','mcp-auth','api-connection'";

/** The 0012 table DDL with the widened kind list under the temporary name `secrets_vault_0020`.
 * @example widenedVaultTableDdl({ original: tableSql }) @throws {Error} Unexpected DDL. */
export function widenedVaultTableDdl({ original }: { original: string }, _options: Record<string, never> = {}): string {
  const [before, ...rest] = original.split(OLD_KINDS);
  // @ts-ignore frozen step (ADR-066, checksum-pinned code): `split` always yields a first element; only the strict desktop config flags it.
  if (rest.length !== 1 || !before.startsWith("CREATE TABLE secrets_vault (")) {
    throw new Error("secrets_vault does not have the 0012 shape; revise this migration before applying it");
  }
  // @ts-ignore frozen step (ADR-066, checksum-pinned code): `split` always yields a first element; only the strict desktop config flags it.
  return `${before.replace("CREATE TABLE secrets_vault (", "CREATE TABLE secrets_vault_0020 (")}${NEW_KINDS}${rest[0]}`;
}

async function upSqlite(kernel: StorageKernel<unknown>): Promise<void> {
  const [table] = await kernel.query<{ sql: string }>(sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'secrets_vault'`);
  if (!table) throw new Error("secrets_vault is missing; 0012_secrets_vault must run first");
  const objects = await kernel.query<{ sql: string }>(sql`SELECT sql FROM sqlite_master WHERE type IN ('index', 'trigger') AND tbl_name = 'secrets_vault' AND sql IS NOT NULL`);
  await kernel.execute(sql`PRAGMA defer_foreign_keys = ON`);
  await kernel.execute(sql`CREATE TEMP TABLE _vault_0020_pointers AS SELECT workspace_id, server_id, env_secret_id, oauth_secret_id
    FROM external_mcp_servers WHERE env_secret_id IS NOT NULL OR oauth_secret_id IS NOT NULL`);
  await kernel.execute(sql`UPDATE external_mcp_servers SET env_secret_id = NULL, oauth_secret_id = NULL
    WHERE env_secret_id IS NOT NULL OR oauth_secret_id IS NOT NULL`);
  await kernel.execute(sql.raw(widenedVaultTableDdl({ original: table.sql })));
  await kernel.execute(sql`INSERT INTO secrets_vault_0020 SELECT * FROM secrets_vault`);
  await kernel.execute(sql`DROP TABLE secrets_vault`);
  await kernel.execute(sql`PRAGMA legacy_alter_table = ON`);
  try {
    await kernel.execute(sql`ALTER TABLE secrets_vault_0020 RENAME TO secrets_vault`);
  } finally {
    await kernel.execute(sql`PRAGMA legacy_alter_table = OFF`);
  }
  for (const object of objects) await kernel.execute(sql.raw(object.sql));
  // The pointer triggers re-check kind and owner against the rebuilt vault on this restore.
  await kernel.execute(sql`UPDATE external_mcp_servers SET
    env_secret_id = (SELECT p.env_secret_id FROM _vault_0020_pointers p WHERE p.workspace_id = external_mcp_servers.workspace_id AND p.server_id = external_mcp_servers.server_id),
    oauth_secret_id = (SELECT p.oauth_secret_id FROM _vault_0020_pointers p WHERE p.workspace_id = external_mcp_servers.workspace_id AND p.server_id = external_mcp_servers.server_id)
    WHERE EXISTS (SELECT 1 FROM _vault_0020_pointers p WHERE p.workspace_id = external_mcp_servers.workspace_id AND p.server_id = external_mcp_servers.server_id)`);
  await kernel.execute(sql`DROP TABLE _vault_0020_pointers`);
}

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect === "sqlite") return upSqlite(kernel);
  await kernel.execute(sql.raw(`ALTER TABLE secrets_vault DROP CONSTRAINT secrets_vault_kind,
    ADD CONSTRAINT secrets_vault_kind CHECK(kind IN (${KIND_LIST}))`));
}

/** Widen the vault kind CHECK in both dialects. @example vaultApiConnectionKind({ checksum }) */
export function vaultApiConnectionKind(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: VAULT_API_CONNECTION_KIND_ID, checksum: required.checksum, up };
}
