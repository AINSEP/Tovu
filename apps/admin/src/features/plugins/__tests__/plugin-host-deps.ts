import { folderZipPort as folderZip } from "../folder-zip-port";
import { tPlugins } from "../../../lib/i18n-common";
import { defaultPluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import { isApiError, pluginRules, agentPluginDisplayName, updatableAgentPluginDigest, pluginRemoveAriaLabel, pluginRemoveBlocker, pluginToggleAriaLabel, pluginToggleControl, providerSettingRequiredHere } from "../rules";
import { createElement, type ComponentProps } from "react";
import type { AgentPluginsProps } from "@jini-ai/admin/screens/plugins/AgentPlugins";
import type { PluginsProps } from "@jini-ai/admin/screens/plugins/Plugins";
import { AgentPluginDetailsModal } from "@jini-ai/agent-plugins/react/AgentPluginDetailsModal";
import { AgentPluginMemoryPanel } from "@jini-ai/admin/screens/plugins/AgentPluginMemoryPanel";
import { AgentPluginMaturity } from "@jini-ai/admin/screens/plugins/AgentPluginMaturity";
import { PackageFilesModal } from "@jini-ai/admin/screens/plugins/PackageFilesModal";
import { AgentPluginSurfaceFrame } from "@jini-ai/admin/screens/plugins/AgentPluginSurfaceFrame";
import { useHostAdminSurfaceFrame } from "../hooks/use-host-admin-surface-frame.hooks";
import { defaultAgentPluginInstallPort } from "../hooks/agent-plugin-install-dependencies.hooks";
import { defaultAgentPluginSurfacesPort } from "../hooks/agent-plugin-surfaces-dependencies.hooks";
import { SETTINGS_DIALOG_DICTIONARIES, Toast } from "@jini-ai/ui";
import { TabBar } from "@jini-ai/ui/tab-strip";
import { Button, Dialog } from "@jini-ai/ui-kit/react";
import { ProviderSettingField } from "@jini-ai/admin/screens/plugins/PluginProviderSettingField";
import { PluginProviderSettingsDialog, useProviderSettingsFocus } from "@jini-ai/plugins/react/PluginProviderSettingsDialog";
import { useWiredPluginProviderSettings } from "../hooks/use-plugin-provider-settings.hooks";
import { useWiredPluginPackageFiles } from "../hooks/use-plugin-package-files.hooks";
import { useWiredPlugins } from "../hooks/use-plugins.hooks";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { translateAdminNavLabel } from "../../../lib/admin-nav-i18n";

/** The host collaborators Jini's plugin hooks take as required fields, bound as the product binds them. */
export const HOST_INSTALL = { isApiError, folderZip, rules: pluginRules };
export const HOST_AGENT_INSTALL = { isApiError, folderZip, rules: pluginRules, productName: "Tovu" };
export const HOST_PLUGINS = { ...HOST_INSTALL, translate: tPlugins, installPort: defaultPluginInstallPort };

export const HOST_AGENT_PLUGIN_SCREEN = {
  kit: {
    AgentPluginDetailsModal: (props: ComponentProps<AgentPluginsProps["kit"]["AgentPluginDetailsModal"]>) => createElement(AgentPluginDetailsModal, { ...props, kit: { AgentPluginMemoryPanel, AgentPluginMaturity, PackageFilesModal, AgentPluginSurfaceFrame }, useHostAdminSurfaceFrame, surfacesPort: defaultAgentPluginSurfacesPort }),
  },
  deps: {
    productName: "Tovu", isApiError, folderZip, pluginRules, agentPluginDisplayName, updatableAgentPluginDigest,
    agentPluginInstallPort: defaultAgentPluginInstallPort, defaultAgentPluginSurfacesPort, translateAdminNavLabel,
    dictionaries: SETTINGS_DIALOG_DICTIONARIES,
    uninstallNote: "Plugins that ship with Tovu can't be uninstalled: they come back on the next restart. To remove one you added, ask the assistant.",
    marketplaceNote: "Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.",
    downloadedNote: "Until then, the downloaded packages on the Downloaded tab are the ones Tovu ships.",
  },
};

export const HOST_PLUGIN_SCREEN = {
  kit: {
    TabBar, Toast,
    PluginProviderSettingsDialog: (props: ComponentProps<PluginsProps["kit"]["PluginProviderSettingsDialog"]>) => createElement(PluginProviderSettingsDialog, { ...props, kit: { Button, Dialog, ProviderSettingField }, providerSettingRequiredHere, legacyCredentialKey: "A key for this plugin was saved in an older format that Tovu no longer reads. Enter it again here and save." }),
  },
  hooks: {
    usePluginsHook: useWiredPlugins, useAdminLocale, useWiredPluginPackageFiles, useWiredPluginProviderSettings,
    useProviderSettingsFocus: (required: Parameters<PluginsProps["hooks"]["useProviderSettingsFocus"]>[0]) => useProviderSettingsFocus({ ...required, document }),
  },
  deps: {
    pluginRules, pluginRemoveAriaLabel, pluginRemoveBlocker, pluginToggleAriaLabel, pluginToggleControl,
    translateAdminNavLabel, onTabChange: (nextTabId: string) => navigate({ routePath: `/addons/plugins?tab=${nextTabId}` }, { replace: true }),
    productName: "Tovu", builtInNote: "Built-in plugins ship with Tovu itself and have no on-disk files to remove.",
    marketplaceNote: "Marketplace is planned for a future release. Tovu does not fetch, list, or install plugins from a marketplace yet.",
  },
};
