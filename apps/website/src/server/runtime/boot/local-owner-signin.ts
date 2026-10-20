/** CMS local-launch admission. Reuses listener/deployment policy and Jini token comparison. */
import { timingSafeEqual } from "node:crypto";
import { timingSafeTokenMatch } from "@jini-ai/core";
import { isLoopbackHost, resolveBindHost } from "./bind-host.js";
import { detectDeploymentSignals } from "./boot-readiness-warnings.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

export interface LocalOwnerSignInPolicy {
  enabled: boolean;
  warning?: string;
  /** Desktop policies require proof from the site's Electron session on every bootstrap POST. */
  acceptsCapability?: (required: { capability: string | undefined }) => boolean;
}

/** Resolve the launcher opt-in once per boot; unsafe configuration stays disabled. @complexity O(1). */
export function resolveLocalOwnerSignIn(
  { env }: { env: Readonly<Record<string, string | undefined>> },
  { pathExists, parentPid = process.ppid }: { pathExists?: (path: string) => boolean; parentPid?: number } = {},
): LocalOwnerSignInPolicy {
  const { capability, desktopLaunch, desktop } = classifyLocalOwnerLaunch({ env });
  if (!desktopLaunch && env.TOVU_DEV_OWNER_SIGNIN !== "1") return { enabled: false };
  const deny = (reason: string): LocalOwnerSignInPolicy => ({ enabled: false,
    warning: `[local-owner-signin] WARNING: ${desktopLaunch ? "TOVU_DESKTOP_OWNER_SIGNIN" : "TOVU_DEV_OWNER_SIGNIN"} is disabled: ${reason}. Local owner sign-in requires a loopback dev launcher; deployed sites keep per-site accounts.` });
  const launchRefusal = localLaunchEnvironmentRefusal({ env, desktopLaunch, desktop, parentPid });
  if (launchRefusal) return deny(launchRefusal);
  const deploymentRefusal = localDeploymentRefusal({ env, desktop, pathExists });
  if (deploymentRefusal) return deny(deploymentRefusal);
  const listenerRefusal = localLauncherListenerRefusal({ env, desktop });
  if (listenerRefusal) return deny(listenerRefusal);
  const originRefusal = localPublicOriginRefusal({ env });
  if (originRefusal) return deny(originRefusal);
  return desktop ? { enabled: true, acceptsCapability: ({ capability: presented }) =>
    typeof presented === "string" && presented.length === 64 && timingSafeTokenMatch({
      presented, expected: capability!, timingSafeEqual: ({ left, right }) => timingSafeEqual(left, right),
    }),
  } : { enabled: true };
}

type LocalLaunchEnv = Readonly<Record<string, string | undefined>>;

function classifyLocalOwnerLaunch({ env }: { env: LocalLaunchEnv }, _options = {}) {
  const capability = env.TOVU_DESKTOP_OWNER_SIGNIN;
  return {
    capability,
    desktopLaunch: capability !== undefined || env.TOVU_DESKTOP_OWNER_PID !== undefined,
    desktop: /^[a-f0-9]{64}$/.test(capability ?? ""),
  };
}

function localLaunchEnvironmentRefusal(
  { env, desktopLaunch, desktop, parentPid }: { env: LocalLaunchEnv; desktopLaunch: boolean; desktop: boolean; parentPid: number },
  _options = {},
): string | undefined {
  if (desktopLaunch && (!desktop || env.TOVU_DESKTOP_OWNER_PID !== String(parentPid))) return "invalid desktop capability or launcher parent";
  if ((!desktop && env.NODE_ENV !== "development") || resolveRuntimeMode({ env }) === "production") return "production or non-development mode";
  return undefined;
}

function localDeploymentRefusal(
  { env, desktop, pathExists }: { env: LocalLaunchEnv; desktop: boolean; pathExists?: (path: string) => boolean },
  _options = {},
): string | undefined {
  try {
    // A packaged local desktop may use NODE_ENV=production. Its private launch capability is
    // the admission signal; actual container/platform deployment signals still refuse it.
    const signals = detectDeploymentSignals({ env }, { pathExists });
    if (signals.some((signal) => !desktop || signal !== "NODE_ENV=production")) return "deployment detected";
  } catch { return "deployment status could not be verified"; }
  return undefined;
}

function localLauncherListenerRefusal(
  { env, desktop }: { env: LocalLaunchEnv; desktop: boolean },
  _options = {},
): string | undefined {
  const launcherPid = Number(desktop ? env.TOVU_DESKTOP_OWNER_PID : env.TOVU_DEV_SUPERVISOR_PID ?? env.TOVU_LOCAL_SITE_OWNER_PID);
  if (!Number.isSafeInteger(launcherPid) || launcherPid < 1) return "no local dev launcher";
  try {
    if (!isLoopbackHost(resolveBindHost(env.TOVU_HOST, undefined))) return "listener is not loopback-only";
  } catch { return "listener address is invalid"; }
  return undefined;
}

function localPublicOriginRefusal({ env }: { env: LocalLaunchEnv }, _options = {}): string | undefined {
  if (env.TOVU_PUBLIC_URL) {
    try {
      const url = new URL(env.TOVU_PUBLIC_URL);
      if (!isLocalAdminUrl({ url })) return "public origin is not loopback";
    } catch { return "public origin is invalid"; }
  }
  return undefined;
}

/** Capture the launch policy and immediately erase the private environment keys, even on refusal.
 * Children inherit env; keeping this secret there would arm unrelated servers they launch.
 * @complexity O(n) for n environment keys; policy checks are bounded.
 */
export function consumeLocalOwnerSignIn(
  { env }: { env: Record<string, string | undefined> },
  options: Parameters<typeof resolveLocalOwnerSignIn>[1] = {},
): LocalOwnerSignInPolicy {
  const snapshot = { ...env };
  delete env.TOVU_DESKTOP_OWNER_SIGNIN;
  delete env.TOVU_DESKTOP_OWNER_PID;
  return resolveLocalOwnerSignIn({ env: snapshot }, options);
}

// Process boot state is intentionally captured once, before any server child can inherit env.
// Route/middleware defaults share this policy; re-reading the scrubbed env would disable re-entry.
export const bootLocalOwnerSignIn = consumeLocalOwnerSignIn({ env: process.env });

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
  if (hasProxyMarkerHeaders({ headers })) return false;
  try {
    const url = new URL(origin);
    return isLocalAdminUrl({ url }) && url.origin === origin && url.host === host;
  } catch { return false; }
}

function hasProxyMarkerHeaders(
  { headers }: { headers: Readonly<Record<string, string | string[] | undefined>> },
  _options = {},
): boolean {
  // A local tunnel has a loopback socket and may rewrite Host; refuse marker presence, even empty.
  for (const name of Object.keys(headers)) {
    const key = name.toLowerCase();
    if (key.startsWith("x-forwarded-") || key.startsWith("x-envoy-") || key.startsWith("x-ms-") || ["forwarded", "x-real-ip", "via", "cf-connecting-ip", "true-client-ip", "x-original-host", "x-client-ip", "x-cluster-client-ip", "fastly-client-ip", "tailscale-user-login", "x-original-forwarded-for"].includes(key)) return true;
  }
  return false;
}

/** Emit only a refusal reason, once at boot. @complexity O(1). */
export function warnOnLocalOwnerSignIn(
  { env }: { env: Readonly<Record<string, string | undefined>> },
  { pathExists, warn = console.warn }: { pathExists?: (path: string) => boolean; warn?: (line: string) => void } = {},
): void {
  const policy = resolveLocalOwnerSignIn({ env }, { pathExists });
  if (policy.warning) warn(policy.warning);
}
