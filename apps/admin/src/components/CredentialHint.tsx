import type { CredentialTokenHint } from '@jini-ai/platform/secrets/credential-token';
import { useCredentialHint } from '@/hooks/use-credential-hint.hooks';

export function CredentialHint({ hint }: { hint?: CredentialTokenHint | null }) {
  const text = useCredentialHint({ hint });
  return <span className="credential-token-hint" translate="no">{text}</span>;
}
