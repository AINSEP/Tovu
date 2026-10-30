import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { DataTable, RowMenu, type RowMenuItem } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { FileDropzone, Toast } from "@jini-ai/ui";
import { formatTimestamp } from "@jini-ai/ui/panel-kit";
import { TabBar } from "@jini-ai/ui/tab-strip";
import type { AdminMedia } from "@/lib/api";
import { navigate } from "@/lib/router";
import { UploadIcon, goToLibraryTab, resolveLibraryTabId, resolveLibraryTabs } from "./Library.hooks";
import { useWiredLibrary, type LibraryController, type LibraryPreviewState, type LibraryUploadRow } from "./hooks/use-library.hooks";
import {
  LIBRARY_ACCEPT,
  documentExtensionSuffix,
  documentName,
  documentPreviewKind,
  documentTypeLabel,
  documentUploaderLabel,
  formatLibraryBytes,
} from "./rules";

/**
 * @file The Library screen (`/admin/library`) — markup only; state lives in
 * `hooks/use-library.hooks.ts`. Private documents for this site that the assistant can read
 * (`library_list` / `library_read`) and visitors never see. Two `?tab=` tabs: Upload and
 * Documents (owner, 2026-10-18). The Upload tab leads with an "Upload documents" button that opens
 * the drop zone's own file picker; Documents is only the list (owner, 2026-10-18).
 *
 * A thin Tovu page rather than a Jini `@jini-ai/admin/media` page: the Jini media page is parked
 * (`media-panel.ts`) and the legacy Media screen this sits beside is a Tovu feature too, so a Jini
 * version would need the parked module's ports wired first.
 *
 * Previews never run document content: Markdown renders with raw HTML off inside a scriptless,
 * network-blocked frame; text is React-escaped; PDF opens in the browser's PDF viewer from a blob
 * typed `application/pdf`; Office/iWork/RTF documents download.
 */
export interface LibraryProps {
  /** The `?tab=` query value; guarded by `resolveLibraryTabId`. */
  tabId?: string | null;
  /** Test seam; production passes nothing. */
  useLibraryHook?: () => LibraryController;
}

export function Library({ tabId, useLibraryHook = useWiredLibrary }: LibraryProps = {}) {
  const controller = useLibraryHook();
  const { t, documents, rowError, notice } = controller;
  const activeTabId = resolveLibraryTabId(tabId);
  return (
    <div className="page library-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Library")}</h1>
          <p className="page-description">{t("Private documents the assistant can read. Visitors never see them.")}</p>
        </div>
      </div>
      {rowError ? <div className="notice error" role="alert">{rowError}</div> : null}
      <TabBar
        ariaLabel={t("Library")}
        tabs={resolveLibraryTabs(t, { documentCount: documents?.length })}
        activeId={activeTabId}
        onChange={goToLibraryTab}
        containerHandle="library-tab-bar"
      />
      {activeTabId === "upload" ? <UploadTab controller={controller} /> : <DocumentsTab controller={controller} />}
      {controller.preview ? <PreviewDialog controller={controller} preview={controller.preview} /> : null}
      {/* A toast, not a banner above the tabs (owner, 2026-10-18): it confirms something the owner just
          did, so it clears itself, like the Themes trash toast. Open Trash stays inside it for restore. */}
      {notice ? (
        <Toast
          message={notice}
          role="status"
          tone="success"
          ttlMs={6000}
          actionLabel={t("Open Trash")}
          onAction={() => navigate("/trash")}
          onDismiss={controller.dismissNotice}
        />
      ) : null}
    </div>
  );
}

function uploadStatusLabel(row: LibraryUploadRow, t: (key: string) => string): string {
  switch (row.status) {
    case "waiting":
      return t("Waiting…");
    case "uploading":
      return t("Uploading…");
    case "done":
      return t("Uploaded");
    default:
      return row.error ?? t("Upload failed.");
  }
}

export function UploadTab({ controller }: { controller: LibraryController }) {
  const { t, permissions, uploads, uploadedCount, addFiles, clearUploads } = controller;
  const zoneRef = useRef<HTMLDivElement>(null);
  if (permissions.known && !permissions.canUpload) {
    return <div className="notice">{t("You don't have permission to upload documents.")}</div>;
  }
  const finished = uploads.some((row) => row.status === "done" || row.status === "failed");
  return (
    <section className="library-upload" aria-label={t("Upload")}>
      {/* Opens the drop zone's own file input, so both paths share its accept list and upload path. */}
      <button
        type="button"
        className="btn-primary library-upload-button"
        onClick={() => zoneRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
        {...agentHandle({ handle: "library-upload-documents" }, { role: "button", label: "Open the file picker to upload documents to the Library" })}
      >
        <UploadIcon />
        {t("Upload documents")}
      </button>
      <div ref={zoneRef} onDropCapture={(event) => {
        const items = Array.from(event.dataTransfer.items ?? []);
        const packages = items.map(item => item.webkitGetAsEntry?.()).filter(entry =>
          entry?.isDirectory && /\.(pages|key)$/i.test(entry.name));
        if (!packages.length) return;
        // A macOS package is a directory. Stop expansion so its internals cannot become uploads.
        event.preventDefault();
        event.stopPropagation();
        addFiles([...packages.map(entry => new File([], entry!.name)),
          ...items.map(item => item.getAsFile()).filter((file): file is File => !!file && !packages.some(entry => entry!.name === file.name))]);
      }}>
        <FileDropzone
          accept={LIBRARY_ACCEPT}
          prompt={t("Drop documents here, or click to browse")}
          helper={t("Documents: Markdown, text, PDF, Word, Excel, PowerPoint, Pages, Keynote, RTF, CSV, JSON · up to 10 MiB each")}
          onFiles={addFiles}
        />
        <p className="library-upload-warning">{t("Do not load any sensitive keys, tokens, or secrets here.")}</p>
      </div>
      {uploads.length > 0 ? (
        <ul className="library-upload-list" aria-label={t("Uploads")}>
          {uploads.map((row) => (
            <li key={row.key} className={`library-upload-row is-${row.status}`}>
              <span className="library-upload-name">{row.name}</span>
              <span className="library-upload-size">{formatLibraryBytes(row.size)}</span>
              <span className="library-upload-status" role={row.status === "failed" ? "alert" : undefined}>
                {row.status === "uploading" ? <span className="library-spinner" aria-hidden="true" /> : null}
                {uploadStatusLabel(row, t)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {finished ? (
        <div className="library-upload-actions">
          {uploadedCount > 0 ? (
            <button
              type="button"
              onClick={() => goToLibraryTab("documents")}
              {...agentHandle({ handle: "library-view-documents" }, { role: "button", label: "Open the Documents tab to see the uploaded documents" })}
            >
              {t("View in Documents")}
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={clearUploads}>
            {t("Clear list")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function downloadDocument(url: string) {
  // The original route answers `Content-Disposition: attachment`, so this saves the file and the
  // admin page stays where it is.
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function documentMenuItems(item: AdminMedia, controller: LibraryController): RowMenuItem[] {
  const { t, permissions } = controller;
  // Download-only documents have no preview in v1, so their menu leads with Download (the name still opens the details).
  const items: RowMenuItem[] = documentPreviewKind(item) === "download"
    ? []
    : [{ key: "preview", label: t("Preview"), onSelect: () => controller.openPreview(item) }];
  items.push({ key: "download", label: t("Download"), onSelect: () => downloadDocument(controller.downloadUrl(item)) });
  if (permissions.canRename) items.push({ key: "rename", label: t("Rename"), onSelect: () => controller.rename.start(item) });
  if (permissions.canTrash) items.push({ key: "trash", label: t("Move to Trash"), tone: "warning", onSelect: () => void controller.trash(item) });
  return items;
}

function RenameField({ item, controller }: { item: AdminMedia; controller: LibraryController }) {
  const { t, rename } = controller;
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void rename.save();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      rename.cancel();
    }
  }
  return (
    <span className="library-rename">
      <span className="library-rename-field">
        <input
          type="text"
          value={rename.draft}
          onChange={(event) => rename.setDraft(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          aria-label={t("New name")}
          aria-invalid={rename.invalid || undefined}
          maxLength={240}
          autoFocus
        />
        <span className="library-rename-ext">{documentExtensionSuffix(item)}</span>
      </span>
      <button type="button" className="btn-primary" onClick={() => void rename.save()} disabled={rename.saving || rename.invalid}>
        {rename.saving ? t("Saving…") : t("Save")}
      </button>
      <button type="button" className="btn-secondary" onClick={rename.cancel} disabled={rename.saving}>
        {t("Cancel")}
      </button>
    </span>
  );
}

export function DocumentsTab({ controller }: { controller: LibraryController }) {
  const { t, documents, listError, userNames, trashingId } = controller;
  if (listError) return <div className="notice error">{listError}</div>;
  if (!documents) return <div className="notice">{t("Loading documents…")}</div>;
  return (
    <section className="library-documents" aria-label={t("Documents")}>
      <DataTable
        rows={documents}
        rowKey={(item) => item.id}
        label={t("Documents")}
        empty={<p className="library-documents-empty">{t("No documents yet.")}</p>}
        columns={[
          {
            key: "name",
            header: t("Name"),
            // Agent handles use the row position: ids are not handle-safe words.
            cell: (item, index) =>
              controller.rename.editingId === item.id ? (
                <RenameField item={item} controller={controller} />
              ) : (
                <button
                  type="button"
                  className="link-button library-name-button"
                  onClick={() => controller.openPreview(item)}
                  {...agentHandle({ handle: `library-doc-${index + 1}-preview` }, { role: "button", label: "Preview this document" })}
                >
                  {documentName(item)}
                </button>
              ),
          },
          { key: "type", header: t("Type"), cell: (item) => <span className="library-type">{documentTypeLabel(item)}</span> },
          { key: "size", header: t("Size"), cellClassName: "library-num", cell: (item) => formatLibraryBytes(item.byteSize) },
          { key: "uploaded", header: t("Upload date"), cellClassName: "library-num", cell: (item) => formatTimestamp({ iso: item.createdAt }, { timeZone: "local" }) },
          {
            key: "by",
            header: t("Uploaded by"),
            cell: (item) => documentUploaderLabel({ item, unknownLabel: t("Unknown") }, { userNames }),
          },
          {
            key: "actions",
            header: t("More"),
            cell: (item, index) =>
              trashingId === item.id ? (
                <span className="muted-cell">{t("Moving…")}</span>
              ) : (
                <RowMenu
                  triggerLabel={t('Actions for "{title}"').replace("{title}", documentName(item))}
                  agentHandle={`library-doc-${index + 1}-menu`}
                  items={documentMenuItems(item, controller)}
                />
              ),
          },
        ]}
      />
    </section>
  );
}

/** Builds the scriptless, network-blocked document a Markdown preview renders in. Colours come
 *  from the admin theme around the frame so light and dark both read. */
export function markdownFrameDocument(html: string, colors: { text: string; link: string; border: string }): string {
  const style = `:root{color-scheme:light dark}body{margin:0;padding:16px 20px;font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:${colors.text};background:transparent;overflow-wrap:anywhere}a{color:${colors.link}}pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}pre{padding:10px 12px;border:1px solid ${colors.border};border-radius:6px;overflow:auto}table{border-collapse:collapse}th,td{border:1px solid ${colors.border};padding:4px 8px}img{max-width:100%}h1,h2,h3{line-height:1.25}blockquote{margin:0;padding-left:12px;border-left:3px solid ${colors.border}}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${style}</style></head><body>${html}</body></html>`;
}

function MarkdownFrame({ html, title }: { html: string; title: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<{ text: string; link: string; border: string } | null>(null);
  useLayoutEffect(() => {
    // The host div always renders, and React attaches its ref before layout effects run, so the
    // ref is set here (the old `if (!host) return` guard could never fire).
    const host = hostRef.current!;
    const computed = getComputedStyle(host);
    setColors({
      text: computed.color || "CanvasText",
      link: computed.getPropertyValue("--link").trim() || computed.color || "LinkText",
      border: computed.getPropertyValue("--border").trim() || "GrayText",
    });
  }, []);
  return (
    <div ref={hostRef} className="library-preview-frame-host">
      {colors ? (
        <iframe className="library-preview-frame" title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={markdownFrameDocument(html, colors)} />
      ) : null}
    </div>
  );
}

function PreviewBody({ preview, controller }: { preview: LibraryPreviewState; controller: LibraryController }) {
  const { t } = controller;
  const name = documentName(preview.item);
  if (preview.loading) return <p className="muted-cell">{t("Loading preview…")}</p>;
  if (preview.error) return <div className="notice error">{preview.error}</div>;
  if (preview.kind === "markdown" && preview.html !== null) return <MarkdownFrame html={preview.html} title={name} />;
  if (preview.kind === "text" && preview.text !== null) return <pre className="library-preview-text">{preview.text}</pre>;
  if (preview.kind === "pdf" && preview.pdfUrl) {
    // Not a sandboxed iframe: Chrome shows "This page has been blocked" for a PDF inside
    // `sandbox=""` (seen 2026-10-18). `<object>` hands the bytes to the browser's own PDF viewer;
    // the hook re-types the blob as `application/pdf`, so it can never load as an HTML page. The
    // fallback shows when the browser has no inline PDF viewer.
    return (
      <object className="library-preview-frame library-preview-pdf" title={name} type="application/pdf" data={preview.pdfUrl}>
        <p className="library-preview-none">{t("No preview for this file type. Download it to open it.")}</p>
      </object>
    );
  }
  return <p className="library-preview-none">{t("No preview for this file type. Download it to open it.")}</p>;
}

function PreviewDialog({ controller, preview }: { controller: LibraryController; preview: LibraryPreviewState }) {
  const { t, closePreview } = controller;
  const name = documentName(preview.item);
  const titleId = "library-preview-title";
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") closePreview();
  }
  return (
    <div className="settings-dialog-backdrop" onClick={closePreview}>
      <div
        className="settings-dialog library-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="library-preview-head">
          <div className="library-preview-heading">
            <h2 id={titleId}>{name}</h2>
            <p className="library-preview-meta">
              {documentTypeLabel(preview.item)} · {formatLibraryBytes(preview.item.byteSize)}
            </p>
          </div>
          <a className="btn-secondary library-preview-download" href={controller.downloadUrl(preview.item)} download>
            {t("Download")}
          </a>
          <button type="button" className="btn-ghost library-preview-close" aria-label={t("Close")} onClick={closePreview} autoFocus>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="library-preview-body">
          <PreviewBody preview={preview} controller={controller} />
          {preview.truncated ? <p className="muted-cell library-preview-truncated">{t("Showing the first 64 KB. Download the file to see all of it.")}</p> : null}
        </div>
      </div>
    </div>
  );
}
