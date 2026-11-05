import { type SecretSealerPort } from "@jini-ai/platform/secrets";
import { SiteShareRefusal } from "./share-policy.js";
import type { SiteSavedKeysPort } from "./saved-keys-port.js";

export interface SiteSavedKeysDeps {
  workspaceId: string;
  sealer: SecretSealerPort;
}
/** Authenticate both registry identity dimensions so rows cannot be swapped between exports. */
function passwordAad({ shareId, workspaceId }: { shareId: string; workspaceId: string }): string {
  // Tuple encoding cannot alias IDs containing separators, and the domain prevents vault reuse.
  return JSON.stringify(["tovu-share-password", 1, workspaceId, shareId]);
}
/** The retired transport validated the complete bounded payload before opening a recipient,
 * used host-owned definitions instead of archive-supplied schemas, and committed settings/keys
 * together. Even that cannot authorize a new site: both capture and automatic restore are closed.
 */
/** CMS compatibility boundary for historical exports, which used 24 random password bytes and
 * a site-sealed password. New exports cannot capture credentials; imports require fresh grants.
 * @returns Refusal/notice for retired operations and owner-only reveal for historical exports.
 * @complexity O(1), except opening one historical sealed password.
 */
export function createSiteSavedKeys(deps: SiteSavedKeysDeps, _options: Record<string, never> = {}): SiteSavedKeysPort {
  return {
    async capture() {
      throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Exports no longer include saved keys. Grant saved keys separately on the imported site. Details: P25_SAVED_KEYS_EXPORT_REMOVED; secret values omitted." });
    },
    async reveal(input) {
      if (input.workspaceId !== deps.workspaceId) throw new Error("Saved keys workspace mismatch");
      return { password: await deps.sealer.open({ sealed: input.sealedPassword }, { aad: passwordAad(input) }) };
    },
    async restore(_input, options = {}) {
      options.signal?.throwIfAborted();
      // An imported site never inherits authority from a portable key payload or reference.
      return { notices: ["Saved keys were left out. Use a saved key to approve fresh access on the imported site."] };
    },
  };
}
