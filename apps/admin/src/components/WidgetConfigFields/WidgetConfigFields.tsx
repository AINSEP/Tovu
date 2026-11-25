import type { ComponentProps } from "react";
import { WidgetConfigFields as CmsWidgetConfigFields } from "@jini-ai/cms/react/widgets/WidgetConfigFields/WidgetConfigFields";
import { MediaContentEditor } from "./MediaContentEditor";
import { isUserCollection } from "@jini-ai/admin/screens/collections/rules";
import {
  COLLECTION_DISPLAYABLE_FIELD_KINDS,
  humanizeFieldName,
  useFetchedOptions,
  useRecentEntriesConfig,
  useSocialLinksConfig,
} from "@jini-ai/admin/shell/components/WidgetConfigFields/WidgetConfigFields.hooks";
import { defaultWidgetConfigFieldsPort } from "./widget-config-fields-dependencies.hooks";
import { asciiSlug } from "@jini-ai/admin/shell/lib/ascii-slug";
import { t as sharedComponentsT } from "@jini-ai/admin/shell/components/shared-components-i18n";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

const port = {
  listCollections: () => defaultWidgetConfigFieldsPort.listContentTypes().then((r) => r.items.filter((ct) => isUserCollection({ key: ct.key }))),
  listMenus: () => defaultWidgetConfigFieldsPort.listMenus().then((r) => r.menus),
  listForms: () => defaultWidgetConfigFieldsPort.listForms().then((r) => r.data),
};
const rules = { COLLECTION_DISPLAYABLE_FIELD_KINDS, humanizeFieldName, asciiSlug };

export function WidgetConfigFields({ useFetchedOptions: useOptions = useFetchedOptions, t, ...props }:
  Pick<ComponentProps<typeof CmsWidgetConfigFields>, "widgetType" | "config" | "onChange" | "agentHandle"> & {
    t?: ComponentProps<typeof CmsWidgetConfigFields>["t"];
    useFetchedOptions?: typeof useFetchedOptions;
  }
) {
  const locale = useAdminLocale();
  return <CmsWidgetConfigFields {...props} t={t ?? (key => sharedComponentsT({ locale, key }))}
    MediaContentEditor={MediaContentEditor} port={port} rules={rules}
    useFetchedOptionsHook={useOptions} useRecentEntriesConfigHook={useRecentEntriesConfig}
    useSocialLinksConfigHook={useSocialLinksConfig} />;
}
