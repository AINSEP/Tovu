/**
 * @file Tovu entropy and Settings copy for Jini's pending-authorization store.
 * Store contracts/security mechanics belong to Jini/packages/oauth/src/pending-authorizations.ts.
 *
 * The async contract also serves `platform/db/repos/oauth-pending-store.ts`, which seals
 * PKCE verifiers through ADR-058's Promise-based sealer. Production must persist pending
 * state because the agent daemon starts the handshake and the web server completes it
 * in a different process; a process-local Map cannot join those two legs. Memory stores
 * remain useful for tests and compositions whose whole handshake stays in one process.
 *
 * State authenticates a public callback without a cross-site cookie: 24 cryptographically
 * random bytes make guessing infeasible. States are single-use, expiring and owner-bound.
 * Consumption precedes the owner check so a guessed state cannot be retried as an oracle;
 * every failure (unknown, expired, replayed, wrong owner) has `OAUTH_INVALID_STATE`. Length is
 * checked before constant-time comparison because `timingSafeEqual` rejects unequal
 * lengths and length is not secret. The durable adapter reuses the same helpers/constants.
 *
 * The exact redirect URI is replayed on exchange (RFC 6749 §4.1.3), never rebuilt from
 * a callback Host header. Verifiers remain server-side and are sealed across processes.
 * TTL permits consent/MFA but bounds abandoned attempts. Capacity bounds allocation even
 * though starts are authenticated and rate-limited; oldest-entry eviction prevents one
 * caller from wedging authorization for other admins. Insertion order identifies the oldest.
 * On-access pruning avoids background work/shutdown hooks; retained expired entries are
 * unredeemable and capacity bounds their memory cost. Invalid TTL/capacity fail at creation.
 * Injected clocks let tests advance expiry without sleeping; size exposes live entries.
 */

import { randomBytes } from "node:crypto";
import { createPendingAuthorizationStore as createJiniPendingStore, OAuthError, PENDING_AUTHORIZATION_DEFAULT_MAX_ENTRIES as DEFAULT_MAX_ENTRIES, PENDING_AUTHORIZATION_DEFAULT_TTL_MS as DEFAULT_TTL_MS } from "@jini-ai/oauth";
import type { Clock } from "@jini-ai/core/primitives";
import type { OAuthRandomBytes, PendingAuthorizationStore } from "@jini-ai/oauth";
import { withTovuOAuthCopy } from "./endpoint-safety.js";

export type { PendingAuthorization, PendingAuthorizationStore, PendingAuthorizationStoreDeps } from "@jini-ai/oauth";
export { PENDING_AUTHORIZATION_STATE_BYTES as STATE_BYTES, PENDING_AUTHORIZATION_DEFAULT_TTL_MS as DEFAULT_TTL_MS, PENDING_AUTHORIZATION_DEFAULT_MAX_ENTRIES as DEFAULT_MAX_ENTRIES, secureEqualsForOwnerBinding as secureEquals } from "@jini-ai/oauth";

/** Fixed host copy shared by durable and memory adapters; redemption mechanics belong to Jini. */
export function invalidState(_required: Record<string, never>, _optional: Record<string, never> = {}): OAuthError {
  return new OAuthError({ code: "OAUTH_INVALID_STATE", message: "the authorization request could not be matched — it may have expired or already been used",
    operatorAction: "Start the connection again from Settings → External MCP." });
}

/** Supply host entropy and Settings copy while retaining Jini's canonical store ABI. */
export function createPendingAuthorizationStore(
  { clock }: { clock: Clock },
  optional: { ttlMs?: number; maxEntries?: number; randomBytesFn?: OAuthRandomBytes } = {},
): PendingAuthorizationStore {
  const store = createJiniPendingStore({ clock,
    randomBytesFn: optional.randomBytesFn ?? (({ byteLength }) => randomBytes(byteLength)),
  }, { ttlMs: optional.ttlMs ?? DEFAULT_TTL_MS, maxEntries: optional.maxEntries ?? DEFAULT_MAX_ENTRIES });
  return { ...store, take: (input) => withTovuOAuthCopy({ call: () => store.take(input) }) };
}
