import type { CredentialTokenHint } from '@/lib/credential-copy';
import { useCredentialHint } from '@/hooks/use-credential-hint.hooks';

export function CredentialHint({ hint }: { hint?: CredentialTokenHint | null }) {
  const text = useCredentialHint({ hint });
  return <span className="credential-token-hint" translate="no">{text}</span>;
}
