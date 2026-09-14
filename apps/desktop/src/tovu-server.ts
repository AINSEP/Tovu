/**
 * @file Own-server mode: spawn Tovu's own `tovu serve <dir>` CLI, learn the port it bound, and
 * supervise it for the life of the window.
 *
 * Deliberately free of any `electron` import. Everything here is plain Node, so every function is
 * directly assertable from `node --test` without an Electron runtime — `main.ts` keeps the parts
 * that genuinely need `app`/`BrowserWindow` and nothing else. `spawnFn` is injectable for the same
 * reason: the supervision contract (ready, boot timeout, premature exit, graceful stop) is testable
 * against a fake child, so no test ever has to boot a real site.
 *
 * The seam is Tovu's, not ours. `apps/website/src/cli/commands/serve.ts` boots the site dir end to
 * end and prints exactly one startup line (api.spec.md §5); `cli/errors.ts` prints exactly one
 * `tovu: <CODE>: <message>` line on failure. This module reads both and nothing else, so no file
 * under `apps/website/` has to change for the desktop shell to exist.
 */
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn as nodeSpawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { SpawnOptions } from "node:child_process";
import type { Readable, Writable } from "node:stream";

// {@link buildCliSpawnPlan} needs `require.resolve("tsx")`'s CommonJS resolution, which walks up
// from THIS file to `apps/desktop/node_modules/tsx`. `import.meta.resolve` would pick the package's
// `import` condition instead of the `require` one and so could name a different entry file.
const require = createRequire(import.meta.url);

/** `apps/website/src/cli/commands/serve.ts`'s documented startup line (api.spec.md §5). */
const BOOT_LINE = /^tovu serve: dir=(.+) port=(\d+) schemaVersion=(\d+) workspaceId=(\S+)$/m;

/**
 * The optional boot-token line, printed by `tovu serve --emit-boot-token` immediately BEFORE the
 * startup line above (see that file for why the order matters). A single-use, in-memory,
 * loopback-only token this parent can exchange once for an admin session.
 *
 * Deliberately a second pattern rather than a fifth capture group on {@link BOOT_LINE}: that line
 * is a documented contract other readers parse, and it is printed unconditionally, so widening it
 * would put a secret in front of every consumer including an operator's own terminal.
 */
const BOOT_TOKEN_LINE = /^tovu serve: bootToken=(\S+)$/m;

/** Every boot-token line, whole. Used to keep the secret out of anything this module echoes or
 *  puts in an error — see {@link redactBootToken}. */
const BOOT_TOKEN_LINE_GLOBAL = /^tovu serve: bootToken=\S*\r?\n?/gm;

/**
 * `text` with any boot-token line removed.
 *
 * The token must never reach the parent's own stdout, a log file, or an `Error` message: the E2E
 * suite captures child output, and `describeBootFailure` puts accumulated output straight into a
 * thrown error. Stripped at every egress rather than trusting each call site to remember.
 *
 * @complexity O(n) in the text length.
 */
function redactBootToken(text: string): string {
  return text.replace(BOOT_TOKEN_LINE_GLOBAL, "");
}

/**
 * The boot token from accumulated child output, or `null` when none was printed.
 * @complexity O(n) in the text length.
 */
function parseBootToken(text: string): string | null {
  const match = BOOT_TOKEN_LINE.exec(text);
  return match === null ? null : match[1]!;
}

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

/** The fields {@link BOOT_LINE} captures, parsed. */
interface BootLineFields {
  dir: string;
  port: number;
  schemaVersion: number;
  workspaceId: string;
}

/**
 * Parse the startup line out of accumulated stdout.
 *
 * @param text stdout captured so far; partial output is fine, the line is matched with `^…$`.
 * @returns the reported fields, or `null` if the line has not been printed yet.
 * @complexity O(n) in `text` length per call.
 */
function parseBootLine(text: string): BootLineFields | null {
  const match = BOOT_LINE.exec(text);
  if (match === null) return null;
  return { dir: match[1]!, port: Number(match[2]!), schemaVersion: Number(match[3]!), workspaceId: match[4]! };
}

/** The fields {@link CLI_ERROR_LINE} captures, parsed. */
interface CliErrorFields {
  code: string;
  message: string;
}

/**
 * Parse Tovu's single CLI error line, so a failed boot reports Tovu's own diagnosis rather than a
 * bare exit code. `PORT_IN_USE`, `SITE_DIR_INVALID` and `SITE_CORRUPT` all arrive this way.
 *
 * @returns `{ code, message }`, or `null` when the child failed without printing one.
 * @complexity O(n) in `text` length per call.
 */
function parseCliErrorLine(text: string): CliErrorFields | null {
  const match = CLI_ERROR_LINE.exec(text);
  return match === null ? null : { code: match[1]!, message: match[2]! };
}

/** The one field this module reads out of the repo's own `package.json`. */
interface TovuPackageManifest {
  bin?: { tovu?: string };
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
function resolveCliEntry(repoRoot: string): string {
  const manifestPath = path.join(repoRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as TovuPackageManifest;
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
function resolveDevCliEntry(repoRoot: string): string {
  const entry = path.join(repoRoot, "apps", "website", "src", "cli", "main.ts");
  if (!fs.existsSync(entry)) {
    throw new Error(`Tovu's CLI source is missing: ${entry} does not exist.`);
  }
  return entry;
}

/** `buildCliSpawnPlan`'s two supported invocation modes. See that function's own doc. */
type CliMode = "source" | "compiled";

/** Input to {@link buildCliSpawnPlan}. */
interface CliSpawnPlanInput {
  repoRoot: string;
  cliMode?: CliMode;
  cliArgs: string[];
}

/** The `{ command, args }` {@link buildCliSpawnPlan} builds, ready for `spawn`. */
interface CliSpawnPlan {
  command: string;
  args: string[];
}

/**
 * Build the `{ command, args }` to spawn for one Tovu CLI invocation (`serve` or `init`), in either
 * of two modes:
 *
 * - `"source"` (the default own-server mode uses, via `main.ts`'s `TOVU_DESKTOP_CLI_MODE`) runs
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
function buildCliSpawnPlan(input: CliSpawnPlanInput): CliSpawnPlan {
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
function buildCliEnv(baseEnv: NodeJS.ProcessEnv | undefined, siteDir: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...(baseEnv ?? process.env) };

  env.ELECTRON_RUN_AS_NODE = "1";

  if (!env.TOVU_SITE_DIR && siteDir) {
    env.TOVU_SITE_DIR = siteDir;
  }

  delete env.PORT;
  delete env.TOVU_CONTENT_DB;
  delete env.TOVU_DB;

  return env;
}

/** The desktop shell's own owner account, seeded into a brand-new site — see {@link buildServeEnv}. */
interface DesktopCredential {
  username: string;
  password: string;
}

/** Input to {@link buildServeEnv}. */
interface BuildServeEnvInput {
  repoRoot: string;
  siteDir?: string;
  baseEnv?: NodeJS.ProcessEnv;
  desktopCredential?: DesktopCredential;
  adminDevProxyUrl?: string | null;
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
 * - **`TOVU_ADMIN_DIST` and `TOVU_SITE_CHAT_DIST` are set when their builds exist.** `app.ts`
 *   resolves BOTH from `import.meta.dirname` six levels up when unset (`:1316` and `:1340`), which
 *   lands on the repo root from `src/` but *overshoots it* from `dist/` — and own-server mode runs
 *   the compiled `dist/` CLI, so `/admin` and `/site-chat` both answer 503 without these. Tovu's
 *   own documented overrides, set from outside, so `apps/website/` needs no change; the underlying
 *   off-by-one is reported separately rather than fixed from here. `Dockerfile:170-171` sets the
 *   same PAIR for the same reason — this shell set only the admin half until 2026-09-11, which is
 *   why site-chat 503'd in every compiled-mode desktop run.
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
function buildServeEnv(input: BuildServeEnvInput): NodeJS.ProcessEnv {
  const repoRoot = input.repoRoot;
  const env = buildCliEnv(input.baseEnv, input.siteDir);

  if (!env.TOVU_AGENT_DAEMON_TOKEN) {
    env.TOVU_AGENT_DAEMON_TOKEN = randomBytes(32).toString("hex");
  }

  // Seeds the desktop shell's OWN owner account so `desktop-auth.ts` can log in and the operator
  // never meets a login form for a server this app started. Omitted entirely when the caller passes
  // no credential (every existing caller and every existing test), so the child's identity seeding
  // is byte-for-byte unchanged in that case.
  //
  // **Both variables are OVERWRITTEN, deliberately — an inherited value does NOT win here**, unlike
  // `TOVU_AGENT_DAEMON_TOKEN` above. Copying that rule to this pair was a bug, found by running it:
  // this machine has `TOVU_ADMIN_PASSWORD` exported in the ambient shell (a known trap in this
  // repo's own test tooling) and `TOVU_ADMIN_USER` unset, so honoring the inherited half seeded
  // `admin` with an unrelated password while the shell went on to log in as `tovu-desktop` — an
  // account that then never existed. The two are a PAIR and half of one operator's intent combined
  // with half of the shell's is guaranteed-broken rather than conservative.
  //
  // Overwriting costs the operator nothing they can otherwise have: `seedIdentity` seeds exactly
  // ONE owner per boot, the one its configured username names, so `admin` and `tovu-desktop` were
  // never both reachable from a single spawn. It is also a no-op on any site that has been booted
  // before, since seeding is idempotent. What it changes is a BRAND-NEW site opened through this
  // shell: its first owner is `tovu-desktop` rather than `admin`. That is the intended trade — the
  // operator arrives authenticated as a real owner and can create any further account from the
  // admin UI, instead of the site being seeded with a password the shell cannot know.
  if (input.desktopCredential) {
    env.TOVU_ADMIN_USER = input.desktopCredential.username;
    env.TOVU_ADMIN_PASSWORD = input.desktopCredential.password;
  }

  // **`TOVU_AGENT_CWD` is pinned to the site dir.** The agent daemon `tovu serve` spawns runs every
  // assistant turn in `process.env.TOVU_AGENT_CWD ?? process.cwd()`
  // (`apps/website/src/server/inbound/assistant/agent-daemon-server.ts`), and a macOS app launched
  // from Finder/dock has cwd `/`. `tovu serve` inherits that, the daemon inherits it from
  // `tovu serve`, so before this line every turn in the packaged app died before spawn with
  // `EROFS: read-only file system, open '/.mcp.jini-<runId>.json'` — the daemon writes a per-run
  // `.mcp.json` into the agent's cwd, and `/` is not writable. The run finished `failed` with
  // `code=null, signal=null` ~13ms after starting, which reaches the pane as an `end` frame carrying
  // no message, so the operator saw their own turn render and then nothing at all, three times over.
  // Measured live 2026-09-12: the running daemon's cwd was `/` (`lsof -a -p <pid> -d cwd`), and the
  // same packaged daemon binary re-launched from a writable cwd streamed a reply.
  //
  // The SITE dir rather than merely some writable dir, and that is the substantive choice here: it
  // is the active site's own tree (`content.db`, `uploads/`, `themes/`, `skills/`,
  // `agent-plugins/`), so "which site am I working on" is answered by the agent's own working
  // directory. `AssistantDock.tsx` already names this variable as the only thing that can really
  // move the agent — a browser directory picker yields a folder name and never a path — and says the
  // feature belongs to the Electron shell, which is this line.
  //
  // Set through the child's env rather than `spawn`'s own `cwd` option on purpose: several code
  // paths in the child resolve their site from `process.cwd()` when `TOVU_SITE_DIR` is absent (see
  // {@link buildCliEnv}), so moving the real cwd would change more than the agent's working
  // directory. It also keeps the server side free of any knowledge that a desktop shell exists —
  // this is a variable `agent-daemon-server.ts` already reads for its own reasons, not a new hook.
  // An operator-set value wins, same rule as `TOVU_AGENT_DAEMON_TOKEN` above.
  if (!env.TOVU_AGENT_CWD && input.siteDir) {
    env.TOVU_AGENT_CWD = input.siteDir;
  }

  const adminDist = path.join(repoRoot, "apps", "admin", "dist");
  if (!env.TOVU_ADMIN_DIST && fs.existsSync(adminDist)) {
    env.TOVU_ADMIN_DIST = adminDist;
  }

  const siteChatDist = path.join(repoRoot, "apps", "site-chat", "dist");
  if (!env.TOVU_SITE_CHAT_DIST && fs.existsSync(siteChatDist)) {
    env.TOVU_SITE_CHAT_DIST = siteChatDist;
  }

  // Set LAST and only when the caller resolved a live dev server (`admin-dev-proxy.ts` probes; a
  // packaged app yields no candidate at all). `admin-static.ts`'s precedence makes this override
  // `TOVU_ADMIN_DIST` above rather than sit beside it — the dev-proxy branch returns before the
  // static branch is reached — which is exactly the point: the built bundle is what goes stale.
  // Omitted by every caller that passes nothing, so the child env is unchanged for them.
  if (typeof input.adminDevProxyUrl === "string" && input.adminDevProxyUrl !== "") {
    env.TOVU_ADMIN_DEV_PROXY_URL = input.adminDevProxyUrl;
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
function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * The subset of Node's `ChildProcess` surface this module touches. Kept narrow, rather than
 * importing `ChildProcess` itself, so `spawnFn`'s test double (`fakeChild()` in the test file) only
 * has to implement the fields `startTovuServer` actually reads — a real `ChildProcess` satisfies
 * this structurally, so `nodeSpawn` needs no cast.
 */
interface SpawnedChild {
  pid: number | undefined;
  stdout: Readable | null;
  stderr: Readable | null;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
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
function stopChild(child: SpawnedChild, graceMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL"); // `!`: `stopChild` only runs on an already-spawned child, so it has a pid.
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
function describeBootFailure(output: string, fallback: string): string {
  const cliError = parseCliErrorLine(output);
  if (cliError !== null) return `tovu serve failed: ${cliError.code}: ${cliError.message}`;
  const tail = output.trim().split("\n").slice(-5).join("\n");
  return tail.length > 0 ? `${fallback}\n${tail}` : fallback;
}

/** One child exit, as {@link createExitSignal} replays it. */
interface ExitOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** What {@link createExitSignal} returns. */
interface ExitSignal {
  onExit(listener: (exit: ExitOutcome) => void): void;
}

/**
 * A one-shot, replayable exit signal for a spawned child.
 *
 * The gap this closes (D-06): the only `exit` listener {@link startTovuServer} had fed its
 * single-settle `finish()`, which is a NO-OP once the boot line has already resolved the promise.
 * So nothing in this process observed a child dying AFTER it came up — `main.ts`'s `openSites`
 * kept the dead handle, `buildSiteRecord` kept reporting `running`, and "Start site" handed the
 * corpse straight back instead of spawning a replacement.
 *
 * REPLAYING rather than just forwarding is the load-bearing part. A supervisor attaches its
 * listener after `startTovuServer` resolves, and a child is free to die inside that gap; a plain
 * `child.once("exit", listener)` registered then would never fire, and the entry would be wedged
 * "running" for the whole session — the very state this exists to prevent. Registering the capture
 * here, immediately after `spawn` and before any `await`, means there is no instant at which an
 * exit can go unrecorded.
 *
 * @returns `{ onExit }` — `onExit(listener)` calls `listener({code, signal})` when the child exits,
 *   or immediately if it already has. Listeners fire once each and are then dropped.
 * @complexity O(1) per registration; O(n) in registered listeners at exit time.
 */
function createExitSignal(child: SpawnedChild): ExitSignal {
  let exit: ExitOutcome | null = null;
  const waiting: Array<(exit: ExitOutcome) => void> = [];

  child.once("exit", (code, signal) => {
    exit = { code, signal };
    for (const listener of waiting.splice(0)) listener(exit);
  });

  return {
    onExit(listener) {
      if (exit !== null) {
        listener(exit);
        return;
      }
      waiting.push(listener);
    },
  };
}

/** Injectable `child_process.spawn` — the test seam. See {@link SpawnedChild}. */
type SpawnFn = (command: string, args: string[], options: SpawnOptions) => SpawnedChild;

/** Where a spawned child's output is echoed — defaults to this process's own streams. */
interface MirrorStreams {
  stdout: Writable;
  stderr: Writable;
}

/** Input to {@link startTovuServer}. */
interface StartTovuServerInput {
  repoRoot: string;
  siteDir: string;
  port?: number;
  spawnFn?: SpawnFn;
  readyTimeoutMs?: number;
  stopGraceMs?: number;
  mirror?: MirrorStreams;
  desktopCredential?: DesktopCredential;
  cliMode?: CliMode;
  adminDevProxyUrl?: string | null;
  baseEnv?: NodeJS.ProcessEnv;
  emitBootToken?: boolean;
}

/** What a resolved {@link startTovuServer} call hands back. */
interface TovuServerHandle {
  port: number;
  pid: number;
  origin: string;
  adminUrl: string;
  workspaceId: string;
  schemaVersion: number;
  bootToken: string | null;
  stop(): Promise<void>;
  onExit: ExitSignal["onExit"];
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
 * @param input.desktopCredential `{username, password}` seeding the shell's own owner account, so
 *   the admin comes up authenticated (see `desktop-auth.ts`). Omit to leave the child's identity
 *   seeding exactly as it was.
 * @param input.cliMode `"source"` or `"compiled"` — see {@link buildCliSpawnPlan}; defaults to
 *   `"compiled"` when omitted (unchanged prior behavior for any existing caller).
 * @param input.adminDevProxyUrl a live admin Vite dev-server origin, which makes this site serve
 *   `/admin/*` from current source instead of the built `apps/admin/dist`. Resolve it with
 *   `admin-dev-proxy.ts`'s `resolveAdminDevProxyUrl` — which probes, and yields nothing when
 *   packaged — rather than passing a bare URL, since an unreachable origin turns `/admin/` into a
 *   502 rather than falling back. Omit to serve the built bundle exactly as before.
 * @returns `{ port, pid, origin, adminUrl, workspaceId, schemaVersion, stop(), onExit(cb) }` —
 *   `onExit` is the post-ready liveness signal a supervisor needs; see {@link createExitSignal}.
 * @throws {Error} when the CLI is unbuilt/missing, the boot line times out, or the child exits early.
 * @complexity O(1) plus `bootSiteDir`'s own cost inside the child.
 */
async function startTovuServer(input: StartTovuServerInput): Promise<TovuServerHandle> {
  const spawnFn = input.spawnFn ?? nodeSpawn as SpawnFn;
  const readyTimeoutMs = input.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const stopGraceMs = input.stopGraceMs ?? DEFAULT_STOP_GRACE_MS;
  const port = input.port ?? (await allocatePort());
  const plan = buildCliSpawnPlan({
    repoRoot: input.repoRoot,
    cliMode: input.cliMode,
    cliArgs: [
      "serve",
      input.siteDir,
      "--port",
      String(port),
      // Opt-in per call. Omitted entirely by every existing caller and every existing test, so a
      // server booted without it mints nothing and its redemption route stays permanently closed.
      ...(input.emitBootToken === true ? ["--emit-boot-token"] : []),
    ],
  });

  const child = spawnFn(
    plan.command,
    plan.args,
    {
      env: buildServeEnv({ repoRoot: input.repoRoot, siteDir: input.siteDir, baseEnv: input.baseEnv, desktopCredential: input.desktopCredential, adminDevProxyUrl: input.adminDevProxyUrl }),
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so `stopChild`'s SIGKILL escalation can reap the agent daemon
      // `tovu serve` spawns rather than just the immediate child. Same reason
      // `development/scripts/dev.mjs` and `daemon-supervisor.ts` both detach.
      detached: true,
    },
  );

  const exitSignal = createExitSignal(child);

  return await new Promise<TovuServerHandle>((resolve, reject) => {
    let output = "";
    let settled = false;

    const timer = setTimeout(() => {
      finish(() => reject(new Error(describeBootFailure(redactBootToken(output), `tovu serve did not report a port within ${readyTimeoutMs}ms.`))));
    }, readyTimeoutMs);

    /** Single-settle guard: whichever of ready / timeout / exit happens first owns the outcome. */
    function finish(settleWith: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settleWith();
    }

    function readStream(stream: Readable, mirror: Writable): void {
      stream.setEncoding("utf8");
      // Mirroring is LINE-buffered rather than chunk-passthrough so a boot-token line can be
      // removed whole. A chunk boundary can fall inside that line, and a substring filter applied
      // per chunk would echo whichever half arrived first.
      let pending = "";
      stream.on("data", (chunk) => {
        output += chunk;
        pending += chunk;
        const lastNewline = pending.lastIndexOf("\n");
        if (lastNewline >= 0) {
          mirror.write(redactBootToken(pending.slice(0, lastNewline + 1)));
          pending = pending.slice(lastNewline + 1);
        }

        const boot = parseBootLine(output);
        if (boot === null) return;
        const origin = `http://127.0.0.1:${boot.port}`;
        finish(() =>
          resolve({
            port: boot.port,
            pid: child.pid!, // `!`: resolved from a boot line this child printed, so it spawned and has a pid.
            origin,
            adminUrl: `${origin}/admin/`,
            workspaceId: boot.workspaceId,
            schemaVersion: boot.schemaVersion,
            // Printed BEFORE the boot line, so by the time this resolves it is already in `output`
            // — no second wait and no timing window. `null` whenever `--emit-boot-token` was not
            // passed, which is every caller but the desktop shell.
            bootToken: parseBootToken(output),
            stop: () => stopChild(child, stopGraceMs),
            onExit: exitSignal.onExit,
          }),
        );
      });
    }

    const mirror = input.mirror ?? { stdout: process.stdout, stderr: process.stderr };
    readStream(child.stdout!, mirror.stdout);
    readStream(child.stderr!, mirror.stderr);

    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => {
      finish(() => reject(new Error(describeBootFailure(redactBootToken(output), `tovu serve exited (code ${code ?? signal ?? "none"}) before reporting a port.`))));
    });
  }).catch(async (error) => {
    await stopChild(child, stopGraceMs);
    throw error;
  });
}

export {
  parseBootLine,
  parseBootToken,
  redactBootToken,
  buildCliEnv,
  parseCliErrorLine,
  resolveCliEntry,
  resolveDevCliEntry,
  buildCliSpawnPlan,
  buildServeEnv,
  allocatePort,
  createExitSignal,
  startTovuServer,
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_STOP_GRACE_MS,
};
