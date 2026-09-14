import { CodeWithLines } from "@jini-ai/ui";
import { PreviewModalShell } from "@jini-ai/ui/renderers";
import { agentHandle } from "@jini-ai/agentic";
import { Fragment, useId } from "react";

import { buildAgentListHandles } from "../../lib/agent-list-handles";
import type { Translate } from "@/lib/dictionary-translator";
import type { PackageFilesStatus, PackageFileView } from "./rules";
import { usePackageFileWrap } from "./hooks/use-package-file-wrap.hooks";

/**
 * @file The read-only package-files browser BOTH plugin screens open — a file list on the left, the
 * selected file's source on the right with a Wrap toggle, inside Jini's `PreviewModalShell` (which
 * supplies the expand and close controls). Extracted 2026-09-13 out of `AgentPluginDetailsModal.tsx`
 * so Agent Plugins and Plugins render through one component and cannot drift apart.
 *
 * Presentational only: it loads nothing and holds no data. Each caller owns its source and passes
 * files in — Agent Plugins a compile-time allowlist (`agent-plugin-source-catalog.ts`), Plugins the
 * server's `PLUGIN_FILES` listing (`hooks/use-plugin-package-files.hooks.ts`).
 *
 * Class names keep the `agent-plugin-source-*` prefix they had before the extraction, so
 * `styles.css` needed no change.
 */

export interface PackageFilesModalProps {
  readonly title: string;
  readonly subtitle: string;
  readonly files: readonly PackageFileView[];
  readonly selectedFile: PackageFileView | null;
  readonly onSelectFile: (relativePath: string) => void;
  /** Shown in the content pane while no file is selected: loading, a load failure, or no files. */
  readonly status: PackageFilesStatus | null;
  /** One line above the file list, e.g. that the viewer's caps left some files out. */
  readonly listNotice?: string | null;
  /** Prefix for each file row's agent handle (`agent-plugin-file`, `plugin-file`). */
  readonly handlePrefix: string;
  readonly t: Translate;
  readonly onClose: () => void;
}

/** A package-relative path with a `<wbr>` after every `/` (visual QA, 2026-08-31). The file list
 *  is narrow (`.agent-plugin-source-files`, `minmax(14rem, 20rem)`) and these paths run long
 *  (`skills/interface-design/references/commands/critique.md`) — without a preferred break point
 *  `overflow-wrap: anywhere` (styles.css) was free to split mid-filename, e.g. leaving a lone `d`
 *  orphaned on its own line after "critique.m". `<wbr>` only offers the browser a *preferred* spot
 *  to break, so `overflow-wrap: anywhere` still catches the rare segment too long for the pane on
 *  its own — this only makes the common case break at a path boundary instead of a word. */
function PackageFilePath({ path }: { path: string }) {
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

/**
 * Keyed by `file.relativePath` in the parent, so switching the selected file remounts this and
 * resets `wrap` to its default rather than carrying a manual toggle across files.
 *
 * Defaults to wrapped for every file. Previously unwrapped for `plugin.json`/`.ts` sources on the
 * theory that structure reads better with no wrap; in practice the most likely first click in this
 * modal (`plugin.json`) ran a long line off the pane indefinitely, and the owner had to scroll
 * horizontally just to read it (owner correction, 2026-09-10). The toggle keeps unwrapped one click
 * away for whoever genuinely wants raw structure.
 *
 * A file listed without content (binary, too large, a symlink) shows its reason instead, and has no
 * Wrap toggle — there is nothing to wrap.
 */
function PackageFileContent({
  file,
  headingId,
  agentHandleBase,
  t,
}: {
  file: PackageFileView;
  headingId: string;
  agentHandleBase: string;
  t: Translate;
}) {
  const { wrap, toggleWrap } = usePackageFileWrap();
  const hasContent = file.content !== null;

  return (
    <section className="agent-plugin-source-content" aria-labelledby={headingId}>
      <div className="agent-plugin-source-content-header">
        <h3 id={headingId}>
          <PackageFilePath path={file.relativePath} />
        </h3>
        {hasContent ? (
          <button
            type="button"
            aria-pressed={wrap}
            onClick={toggleWrap}
            {...agentHandle(`${agentHandleBase}-wrap-toggle`, { role: "button", label: "Toggle line wrapping for this file" })}
          >
            {wrap ? t("Wrap: on") : t("Wrap: off")}
          </button>
        ) : null}
      </div>
      <PackageFileBody file={file} wrap={wrap} />
    </section>
  );
}

function PackageFileBody({ file, wrap }: { file: PackageFileView; wrap: boolean }) {
  if (file.content === null) {
    return (
      <p className="notice" role="status">
        {file.unavailableReason}
      </p>
    );
  }
  return wrap ? <WrappedFileContent text={file.content} /> : <CodeWithLines text={file.content} />;
}

export function PackageFilesModal({
  title,
  subtitle,
  files,
  selectedFile,
  onSelectFile,
  status,
  listNotice,
  handlePrefix,
  t,
  onClose,
}: PackageFilesModalProps) {
  const selectedFileHeadingId = useId();
  // File paths are stable and unique within one package, same per-row-handle derivation every
  // other list on this workstream uses (`buildAgentListHandles`).
  const fileHandles = buildAgentListHandles(
    handlePrefix,
    files.map((file) => file.relativePath),
  );
  const fileHandleByPath = new Map(files.map((file, index) => [file.relativePath, fileHandles[index]!]));

  return (
    <PreviewModalShell
      className="agent-plugin-source-modal"
      title={title}
      subtitle={subtitle}
      views={[
        {
          id: "package-source",
          label: t("Package files"),
          custom: (
            <div className="agent-plugin-source-browser">
              <nav className="agent-plugin-source-files" aria-label={t("Package files")}>
                {listNotice ? (
                  <p className="page-description" role="note">
                    {listNotice}
                  </p>
                ) : null}
                {files.map((file) => (
                  <button
                    key={file.relativePath}
                    type="button"
                    aria-pressed={selectedFile?.relativePath === file.relativePath}
                    onClick={() => onSelectFile(file.relativePath)}
                    {...agentHandle(`${fileHandleByPath.get(file.relativePath)}-select`, {
                      role: "button",
                      label: `Select the "${file.relativePath}" file`,
                    })}
                  >
                    <PackageFilePath path={file.relativePath} />
                  </button>
                ))}
              </nav>
              {selectedFile ? (
                <PackageFileContent
                  file={selectedFile}
                  headingId={selectedFileHeadingId}
                  key={selectedFile.relativePath}
                  agentHandleBase={fileHandleByPath.get(selectedFile.relativePath)!}
                  t={t}
                />
              ) : status ? (
                <p role={status.role}>{status.text}</p>
              ) : null}
            </div>
          ),
        },
      ]}
      onClose={onClose}
    />
  );
}
