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
  /**
   * Optional because there is no honest value to put here: the package this entry describes
   * (Jini's `ui-ux-design` Agent Plugin) bundles 7 skills and its own `plugin.json` carries no
   * `version` field at all (see `packages/plugins/README.md` in the Jini repo). A hand-set number
   * here would describe nothing real. Omit rather than invent one; `AgentPlugins.tsx` skips the
   * Version row entirely when this is absent.
   */
  readonly version?: string;
  readonly description: string;
  readonly source: "Jini plugins package (@jini-ai/plugins)";
  readonly availability: "Bundled with Tovu — catalogued, not executed";
  readonly skills: readonly BundledAgentPluginSkill[];
}

export const TOVU_BUNDLED_AGENT_PLUGINS: readonly BundledAgentPlugin[] = [
  {
    id: "ui-ux-design",
    displayName: "UI/UX Design",
    description:
      "AI Dev Shop's UI/UX design, interface-design, accessibility, and shadcn/ui component skills — 7 skills bundled as one portable Agent Plugin.",
    source: "Jini plugins package (@jini-ai/plugins)",
    availability: "Bundled with Tovu — catalogued, not executed",
    skills: [
      { name: "ui-ux-design", relativePath: "skills/ui-ux-design/SKILL.md" },
      { name: "interface-design", relativePath: "skills/interface-design/SKILL.md" },
      { name: "gstack-design", relativePath: "skills/gstack-design/SKILL.md" },
      { name: "frontend-accessibility", relativePath: "skills/frontend-accessibility/SKILL.md" },
      { name: "vercel-web-design-guidelines", relativePath: "skills/vercel-web-design-guidelines/SKILL.md" },
      { name: "shadcn-ui", relativePath: "skills/shadcn-ui/SKILL.md" },
      { name: "web-compliance", relativePath: "skills/web-compliance/SKILL.md" },
    ],
  },
];
