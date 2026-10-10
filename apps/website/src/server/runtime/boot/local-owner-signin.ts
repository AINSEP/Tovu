/** CMS dev-launch admission. Reuses the listener and deployment detectors; never reads secrets. */
import { isLoopbackHost, resolveBindHost } from "./bind-host.js";
import { detectDeploymentSignals } from "./boot-readiness-warnings.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

export interface LocalOwnerSignInPolicy {
  enabled: boolean;
  warning?: string;
}

/** Resolve the launcher opt-in once per boot; unsafe configuration stays disabled. @complexity O(1). */
export function resolveLocalOwnerSignIn(
  { env }: { env: Readonly<Record<string, string | undefined>> },
  { pathExists }: { pathExists?: (path: string) => boolean } = {},
): LocalOwnerSignInPolicy {
  if (env.TOVU_DEV_OWNER_SIGNIN !== "1") return { enabled: false };
  const deny = (reason: string): LocalOwnerSignInPolicy => ({ enabled: false,
    warning: `[local-owner-signin] WARNING: TOVU_DEV_OWNER_SIGNIN is disabled: ${reason}. Local owner sign-in requires a loopback dev launcher; deployed sites keep per-site accounts.` });
  if (env.NODE_ENV !== "development" || resolveRuntimeMode({ env }) === "production") return deny("production or non-development mode");
  try {
    if (detectDeploymentSignals({ env }, { pathExists }).length > 0) return deny("deployment detected");
  } catch { return deny("deployment status could not be verified"); }
  const launcherPid = Number(env.TOVU_DEV_SUPERVISOR_PID ?? env.TOVU_LOCAL_SITE_OWNER_PID);
  if (!Number.isSafeInteger(launcherPid) || launcherPid < 1) return deny("no local dev launcher");
  try {
    if (!isLoopbackHost(resolveBindHost(env.TOVU_HOST, undefined))) return deny("listener is not loopback-only");
  } catch { return deny("listener address is invalid"); }
  if (env.TOVU_PUBLIC_URL) {
    try {
      const url = new URL(env.TOVU_PUBLIC_URL);
      if (!isLocalAdminUrl({ url })) return deny("public origin is not loopback");
    } catch { return deny("public origin is invalid"); }
  }
  return { enabled: true };
}

/** Only the loopback host spellings our browser/desktop launchers use. @complexity O(1). */
export function isLocalAdminUrl({ url }: { url: URL }, _optional = {}): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

/** Reject DNS rebinding, cross-origin forms and forged forwarding headers before minting.
 * Fetch metadata is browser protection, not proof against a client that forges all headers.
 * @complexity O(h), h = request header names (bounded by the HTTP server).
 */
export function allowsLocalOwnerSignInRequest(
  { host, origin, fetchSite, fetchMode, headers }: {
    host: string | undefined; origin: string | undefined; fetchSite: string | undefined;
    fetchMode: string | undefined; headers: Readonly<Record<string, string | string[] | undefined>>;
  },
  _optional = {},
): boolean {
  // This POST is issued by fetch(), so navigation/form and no-cors requests have no valid use.
  if (!host || !origin || fetchSite !== "same-origin" || fetchMode !== "cors") return false;
  // A local tunnel has a loopback socket and may rewrite Host; refuse marker presence, even empty.
  for (const name of Object.keys(headers)) {
    const key = name.toLowerCase();
    if (key.startsWith("x-forwarded-") || key.startsWith("x-envoy-") || key.startsWith("x-ms-") || ["forwarded", "x-real-ip", "via", "cf-connecting-ip", "true-client-ip", "x-original-host", "x-client-ip", "x-cluster-client-ip", "fastly-client-ip", "tailscale-user-login", "x-original-forwarded-for"].includes(key)) return false;
  }
  try {
    const url = new URL(origin);
    return isLocalAdminUrl({ url }) && url.origin === origin && url.host === host;
  } catch { return false; }
}

/** Emit only a refusal reason, once at boot. @complexity O(1). */
export function warnOnLocalOwnerSignIn(
  { env }: { env: Readonly<Record<string, string | undefined>> },
  { pathExists, warn = console.warn }: { pathExists?: (path: string) => boolean; warn?: (line: string) => void } = {},
): void {
  const policy = resolveLocalOwnerSignIn({ env }, { pathExists });
  if (policy.warning) warn(policy.warning);
}
