import { bindEditMediaPanel } from "@jini-ai/admin/screens/media/hooks/use-edit-media-panel.hooks";
import { parseMediaHtmlAttributes } from "@jini-ai/admin/media";
import { embedMarkerSnippet } from "@jini-ai/cms/widgets/markers";
import { describeApiError } from "@/lib/admin-http/request";
import { useFetchMutation, useFetchQuery } from "@jini-ai/ui/fetch-query";
import { embedPolicy } from "../../../integrations/jini-admin/embed-policy-ports";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../media-i18n";
import { defaultMediaPort } from "./media-dependencies.hooks";

export const useWiredEditMediaPanel = bindEditMediaPanel({
  hooks: { useLocaleHook: useAdminLocale, useFetchMutation, useFetchQuery },
  deps: {
    port: defaultMediaPort, translate, describeApiError, embedMarkerSnippet, embedPolicy, parseMediaHtmlAttributes,
    writeText: (value: string) => navigator.clipboard.writeText(value), setTimeout,
  },
});
