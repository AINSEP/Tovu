/**
 * @file MCP transport trust classification and contained reads of installed plugin skills/config.
 * Disk readers compose the lifecycle owner's path-containment guarantee with real file reads.
 * See classifyAgentPluginMcpServerTrust for the local-execution and remote-tool admission boundary.
 */
import { readFile } from "node:fs/promises";

import type { AgentPluginMcpConfig, McpServerConfig } from "./mcp-metadata.js";
import { parseAgentPluginMcpConfig } from "./mcp-metadata.js";
import { assertContainedOnDisk } from "./lifecycle.js";

/**
 * A plugin must not execute arbitrary local code without explicit operator confirmation.
 *
 * - `stdio` declares `command`/`args` — a downloaded marketplace package choosing what process to
 *   spawn on this machine. That is exactly the local-code-execution case an operator must explicitly
 *   confirm before it ever runs; there is no secret-based mitigation for it, because the risk is not
 *   a leaked credential, it is arbitrary execution.
 * - `streamable-http`/`sse` declare a URL Tovu calls over the network. There is no local execution,
 *   and (per the Agent Plugins grammar) the spec allows no embedded secret Tovu would need to protect —
 *   an `oauth`-mode connection mints its own token through Tovu's own RFC 8414/7591 flow, and a
 *   `none`-mode connection carries no credential at all. Either way, `mcp-federation/trust.ts`'s R2
 *   default-deny allowlist still gates every individual remote TOOL independently at connect time —
 *   auto-admitting the SERVER here grants nothing beyond "this connection may be attempted."
 *
 * @returns `"requires-confirmation"` for `stdio` (never auto-run — see `readInstalledMcpServerIds`'s
 * caller contract), `"auto-admit"` for a remote transport.
 * @complexity O(1).
 */
export function classifyAgentPluginMcpServerTrust(server: Pick<McpServerConfig, "type">): "auto-admit" | "requires-confirmation" {
  return server.type === "stdio" ? "requires-confirmation" : "auto-admit";
}

/**
 * Reads one installed skill's markdown from disk, through the same containment guarantee
 * (`package-paths.ts`'s `assertContainedOnDisk`) `install.ts` uses at extraction time — one
 * implementation of "stay inside the package root," not two.
 *
 * @throws {PackagePathViolation} If `skillPath` resolves outside `packageRoot` (should be
 * unreachable for a `skillPath` sourced from `InstalledAgentPlugin.skills`, which `install.ts` only
 * ever populates from paths it already walked inside an already-contained tree — defense in depth
 * for a caller that constructs one by hand).
 */
export async function readInstalledSkillMarkdown(packageRoot: string, skillPath: string): Promise<string> {
  const absolute = await assertContainedOnDisk(packageRoot, skillPath);
  return readFile(absolute, "utf8");
}

/**
 * Reads and parses one installed package's `mcp.json` — same containment guarantee as
 * {@link readInstalledSkillMarkdown}, applied to a fixed, known-safe filename rather than a
 * caller-supplied `skillPath`. Shared by {@link readInstalledMcpServerIds} and
 * {@link readInstalledMcpServers}, which each reduce a different projection of the same parse.
 *
 * `mcp.json` is OPTIONAL per the Agent Plugins spec (`manifest.ts`'s own header), so a missing file
 * is not an error — it means this package declares no MCP servers, the common case for a
 * skills-only package like the reference `ui-ux-design`/`site-compliance` installs. A present but
 * unparseable `mcp.json` (bad JSON, wrong `$schema`, malformed `mcpServers`) is ALSO tolerated rather
 * than thrown: both readers back `search_agent_plugin_local`-adjacent discovery paths whose whole
 * purpose is staying usable even when one installed package is imperfect — the same fail-open
 * posture `listInstalledPlugins` already takes for a digest that fails to index at all (skipped, not
 * fatal to every other plugin).
 *
 * @returns `null` for a missing file, invalid JSON, or a `mcp.json` that fails top-level validation
 * — every one of these collapses to the same "nothing to report" outcome for both callers.
 * @complexity O(s) in the declared server count (`parseAgentPluginMcpConfig`'s own bound) plus one
 * file read.
 */
async function readInstalledMcpConfig(packageRoot: string): Promise<AgentPluginMcpConfig | null> {
  let raw: string;
  try {
    const absolute = await assertContainedOnDisk(packageRoot, "mcp.json");
    raw = await readFile(absolute, "utf8");
  } catch {
    return null;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }

  let manifest: unknown;
  try {
    const absolute = await assertContainedOnDisk(packageRoot, "plugin.json");
    manifest = JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    // Missing/malformed extensions cannot supply read trust; transport discovery still works.
  }
  const result = parseAgentPluginMcpConfig({ value: parsedJson }, { pluginManifest: manifest });
  return result.ok ? result.config : null;
}

/**
 * The server ids declared in one installed package's `mcp.json`, regardless of whether each one's
 * own transport shape validated — see {@link readInstalledMcpConfig} for the shared fail-open
 * contract. Kept as its own function for the callers that only need ids and should not pay for (or
 * receive) transport configuration, mirroring the ids-only/full-config split this feature's callers
 * draw between listing a server and launching one.
 *
 * @complexity See {@link readInstalledMcpConfig}.
 */
export async function readInstalledMcpServerIds(packageRoot: string): Promise<readonly string[]> {
  const config = await readInstalledMcpConfig(packageRoot);
  return config?.serverIds ?? [];
}

/**
 * The full, validated transport configuration of every server in one installed package's `mcp.json`
 * whose shape validated — the sibling {@link readInstalledMcpServerIds} does not provide, needed by
 * any caller that must actually LAUNCH a server rather than merely list it (`federate-mcp.ts`'s trust
 * classification, and Phase 4's federation wiring). A server present in
 * {@link readInstalledMcpServerIds}'s result but absent from this one declared an unrecognized
 * `type` or was missing a required field for it — fail-open per `manifest.ts`'s own contract, not an
 * error a caller here needs to handle specially.
 *
 * @returns `{}` under every condition {@link readInstalledMcpConfig} tolerates (no file, bad JSON,
 * failed top-level validation) — the same empty-is-normal posture {@link readInstalledMcpServerIds}
 * takes with `[]`.
 * @complexity See {@link readInstalledMcpConfig}.
 */
export async function readInstalledMcpServers(packageRoot: string): Promise<Readonly<Record<string, McpServerConfig>>> {
  const config = await readInstalledMcpConfig(packageRoot);
  return config?.servers ?? {};
}
