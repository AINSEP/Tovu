import { createRevertRegistry as createRegistry } from "@jini-ai/cms/core/commands";
import type { RevertRegistry } from "@jini-ai/core/contracts/site/core-commands";
export type { EntityReverter, RevertRegistry } from "@jini-ai/core/contracts/site/core-commands";

export function createRevertRegistry(): RevertRegistry {
  return createRegistry({}, {});
}
