/** Tovu credential copy is shared with the server cards; every offered locale has translations. */
export { credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from '../../../website/src/contracts/core/credential-copy.js';
export { assertCredentialToken, CredentialInputError, CREDENTIAL_MESSAGES } from '../../../website/src/contracts/core/credential-token.js';
export type { CredentialTokenHint } from '../../../website/src/contracts/core/credential-token.js';

import { assertCredentialToken, CredentialInputError } from '../../../website/src/contracts/core/credential-token.js';
import { translateCredentialMessage } from '../../../website/src/contracts/core/credential-copy.js';

/** Preserve the draft bytes; an exact blank update keeps the saved secret. */
export function credentialDraftError(
  { value }: { value: string },
  { locale = 'en', required = false }: { locale?: string; required?: boolean } = {},
): string | null {
  if (value === '' && !required) return null;
  try { assertCredentialToken({ value }); return null; }
  catch (error) { if (error instanceof CredentialInputError) return translateCredentialMessage({ message: error.message, locale }); throw error; }
}
