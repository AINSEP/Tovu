import { bindPlugins } from "@jini-ai/admin/screens/plugins/Plugins";
import { PluginRulesProvider } from "@jini-ai/admin/screens/plugins/rules-context";
import { PluginPackageFilesModal } from "@jini-ai/admin/screens/plugins/PluginPackageFilesModal";
import { PluginRemoveConfirmDialog } from "@jini-ai/admin/screens/plugins/PluginRemoveConfirmDialog";
import { PluginRow } from "@jini-ai/admin/screens/plugins/PluginRow";
import { AddPluginPanel } from "@jini-ai/admin/screens/plugins/AddPluginPanel";
import { InstalledTabIcon, DownloadedTabIcon, MarketplaceTabIcon, PluginTrashIcon } from "@jini-ai/admin/screens/plugins/plugins-visuals";
import { Button, Dialog } from "@jini-ai/ui-kit/react";
import { ProviderSettingField } from "@jini-ai/admin/screens/plugins/PluginProviderSettingField";
import { Toast } from "@jini-ai/ui";
import { TabBar } from "@jini-ai/ui/tab-strip";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { PluginProviderSettingsDialog, useProviderSettingsFocus } from "@jini-ai/plugins/react/PluginProviderSettingsDialog";
import "@jini-ai/admin/shell/components/InstallTabCard/install-tab-card.css";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { translateAdminNavLabel } from "@/lib/admin-nav-i18n";
import { useWiredPluginProviderSettings } from "./hooks/use-plugin-provider-settings.hooks";
import { useWiredPluginPackageFiles } from "./hooks/use-plugin-package-files.hooks";
import { useWiredPlugins } from "./hooks/use-plugins.hooks";
import { pluginRemoveAriaLabel, pluginRemoveBlocker, pluginRules, pluginToggleAriaLabel, pluginToggleControl, providerSettingRequiredHere } from "./rules";

export const Plugins = bindPlugins({
  kit: {
    PluginRulesProvider,
    PluginPackageFilesModal,
    PluginRemoveConfirmDialog,
    PluginRow,
    AddPluginPanel,
    InstalledTabIcon,
    DownloadedTabIcon,
    MarketplaceTabIcon,
    PluginTrashIcon,
    TabBar,
    Toast,
    PluginProviderSettingsDialog: (props) => <PluginProviderSettingsDialog {...props} kit={{ Button, Dialog, ProviderSettingField }} providerSettingRequiredHere={providerSettingRequiredHere} legacyCredentialKey="A key for this plugin was saved in an older format that Tovu no longer reads. Enter it again here and save." />,
  },
  hooks: {
    usePluginsHook: useWiredPlugins,
    useAdminLocale,
    useWiredPluginPackageFiles,
    useWiredPluginProviderSettings,
    useProviderSettingsFocus: (required) => useProviderSettingsFocus({ ...required, document }),
  },
  deps: {
    pluginRules,
    pluginRemoveAriaLabel,
    pluginRemoveBlocker,
    pluginToggleAriaLabel,
    pluginToggleControl,
    translateAdminNavLabel,
    onTabChange: (nextTabId) => navigate({ routePath: `/addons/plugins?tab=${nextTabId}` }, { replace: true }),
    productName: "Tovu",
    builtInNote: "Built-in plugins ship with Tovu itself and have no on-disk files to remove.",
    marketplaceNote: "Marketplace is planned for a future release. Tovu does not fetch, list, or install plugins from a marketplace yet.",
  },
});
