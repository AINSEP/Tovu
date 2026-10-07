import { useAdminLocale } from './use-admin-locale.hooks';
import { formatCredentialHint, type CredentialTokenHint } from '@/lib/credential-copy';

/** Formats only the server-derived safe hint; the browser never has a stored token to inspect. */
export function useCredentialHint({ hint }: { hint?: CredentialTokenHint | null }, _optional = {}): string {
  const locale = useAdminLocale();
  return formatCredentialHint({ hint, locale });
}
