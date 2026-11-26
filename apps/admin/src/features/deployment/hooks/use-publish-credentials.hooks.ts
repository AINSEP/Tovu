import { bindPublishCredentials } from "@jini-ai/devops/deploy/react/hooks/use-publish-credentials.hooks";
import { classifyCredentialSubmitError } from "../../../lib/shell-collaborators";
import { translateCredentialMessage } from "@tovu/contracts/credential-copy";
import { credentialDraftError } from "@/lib/credential-copy";
import { describeApiError } from "@/lib/admin-http/request";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as defaultT } from "../deployment-host-i18n";
import { publishCredentialSaveErrorMessage, publishCredentialsLoadErrorMessage, publishCredentialSelectErrorMessage, publishCredentialVerifyErrorMessage } from "@jini-ai/admin/deployment/deployment-i18n";
import { defaultPublishCredentialsPort } from "./publish-credentials-dependencies.hooks";

export const useWiredPublishCredentials = bindPublishCredentials({
  hooks: { useLocaleHook: useAdminLocale, useFetchQuery },
  deps: {
    port: defaultPublishCredentialsPort, translate: defaultT,
    classifyCredentialSubmitError, translateCredentialMessage, credentialDraftError, describeApiError,
    publishCredentialSaveErrorMessage, publishCredentialsLoadErrorMessage, publishCredentialSelectErrorMessage, publishCredentialVerifyErrorMessage,
  },
});
