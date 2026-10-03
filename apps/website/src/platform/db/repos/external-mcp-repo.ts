import type { Insertable, Selectable } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";

import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort } from "#src/assistant/index";
import type { ContentKernel } from "../content-kernel.js";
import type { ExternalMcpServersTable } from "../content-database.generated.js";
import { toBool } from "../kernel/dialect.js";

/**
 * @file THE `ExternalMcpServerRepoPort` adapter: one Kysely query body for every dialect (storage
 * plan §4, ADR-066) — the ADR-006 rule-of-two "second adapter" half;
 * `assistant/external-mcp-store.memory.ts` is the first. `sqlite/external-mcp-repo.sqlite.ts` is
 * the thin subclass the composition root builds from the content db handle.
 *
 * Both `sealed_*` groups are moved as opaque units — this file never inspects or validates their
 * contents (that is `AesGcmSecretSealer`'s and `external-mcp-store.ts`'s job); it only translates
 * each group's all-null-or-all-set shape into and out of `SealedSecret | null`.
 *
 * One method here is NOT a plain translation: {@link SqlExternalMcpServerRepo.tryClaimOAuthRefreshLease}
 * is a compare-and-set, and it is the only place in this adapter where the SQL shape carries a
 * correctness guarantee rather than a storage detail. See its doc.
 */

type Row = Selectable<ExternalMcpServersTable>;
type ServerKey = { workspaceId: UUID; serverId: string };

function toRecord(row: Row): ExternalMcpServerRecord {
  const sealedEnv =
    row.sealed_key_id !== null && row.sealed_ciphertext !== null && row.sealed_nonce !== null && row.sealed_alg !== null
      ? { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg }
      : null;
  const sealedOAuth =
    row.oauth_sealed_key_id !== null && row.oauth_sealed_ciphertext !== null && row.oauth_sealed_nonce !== null && row.oauth_sealed_alg !== null
      ? { keyId: row.oauth_sealed_key_id, ciphertext: row.oauth_sealed_ciphertext, nonce: row.oauth_sealed_nonce, alg: row.oauth_sealed_alg }
      : null;
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
    aadVersion: row.aad_version,
    oauthAadVersion: row.oauth_aad_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(record: ExternalMcpServerRecord): Insertable<ExternalMcpServersTable> {
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
    sealed_key_id: record.sealedEnv?.keyId ?? null,
    sealed_ciphertext: record.sealedEnv?.ciphertext ?? null,
    sealed_nonce: record.sealedEnv?.nonce ?? null,
    sealed_alg: record.sealedEnv?.alg ?? null,
    oauth_provider_id: record.oauthProviderId,
    oauth_grant: record.oauthGrant,
    oauth_client_id: record.oauthClientId,
    oauth_endpoints_json: record.oauthEndpointsJson,
    oauth_scopes_json: record.oauthScopesJson,
    oauth_status: record.oauthStatus,
    oauth_expires_at: record.oauthExpiresAt,
    oauth_token_env_name: record.oauthTokenEnvName,
    oauth_refresh_lease_until: record.oauthRefreshLeaseUntil,
    oauth_sealed_key_id: record.sealedOAuth?.keyId ?? null,
    oauth_sealed_ciphertext: record.sealedOAuth?.ciphertext ?? null,
    oauth_sealed_nonce: record.sealedOAuth?.nonce ?? null,
    oauth_sealed_alg: record.sealedOAuth?.alg ?? null,
    aad_version: record.aadVersion,
    oauth_aad_version: record.oauthAadVersion,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export class SqlExternalMcpServerRepo implements ExternalMcpServerRepoPort {
  constructor(protected readonly kernel: ContentKernel) {}

  async listByWorkspaceId(workspaceId: UUID): Promise<ExternalMcpServerRecord[]> {
    const rows = await this.kernel.run((db) =>
      db.selectFrom("external_mcp_servers").selectAll().where("workspace_id", "=", workspaceId).execute()
    );
    return rows.map(toRecord);
  }

  async findByServerId(input: ServerKey): Promise<ExternalMcpServerRecord | null> {
    const row = await this.kernel.run((db) =>
      db
        .selectFrom("external_mcp_servers")
        .selectAll()
        .where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId)
        .executeTakeFirst()
    );
    return row ? toRecord(row) : null;
  }

  async upsert(record: ExternalMcpServerRecord): Promise<void> {
    const row = toRow(record);
    await this.kernel.run((db) =>
      db
        .insertInto("external_mcp_servers")
        .values(row)
        .onConflict((oc) => oc.columns(["workspace_id", "server_id"]).doUpdateSet(row))
        .execute()
    );
  }

  async deleteByServerId(input: ServerKey): Promise<boolean> {
    const result = await this.kernel.run((db) =>
      db
        .deleteFrom("external_mcp_servers")
        .where("workspace_id", "=", input.workspaceId)
        .where("server_id", "=", input.serverId)
        .executeTakeFirst()
    );
    return Number(result.numDeletedRows) > 0;
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
