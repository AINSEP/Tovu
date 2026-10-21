/** Tovu credential copy is shared with the server cards; every offered locale has translations. */
export { credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from '../../../website/src/contracts/core/credential-copy.js';
export { assertCredentialToken, CredentialInputError, CREDENTIAL_MESSAGES } from '../../../website/src/contracts/core/credential-token.js';
export type { CredentialTokenHint } from '../../../website/src/contracts/core/credential-token.js';

import { assertCredentialToken, CredentialInputError, type CredentialTokenHint } from '../../../website/src/contracts/core/credential-token.js';
import { translateCredentialMessage, formatCredentialHint } from '../../../website/src/contracts/core/credential-copy.js';

/** Only server-derived metadata describes a stored key. A legacy server may still send a mask. */
export function storedCredentialHint(
  { stored, storedKeyIsForOtherEndpoint = false }: { stored: { isSet: boolean; masked: string | null; tokenHint?: CredentialTokenHint | null } | null; storedKeyIsForOtherEndpoint?: boolean },
  { locale = 'en' }: { locale?: string } = {},
): string | undefined {
  if (storedKeyIsForOtherEndpoint || !stored?.isSet) return undefined;
  return formatCredentialHint({ hint: stored.tokenHint, locale }) || stored.masked || undefined;
}

/** Preserve the draft bytes; an exact blank update keeps the saved secret. Only the token
 *  validator's own `CredentialInputError` becomes display copy; any other failure is rethrown so an
 *  unknown exception never gains display permission. `assertToken` defaults to the shared validator. */
export function credentialDraftError(
  { value }: { value: string },
  { locale = 'en', required = false, assertToken = assertCredentialToken }: { locale?: string; required?: boolean; assertToken?: (required: { value: string }) => void } = {},
): string | null {
  if (value === '' && !required) return null;
  try { assertToken({ value }); return null; }
  catch (error) { if (error instanceof CredentialInputError) return translateCredentialMessage({ message: error.message, locale }); throw error; }
}
