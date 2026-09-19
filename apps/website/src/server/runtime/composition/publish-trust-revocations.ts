import { join } from "node:path";

import { nodeProvisioningFileIo } from "#src/features/publish-trust/provisioning.node-io";
import {
  createFileRevocations,
  type PublishTrustRevocationPort,
  type RevocationRead,
} from "#src/features/publish-trust/revocations";
import type { PublishTrustRevocationSource } from "#src/server/inbound/admin-http/publish-trust-auth";
import { resolveSiteRoot } from "#src/platform/site-dir/site-root";

/**
 * @file Zero-setup publishing auth — where the destination's DISCONNECTED computers live at run time.
 *
 * The composition-root half of `features/publish-trust/revocations.ts`, and the sibling of
 * `publish-trust-grants.ts`: that module owns every parse and the admission rule and is pure, this
 * one decides where the file is and performs the I/O.
 *
 * WHY THIS FILE EXISTS AT ALL rather than a path constant in the feature: the path is load-bearing
 * and `revocations.ts` refuses to guess it. A deny list written inside the deployed image is erased
 * by the next deploy, silently reconnecting a computer the owner disconnected, so the file has to
 * sit on the destination's PERSISTENT VOLUME. This repo's volume is the site folder — Fly mounts it
 * at `[[mounts]] destination = "/workspace/Tovu/sites"` — which is what makes
 * {@link resolveSiteRoot} the right default and not merely a convenient one.
 *
 * Grants and denials are read on opposite schedules, on purpose. Grants are deploy config that
 * cannot change under a running process, so `publish-trust-grants.ts` reads them once. Denials are
 * written BY this process, so they are read on every publishing request — see
 * {@link createPublishTrustRevocationReader}.
 */

/** Relocates the deny list on its own, following this repo's per-subpath `TOVU_*` override
 *  convention (`platform/site-dir/site-root.ts`). It exists for a deployment whose persistent
 *  volume is not the site folder, which otherwise has no way to say so — and for which the default
 *  would be a file inside the image that every deploy quietly wipes. */
export const PUBLISH_TRUST_REVOCATIONS_ENV_VAR = "TOVU_PUBLISH_TRUST_REVOCATIONS";

/** Sits beside the site's other runtime state. Named for what the owner did, not for the mechanism:
 *  whoever finds this file should be able to tell what it is. */
const REVOCATIONS_FILE_NAME = "publish-trust-disconnected.json";

/**
 * Absolute path of the file listing the computers the owner has disconnected.
 *
 * One resolver for readers and writers alike. That single-source property is also why an override
 * that is set but blank falls back to the default instead of resolving to an unusable path: reader
 * and writer would still agree, so the failure mode is "written somewhere the operator did not
 * intend" rather than "written where nobody reads it", and the latter is the one that silently
 * reconnects a disconnected computer.
 *
 * @param env - Environment to read the override from. Defaults to `process.env`.
 * @complexity O(1).
 */
export function publishTrustRevocationsPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[PUBLISH_TRUST_REVOCATIONS_ENV_VAR];
  if (override !== undefined && override.trim().length > 0) return override;
  return join(resolveSiteRoot({ env }), REVOCATIONS_FILE_NAME);
}

/**
 * Builds the read/write deny store over the real filesystem.
 *
 * @param options.path - Overrides {@link publishTrustRevocationsPath}; for callers that already
 *   resolved a site folder of their own.
 * @complexity O(1) to build; see `createFileRevocations` for the per-call cost.
 */
export function createPublishTrustRevocations(
  options: { readonly path?: string } = {}
): PublishTrustRevocationPort {
  return createFileRevocations({
    io: nodeProvisioningFileIo,
    path: options.path ?? publishTrustRevocationsPath(),
  });
}

/**
 * Narrows a deny store to the read the request gate is allowed to do.
 *
 * Two jobs, both security-shaped:
 *
 * - **Least authority.** The gate receives `list` and nothing else, so no request path holds a
 *   handle that can `revoke` or `restore` the very list it is being judged against.
 * - **Never throws.** `nodeProvisioningFileIo` raises on a present-but-unreadable file (a bad mode,
 *   a directory where a file belongs, a failing volume), and an exception on the authentication
 *   path would surface as a 500. Here that is worse than untidy: `admitPublish` treats a store it
 *   cannot read as "refuse everyone", and an uncaught throw would skip that decision entirely. The
 *   failure is converted into the `ok: false` the fail-closed contract is written against.
 *
 * Deliberately NOT cached. A disconnect has to take effect on the next request, which is the whole
 * reason the deny store exists beside the deploy-time grant config; a cache would push it out to
 * the next restart.
 *
 * @complexity O(n) in the record count per call — one file read, bounded by `MAX_REVOCATIONS`.
 */
export function createPublishTrustRevocationReader(
  port: PublishTrustRevocationPort
): PublishTrustRevocationSource {
  return async (): Promise<RevocationRead> => {
    try {
      return await port.list();
    } catch (error) {
      return {
        ok: false,
        reason: `the list of disconnected computers could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  };
}
