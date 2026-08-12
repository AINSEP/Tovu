import { CodeWithLines } from "@jini-ai/ui";
import { PreviewModalShell } from "@jini-ai/ui/renderers";
import { useId, useState } from "react";

import type { BundledAgentPlugin } from "./agent-plugin-catalog";
import {
  findBundledAgentPluginSourceFile,
  getBundledAgentPluginSourceFiles,
} from "./agent-plugin-source-catalog";

export interface AgentPluginDetailsModalProps {
  readonly plugin: BundledAgentPlugin;
  readonly onClose: () => void;
}

/**
 * Read-only inspection of a bundled plugin package.
 *
 * The modal receives no path/loading adapter. Its only content source is
 * `getBundledAgentPluginSourceFiles`, which is itself built from an `import.meta.glob(...,
 * { eager: true })` over the package's `skills/` tree (see `agent-plugin-source-catalog.ts` for
 * why) -- Vite inlines every matched file's content into the built bundle at compile time, so the
 * set of selectable rows is still fixed before the app ever runs. Selecting a row is a pure
 * lookup over that fixed set, never an arbitrary file read, even though which files are IN the
 * set now tracks the Jini package automatically rather than a hand-written list.
 */
export function AgentPluginDetailsModal({ plugin, onClose }: AgentPluginDetailsModalProps) {
  const files = getBundledAgentPluginSourceFiles(plugin.id);
  const [selectedPath, setSelectedPath] = useState(files[0]?.relativePath ?? "");
  const selectedFile = findBundledAgentPluginSourceFile(files, selectedPath) ?? files[0] ?? null;
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
                    onClick={() => setSelectedPath(file.relativePath)}
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
