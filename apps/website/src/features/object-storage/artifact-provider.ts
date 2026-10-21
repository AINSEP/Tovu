import type { ArtifactStorePort } from "@jini-ai/devops/deploy";

import type { DeployTargetCredential } from "../deployments/deploy-targets/types.js";

import type { LoadedObjectStoreRegistry } from "./registry.js";

/**
 * @file Which object-store provider delivers backup shares: any registered provider that can also
 * hand out a single-object artifact store (today the bundled `s3_compatible`), instead of one
 * hard-coded deploy target id. The site's media choice wins when it qualifies, so media and shares
 * use one provider (and one saved connection); otherwise the first qualifying one in registry order.
 */

/** A provider's artifact capability as the share path calls it (the deploy-target module ABI). */
export interface ArtifactStoreCapable {
  createArtifactStore(required: { readonly credential: DeployTargetCredential; readonly config: Record<string, never>; readonly kit: unknown }): ArtifactStorePort;
}

/**
 * @returns The chosen provider id and its artifact capability, or `undefined` when none qualifies.
 * @complexity O(n) registered providers.
 */
export function selectArtifactStoreProvider(
  required: { readonly loaded: LoadedObjectStoreRegistry; readonly preferredId: string },
  _optional: Record<string, never> = {}
): { readonly id: string; readonly provider: ArtifactStoreCapable } | undefined {
  const capable = required.loaded.registry.list().filter((entry) => typeof (entry.provider as Partial<ArtifactStoreCapable>).createArtifactStore === "function");
  const chosen = capable.find((entry) => entry.id === required.preferredId) ?? capable[0];
  return chosen ? { id: chosen.id, provider: chosen.provider as unknown as ArtifactStoreCapable } : undefined;
}
