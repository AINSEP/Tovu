import type { ArtifactStorePort } from "@jini-ai/devops/deploy";

import type { DeployTargetCredential } from "../deployments/deploy-targets/types.js";

import type { LoadedObjectStoreRegistry } from "./registry.js";

/**
 * @file Which object-store provider delivers backup shares: any registered provider that can also
 * hand out a single-object artifact store (today the bundled `s3_compatible`), instead of one
 * hard-coded deploy target id. The site's media choice wins when it qualifies, so media and shares
 * use one provider (and one saved connection); otherwise the first qualifying one in registry order.
 * A provider qualifies only once its saved connection resolves, so an installed but unconnected
 * store never hides a connected one behind it.
 */

/** A provider's artifact capability as the share path calls it (the deploy-target module ABI). */
export interface ArtifactStoreCapable {
  createArtifactStore(required: { readonly credential: DeployTargetCredential; readonly config: Record<string, never>; readonly kit: unknown }): ArtifactStorePort & {
    /** Non-secret identity of the backing store, when the provider knows it better than the host does. */
    readonly binding?: string;
  };
}

/**
 * @param required.resolveCredential The provider's saved connection, or `undefined` when it has none.
 * @returns The first capable provider (preferred first, then registry order) whose connection
 *   resolves, with that credential; `undefined` when none qualifies.
 * @complexity O(n) registered providers, one credential lookup per capable provider until a hit.
 */
export async function selectArtifactStoreProvider<C>(
  required: { readonly loaded: LoadedObjectStoreRegistry; readonly preferredId: string; readonly resolveCredential: (required: { readonly id: string }) => Promise<C | undefined> },
  _optional: Record<string, never> = {}
): Promise<{ readonly id: string; readonly provider: ArtifactStoreCapable; readonly credential: C } | undefined> {
  const capable = required.loaded.registry.list().filter((entry) => typeof (entry.provider as Partial<ArtifactStoreCapable>).createArtifactStore === "function");
  const ordered = [...capable.filter((entry) => entry.id === required.preferredId), ...capable.filter((entry) => entry.id !== required.preferredId)];
  for (const entry of ordered) {
    const credential = await required.resolveCredential({ id: entry.id });
    if (credential !== undefined) return { id: entry.id, provider: entry.provider as unknown as ArtifactStoreCapable, credential };
  }
  return undefined;
}
