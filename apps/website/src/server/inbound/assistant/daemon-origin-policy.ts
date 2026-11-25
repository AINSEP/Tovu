/**
 * @file The agent daemon's same-origin policy, with the website origin port injected.
 *
 * Listener identity, child inheritance, and allowed origins are independent policies. `PORT` and
 * `JINI_WEB_PORT` both mean "the website origin port" only here, when building this policy, so the
 * policy receives the port the website actually bound (the parent pins it in
 * `TOVU_SITE_LISTENER_ORIGIN`), never a raw `PORT` that an auto-port or CLI flag may have overridden.
 * A standalone daemon has no parent, so the old `JINI_WEB_PORT` input keeps working there. Allowed
 * origins and the bind host pass through untouched; nothing is aliased globally.
 */
import { createLocalSameOriginPolicy, type SameOriginPolicyPort } from "@jini-ai/core/contracts/server";

// These are the environment names the previously imported http-kit origin guard read.
// Preserve that deployed contract when supplying the now-explicit origin configuration.
const DAEMON_ORIGIN_CONFIG = { allowedOriginsEnvVar: "JINI_ALLOWED_ORIGINS", webPortEnvVar: "JINI_WEB_PORT", bindHostEnvVar: "JINI_BIND_HOST" };

/**
 * The resolved website listener's port, or `undefined` for a standalone daemon (no pinned listener).
 * @throws TypeError for an invalid pinned origin, rather than silently trusting another port.
 */
function resolvedWebsitePort({ env }: { env: Readonly<Record<string, string | undefined>> }, _optional = {}): string | undefined {
  const origin = env.TOVU_SITE_LISTENER_ORIGIN;
  if (!origin) return undefined;
  const url = new URL(origin);
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

/** Build the daemon's origin policy for one scope. @complexity O(1) per request beyond core's check. */
export function createDaemonOriginPolicy(
  { port, env }: { port: number; env: Readonly<Record<string, string | undefined>> },
  _optional = {},
): SameOriginPolicyPort {
  const websitePort = resolvedWebsitePort({ env });
  const policyEnv = websitePort === undefined ? env : { ...env, [DAEMON_ORIGIN_CONFIG.webPortEnvVar]: websitePort };
  return createLocalSameOriginPolicy({ port: () => port, env: policyEnv, config: DAEMON_ORIGIN_CONFIG });
}
