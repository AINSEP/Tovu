import type { CredentialTokenHint } from '@/lib/credential-copy';
import { useCredentialHint } from '@/hooks/use-credential-hint.hooks';

export function CredentialHint({ hint,
  useCredentialHintHook = useCredentialHint }: { hint?: CredentialTokenHint | null;
  useCredentialHintHook?: typeof useCredentialHint; }) {
  const text = useCredentialHintHook({ hint });
  return <span className="credential-token-hint" translate="no">{text}</span>;
}
