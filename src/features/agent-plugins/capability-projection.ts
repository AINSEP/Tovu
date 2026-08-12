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
 * What is NOT negotiable — because it is the debate's own decided rule, not an implementation detail
 * — is the RELATIONSHIP it encodes: a Skill gets a real, executable binding; an MCP server's `execute`
 * is unconditionally `{ kind: "unavailable", reason }`. See the rule stated at length below.
 *
 * ---------------------------------------------------------------------------
 * Why MCP execute is unconditional, not merely "the current default"
 * ---------------------------------------------------------------------------
 * "MCP servers → previewable but structurally inert in v1" (FINAL decision). This is not a
 * placeholder waiting for an admission flag to flip it on — there is deliberately no parameter to
 * this module's projector that CAN promote an MCP descriptor to runnable (see the adversarial test
 * "no promotion path exists" in this module's own unit test). The debate's trust argument is that a
 * plugin's own `mcp.json` "has no independent author... the operator is that author," and until a
 * real operator-authored, workspace-scoped admission record exists (the debate's own deferred future
 * work — see this feature's handoff REMAINING section), there is no admission to consult, which is a
 * feature of this slice, not a gap: an adapter that accepted an "admitted" boolean from its caller
 * would just move the unauthenticated-classification problem one layer up rather than solving it.
 *
 * Architectural role:
 * Pure projection (`projectInstalledAgentPluginCapabilities`) plus one disk-reading helper
 * (`readInstalledSkillMarkdown`) that composes `package-paths.ts`'s containment guarantee with a real
 * file read — the same split `install.ts` and `package-paths.ts` already keep between "pure logic"
 * and "the one place bytes are actually read".
 */
import { readFile } from "node:fs/promises";

import type { InstalledAgentPlugin } from "./install";
import { assertContainedOnDisk } from "./package-paths";

export type AgentPluginCapabilityKind = "agent-plugin-skill" | "agent-plugin-mcp-server";

export type AgentPluginCapabilityPreview =
  | { readonly kind: "markdown"; readonly path: string; readonly content: string }
  | { readonly kind: "none" };

export type AgentPluginCapabilityExecute =
  | { readonly kind: "context-injection"; readonly markdown: string }
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
   * result) — empty when the package declares no `mcp.json` at all, which the spec makes optional. */
  readonly mcpServerIds: readonly string[];
}

export type ProjectInstalledAgentPluginCapabilitiesOptional = {};

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
  const { installed, readSkillMarkdown, mcpServerIds } = required;
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
      execute: {
        kind: "unavailable",
        reason:
          "Agent Plugin MCP servers are not executable in this release — a plugin's own mcp.json has no independent " +
          "author, and no operator-reviewed admission record exists yet for this server.",
      },
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

function humanize(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}
