import { createRevertRegistry as createRegistry, type RevertRegistry } from "@jini-ai/cms/core/commands";
export type { EntityReverter, RevertRegistry } from "@jini-ai/cms/core/commands";

export function createRevertRegistry(): RevertRegistry {
  return createRegistry({}, {});
}
