import { ToolInputError } from '@jini-ai/core';
import type { KeyringPort, SecretSealerPort } from '../webhooks/index.js';

/** Credential services need an active handle for human saves, never owner key derivation.
 * @returns A handle-only keyring; every derivation fails without reaching the owner keyring.
 * @complexity O(1), no database I/O.
 */
export function ownerKeyHandleOnly({ keyring }: { keyring: KeyringPort }, _options = {}): KeyringPort {
  const refuse = async (): Promise<never> => { throw new ToolInputError({ message: 'Owner key derivation is private to Shared Keys. Use the saved credential through its site grant.' }); };
  return { activeKey: () => keyring.activeKey(), derive: refuse, deriveSigningSecret: refuse };
}

/** Extract only the selected identity from Jini's frozen vault AAD; the full AAD is compared below. */
function selectedIdentity({ aad }: { aad: string | undefined }): { workspaceId: string; id: string } {
  const prefix = 'secrets-vault:v1:';
  if (!aad?.startsWith(prefix)) throw refused();
  let value: unknown;
  try { value = JSON.parse(aad.slice(prefix.length)); } catch { throw refused(); }
  if (!isOwnerKeyIdentity(value)) throw refused();
  return { workspaceId: value[0], id: value[1] };
}

/** Only API-key AAD under the fixed owner scope can reach the owner's crypto service. */
function isOwnerKeyIdentity(value: unknown): value is [string, string, string, string, null, null] {
  if (!Array.isArray(value) || value.length !== 6) return false;
  if (value[0] !== 'project' || typeof value[1] !== 'string') return false;
  return ownerKeyScope(value);
}

function ownerKeyScope(value: unknown[]): boolean {
  return typeof value[2] === 'string' && ['vendor', 'custom', 'source-control'].includes(value[2])
    && value[3] === 'tovu' && value[4] === null && value[5] === null;
}

function refused(): ToolInputError {
  return new ToolInputError({ message: 'This site no longer has access to this saved key. Open Use a saved key to approve access again.' });
}

/** Keep crypto inside the owner boundary and recheck the site grant before and after each open.
 * A caller retaining an envelope cannot decrypt it after revoke. Jini authenticates the full AAD;
 * no envelope inventory or additional owner-row hydration is needed for this authorization check.
 * @returns A site-fenced sealer; human saves still seal through the trusted owner service.
 * @complexity O(1) indexed grant/reference reads plus O(ciphertext bytes) crypto.
 */
export function siteGrantedSealer({ allowed, sealer }: {
  allowed: (input: { credentialId: string }) => Promise<boolean>; sealer: SecretSealerPort;
}, _options = {}): SecretSealerPort {
  return {
    seal: ({ plaintext, key, aad }) => sealer.seal({ plaintext, key, aad }),
    open: async (input, options = {}) => {
      const identity = selectedIdentity({ aad: options.aad });
      const access = { credentialId: identity.id };
      if (!await allowed(access)) throw refused();
      const plaintext = await sealer.open(input, options);
      if (!await allowed(access)) throw refused();
      return plaintext;
    },
  };
}
