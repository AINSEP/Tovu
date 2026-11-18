import type { Express } from "express";
import type { HostSignalOptions } from "@tovu/contracts/host-signals";
import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import { resolveTrustProxySetting as resolveOverrideOrPlatformHops, type TrustProxySetting } from "@jini-ai/http-kit";

/**
 * @file Express `trust proxy` for the site app.
 *
 * Without it, every visitor behind a platform edge shares the edge's IP: per-IP rate limits (forms,
 * sign-in, the site assistant) become one global bucket and stored source IPs are the proxy's.
 * Trusting X-Forwarded-For everywhere would be worse — a direct client could name any IP it likes.
 * So it is trusted for exactly the hops a known platform puts in front of the app, and never when
 * running locally or directly.
 *
 * With a hop count of N, Express takes the Nth address from the RIGHT of X-Forwarded-For — the one
 * the outermost trusted proxy appended — so whatever the client wrote to the left is ignored.
 *
 * The decision itself lives in `@jini-ai/http-kit` (`resolveTrustProxySetting`); this file binds Tovu's env name, host signals and Express.
 */

export type { TrustProxySetting };

/**
 * Decide `trust proxy` from the environment.
 *
 * - `TOVU_TRUST_PROXY` wins when non-empty: `false`/`0`/`off`/`no` → trust none; an integer → that
 *   many hops; anything else → passed to Express as an address/subnet list. `true` is refused: it
 *   trusts every X-Forwarded-For entry, so any client could spoof its IP.
 * - Otherwise use the unambiguous hop count declared by a matched shipped platform signal.
 * - Otherwise → `false`: the socket peer is the client.
 *
 * @param required Environment snapshot. @param optional Matched shipped platform facts.
 * @returns The setting to hand to Express; no boolean-wide trust is permitted.
 * @throws Error when `TOVU_TRUST_PROXY` is `true`.
 * @complexity O(1) with injected facts; otherwise the synchronous bundled manifest scan.
 * @example resolveTrustProxySetting({ env }, { hostSignals });
 */
export function resolveTrustProxySetting({ env }: { env: NodeJS.ProcessEnv }, optional: HostSignalOptions = {}): TrustProxySetting {
  return resolveOverrideOrPlatformHops({ override: env.TOVU_TRUST_PROXY }, {
    platformHops: () => (optional.hostSignals ?? resolveHostSignals({ env })).trustProxyHops,
    overrideName: "TOVU_TRUST_PROXY",
    serverLabel: "Tovu",
  });
}

/** Sets `trust proxy` on `app` from {@link resolveTrustProxySetting}.
 * @param required Express app. @param optional Env snapshot and matched platform facts.
 * @throws If the explicit override asks to trust every client. @complexity O(p + s) by default.
 * @example applyTrustProxy({ app }, { env, hostSignals });
 */
export function applyTrustProxy({ app }: { app: Express }, optional: HostSignalOptions & { env?: NodeJS.ProcessEnv } = {}): void {
  app.set("trust proxy", resolveTrustProxySetting({ env: optional.env ?? process.env }, optional));
}
