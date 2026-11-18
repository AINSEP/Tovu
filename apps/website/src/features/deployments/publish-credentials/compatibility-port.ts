import type { PublishCompatibilityPort } from "../../custom-credentials/publish-compatibility-port.js";
import type { DeployTargetRegistry } from "../contracts.js";
import { invalidatePublishCredentialCompatibility } from "./store.js";

/** The two optional host values the invalidation has always read. Read at call time, never at bind time. */
export interface PublishCompatibilitySource {
  readonly loadDeployTargets?: (required: { workspaceId: string }, optional?: Record<string, never>) => Promise<DeployTargetRegistry>;
  readonly publishCredentialVerificationCache?: { delete(input: { workspaceId: string; target: string }): void };
}

/**
 * Binds the port `custom-credentials` declares over the invalidation this feature owns. `required.source` is read inside
 * `prepareInvalidation`, never when the port is bound: the composition roots bind from inside the literal that builds the
 * source, which is not readable yet. No `catch`: a rejected registry load propagates to the save, as before.
 * @complexity O(1) to bind; one registry load per credential write when both values are present.
 */
export function bindPublishCompatibility(required: { readonly source: PublishCompatibilitySource }, _optional: Record<string, never> = {}): PublishCompatibilityPort {
  return { prepareInvalidation: async ({ workspaceId }) => {
    const source = required.source;
    const registry = source.loadDeployTargets && source.publishCredentialVerificationCache ? await source.loadDeployTargets({ workspaceId }) : undefined;
    return ({ after }) => {
      if (registry && source.publishCredentialVerificationCache) invalidatePublishCredentialCompatibility({ workspaceId, registry, cache: source.publishCredentialVerificationCache, after });
    };
  } };
}
