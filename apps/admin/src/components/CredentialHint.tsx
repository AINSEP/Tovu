import type { CredentialTokenHint } from "@jini-ai/core/contracts/site/secrets-credential-token";
import { useCredentialHint } from '@/hooks/use-credential-hint.hooks';

export function CredentialHint({ hint,
  useCredentialHintHook = useCredentialHint }: { hint?: CredentialTokenHint | null;
  useCredentialHintHook?: typeof useCredentialHint; }) {
  const text = useCredentialHintHook({ hint });
  return <span className="credential-token-hint" translate="no">{text}</span>;
}
