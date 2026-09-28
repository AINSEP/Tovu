import { randomBytes } from "node:crypto";

import type { Insertable, Selectable } from "kysely";

import type { ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "#src/features/webhooks/index";
import type { DeviceAuthorizationStore } from "#src/assistant/external-mcp-oauth";
import {
  invalidPendingAuthorizationState,
  PENDING_AUTHORIZATION_DEFAULT_MAX_ENTRIES,
  PENDING_AUTHORIZATION_DEFAULT_TTL_MS,
  PENDING_AUTHORIZATION_STATE_BYTES,
  secureEqualsForOwnerBinding,
  type DeviceAuthorization,
  type OAuthClock,
  type OAuthRandomBytes,
  type PendingAuthorization,
  type PendingAuthorizationStore,
} from "#src/platform/oauth/index";
import type { ContentKernel } from "../content-kernel.js";
import type { OauthDeviceAuthorizationsTable } from "../content-database.generated.js";


/**
 * @file Real, cross-process `PendingAuthorizationStore`/`DeviceAuthorizationStore` adapters — the
 * ADR-006 rule-of-two "second adapter" half for both ports; `platform/oauth/pending-authorizations.ts`'s
 * `createPendingAuthorizationStore` and `assistant/external-mcp-oauth.ts`'s
 * `createDeviceAuthorizationStore` are the first (in-memory) half of each pair. One Kysely query
 * body for every dialect (storage plan §4, ADR-066); `sqlite/oauth-pending-store.sqlite.ts` keeps
 * the `createSqlite*` factories the composition root builds from the content db handle.
 *
 * ## Why this file exists at all
 *
 * `assistant/external-mcp-oauth.ts`'s header records the defect this closes: `external_mcp_oauth_connect`
 * is an assistant tool, so it runs inside the agent daemon, while the public OAuth callback that
 * completes the SAME handshake runs inside the main web server — two separate OS processes. An
 * in-memory store in either process is invisible to the other, so a chat-initiated browser-redirect
 * connect could mint a `state`/PKCE record that no callback route could ever redeem. Both processes
 * already open the same `content.db`; storing the handshake there instead of in a `Map` is what
 * makes either one able to finish what the other started.
 *
 * ## Security posture — unchanged from the in-memory adapters
 *
 * Every property `pending-authorizations.ts`'s header documents still holds: `state` is still 24
 * random bytes, still single-use, still expiring, still owner-bound. What changes is only WHERE the
 * ledger lives:
 *
 * - **Single-use, atomically, across processes.** the pending store's `take` is one
 *   `DELETE ... WHERE state = ? AND expires_at > ? RETURNING *` statement — the same
 *   condition-in-the-`WHERE`-not-a-preceding-`SELECT` shape `repos/external-mcp-repo.ts`'s
 *   `tryClaimOAuthRefreshLease` uses, and for the identical reason: a read-then-delete loses the
 *   race it exists to prevent. Two processes racing to redeem the same `state` can each only ever
 *   delete it once; the loser's statement affects zero rows and sees "not found", never the winner's
 *   data. The owner check runs AFTER the row is gone, matching the in-memory adapter's own ordering
 *   (a caller who guesses a `state` and fails the owner check must still burn it).
 * - **Bounded, across processes.** `put`'s prune, cap check, eviction and insert run in one kernel
 *   transaction under `lockKey` on the table (SQLite: `BEGIN IMMEDIATE` already holds the write
 *   lock; Postgres: an advisory lock — READ COMMITTED alone would let two puts both count under
 *   the cap and both insert).
 * - **Secrets stay sealed at rest.** `code_verifier` (RFC 7636) and `device_code` (RFC 8628) are the
 *   two values these flows would otherwise write to disk in the clear. Both are sealed through the
 *   SAME ADR-058 `SecretSealerPort`/`KeyringPort` instances `external_mcp_servers`' credential
 *   columns already share, AAD-bound to the row's own owner/identity key so a ciphertext copied into
 *   a different row's columns fails auth-tag verification instead of opening. Neither value is ever
 *   logged — this file never constructs a log line that could carry one.
 * - **Nothing here is more durable than it needs to be.** Both tables carry `expires_at`
 *   (`oauth_pending_authorizations`) or inherit the caller's own device-code expiry
 *   (`oauth_device_authorizations`, via `DeviceAuthorization.expiresAt`), and `put` opportunistically
 *   prunes expired rows the same way the in-memory adapter prunes its `Map` — on access, not on a
 *   timer.
 */

/** One `SealedSecret`'s four columns, factored out because both tables carry an identical sealed
 *  group and both directions (row -> `SealedSecret`, `SealedSecret` -> row values) need it. */
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

/** `count(*)` arrives as a number (SQLite) or a numeric string (Postgres bigint). */
function countOf(row: { n: number | string | bigint } | undefined): number {
  return Number(row?.n ?? 0);
}

export interface SqlPendingAuthorizationStoreDeps {
  readonly kernel: ContentKernel;
  readonly clock: OAuthClock;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  /** Injected only so tests can pin `state`. Defaults to `node:crypto`'s CSPRNG — same default the
   *  in-memory adapter uses. */
  readonly randomBytesFn?: OAuthRandomBytes;
}

/**
 * Builds a content-database-backed `PendingAuthorizationStore`.
 *
 * @returns The store. Never throws at construction — sealing failures surface from `put`/`take`
 *   themselves, the same as every other ADR-058 consumer in this codebase.
 * @complexity `put` is one seal, then one transaction holding a prune DELETE, a bounded eviction
 *   loop (at most `maxEntries` iterations, each O(1) and indexed), and one INSERT. `take` is one
 *   indexed conditional DELETE plus one unseal on a hit. Both are effectively constant since
 *   `maxEntries` bounds the live row count.
 */
export function createSqlPendingAuthorizationStore(deps: SqlPendingAuthorizationStoreDeps): PendingAuthorizationStore {
  const { kernel } = deps;
  const ttlMs = deps.ttlMs ?? PENDING_AUTHORIZATION_DEFAULT_TTL_MS;
  const maxEntries = deps.maxEntries ?? PENDING_AUTHORIZATION_DEFAULT_MAX_ENTRIES;
  const randomBytesFn = deps.randomBytesFn ?? ((n: number) => randomBytes(n));

  /** Deletes every row past its TTL. Run on every `put` (inside its transaction) and `size`,
   *  matching the in-memory adapter's own prune-on-access (not on a timer) tradeoff. */
  async function pruneExpired(nowIso: string): Promise<void> {
    await kernel.run((db) => db.deleteFrom("oauth_pending_authorizations").where("expires_at", "<=", nowIso).execute());
  }

  async function count(): Promise<number> {
    return countOf(await kernel.run((db) => db.selectFrom("oauth_pending_authorizations").select((eb) => eb.fn.countAll<number | string>().as("n")).executeTakeFirst()));
  }

  /** Evicts the single oldest row when at or over `maxEntries`, looping defensively in case more
   *  than one row needs to go (a lowered `maxEntries` between calls, say) — mirrors the in-memory
   *  adapter's own `while` loop over its `Map`'s insertion order. Runs inside `put`'s locked
   *  transaction, so the count/evict sequence cannot interleave with another process's insert. */
  async function evictOverCap(): Promise<void> {
    for (;;) {
      if ((await count()) < maxEntries) return;
      const oldest = await kernel.run((db) =>
        db.selectFrom("oauth_pending_authorizations").select("state").orderBy("created_at", "asc").limit(1).executeTakeFirst()
      );
      if (!oldest) return;
      await kernel.run((db) => db.deleteFrom("oauth_pending_authorizations").where("state", "=", oldest.state).execute());
    }
  }

  return {
    async put(input) {
      const nowIso = deps.clock.nowIso();
      const state = Buffer.from(randomBytesFn(PENDING_AUTHORIZATION_STATE_BYTES)).toString("base64url");
      const expiresAt = new Date(Date.parse(nowIso) + ttlMs).toISOString();
      // Sealed even when `codeVerifier` is `""` (a non-PKCE provider) — see this table's schema doc
      // on why the sealed columns are always fully populated rather than conditionally null.
      // Sealed BEFORE the write transaction opens: holding the write lock across the seal's awaits
      // would keep every other writer waiting on crypto.
      const sealed = await deps.sealer.seal({
        plaintext: input.codeVerifier,
        key: await deps.keyring.activeKey(),
        aad: input.ownerKey,
      });

      // See this file's header ("Bounded, across processes") — the race the cap tests guard against.
      await kernel.transaction(async () => {
        await kernel.lockKey("oauth_pending_authorizations");
        await pruneExpired(nowIso);
        await evictOverCap();
        await kernel.run((db) =>
          db
            .insertInto("oauth_pending_authorizations")
            .values({
              state,
              owner_key: input.ownerKey,
              provider_id: input.providerId,
              ...sealedColumnValues(sealed),
              redirect_uri: input.redirectUri,
              scopes_json: JSON.stringify(input.scopes),
              created_at: nowIso,
              expires_at: expiresAt,
            })
            .execute()
        );
      });

      const entry: PendingAuthorization = {
        state,
        ownerKey: input.ownerKey,
        providerId: input.providerId,
        codeVerifier: input.codeVerifier,
        redirectUri: input.redirectUri,
        scopes: input.scopes,
        createdAt: nowIso as ISODateTime,
        expiresAt: expiresAt as ISODateTime,
      };
      return entry;
    },

    async take(input) {
      const nowIso = deps.clock.nowIso();
      // Atomic consume: see this file's header for why the expiry check belongs in the `WHERE`
      // rather than a preceding `SELECT`. A miss here means unknown, already-expired, OR
      // already-consumed — this store cannot and need not tell those apart (see `invalidState`'s
      // own doc on why one error code covers all four cases).
      const row = await kernel.run((db) =>
        db
          .deleteFrom("oauth_pending_authorizations")
          .where("state", "=", input.state)
          .where("expires_at", ">", nowIso)
          .returningAll()
          .executeTakeFirst()
      );
      if (!row) throw invalidPendingAuthorizationState();
      // Consumed BEFORE the owner check, not after — identical ordering to the in-memory adapter,
      // and for the identical reason (a caller who guesses a `state` must still burn it).
      if (!secureEqualsForOwnerBinding(row.owner_key, input.ownerKey)) throw invalidPendingAuthorizationState();

      const codeVerifier = await deps.sealer.open({ sealed: toSealedSecret(row), aad: row.owner_key });
      const entry: PendingAuthorization = {
        state: row.state,
        ownerKey: row.owner_key,
        providerId: row.provider_id,
        codeVerifier,
        redirectUri: row.redirect_uri,
        scopes: JSON.parse(row.scopes_json) as string[],
        createdAt: row.created_at as ISODateTime,
        expiresAt: row.expires_at as ISODateTime,
      };
      return entry;
    },

    async size() {
      await pruneExpired(deps.clock.nowIso());
      return count();
    },
  };
}

export interface SqlDeviceAuthorizationStoreDeps {
  readonly kernel: ContentKernel;
  readonly workspaceId: UUID;
  readonly clock: OAuthClock;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
}

/** The AAD every sealed `device_code` is bound to — identical shape to
 *  `assistant/external-mcp-oauth.ts`'s `ownerKeyOf`, restated here rather than imported so this
 *  storage-only file does not have to reach into that module for a two-field template string.
 *  Exported so `server/runtime/composition/sealed-credential-descriptors.ts` opens these rows through this store's own
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
export function createSqlDeviceAuthorizationStore(deps: SqlDeviceAuthorizationStoreDeps): DeviceAuthorizationStore {
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
        created_at: deps.clock.nowIso(),
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
      const deviceCode = await deps.sealer.open({ sealed: toSealedSecret(row), aad: deviceAad(deps.workspaceId, serverId) });
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
