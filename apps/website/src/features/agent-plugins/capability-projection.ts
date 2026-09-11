/**
 * @file The adapter between an installed Agent Plugin (`install.ts`'s `InstalledAgentPlugin`) and
 * whatever the composer's capability projection ultimately consumes.
 *
 * ---------------------------------------------------------------------------
 * Interface boundary — read this before changing the shape below
 * ---------------------------------------------------------------------------
 * The FINAL debate decision (`2026-08-12-tovu-six-debates-FINAL.md`, "3 — Agent Plugins → commands")
 * is explicit: "Agent Plugins are one adapter feeding the composer's capability projection — not a
 * parallel command system." Building that projection (the layer that turns a heterogeneous set of
 * capability sources — Agent Plugins among them — into what the composer actually renders and
 * dispatches) is a SEPARATE agent's deliverable, dispatched from the same debate's decision on
 * composer slash commands. This module is the OTHER side of that boundary: it does not touch the
 * composer, `apps/admin/src/components/AssistantDock/**`, or Jini's `slots.ts`/`composer-discovery.ts`
 * (verified real shape: `ComposerDiscoveryItem` is `{ id, label, description?, kind?, keywords?,
 * insertText? }` — data-only, no execute/preview fields at all today; `TOVU_COMPOSER_DISCOVERY_GROUPS`
 * in `apps/admin/src/features/plugins/agent-plugin-catalog.ts` is the CURRENT hardcoded catalog the
 * projection agent's own work explicitly plans to replace — this module does not edit that file).
 *
 * `AgentPluginCapabilityDescriptor` below is therefore a CANDIDATE contract, owned and tested by this
 * module, not a promise about what the real projection's input type will be named or shaped like.
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
 * A Skill's `execute` is still always `{ kind: "context-injection" }` — unaffected by any of this,
 * since Skills never carried the MCP question in the first place.
 *
 * Architectural role:
 * Pure projection (`projectInstalledAgentPluginCapabilities`) plus one disk-reading helper
 * (`readInstalledSkillMarkdown`) that composes `package-paths.ts`'s containment guarantee with a real
 * file read — the same split `install.ts` and `package-paths.ts` already keep between "pure logic"
 * and "the one place bytes are actually read".
 */
import { readFile } from "node:fs/promises";

import type { InstalledAgentPlugin } from "./install.js";
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

export type AgentPluginCapabilityKind = "agent-plugin-skill" | "agent-plugin-mcp-server";

export type AgentPluginCapabilityPreview =
  | { readonly kind: "markdown"; readonly path: string; readonly content: string }
  | { readonly kind: "none" };

export type AgentPluginCapabilityExecute =
  | { readonly kind: "context-injection"; readonly markdown: string }
  /** An auto-admitted (`classifyAgentPluginMcpServerTrust` === "auto-admit") remote MCP server. Not
   * `context-injection` — there is no markdown to compose for a network connection — but distinct
   * from `unavailable`: this server IS wired into the assistant's own tool federation automatically
   * (Phase 4), so calling it inert here would misdescribe a server that may be actively answering
   * tool calls. `reason` is operator-facing explanatory text, not a refusal. */
  | { readonly kind: "federated"; readonly reason: string }
  /** A `stdio` server, or one whose declared shape this module could not classify. Genuinely inert
   * until an operator explicitly confirms it — see `classifyAgentPluginMcpServerTrust`. */
  | { readonly kind: "unavailable"; readonly reason: string };

/** One capability an installed Agent Plugin contributes. See this module's header for what is and
 * is not a stable contract about this shape. */
export interface AgentPluginCapabilityDescriptor {
  readonly id: string;
  readonly kind: AgentPluginCapabilityKind;
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly pluginId: string;
  /** The installed package's content digest — a projection consumer's natural cache/invalidation
   * key, mirroring `AdmittedFederatedTool`'s own audit-carrying fields in `mcp-federation/trust.ts`. */
  readonly revision: string;
  readonly preview: AgentPluginCapabilityPreview;
  readonly execute: AgentPluginCapabilityExecute;
}

export interface ProjectInstalledAgentPluginCapabilitiesRequired {
  readonly installed: InstalledAgentPlugin;
  /** Reads one skill's markdown by its package-relative `skillPath`. Injected rather than reading
   * disk directly, so this projection function stays pure and unit-testable without a real
   * filesystem — `readInstalledSkillMarkdown` below is the real implementation a caller supplies. */
  readonly readSkillMarkdown: (skillPath: string) => Promise<string>;
  /** Server ids declared in the package's `mcp.json` (`manifest.ts`'s `parseAgentPluginMcpConfig`
   * result) — empty when the package declares no `mcp.json` at all, which the spec makes optional.
   * A descriptor is produced for every id here, even one absent from {@link mcpServers} below (a
   * declared-but-unparseable entry), matching this projector's pre-existing "one descriptor per
   * declared id" contract regardless of whether the shape validated. */
  readonly mcpServerIds: readonly string[];
  /** The subset of {@link mcpServerIds} whose transport shape validated (`manifest.ts`'s
   * `AgentPluginMcpConfig.servers`) — what `classifyAgentPluginMcpServerTrust` classifies. A
   * `mcpServerIds` entry absent here gets `execute: { kind: "unavailable" }` with a reason naming
   * the parse failure rather than a trust classification, since there is no config to classify. */
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>;
}

export type ProjectInstalledAgentPluginCapabilitiesOptional = {};

/**
 * The `execute` half of one MCP-server descriptor — split out of {@link projectInstalledAgentPluginCapabilities}
 * purely to keep that function's complexity under the shop ceiling.
 *
 * @param config - The server's validated transport config, or `undefined` when `serverId` was
 * declared in `mcp.json` but its shape did not validate (see {@link ProjectInstalledAgentPluginCapabilitiesRequired.mcpServers}).
 * @complexity O(1).
 */
function resolveAgentPluginMcpExecute(serverId: string, config: McpServerConfig | undefined): AgentPluginCapabilityExecute {
  if (!config) {
    return {
      kind: "unavailable",
      reason: `this plugin's mcp.json declares '${serverId}' with a shape this version of Tovu does not recognize, so it cannot be launched`,
    };
  }

  if (classifyAgentPluginMcpServerTrust(config) === "auto-admit") {
    return {
      kind: "federated",
      reason:
        "this remote MCP server is wired into the assistant's tool set automatically — it carries no local " +
        "execution and no secret this plugin could have embedded, so no separate confirmation is required. " +
        "Individual tools it advertises are still gated by the operator's own allowlist at connect time.",
    };
  }

  return {
    kind: "unavailable",
    reason:
      "this server launches a local process ('stdio') from a downloaded plugin package — that requires explicit " +
      "operator confirmation before Tovu will ever run it, which has not been given yet.",
  };
}

/**
 * Projects one installed Agent Plugin's Skills and MCP servers into capability descriptors.
 *
 * @throws Propagates whatever `readSkillMarkdown` throws for a skill it cannot read; does not itself
 * perform I/O.
 * @complexity O(s + m) in the plugin's own skill and MCP-server counts.
 */
export async function projectInstalledAgentPluginCapabilities(
  required: ProjectInstalledAgentPluginCapabilitiesRequired,
  _optional: ProjectInstalledAgentPluginCapabilitiesOptional = {}
): Promise<readonly AgentPluginCapabilityDescriptor[]> {
  const { installed, readSkillMarkdown, mcpServerIds, mcpServers } = required;
  const descriptors: AgentPluginCapabilityDescriptor[] = [];

  for (const skill of installed.skills) {
    const markdown = await readSkillMarkdown(skill.skillPath);
    descriptors.push({
      id: `agent-plugin:${installed.pluginId}:skill:${skill.name}`,
      kind: "agent-plugin-skill",
      label: humanize(skill.name),
      description: `Context-only skill from the '${installed.pluginId}' Agent Plugin`,
      keywords: ["skill", installed.pluginId, skill.name],
      pluginId: installed.pluginId,
      revision: installed.archiveDigest,
      preview: { kind: "markdown", path: skill.skillPath, content: markdown },
      // A Skill's whole contract (Agent Plugins spec) is markdown with no arguments, return value,
      // or side effects — "context injection" is the entire execution model, not a stand-in for one
      // this module has not built yet (FINAL decision: "No trust model needed").
      execute: { kind: "context-injection", markdown },
    });
  }

  for (const serverId of mcpServerIds) {
    descriptors.push({
      id: `agent-plugin:${installed.pluginId}:mcp:${serverId}`,
      kind: "agent-plugin-mcp-server",
      label: serverId,
      description: `MCP server declared by the '${installed.pluginId}' Agent Plugin`,
      keywords: ["mcp", installed.pluginId, serverId],
      pluginId: installed.pluginId,
      revision: installed.archiveDigest,
      preview: { kind: "none" },
      execute: resolveAgentPluginMcpExecute(serverId, mcpServers[serverId]),
    });
  }

  return descriptors;
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
 * receive) transport configuration, mirroring the ids-only/full-config split
 * {@link ProjectInstalledAgentPluginCapabilitiesRequired} draws between `mcpServerIds` and `mcpServers`.
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
 * any caller that must actually LAUNCH a server rather than merely list it (capability projection's
 * trust classification, and Phase 4's federation wiring). A server present in
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

function humanize(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
