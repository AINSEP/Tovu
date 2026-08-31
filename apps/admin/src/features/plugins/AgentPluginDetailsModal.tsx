import { CodeWithLines } from "@jini-ai/ui";
import { PreviewModalShell } from "@jini-ai/ui/renderers";
import { Fragment, useId, useState } from "react";

import type { BundledAgentPlugin } from "./agent-plugin-catalog";
import type { BundledAgentPluginSourceFile } from "./agent-plugin-source-catalog";
import { useAgentPluginDetailsModal } from "./hooks/use-agent-plugin-details-modal.hooks";

export interface AgentPluginDetailsModalProps {
  readonly plugin: BundledAgentPlugin;
  readonly onClose: () => void;
  /** Injectable seam for the file-tree selection state. Defaults to the real
   *  {@link useAgentPluginDetailsModal}; a test can pass a fake here to exercise the modal's
   *  rendering with a fixed file list/selection. */
  readonly useDetails?: typeof useAgentPluginDetailsModal;
}

/** A package-relative path with a `<wbr>` after every `/` (visual QA, 2026-08-31). The file list
 *  is narrow (`.agent-plugin-source-files`, `minmax(14rem, 20rem)`) and these paths run long
 *  (`skills/interface-design/references/commands/critique.md`) — without a preferred break point
 *  `overflow-wrap: anywhere` (styles.css) was free to split mid-filename, e.g. leaving a lone `d`
 *  orphaned on its own line after "critique.m". `<wbr>` only offers the browser a *preferred* spot
 *  to break, so `overflow-wrap: anywhere` still catches the rare segment too long for the pane on
 *  its own — this only makes the common case break at a path boundary instead of a word. */
function PluginFilePath({ path }: { path: string }) {
  const segments = path.split("/");
  return (
    <>
      {segments.map((segment, i) => (
        <span key={i}>
          {segment}
          {i < segments.length - 1 ? "/" : null}
          {i < segments.length - 1 ? <wbr /> : null}
        </span>
      ))}
    </>
  );
}

/** `.md` files read better wrapped (prose); `plugin.json`/`.ts` sources usually read better
 *  unwrapped (structure). Only the wrap-toggle's *default* per file — see {@link AgentPluginFileContent}. */
function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

/**
 * Wrap-safe stand-in for Jini's `CodeWithLines`, used only while wrapping is on. `CodeWithLines`
 * renders the gutter and the code as two independent `white-space: pre` text blocks that stay
 * aligned only because neither one wraps — the instant a code line wraps to more than one visual
 * row, every later gutter number drifts out of sync with its line. This lays out one CSS grid row
 * per source line instead (`.code-viewer--wrap` in styles.css): a wrapped line's row simply grows
 * taller, and its own gutter number grows with it, so nothing downstream can ever desync.
 */
function WrappedFileContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="code-viewer code-viewer--wrap">
      {lines.map((line, i) => (
        <Fragment key={i}>
          <span className="line-number" aria-hidden>
            {i + 1}
          </span>
          <span className="line-content">{line}</span>
        </Fragment>
      ))}
    </div>
  );
}

/** Keyed by `file.relativePath` in the parent, so switching the selected file remounts this and
 *  resets `wrap` to the extension-based default rather than carrying a manual toggle across files. */
function AgentPluginFileContent({ file, headingId }: { file: BundledAgentPluginSourceFile; headingId: string }) {
  const [wrap, setWrap] = useState(() => isMarkdownPath(file.relativePath));

  return (
    <section className="agent-plugin-source-content" aria-labelledby={headingId}>
      <div className="agent-plugin-source-content-header">
        <h3 id={headingId}>
          <PluginFilePath path={file.relativePath} />
        </h3>
        <button type="button" aria-pressed={wrap} onClick={() => setWrap((prev) => !prev)}>
          {wrap ? "Wrap: on" : "Wrap: off"}
        </button>
      </div>
      {wrap ? <WrappedFileContent text={file.content} /> : <CodeWithLines text={file.content} />}
    </section>
  );
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
                    <PluginFilePath path={file.relativePath} />
                  </button>
                ))}
              </nav>
              {selectedFile ? (
                <AgentPluginFileContent
                  file={selectedFile}
                  headingId={selectedFileHeadingId}
                  key={selectedFile.relativePath}
                />
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
