import { bindPublishContentConfirm } from "@jini-ai/cms/react/publish-content/hooks/use-publish-content-confirm.hooks";
import { applyPublishCriteria, preparePublishConfirmation, toPublishReportRows, publishEntityTypePluralLabel, publishSectionForEntityTypes } from "@tovu/publish-content-ui";
import { describeApiError } from "@/lib/admin-http/request";
import { useWiredAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { defaultPublishContentPort } from "./publish-content-dependencies.hooks";
import { publishScopeDescriptionKey, publishScopeTitleKey } from "@jini-ai/admin/publish-content/screen/publish-scope";

export const usePublishContentConfirm = bindPublishContentConfirm({
  port: defaultPublishContentPort,
  hooks: { useLocaleHook: useWiredAdminLocale },
  deps: {
    applyPublishCriteria,
    preparePublishConfirmation,
    toPublishReportRows,
    publishEntityTypePluralLabel,
    publishSectionForEntityTypes,
    publishScopeDescriptionKey,
    publishScopeTitleKey,
    describeApiError,
    now: () => performance.now(),
    overwriteUnavailableKey: "is on an older Tovu and can't overwrite these yet. Update it, then publish again.",
  },
});
