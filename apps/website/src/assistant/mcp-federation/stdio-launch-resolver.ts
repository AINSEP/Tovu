import fs from "node:fs";
import path from "node:path";

import type { McpStdioLaunchSpec } from "./ports.js";

/**
 * @file Desktop-only rewriting of stdio MCP launch specs so `npx` / `npm` / `node` (and other bare
 * commands such as `uvx`/`docker`) resolve to something real inside a packaged Electron app, which
 * ships no system `node` binary and whose Dock-launched PATH is `/usr/bin:/bin:/usr/sbin:/sbin`.
 *
 * Everything here is pure: no `spawn`, no logging, `fs` reached only through the injected
 * `isExecutable`/`exists` seams (real `fs` by default). The impurity — writing the toolchain
 * shims themselves, choosing the plan's env vars — is `apps/desktop/src/node-toolchain.ts`'s job,
 * not this file's. This module only answers "given this spec and this environment, what do we
 * actually spawn, and with what extra env".
 *
 * Non-desktop deployments never set either env var {@link stdioLaunchResolverFromEnv} reads, so
 * every caller keeps getting {@link IDENTITY_STDIO_LAUNCH_RESOLVER} — spawn args and child env
 * byte-identical to before this module existed.
 */

/**
 * The three literal names both sides of the desktop <-> website contract agree on by
 * construction, not by import — desktop stays import-free of `apps/website`, the same rule
 * `tovu-server.ts:414-416` follows for its own literals. The other side is
 * `apps/desktop/src/node-toolchain.ts`, which must create `TOVU_NODE_TOOLCHAIN_DIR` with exactly
 * these three children: a `bin/` holding the shims, an `npm-cache/`, and an `npm-prefix/`.
 */
export const NODE_TOOLCHAIN_LAYOUT = {
  bin: "bin",
  npmCache: "npm-cache",
  npmPrefix: "npm-prefix",
} as const;

/** Thrown instead of spawning when a stdio command cannot be resolved to anything executable —
 * neither rewritten to the bundled Node toolchain, nor found on the child's search path, nor (for
 * an already-absolute command) present on disk. The message is written for a person reading a
 * connection-failed notice, not a stack trace, per §2 of the desktop-npx plan. */
export class McpLaunchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpLaunchUnavailableError";
  }
}

/**
 * What {@link McpStdioLaunchResolver.resolve} hands back: the spec {@link McpStdioLaunchSpec}
 * ready to `spawn`, plus `launchEnv` — the resolver's own additions, layered as
 * `inherited < launchEnv < specEnv` by `buildMcpChildEnv`'s caller (a later slice; not built here).
 *
 * `env` is the connection's own {@link McpStdioLaunchSpec.env}, passed through unchanged — this
 * resolver never edits it, only adds `launchEnv` alongside it.
 *
 * `warning` is set only by {@link stdioLaunchResolverFromEnv} falling back to identity because the
 * bundled npm root looks wrong; it is returned rather than logged because this whole module stays
 * pure, and logging is the caller's job.
 */
export interface ResolvedStdioLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env: Readonly<Record<string, string>>;
  readonly launchEnv: Readonly<Record<string, string>>;
  readonly warning?: string;
}

/** The desktop-only launch-rewriting port. Constructed by {@link createBundledNodeLaunchResolver}
 * or handed the identity behaviour by {@link IDENTITY_STDIO_LAUNCH_RESOLVER}; selected between the
 * two by {@link stdioLaunchResolverFromEnv}. */
export interface McpStdioLaunchResolver {
  resolve(spec: McpStdioLaunchSpec): ResolvedStdioLaunch;
}

/** Every non-desktop deployment's resolver: the spec unchanged, no extra env. This is what makes
 * the desktop rewrite opt-in by construction rather than by a runtime check scattered through the
 * federation layer — nothing downstream can tell this resolver apart from "no resolver at all". */
export const IDENTITY_STDIO_LAUNCH_RESOLVER: McpStdioLaunchResolver = {
  resolve(spec: McpStdioLaunchSpec): ResolvedStdioLaunch {
    return { command: spec.command, args: spec.args, cwd: spec.cwd, env: spec.env, launchEnv: {} };
  },
};

/** The bare command names {@link createBundledNodeLaunchResolver} rewrites to the bundled Node
 * toolchain, and the win32 spelling each is also matched under (per plan §2's table). */
type NodeToolchainCommand = "npx" | "npm" | "node";

/** @complexity O(1). */
function matchNodeToolchainCommand(command: string, platform: NodeJS.Platform): NodeToolchainCommand | null {
  const isWin32 = platform === "win32";
  if (command === "npx" || (isWin32 && command === "npx.cmd")) return "npx";
  if (command === "npm" || (isWin32 && command === "npm.cmd")) return "npm";
  if (command === "node" || (isWin32 && command === "node.exe")) return "node";
  return null;
}

/** The exact three human messages from plan §2, keyed off the command's own basename (stripped of
 * a win32 `.cmd`/`.exe` suffix) so the same three read right whether the caller passed `uvx` or
 * `uvx.cmd`, a bare name or an absolute path ending in one. @complexity O(1). */
function buildLaunchUnavailableMessage(command: string, searchedDirs: readonly string[]): string {
  const stripped = command.replace(/\.(cmd|exe)$/i, "");
  const name = stripped.split(/[\\/]/).pop() ?? stripped;
  if (name === "uvx" || name === "uv") {
    return (
      'This server needs "uvx" (from uv), which isn\'t installed on this computer. Tovu includes ' +
      "Node.js (node, npm, npx) but not uv. Install uv from https://docs.astral.sh/uv/ and restart Tovu."
    );
  }
  if (name === "docker") {
    return (
      'This server needs "docker", which isn\'t installed or isn\'t on this computer\'s standard ' +
      "paths. Install Docker Desktop, start it, then restart Tovu."
    );
  }
  return `This server's command "${command}" wasn't found on this computer. Tovu searched: ${searchedDirs.join(", ")}.`;
}

/**
 * The child's search path, in the plan §2 order: the toolchain's own `bin/` first (so the shims
 * always win), then the parent's PATH, then — darwin only — the well-known dirs a Homebrew or
 * cargo/uv install lands in, which a Dock launch's minimal PATH never includes. Well-known dirs are
 * APPENDED, so anything already on the parent PATH still wins, and `$HOME`-rooted ones are skipped
 * outright when `parentEnv.HOME` is unset rather than joined against `"undefined"`.
 *
 * @complexity O(n) in the parent PATH's entry count.
 */
function buildSearchDirs(binDir: string, parentEnv: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const delimiter = platform === "win32" ? ";" : ":";
  const parentDirs = (parentEnv.PATH ?? "").split(delimiter).filter((entry) => entry.length > 0);
  const wellKnown: string[] = [];
  if (platform === "darwin") {
    wellKnown.push("/opt/homebrew/bin", "/usr/local/bin");
    const home = parentEnv.HOME;
    if (home) wellKnown.push(`${home}/.local/bin`, `${home}/.cargo/bin`);
  }
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const dir of [binDir, ...parentDirs, ...wellKnown]) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    deduped.push(dir);
  }
  return deduped;
}

/** The 8 `npm_config_*` variables from plan §3: a cache and prefix confined to the toolchain
 * directory (never `~/.npm`, never a global `/usr/local`), and quiet, fast-failing network
 * behaviour so a cold desktop launch neither prints noise nor outlasts the connect timeout.
 * @complexity O(1). */
function buildNpmConfigEnv(toolchainDir: string, pathModule: path.PlatformPath): Record<string, string> {
  return {
    npm_config_cache: pathModule.join(toolchainDir, NODE_TOOLCHAIN_LAYOUT.npmCache),
    npm_config_prefix: pathModule.join(toolchainDir, NODE_TOOLCHAIN_LAYOUT.npmPrefix),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    npm_config_fetch_retries: "1",
    npm_config_fetch_retry_mintimeout: "2000",
    npm_config_fetch_retry_maxtimeout: "5000",
  };
}

/** Default `isExecutable`: a real filesystem check, X_OK bit, exceptions swallowed to `false` —
 * "can't tell" and "not executable" get the same answer, since both mean "don't spawn this".
 * @complexity O(1). */
function defaultIsExecutable(candidatePath: string): boolean {
  try {
    fs.accessSync(candidatePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Searches `searchDirs` in order for an executable file named `command`. On win32 an
 * extensionless name is also tried as `<name>.exe`, the one suffix `spawn` itself adds there
 * without a shell — so `uvx`/`docker` resolve to `uvx.exe`/`docker.exe` as they did before this
 * resolver existed. @complexity O(n) in `searchDirs.length`. */
function findOnSearchDirs(
  command: string,
  searchDirs: readonly string[],
  pathModule: path.PlatformPath,
  isExecutable: (candidatePath: string) => boolean,
): string | null {
  const names = pathModule === path.win32 && pathModule.extname(command) === "" ? [command, `${command}.exe`] : [command];
  for (const dir of searchDirs) {
    for (const name of names) {
      const candidate = pathModule.join(dir, name);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

/** Whether `command` names a path (absolute, or relative with a separator such as `./bin/server`)
 * rather than a bare name to search for — the same split `spawn`/`execvp` makes. @complexity O(n)
 * in the command's length. */
function isPathCommand(command: string, pathModule: path.PlatformPath): boolean {
  return pathModule.isAbsolute(command) || command.includes("/") || (pathModule === path.win32 && command.includes("\\"));
}

/** {@link createBundledNodeLaunchResolver}'s config. Only `toolchainDir` and `npmRoot` are ever
 * passed in production; the rest are test seams that default to the real process. */
export interface BundledNodeLaunchResolverConfig {
  /** `TOVU_NODE_TOOLCHAIN_DIR`: holds `bin/` (shims), `npm-cache/`, `npm-prefix/`. */
  readonly toolchainDir: string;
  /** `TOVU_BUNDLED_NPM_ROOT`: the npm package root; `<npmRoot>/bin/npx-cli.js` must exist (checked
   * by {@link stdioLaunchResolverFromEnv} before this is constructed, not here). */
  readonly npmRoot: string;
  readonly execPath?: string;
  readonly platform?: NodeJS.Platform;
  readonly parentEnv?: NodeJS.ProcessEnv;
  readonly isExecutable?: (candidatePath: string) => boolean;
}

/**
 * The desktop resolver: rewrites `npx`/`npm`/`node` to run on Electron's own Node via the bundled
 * npm package, resolves any other bare command (`uvx`, `docker`, …) against a PATH widened with
 * the toolchain's shim `bin/` and (darwin) a few well-known install dirs, leaves a path command
 * (absolute, or relative to `spec.cwd`)'s `command`/`args` unchanged, and throws {@link McpLaunchUnavailableError}
 * before any spawn when nothing resolves — see plan §2's table for the full case list.
 *
 * `ELECTRON_RUN_AS_NODE` is added to `launchEnv` only for the three rewritten commands, i.e. only
 * when `command` becomes `execPath` — never for a third-party binary found on PATH or given as an
 * absolute path, which must run as themselves, not as Electron-running-as-Node.
 *
 * @complexity O(1) to construct; `resolve` is O(n) in the search path's length.
 */
export function createBundledNodeLaunchResolver({
  toolchainDir,
  npmRoot,
  execPath = process.execPath,
  platform = process.platform,
  parentEnv = process.env,
  isExecutable = defaultIsExecutable,
}: BundledNodeLaunchResolverConfig): McpStdioLaunchResolver {
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const binDir = pathModule.join(toolchainDir, NODE_TOOLCHAIN_LAYOUT.bin);
  const searchDirs = buildSearchDirs(binDir, parentEnv, platform);
  const pathValue = searchDirs.join(platform === "win32" ? ";" : ":");
  const npmConfigEnv = buildNpmConfigEnv(toolchainDir, pathModule);
  const nodeToolchainLaunchEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: "1", PATH: pathValue, ...npmConfigEnv };
  const otherLaunchEnv: Record<string, string> = { PATH: pathValue, ...npmConfigEnv };

  return {
    resolve(spec: McpStdioLaunchSpec): ResolvedStdioLaunch {
      const nodeToolchainCommand = matchNodeToolchainCommand(spec.command, platform);
      if (nodeToolchainCommand !== null) {
        const cli = nodeToolchainCommand === "npx" ? "npx-cli.js" : nodeToolchainCommand === "npm" ? "npm-cli.js" : null;
        const args = cli === null ? [...spec.args] : [pathModule.join(npmRoot, "bin", cli), ...spec.args];
        return { command: execPath, args, cwd: spec.cwd, env: spec.env, launchEnv: nodeToolchainLaunchEnv };
      }

      if (isPathCommand(spec.command, pathModule)) {
        // A relative path runs against the child's own cwd, so that is where it has to exist.
        if (!isExecutable(pathModule.resolve(spec.cwd ?? process.cwd(), spec.command))) {
          throw new McpLaunchUnavailableError(buildLaunchUnavailableMessage(spec.command, searchDirs));
        }
        return { command: spec.command, args: [...spec.args], cwd: spec.cwd, env: spec.env, launchEnv: otherLaunchEnv };
      }

      const found = findOnSearchDirs(spec.command, searchDirs, pathModule, isExecutable);
      if (found === null) {
        throw new McpLaunchUnavailableError(buildLaunchUnavailableMessage(spec.command, searchDirs));
      }
      return { command: found, args: [...spec.args], cwd: spec.cwd, env: spec.env, launchEnv: otherLaunchEnv };
    },
  };
}

/** {@link stdioLaunchResolverFromEnv}'s options; `exists` is a test seam, defaulting to a real
 * filesystem check. */
export interface StdioLaunchResolverFromEnvOptions {
  readonly exists?: (candidatePath: string) => boolean;
}

/**
 * Picks the resolver from an environment, per plan §2's env contract: with either
 * `TOVU_NODE_TOOLCHAIN_DIR` or `TOVU_BUNDLED_NPM_ROOT` unset — every non-desktop deployment —
 * {@link IDENTITY_STDIO_LAUNCH_RESOLVER}. With both set but `<npmRoot>/bin/npx-cli.js` missing
 * (a desktop build gone wrong), also identity, but with a `warning` string threaded through every
 * resolution so a caller can log it once rather than this pure function logging on its own.
 * Otherwise, {@link createBundledNodeLaunchResolver}.
 *
 * `env` doubles as the resolver's `parentEnv` (its PATH/HOME feed {@link buildSearchDirs}) — the
 * same object `attachFederatedMcpTools` already has as `params.env ?? process.env`, so this
 * function needs no second environment threaded in separately.
 *
 * @complexity O(1) beyond the `createBundledNodeLaunchResolver` call it may make.
 */
export function stdioLaunchResolverFromEnv(
  env: NodeJS.ProcessEnv,
  { exists = fs.existsSync }: StdioLaunchResolverFromEnvOptions = {},
): McpStdioLaunchResolver {
  const toolchainDir = env.TOVU_NODE_TOOLCHAIN_DIR;
  const npmRoot = env.TOVU_BUNDLED_NPM_ROOT;
  if (!toolchainDir || !npmRoot) return IDENTITY_STDIO_LAUNCH_RESOLVER;

  const npxCliPath = path.join(npmRoot, "bin", "npx-cli.js");
  if (!exists(npxCliPath)) {
    const warning =
      `mcp-federation: TOVU_BUNDLED_NPM_ROOT is set (${npmRoot}) but ${npxCliPath} is missing; ` +
      "falling back to identity stdio launch resolution instead of the bundled Node toolchain.";
    return {
      resolve(spec: McpStdioLaunchSpec): ResolvedStdioLaunch {
        return { ...IDENTITY_STDIO_LAUNCH_RESOLVER.resolve(spec), warning };
      },
    };
  }

  return createBundledNodeLaunchResolver({ toolchainDir, npmRoot, parentEnv: env });
}
