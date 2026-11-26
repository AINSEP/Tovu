import { bindStaticExport } from "@jini-ai/devops/deploy/react/hooks/use-static-export.hooks";

import { describeApiError } from "@/lib/admin-http/request";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { t as defaultT } from "../deployment-host-i18n";
import { exportLoadErrorMessage, exportPollErrorMessage, exportTriggerErrorMessage } from "@jini-ai/admin/deployment/deployment-i18n";

import { defaultStaticExportPort } from "./static-export-dependencies.hooks";

export const useWiredStaticExport = bindStaticExport({
  hooks: { useLocaleHook: useAdminLocale, useFetchQuery, useContentRefreshSubscription },
  deps: {
    port: defaultStaticExportPort, translate: defaultT, describeApiError,
    exportLoadErrorMessage, exportPollErrorMessage, exportTriggerErrorMessage,
    setTimeout, clearTimeout,
  },
});
