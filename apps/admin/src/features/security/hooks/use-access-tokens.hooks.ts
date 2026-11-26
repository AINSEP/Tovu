import { bindAccessTokens } from "@jini-ai/admin/security/host/hooks/use-access-tokens.hooks";
import { buildCredentialConnectionInput, requiredFieldsFilled, withPromotedDefault, PUBLISH_CREDENTIAL_ROW_LABEL } from "@jini-ai/devops/deploy/react/rules";
import { buildSourceControlConnectionInput, sourceControlProviderInfoFromDescriptor, SOURCE_CONTROL_CREDENTIAL_ROW_LABEL } from "@jini-ai/devops/source-control/react/rules";
import { translateCredentialMessage } from "@tovu/contracts/credential-copy";
import { credentialDraftError } from "@/lib/credential-copy";
import { suggestCredentialWorksFor } from "@jini-ai/platform/secrets/credential-sets/contracts";
import { localizePublishTargets, localizeSourceControlProviders } from "@jini-ai/admin/shell/lib/descriptor-i18n";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { useSettlementGeneration } from "@jini-ai/ui/panel-kit";
import { accessTokenExistingRowReadyToSave, accessTokenRowReadyToSave, buildAccessTokenConnectionInput, buildAccessTokenUpdatePatch, classifyAccessTokenSubmitError } from "@jini-ai/integrations/react/credentials/access-token-forms";
import { ApiError, describeApiError } from "@/lib/admin-http/request";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { tSecurity as defaultT } from "../../../lib/i18n-common";
import { ACCESS_TOKENS_RESOURCE, ACCESS_TOKEN_CATEGORIES } from "../rules";
import { ACCESS_TOKEN_PROVIDER_COPY } from "../access-token-copy";
import { defaultAccessTokensPort } from "./access-tokens-dependencies.hooks";

export const useWiredAccessTokens = bindAccessTokens({
  port: defaultAccessTokensPort,
  hooks: { useLocaleHook: useAdminLocale, useFetchQuery, useSettlementGeneration, useContentRefreshSubscription },
  deps: {
    defaultT,
    ACCESS_TOKENS_RESOURCE, ACCESS_TOKEN_CATEGORIES, ACCESS_TOKEN_PROVIDER_COPY,
    LEGACY_SENTINEL_LABELS: { publish: PUBLISH_CREDENTIAL_ROW_LABEL, "source-control": SOURCE_CONTROL_CREDENTIAL_ROW_LABEL },
    localizePublishTargets, localizeSourceControlProviders, credentialDraftError, describeApiError,
    isApiError: (error): error is ApiError => error instanceof ApiError,
    translateCredentialMessage, requiredFieldsFilled, suggestCredentialWorksFor, sourceControlProviderInfoFromDescriptor,
    buildCredentialConnectionInput, buildSourceControlConnectionInput, accessTokenRowReadyToSave,
    accessTokenExistingRowReadyToSave, buildAccessTokenConnectionInput, buildAccessTokenUpdatePatch,
    classifyAccessTokenSubmitError, withPromotedDefault,
  },
});
