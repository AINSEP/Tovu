import { bindProviders } from "@jini-ai/admin/screens/providers/Providers";
import { routinesKit } from "@/integrations/jini-kits";
import { ServerLabel } from "@/components/status-labels";
import { actionsForWebhookLabel, deleteWebhookBody } from "@jini-ai/admin/screens/integrations/integrations-i18n";
import { navigateProvidersTab } from "@jini-ai/admin/screens/providers/Providers.hooks";
import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { I18nProvider, IntegrationsTab, SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { TabBar } from "@jini-ai/ui/tab-strip";
import { ComingSoonPanel } from "@jini-ai/ui/admin-widgets";
import { ExternalMcpSettingsPanel } from "../settings/ExternalMcpSettingsPanel";
import { AlwaysAllowPanel } from "@jini-ai/admin/screens/providers/AlwaysAllowPanel";
import "@jini-ai/admin/screens/providers/always-allow.css";
import { useWiredAlwaysAllow } from "./hooks/use-always-allow.hooks";
import { Integrations } from "@jini-ai/integrations/react/webhooks/Integrations";
import { useWiredIntegrations } from "../integrations/hooks/integrations-dependencies.hooks";
import { tProviders as t, tIntegrations } from "../../lib/i18n-common";
import { useExternalMcp } from "../settings/hooks/use-external-mcp.hooks";

export const Providers = bindProviders({
  hooks: {
    useAdminThemeBoundary,
    useAdminLocale,
    useExternalMcp: () => useExternalMcp({}),
    useIntegrationsHook: useWiredIntegrations,
  },
  kit: {
    TabBar,
    I18nProvider,
    ExternalMcpSettingsPanel,
    AlwaysAllowPanel: () => <AlwaysAllowPanel useAlwaysAllowHook={useWiredAlwaysAllow} />,
    McpServer: () => <IntegrationsTab serverName="tovu" agentHandle="settings-mcp-server" />,
    Webhooks: (props) => <Integrations {...props} kit={routinesKit} ServerLabel={ServerLabel} translate={tIntegrations} actionsForWebhookLabel={actionsForWebhookLabel} deleteWebhookBody={deleteWebhookBody} />,
    ComingSoonPanel,
  },
  deps: {
    dictionaries: SETTINGS_DIALOG_DICTIONARIES,
    t,
    tIntegrations,
    restartLabel: ({ locale }) => t({ locale, key: "Saved — restart Tovu to connect" }),
    mcpServerHandleLabel: "Switch to the MCP Server tab — connect an MCP client to this Tovu install (soon)",
    onTabChange: navigateProvidersTab,
  },
});
