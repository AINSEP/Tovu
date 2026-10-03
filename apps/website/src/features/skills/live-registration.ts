import { ToolInputError, type ToolRegistry, type ToolRegistration } from "@jini-ai/core";

/** Optional port attached by the skills registrar. Consumers need no feature imports. */
export type SkillsRefreshRegistry = ToolRegistry & { refreshInstalledSkills?: () => Promise<boolean> };

/**
 * Keeps skill slots on the core's append-only registry, while their active registrations change.
 * Removed slots deny both authorization and execution; the registry identity remains intact.
 * @complexity O(n) per replacement, O(total distinct skill ids) retained slots.
 */
export function createLiveSkillRegistration(registry: ToolRegistry): (tools: readonly ToolRegistration[]) => boolean {
  const active = new Map<string, ToolRegistration>();
  const slots = new Map<string, ToolRegistration>();
  const list = registry.list.bind(registry);
  const has = registry.has.bind(registry);
  registry.list = required => list(required).filter(d => !slots.has(d.id) || active.has(d.id));
  registry.has = ({ toolId }) => slots.has(toolId) ? active.has(toolId) : has({ toolId });
  let fingerprint = "";
  return tools => {
    // Discovery changes invalidate the search snapshot; handlers always use current guidance.
    const nextFingerprint = JSON.stringify(tools.map(t => t.descriptor));
    const next = new Map(tools.map(t => [t.descriptor.id, t]));
    for (const tool of tools) {
      const id = tool.descriptor.id;
      const existing = slots.get(id);
      if (existing) Object.assign(existing.descriptor, tool.descriptor);
      else {
        const slot: ToolRegistration = {
          descriptor: { ...tool.descriptor },
          policy: { authorize: ctx => active.get(id)?.policy.authorize(ctx) ?? "deny" },
          handler: (ctx, optional = {}) => {
            const current = active.get(id);
            if (!current) throw new ToolInputError({ message: "This skill is no longer enabled or installed. Choose an installed skill." });
            return current.handler(ctx, optional);
          },
        };
        registry.register(slot);
        slots.set(id, slot);
      }
    }
    active.clear();
    for (const [id, tool] of next) active.set(id, tool);
    const changed = fingerprint !== nextFingerprint;
    fingerprint = nextFingerprint;
    return changed;
  };
}

/** Refreshes skills before a daemon request reaches discovery/execution; failed reads fail closed. */
export function createSkillRefreshMiddleware(input: { registry: SkillsRefreshRegistry; onChanged: () => void }) {
  return async (_req: unknown, _res: unknown, next: (error?: unknown) => void): Promise<void> => {
    try {
      if (await input.registry.refreshInstalledSkills?.()) input.onChanged();
      next();
    } catch (error) { next(error); }
  };
}
