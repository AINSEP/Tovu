import { useId } from "react";
import { Dialog } from "@jini-ai/ui-kit/react";
import { Icon } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { agentHandle } from "@jini-ai/agentic";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import type { AdminMedia } from "../../lib/api";
import type { MediaPickerPort } from "../MediaPickerDialog/media-picker-port.hooks";
import { DockHeaderTip } from "../AssistantDock/DockHeaderTip";
import "../../styles/native-domain-dialogs.css";
import "../../styles/media-content-editor.css";
import { HtmlAttributeRows } from "./HtmlAttributeRows";
import { useMediaContentEditor, type MediaContentEditorController, type MediaItemRow } from "./MediaContentEditor.hooks";
import type { MediaContentMode, MediaLayout, MediaSlugProblem } from "./media-content-rules";
import { DevicePreviewFrame } from "../DevicePreview/DevicePreviewFrame";
import { useWidgetPreview } from "./WidgetPreview.hooks";

/**
 * @file `MediaContentEditor` — the owner-approved two-tab editor ("Media" structured / "Raw HTML")
 * for media content (2026-10-11). ONE component, two hosts: `WidgetConfigFields` renders it for
 * `media` and `gallery` widgets (the widget editor page and the "create new" picker form), and the
 * `widgetEmbed` node's Style dialog renders it for a per-placement "Custom for this post" override
 * (`widget-embed-extension.tsx`). Replaces the 10-09 `GalleryConfigFields` form the owner called
 * "terrible": loose label/inputs, big filled Move/Remove buttons, full-size thumbnails.
 *
 * Markup only — state lives in `MediaContentEditor.hooks.ts`, rules in `media-content-rules.ts`.
 * Design rules it follows (owner checklist): no control wider than its content, label + compact
 * control on one line, ⓘ tips instead of paragraphs, small icon buttons; rows reflow under the
 * `admin-content` container (`styles/media-content-editor.css`) for 390px and the open dock.
 *
 * ## Agent handles
 *
 * Given `agentHandle="widget-instance-config"`: `<base>-tab-media`, `<base>-tab-html`,
 * `<base>-layout-<layout>`, `<base>-columns`, `<base>-aspect-ratio`, `<base>-choose`,
 * `<base>-slug`, `<base>-slug-add`, `<base>-css-class`, `<base>-attribute-add`, `<base>-html`,
 * `<base>-insert-media`, `<base>-picker-add`. Item rows are reorderable and their slugs editable,
 * so they carry no per-row handle (no stable id to key one on). Omit for no `data-agent-*` markup.
 */

const TABS: ReadonlyArray<{ id: MediaContentMode; label: string }> = [{ id: "media", label: "Media" }, { id: "html", label: "Raw HTML" }];

function handle(base: string | undefined, suffix: string, role: "field" | "button", label: string) {
  return base ? agentHandle({ handle: `${base}-${suffix}` }, { role, label }) : {};
}

/** Literal keys (not `t(variable)`) so the i18n parity test can resolve every one statically. */
function layoutLabel(layout: MediaLayout, t: Translate): string {
  if (layout === "single") return t("Single");
  if (layout === "grid") return t("Grid");
  if (layout === "carousel") return t("Carousel");
  return t("Masonry");
}

function problemText(problem: MediaSlugProblem, slug: string, t: Translate): string {
  if (problem === "empty") return t("Type a media slug.");
  if (problem === "invalid") return t("Slugs can't contain spaces or slashes.");
  if (problem === "duplicate") return t("Already in this list.");
  if (problem === "full") return interpolate({ template: t("Up to {max} items."), vars: { max: 50 } });
  return interpolate({ template: t('No media with the slug "{slug}".'), vars: { slug } });
}

export interface MediaContentEditorProps {
  /** `media`, `gallery` (no Single layout), or `media` for a placement override. */
  widgetType: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  /** Shared-components dictionary translator; omit for the English source strings. */
  t?: Translate;
  agentHandle?: string;
  /** Media library seam; defaults to the live `/media` client. */
  port?: MediaPickerPort;
  /** Injectable seam for the state hook — a test can render this markup against a fake. */
  useEditor?: typeof useMediaContentEditor;
  usePreview?: typeof useWidgetPreview;
}

export function MediaContentEditor({ widgetType, config, onChange, t = (key) => key, agentHandle: base, port, useEditor = useMediaContentEditor, usePreview = useWidgetPreview }: MediaContentEditorProps) {
  const vm = useEditor({ config, onChange, widgetType }, port ? { port } : {});
  const preview = usePreview({ widgetType, config });
  const { onKeyDown } = useTabBarKeyboard({ tabs: TABS, activeId: vm.mode, onChange: (id) => vm.setMode(id as MediaContentMode) });
  const panelId = useId();
  return (
    <div className="media-content-editor">
      <div className="media-content-editor__tabs">
        <div className="segmented" role="tablist" aria-label={t("Widget content")} onKeyDown={onKeyDown}>
          {TABS.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={vm.mode === tab.id} aria-controls={panelId}
              className={vm.mode === tab.id ? "is-active" : undefined}
              tabIndex={resolveTabBarTabIndex({ tabs: TABS, activeId: vm.mode, tab })}
              onClick={() => vm.setMode(tab.id)}
              {...handle(base, `tab-${tab.id}`, "button", `Switch to the ${tab.label} tab`)}>
              {tab.id === "media" ? t("Media") : t("Raw HTML")}
            </button>
          ))}
        </div>
        {vm.inactiveHasContent ? (
          <span className="field-hint media-content-editor__notice" role="status">
            <Icon name="alert-triangle" size={14} aria-hidden="true" />
            {t("Saving keeps only this tab. The other tab's content will be dropped.")}
          </span>
        ) : null}
      </div>
      <div id={panelId} role="tabpanel" className="media-content-editor__panel">
        {vm.mode === "media" ? <MediaTab vm={vm} t={t} base={base} /> : <HtmlTab vm={vm} t={t} base={base} />}
      </div>
      <section className="media-content-editor__preview" aria-label={t("Preview")}>
        <div className="media-content-editor__toolbar">
          <span className="field-label">{t("Preview")}</span>
          <span className={preview.error ? "field-error" : "field-hint"} role="status">
            {preview.error ? t("Preview unavailable.") : preview.loading ? t("Loading preview…") : null}
          </span>
        </div>
        <DevicePreviewFrame width={preview.paneWidth} frameRef={preview.frameRef} paneWidth={preview.paneWidth} expanded>
          <iframe title={t("Preview")} className="page-preview-iframe" sandbox="" srcDoc={preview.document} />
        </DevicePreviewFrame>
      </section>
      {vm.libraryError ? <p className="field-error" role="alert">{vm.libraryError}</p> : null}
      {vm.picker ? <LibraryPicker vm={vm} t={t} base={base} /> : null}
    </div>
  );
}

function MediaTab({ vm, t, base }: { vm: MediaContentEditorController; t: Translate; base: string | undefined }) {
  const layoutLabelId = useId();
  return (
    <>
      <div className="media-content-editor__toolbar">
        <span className="media-content-editor__field">
          <span id={layoutLabelId}>{t("Layout")}</span>
          <span className="segmented media-content-editor__layouts" role="radiogroup" aria-labelledby={layoutLabelId}>
            {vm.layouts.map((layout) => (
              <button key={layout} type="button" role="radio" aria-checked={vm.media.layout === layout}
                className={vm.media.layout === layout ? "is-active" : undefined} onClick={() => vm.setLayout(layout)}
                {...handle(base, `layout-${layout}`, "button", `Use the ${layout} layout`)}>
                {layoutLabel(layout, t)}
              </button>
            ))}
          </span>
        </span>
        {vm.showColumns ? (
          <label className="media-content-editor__field">
            {t("Columns")}
            <input type="number" min={1} max={6} className="media-content-editor__number" value={vm.media.columns ?? 3}
              onChange={(event) => vm.setColumns(event.target.value)} {...handle(base, "columns", "field", "Number of columns")} />
          </label>
        ) : null}
        <span className="media-content-editor__field">
          <label>
            {t("Aspect ratio")}
            <input className="field-mono media-content-editor__ratio" placeholder="4/3" value={vm.media.aspectRatio ?? ""}
              onChange={(event) => vm.setAspectRatio(event.target.value)} {...handle(base, "aspect-ratio", "field", "Aspect ratio, e.g. 16/9")} />
          </label>
          <InfoTip label={t("e.g. 1, 4/3, 16/9")} />
        </span>
      </div>

      {vm.rows.length === 0 ? (
        <p className="field-hint media-content-editor__empty">{t("No media yet. Choose from the library or add one by slug.")}</p>
      ) : (
        <ol className="media-content-editor__items">
          {/* Index keys: a row's slug is editable, so keying on it would remount the row (and drop
              focus) on every keystroke; values are controlled, so reordering stays correct. */}
          {vm.rows.map((row, index) => <MediaItemRowView key={index} row={row} index={index} vm={vm} t={t} />)}
        </ol>
      )}

      <AddMediaRow vm={vm} t={t} base={base} />
      <AttributesSection vm={vm} t={t} base={base} />
    </>
  );
}

function Thumbnail({ row, vm, t }: { row: MediaItemRow; vm: MediaContentEditorController; t: Translate }) {
  if (row.problem === "unknown") return <span className="media-content-editor__thumb is-missing"><Icon name="alert-triangle" size={18} aria-hidden="true" /></span>;
  if (row.asset && row.kind === "image") return <img className="media-content-editor__thumb" src={vm.mediaUrl(row.asset)} alt="" loading="lazy" width={48} height={48} />;
  if (row.kind === "video") return <span className="media-content-editor__thumb" title={t("Video file")}><Icon name="play" size={18} aria-label={t("Video file")} /></span>;
  if (row.kind === "audio") return <span className="media-content-editor__thumb" title={t("Audio file")}><Icon name="volume" size={18} aria-label={t("Audio file")} /></span>;
  return <span className="media-content-editor__thumb"><Icon name="image" size={18} aria-hidden="true" /></span>;
}

function MediaItemRowView({ row, index, vm, t }: { row: MediaItemRow; index: number; vm: MediaContentEditorController; t: Translate }) {
  const n = index + 1;
  const last = index === vm.rows.length - 1;
  return (
    <li className="media-content-editor__row">
      <Thumbnail row={row} vm={vm} t={t} />
      <input className={`field-mono media-content-editor__slug${row.showsSlugEnd ? " is-end-first" : ""}`} value={row.item.slug} spellCheck={false} autoComplete="off"
        aria-label={`${t("Media slug")} ${n}`} aria-invalid={row.problem ? true : undefined} title={row.item.slug}
        onChange={(event) => vm.updateItem(index, { slug: event.target.value.trim() })} />
      {/* Clearing alt/caption omits the key, so the library's own text is used at render time
          (contract); the placeholder shows that fallback. */}
      <input className="media-content-editor__alt" value={row.item.alt ?? ""} placeholder={row.asset?.alt || t("Alt text")}
        aria-label={`${t("Alt text")} ${n}`} onChange={(event) => vm.updateItem(index, { alt: event.target.value || undefined })} />
      <input className="media-content-editor__caption" value={row.item.caption ?? ""} placeholder={row.asset?.caption || t("Caption")}
        aria-label={`${t("Caption")} ${n}`} onChange={(event) => vm.updateItem(index, { caption: event.target.value || undefined })} />
      {/* The admin's white tip, not the browser's dark `title` one (owner, 2026-10-11). */}
      <span className="media-content-editor__row-actions">
        <DockHeaderTip label={t("Move up")}>
          <button type="button" className="btn-ghost media-content-editor__icon" disabled={index === 0}
            aria-label={`${t("Move up")} ${n}`} onClick={() => vm.moveItem(index, -1)}>
            <Icon name="arrow-up" size={14} aria-hidden="true" />
          </button>
        </DockHeaderTip>
        <DockHeaderTip label={t("Move down")}>
          <button type="button" className="btn-ghost media-content-editor__icon is-down" disabled={last}
            aria-label={`${t("Move down")} ${n}`} onClick={() => vm.moveItem(index, 1)}>
            <Icon name="arrow-up" size={14} aria-hidden="true" />
          </button>
        </DockHeaderTip>
        <DockHeaderTip label={t("Remove")}>
          <button type="button" className="btn-ghost media-content-editor__icon"
            aria-label={`${t("Remove")} ${n}`} onClick={() => vm.removeItem(index)}>
            <Icon name="close" size={14} aria-hidden="true" />
          </button>
        </DockHeaderTip>
      </span>
      {row.problem ? <p className="field-error media-content-editor__row-error">{row.problem === "unknown" ? t("Not in the media library") : problemText(row.problem, row.item.slug, t)}</p> : null}
    </li>
  );
}

function AddMediaRow({ vm, t, base }: { vm: MediaContentEditorController; t: Translate; base: string | undefined }) {
  const listId = useId();
  const full = vm.rows.length >= vm.maxItems;
  return (
    <>
      <div className="media-content-editor__add">
        <button type="button" className="btn-secondary media-content-editor__compact" disabled={full} onClick={() => vm.openPicker("items")}
          {...handle(base, "choose", "button", "Choose media from the library")}>
          <Icon name="image" size={14} aria-hidden="true" />
          {t("Choose from library")}
        </button>
        <span className="media-content-editor__slug-add">
          <input className="field-mono" list={listId} value={vm.slugDraft} placeholder={t("Add by slug")} aria-label={t("Add by slug")}
            spellCheck={false} autoComplete="off" disabled={full} aria-invalid={vm.slugProblem ? true : undefined}
            onChange={(event) => vm.setSlugDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); vm.addSlug(); } }}
            {...handle(base, "slug", "field", "Media slug to add")} />
          <button type="button" className="btn-ghost media-content-editor__compact" disabled={full} onClick={vm.addSlug}
            {...handle(base, "slug-add", "button", "Add the typed media slug")}>
            <Icon name="plus" size={14} aria-hidden="true" />
            {t("Add")}
          </button>
        </span>
        <span className="field-hint media-content-editor__count">{vm.rows.length} / {vm.maxItems}</span>
        <datalist id={listId}>
          {(vm.pickable ?? []).map((asset) => <option key={asset.id} value={asset.slug}>{asset.title}</option>)}
        </datalist>
      </div>
      {vm.slugProblem ? <p className="field-error" role="alert">{problemText(vm.slugProblem.problem, vm.slugProblem.slug, t)}</p> : null}
    </>
  );
}

function AttributesSection({ vm, t, base }: { vm: MediaContentEditorController; t: Translate; base: string | undefined }) {
  return (
    <div className="media-content-editor__attrs">
      <div className="media-content-editor__toolbar">
        <label className="media-content-editor__field">
          {t("CSS class")}
          <input className="field-mono media-content-editor__class" value={vm.media.cssClass ?? ""} spellCheck={false}
            onChange={(event) => vm.setCssClass(event.target.value)} {...handle(base, "css-class", "field", "CSS class on the layout root")} />
        </label>
        <span className="media-content-editor__field">
          {t("HTML attributes")}
          <InfoTip label={t("data-*, aria-*, class, id, style. Unsafe ones are dropped.")} />
        </span>
      </div>
      <HtmlAttributeRows value={vm.media.htmlAttributes ?? ""} onChange={vm.setHtmlAttributes} t={t} agentHandle={base} />
    </div>
  );
}

function HtmlTab({ vm, t, base }: { vm: MediaContentEditorController; t: Translate; base: string | undefined }) {
  return (
    <>
      <div className="media-content-editor__toolbar">
        <button type="button" className="btn-secondary media-content-editor__compact" onClick={() => vm.openPicker("html")}
          {...handle(base, "insert-media", "button", "Insert library media at the cursor")}>
          <Icon name="image" size={14} aria-hidden="true" />
          {t("Insert media…")}
        </button>
        <InfoTip label={t('Use {{media:slug}} for a file\'s URL, or data-media-slug="slug" on img, video, audio or source to fill in src, alt and size.')} />
        <span className={`field-hint media-content-editor__count${vm.htmlTooLong ? " is-over" : ""}`}>
          {vm.html.length.toLocaleString()} / {vm.maxHtmlLength.toLocaleString()}
        </span>
      </div>
      <div className="media-content-editor__code">
        <div ref={vm.gutterRef} className="media-content-editor__gutter" aria-hidden="true">
          {Array.from({ length: vm.htmlLines }, (_, i) => i + 1).join("\n")}
        </div>
        <textarea ref={vm.htmlRef} className="media-content-editor__source" value={vm.html} wrap="off" spellCheck={false}
          aria-label={t("HTML source")} aria-invalid={vm.htmlTooLong ? true : undefined} placeholder={'<img data-media-slug="…" alt="…">'}
          onChange={(event) => vm.setHtml(event.target.value)} onScroll={vm.onHtmlScroll}
          {...handle(base, "html", "field", "Raw HTML for this media content")} />
      </div>
      {vm.htmlTooLong ? (
        <p className="field-error" role="alert">
          {interpolate({ template: t("HTML is longer than {max} characters and won't save."), vars: { max: vm.maxHtmlLength.toLocaleString() } })}
        </p>
      ) : null}
    </>
  );
}

function PickerThumb({ asset, vm }: { asset: AdminMedia; vm: MediaContentEditorController }) {
  if (asset.contentType?.startsWith("video/")) return <span className="media-content-editor__picker-icon"><Icon name="play" size={22} aria-hidden="true" /></span>;
  if (asset.contentType?.startsWith("audio/")) return <span className="media-content-editor__picker-icon"><Icon name="volume" size={22} aria-hidden="true" /></span>;
  return <img src={vm.mediaUrl(asset)} alt="" loading="lazy" />;
}

/** Multi-select over the active library — images, video and audio. Same grid/item classes as
 *  `MediaPickerDialog`, checkbox per asset since several can be added at once. */
function LibraryPicker({ vm, t, base }: { vm: MediaContentEditorController; t: Translate; base: string | undefined }) {
  return (
    <Dialog open onClose={vm.cancelPicker} title={t("Choose media")} className="settings-dialog tovu-domain-dialog media-picker-dialog">
      <div className="media-picker-body">
        {vm.pickable === null ? <p className="notice">{t("Loading media…")}</p> : (
          <div className="media-picker-grid">
            {vm.pickable.map((asset) => (
              <label key={asset.id} className="media-picker-item" title={asset.slug}>
                <input type="checkbox" checked={vm.picked.includes(asset.slug)} onChange={() => vm.togglePicked(asset.slug)} />
                <PickerThumb asset={asset} vm={vm} />
                <span className="media-picker-item-title">{asset.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="widget-picker-footer">
        <span className="editor-actions">
          <button data-jini-autofocus="" type="button" className="btn-secondary" onClick={vm.cancelPicker}>{t("Cancel")}</button>
          <button type="button" className="btn-primary" disabled={vm.picked.length === 0} onClick={vm.confirmPicker}
            {...handle(base, "picker-add", "button", "Add the checked media")}>
            {t("Add selected")}
          </button>
        </span>
      </div>
    </Dialog>
  );
}
