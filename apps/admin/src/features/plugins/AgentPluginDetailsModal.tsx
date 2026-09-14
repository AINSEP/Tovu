import type { Translate } from "@/lib/dictionary-translator";
import type { InspectedAgentPlugin } from "./hooks/use-agent-plugins.hooks";
import { PackageFilesModal } from "./PackageFilesModal";
import { useAgentPluginDetailsModal } from "./hooks/use-agent-plugin-details-modal.hooks";

export interface AgentPluginDetailsModalProps {
  readonly plugin: InspectedAgentPlugin;
  /** `AgentPlugins`' bound translator — the modal's only source of copy. */
  readonly t: Translate;
  readonly onClose: () => void;
  /** Injectable seam for the file-tree selection state. Defaults to the real
   *  {@link useAgentPluginDetailsModal}; a test can pass a fake here to exercise the modal's
   *  rendering with a fixed file list/selection. */
  readonly useDetails?: typeof useAgentPluginDetailsModal;
}

/**
 * Read-only inspection of an explicitly bundled plugin package.
 *
 * Renders through the shared `PackageFilesModal` (2026-09-13): the file list, path breaking, and
 * wrap toggle that used to live in this file moved there, so the Plugins screen's viewer is the same
 * component rather than a copy that could drift.
 *
 * The modal receives no path/loading adapter. Its only content source is the compile-time
 * allowlist `useAgentPluginDetailsModal` reads via `getBundledAgentPluginSourceFiles`, so
 * selecting a row is a pure lookup and can never become an arbitrary file read.
 */
export function AgentPluginDetailsModal({ plugin, t, onClose, useDetails = useAgentPluginDetailsModal }: AgentPluginDetailsModalProps) {
  const { files, selectedFile, selectFile } = useDetails(plugin.id);

  return (
    <PackageFilesModal
      title={`${plugin.displayName} ${t("package files")}`}
      subtitle={t("Read-only source bundled with Tovu; this plugin is not executed from this screen.")}
      files={files}
      selectedFile={selectedFile}
      onSelectFile={selectFile}
      status={{ text: t("No source files are catalogued for this package."), role: "status" }}
      handlePrefix="agent-plugin-file"
      t={t}
      onClose={onClose}
    />
  );
}
