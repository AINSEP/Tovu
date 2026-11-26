import { bindOtherCredentials } from "@jini-ai/admin/security/host/hooks/use-other-credentials.hooks";
import { formatCredentialHint, formatCredentialHints, translateCredentialMessage } from "@tovu/contracts/credential-copy";
import { credentialDraftError } from "@/lib/credential-copy";
import { describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { useSerialWrites } from "@jini-ai/ui/panel-kit";
import { tSecurity as defaultT } from "../../../lib/i18n-common";
import { accessTokensLoadErrorMessage, accessTokenSaveErrorMessage } from "@jini-ai/admin/security/security-i18n";
import { OTHER_CREDENTIAL_STORES } from "../other-credential-stores";
import { envNamesFact, maskedTailFact, mediaProviderCatalogFrom, mediaProviderLabel, otherCredentialMatchesQuery } from "@jini-ai/integrations/react/credentials/other-credential-stores";
import { ACCESS_TOKENS_RESOURCE } from "../rules";
import { defaultOtherCredentialsPort } from "./other-credentials-dependencies.hooks";

export const useWiredOtherCredentials = bindOtherCredentials({
  hooks: { useLocaleHook: useAdminLocale, useSerialWrites, useContentRefreshSubscription },
  deps: {
    port: defaultOtherCredentialsPort, translate: defaultT,
    stores: OTHER_CREDENTIAL_STORES, resource: ACCESS_TOKENS_RESOURCE,
    formatCredentialHint, formatCredentialHints, translateCredentialMessage, credentialDraftError,
    envNamesFact, maskedTailFact, mediaProviderCatalogFrom, mediaProviderLabel, otherCredentialMatchesQuery,
    describeApiError, accessTokensLoadErrorMessage, accessTokenSaveErrorMessage,
  },
});
