import type { CredentialTokenHint } from "@jini-ai/core/contracts/site/secrets-credential-token";
import { useCredentialHint } from "@jini-ai/admin/shell/hooks/use-credential-hint.hooks";
import { formatCredentialHint } from "@tovu/contracts/credential-copy";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

export function CredentialHint({ hint,
  useCredentialHintHook = useCredentialHint }: { hint?: CredentialTokenHint | null;
  useCredentialHintHook?: typeof useCredentialHint; }) {
  const text = useCredentialHintHook({ hint, formatCredentialHint, useAdminLocale });
  return <span className="credential-token-hint" translate="no">{text}</span>;
}
