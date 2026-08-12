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
