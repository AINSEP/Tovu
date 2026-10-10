import { buildSiteProfile, toSiteProfileDeps, type SiteProfileSourceDeps, type SiteProfileSectionName } from "#src/features/site-inspection/index";
import type { SiteFact } from "./contracts.js";

/** Only read ports: live registries and host module status. No settings or credential values. */
export interface SiteGuideFactsDeps extends SiteProfileSourceDeps {
  readonly listWidgetTypes: () => readonly string[];
  readonly listFormFieldTypes: () => readonly string[];
  readonly listMarkers: () => readonly string[];
  readonly listLayouts: () => readonly string[];
  readonly readMembersEnabled: () => Promise<boolean | null>;
  readonly readAgentPlugins: () => Promise<readonly { id: string; name: string; version: string | null; enabled: boolean | null }[]>;
}

/** Read a registry/status only after its domain permission passes. A failed read reports unknown.
 * Error text may contain storage values, so it is neither logged nor returned here.
 */
async function readScoped(input: { deps: SiteGuideFactsDeps; principalId: string; permission: string; read: () => Promise<unknown> }): Promise<SiteFact> {
  try {
    const decision = await input.deps.authorize({ principalId: input.principalId, workspaceId: input.deps.workspaceId, permission: input.permission });
    if (!decision.allowed) return { status: "forbidden" };
    return { status: "ok", data: await input.read() };
  } catch { return { status: "unavailable" }; }
}

/** Read THIS booted site's projected facts. Site Inspection owns theme/plugin aggregation;
 * denied topics perform no registry or storage read. No cache: edits must be visible next call.
 * @returns Topic-keyed safe DTOs, with explicit forbidden/unavailable status.
 * @complexity O(t) requested topics, at most one profile aggregation plus fixed registry reads.
 * @example readSiteGuideFacts({ deps, caller: { principalId }, topics: ['forms'] });
 */
export async function readSiteGuideFacts(input: {
  deps: SiteGuideFactsDeps; caller: { principalId: string }; topics: readonly string[];
}, _options: Record<string, never> = {}): Promise<Readonly<Record<string, SiteFact>>> {
  const { deps, caller } = input;
  const requested = new Set(input.topics);
  const sections: SiteProfileSectionName[] = [];
  if (requested.has("themes")) sections.push("theme");
  if (requested.has("plugins")) sections.push("plugins");
  if (requested.has("content")) sections.push("contentTypes");
  const profile = sections.length ? await buildSiteProfile(toSiteProfileDeps(deps), caller, { sections }) : undefined;
  const facts: Record<string, SiteFact> = {};
  for (const [topic, section] of [["themes", "theme"], ["plugins", "plugins"], ["content", "contentTypes"]] as const) {
    const read = profile?.sections[section];
    if (read) facts[topic] = read.status === "ok" ? { status: "ok", data: read.data, ...(read.truncated ? { truncated: true } : {}) } : { status: read.status };
  }
  const reads: Record<string, { permission: string; read: () => Promise<unknown> }> = {
    widgets: { permission: "widgets.read", read: async () => ({ types: deps.listWidgetTypes().slice(0, 256) }) },
    forms: { permission: "admin.forms.manage", read: async () => ({ fieldTypes: deps.listFormFieldTypes().slice(0, 256) }) },
    members: { permission: "member.manage", read: async () => {
      const enabled = await deps.readMembersEnabled();
      if (enabled === null) throw new Error("Membership enablement is unavailable: the host has no membership toggle.");
      return { enabled };
    } },
    themes: { permission: "theme.set", read: async () => ({ markers: deps.listMarkers().slice(0, 256), layouts: deps.listLayouts() }) },
    plugins: { permission: "admin.plugins.read", read: async () => ({ agentPlugins: (await deps.readAgentPlugins()).slice(0, 256) }) },
  };
  for (const [topic, spec] of Object.entries(reads)) {
    if (!requested.has(topic)) continue;
    const extra = await readScoped({ deps, principalId: caller.principalId, ...spec });
    if (topic === "themes" || topic === "plugins") {
      const prior = facts[topic];
      // A partial read stays explicitly partial; a missing roster must never look empty.
      facts[topic] = prior?.status === "ok" && extra.status === "ok"
        ? { status: "ok", data: { profile: prior.data, registry: extra.data }, ...(prior.truncated ? { truncated: true } : {}) }
        : { status: prior?.status === "forbidden" || extra.status === "forbidden" ? "forbidden" : "unavailable" };
    } else facts[topic] = extra;
  }
  return facts;
}
