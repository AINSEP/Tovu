import type { ComposerDiscoveryGroup } from "@jini-ai/chat/react";

export interface BundledAgentPluginSkill {
  readonly name: string;
  readonly relativePath: `skills/${string}/SKILL.md`;
}

/**
 * Catalog projection for source-packaged Agent Plugins. It deliberately contains no loader,
 * enablement, permission, or execution fields: this first slice can describe checked-in package
 * content, but Tovu does not yet execute the Agent Plugins v1 format.
 */
export interface BundledAgentPlugin {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly source: "Tovu source tree";
  readonly availability: "Bundled with Tovu — catalogued, not executed";
  readonly skills: readonly BundledAgentPluginSkill[];
}

export const TOVU_BUNDLED_AGENT_PLUGINS: readonly BundledAgentPlugin[] = [
  {
    id: "ui-ux-design",
    displayName: "UI/UX Design",
    version: "1.1.0",
    description: "AI Dev Shop UI/UX and interface-design guidance packaged as one portable Agent Skill.",
    source: "Tovu source tree",
    availability: "Bundled with Tovu — catalogued, not executed",
    skills: [{ name: "ui-ux-design", relativePath: "skills/ui-ux-design/SKILL.md" }],
  },
];

/**
 * Bounded host inventory for the assistant composer.
 *
 * Every entry has a checked-in source: Word Count is Tovu's compiled-in regular plugin, while the
 * Agent Plugin and singular skill are projections of the bundle above. Jini receives only these
 * descriptors and owns no Tovu inventory lookup or product taxonomy.
 */
export const TOVU_COMPOSER_DISCOVERY_GROUPS: readonly ComposerDiscoveryGroup[] = [
  {
    id: "regular-plugins",
    label: "Plugins",
    items: [
      {
        id: "regular-plugin:word-count",
        label: "Word Count",
        description: "Built-in Tovu plugin",
        kind: "plugin",
        keywords: ["plugin", "content"],
        insertText: "Word Count plugin",
      },
    ],
  },
  {
    id: "agent-plugins",
    label: "Agent Plugins",
    items: [
      {
        id: "agent-plugin:ui-ux-design",
        label: "UI/UX Design",
        description: "UI/UX Design Agent Plugin bundled with Tovu; not executed from the composer",
        kind: "agent-plugin",
        keywords: ["agent plugin", "design", "ui", "ux"],
        insertText: "UI/UX Design agent plugin",
      },
    ],
  },
  {
    id: "skills",
    label: "Skills / Design toolbox",
    items: [
      {
        id: "skill:ui-ux-design",
        label: "UI/UX Design",
        description: "Portable skill from the ui-ux-design Agent Plugin",
        kind: "skill",
        keywords: ["skill", "design", "ui", "ux"],
        insertText: "UI/UX Design skill",
      },
    ],
  },
  {
    id: "mcp",
    label: "MCP",
    items: [
      {
        id: "mcp:settings",
        label: "/mcp",
        description: "Open Tovu's existing External MCP settings",
        kind: "mcp",
        keywords: ["mcp", "server", "tools", "settings"],
        insertText: "",
      },
    ],
  },
];

/** Resolves only actions backed by an existing Tovu route; inventory rows never carry functions. */
export function resolveTovuComposerDiscoveryRoute(itemId: string): string | null {
  return itemId === "mcp:settings" ? "/settings?tab=external-mcp" : null;
}
