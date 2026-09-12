import { request as httpRequest } from "node:http";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";

/**
 * @file Decides whether a site this shell spawns should serve `/admin/*` from the admin Vite dev
 * server instead of the built `apps/admin/dist` bundle.
 *
 * The problem this exists for: `buildServeEnv` sets `TOVU_ADMIN_DIST`, so a desktop site window
 * always rendered `apps/admin/dist` — whatever `npm run build` last produced in `apps/admin`. That
 * bundle is not rebuilt by anything the desktop shell does, so a checkout whose admin build is
 * weeks old renders weeks-old admin UI inside the desktop while the SAME developer's browser at
 * `:3000/admin/` shows current source. `apps/website`'s `admin-static.ts` already has the branch
 * that fixes this (`TOVU_ADMIN_DEV_PROXY_URL` proxies `/admin/*` to Vite), and
 * `development/scripts/dev.mjs:355` already sets it for the browser-facing API — this module is
 * what lets the desktop opt into the same branch.
 *
 * ## Why a probe rather than just setting the variable
 *
 * The variable is not free to set optimistically. `admin-static.ts`'s precedence is
 * SEA → dev-proxy → static dist, and the dev-proxy branch `return`s: once set, the static bundle is
 * no longer a fallback, it is unreachable. So setting it when Vite is NOT running turns a desktop
 * that renders a stale-but-working admin into one that renders a 502 from
 * `createAdminDevProxyRequestHandler`'s error path. A developer running only `apps/desktop` (its
 * `dev` script is a bare `electron .`, which starts no Vite) is the common case, not the rare one.
 * Probing first means this can only ever upgrade the experience, never break it.
 *
 * ## Why two candidate schemes rather than one derived answer
 *
 * Dev TLS is decided by whether mkcert's cert/key files exist on disk at `dev.mjs` run time
 * (`resolveDevTlsCredentials`), not by any environment variable this process can read — so there is
 * no env-only derivation that is reliably right. `TOVU_DISABLE_DEV_TLS` only forces it OFF; its
 * absence does not imply TLS is on. Rather than guess and be wrong half the time, this offers both
 * and lets the probe decide, which is the same answer a browser would get.
 */

/** How long a single candidate gets to answer before it is treated as not running. */
const PROBE_TIMEOUT_MS = 1500;

/** Vite's dev port, matching `apps/admin/vite.config.ts:118` and `dev.mjs:59`'s identical default. */
const DEFAULT_VITE_PORT = 5173;

/** {@link adminDevProxyCandidates}'s input. */
interface AdminDevProxyInput {
  isPackaged: boolean;
  env: NodeJS.ProcessEnv;
}

/** What a probe sends with: `node:http`'s or `node:https`'s `request`, or a test fake. */
type ProbeRequestFn = (options: RequestOptions, callback: (res: IncomingMessage) => void) => ClientRequest;

/** {@link resolveAdminDevProxyUrl}'s input. */
interface ResolveAdminDevProxyInput extends AdminDevProxyInput {
  requestFn?: ProbeRequestFn;
}

/**
 * The admin dev-server origins worth trying, most likely first — empty when this shell must not
 * proxy at all.
 *
 * Returns `[]` when packaged, which is the whole packaged-mode guarantee: no candidate means no
 * probe and no `TOVU_ADMIN_DEV_PROXY_URL`, so a packaged app's child environment is byte-identical
 * to what it was before this module existed. `admin-static.ts`'s SEA branch would also win on its
 * own, but a packaged build that is not a SEA single-binary (this app stages a plain `dist/`, so it
 * is NOT a SEA) would not be covered by that at all — this is the gate that actually holds.
 *
 * An operator-set `TOVU_ADMIN_DEV_PROXY_URL` is honored verbatim and alone: someone who exported a
 * specific origin means that one, and silently falling back to a guessed localhost would point
 * their desktop at a different server than the one they named.
 *
 * @param input.isPackaged Electron's `app.isPackaged` — the same dev/packaged distinction
 *   `packaged-paths.ts` consumes, deliberately not a second, independently-derived one.
 * @param input.env environment to read (`process.env` in production; injectable for tests).
 * @returns candidate origins, in probe order.
 * @complexity O(1).
 */
function adminDevProxyCandidates(input: AdminDevProxyInput): string[] {
  if (input.isPackaged) return [];

  const explicit = input.env.TOVU_ADMIN_DEV_PROXY_URL?.trim();
  if (explicit) return [explicit];

  const port = Number(input.env.TOVU_ADMIN_DEV_PORT ?? DEFAULT_VITE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return [];

  return [`https://localhost:${port}`, `http://localhost:${port}`];
}

/**
 * Whether `origin` has something listening that speaks HTTP.
 *
 * ANY status code counts as reachable, 404 included. The question is "is the dev server up", not
 * "does it serve this path" — Vite answers `/admin/` from `base` only once its own middleware is
 * ready, and a stricter check would make this flap during Vite's startup window.
 *
 * `rejectUnauthorized: false` for the same reason `admin-dev-proxy.ts`'s own upstream agent sets it:
 * Vite's mkcert certificate is trusted by the OS and the browser but not by Node's separate bundled
 * CA list. Scoped to this one probe request; no global TLS setting is touched.
 *
 * @complexity O(1); one request, abandoned after {@link PROBE_TIMEOUT_MS}.
 */
function probeOrigin(origin: string, requestFn: ProbeRequestFn | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    let target: URL;
    try {
      target = new URL(origin);
    } catch {
      resolve(false);
      return;
    }

    const send: ProbeRequestFn = requestFn ?? (target.protocol === "https:" ? httpsRequest : httpRequest);
    const req = send(
      {
        hostname: target.hostname,
        port: target.port,
        path: "/admin/",
        method: "GET",
        rejectUnauthorized: false,
        timeout: PROBE_TIMEOUT_MS,
      },
      (res: IncomingMessage) => {
        res.resume();
        resolve(true);
      },
    );

    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

/**
 * The admin dev-server origin this shell should hand to a `tovu serve` child, or `null` to leave
 * `TOVU_ADMIN_DEV_PROXY_URL` unset and keep today's built-bundle behavior.
 *
 * Probes candidates in order and returns the first that answers, so a developer who is running
 * `npm run dev` gets live admin source inside the desktop and one who is not gets exactly what they
 * got before.
 *
 * @param input.isPackaged Electron's `app.isPackaged`.
 * @param input.env environment to read.
 * @param input.requestFn injectable request function (test seam); defaults to `node:http(s)`.
 * @complexity O(n) in the candidate count — at most two probes, each capped at
 *   {@link PROBE_TIMEOUT_MS}.
 */
async function resolveAdminDevProxyUrl(input: ResolveAdminDevProxyInput): Promise<string | null> {
  for (const candidate of adminDevProxyCandidates(input)) {
    if (await probeOrigin(candidate, input.requestFn)) return candidate;
  }
  return null;
}

export { adminDevProxyCandidates, resolveAdminDevProxyUrl, PROBE_TIMEOUT_MS, DEFAULT_VITE_PORT };
export type { AdminDevProxyInput, ProbeRequestFn, ResolveAdminDevProxyInput };
