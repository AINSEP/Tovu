import { useAdminLocale } from './use-admin-locale.hooks';
import { formatCredentialHint, storedCredentialHint, type CredentialTokenHint } from '@/lib/credential-copy';

/** Formats only the server-derived safe hint; the browser never has a stored token to inspect. */
export function useCredentialHint({ hint }: { hint?: CredentialTokenHint | null }, _optional = {}): string {
  const locale = useAdminLocale();
  return formatCredentialHint({ hint, locale });
}

export function useStoredCredentialHint(required: Parameters<typeof storedCredentialHint>[0], _optional = {}): string | undefined {
  const locale = useAdminLocale();
  return storedCredentialHint(required, { locale });
}
