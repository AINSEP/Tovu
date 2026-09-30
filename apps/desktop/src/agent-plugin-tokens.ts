/**
 * @file "+ Create website"'s optional "Connect services" step (2026-09-29): the same access-token
 * fields the admin's create form offers, delivered through Tovu's own CLI like everything else this
 * shell does to a site.
 *
 * - Which services are offered: `tovu agent-plugins token-sign-in --json` — the bundled Agent Plugins
 *   that declare token sign-in. Nothing here names a vendor.
 * - The tokens themselves go to `tovu init --agent-plugin-tokens-stdin` (`site-dir-store.ts`), which
 *   checks each before creating the site and seals them for its first boot. This file only reads
 *   back the one `agent-plugin-tokens: saved|failed <ids>` line that command prints.
 *
 * No token is ever put on argv, in env, in a log line, or in an error message.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import type { Readable } from "node:stream";

import { buildCliSpawnPlan, buildCliEnv, parseCliErrorLine } from "./tovu-server.ts";

/** One service the create form can offer a token field for — mirrors `contracts/project.ts`. */
interface TokenSignInPlugin {
  pluginId: string;
  displayName: string;
  helpUrl: string;
}

/** What `tovu init` reported for the tokens it was given — mirrors `contracts/project.ts`. */
interface CreatedAgentPluginTokens {
  status: "saved" | "failed";
  pluginIds: string[];
}

interface ListChildLike {
  stdout: Readable;
  stderr: Readable;
  once(event: "exit", listener: (code: number | null) => void): void;
  once(event: "error", listener: (error: Error) => void): void;
}

type ListSpawnFn = (command: string, args: string[], options: SpawnOptions) => ListChildLike;

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 4096;

/**
 * The create input's `agentPluginTokens`, trimmed, blanks dropped — `{}` when none. The renderer is
 * not trusted: anything that is not a small map of plugin ids to strings is refused, the same shape
 * `tovu init` re-checks.
 *
 * @throws {Error} a malformed map. The message names no token.
 * @complexity O(n) in the entry count (bounded).
 */
function cleanCreateTokens(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (!isSmallMap(raw) || !Object.entries(raw).every(([pluginId, value]) => isTokenEntry(pluginId, value))) {
    throw new Error("The access tokens for the new site were not in the expected shape. Nothing was created.");
  }
  const out: Record<string, string> = {};
  for (const [pluginId, value] of Object.entries(raw as Record<string, string>)) {
    if (value.trim() !== "") out[pluginId] = value.trim();
  }
  return out;
}

/** A plain object with at most {@link MAX_TOKENS} entries. */
function isSmallMap(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) && Object.keys(raw).length <= MAX_TOKENS;
}

/** A plugin id `tovu init` accepts, mapped to a string it accepts. */
function isTokenEntry(pluginId: string, value: unknown): boolean {
  return PLUGIN_ID_PATTERN.test(pluginId) && typeof value === "string" && value.length <= MAX_TOKEN_LENGTH;
}

/**
 * Tokens reach a site only through `tovu init`, which runs only for an EMPTY folder; adopting an
 * existing site would drop them silently, so that combination is refused.
 * @throws {Error} tokens were given and the picked folder already holds a site.
 */
function assertTokensCanReachFolder(tokens: Readonly<Record<string, string>>, folderWasEmpty: boolean): void {
  if (Object.keys(tokens).length > 0 && !folderWasEmpty) {
    throw new Error("That folder already holds a website, so the access tokens could not be added to it. Choose an empty folder, or leave the tokens empty and ask the site's assistant to connect the service.");
  }
}

/**
 * The `adoptSiteDir` options that hand `tokens` to `tovu init` and capture its output into `sink`,
 * or `{}` when there are none — so a create with no token runs exactly the command it always did.
 */
function initTokenOptions(
  tokens: Readonly<Record<string, string>>,
  sink: { output: string },
): { agentPluginTokens?: Readonly<Record<string, string>>; onInitOutput?: (output: string) => void } {
  if (Object.keys(tokens).length === 0) return {};
  return { agentPluginTokens: tokens, onInitOutput: (output) => void (sink.output = output) };
}

/** `record`, plus the token outcome `tovu init` printed when there was one. */
function withCreatedTokens<T extends object>(record: T, initOutput: string): T & { agentPluginTokens?: CreatedAgentPluginTokens } {
  const tokens = parseCreatedTokensLine(initOutput);
  return tokens === null ? record : { ...record, agentPluginTokens: tokens };
}

/**
 * `tovu init`'s `agent-plugin-tokens: saved|failed <ids>` line, or `null` when it printed none (no
 * tokens were given).
 * @complexity O(n) in the output length.
 */
function parseCreatedTokensLine(output: string): CreatedAgentPluginTokens | null {
  const match = /^agent-plugin-tokens: (saved|failed) ([a-z0-9,-]+)$/m.exec(output);
  if (!match) return null;
  return { status: match[1] as CreatedAgentPluginTokens["status"], pluginIds: match[2]!.split(",").filter(Boolean) };
}

/** Only well-formed entries survive: this list is rendered as links. */
function parsePluginList(stdout: string): TokenSignInPlugin[] {
  const line = stdout.split(/\r?\n/).reverse().find((candidate) => candidate.trim().startsWith("{"));
  const parsed = JSON.parse(line ?? "{}") as { plugins?: unknown };
  const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
  return plugins.flatMap((entry): TokenSignInPlugin[] => {
    const { pluginId, displayName, helpUrl } = (entry ?? {}) as Record<string, unknown>;
    if (typeof pluginId !== "string" || !PLUGIN_ID_PATTERN.test(pluginId) || typeof displayName !== "string" || typeof helpUrl !== "string") return [];
    return /^https:\/\//.test(helpUrl) ? [{ pluginId, displayName, helpUrl }] : [];
  });
}

/**
 * Runs `tovu agent-plugins token-sign-in --json`. The CLI's import chain needs a site dir in its env
 * even for a command that touches none (`site-dir-store.ts`'s `initSiteDir` doc), so it is given a
 * fresh empty temp dir, removed afterwards.
 *
 * @throws {Error} the CLI failed; the create form then simply offers no services.
 * @complexity One CLI spawn.
 */
async function listTokenSignInPlugins(input: {
  repoRoot: string;
  cliMode?: "source" | "compiled";
  baseEnv?: NodeJS.ProcessEnv;
  spawnFn?: ListSpawnFn;
}): Promise<TokenSignInPlugin[]> {
  const spawnFn = input.spawnFn ?? (nodeSpawn as ListSpawnFn);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-token-sign-in-"));
  try {
    const plan = buildCliSpawnPlan({ repoRoot: input.repoRoot, cliMode: input.cliMode, cliArgs: ["agent-plugins", "token-sign-in", "--json"] });
    const child = spawnFn(plan.command, plan.args, { env: buildCliEnv(input.baseEnv, scratch), stdio: ["ignore", "pipe", "pipe"] });
    const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      let out = "";
      let err = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (err += chunk));
      child.once("error", reject);
      child.once("exit", (exitCode) => resolve({ code: exitCode, stdout: out, stderr: err }));
    });
    if (code !== 0) {
      const cliError = parseCliErrorLine(stderr);
      throw new Error(`tovu agent-plugins token-sign-in failed: ${cliError === null ? stderr.trim() : `${cliError.code}: ${cliError.message}`}`);
    }
    return parsePluginList(stdout);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export { cleanCreateTokens, assertTokensCanReachFolder, initTokenOptions, withCreatedTokens, parseCreatedTokensLine, listTokenSignInPlugins };
export type { TokenSignInPlugin, CreatedAgentPluginTokens, ListSpawnFn };
