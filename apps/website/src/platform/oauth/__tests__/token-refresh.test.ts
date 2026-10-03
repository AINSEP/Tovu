import assert from "node:assert/strict";
import test from "node:test";

import { OAuthError } from "@jini-ai/oauth";
import type { OAuthTokenSet } from "../ports.js";
import { createTokenRefresher, isTokenDueForRefresh, type TokenRefreshPort } from "@jini-ai/oauth";
import { assertOAuthRejects, createTestClock } from "./helpers.js";

/**
 * @file Single-flight, lease-guarded token refresh.
 *
 * This is the file that has to earn its keep. A rotating single-use refresh token means a race is
 * not "wasted work" — it permanently kills the connection. So the tests assert on the CALL COUNT of
 * the refresh port, not just on the returned value: a correct-looking token returned after two
 * redemptions is exactly the bug.

 *
 * Design history from the retired Tovu token-refresh module. The implementation now lives in
 * Jini/packages/oauth/src/refresh.ts; these assertions retain its security argument.
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
 * Refresh this far BEFORE the recorded expiry. Wide enough to absorb clock skew between Tovu and
 *  the provider plus the round trip itself, narrow enough not to churn tokens needlessly.
 * How long a caller that lost the cross-process lease waits for the winner's write, in total.
 * How often it re-reads while waiting.
 * Everything the refresher needs from its owner. Deliberately a port rather than a store handle:
 *  the caller owns sealing, persistence, and what "needs reauth" means for its own domain.
 * Current token set for `key`, or `null` when the connection holds none.
 * Performs the `refresh_token` grant. Should throw an {@link OAuthError}.
 * Seals and persists the rotated set. Must complete before the new token is handed out.
 * Records the durable, operator-actionable terminal state. Called at most once per transition.
 *  May itself throw (a secret-store re-seal can exhaust its own retry budget) — callers must treat
 *  the write as best-effort and never let its failure stand in for the reauth error it precedes.
 * Cross-process compare-and-set. `true` means this process may refresh; `false` means another
 * one already is. Optional so a single-process caller (or a test) can omit it — omitting it
 * leaves only the in-process guard, which is correct but weaker.
 * Injected so a test does not spend real time waiting on a lease. Defaults to `setTimeout`.
 * Returns a usable access token for `key`, refreshing first if it is at or near expiry.
 *
 * @throws {OAuthError} `OAUTH_INVALID_GRANT` when the connection needs re-authorization
 *   (`markNeedsReauth` is attempted first, best-effort — its own failure is attached as `cause`
 *   rather than replacing this error), or `OAUTH_PROVIDER_UNREACHABLE` when the refresh could not
 *   be attempted and no usable token remains. Both terminal.
 * In-flight refreshes, for tests and for an operational counter.
 * Whether `tokens` should be refreshed now.
 *
 * A `null` expiry means the provider never said, so there is nothing to be proactive about — the
 * token is used until something rejects it. Fabricating a lifetime would schedule refreshes that
 * accomplish nothing and burn a rotating refresh token on each one.
 *
 * @complexity O(1).
 * Whether the token is past its recorded expiry outright (no skew) — i.e. not merely due for a
 *  proactive refresh but actually unusable.
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
 * The refresh itself, run by exactly one caller per key per rotation.
 * Only a terminal grant failure is a durable state. A transient one leaves the connection
 * alone — see this file's header.
 * Persisted BEFORE it is handed out: a token returned to a caller and then lost to a failed
 * write is a token the next process will not know about, while the provider has already
 * rotated the refresh token that would have recovered it.
 * Waits for whichever process holds the lease to publish a fresh token, re-reading as it goes.
 * Falls back to the still-usable current token rather than refreshing behind the winner's back.
 */

const KEY = "workspace-1:higgs";

function tokens(overrides: Partial<OAuthTokenSet> = {}): OAuthTokenSet {
  return { accessToken: "at-current", refreshToken: "rt-current", tokenType: "Bearer", scopes: [], expiresAt: "2026-08-25T12:05:00.000Z", ...overrides };
}

interface PortDouble {
  readonly port: TokenRefreshPort;
  refreshCalls: number;
  refreshInputs: { key: string; refreshToken: string }[];
  persisted: OAuthTokenSet[];
  needsReauth: { key: string; reason: string }[];
  leaseAcquisitions: number;
  leaseReleases: string[];
  leaseHeld: boolean;
  stored: OAuthTokenSet | null;
}

function makePort(options: {
  refresh?: (refreshToken: string) => Promise<OAuthTokenSet>;
  leaseGranted?: boolean;
  withLease?: boolean;
  initial?: OAuthTokenSet | null;
} = {}): PortDouble {
  const state: PortDouble = {
    refreshCalls: 0,
    refreshInputs: [],
    persisted: [],
    needsReauth: [],
    leaseAcquisitions: 0,
    leaseReleases: [],
    leaseHeld: false,
    stored: options.initial === undefined ? tokens() : options.initial,
    get port() { return port; },
  };

  const port: TokenRefreshPort = {
    async load() {
      return state.stored;
    },
    async refresh({ key, refreshToken }) {
      state.refreshCalls += 1;
      state.refreshInputs.push({ key, refreshToken });
      if (options.refresh) return options.refresh(refreshToken);
      return tokens({ accessToken: "at-rotated", refreshToken: "rt-rotated", expiresAt: "2026-08-25T13:00:00.000Z" });
    },
    async persist({ tokens: next }) {
      state.persisted.push(next);
      state.stored = next;
    },
    async markNeedsReauth({ key, reason }) {
      state.needsReauth.push({ key, reason });
    },
  };

  if (options.withLease !== false) {
    port.tryAcquireRefreshLease = async () => {
      state.leaseAcquisitions += 1;
      if (options.leaseGranted === false || state.leaseHeld) return false;
      state.leaseHeld = true;
      return true;
    };
    port.releaseRefreshLease = async ({ key }) => {
      state.leaseReleases.push(key);
      assert.equal(state.leaseHeld, true, "only the lease owner may release it");
      state.leaseHeld = false;
    };
  }

  return state;
}

test("a token that is not near expiry is returned without touching the provider", async () => {
  const clock = createTestClock("2026-08-25T12:00:00.000Z");
  const double = makePort({ initial: tokens({ expiresAt: "2026-08-25T18:00:00.000Z" }) });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-current");
  assert.equal(double.refreshCalls, 0);
});

test("a token inside the refresh skew is refreshed proactively, before it actually expires", async () => {
  // Expires at 12:05, skew is 120s, so at 12:03 it is due even though it is still valid.
  const clock = createTestClock("2026-08-25T12:03:30.000Z");
  const double = makePort();
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-rotated");
  assert.equal(double.refreshCalls, 1);
  assert.deepEqual(double.refreshInputs, [{ key: KEY, refreshToken: "rt-current" }]);
  assert.deepEqual(double.persisted, [tokens({ accessToken: "at-rotated", refreshToken: "rt-rotated", expiresAt: "2026-08-25T13:00:00.000Z" })]);
  assert.deepEqual(double.leaseReleases, [KEY]);
  assert.equal(double.leaseHeld, false);
  clock.advance(60 * 60 * 1000);
  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-rotated");
  assert.equal(double.leaseAcquisitions, 2, "a later refresh can reacquire the released lease");
  assert.deepEqual(double.leaseReleases, [KEY, KEY]);
  assert.deepEqual(double.refreshInputs[1], { key: KEY, refreshToken: "rt-rotated" });
});

test("concurrent callers collapse onto ONE refresh — the rotating token is redeemed once", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const double = makePort({
    refresh: async () => {
      await gate;
      return tokens({ accessToken: "at-rotated", refreshToken: "rt-rotated", expiresAt: "2026-08-25T13:00:00.000Z" });
    },
  });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  const inflight = [refresher.getAccessToken({ key: KEY }), refresher.getAccessToken({ key: KEY }), refresher.getAccessToken({ key: KEY })];
  // Let all three get past their `load` and reach the single-flight map before asserting: the map
  // is populated after the load resolves, which is the earliest point at which "one attempt" is
  // even a meaningful claim.
  await new Promise((resolve) => setImmediate(resolve));
  // All three must now be waiting on the SAME attempt, not three of their own.
  assert.equal(refresher.inFlightCount({}), 1);
  release?.();
  const results = await Promise.all(inflight);

  assert.deepEqual(results, ["at-rotated", "at-rotated", "at-rotated"]);
  assert.equal(double.refreshCalls, 1, "a rotating single-use refresh token must be redeemed exactly once");
  assert.equal(double.persisted.length, 1);
  assert.deepEqual(double.persisted[0], tokens({ accessToken: "at-rotated", refreshToken: "rt-rotated", expiresAt: "2026-08-25T13:00:00.000Z" }));
  assert.equal(refresher.inFlightCount({}), 0);
  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-rotated");
  assert.equal(double.refreshCalls, 1, "the next caller reads the persisted rotation without another refresh");
  assert.deepEqual(double.leaseReleases, [KEY]);
});

test("the in-flight entry is cleared after a failure, so a later call can try again", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  let attempt = 0;
  const double = makePort({
    refresh: async () => {
      attempt += 1;
      if (attempt === 1) throw new OAuthError({ code: "OAUTH_PROVIDER_UNREACHABLE", message: "down", operatorAction: "retry" });
      return tokens({ accessToken: "at-rotated", expiresAt: "2026-08-25T13:00:00.000Z" });
    },
  });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_PROVIDER_UNREACHABLE");
  assert.equal(refresher.inFlightCount({}), 0);
  assert.deepEqual(double.leaseReleases, [KEY]);
  assert.equal(double.leaseHeld, false);
  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-rotated");
  assert.equal(double.leaseAcquisitions, 2);
  assert.deepEqual(double.leaseReleases, [KEY, KEY]);
});

test("the rotated token is persisted BEFORE it is handed out", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const order: string[] = [];
  let finishPersist!: () => void;
  const gate = new Promise<void>((resolve) => { finishPersist = resolve; });
  let enteredPersist!: () => void;
  const entered = new Promise<void>((resolve) => { enteredPersist = resolve; });
  const double = makePort();
  const wrapped: TokenRefreshPort = {
    ...double.port,
    persist: async ({ key, tokens: next }) => {
      order.push("persist");
      enteredPersist();
      await gate;
      await double.port.persist({ key, tokens: next });
    },
  };
  const refresher = createTokenRefresher({ clock, port: wrapped, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  let settled = false;
  const pending = refresher.getAccessToken({ key: KEY }).then((accessToken) => {
    settled = true;
    order.push("returned");
    return accessToken;
  });
  await entered;
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(settled, false, "the caller must wait for persistence to finish");
    assert.deepEqual(double.persisted, []);
    assert.equal(double.leaseHeld, true, "the lease covers the durable write too");
  } finally {
    finishPersist();
  }
  const accessToken = await pending;

  assert.deepEqual(order, ["persist", "returned"]);
  assert.equal(accessToken, "at-rotated");
});

test("a rejected persistence never hands out the rotated token and releases the lease", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const double = makePort();
  const failure = new Error("durable token write failed");
  let failPersist!: (error: Error) => void;
  const gate = new Promise<void>((_resolve, reject) => { failPersist = reject; });
  let enteredPersist!: () => void;
  const entered = new Promise<void>((resolve) => { enteredPersist = resolve; });
  const refresher = createTokenRefresher(
    {
      clock,
      port: { ...double.port, persist: async () => { enteredPersist(); await gate; } },
      sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  );
  const rejected = assert.rejects(refresher.getAccessToken({ key: KEY }), (error) => error === failure);
  await entered;
  failPersist(failure);
  await rejected;
  assert.deepEqual(double.persisted, []);
  assert.deepEqual(double.leaseReleases, [KEY]);
  assert.equal(double.leaseHeld, false);
});

test("a provider answering invalid_grant transitions the connection to needs_reauth and stops", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const double = makePort({
    refresh: async () => {
      throw new OAuthError({ code: "OAUTH_INVALID_GRANT", message: "refused", operatorAction: "reconnect" });
    },
  });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  const error = await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_INVALID_GRANT");

  assert.equal(error.retryable, false);
  assert.equal(error.message, "this connection needs to be re-authorized (the provider rejected the stored refresh token)");
  assert.deepEqual(double.needsReauth, [{ key: KEY, reason: "the provider rejected the stored refresh token" }]);
  assert.equal(double.persisted.length, 0);
});

test("a re-seal failure while marking needs_reauth still surfaces the REAUTH error, not the write's own error", async () => {
  // Models `external-mcp-oauth.ts`'s `setOAuthStatus`: once its clear-token re-seal retries are
  // exhausted it rethrows its own error class, not an `OAuthError`. That must never displace the
  // `OAUTH_INVALID_GRANT` signal every downstream caller (e.g. `tokenResolver.resolveAccessToken`
  // at `external-mcp-oauth.ts:925`) branches on to stop retrying a dead connection.
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const resealFailure = new Error("secret store unconfigured: re-seal retries exhausted");
  const double = makePort({
    refresh: async () => {
      throw new OAuthError({ code: "OAUTH_INVALID_GRANT", message: "refused", operatorAction: "reconnect" });
    },
  });
  const port: TokenRefreshPort = {
    ...double.port,
    markNeedsReauth: async ({ key, reason }) => {
      double.needsReauth.push({ key, reason });
      throw resealFailure;
    },
  };
  const refresher = createTokenRefresher({ clock, port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  const error = await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_INVALID_GRANT");

  assert.equal(error.message, "this connection needs to be re-authorized (the provider rejected the stored refresh token)");
  assert.equal(error.retryable, false);
  assert.equal(error.cause, resealFailure, "the write's own failure must be carried as `cause`, never thrown in place of the reauth error");
});

test("a re-seal failure while marking needs_reauth (no-refresh-token case) still surfaces the REAUTH error", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const resealFailure = new Error("secret store unconfigured: re-seal retries exhausted");
  const double = makePort({ initial: tokens({ refreshToken: null }) });
  const port: TokenRefreshPort = {
    ...double.port,
    markNeedsReauth: async ({ key, reason }) => {
      double.needsReauth.push({ key, reason });
      throw resealFailure;
    },
  };
  const refresher = createTokenRefresher({ clock, port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  const error = await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_INVALID_GRANT");

  assert.equal(error.message, "this connection needs to be re-authorized (no refresh token)");
  assert.equal(error.cause, resealFailure);
});

test("a TRANSIENT refresh failure does NOT mark the connection needs_reauth", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const double = makePort({
    refresh: async () => {
      throw new OAuthError({ code: "OAUTH_PROVIDER_UNREACHABLE", message: "timeout", operatorAction: "retry later" });
    },
  });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_PROVIDER_UNREACHABLE");

  assert.deepEqual(double.needsReauth, [], "a provider having a bad minute must not nag the operator to reconnect");
});

test("a connection whose provider issued no refresh token goes to needs_reauth at expiry", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const double = makePort({ initial: tokens({ refreshToken: null }) });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  const error = await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_INVALID_GRANT");

  assert.equal(error.message, "this connection needs to be re-authorized (no refresh token)");
  assert.deepEqual(double.needsReauth, [
    { key: KEY, reason: "the provider issued no refresh token and the access token is due for refresh" },
  ]);
  assert.equal(double.refreshCalls, 0);
});

test("a connection holding no token at all is needs_reauth, not a crash", async () => {
  const clock = createTestClock();
  const double = makePort({ initial: null });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  const error = await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_INVALID_GRANT");
  assert.equal(error.message, "this connection needs to be re-authorized (this connection holds no token)");
});

test("a null expiry means never proactively refresh — no lifetime is fabricated", async () => {
  const clock = createTestClock("2030-01-01T00:00:00.000Z");
  const double = makePort({ initial: tokens({ expiresAt: null }) });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-current");
  assert.equal(double.refreshCalls, 0);
  assert.equal(isTokenDueForRefresh({ tokens: tokens({ expiresAt: null }), nowIso: "2030-01-01T00:00:00.000Z", skewMs: 120_000 }), false);
});

test("losing the cross-process lease means re-reading, NOT refreshing behind the winner's back", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const double = makePort({ leaseGranted: false });
  // Model the other process publishing its rotated token during our first re-read.
  const port: TokenRefreshPort = {
    ...double.port,
    load: async () => double.stored,
  };
  const refresher = createTokenRefresher(
    {
      clock,
      port,
      sleep: async () => {
      double.stored = tokens({ accessToken: "at-from-other-process", expiresAt: "2026-08-25T14:00:00.000Z" });
    },
    },
    { leasePollMs: 1, leaseWaitMs: 100 },
  );

  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-from-other-process");
  assert.equal(double.refreshCalls, 0, "the loser of the lease must never redeem the refresh token");
  assert.equal(double.leaseAcquisitions, 1);
  assert.deepEqual(double.leaseReleases, [], "a lease loser must not release another process's lease");
});

test("a lease holder that never publishes leaves the loser on its still-valid token rather than racing", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  const double = makePort({ leaseGranted: false });
  // Advancing the clock is what ends the wait; the stored token stays stale.
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: async () => clock.advance(5) }, { leasePollMs: 1, leaseWaitMs: 10 });

  // The token expires at 12:05 and it is 12:04, so it is due for refresh but still usable.
  assert.equal(await refresher.getAccessToken({ key: KEY }), "at-current");
  assert.equal(double.refreshCalls, 0);
});

test("a lease holder that never publishes, on an already-expired token, fails loudly", async () => {
  const clock = createTestClock("2026-08-25T12:10:00.000Z");
  const double = makePort({ leaseGranted: false });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: async () => clock.advance(5) }, { leasePollMs: 1, leaseWaitMs: 10 });

  const error = await assertOAuthRejects(() => refresher.getAccessToken({ key: KEY }), "OAUTH_PROVIDER_UNREACHABLE");
  assert.equal(error.message, "another process is refreshing this connection's token and did not finish in time");
  assert.equal(double.refreshCalls, 0);
});

test("a port with no lease support still gets the in-process single-flight guarantee", async () => {
  const clock = createTestClock("2026-08-25T12:04:00.000Z");
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const double = makePort({
    withLease: false,
    refresh: async () => {
      await gate;
      return tokens({ accessToken: "at-rotated", expiresAt: "2026-08-25T13:00:00.000Z" });
    },
  });
  const refresher = createTokenRefresher({ clock, port: double.port, sleep: ({ ms }) => new Promise((resolve) => setTimeout(resolve, ms)) });

  const inflight = [refresher.getAccessToken({ key: KEY }), refresher.getAccessToken({ key: KEY })];
  release?.();
  await Promise.all(inflight);

  assert.equal(double.refreshCalls, 1);
  assert.equal(double.leaseAcquisitions, 0);
});
