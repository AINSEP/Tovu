import type { PublishTrustRevocationPort, RevocationRead } from "#src/features/publish-trust/revocations";
import type { PublishTrustRevocationSource } from "#src/server/inbound/admin-http/publish-trust-auth";

/**
 * @file Zero-setup publishing auth — where the destination's DISCONNECTED computers live at run time.
 *
 * The composition-root narrow view of the database-backed deny store. The store itself is built
 * over the already-opened, migrated site `content.db`; there is no file path or environment
 * override that can land in an ephemeral deployment image.
 */

/**
 * Narrows a deny store to the read the request gate is allowed to do.
 *
 * Two jobs, both security-shaped:
 *
 * - **Least authority.** The gate receives `list` and nothing else, so no request path holds a
 *   handle that can `revoke` or `restore` the very list it is being judged against.
 * - **Never throws.** A database read outage is converted into `ok: false`, which
 *   `admitPublish` turns into a refusal instead of letting the auth path become a 500.
 *
 * Deliberately NOT cached. A disconnect has to take effect on the next request, which is the whole
 * reason the deny store exists beside the deploy-time grant config; a cache would push it out to
 * the next restart.
 *
 * @complexity O(n) in the record count per call — one small database read, bounded by
 * `MAX_REVOCATIONS`.
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
