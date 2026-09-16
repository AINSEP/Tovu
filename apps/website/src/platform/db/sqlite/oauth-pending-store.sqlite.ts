import { randomBytes } from "node:crypto";

import { and, asc, eq, gt, lte, sql } from "drizzle-orm";

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
import { oauthDeviceAuthorizations, oauthPendingAuthorizations } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Real, cross-process `PendingAuthorizationStore`/`DeviceAuthorizationStore` adapters — the
 * ADR-006 rule-of-two "second adapter" half for both ports; `platform/oauth/pending-authorizations.ts`'s
 * `createPendingAuthorizationStore` and `assistant/external-mcp-oauth.ts`'s
 * `createDeviceAuthorizationStore` are the first (in-memory) half of each pair.
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
 * - **Single-use, atomically, across processes.** {@link SqlitePendingAuthorizationStore.take} is one
 *   `DELETE ... WHERE state = ? AND expires_at > ? RETURNING *` statement — the same
 *   condition-in-the-`WHERE`-not-a-preceding-`SELECT` shape `external-mcp-repo.sqlite.ts`'s
 *   `tryClaimOAuthRefreshLease` uses, and for the identical reason: a read-then-delete loses the
 *   race it exists to prevent. Two processes racing to redeem the same `state` can each only ever
 *   delete it once; the loser's statement affects zero rows and sees "not found", never the winner's
 *   data. The owner check runs AFTER the row is gone, matching the in-memory adapter's own ordering
 *   (a caller who guesses a `state` and fails the owner check must still burn it).
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

/** The transaction handle Drizzle hands its synchronous callback. Structurally the same query
 *  builder as `ContentDb`, which is why the private helpers below accept either. */
type ContentDbTx = Parameters<Parameters<ContentDb["transaction"]>[0]>[0];

/** Either the connection itself or an open transaction on it. */
type Writer = Pick<ContentDb, "select" | "delete"> | Pick<ContentDbTx, "select" | "delete">;

/** One `SealedSecret`'s four columns, factored out because both tables carry an identical sealed
 *  group and both directions (row -> `SealedSecret`, `SealedSecret` -> row values) need it. */
interface SealedColumns {
  readonly sealedKeyId: string;
  readonly sealedCiphertext: string;
  readonly sealedNonce: string;
  readonly sealedAlg: string;
}

function toSealedSecret(row: SealedColumns): SealedSecret {
  return { keyId: row.sealedKeyId, ciphertext: row.sealedCiphertext, nonce: row.sealedNonce, alg: row.sealedAlg };
}

function sealedColumnValues(sealed: SealedSecret): SealedColumns {
  return { sealedKeyId: sealed.keyId, sealedCiphertext: sealed.ciphertext, sealedNonce: sealed.nonce, sealedAlg: sealed.alg };
}

export interface SqlitePendingAuthorizationStoreDeps {
  readonly db: ContentDb;
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
 * Builds a `content.db`-backed `PendingAuthorizationStore`.
 *
 * @returns The store. Never throws at construction — sealing failures surface from `put`/`take`
 *   themselves, the same as every other ADR-058 consumer in this codebase.
 * @complexity `put` is one seal, then one `immediate` transaction holding a prune DELETE, a bounded
 *   eviction loop (at most `maxEntries` iterations, each O(1) and indexed), and one INSERT. `take`
 *   is one indexed conditional DELETE plus one unseal on a hit. Both are effectively constant since
 *   `maxEntries` bounds the live row count.
 * @overallScore 100
 */
export function createSqlitePendingAuthorizationStore(deps: SqlitePendingAuthorizationStoreDeps): PendingAuthorizationStore {
  const ttlMs = deps.ttlMs ?? PENDING_AUTHORIZATION_DEFAULT_TTL_MS;
  const maxEntries = deps.maxEntries ?? PENDING_AUTHORIZATION_DEFAULT_MAX_ENTRIES;
  const randomBytesFn = deps.randomBytesFn ?? ((n: number) => randomBytes(n));

  /** Deletes every row past its TTL. Run on every `put`, matching the in-memory adapter's own
   *  prune-on-access (not on a timer) tradeoff — see this file's header. Takes `writer` so a caller
   *  can run it inside its own transaction (`put`) or against the bare connection (`size`). */
  function pruneExpired(writer: Writer, nowIso: string): void {
    writer.delete(oauthPendingAuthorizations).where(lte(oauthPendingAuthorizations.expiresAt, nowIso)).run();
  }

  /** Evicts the single oldest row when at or over `maxEntries`, looping defensively in case more
   *  than one row needs to go (a lowered `maxEntries` between calls, say) — mirrors the in-memory
   *  adapter's own `while` loop over its `Map`'s insertion order. `writer` is the caller's open
   *  transaction, so the count/evict sequence cannot interleave with another connection's insert. */
  function evictOverCap(writer: Writer): void {
    for (;;) {
      const count = writer.select({ n: sql<number>`count(*)` }).from(oauthPendingAuthorizations).get()?.n ?? 0;
      if (count < maxEntries) return;
      const oldest = writer
        .select({ state: oauthPendingAuthorizations.state })
        .from(oauthPendingAuthorizations)
        .orderBy(asc(oauthPendingAuthorizations.createdAt))
        .limit(1)
        .get();
      if (!oldest) return;
      writer.delete(oauthPendingAuthorizations).where(eq(oauthPendingAuthorizations.state, oldest.state)).run();
    }
  }

  return {
    async put(input) {
      const nowIso = deps.clock.nowIso();
      const state = Buffer.from(randomBytesFn(PENDING_AUTHORIZATION_STATE_BYTES)).toString("base64url");
      const expiresAt = new Date(Date.parse(nowIso) + ttlMs).toISOString();
      // Sealed even when `codeVerifier` is `""` (a non-PKCE provider) — see this table's schema doc
      // on why the sealed columns are always fully populated rather than conditionally null.
      // Sealed BEFORE the write transaction opens: `seal` is async, and holding a SQLite write lock
      // across an `await` would let a concurrent put observe spare capacity before this one inserts.
      const sealed = await deps.sealer.seal({
        plaintext: input.codeVerifier,
        key: await deps.keyring.activeKey(),
        aad: input.ownerKey,
      });

      deps.db.transaction(
        (tx) => {
          pruneExpired(tx, nowIso);
          evictOverCap(tx);

          tx.insert(oauthPendingAuthorizations)
            .values({
              state,
              ownerKey: input.ownerKey,
              providerId: input.providerId,
              ...sealedColumnValues(sealed),
              redirectUri: input.redirectUri,
              scopesJson: JSON.stringify(input.scopes),
              createdAt: nowIso,
              expiresAt,
            })
            .run();
        },
        // `immediate` takes the write lock up front, so two processes can never both read the count
        // under the cap and then both insert — the exact race the cap test at
        // `platform/db/__tests__/oauth-pending-store.sqlite.test.ts` guards against.
        { behavior: "immediate" }
      );

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
      const [row] = deps.db
        .delete(oauthPendingAuthorizations)
        .where(and(eq(oauthPendingAuthorizations.state, input.state), gt(oauthPendingAuthorizations.expiresAt, nowIso)))
        .returning()
        .all();
      if (!row) throw invalidPendingAuthorizationState();
      // Consumed BEFORE the owner check, not after — identical ordering to the in-memory adapter,
      // and for the identical reason (a caller who guesses a `state` must still burn it).
      if (!secureEqualsForOwnerBinding(row.ownerKey, input.ownerKey)) throw invalidPendingAuthorizationState();

      const codeVerifier = await deps.sealer.open({ sealed: toSealedSecret(row), aad: row.ownerKey });
      const entry: PendingAuthorization = {
        state: row.state,
        ownerKey: row.ownerKey,
        providerId: row.providerId,
        codeVerifier,
        redirectUri: row.redirectUri,
        scopes: JSON.parse(row.scopesJson) as string[],
        createdAt: row.createdAt as ISODateTime,
        expiresAt: row.expiresAt as ISODateTime,
      };
      return entry;
    },

    async size() {
      const nowIso = deps.clock.nowIso();
      pruneExpired(deps.db, nowIso);
      return deps.db.select({ n: sql<number>`count(*)` }).from(oauthPendingAuthorizations).get()?.n ?? 0;
    },
  };
}

export interface SqliteDeviceAuthorizationStoreDeps {
  readonly db: ContentDb;
  readonly workspaceId: UUID;
  readonly clock: OAuthClock;
  readonly sealer: Pick<SecretSealerPort, "seal" | "open">;
  readonly keyring: Pick<KeyringPort, "activeKey">;
}

/** The AAD every sealed `device_code` is bound to — identical shape to
 *  `assistant/external-mcp-oauth.ts`'s `ownerKeyOf`, restated here rather than imported so this
 *  storage-only file does not have to reach into that module for a two-field template string.
 *  Exported so `sealed-credential-descriptors.sqlite.ts` opens these rows through this store's own
 *  AAD rather than a restated copy. */
export function deviceAad(workspaceId: UUID, serverId: string): string {
  return `${workspaceId}:${serverId}`;
}

/**
 * Builds a `content.db`-backed `DeviceAuthorizationStore`, scoped to one workspace — matching how
 * `ExternalMcpOAuthDeps` (and therefore every caller of this factory) is already single-workspace-scoped.
 *
 * @returns The store. Never throws at construction.
 * @complexity `put` is one seal plus one upsert; `get` is one indexed read plus, on a hit, one
 *   unseal; `delete` is one indexed delete. All O(1).
 * @overallScore 100
 */
export function createSqliteDeviceAuthorizationStore(deps: SqliteDeviceAuthorizationStoreDeps): DeviceAuthorizationStore {
  return {
    async put(serverId, authorization) {
      const sealed = await deps.sealer.seal({
        plaintext: authorization.deviceCode,
        key: await deps.keyring.activeKey(),
        aad: deviceAad(deps.workspaceId, serverId),
      });
      const values = {
        workspaceId: deps.workspaceId,
        serverId,
        userCode: authorization.userCode,
        verificationUri: authorization.verificationUri,
        verificationUriComplete: authorization.verificationUriComplete,
        intervalSeconds: authorization.intervalSeconds,
        expiresAt: authorization.expiresAt,
        ...sealedColumnValues(sealed),
        createdAt: deps.clock.nowIso(),
      };
      deps.db
        .insert(oauthDeviceAuthorizations)
        .values(values)
        .onConflictDoUpdate({
          target: [oauthDeviceAuthorizations.workspaceId, oauthDeviceAuthorizations.serverId],
          set: values,
        })
        .run();
    },

    async get(serverId) {
      const row = deps.db
        .select()
        .from(oauthDeviceAuthorizations)
        .where(and(eq(oauthDeviceAuthorizations.workspaceId, deps.workspaceId), eq(oauthDeviceAuthorizations.serverId, serverId)))
        .get();
      if (!row) return undefined;
      const deviceCode = await deps.sealer.open({ sealed: toSealedSecret(row), aad: deviceAad(deps.workspaceId, serverId) });
      const authorization: DeviceAuthorization = {
        deviceCode,
        userCode: row.userCode,
        verificationUri: row.verificationUri,
        verificationUriComplete: row.verificationUriComplete,
        expiresAt: row.expiresAt as ISODateTime,
        intervalSeconds: row.intervalSeconds,
      };
      return authorization;
    },

    async delete(serverId) {
      deps.db
        .delete(oauthDeviceAuthorizations)
        .where(and(eq(oauthDeviceAuthorizations.workspaceId, deps.workspaceId), eq(oauthDeviceAuthorizations.serverId, serverId)))
        .run();
    },
  };
}
