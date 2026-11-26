import { bindAgentPlugins } from "@jini-ai/admin/screens/plugins/AgentPlugins";
import { folderZipPort as folderZip } from "./hooks/use-plugins.hooks";
import { AgentPluginDetailsModal } from "@jini-ai/agent-plugins/react/AgentPluginDetailsModal";
import { AgentPluginMemoryPanel } from "@jini-ai/admin/screens/plugins/AgentPluginMemoryPanel";
import { AgentPluginMaturity } from "@jini-ai/admin/screens/plugins/AgentPluginMaturity";
import { PackageFilesModal } from "@jini-ai/admin/screens/plugins/PackageFilesModal";
import { AgentPluginSurfaceFrame } from "@jini-ai/admin/screens/plugins/AgentPluginSurfaceFrame";
import { useAgentPluginConfirmation } from "@jini-ai/admin/screens/plugins/AgentPlugins.hooks";
import { useAgentPluginTab } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-tab.hooks";
import { useAgentPluginInstall } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-install.hooks";
import { useAgentPluginUpdate } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-update.hooks";
import { useAgentPluginDetailsView } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-details-modal.hooks";
import { useAgentPluginSurfaces } from "@jini-ai/admin/screens/plugins/hooks/use-agent-plugin-surfaces.hooks";
import { SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import "@jini-ai/admin/shell/components/InstallTabCard/install-tab-card.css";
import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { translateAdminNavLabel } from "@/lib/admin-nav-i18n";
import { useHostAdminSurfaceFrame } from "./hooks/use-host-admin-surface-frame.hooks";
import { useWiredAgentPluginDetailsModal } from "./hooks/use-agent-plugin-details-modal.hooks";
import { useWiredAgentPluginMemory } from "./hooks/use-agent-plugin-memory.hooks";
import { useWiredAgentPlugins } from "./hooks/use-agent-plugins.hooks";
import { defaultAgentPluginSurfacesPort } from "./hooks/agent-plugin-surfaces-dependencies.hooks";
import { defaultAgentPluginInstallPort } from "./hooks/agent-plugin-install-dependencies.hooks";
import { agentPluginDisplayName, isApiError, pluginRules, updatableAgentPluginDigest } from "./rules";

export const AgentPlugins = bindAgentPlugins({
  kit: {
    AgentPluginDetailsModal: (props) => <AgentPluginDetailsModal {...props} kit={{ AgentPluginMemoryPanel, AgentPluginMaturity, PackageFilesModal, AgentPluginSurfaceFrame }} useHostAdminSurfaceFrame={useHostAdminSurfaceFrame} surfacesPort={defaultAgentPluginSurfacesPort} />,
  },
  hooks: {
    useAdminThemeBoundaryHook: useAdminThemeBoundary,
    useAgentPluginTabHook: useAgentPluginTab,
    useAgentPluginInstallHook: useAgentPluginInstall,
    useAgentPluginConfirmationHook: useAgentPluginConfirmation,
    useAgentPluginUpdateHook: useAgentPluginUpdate,
    useAgentPluginsHook: useWiredAgentPlugins,
    useDetails: useWiredAgentPluginDetailsModal,
    useAgentPluginMemoryHook: useWiredAgentPluginMemory,
    useAgentPluginDetailsViewHook: useAgentPluginDetailsView,
    useAgentPluginSurfacesHook: useAgentPluginSurfaces,
  },
  deps: {
    productName: "Tovu",
    isApiError,
    folderZip,
    pluginRules,
    agentPluginDisplayName,
    updatableAgentPluginDigest,
    agentPluginInstallPort: defaultAgentPluginInstallPort,
    defaultAgentPluginSurfacesPort,
    translateAdminNavLabel,
    dictionaries: SETTINGS_DIALOG_DICTIONARIES,
    uninstallNote: "Plugins that ship with Tovu can't be uninstalled: they come back on the next restart. To remove one you added, ask the assistant.",
    marketplaceNote: "Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.",
    downloadedNote: "Until then, the downloaded packages on the Downloaded tab are the ones Tovu ships.",
  },
});
