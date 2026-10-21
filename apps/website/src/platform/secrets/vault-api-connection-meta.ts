import { parseOAuthTokenVaultMeta } from "@jini-ai/integrations/api-connections";
import { VaultError, type VaultMeta } from "@jini-ai/platform/secrets/credential-sets";

/** Tovu's row formats within the shared api-connection kind; OAuth remains owned by Jini. */
export const API_CONNECTION_RECORD_FORMAT = "api-connection-record";
export const API_CONNECTION_ATTEMPT_FORMAT = "api-connection-attempt";
/** Plugin settings rows (`plugin-state.ts`): plain JSON a plugin's admin surface saves, sealed like the rest. */
export const PLUGIN_STATE_FORMAT = "agent-plugin-state";

/** Token rows keep Jini's parser; record, settings and attempt rows carry only their format (and an attempt's expiry).
 * Called only for the api-connection kind, after recovery annotations have been validated and separated.
 * @returns Validated metadata; never changes stored data.
 * @throws VaultError invalid-meta for malformed host formats; Jini's OAuth error for invalid token metadata.
 * @complexity O(metadata size) time/space; no I/O.
 */
export function parseApiConnectionMeta({ meta }: { meta: VaultMeta }, _optional: Record<string, never> = {}): VaultMeta {
  const format = meta.credentialFormat;
  if (format === API_CONNECTION_RECORD_FORMAT || format === PLUGIN_STATE_FORMAT) {
    if (Object.keys(meta).length !== 1) throw new VaultError({ code: "invalid-meta" });
    return { credentialFormat: format };
  }
  if (format === API_CONNECTION_ATTEMPT_FORMAT) {
    if (Object.keys(meta).length !== 2 || !Number.isSafeInteger(meta.expiresAtMs)) throw new VaultError({ code: "invalid-meta" });
    return { credentialFormat: format, expiresAtMs: meta.expiresAtMs as number };
  }
  return parseOAuthTokenVaultMeta({ meta });
}
