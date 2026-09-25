/**
 * `npm start` — the actual server launcher (root `package.json`'s `"start"` script). `prestart`
 * (`prepare-start.mjs`) has already built whatever a fresh checkout was missing by the time this
 * runs.
 *
 * Four things, in order, so a fresh checkout with no manually-set `TOVU_INTEGRATIONS_ROOT_KEY`
 * "just works" (npm-start-just-works-plan-2026-09-24):
 *
 *   1. Load `.env` — `dev.mjs`/`dev-desktop.mjs` already did this; `npm start` never did, so an
 *      owner's key in `.env` never reached a plain `npm start` boot. (`clearBlankRootKeyEnv` below
 *      runs first, before `.env` loads, so a blank shell-exported var never shadows `.env`'s real
 *      value.)
 *   2. Default `TOVU_HOST` to loopback-only (`resolveStartHost` below) when the operator hasn't set
 *      it — SECURITY: `index.ts` itself defaults an unset `TOVU_HOST` to Node's all-interfaces
 *      bind (correct for its OTHER caller, the container entrypoint), so without this step a plain
 *      `npm start` would be reachable from the whole LAN by default.
 *   3. Pick a free port (3000-3019) ONLY when nothing already pins one, drop a loopback
 *      `TOVU_PUBLIC_URL` — see `planStart` below — and set the quiet-boot switches
 *      (`startQuietEnvDefaults`) so the server's one URL line is the whole output.
 *   4. `await import()` the compiled server IN-PROCESS — no extra child process, no signal
 *      forwarding to build, and `index.ts`'s own `process.ppid` watchdog still sees `npm` as its
 *      parent exactly as it does today. The imported `index.js` itself now ensures a usable root key
 *      exists (`ensureSiteKeyForBoot`, site-key plan §A3a) before it starts listening — this
 *      launcher no longer spawns a separate `tovu root-key ensure` step to do that (removed
 *      2026-09-24: `ensureSiteKeyForBoot`'s boot-path wiring made the standalone CLI command and
 *      this launcher's own spawn of it redundant).
 *
 * `index.ts` itself stays free of `.env`-loading or port-auto-pick logic: it is also the container
 * entrypoint (`Dockerfile`'s `CMD ["node","dist/src/index.js"]`), and neither belongs on that path.
 */
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

/**
 * Pure(ish) port/env decision (step 3 above). Auto-picks a free port only when ALL of: `PORT` is
 * unset in `env`, and `TOVU_PUBLIC_URL` is either unset or loopback. A non-loopback
 * `TOVU_PUBLIC_URL` or an explicit `PORT` is left completely alone — including never probing —
 * because today's `index.ts` `EADDRINUSE` refusal already covers that case correctly, and this
 * function has no business overriding a deliberately-fixed address.
 *
 * A loopback `TOVU_PUBLIC_URL` (the repo's own `.env` ships `https://localhost:3000`) is always
 * dropped, whatever port wins: the server refuses a loopback value as a public origin anyway
 * (`configured-origin.ts`, one warning line per boot), and with it unset every consumer falls back to
 * something that tracks the real port and scheme — the OAuth callback to the request's own
 * Host/protocol (`public-origin.ts`), the agent tools to `derivedPublicOrigin` (`PORT` plus the
 * live TLS scheme). Rewriting it to the picked port instead kept the stale `https` even on a boot
 * with no certs.
 *
 * @param {object} input
 * @param {NodeJS.ProcessEnv} input.env - environment to read `PORT`/`TOVU_PUBLIC_URL` from, AFTER
 *   `.env` has already been merged into it (so this never needs to ask which source a value came
 *   from — see this file's own header).
 * @param {boolean} input.dotenvLoaded - accepted for parity with the object `main()` builds once;
 *   not read by this function itself (see this file's own header for why the merged `env` above
 *   already carries everything step 3 needs).
 * @param {(port: number) => boolean | Promise<boolean>} input.isPortFree - probes one port.
 *   Injected so this function never touches a real socket directly; `main()` supplies a real one.
 * @returns {Promise<{ port: number, envOverrides: Record<string, string>, envRemovals: string[], refuse?: string }>}
 *   `envOverrides` holds only the keys that actually changed — empty when nothing needs to change,
 *   even when a probe ran and 3000 itself turned out to be free. `envRemovals` names variables
 *   `main()` must delete. `refuse` is set (and no probe runs) exactly when auto-pick was skipped
 *   outright; its value is a stable machine-readable reason, not user-facing text — this function
 *   never prints anything itself.
 * @complexity O(1) when `PORT` is set or `TOVU_PUBLIC_URL` is non-loopback (no probing); otherwise
 *   at most `PORT_PROBE_RANGE` calls to `isPortFree`.
 */
export async function planStart(input) {
  const { env, isPortFree } = input;
  const publicUrl = classifyPublicUrl(env.TOVU_PUBLIC_URL);
  const envRemovals = publicUrl === "loopback" ? ["TOVU_PUBLIC_URL"] : [];

  if (env.PORT !== undefined) {
    return { port: Number(env.PORT), envOverrides: {}, envRemovals };
  }
  // Not this function's job to diagnose a malformed TOVU_PUBLIC_URL — leave port selection alone,
  // same as the non-loopback case, and let boot proceed to whatever happens next.
  if (publicUrl === "unparsable") return { port: DEFAULT_START_PORT, envOverrides: {}, envRemovals, refuse: "unparsable-public-url" };
  if (publicUrl === "public") return { port: DEFAULT_START_PORT, envOverrides: {}, envRemovals, refuse: "non-loopback-public-url" };

  for (let port = DEFAULT_START_PORT; port < DEFAULT_START_PORT + PORT_PROBE_RANGE; port++) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design: stop at the FIRST free port.
    const free = await isPortFree(port);
    if (!free) continue;
    if (port === DEFAULT_START_PORT) return { port, envOverrides: {}, envRemovals };
    return { port, envOverrides: { PORT: String(port) }, envRemovals };
  }

  return { port: DEFAULT_START_PORT, envOverrides: {}, envRemovals, refuse: "no-free-port-in-range" };
}

/** `"unset" | "unparsable" | "loopback" | "public"` for a raw `TOVU_PUBLIC_URL` value. */
function classifyPublicUrl(raw) {
  if (raw === undefined) return "unset";
  try {
    return isLoopbackHostname(new URL(raw).hostname) ? "loopback" : "public";
  } catch {
    return "unparsable";
  }
}

/**
 * Deletes a BLANK `TOVU_INTEGRATIONS_ROOT_KEY` from `env` — must run before `.env` is loaded.
 * `process.loadEnvFile` never overrides a variable that is already present, even an empty one, and
 * the keyring (`keyring.env.ts`'s `readActiveRootKeyMaterial`) treats an empty value as absent. So a
 * blank shell value (an `export VAR=$UNSET` in a profile is enough) would hide `.env`'s real key,
 * and the boot path's own `ensureSiteKeyForBoot` (site-key plan §A3a) would then mint a second key
 * file — two keys for one install's data.
 *
 * @param {NodeJS.ProcessEnv} env - mutated in place.
 * @complexity O(1).
 */
export function clearBlankRootKeyEnv(env) {
  if (env.TOVU_INTEGRATIONS_ROOT_KEY === "") delete env.TOVU_INTEGRATIONS_ROOT_KEY;
}

/**
 * The quiet-boot switches `npm start` sets so its whole output is the server's one URL line:
 * `TOVU_ROOT_KEY_NOTICE=off` (silences `root-key-boot-notice.ts`'s local-mode "no usable root key"
 * wall unconditionally — `npm start`'s whole point is a one-line boot) and
 * `TOVU_DAEMON_LIFECYCLE_LOG=off` (hides the agent daemon's first-spawn and deliberate-exit lines;
 * respawns and crashes still print — see `daemon-supervisor.ts`). An operator's own
 * `TOVU_DAEMON_LIFECYCLE_LOG` (e.g. `on`) wins.
 *
 * `TOVU_ROOT_KEY_NOTICE=off` used to rest on a claim that was briefly FALSE (2026-09-24, before
 * `site-key-ensure.ts`'s `ensureSiteKeyForBoot` learned to mint a missing `.site-meta.json`): the
 * default `sites/<name>/` directory this launcher boots is never given one by `tovu init` (it isn't
 * an install dir at all — see `content-db-schema-guard.ts`'s own header), so `ensureSiteKeyForBoot`
 * silently did nothing for it, no key was ever ensured, and this switch silenced the one notice that
 * would have said so — unconditionally, with no way for that site's operator to see it. Now that
 * `ensureSiteKeyForBoot` mints a fresh per-site identity for exactly that case (and never throws even
 * when the write itself fails — the same 2026-09-24 fix), the premise holds again: every `npm start`
 * boot really does end with a key ensured or a caught, logged failure, before this notice would ever
 * fire. This switch stays unconditional regardless — `npm start`'s one-line-boot contract does not
 * bend for a boot-time key failure either; that failure's own `console.error` line is what a reader
 * of this launcher's output would see instead.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Record<string, string>} the variables to set.
 * @complexity O(1).
 */
export function startQuietEnvDefaults(env) {
  const defaults = { TOVU_ROOT_KEY_NOTICE: "off" };
  if (env.TOVU_DAEMON_LIFECYCLE_LOG === undefined) defaults.TOVU_DAEMON_LIFECYCLE_LOG = "off";
  return defaults;
}

/**
 * Resolves the `TOVU_HOST` value `main()` both probes with and writes back to `process.env` before
 * importing `dist/src/index.js` in-process. `index.ts`'s own default (`resolveBindHost` called with
 * `process.env.TOVU_HOST`, falling back to `undefined`) is Node's all-interfaces bind — correct for
 * `index.ts`'s OTHER caller, the container entrypoint (Docker/compose/Fly/Render all bind every
 * interface on purpose), but wrong for a developer running plain `npm start`: without this, a
 * TOVU_HOST-less `npm start` would boot the server reachable from the whole LAN by default. `npm
 * start` narrows that default to loopback-only unless the operator explicitly set `TOVU_HOST`.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string} the operator's own `TOVU_HOST` when set to a non-blank value, else `"127.0.0.1"`.
 * @complexity O(1).
 */
export function resolveStartHost(env) {
  return env.TOVU_HOST && env.TOVU_HOST.length > 0 ? env.TOVU_HOST : "127.0.0.1";
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

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

  clearBlankRootKeyEnv(process.env);
  const dotenvLoaded = loadRepoRootEnvFile(repoRoot);

  const host = resolveStartHost(process.env);
  // Security-critical: `dist/src/index.js` (imported below) reads `process.env.TOVU_HOST` itself
  // and defaults to Node's all-interfaces bind when it's unset (see `resolveStartHost`'s header) —
  // this write is what actually narrows a plain `npm start` to loopback-only, not just the probe.
  process.env.TOVU_HOST = host;
  const plan = await planStart({
    env: process.env,
    dotenvLoaded,
    isPortFree: (port) => probePortFree(port, host),
  });
  for (const key of plan.envRemovals) delete process.env[key];
  Object.assign(process.env, plan.envOverrides, startQuietEnvDefaults(process.env));

  await import(pathToFileURL(path.join(repoRoot, "dist", "src", "index.js")));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
