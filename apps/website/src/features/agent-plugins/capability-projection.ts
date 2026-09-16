/**
 * @file The one surviving half of the Agent Plugins capability work: the `stdio` vs remote MCP trust
 * classifier and the disk readers that turn an installed package (`install.ts`'s
 * `InstalledAgentPlugin`) into readable Skill markdown and classified MCP transport config.
 *
 * ---------------------------------------------------------------------------
 * The candidate descriptor projection was removed 2026-09-15
 * ---------------------------------------------------------------------------
 * This module used to also export `projectInstalledAgentPluginCapabilities`, a CANDIDATE
 * `AgentPluginCapabilityDescriptor` projection of one installed plugin's Skills and MCP servers.
 * It had no production producer, endpoint, or consumer: it ran server-side (reading skill markdown
 * off disk) and nothing proxied its output to the admin session, so its descriptor graph — and the
 * `execute` union it carried — could only ever be exercised by its own tests. The 2026-08-26 owner
 * call that removed `capability_search`/`capability_get` (see
 * `ADS-memory/knowledge/2026-08-26-removed-capability-search.md`) settled the direction — every
 * installed plugin now reaches the agent through its own real tool
 * (`features/agent-plugins/tool-registrations.ts`), so the speculative descriptor graph was
 * deleted rather than left to rot. What remains is the real, used half: the trust classifier below
 * and the readers this feature's production callers (`federate-mcp.ts`,
 * `resolve-agent-plugin-refs.ts`, `tool-registrations.ts`) actually call.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-10: MCP servers are no longer unconditionally execute:unavailable (OWNER-OVERRULED)
 * ---------------------------------------------------------------------------
 * The FINAL debate's "MCP servers → previewable but structurally inert in v1" rule stood on one
 * premise: a plugin's own `mcp.json` "has no independent author... the operator is that author," so
 * with no operator-reviewed admission record, there was nothing to consult. The owner has explicitly
 * overruled that premise for the case that premise never actually covered: a REMOTE server
 * (`streamable-http`/`sse`) using `oauth` or no credential carries no secret and executes no local
 * code — there is nothing here for an operator to review that Tovu's own existing default-deny
 * federated-tool allowlist (`mcp-federation/trust.ts` R2) does not already gate independently, tool
 * by tool, at connect time. What the old premise DID correctly identify as needing an operator's own
 * say-so — a `stdio` server's `command`/`args`, i.e. arbitrary local code execution shipped inside a
 * downloaded marketplace package — is preserved, not discarded: see `classifyAgentPluginMcpServerTrust`
 * below, which is the one surviving piece of the old rule, now expressed as a real gate instead of a
 * blanket refusal. See `ADS-memory/reports/2026-09-10-higgsfield-mcp-research.md` for the verified
 * external facts (Higgsfield MCP: OAuth-only, no API key, a PUBLIC client per its own discovery
 * document — no secret is ever stored) that made this tractable.
 *
 * Architectural role:
 * The trust classifier (`classifyAgentPluginMcpServerTrust`) plus the disk readers
 * (`readInstalledSkillMarkdown`, `readInstalledMcpServerIds`, `readInstalledMcpServers`) that compose
 * `package-paths.ts`'s containment guarantee with a real file read — the same split `install.ts` and
 * `package-paths.ts` already keep between "pure logic" and "the one place bytes are actually read".
 */
import { readFile } from "node:fs/promises";

import type { AgentPluginMcpConfig, McpServerConfig } from "./manifest.js";
import { parseAgentPluginMcpConfig } from "./manifest.js";
import { assertContainedOnDisk } from "./package-paths.js";

/**
 * The one surviving piece of the FINAL debate's old blanket MCP refusal (see this module's header):
 * a plugin cannot make Tovu execute arbitrary local code on the operator's say-so alone.
 *
 * - `stdio` declares `command`/`args` — a downloaded marketplace package choosing what process to
 *   spawn on this machine. That is exactly the local-code-execution case an operator must explicitly
 *   confirm before it ever runs; there is no secret-based mitigation for it, because the risk is not
 *   a leaked credential, it is arbitrary execution.
 * - `streamable-http`/`sse` declare a URL Tovu calls over the network. There is no local execution,
 *   and (per `manifest.ts`'s header) the spec allows no embedded secret Tovu would need to protect —
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

  const result = parseAgentPluginMcpConfig(parsedJson);
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
