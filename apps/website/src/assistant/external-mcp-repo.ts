import { sql, type Selectable } from "kysely";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase, type SecretsVaultTable } from "@jini-ai/db/secrets-vault";
import { VaultError, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { externalMcpVaultEnvelope, persistExternalMcpVaultEnvelope, deleteExternalMcpVaultEnvelope } from "#src/assistant/external-mcp-vault";
import type { StorageKernel } from "../platform/db/kernel/port.js";

import type { UUID } from "@jini-ai/core/primitives";

import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort } from "#src/assistant/index";
import type { ContentKernel } from "../platform/db/content-kernel.js";
import type { ExternalMcpServersTable } from "../platform/db/content-database.generated.js";
import { toBool } from "../platform/db/kernel/dialect.js";

/**
 * @file THE `ExternalMcpServerRepoPort` adapter: one Kysely query body for every dialect (storage
 * plan §4, ADR-066) — the ADR-006 rule-of-two "second adapter" half;
 * `assistant/external-mcp-store.memory.ts` is the first. `sqlite/external-mcp-repo.sqlite.ts` is
 * the thin subclass the composition root builds from the content db handle.
 *
 * Secret envelopes live in Jini's vault, with two pointers on the server. Reads hydrate both
 * pointers in one query; writes join the host transaction before replacing pointers or status.
 *
 * One method here is NOT a plain translation: {@link SqlExternalMcpServerRepo.tryClaimOAuthRefreshLease}
 * is a compare-and-set, and it is the only place in this adapter where the SQL shape carries a
 * correctness guarantee rather than a storage detail. See its doc.
 */

type Row = Selectable<ExternalMcpServersTable>;
type ServerKey = { workspaceId: UUID; serverId: string };
type JoinedRow = Row & Record<string, unknown>;
type PayloadKind = "mcp-env" | "mcp-auth";
const vaultColumns = ["workspace_id", "id", "kind", "owner_key", "principal_id", "binding", "provider", "label", "is_default",
  "revision", "sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg", "last4", "token_length", "meta", "created_at", "updated_at"] as const;

function joinedEnvelope({ row, prefix, kind }: { row: JoinedRow; prefix: "env" | "oauth"; kind: PayloadKind }) {
  if (row[`${prefix}_secret_id`] === null) return null;
  const vault = Object.fromEntries(vaultColumns.map(column => [column, row[`${prefix}_${column}`]])) as unknown as SecretsVaultTable;
  assertJoinedContext({ vault, row, kind });
  return externalMcpVaultEnvelope({ record: toVaultRecord({ vault }) });
}

/** Refuses a joined payload that is not this server's own unscoped `kind` payload (or is missing). */
function assertJoinedContext({ vault, row, kind }: { vault: SecretsVaultTable; row: JoinedRow; kind: PayloadKind }): void {
  const invalidOwner = !vault.id || vault.workspace_id !== row.workspace_id || vault.owner_key !== row.server_id;
  const invalidScope = vault.kind !== kind || vault.principal_id !== null || vault.binding !== null;
  if (invalidOwner || invalidScope) throw new VaultError({ code: "context" });
}

/** The vault record behind a context-checked payload; one missing any sealed part is refused. */
function toVaultRecord({ vault }: { vault: SecretsVaultTable }): VaultRecord {
  const parts = [vault.sealed_key_id, vault.sealed_ciphertext, vault.sealed_nonce, vault.sealed_alg];
  if (parts.some(value => typeof value !== "string")) throw new VaultError({ code: "invalid-record" });
  return { workspaceId: vault.workspace_id, id: vault.id, kind: vault.kind, ownerKey: vault.owner_key,
    principalId: vault.principal_id, binding: vault.binding, provider: vault.provider, label: vault.label,
    isDefault: toBool(vault.is_default) ?? false, revision: Number(vault.revision),
    sealed: { keyId: vault.sealed_key_id!, ciphertext: vault.sealed_ciphertext!, nonce: vault.sealed_nonce!, alg: vault.sealed_alg! },
    last4: vault.last4, tokenLength: vault.token_length, meta: typeof vault.meta === "string" ? JSON.parse(vault.meta) : vault.meta,
    createdAt: vault.created_at, updatedAt: vault.updated_at };
}

function toRecord(row: JoinedRow): ExternalMcpServerRecord {
  const sealedEnv = joinedEnvelope({ row, prefix: "env", kind: "mcp-env" });
  const sealedOAuth = joinedEnvelope({ row, prefix: "oauth", kind: "mcp-auth" });
  return {
    workspaceId: row.workspace_id,
    serverId: row.server_id,
    label: row.label,
    provisionedByPluginId: row.provisioned_by_plugin_id,
    transport: row.transport,
    authMode: row.auth_mode,
    enabled: toBool(row.enabled) ?? false,
    command: row.command,
    url: row.url,
    args: row.args,
    allowedToolNames: row.allowed_tool_names,
    writeAllowedToolNames: row.write_allowed_tool_names,
    writeGrantsUpdatedByPrincipalId: row.write_grants_updated_by_principal_id,
    writeGrantsUpdatedAt: row.write_grants_updated_at,
    envNames: row.env_names,
    sealedEnv,
    oauthProviderId: row.oauth_provider_id,
    oauthGrant: row.oauth_grant,
    oauthClientId: row.oauth_client_id,
    oauthEndpointsJson: row.oauth_endpoints_json,
    oauthScopesJson: row.oauth_scopes_json,
    oauthStatus: row.oauth_status,
    oauthExpiresAt: row.oauth_expires_at,
    oauthTokenEnvName: row.oauth_token_env_name,
    oauthRefreshLeaseUntil: row.oauth_refresh_lease_until,
    sealedOAuth,
    aadVersion: 1,
    oauthAadVersion: 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: ExternalMcpServerRecord, pointers: { env_secret_id: string | null; oauth_secret_id: string | null }) {
  return {
    workspace_id: record.workspaceId,
    server_id: record.serverId,
    label: record.label,
    provisioned_by_plugin_id: record.provisionedByPluginId,
    transport: record.transport,
    auth_mode: record.authMode,
    enabled: record.enabled,
    command: record.command,
    url: record.url,
    args: record.args,
    allowed_tool_names: record.allowedToolNames,
    write_allowed_tool_names: record.writeAllowedToolNames,
    write_grants_updated_by_principal_id: record.writeGrantsUpdatedByPrincipalId,
    write_grants_updated_at: record.writeGrantsUpdatedAt,
    env_names: record.envNames,
    ...pointers,
    oauth_provider_id: record.oauthProviderId,
    oauth_grant: record.oauthGrant,
    oauth_client_id: record.oauthClientId,
    oauth_endpoints_json: record.oauthEndpointsJson,
    oauth_scopes_json: record.oauthScopesJson,
    oauth_status: record.oauthStatus,
    oauth_expires_at: record.oauthExpiresAt,
    oauth_token_env_name: record.oauthTokenEnvName,
    oauth_refresh_lease_until: record.oauthRefreshLeaseUntil,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SqlExternalMcpServerRepo implements ExternalMcpServerRepoPort {
  readonly vaultRepo: SqlSecretsVaultRepo;
  constructor(protected readonly kernel: ContentKernel) {
    this.vaultRepo = new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> });
  }

  /** One query hydrates both pointers for the entire roster, including empty rosters.
   * @complexity O(server count + envelope bytes); two indexed LEFT JOINs, no per-row I/O.
   */
  private async read({ workspaceId, serverId }: { workspaceId: UUID; serverId?: string }): Promise<ExternalMcpServerRecord[]> {
    const projection = (["env", "oauth"] as const).flatMap(prefix => vaultColumns.map(column => {
      const source = sql.ref(`${prefix}.${column}`);
      const alias = sql.ref(`${prefix}_${column}`);
      return sql`${source} AS ${alias}`;
    }));
    const serverFilter = serverId === undefined ? sql`` : sql`AND s.server_id=${serverId}`;
    const rows = await this.kernel.query<JoinedRow>(sql`SELECT s.*, ${sql.join(projection)} FROM external_mcp_servers s
      LEFT JOIN secrets_vault env ON env.workspace_id=s.workspace_id AND env.id=s.env_secret_id
      LEFT JOIN secrets_vault oauth ON oauth.workspace_id=s.workspace_id AND oauth.id=s.oauth_secret_id
      WHERE s.workspace_id=${workspaceId} ${serverFilter}`);
    return rows.map(toRecord);
  }

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]> {
    return this.read({ workspaceId });
  }

  async findByServerId(input: ServerKey): Promise<ExternalMcpServerRecord | null> {
    return (await this.read(input))[0] ?? null;
  }

  async upsert(record: ExternalMcpServerRecord): Promise<void> {
    await this.kernel.transaction(async () => {
      // Match Jini's writer lock before reading pointers, including callbacks and token refresh.
      await this.kernel.lockKey(`secrets_vault:${record.workspaceId}`);
      const previous = await this.kernel.run(db => db.selectFrom("external_mcp_servers")
        .select(["env_secret_id", "oauth_secret_id"]).where("workspace_id", "=", record.workspaceId)
        .where("server_id", "=", record.serverId).executeTakeFirst());
      const env_secret_id = await persistExternalMcpVaultEnvelope({ repo: this.vaultRepo, sealed: record.sealedEnv, identity: record, kind: "mcp-env" });
      const oauth_secret_id = await persistExternalMcpVaultEnvelope({ repo: this.vaultRepo, sealed: record.sealedOAuth, identity: record, kind: "mcp-auth" });
      const row = toRow(record, { env_secret_id, oauth_secret_id });
      await this.kernel.run(db => db.insertInto("external_mcp_servers").values(row)
        .onConflict(oc => oc.columns(["workspace_id", "server_id"]).doUpdateSet(row)).execute());
      // The upsert unlinks old pointers first; RESTRICT foreign keys remain satisfied throughout.
      if (previous?.env_secret_id !== env_secret_id) await deleteExternalMcpVaultEnvelope({ repo: this.vaultRepo, workspaceId: record.workspaceId, id: previous?.env_secret_id ?? null });
      if (previous?.oauth_secret_id !== oauth_secret_id) await deleteExternalMcpVaultEnvelope({ repo: this.vaultRepo, workspaceId: record.workspaceId, id: previous?.oauth_secret_id ?? null });
    });
  }

  async deleteByServerId(input: ServerKey): Promise<boolean> {
    return this.kernel.transaction(async () => {
      await this.kernel.lockKey(`secrets_vault:${input.workspaceId}`);
      const previous = await this.kernel.run(db => db.selectFrom("external_mcp_servers")
        .select(["env_secret_id", "oauth_secret_id"]).where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId).executeTakeFirst());
      if (!previous) return false;
      await this.kernel.run(db => db.deleteFrom("external_mcp_servers").where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId).execute());
      for (const id of [previous.env_secret_id, previous.oauth_secret_id]) await deleteExternalMcpVaultEnvelope({ repo: this.vaultRepo, workspaceId: input.workspaceId, id });
      return true;
    });
  }

  /**
   * Claims the OAuth refresh lease with a single conditional UPDATE.
   *
   * The condition is in the `WHERE`, not in a preceding `SELECT`, and that is the whole guarantee:
   * a read-then-write loses the race it exists to prevent, because between reading "no lease" and
   * writing "my lease" the other process does exactly the same and both go on to redeem the same
   * single-use rotating refresh token — which permanently kills the connection. The updated-row
   * count is therefore the answer, not a diagnostic. (One statement is atomic on every dialect: on
   * Postgres the second UPDATE waits for the first's row lock, then re-checks the `WHERE`.)
   *
   * A lease at or before `nowIso` is treated as abandoned, so a process that crashed mid-refresh
   * cannot wedge the connection until someone restarts something.
   *
   * @returns `true` when this caller now holds the lease.
   * @complexity O(1) — one indexed conditional UPDATE on the primary key.
   */
  async tryClaimOAuthRefreshLease(input: ServerKey & { nowIso: string; leaseUntil: string }): Promise<boolean> {
    const result = await this.kernel.run((db) =>
      db
        .updateTable("external_mcp_servers")
        .set({ oauth_refresh_lease_until: input.leaseUntil })
        .where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId)
        .where((eb) => eb.or([eb("oauth_refresh_lease_until", "is", null), eb("oauth_refresh_lease_until", "<=", input.nowIso)]))
        .executeTakeFirst()
    );
    return Number(result.numUpdatedRows) > 0;
  }

  async releaseOAuthRefreshLease(input: ServerKey): Promise<void> {
    await this.kernel.run((db) =>
      db
        .updateTable("external_mcp_servers")
        .set({ oauth_refresh_lease_until: null })
        .where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId)
        .execute()
    );
  }
}
