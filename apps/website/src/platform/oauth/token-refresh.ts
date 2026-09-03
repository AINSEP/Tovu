import { isOAuthError, OAuthError } from "./errors.js";
import type { OAuthClock, OAuthTokenSet } from "./ports.js";

/**
 * @file Proactive, single-flight token refresh.
 *
 * Refreshing looks trivial and is not, because of one property most providers now have: the refresh
 * token ROTATES and is SINGLE USE. Redeeming it returns a new one and invalidates the old. Two
 * refreshes racing on the same stored token therefore do not merely duplicate work — the loser
 * persists a refresh token the provider has already revoked, and the connection is dead until a
 * human re-authorizes it.
 *
 * Tovu can lose that race in two different ways, so this module guards both:
 *
 * 1. **Within one process.** Several federated tool calls can find the same token expiring at the
 *    same moment. An in-flight map collapses them onto one refresh — `refresh` is invoked once and
 *    every caller awaits the same promise.
 * 2. **Across processes.** The admin web server and the agent daemon are separate processes holding
 *    separate database handles, so an in-process map cannot see the other one. That needs a guard in
 *    shared storage, which is what {@link TokenRefreshPort.tryAcquireRefreshLease} is: a
 *    compare-and-set on a plaintext lease column. A caller that loses the lease does NOT refresh —
 *    it re-reads, because the winner is about to write a fresh token, and re-reading is both
 *    cheaper and safe where refreshing is neither.
 *
 * ## Expiry is checkable without unsealing
 *
 * Nothing here unseals a token to find out whether it expired. `expiresAt` is plaintext metadata
 * stored beside the sealed blob — the same split `external-mcp-store.ts` already uses for `envNames`
 * beside `sealedEnv` ("Variable NAMES are stored separately in plaintext so the tab can show which
 * variables are set without unsealing anything"). Applied to expiry it is not just an optimization:
 * it is what makes expiry displayable in the admin tab and schedulable by a background pass.
 *
 * ## Transient failure is not `needs_reauth`
 *
 * A token endpoint that times out is a network event; a token endpoint that answers `invalid_grant`
 * is a durable, operator-actionable state. Collapsing them would push a connection into
 * `needs_reauth` — and nag an operator — every time a provider had a bad minute. Only a terminal
 * grant failure transitions the connection; a transient one leaves the existing access token in
 * place if it is still usable at all.
 */

/** Refresh this far BEFORE the recorded expiry. Wide enough to absorb clock skew between Tovu and
 *  the provider plus the round trip itself, narrow enough not to churn tokens needlessly. */
const DEFAULT_REFRESH_SKEW_MS = 120_000;
/** How long a caller that lost the cross-process lease waits for the winner's write, in total. */
const DEFAULT_LEASE_WAIT_MS = 5_000;
/** How often it re-reads while waiting. */
const DEFAULT_LEASE_POLL_MS = 250;

/** Everything the refresher needs from its owner. Deliberately a port rather than a store handle:
 *  the caller owns sealing, persistence, and what "needs reauth" means for its own domain. */
export interface TokenRefreshPort {
  /** Current token set for `key`, or `null` when the connection holds none. */
  load(key: string): Promise<OAuthTokenSet | null>;
  /** Performs the `refresh_token` grant. Should throw an {@link OAuthError}. */
  refresh(key: string, refreshToken: string): Promise<OAuthTokenSet>;
  /** Seals and persists the rotated set. Must complete before the new token is handed out. */
  persist(key: string, tokens: OAuthTokenSet): Promise<void>;
  /** Records the durable, operator-actionable terminal state. Called at most once per transition.
   *  May itself throw (a secret-store re-seal can exhaust its own retry budget) — callers must treat
   *  the write as best-effort and never let its failure stand in for the reauth error it precedes. */
  markNeedsReauth(key: string, reason: string): Promise<void>;
  /**
   * Cross-process compare-and-set. `true` means this process may refresh; `false` means another
   * one already is. Optional so a single-process caller (or a test) can omit it — omitting it
   * leaves only the in-process guard, which is correct but weaker.
   */
  tryAcquireRefreshLease?(key: string): Promise<boolean>;
  releaseRefreshLease?(key: string): Promise<void>;
}

export interface TokenRefresherDeps {
  readonly clock: OAuthClock;
  readonly port: TokenRefreshPort;
  readonly refreshSkewMs?: number;
  readonly leaseWaitMs?: number;
  readonly leasePollMs?: number;
  /** Injected so a test does not spend real time waiting on a lease. Defaults to `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface TokenRefresher {
  /**
   * Returns a usable access token for `key`, refreshing first if it is at or near expiry.
   *
   * @throws {OAuthError} `OAUTH_INVALID_GRANT` when the connection needs re-authorization
   *   (`markNeedsReauth` is attempted first, best-effort — its own failure is attached as `cause`
   *   rather than replacing this error), or `OAUTH_PROVIDER_UNREACHABLE` when the refresh could not
   *   be attempted and no usable token remains. Both terminal.
   */
  getAccessToken(key: string): Promise<string>;
  /** In-flight refreshes, for tests and for an operational counter. */
  inFlightCount(): number;
}

function needsReauthError(reason: string, options: { readonly cause?: unknown } = {}): OAuthError {
  return new OAuthError("OAUTH_INVALID_GRANT", `this connection needs to be re-authorized (${reason})`, {
    operatorAction: "Reconnect this server in Settings → External MCP.",
    cause: options.cause,
  });
}

/**
 * Whether `tokens` should be refreshed now.
 *
 * A `null` expiry means the provider never said, so there is nothing to be proactive about — the
 * token is used until something rejects it. Fabricating a lifetime would schedule refreshes that
 * accomplish nothing and burn a rotating refresh token on each one.
 *
 * @complexity O(1).
 */
export function isTokenDueForRefresh(tokens: OAuthTokenSet, nowIso: string, skewMs: number): boolean {
  if (tokens.expiresAt === null) return false;
  return Date.parse(tokens.expiresAt) - skewMs <= Date.parse(nowIso);
}

/** Whether the token is past its recorded expiry outright (no skew) — i.e. not merely due for a
 *  proactive refresh but actually unusable. */
function isHardExpired(tokens: OAuthTokenSet, nowIso: string): boolean {
  return tokens.expiresAt !== null && Date.parse(tokens.expiresAt) <= Date.parse(nowIso);
}

/**
 * Builds a refresher over `deps.port`.
 *
 * @returns The refresher. Construction performs no I/O.
 * @complexity `getAccessToken` is O(1) plus at most one `load` and one refresh round trip;
 *   concurrent callers for the same key share a single refresh. Memory is O(k) in keys refreshing
 *   concurrently, and each entry is removed as soon as its refresh settles.
 * @tradeoffs A caller that loses the cross-process lease waits and re-reads rather than refreshing.
 *   That trades a bounded wait for the guarantee that a rotating refresh token is redeemed once. If
 *   the winner crashes mid-refresh, the loser falls back to its existing token when still usable
 *   and to `needs_reauth` when not — never to a second redemption.
 */
export function createTokenRefresher(deps: TokenRefresherDeps): TokenRefresher {
  const skewMs = deps.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  const leaseWaitMs = deps.leaseWaitMs ?? DEFAULT_LEASE_WAIT_MS;
  const leasePollMs = deps.leasePollMs ?? DEFAULT_LEASE_POLL_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const inFlight = new Map<string, Promise<string>>();

  /**
   * Calls `port.markNeedsReauth`, but never lets ITS failure stand in for the reauth signal it
   * exists to record. The write can itself throw — see `external-mcp-oauth.ts`'s `setOAuthStatus`,
   * whose clear-token re-seal rethrows once its bounded retry budget is exhausted — and every
   * caller downstream of `getAccessToken` branches on the reauth error's CLASS
   * (`isOAuthError(error) && error.code === "OAUTH_INVALID_GRANT"`), not on whatever incidental
   * error the write happened to fail with. Letting the write's error escape here would silently
   * swap out the "stop retrying" signal for one none of those callers recognize, so the model would
   * keep hammering a connection that can never succeed. The write is therefore best-effort, exactly
   * like `external-mcp-oauth.ts`'s `reportAuthFailure` guards the identical call: its failure is
   * returned so the caller can carry it as `cause`, never thrown in place of the reauth error.
   */
  const markNeedsReauthBestEffort = async (key: string, reason: string): Promise<unknown> => {
    try {
      await deps.port.markNeedsReauth(key, reason);
      return undefined;
    } catch (error) {
      return error;
    }
  };

  /** The refresh itself, run by exactly one caller per key per rotation. */
  const performRefresh = async (key: string, current: OAuthTokenSet): Promise<string> => {
    if (current.refreshToken === null) {
      const writeFailure = await markNeedsReauthBestEffort(
        key,
        "the provider issued no refresh token and the access token has expired",
      );
      throw needsReauthError("no refresh token", { cause: writeFailure });
    }

    let rotated: OAuthTokenSet;
    try {
      rotated = await deps.port.refresh(key, current.refreshToken);
    } catch (error) {
      // Only a terminal grant failure is a durable state. A transient one leaves the connection
      // alone — see this file's header.
      const terminal = isOAuthError(error) && (error.code === "OAUTH_INVALID_GRANT" || error.code === "OAUTH_ACCESS_DENIED");
      if (terminal) {
        const reason = "the provider rejected the stored refresh token";
        const writeFailure = await markNeedsReauthBestEffort(key, reason);
        throw needsReauthError(reason, { cause: writeFailure });
      }
      throw error;
    }

    // Persisted BEFORE it is handed out: a token returned to a caller and then lost to a failed
    // write is a token the next process will not know about, while the provider has already
    // rotated the refresh token that would have recovered it.
    await deps.port.persist(key, rotated);
    return rotated.accessToken;
  };

  /**
   * Waits for whichever process holds the lease to publish a fresh token, re-reading as it goes.
   * Falls back to the still-usable current token rather than refreshing behind the winner's back.
   */
  const awaitLeaseHolder = async (key: string, current: OAuthTokenSet): Promise<string> => {
    const deadline = Date.parse(deps.clock.nowIso()) + leaseWaitMs;
    for (;;) {
      await sleep(leasePollMs);
      const reloaded = await deps.port.load(key);
      const nowIso = deps.clock.nowIso();
      if (reloaded && !isTokenDueForRefresh(reloaded, nowIso, skewMs)) return reloaded.accessToken;
      if (Date.parse(nowIso) >= deadline) {
        const fallback = reloaded ?? current;
        if (!isHardExpired(fallback, nowIso)) return fallback.accessToken;
        throw new OAuthError("OAUTH_PROVIDER_UNREACHABLE", "another process is refreshing this connection's token and did not finish in time", {
          operatorAction: "Try again in a moment. If it keeps happening, reconnect this server in Settings → External MCP.",
        });
      }
    }
  };

  const refreshOnce = async (key: string, current: OAuthTokenSet): Promise<string> => {
    if (!deps.port.tryAcquireRefreshLease) return performRefresh(key, current);

    const acquired = await deps.port.tryAcquireRefreshLease(key);
    if (!acquired) return awaitLeaseHolder(key, current);
    try {
      return await performRefresh(key, current);
    } finally {
      await deps.port.releaseRefreshLease?.(key).catch(() => undefined);
    }
  };

  return {
    async getAccessToken(key) {
      const current = await deps.port.load(key);
      if (current === null) throw needsReauthError("this connection holds no token");

      const nowIso = deps.clock.nowIso();
      if (!isTokenDueForRefresh(current, nowIso, skewMs)) return current.accessToken;

      const existing = inFlight.get(key);
      if (existing) return existing;

      const attempt = refreshOnce(key, current).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, attempt);
      return attempt;
    },

    inFlightCount() {
      return inFlight.size;
    },
  };
}
