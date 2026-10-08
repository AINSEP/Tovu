import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { resolveProductRoot } from "../../platform/site-dir/index.js";

import { readInstalledMcpServers } from "./capability-projection.js";
import { titleCaseFromPluginId, type ResolvedAgentPluginForConnect } from "./connect-tool.js";
import type { InstalledAgentPluginServers } from "./import-access-token.js";
import { RETIRED_BUNDLED_AGENT_PLUGINS } from "./lifecycle.js";
import { listTokenSignInPlugins, type TokenCheckOutcome, type TokenSignInPlugin } from "./token-sign-in.js";

/**
 * @file The rules for access tokens given while CREATING a site, shared by every create path: the
 * admin's `POST .../system/sites` (`routes/system/sites.ts`) and `tovu init --agent-plugin-tokens-stdin`
 * (`cli/commands/init.ts`, which the desktop app's "Create website" runs). Added 2026-09-29 so the
 * desktop create form offers the same optional "Connect services" step as the admin's.
 *
 * Generic: keyed by plugin id; a plugin qualifies by declaring `tovuTokenAuth` (`token-sign-in.ts`).
 * Nothing here ever returns or logs a token.
 */

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_AGENT_PLUGIN_TOKENS = 8;
const MAX_TOKEN_LENGTH = 4096;

export const NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR = "'agentPluginTokens' must map plugin ids to token strings";

/**
 * `{ [pluginId]: token }`, trimmed, blanks dropped. `null`/`undefined` is "none given".
 * @complexity O(n) in the entry count (bounded).
 */
export function parseNewSiteAgentPluginTokens(raw: unknown): { ok: true; tokens: Record<string, string> } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, tokens: {} };
  const invalid = { ok: false as const, error: NEW_SITE_AGENT_PLUGIN_TOKENS_SHAPE_ERROR };
  if (typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > MAX_AGENT_PLUGIN_TOKENS) return invalid;
  const tokens: Record<string, string> = {};
  for (const [pluginId, value] of Object.entries(raw)) {
    if (!PLUGIN_ID_PATTERN.test(pluginId) || typeof value !== "string" || value.length > MAX_TOKEN_LENGTH) return invalid;
    if (value.trim() !== "") tokens[pluginId] = value.trim();
  }
  return { ok: true, tokens };
}

/** Why a token given at create time stops the create, or `null` when it may be stored. A token the
 *  vendor could not be reached to check is still stored: the new site's first use tells. */
export function describeNewSiteAgentPluginTokenRefusal(
  pluginId: string,
  outcome: TokenCheckOutcome,
): { code: "AGENT_PLUGIN_TOKEN_INVALID" | "AGENT_PLUGIN_TOKEN_UNSUPPORTED"; error: string } | null {
  const name = titleCaseFromPluginId(pluginId);
  if (outcome === "invalid") {
    return { code: "AGENT_PLUGIN_TOKEN_INVALID", error: `That ${name} access token didn't work. Check it, or leave it empty and connect ${name} later from chat. No site was created.` };
  }
  if (outcome === "unsupported") {
    return { code: "AGENT_PLUGIN_TOKEN_UNSUPPORTED", error: `${name} can't be connected with an access token here. Leave it empty and connect it later from chat. No site was created.` };
  }
  return null;
}

/**
 * The first refusal across `tokens`, checked in order, or `null` when every token may be stored.
 * @complexity One check (at most one outbound GET) per token.
 */
export async function firstNewSiteAgentPluginTokenRefusal(
  check: (input: { pluginId: string; token: string }) => Promise<TokenCheckOutcome>,
  tokens: Readonly<Record<string, string>>,
): Promise<{ pluginId: string; code: string; error: string } | null> {
  for (const [pluginId, token] of Object.entries(tokens)) {
    const refusal = describeNewSiteAgentPluginTokenRefusal(pluginId, await check({ pluginId, token }));
    if (refusal) return { pluginId, ...refusal };
  }
  return null;
}

/** The plugin's manifest `name`, or `null` when `plugin.json` is missing or unreadable. */
async function readBundledPluginId(pluginDir: string): Promise<string | null> {
  try {
    const manifest = JSON.parse(await readFile(path.join(pluginDir, "plugin.json"), "utf8")) as { name?: unknown };
    return typeof manifest.name === "string" && PLUGIN_ID_PATTERN.test(manifest.name) ? manifest.name : null;
  } catch {
    return null;
  }
}

/**
 * The bundled plugins shipped with this Tovu (`content/agent-plugins/`, `deps.ts`'s
 * `bundledAgentPluginsDir()`), for a create path that runs before the new site has a workspace to
 * install them into — the new site's first boot seeds exactly these. An absent dir is an empty list.
 *
 * @complexity O(p) plugin dirs, one manifest and one `mcp.json` read each.
 */
export async function listBundledAgentPluginServers(sourceRoot: string): Promise<readonly InstalledAgentPluginServers[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(sourceRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: InstalledAgentPluginServers[] = [];
  for (const entry of entries) {
    // Same skip as `seed-bundled.ts`: a retired id is never seeded, so it is never offered.
    if (!entry.isDirectory() || RETIRED_BUNDLED_AGENT_PLUGINS.has(entry.name)) continue;
    const pluginDir = path.join(sourceRoot, entry.name);
    const pluginId = await readBundledPluginId(pluginDir);
    if (pluginId === null) continue;
    out.push({ pluginId, servers: await readInstalledMcpServers(pluginDir) });
  }
  return out;
}

/** `checkAgentPluginAccessToken`'s `resolveInstalledPlugin`, answered from the bundled plugins. */
export function resolveBundledAgentPlugin(sourceRoot: string): (pluginId: string) => Promise<ResolvedAgentPluginForConnect | null> {
  return async (pluginId) => {
    const found = (await listBundledAgentPluginServers(sourceRoot)).find((plugin) => plugin.pluginId === pluginId);
    return found ? { servers: found.servers } : null;
  };
}

/** The bundled plugins' source dir: `TOVU_BUNDLED_AGENT_PLUGINS_DIR`, else `<product>/content/agent-plugins`.
 *  Same resolution as `deps.ts`'s `bundledAgentPluginsDir()` (not imported: that module pulls in the
 *  whole server composition graph for one path). @complexity O(1). */
export function bundledAgentPluginsSourceRoot(): string {
  return process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR ?? path.join(resolveProductRoot(), "content", "agent-plugins");
}

/**
 * The plugins a NEW site can be connected to with a pasted token: the bundled ones its first boot
 * seeds. Not the creating site's installs — a plugin only that site has would be offered, pass the
 * check, and then never exist on the new site.
 *
 * @complexity O(p) bundled plugin dirs.
 */
export function listNewSiteAgentPluginTokenSignInPlugins(sourceRoot: string = bundledAgentPluginsSourceRoot()): Promise<readonly TokenSignInPlugin[]> {
  return listTokenSignInPlugins("new-site", () => listBundledAgentPluginServers(sourceRoot));
}
