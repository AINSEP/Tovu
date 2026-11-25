/** Tovu credential copy is shared with the server cards; every offered locale has translations. */

import { assertCredentialToken, CredentialInputError } from '@jini-ai/platform/secrets/credential-token';
import { credentialDraftError as jiniCredentialDraftError } from '@jini-ai/admin/security';
import { storedCredentialHint as jiniStoredCredentialHint } from '@jini-ai/integrations/react/credentials/credential-copy';
import type { CredentialTokenHint } from "@jini-ai/core/contracts/site/secrets-credential-token";
import { translateCredentialMessage, formatCredentialHint } from '@tovu/contracts/credential-copy';

/** Only server-derived metadata describes a stored key. A legacy server may still send a mask.
 *  Binds Jini's hint rule to Tovu's localized hint formatter. */
export function storedCredentialHint(
  { stored, storedKeyIsForOtherEndpoint = false }: { stored: { isSet: boolean; masked: string | null; tokenHint?: CredentialTokenHint | null } | null; storedKeyIsForOtherEndpoint?: boolean },
  { locale = 'en' }: { locale?: string } = {},
): string | undefined {
  return jiniStoredCredentialHint({ stored, storedKeyIsForOtherEndpoint, formatHint: ({ hint, locale: hintLocale }) => formatCredentialHint({ hint, locale: hintLocale }) }, { locale });
}

/** Preserve the draft bytes; an exact blank update keeps the saved secret. Only the token
 *  validator's own `CredentialInputError` becomes display copy; any other failure is rethrown so an
 *  unknown exception never gains display permission. `assertToken` defaults to the shared validator. */
export function credentialDraftError(
  { value }: { value: string },
  { locale = 'en', required = false, assertToken = assertCredentialToken }: { locale?: string; required?: boolean; assertToken?: (required: { value: string }) => void } = {},
): string | null {
  return jiniCredentialDraftError({
    value,
    assertToken: ({ value: draft }) => assertToken({ value: draft }),
    describeInputError: ({ error }) => error instanceof CredentialInputError ? translateCredentialMessage({ message: error.message, locale }) : undefined,
  }, { required });
}
