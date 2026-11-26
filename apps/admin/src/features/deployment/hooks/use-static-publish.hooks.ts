import { bindStaticPublish } from "@jini-ai/devops/deploy/react/hooks/use-static-publish.hooks";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { describeApiError } from "@/lib/admin-http/request";
import { localizePublishTargets } from "@jini-ai/admin/shell/lib/descriptor-i18n";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as defaultT } from "../deployment-host-i18n";
import { publishLoadErrorMessage, publishPollErrorMessage, publishPreviewErrorMessage, publishTriggerErrorMessage } from "@jini-ai/admin/deployment/deployment-i18n";
import { defaultStaticPublishPort } from "./static-publish-dependencies.hooks";

export const useWiredStaticPublish = bindStaticPublish({
  hooks: { useLocaleHook: useAdminLocale, useFetchQuery },
  deps: {
    port: defaultStaticPublishPort, translate: defaultT, localizePublishTargets, describeApiError,
    publishLoadErrorMessage, publishPollErrorMessage, publishPreviewErrorMessage, publishTriggerErrorMessage,
    errorRedactionOptions: TOVU_ERROR_REDACTION_OPTIONS, setTimeout, clearTimeout,
  },
});
