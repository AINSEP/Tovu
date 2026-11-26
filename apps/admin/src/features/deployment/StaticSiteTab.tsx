import { bindStaticSiteTab, type StaticSiteTabProps } from "@jini-ai/devops/deploy/react/StaticSiteTab";
import { Icon, useWiredCopyToClipboard } from "@jini-ai/ui";
import { PUBLISH_RUN_RESULT_CLASSES } from "./deployment-classes";
import { LINE_ICON } from "@jini-ai/admin/shell/components/line-icon";
import { copy, STATIC_SITE_CAPABILITIES } from "./deployment-host-policy";
import { asciiSlug } from "@jini-ai/admin/shell/lib/ascii-slug";
import { createStaticSiteTabTranslator } from "./StaticSiteTab.hooks";
import { CredentialHint } from "@/components/CredentialHint";
import { SecretInput } from "@jini-ai/admin/shell/components/SecretInput/SecretInput";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { adminHref, navigate } from "@jini-ai/admin/shell/lib/router";
import { TabBar } from "@jini-ai/ui/tab-strip";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import { t } from "./deployment-host-i18n";
import { useWiredStaticExport } from "./hooks/use-static-export.hooks";
import { useWiredStaticPublish } from "./hooks/use-static-publish.hooks";
import { useWiredPublishCredentials } from "./hooks/use-publish-credentials.hooks";
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";

export const STATIC_SITE_TAB_PROPS = {
  hooks: {
    useStaticExportHook: () => useWiredStaticExport({}),
    useStaticPublishHook: () => useWiredStaticPublish({}),
    usePublishCredentialsHook: useWiredPublishCredentials,
    useAdminLocale,
    useWiredCopyToClipboard,
  },
  kit: { Icon, CredentialHint, SecretInput, TabBar, ErrorNotice },
  deps: {
    PUBLISH_RUN_RESULT_CLASSES,
    LINE_ICON,
    copy: {
      ...copy,
      exportDescription: "Tovu writes every published post, the home page, products and theme pages into the folder you name.",
      exportCommand: "tovu export <dir>",
      storedTokenNotice: "Stored encrypted on the server. Once saved, Tovu never displays it again.",
      pickerTokenNotice: "token. Pick which one Tovu publishes with.",
      productName: "Tovu",
    },
    asciiSlug,
    STATIC_SITE_CAPABILITIES,
    createStaticSiteTabTranslator,
    adminHref,
    navigate,
    t,
    VIEWER_TIME_ZONE,
    pluginsPath: "/addons/agent-plugins",
    accessTokensPath: "/access-tokens?tab=access-tokens",
  },
} satisfies StaticSiteTabProps;

export const StaticSiteTab = bindStaticSiteTab(STATIC_SITE_TAB_PROPS);
