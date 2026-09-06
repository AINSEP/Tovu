/**
 * @file Own-server mode: spawn Tovu's own `tovu serve <dir>` CLI, learn the port it bound, and
 * supervise it for the life of the window.
 *
 * Deliberately free of any `electron` import. Everything here is plain Node, so every function is
 * directly assertable from `node --test` without an Electron runtime — `main.cjs` keeps the parts
 * that genuinely need `app`/`BrowserWindow` and nothing else. `spawnFn` is injectable for the same
 * reason: the supervision contract (ready, boot timeout, premature exit, graceful stop) is testable
 * against a fake child, so no test ever has to boot a real site.
 *
 * The seam is Tovu's, not ours. `apps/website/src/cli/commands/serve.ts` boots the site dir end to
 * end and prints exactly one startup line (api.spec.md §5); `cli/errors.ts` prints exactly one
 * `tovu: <CODE>: <message>` line on failure. This module reads both and nothing else, so no file
 * under `apps/website/` has to change for the desktop shell to exist.
 */
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const { spawn: nodeSpawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");

/** `apps/website/src/cli/commands/serve.ts`'s documented startup line (api.spec.md §5). */
const BOOT_LINE = /^tovu serve: dir=(.+) port=(\d+) schemaVersion=(\d+) workspaceId=(\S+)$/m;

/** `apps/website/src/cli/errors.ts`'s single stderr line — `stderrLine()` builds exactly this shape. */
const CLI_ERROR_LINE = /^tovu: (\S+): (.*)$/m;

/**
 * How long to wait for the boot line before giving up. `bootSiteDir` runs migrations on a cold site
 * dir, which is the slow case; the daemon spawn happens *after* the line is printed and so is not
 * on this clock.
 */
const DEFAULT_READY_TIMEOUT_MS = 60_000;

/** Grace given to `serve.ts`'s own SIGTERM drain (BR-07) before the process group is force-killed. */
const DEFAULT_STOP_GRACE_MS = 5_000;

/**
 * Parse the startup line out of accumulated stdout.
 *
 * @param text stdout captured so far; partial output is fine, the line is matched with `^…$`.
 * @returns the reported fields, or `null` if the line has not been printed yet.
 * @complexity O(n) in `text` length per call.
 */
function parseBootLine(text) {
  const match = BOOT_LINE.exec(text);
  if (match === null) return null;
  return { dir: match[1], port: Number(match[2]), schemaVersion: Number(match[3]), workspaceId: match[4] };
}

/**
 * Parse Tovu's single CLI error line, so a failed boot reports Tovu's own diagnosis rather than a
 * bare exit code. `PORT_IN_USE`, `SITE_DIR_INVALID` and `SITE_CORRUPT` all arrive this way.
 *
 * @returns `{ code, message }`, or `null` when the child failed without printing one.
 * @complexity O(n) in `text` length per call.
 */
function parseCliErrorLine(text) {
  const match = CLI_ERROR_LINE.exec(text);
  return match === null ? null : { code: match[1], message: match[2] };
}

/**
 * Tovu's own `bin.tovu` entry, read from its `package.json` rather than hardcoded.
 *
 * Same "read the manifest, never the literal path" rule Tovu-Runner adopted after Tovu's `src/` was
 * renamed once already (2026-08-27 restructure) and broke a hardcoded `dist/src/cli/main.js` in two
 * places at once. The existence check is here rather than left to `spawn` because the failure is
 * routine — a fresh checkout has no `dist/` — and `ENOENT` on an Electron child is otherwise
 * invisible to whoever has to fix it.
 *
 * @throws {Error} when the manifest has no `bin.tovu`, or the entry it names is not built yet.
 * @complexity O(1).
 */
function resolveCliEntry(repoRoot) {
  const manifestPath = path.join(repoRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (typeof manifest.bin?.tovu !== "string") {
    throw new Error(`${manifestPath} has no "bin.tovu" field.`);
  }
  const entry = path.join(repoRoot, manifest.bin.tovu);
  if (!fs.existsSync(entry)) {
    throw new Error(`Tovu's CLI is not built: ${entry} does not exist (from ${manifestPath}'s bin.tovu). Run \`npm run build\` at the repo root first.`);
  }
  return entry;
}

/**
 * The CLI's own TypeScript source, run directly instead of the compiled `dist/` this checkout's
 * `bin.tovu` names — the "source" {@link buildCliSpawnPlan} mode.
 *
 * Exists to close a real bug found 2026-09-05: `dist/` is only ever as fresh as the last manual
 * `npm run build`, and this checkout's own `dist/src/cli/main.js` was last built 2026-08-28 —
 * schema v50 against current source's v57. Own-server mode therefore rejected every site created
 * from current source with `SITE_NEWER_THAN_RUNTIME`, a SECOND, independent reason the app didn't
 * work, on top of nothing being multi-site yet. Rebuilding `dist/` was not an option here: `npm run
 * build` is gated behind `check-no-linked-jini.mjs`, and this checkout deliberately keeps 13
 * `@jini-ai/*` packages symlinked to a local Jini checkout for active development — running the
 * build (or `unlink:jini`) would fight that, not fix this.
 *
 * `development/scripts/dev.mjs` already runs `apps/website/src/index.ts` this same way (`npx tsx
 * watch ...`) for exactly this reason: a dev checkout's compiled output cannot be trusted to match
 * its own source. This function points at the CLI's equivalent entry — `apps/website/src/cli/main.ts`
 * — so `serve`/`init` reach the SAME uncompiled code the running dev server does.
 *
 * @throws {Error} when the TS source itself is missing (a checkout with no `apps/website/src/cli/`
 *   at all, which "packaged" mode would use instead — see {@link buildCliSpawnPlan}).
 * @complexity O(1).
 */
function resolveDevCliEntry(repoRoot) {
  const entry = path.join(repoRoot, "apps", "website", "src", "cli", "main.ts");
  if (!fs.existsSync(entry)) {
    throw new Error(`Tovu's CLI source is missing: ${entry} does not exist.`);
  }
  return entry;
}

/**
 * Build the `{ command, args }` to spawn for one Tovu CLI invocation (`serve` or `init`), in either
 * of two modes:
 *
 * - `"source"` (the default own-server mode uses, via `main.cjs`'s `TOVU_DESKTOP_CLI_MODE`) runs
 *   current TypeScript directly under `--import tsx` — see {@link resolveDevCliEntry} for why this
 *   is the mode that actually needs to exist.
 * - `"compiled"` runs the built `dist/` CLI via {@link resolveCliEntry} — this function's OWN
 *   default when no mode is given, unchanged from before `"source"` existed, so every existing
 *   caller and test that never mentions a mode keeps its exact prior behavior.
 *
 * Either way the command is `process.execPath` (Electron's own Node, `ELECTRON_RUN_AS_NODE=1` from
 * {@link buildCliEnv}), never `npx`/a bare `tsx` shebang — running `npx` would hand execution to
 * whatever Node is first on `PATH`, reintroducing exactly the system-Node dependency
 * `buildServeEnv`'s own comment already explains was removed on purpose.
 *
 * `--import` names `require.resolve("tsx")`'s own ABSOLUTE path, not the bare specifier `"tsx"`:
 * Node resolves a bare `--import` specifier relative to the CHILD's own `cwd`, walking up through
 * ITS ancestor `node_modules` directories — which happens to still find this repo's own
 * `node_modules/tsx` for any cwd still inside the repo (confirmed: works from `apps/desktop/`, whose
 * own `node_modules` has no `tsx` of its own), but fails outright once the child's cwd has no such
 * ancestor at all (confirmed: `ERR_MODULE_NOT_FOUND` from a cwd under the OS temp dir) — exactly the
 * scenario a packaged app's `userData` cwd would be. `apps/website`'s own
 * `serve-command.integration.test.ts` already resolves the loader this same way, for this same
 * reason (see its `TSX_LOADER` constant's own comment).
 *
 * Pure — no `spawn()` call — so mode selection is directly assertable without a real checkout or a
 * real child process.
 *
 * @param input.cliArgs the CLI's own argv, e.g. `["serve", siteDir, "--port", "3601"]`.
 * @complexity O(1).
 */
function buildCliSpawnPlan(input) {
  const cliMode = input.cliMode ?? "compiled";
  if (cliMode === "source") {
    return { command: process.execPath, args: ["--import", require.resolve("tsx"), resolveDevCliEntry(input.repoRoot), ...input.cliArgs] };
  }
  return { command: process.execPath, args: [resolveCliEntry(input.repoRoot), ...input.cliArgs] };
}

/**
 * The part of the child environment every `tovu` subcommand needs — {@link buildServeEnv} layers
 * `serve`-only concerns (daemon token, admin dist) on top, and `tovu init` uses this bare form.
 * Split out so a one-shot `init` does not mint a daemon token it has no daemon for.
 *
 * `TOVU_SITE_DIR` is set here, not only in `buildServeEnv`, because the crash it works around is
 * NOT `serve`-specific: `cli/main.ts`'s `createProgram()` statically imports every subcommand
 * module up front (`program.ts` imports both `init.js` and `serve.js` unconditionally), and
 * `serve.js`'s own top-level `import { createApp } from ".../app.js"` means `app.ts`'s
 * MODULE-LOAD-TIME `export const app = createApp();` fires for ANY `tovu` invocation — `init`
 * included — not just when `serve`'s action handler actually runs. Confirmed live, 2026-09-05: `tovu
 * init` run with this shell's own `buildCliEnv` (no `TOVU_SITE_DIR`) from a cwd with no
 * `sites/tovu-com` crashed the same way `serve` did — same stack (`assistant-byok.ts`'s
 * `resolveToolAttemptAuditSink` → `defaultContentDbPath` → `siteDir()` → `resolveSiteRoot()`'s
 * cwd-relative fallback), before `runInitCommand` ever got a chance to run. Setting it here instead
 * of only in `buildServeEnv` is what keeps "Open Site…"/"Open Recent" onto an EMPTY folder — which
 * calls `initSiteDir`, `buildCliEnv`'s own caller, never `buildServeEnv` — from hitting the same
 * uncaught crash `buildServeEnv`'s own doc already named for `serve`. See that doc for the full
 * trace and why the fix has to live in the child's own env rather than in `serve.ts`'s body.
 *
 * @param siteDir the site dir the child will operate on (`init`'s target dir, or `serve`'s), set
 *   into `TOVU_SITE_DIR` unless the operator already pinned one. Optional so a caller with no
 *   specific site in mind (none exists today) still gets a valid env.
 * @complexity O(n) in the number of inherited environment variables.
 */
function buildCliEnv(baseEnv, siteDir) {
  const env = { ...(baseEnv ?? process.env) };

  env.ELECTRON_RUN_AS_NODE = "1";

  if (!env.TOVU_SITE_DIR && siteDir) {
    env.TOVU_SITE_DIR = siteDir;
  }

  delete env.PORT;
  delete env.TOVU_CONTENT_DB;
  delete env.TOVU_DB;

  return env;
}

/**
 * Build the child's environment for `tovu serve`.
 *
 * Three deliberate decisions, each of which was a real defect somewhere before it was a line here:
 *
 * - **`ELECTRON_RUN_AS_NODE` is SET, not deleted.** The child command is `process.execPath` — the
 *   Electron binary — run as Node, so this variable is what makes it a Node process at all. Tovu-
 *   Runner deletes it instead, because Runner hunts down a *system* Node (`resolveNodeBinary()`,
 *   ~90 lines probing Homebrew/Volta/nvm/fnm/asdf/n) on the belief that Tovu's `better-sqlite3` is
 *   an ABI-locked node-gyp build. That is no longer true: `better-sqlite3` 13 is N-API with
 *   `prebuilds/`, and it, `argon2` and `sharp` all load unmodified under Electron 43 (measured
 *   2026-09-05, incl. a real SQLite roundtrip). Running the child on Electron's own Node is what
 *   lets this shell drop the probe entirely and stop depending on a Node install it does not ship.
 *   `daemon-supervisor.ts` spawns the agent daemon with `process.execPath` too and inherits this
 *   variable through `{...process.env}`, so the daemon comes up the same way.
 *
 * - **`TOVU_AGENT_DAEMON_TOKEN` is minted here.** `apps/website/src/index.ts` calls
 *   `ensureAgentDaemonToken()` as the first statement of `main()`; `cli/commands/serve.ts` does
 *   NOT (verified — no `cli/` file references it). `daemon-auth.ts` is fail-closed by design: an
 *   unset token makes the daemon answer **503**, so without this line the assistant is dead in
 *   own-server mode with no error anywhere that names the cause. An operator-set value wins, since
 *   someone who exported a token to reach the daemon from outside must not have it replaced.
 *
 * - **`TOVU_ADMIN_DIST` is set when the build exists.** `app.ts`'s default resolves six levels up
 *   from `server/runtime/composition/`, which lands on the repo root from `src/` but *overshoots
 *   it* from `dist/` — and own-server mode runs the compiled `dist/` CLI, so `/admin` answers 503
 *   without this. Tovu's own documented override, set from outside, so `apps/website/` needs no
 *   change; the underlying off-by-one is reported separately rather than fixed from here.
 *
 * - **`TOVU_SITE_DIR` is set unless the operator already pinned one.** Confirmed live, 2026-09-05:
 *   `apps/website/src/server/runtime/composition/app.ts` has a MODULE-LOAD-TIME side effect —
 *   `export const app = createApp();`, evaluated the instant `cli/main.ts`'s static import chain
 *   reaches that file, before `cli/commands/serve.ts`'s own `runServeCommand()` body ever runs — and
 *   that default `createApp()` call composes `assistant-byok.ts`'s audit sink unconditionally
 *   (`resolveToolAttemptAuditSink` → `defaultContentDbPath` → `siteDir()` → `resolveSiteRoot()`),
 *   which falls back to `<cwd>/sites/tovu-com` whenever `TOVU_SITE_DIR` is unset. Own-server mode's
 *   cwd is whatever launched Electron, not the repo root, so that fallback directory does not exist
 *   and the child crashed at import time with "Cannot open database because the directory does not
 *   exist" — before printing a boot line, before `runServeCommand` gets a chance to do anything.
 *   The actual fix lives in {@link buildCliEnv} (this function's own base), not here, because the
 *   same crash is reachable through `init` too — see that function's own doc. This is a real,
 *   pre-existing "systemic gap" in `apps/website` itself (two of its own certified integration tests
 *   — the foreign-cwd `CR-R04/CR-R01` test and the `BR-07`/`BR-04` test — already fail at HEAD for
 *   exactly this reason, confirmed independent of any change made here), reported rather than fixed
 *   structurally: setting it in the child's own env only helps `apps/desktop`'s OWN spawned
 *   children, since it lives in the env this shell controls, not in the CLI's own spawn path those
 *   two tests exercise directly.
 *
 * `PORT`, `TOVU_CONTENT_DB` and `TOVU_DB` are dropped so a variable exported in the developer's
 * shell cannot silently repoint the desktop app's database or port — this shell's `--port` and
 * `<dir>` are the only authority over those.
 *
 * @param input.repoRoot repo root, used to locate `apps/admin/dist`.
 * @param input.siteDir the site dir this server will boot — threaded into `TOVU_SITE_DIR` via
 *   {@link buildCliEnv} so every code path in the child that resolves its own site independently of
 *   the CLI's `<dir>` argument still agrees with it.
 * @param input.baseEnv environment to layer onto (defaults to `process.env`).
 * @complexity O(n) in the number of inherited environment variables.
 */
function buildServeEnv(input) {
  const repoRoot = input.repoRoot;
  const env = buildCliEnv(input.baseEnv, input.siteDir);

  if (!env.TOVU_AGENT_DAEMON_TOKEN) {
    env.TOVU_AGENT_DAEMON_TOKEN = randomBytes(32).toString("hex");
  }

  const adminDist = path.join(repoRoot, "apps", "admin", "dist");
  if (!env.TOVU_ADMIN_DIST && fs.existsSync(adminDist)) {
    env.TOVU_ADMIN_DIST = adminDist;
  }

  return env;
}

/**
 * Ask the OS for a free loopback port by binding to `:0` and releasing it.
 *
 * Inherently a hint rather than a reservation — the port is free when it is reported and could be
 * taken before `tovu serve` binds it. That race is why the caller still surfaces Tovu's own
 * `PORT_IN_USE` line: this narrows the window, `serve.ts` closes it.
 *
 * @complexity O(1); one bind/close round trip.
 */
function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Terminate a spawned `tovu serve` and everything it spawned, then resolve once it is really gone.
 *
 * SIGTERM goes to the child itself, because `serve.ts` handles it with a real graceful drain
 * (BR-07: stop accepting, finish in-flight, `shutdownAssistantDaemon()`, close the sqlite handle) —
 * that path also reaps the agent daemon, so the polite signal is the *complete* one. SIGKILL is the
 * escalation, and it goes to the process **group** (`-pid`, which the `detached: true` spawn makes
 * available): a `tovu serve` wedged badly enough to ignore SIGTERM has not run its own shutdown, so
 * its daemon child is exactly what would be left behind.
 *
 * @complexity O(1); bounded by `graceMs`.
 */
function stopChild(child, graceMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already reaped between the timer firing and this call — nothing to kill.
      }
      resolve();
    }, graceMs);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

/** Compose the most useful failure message available: Tovu's own error line, else the raw tail. */
function describeBootFailure(output, fallback) {
  const cliError = parseCliErrorLine(output);
  if (cliError !== null) return `tovu serve failed: ${cliError.code}: ${cliError.message}`;
  const tail = output.trim().split("\n").slice(-5).join("\n");
  return tail.length > 0 ? `${fallback}\n${tail}` : fallback;
}

/**
 * Spawn `tovu serve <siteDir> --port <port>` and resolve once it reports the port it bound.
 *
 * Resolves to a handle whose `stop()` is the only supported way to shut the server down. Rejects —
 * having already killed the child — if the boot line does not arrive before `readyTimeoutMs`, or if
 * the child exits first, in which case Tovu's own `tovu: <CODE>: <message>` line is reported.
 *
 * @param input.repoRoot Tovu repo root; `bin.tovu` and `apps/admin/dist` are resolved from it.
 * @param input.siteDir the site directory to serve — owns `content.db`, `uploads/` and `themes/`.
 * @param input.port port to bind; allocated from the OS when omitted.
 * @param input.spawnFn injectable `child_process.spawn` (test seam).
 * @param input.readyTimeoutMs boot-line deadline; defaults to 60s.
 * @param input.stopGraceMs SIGTERM-to-SIGKILL window; defaults to 5s.
 * @param input.mirror where the child's output is echoed; defaults to this process's own streams.
 * @param input.cliMode `"source"` or `"compiled"` — see {@link buildCliSpawnPlan}; defaults to
 *   `"compiled"` when omitted (unchanged prior behavior for any existing caller).
 * @returns `{ port, pid, origin, adminUrl, workspaceId, schemaVersion, stop() }`
 * @throws {Error} when the CLI is unbuilt/missing, the boot line times out, or the child exits early.
 * @complexity O(1) plus `bootSiteDir`'s own cost inside the child.
 */
async function startTovuServer(input) {
  const spawnFn = input.spawnFn ?? nodeSpawn;
  const readyTimeoutMs = input.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const stopGraceMs = input.stopGraceMs ?? DEFAULT_STOP_GRACE_MS;
  const port = input.port ?? (await allocatePort());
  const plan = buildCliSpawnPlan({
    repoRoot: input.repoRoot,
    cliMode: input.cliMode,
    cliArgs: ["serve", input.siteDir, "--port", String(port)],
  });

  const child = spawnFn(
    plan.command,
    plan.args,
    {
      env: buildServeEnv({ repoRoot: input.repoRoot, siteDir: input.siteDir, baseEnv: input.baseEnv }),
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so `stopChild`'s SIGKILL escalation can reap the agent daemon
      // `tovu serve` spawns rather than just the immediate child. Same reason
      // `development/scripts/dev.mjs` and `daemon-supervisor.ts` both detach.
      detached: true,
    },
  );

  return await new Promise((resolve, reject) => {
    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      finish(() => reject(new Error(describeBootFailure(output, `tovu serve did not report a port within ${readyTimeoutMs}ms.`))));
    }, readyTimeoutMs);

    /** Single-settle guard: whichever of ready / timeout / exit happens first owns the outcome. */
    function finish(settleWith) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settleWith();
    }

    function readStream(stream, mirror) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        output += chunk;
        mirror.write(chunk);
        const boot = parseBootLine(output);
        if (boot === null) return;
        const origin = `http://127.0.0.1:${boot.port}`;
        finish(() =>
          resolve({
            port: boot.port,
            pid: child.pid,
            origin,
            adminUrl: `${origin}/admin/`,
            workspaceId: boot.workspaceId,
            schemaVersion: boot.schemaVersion,
            stop: () => stopChild(child, stopGraceMs),
          }),
        );
      });
    }

    const mirror = input.mirror ?? { stdout: process.stdout, stderr: process.stderr };
    readStream(child.stdout, mirror.stdout);
    readStream(child.stderr, mirror.stderr);

    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => {
      finish(() => reject(new Error(describeBootFailure(output, `tovu serve exited (code ${code ?? signal ?? "none"}) before reporting a port.`))));
    });
  }).catch(async (error) => {
    await stopChild(child, stopGraceMs);
    throw error;
  });
}

module.exports = {
  parseBootLine,
  buildCliEnv,
  parseCliErrorLine,
  resolveCliEntry,
  resolveDevCliEntry,
  buildCliSpawnPlan,
  buildServeEnv,
  allocatePort,
  startTovuServer,
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_STOP_GRACE_MS,
};
