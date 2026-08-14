import { CodeWithLines } from "@jini-ai/ui";
import { PreviewModalShell } from "@jini-ai/ui/renderers";
import { useId } from "react";

import type { BundledAgentPlugin } from "./agent-plugin-catalog";
import { useAgentPluginDetailsModal } from "./hooks/use-agent-plugin-details-modal.hooks";

export interface AgentPluginDetailsModalProps {
  readonly plugin: BundledAgentPlugin;
  readonly onClose: () => void;
  /** Injectable seam for the file-tree selection state. Defaults to the real
   *  {@link useAgentPluginDetailsModal}; a test can pass a fake here to exercise the modal's
   *  rendering with a fixed file list/selection. */
  readonly useDetails?: typeof useAgentPluginDetailsModal;
}

/**
 * Read-only inspection of an explicitly bundled plugin package.
 *
 * The modal receives no path/loading adapter. Its only content source is the compile-time
 * allowlist `useAgentPluginDetailsModal` reads via `getBundledAgentPluginSourceFiles`, so
 * selecting a row is a pure lookup and can never become an arbitrary file read.
 */
export function AgentPluginDetailsModal({ plugin, onClose, useDetails = useAgentPluginDetailsModal }: AgentPluginDetailsModalProps) {
  const { files, selectedFile, selectFile } = useDetails(plugin.id);
  const selectedFileHeadingId = useId();

  return (
    <PreviewModalShell
      className="agent-plugin-source-modal"
      title={`${plugin.displayName} package files`}
      subtitle="Read-only source bundled with Tovu; this plugin is not executed from this screen."
      views={[
        {
          id: "package-source",
          label: "Package source",
          custom: (
            <div className="agent-plugin-source-browser">
              <nav className="agent-plugin-source-files" aria-label="Package files">
                {files.map((file) => (
                  <button
                    key={file.relativePath}
                    type="button"
                    aria-pressed={selectedFile?.relativePath === file.relativePath}
                    onClick={() => selectFile(file.relativePath)}
                  >
                    {file.relativePath}
                  </button>
                ))}
              </nav>
              {selectedFile ? (
                <section className="agent-plugin-source-content" aria-labelledby={selectedFileHeadingId}>
                  <h3 id={selectedFileHeadingId}>{selectedFile.relativePath}</h3>
                  <CodeWithLines text={selectedFile.content} />
                </section>
              ) : (
                <p role="status">No source files are catalogued for this package.</p>
              )}
            </div>
          ),
        },
      ]}
      onClose={onClose}
    />
  );
}
