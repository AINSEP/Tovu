import type { VaultRecord } from '@jini-ai/platform/secrets/credential-sets';
import type { CredentialTokenHint } from '../contracts/core/credential-token.js';

/** Both assistant views expose presence and hints from the same vault snapshot. */
export function credentialViewFields({ record, tokenHint = null }: { record: VaultRecord | null; tokenHint?: CredentialTokenHint | null }, _options = {}) {
  return { isSet: record?.sealed != null, masked: tokenHint?.last4 ? `••••${tokenHint.last4}` : null,
    tokenHint, updatedAt: record?.updatedAt ?? null };
}

/** Omitted keys preserve envelopes; a new settings-only singleton has no payload. Jini still
 * owns preparation, sealing and CAS; these are the two feature adapters' shared input fields. */
export function credentialWriteFields({ existing, apiKey }: { existing: VaultRecord | null; apiKey: string | undefined }, _options = {}) {
  let payload: { apiKey: string } | null | undefined = existing ? undefined : null;
  if (apiKey !== undefined) payload = { apiKey };
  return { ...(existing ? { id: existing.id } : {}), expectedRevision: existing?.revision ?? null,
    label: existing?.label ?? '',
    payload,
    ...(apiKey === undefined ? {} : { hintToken: apiKey }) };
}
