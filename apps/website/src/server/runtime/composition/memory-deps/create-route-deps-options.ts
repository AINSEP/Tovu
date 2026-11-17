import type { RouteDeps } from "../../../routes/types.js";
import type { PublishContentSeedHashFn } from "#src/features/publish-content/seed-hash";

export interface CreateRouteDepsOptions {
  readonly publishContentPeerHttpClient?: RouteDeps["publishContentPeerHttpClient"];
  readonly nativeApprovalMemory?: RouteDeps["nativeApprovalMemory"];
  readonly approvalIdentityForRun?: RouteDeps["approvalIdentityForRun"];
  readonly pluginFailureThreshold?: number;
  /** Site-installed plugin scan root, threaded to `composePluginRuntime`'s `discoverPlugins()`
   * call (REQ-02). Omitted by default — this composition root is documented "hermetic, no
   * filesystem" (see file header) and every existing caller relies on that; passing a real
   * directory here is opt-in, for a caller that specifically wants to exercise site-plugin
   * discovery through this in-memory root instead of `apps/website/src/server/runtime/composition/deps.ts`'s SQLite one. */
  readonly installDir?: string;
  /** D1 — the seed-version lookup this instance plans and applies imports against. Omitted means
   *  this hermetic root ships no seed ({@link NO_PUBLISH_CONTENT_SEED_HASH}); a two-instance test
   *  passes a real `createPublishContentSeedHash()` over a third instance standing in for the seed. */
  readonly publishContentSeedHash?: PublishContentSeedHashFn;
}
