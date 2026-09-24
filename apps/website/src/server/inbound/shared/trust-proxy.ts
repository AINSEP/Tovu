import type { Express } from "express";

/**
 * @file Express `trust proxy` for the site app.
 *
 * Without it, every visitor behind Fly's edge shares the edge's IP: per-IP rate limits (forms,
 * sign-in, the site assistant) become one global bucket and stored source IPs are the proxy's.
 * Trusting X-Forwarded-For everywhere would be worse — a direct client could name any IP it likes.
 * So it is trusted for exactly the hops a known platform puts in front of the app, and never when
 * running locally or directly.
 *
 * With a hop count of N, Express takes the Nth address from the RIGHT of X-Forwarded-For — the one
 * the outermost trusted proxy appended — so whatever the client wrote to the left is ignored.
 */

/** The value handed to `app.set("trust proxy", ...)`: `false`, a hop count, or Express's
 *  address/subnet list (e.g. `"loopback, 10.0.0.0/8"`). */
export type TrustProxySetting = false | number | string;

/**
 * Decide `trust proxy` from the environment.
 *
 * - `TOVU_TRUST_PROXY` wins when non-empty: `false`/`0`/`off`/`no` → trust none; an integer → that
 *   many hops; anything else → passed to Express as an address/subnet list. `true` is refused: it
 *   trusts every X-Forwarded-For entry, so any client could spoof its IP.
 * - Otherwise on Fly (`FLY_APP_NAME` is set by the platform) → 1 hop, Fly's edge proxy.
 * - Otherwise → `false`: the socket peer is the client.
 *
 * @throws Error when `TOVU_TRUST_PROXY` is `true`.
 * @complexity O(1).
 */
export function resolveTrustProxySetting(env: NodeJS.ProcessEnv): TrustProxySetting {
  const override = env.TOVU_TRUST_PROXY?.trim() ?? "";
  if (override !== "") {
    const lower = override.toLowerCase();
    if (lower === "true") {
      throw new Error(
        'TOVU_TRUST_PROXY="true" would trust X-Forwarded-For from any client. Set the number of proxy hops in front of Tovu (e.g. 1), or a list of proxy addresses/subnets.'
      );
    }
    if (["false", "0", "off", "no"].includes(lower)) return false;
    if (/^\d+$/.test(override)) return Number(override);
    return override;
  }
  if (env.FLY_APP_NAME) return 1;
  return false;
}

/** Sets `trust proxy` on `app` from {@link resolveTrustProxySetting}. */
export function applyTrustProxy(app: Express, env: NodeJS.ProcessEnv = process.env): void {
  app.set("trust proxy", resolveTrustProxySetting(env));
}
