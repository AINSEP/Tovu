import { createLiveSkillRegistration as createRegistration, createSkillRefreshMiddleware as createMiddleware, type SkillRegistryPort } from "@jini-ai/agentic/skills/install";
import { ToolInputError, type ToolRegistry, type ToolRegistration } from "@jini-ai/core";

/** Optional port attached by the skills registrar. Consumers need no feature imports. */
export type SkillsRefreshRegistry = ToolRegistry & { refreshInstalledSkills?: () => Promise<boolean> };

/**
 * Keeps skill slots on the core's append-only registry, while their active registrations change.
 * Removed slots deny both authorization and execution; the registry identity remains intact.
 * @complexity O(n) per replacement, O(total distinct skill ids) retained slots.
 */
export function createLiveSkillRegistration(registry: ToolRegistry): (tools: readonly ToolRegistration[]) => boolean {
  type Frame = { authorization?: Parameters<ToolRegistration["policy"]["authorize"]>[0]; execution?: Parameters<ToolRegistration["handler"]>[0]; options?: Parameters<ToolRegistration["handler"]>[1] };
  const has = registry.has.bind(registry);
  const list = registry.list.bind(registry);
  const adapter: SkillRegistryPort<ToolRegistration["descriptor"], Frame> = {
    list: required => [...list(required)],
    has: ({ id }) => has({ toolId: id }),
    register: ({ tool }) => registry.register({ descriptor: tool.descriptor,
      policy: { authorize: context => tool.policy.authorize({ context: { authorization: context } }) as ReturnType<ToolRegistration["policy"]["authorize"]> },
      handler: (context, optional = {}) => tool.handler({ context: { execution: context, options: optional } }) as ReturnType<ToolRegistration["handler"]>,
    }),
  };
  const replace = createRegistration({ registry: adapter, inactiveError: () => new ToolInputError({ message: "This skill is no longer enabled or installed. Choose an installed skill." }) });
  registry.list = required => adapter.list(required);
  registry.has = ({ toolId }) => adapter.has({ id: toolId });
  return tools => replace({ tools: tools.map(tool => ({ descriptor: tool.descriptor,
    policy: { authorize: ({ context }) => tool.policy.authorize(context.authorization!) },
    handler: ({ context }) => tool.handler(context.execution!, context.options),
  })) });
}

/** Refreshes skills before a daemon request reaches discovery/execution; failed reads fail closed. */
export function createSkillRefreshMiddleware(input: { registry: SkillsRefreshRegistry; onChanged: () => void }) {
  const middleware = createMiddleware({ registry: { refreshInstalledSkills: () => input.registry.refreshInstalledSkills?.() ?? Promise.resolve(false) } }, { onChanged: input.onChanged });
  return async (_req: unknown, _res: unknown, next: (error?: unknown) => void): Promise<void> => {
    await middleware({ next: (_required, optional) => next(optional?.error) });
  };
}
