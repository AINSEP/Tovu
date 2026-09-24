/**
 * `npm start` — the actual server launcher (root `package.json`'s `"start"` script). `prestart`
 * (`prepare-start.mjs`) has already built whatever a fresh checkout was missing by the time this
 * runs.
 *
 * Four things, in order, so a fresh checkout with no manually-set `TOVU_INTEGRATIONS_ROOT_KEY`
 * "just works" (npm-start-just-works-plan-2026-09-24):
 *
 *   1. Load `.env` — `dev.mjs`/`dev-desktop.mjs` already did this; `npm start` never did, so an
 *      owner's key in `.env` never reached a plain `npm start` boot.
 *   2. Ensure a usable root key exists (`tovu root-key ensure --quiet`, the compiled CLI) — a
 *      dumb, idempotent step that never overwrites an existing key or a key-dependent database's
 *      only usable key (see `cli/commands/root-key.ts`'s own header). Runs regardless of exit
 *      code: this launcher never blocks a boot on it, same as today's "loud, not closed" posture.
 *   3. Pick a free port (3000-3019) ONLY when nothing already pins one — see `planStart` below —
 *      and set `TOVU_ROOT_KEY_NOTICE=off` so `root-key-boot-notice.ts`'s own longer wall doesn't
 *      print a second, redundant notice underneath this file's one-line summary from step 2.
 *   4. `await import()` the compiled server IN-PROCESS — no extra child process, no signal
 *      forwarding to build, and `index.ts`'s own `process.ppid` watchdog still sees `npm` as its
 *      parent exactly as it does today.
 *
 * `index.ts` itself stays free of `.env`-loading or port-auto-pick logic: it is also the container
 * entrypoint (`Dockerfile`'s `CMD ["node","dist/src/index.js"]`), and neither belongs on that path.
 */
import { spawnSync } from "node:child_process";
import { connect, createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadRepoRootEnvFile } from "./load-repo-root-env.mjs";

const DEFAULT_START_PORT = 3000;
const PORT_PROBE_RANGE = 20; // 3000-3019 inclusive

/** `hostname === "localhost" | "127.0.0.1" | "::1"` — the three loopback forms this repo's own
 *  `TOVU_PUBLIC_URL` values use. A plain, self-contained check (this file runs under bare `node`,
 *  never `tsx`, so it cannot import the TypeScript `isLoopbackHost` in `cli/commands/serve.ts`'s
 *  own `bind-host.ts`). */
function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/** Rewrites `rawUrl`'s port to `newPort`, preserving everything else. Returns the clean origin
 *  (no trailing slash) for the common bare-origin `.env` default; reconstructs the full URL when a
 *  path/query/hash is present so those are never silently dropped. */
function rewritePublicUrlPort(rawUrl, newPort) {
  const url = new URL(rawUrl);
  url.port = String(newPort);
  if (url.pathname === "/" && url.search === "" && url.hash === "") return url.origin;
  return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`;
}

/**
 * Pure(ish) port/env decision (decision 4). Auto-picks a free port only when ALL of: `PORT` is
 * unset in `env`, and `TOVU_PUBLIC_URL` is either unset or loopback. A non-loopback
 * `TOVU_PUBLIC_URL` or an explicit `PORT` is left completely alone — including never probing —
 * because today's `index.ts` `EADDRINUSE` refusal already covers that case correctly, and this
 * function has no business overriding a deliberately-fixed address.
 *
 * @param {object} input
 * @param {NodeJS.ProcessEnv} input.env - environment to read `PORT`/`TOVU_PUBLIC_URL` from, AFTER
 *   `.env` has already been merged into it (so this never needs to ask which source a value came
 *   from — see this file's own header).
 * @param {boolean} input.dotenvLoaded - accepted for parity with the object `main()` builds once;
 *   not read by this function itself (see this file's own header for why the merged `env` above
 *   already carries everything decision 4 needs).
 * @param {(port: number) => boolean | Promise<boolean>} input.isPortFree - probes one port.
 *   Injected so this function never touches a real socket directly; `main()` supplies a real one.
 * @returns {Promise<{ port: number, envOverrides: Record<string, string>, refuse?: string }>}
 *   `envOverrides` holds only the keys that actually changed — empty when nothing needs to change,
 *   even when a probe ran and 3000 itself turned out to be free. `refuse` is set (and no probe
 *   runs) exactly when auto-pick was skipped outright; its value is a stable machine-readable
 *   reason, not user-facing text — this function never prints anything itself.
 * @complexity O(1) when `PORT` is set or `TOVU_PUBLIC_URL` is non-loopback (no probing); otherwise
 *   at most `PORT_PROBE_RANGE` calls to `isPortFree`.
 */
export async function planStart(input) {
  const { env, isPortFree } = input;

  if (env.PORT !== undefined) {
    return { port: Number(env.PORT), envOverrides: {} };
  }

  const publicUrl = env.TOVU_PUBLIC_URL;
  if (publicUrl !== undefined) {
    let parsedPublicUrl;
    try {
      parsedPublicUrl = new URL(publicUrl);
    } catch {
      // Not this function's job to diagnose a malformed TOVU_PUBLIC_URL — leave port selection
      // alone, same as the non-loopback case, and let boot proceed to whatever happens next.
      return { port: DEFAULT_START_PORT, envOverrides: {}, refuse: "unparsable-public-url" };
    }
    if (!isLoopbackHostname(parsedPublicUrl.hostname)) {
      return { port: DEFAULT_START_PORT, envOverrides: {}, refuse: "non-loopback-public-url" };
    }
  }

  for (let port = DEFAULT_START_PORT; port < DEFAULT_START_PORT + PORT_PROBE_RANGE; port++) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design: stop at the FIRST free port.
    const free = await isPortFree(port);
    if (!free) continue;
    if (port === DEFAULT_START_PORT) return { port, envOverrides: {} };

    const envOverrides = { PORT: String(port) };
    if (publicUrl !== undefined && new URL(publicUrl).port === String(DEFAULT_START_PORT)) {
      envOverrides.TOVU_PUBLIC_URL = rewritePublicUrlPort(publicUrl, port);
    }
    return { port, envOverrides };
  }

  return { port: DEFAULT_START_PORT, envOverrides: {}, refuse: "no-free-port-in-range" };
}

/** Whether something is already accepting connections on `port` at `host` — a CONNECT probe, not a
 *  bind probe. Resolves `true` on a successful connect (destroyed immediately, no data sent),
 *  `false` on `ECONNREFUSED`, any other connect error, or a 300ms timeout. */
function isPortReachable(port, host) {
  return new Promise((resolve) => {
    const socket = connect({ port, host, timeout: 300 });
    const settle = (reachable) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/**
 * Real probe for {@link planStart}'s `isPortFree`.
 *
 * A bind-and-release on `host` ALONE is not enough: measured directly (2026-09-24 live check), an
 * existing server already listening on the IPv6 wildcard address let an explicit IPv4 `127.0.0.1`
 * bind on the SAME port number succeed right alongside it — no `EADDRINUSE` at all — so a bind-only
 * probe reported a port "free" that this process then also started answering requests on, right
 * next to the owner's already-running dev server on the identical port. Checks CONNECT reachability
 * on both `127.0.0.1` and `::1` first — that answers "is anything already serving traffic here"
 * regardless of which address family it bound to — and only attempts the real bind on `host` once
 * NEITHER loopback address answers. `EADDRINUSE` (or any other bind error) still counts as "not
 * usable" (fails closed toward NOT auto-picking a port this process cannot actually bind anyway).
 *
 * @param {number} port
 * @param {string} host - the address `main()` will actually bind to if this port is chosen.
 * @returns {Promise<boolean>}
 * @complexity O(1) — up to two connect attempts plus one bind/close.
 */
async function probePortFree(port, host) {
  if (await isPortReachable(port, "127.0.0.1")) return false;
  if (await isPortReachable(port, "::1")) return false;
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });
}

/** Runs `tovu root-key ensure --quiet` via the compiled CLI. Never throws — this launcher's own
 *  posture is "loud, not closed": a failure here still lets the server attempt to boot, the same
 *  way an unset key always has. `stdio: "inherit"` lets the command's own single refusal/unreadable
 *  line (if any) reach the terminal directly; a clean run prints nothing at all. */
function ensureRootKey(repoRoot) {
  spawnSync(process.execPath, [path.join(repoRoot, "dist", "src", "cli", "main.js"), "root-key", "ensure", "--quiet"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

  const dotenvLoaded = loadRepoRootEnvFile(repoRoot);

  ensureRootKey(repoRoot);

  const host = process.env.TOVU_HOST && process.env.TOVU_HOST.length > 0 ? process.env.TOVU_HOST : "127.0.0.1";
  const plan = await planStart({
    env: process.env,
    dotenvLoaded,
    isPortFree: (port) => probePortFree(port, host),
  });
  for (const [key, value] of Object.entries(plan.envOverrides)) {
    process.env[key] = value;
  }

  // Suppresses `root-key-boot-notice.ts`'s own longer wall: this launcher already spoke (step 2
  // above, silent on success/no-op, one line on refusal) — see that file's own header for the
  // exact-match contract this value must satisfy.
  process.env.TOVU_ROOT_KEY_NOTICE = "off";

  await import(pathToFileURL(path.join(repoRoot, "dist", "src", "index.js")));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
