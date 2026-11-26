import { bindExternalMcp } from "@jini-ai/mcp/react/external-mcp/hooks/use-external-mcp.hooks";
import { credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from "@tovu/contracts/credential-copy";
import { credentialDraftError } from "@/lib/credential-copy";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import { describeApiError } from "@/lib/admin-http/request";
import { VERSION_CONFLICT_MESSAGE } from "@jini-ai/admin/shell/lib/version-conflict";
import { isVersionConflict } from "@/lib/shell-collaborators";
import { useSerialWrites } from "@jini-ai/ui/panel-kit";
import { t as tExternalMcp } from "@jini-ai/admin/screens/settings/external-mcp-i18n";
import { mergeSourceUpdate, resolveExternalMcpEffectiveAuthMode, resolveExternalMcpEffectiveTransport, validateExternalMcpOAuthIdentity } from "@jini-ai/admin/screens/settings/rules";

export const useExternalMcp = bindExternalMcp({
  hooks: { useAdminLocaleHook: useAdminLocale, useSerialWrites },
  deps: {
    port: integrationsApi, credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage,
    credentialDraftError, describeApiError, VERSION_CONFLICT_MESSAGE, isVersionConflict, translate: tExternalMcp,
    mergeSourceUpdate, resolveExternalMcpEffectiveAuthMode, resolveExternalMcpEffectiveTransport,
    validateExternalMcpOAuthIdentity, now: Date.now,
  },
});
