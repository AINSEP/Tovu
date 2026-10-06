import { AgentPluginMemoryPanel } from "./AgentPluginMemoryPanel";
import { useWiredAgentPluginMemory } from "./hooks/use-agent-plugin-memory.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import type { InspectedAgentPlugin } from "./hooks/use-agent-plugins.hooks";
import { PackageFilesModal } from "./PackageFilesModal";
import {
  useWiredAgentPluginDetailsModal,
  useAgentPluginDetailsView,
  type AgentPluginDetailsModalController,
} from "./hooks/use-agent-plugin-details-modal.hooks";

export interface AgentPluginDetailsModalProps {
  readonly plugin: InspectedAgentPlugin;
  /** `AgentPlugins`' bound translator — the modal's title copy. */
  readonly t: Translate;
  readonly onClose: () => void;
  /** Injectable seam for the listing. Defaults to the real {@link useWiredAgentPluginDetailsModal};
   *  a test can pass a fake to exercise the modal's rendering with a fixed file list/selection. */
  readonly useDetails?: (pluginId: string) => AgentPluginDetailsModalController;
}

/**
 * Inspection of one installed Agent Plugin's package files and editable project memory.
 *
 * Renders through the shared `PackageFilesModal` (2026-09-13), the same component the Plugins
 * screen's viewer uses. Since 2026-09-13 its content comes from `AGENT_PLUGIN_FILES` — the server
 * resolves the id against installed packages and reads inside that package root only, never
 * following a symlink — rather than a compile-time catalog that missed plugins nobody had listed.
 */
export function AgentPluginDetailsModal({ plugin, t, onClose, useDetails = useWiredAgentPluginDetailsModal }: AgentPluginDetailsModalProps) {
  const memory = useWiredAgentPluginMemory({ pluginId: plugin.id });
  const view = useAgentPluginDetailsView({ displayName: plugin.displayName, t, memoryT: memory.t });
  const { files, selectedFile, selectFile, status = null, listNotice = null } = useDetails(plugin.id);

  return (
    <PackageFilesModal
      title={view.title}
      onView={view.onView}
      files={files}
      selectedFile={selectedFile}
      onSelectFile={selectFile}
      status={status}
      listNotice={listNotice}
      handlePrefix="agent-plugin-file"
      t={t}
      additionalViews={[{ id: "plugin-memory", label: memory.t("Memory"), custom: <AgentPluginMemoryPanel controller={memory} /> }]}
      onClose={onClose}
    />
  );
}
