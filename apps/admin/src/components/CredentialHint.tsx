import type { CredentialTokenHint } from '@/lib/credential-copy';
import { useCredentialHint } from '@/hooks/use-credential-hint.hooks';

export function CredentialHint({ useCredentialHint: useCredentialHintHook = useCredentialHint, hint }: { useCredentialHint?: typeof useCredentialHint; hint?: CredentialTokenHint | null }) {
  const text = useCredentialHintHook({ hint });
  return <span className="credential-token-hint" translate="no">{text}</span>;
}
