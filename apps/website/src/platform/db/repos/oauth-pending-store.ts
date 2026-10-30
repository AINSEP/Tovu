import { nowIso as readNowIso, type Clock } from "@jini-ai/core/primitives";

import type { Insertable, Selectable } from "kysely";

import type { ISODateTime, UUID } from "@jini-ai/core/primitives";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "#src/features/webhooks/index";
import type { DeviceAuthorization } from "@jini-ai/oauth";
import type { DeviceAuthorizationStore } from "../../../features/external-mcp/contracts.js";
import type { ContentKernel } from "../content-kernel.js";
import type { OauthDeviceAuthorizationsTable } from "../content-database.generated.js";


/**
 * @file Durable cross-process device authorizations (ADR-066), one Kysely body for all dialects.
 * The agent daemon and polling routes open separate handles, so their device attempts must share
 * the content database. The RFC 8628 device_code remains sealed with the shared sealer/keyring and
 * AAD-bound to workspace + server: copying ciphertext across either identity fails authentication.
 * Expired rows are pruned on access rather than by a background timer; no plaintext is logged.
 * Step 0012 retires the unused redirect-table adapter. Redirect/PKCE now uses Jini's sealed state.
 */

/** Device envelopes share these four columns in both read and write directions. */
interface SealedColumns {
  readonly sealed_key_id: string;
  readonly sealed_ciphertext: string;
  readonly sealed_nonce: string;
  readonly sealed_alg: string;
}

function toSealedSecret(row: SealedColumns): SealedSecret {
  return { keyId: row.sealed_key_id, ciphertext: row.sealed_ciphertext, nonce: row.sealed_nonce, alg: row.sealed_alg };
}

function sealedColumnValues(sealed: SealedSecret): SealedColumns {
  return { sealed_key_id: sealed.keyId, sealed_ciphertext: sealed.ciphertext, sealed_nonce: sealed.nonce, sealed_alg: sealed.alg };
}

export interface SqlDeviceAuthorizationStoreDeps {
  readonly kernel: ContentKernel;
  readonly workspaceId: UUID;
  readonly clock: Clock;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
}

/** The AAD every sealed `device_code` is bound to — identical shape to
 *  `assistant/external-mcp-oauth.ts`'s `ownerKeyOf`, restated here rather than imported so this
 *  storage-only file does not have to reach into that module for a two-field template string.
 *  Exported so the vault inventory/recovery scan opens retained device rows through this store's own
 *  AAD rather than a restated copy. */
export function deviceAad(workspaceId: UUID, serverId: string): string {
  return `${workspaceId}:${serverId}`;
}

/**
 * Builds a content-database-backed `DeviceAuthorizationStore`, scoped to one workspace — matching
 * how `ExternalMcpOAuthDeps` (and therefore every caller of this factory) is already
 * single-workspace-scoped.
 *
 * @returns The store. Never throws at construction.
 * @complexity `put` is one seal plus one upsert; `get` is one indexed read plus, on a hit, one
 *   unseal; `delete` is one indexed delete. All O(1).
 */
export function createSqlDeviceAuthorizationStore(deps: SqlDeviceAuthorizationStoreDeps, _optional: Record<string, never> = {}): DeviceAuthorizationStore {
  const { kernel } = deps;
  return {
    async put(serverId, authorization) {
      const sealed = await deps.sealer.seal({
        plaintext: authorization.deviceCode,
        key: await deps.keyring.activeKey(),
        aad: deviceAad(deps.workspaceId, serverId),
      });
      const row: Insertable<OauthDeviceAuthorizationsTable> = {
        workspace_id: deps.workspaceId,
        server_id: serverId,
        user_code: authorization.userCode,
        verification_uri: authorization.verificationUri,
        verification_uri_complete: authorization.verificationUriComplete,
        interval_seconds: authorization.intervalSeconds,
        expires_at: authorization.expiresAt,
        ...sealedColumnValues(sealed),
        created_at: readNowIso({ clock: deps.clock }),
      };
      await kernel.run((db) =>
        db
          .insertInto("oauth_device_authorizations")
          .values(row)
          .onConflict((oc) => oc.columns(["workspace_id", "server_id"]).doUpdateSet(row))
          .execute()
      );
    },

    async get(serverId) {
      const row: Selectable<OauthDeviceAuthorizationsTable> | undefined = await kernel.run((db) =>
        db
          .selectFrom("oauth_device_authorizations")
          .selectAll()
          .where("workspace_id", "=", deps.workspaceId)
          .where("server_id", "=", serverId)
          .executeTakeFirst()
      );
      if (!row) return undefined;
      const deviceCode = await deps.sealer.open({ sealed: toSealedSecret(row) }, { aad: deviceAad(deps.workspaceId, serverId) });
      const authorization: DeviceAuthorization = {
        deviceCode,
        userCode: row.user_code,
        verificationUri: row.verification_uri,
        verificationUriComplete: row.verification_uri_complete,
        expiresAt: row.expires_at as ISODateTime,
        intervalSeconds: row.interval_seconds,
      };
      return authorization;
    },

    async delete(serverId) {
      await kernel.run((db) =>
        db.deleteFrom("oauth_device_authorizations").where("workspace_id", "=", deps.workspaceId).where("server_id", "=", serverId).execute()
      );
    },
  };
}
