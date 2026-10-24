import { buildSiteProfile, toSiteProfileDeps, type SiteProfileSourceDeps } from "#src/features/site-inspection/index";
import type { SiteFact } from "./contracts.js";
import type { PluginMaturity } from "#src/features/agent-plugins/identity";

/** Only read ports: live registries and host module status. No settings or credential values. */
export interface SiteGuideFactsDeps extends SiteProfileSourceDeps {
  readonly listWidgetTypes: () => readonly string[];
  readonly listFormFieldTypes: () => readonly string[];
  readonly listMarkers: () => readonly string[];
  readonly listLayouts: () => readonly string[];
  readonly readMembersEnabled: () => Promise<boolean | null>;
  readonly readAgentPlugins: () => Promise<readonly { id: string; name: string; version: string | null; enabled: boolean | null; pluginId?: string; description?: string | null; provides?: readonly string[]; maturity?: PluginMaturity }[]>;
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

const PROFILE_TOPICS = [["themes", "theme"], ["plugins", "plugins"], ["content", "contentTypes"]] as const;

async function readProfileFacts({ deps, caller, requested }: {
  deps: SiteGuideFactsDeps; caller: { principalId: string }; requested: ReadonlySet<string>;
}, _options: Record<string, never> = {}): Promise<Record<string, SiteFact>> {
  const sections = PROFILE_TOPICS.filter(([topic]) => requested.has(topic)).map(([, section]) => section);
  const profile = sections.length ? await buildSiteProfile(toSiteProfileDeps(deps), caller, { sections }) : undefined;
  const facts: Record<string, SiteFact> = {};
  for (const [topic, section] of PROFILE_TOPICS) {
    const read = profile?.sections[section];
    if (!read) continue;
    facts[topic] = read.status === "ok" ? { status: "ok", data: read.data, ...(read.truncated ? { truncated: true } : {}) } : { status: read.status };
  }
  return facts;
}

function mergeProfileRegistryFact({ prior, extra }: { prior: SiteFact | undefined; extra: SiteFact }, _options: Record<string, never> = {}): SiteFact {
  // A partial read stays explicitly partial; a missing roster must never look empty.
  if (prior?.status === "ok" && extra.status === "ok") {
    return { status: "ok", data: { profile: prior.data, registry: extra.data }, ...(prior.truncated ? { truncated: true } : {}) };
  }
  return { status: prior?.status === "forbidden" || extra.status === "forbidden" ? "forbidden" : "unavailable" };
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
  const facts = await readProfileFacts({ deps, caller, requested });
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
      facts[topic] = mergeProfileRegistryFact({ prior: facts[topic], extra });
    } else facts[topic] = extra;
  }
  return facts;
}
