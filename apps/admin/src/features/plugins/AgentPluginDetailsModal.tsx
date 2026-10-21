import { AgentPluginMemoryPanel } from "./AgentPluginMemoryPanel";
import { useWiredAgentPluginMemory } from "./hooks/use-agent-plugin-memory.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { InspectedAgentPlugin } from "./hooks/use-agent-plugins.hooks";
import { PackageFilesModal } from "./PackageFilesModal";
import { AgentPluginSurfaceFrame } from "./AgentPluginSurfaceFrame";
import { defaultAgentPluginSurfacesPort } from "./hooks/agent-plugin-surfaces-dependencies.hooks";
import type { AgentPluginSurfacesPort } from "./hooks/agent-plugin-surfaces-port.hooks";
import { useAgentPluginSurfaces } from "./hooks/use-agent-plugin-surfaces.hooks";
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
  /** Plugin-owned admin surfaces (2026-10-20); a test passes a typed fake. */
  readonly surfacesPort?: AgentPluginSurfacesPort;
}

/**
 * Inspection of one installed Agent Plugin's package files and editable project memory.
 *
 * Renders through the shared `PackageFilesModal` (2026-09-13), the same component the Plugins
 * screen's viewer uses. Since 2026-09-13 its content comes from `AGENT_PLUGIN_FILES` — the server
 * resolves the id against installed packages and reads inside that package root only, never
 * following a symlink — rather than a compile-time catalog that missed plugins nobody had listed.
 *
 * Since 2026-10-20 each admin surface the plugin contributes (for example its "Manage connection"
 * screen) is one more view after Memory, titled by the plugin and rendered sandboxed.
 */
export function AgentPluginDetailsModal({ plugin, t, onClose, useDetails = useWiredAgentPluginDetailsModal, surfacesPort = defaultAgentPluginSurfacesPort }: AgentPluginDetailsModalProps) {
  const memory = useWiredAgentPluginMemory({ pluginId: plugin.id });
  const view = useAgentPluginDetailsView({ displayName: plugin.displayName, t, memoryT: memory.t });
  const { files, selectedFile, selectFile, status = null, listNotice = null } = useDetails(plugin.id);
  const listed = useAgentPluginSurfaces({ pluginId: plugin.id, port: surfacesPort });
  // Opened from "Manage": the row already listed the screens, so the first render has their tabs
  // (the shell picks its starting view once, at mount).
  const surfaces = listed.length > 0 ? listed : plugin.surfaces ?? [];
  const firstSurface = plugin.surfaces?.[0];
  const surfaceViews = surfaces.map((surface) => ({
    id: `plugin-surface-${surface.id}`,
    label: surface.title,
    custom: <AgentPluginSurfaceFrame key={surface.id} pluginId={plugin.id} surface={surface} port={surfacesPort} t={t} />,
  }));

  return (
    <PackageFilesModal
      title={view.title}
      onView={view.onView}
      initialViewId={firstSurface ? `plugin-surface-${firstSurface.id}` : undefined}
      files={files}
      selectedFile={selectedFile}
      onSelectFile={selectFile}
      status={status}
      listNotice={listNotice}
      handlePrefix="agent-plugin-file"
      t={t}
      additionalViews={[{ id: "plugin-memory", label: memory.t("Memory"), custom: <AgentPluginMemoryPanel controller={memory} /> }, ...surfaceViews]}
      onClose={onClose}
    />
  );
}
