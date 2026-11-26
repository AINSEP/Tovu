import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import {
  useExistingInstances as useJiniExistingInstances,
  useWidgetPickerDialog as useJiniWidgetPickerDialog,
  useWidgetAddControl as useJiniWidgetAddControl,
} from "@jini-ai/cms/react/widgets/WidgetPickerDialog/WidgetPickerDialog.hooks";
import type { AdminWidgetType } from "@jini-ai/admin/screens/widgets/api/widgets-api.types";
import { widgetTypeLabel } from "@jini-ai/admin/widgets";
import { describeApiError } from "../../lib/admin-http/request";
import { DEFAULT_LOCALE } from "../../hooks/admin-locale-dependencies.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t as translateWidgets } from "../../features/widgets/widgets-i18n";
import { t as sharedComponentsT } from "@jini-ai/admin/shell/components/shared-components-i18n";
import { defaultWidgetConfig, WIDGET_TYPE_OPTIONS } from "../WidgetConfigFields/widget-config-host-policy";
import { defaultWidgetPickerPort } from "./widget-picker-dependencies.hooks";
import type { WidgetPickerPort } from "@jini-ai/admin/shell/components/WidgetPickerDialog/widget-picker-port.hooks";
import type { WidgetAddControlProps, WidgetPickerDialogProps } from "./WidgetPickerDialog";

export function useExistingInstances(
  { widgetType }: { widgetType: AdminWidgetType },
  { port = defaultWidgetPickerPort, locale = DEFAULT_LOCALE }: { port?: WidgetPickerPort; locale?: string } = {},
) {
  return useJiniExistingInstances({ widgetType, deps: { port, locale, useFetchQuery, describeApiError, sharedComponentsT } }, {});
}

export function useWidgetPickerDialog(props: WidgetPickerDialogProps,
  deps: { port?: WidgetPickerPort; locale?: string } = {},
) {
  return useJiniWidgetPickerDialog({ props, deps: { port: deps.port ?? defaultWidgetPickerPort, useAdminLocaleHook: () => deps.locale ?? DEFAULT_LOCALE, useFetchQuery, describeApiError, sharedComponentsT, defaultWidgetConfig, WIDGET_TYPE_OPTIONS, widgetTypeLabel, translateWidgets } }, {});
}

export function useWidgetAddControl(props: WidgetAddControlProps,
  deps: { port?: WidgetPickerPort; locale?: string } = {},
) {
  return useJiniWidgetAddControl({ props, deps: { port: deps.port ?? defaultWidgetPickerPort, useAdminLocaleHook: () => deps.locale ?? DEFAULT_LOCALE, sharedComponentsT, describeApiError } }, {});
}

export function useWiredWidgetPickerDialog(props: WidgetPickerDialogProps) {
  return useJiniWidgetPickerDialog({ props, deps: { port: defaultWidgetPickerPort, useAdminLocaleHook: useAdminLocale, useFetchQuery, describeApiError, sharedComponentsT, defaultWidgetConfig, WIDGET_TYPE_OPTIONS, widgetTypeLabel, translateWidgets } }, {});
}

export function useWiredWidgetAddControl(props: WidgetAddControlProps) {
  return useJiniWidgetAddControl({ props, deps: { port: defaultWidgetPickerPort, useAdminLocaleHook: useAdminLocale, sharedComponentsT, describeApiError } }, {});
}
