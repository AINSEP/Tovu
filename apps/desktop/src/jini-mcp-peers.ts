/** Checks the production peers required by Tovu's packaged jini-mcp bridge. */

/**
 * Returns required peers absent from the manifest's own production dependencies, in input order.
 * Optional peers are not installed automatically, so dev/transitive dependencies cannot satisfy
 * this packaging contract.
 */
export function missingBridgePeers(
  { manifest, required }: {
    readonly manifest: { readonly dependencies?: Readonly<Record<string, string>> };
    readonly required: readonly string[];
  },
): string[] {
  const dependencies = manifest.dependencies ?? {};
  return required.filter((peer) => !Object.hasOwn(dependencies, peer));
}
