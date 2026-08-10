import { useRef } from "react";
import type { AdminMedia } from "../../lib/api";
import { RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import { MediaProvidersTab } from "@jini-ai/ui";

import { MEDIA_PROVIDER_CATALOG } from "./media-provider-catalog";
import { mediaProvidersPort } from "./media-providers-port";
import "@jini-ai/ui/settings-dialog.css";
import { mediaRowMenuItems } from "./rules";
import { useMedia } from "./hooks/use-media.hooks";
import { useMediaPreview } from "./hooks/use-media-preview.hooks";
import { useEditMediaPanel } from "./hooks/use-edit-media-panel.hooks";
import { useMediaLightbox } from "./hooks/use-media-lightbox.hooks";
import { useMediaTabs, MEDIA_TABS } from "./hooks/use-media-tabs.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { MEDIA_DICT } from "./media-i18n";

/**
 * @file Media admin screen — list + upload + trash/purge ladder, wiring the `media` backend into
 * the admin UI. Markup only: state, effects, and API calls for all four components in this file
 * (`Media`, `MediaPreview`, `EditMediaPanel`, `MediaLightbox`) live in their own `hooks/use-<thing>
 * .hooks.ts`; computed values (alt-text fallback, the row-menu builder, the editing-item lookup,
 * the lightbox index math) live in `rules.ts`.
 *
 * MSG-05: rewritten from a `.list-table` of filenames into a preview grid (image/video on top,
 * title underneath) now that a byte-serving route exists —
 * `GET /workspaces/{workspaceId}/media/{mediaId}/original` (authenticated, same-origin, Range
 * support for video seeking, `Content-Type` sniffed server-side from magic bytes). See
 * `api.mediaOriginalUrl`'s own comment for the URL contract.
 *
 * The hard problem this rewrite has to solve: **the media list response carries no content type**
 * (neither `media` nor `asset_blobs` stores one — upload validates `contentType` then discards
 * it), so nothing in `AdminMedia` tells the client whether a given asset is an image, a video, or
 * something unpreviewable. `MediaPreview` below resolves this client-side with an optimistic
 * render-and-fall-back chain (`<img>` → onError → `<video>` → onError → placeholder) rather than a
 * HEAD probe per card. Chosen over the HEAD approach because: (1) the byte route's documented
 * contract covers GET — sniffing/Range were specified for that, not for HEAD, so building on HEAD
 * would be assuming a behavior nobody confirmed; (2) a HEAD-first design means every card blocks on
 * a round trip before any pixel paints, working against the fixed-aspect-box + lazy-loading this
 * grid needs anyway, whereas the optimistic path costs nothing extra for the common case (a real
 * image just loads) and only "wastes" a request for the video/unsupported minority — and even then,
 * a browser's image decoder typically fails off the header bytes rather than pulling the whole
 * file; (3) it composes for free with the server's security defusal: a sniffed HTML/SVG comes back
 * as `application/octet-stream` with `Content-Disposition: attachment`, which is not a valid image
 * OR video MIME, so it fails both probes and lands on the placeholder with zero special-casing —
 * this file never needs to detect "is this the defused case" itself.
 *
 * SPEC-037 REQ-01: `EditMediaPanel` (renamed from `EditMediaRow` — no longer a table row now that
 * this screen is a card grid, not a table) is the `api.updateMedia` metadata-edit affordance:
 * title/alt/caption/credit, sending only the fields the user actually changed (partial-patch,
 * matching `updateMediaMetadata`'s own optional-field contract) rather than the whole draft object.
 * Unchanged by this rewrite — only its wrapping markup moved.
 *
 * Row actions moved into a `RowMenu` (one More menu per card, per MSG-05) instead of always-visible
 * buttons — Edit metadata, and Trash or Delete permanently depending on `status`. The
 * `window.confirm` that used to guard permanent delete is now `ConfirmDialog`, matching
 * `Posts.tsx`'s pattern: `pendingPurge` + `rowSavingId` state, dialog mounted unconditionally.
 * Trashing stays a single unconfirmed action (as before) — only the irreversible purge step gates
 * on the dialog, matching the original code's own trash-vs-purge asymmetry.
 *
 * Lightbox: `MediaLightbox` below opens a card's asset large. It is ONE shared `<dialog>` instance
 * for the whole grid — `lightboxIndex: number | null` state in `Media()` indexes into `media`,
 * exactly the same shape as `pendingPurge` already driving the single shared `ConfirmDialog` above
 * — not one `<dialog>` mounted per card. A grid can hold dozens of assets; mounting N real
 * `<dialog>` elements (each portaled into the browser's top layer by `showModal()`) to show at
 * most one open at a time buys nothing and costs N DOM subtrees. `useId()` is still used for the
 * shared instance's own heading id (not a hardcoded string) — not because a *second* concurrent
 * `MediaLightbox` exists today (it doesn't; one shared instance structurally cannot self-collide),
 * but because "no hardcoded dialog id" is this codebase's standing rule after the `ConfirmDialog`/
 * `Roles.tsx` incident (see that component's own doc comment), and a future caller mounting a
 * second `MediaLightbox` elsewhere should not have to rediscover that the hard way.
 */

/** Generic "file" glyph for an asset that fails both the image and video probe — stroke-based,
 *  matching `nav.ts`'s icon convention elsewhere in this app (viewBox 0 0 18 18, currentColor). */
function PlaceholderIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M5 2h6l3 3v11H5V2z" strokeLinejoin="round" />
      <path d="M11 2v3h3" strokeLinejoin="round" />
    </svg>
  );
}

/** "View larger" glyph for the lightbox trigger overlaid on a card's preview (four open corners —
 *  the conventional expand/fullscreen affordance), same stroke style as this file's other icons. */
function ExpandIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M6 2H2v4M12 2h4v4M6 16H2v-4M12 16h4v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "×" close glyph for the lightbox header. */
function CloseIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M4 4l10 10M14 4L4 14" strokeLinecap="round" />
    </svg>
  );
}

/** Chevron used for both lightbox nav arrows — `flip` mirrors it horizontally for "next" rather
 *  than shipping a second glyph, the same "one shape, two states" idiom `Sidebar.tsx`'s rail-toggle
 *  chevron already uses (see `styles.css`'s `.cms-nav.is-rail .cms-rail-toggle svg` comment). */
function ChevronIcon(props: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      style={props.flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M11 3.5 5.5 9l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MediaPreviewProps {
  item: AdminMedia;
  onExpand?: () => void;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useMediaPreviewHook?: typeof useMediaPreview;
  /** Translator closure — see `Media()`'s own `t` for where this comes from; threaded through the
   *  lightbox too, since it remounts this same component for its enlarged view. */
  t: (key: string) => string;
}

/** Resolves whether an asset previews as an image, a video, or neither — see this file's header
 * comment for why this is a client-side fallback chain rather than a server content-type read.
 *
 * `onExpand`, when passed, overlays a small "view larger" icon button on the preview that calls it
 * (used by the grid card to open `MediaLightbox`; omitted when `MediaLightbox` itself reuses this
 * same component to render its own enlarged content, so the lightbox never grows a nested trigger
 * for itself). Deliberately NOT a click handler on the whole preview box: the `"video"` stage below
 * renders a live `<video controls>`, and (a) interactive content cannot legally nest inside a
 * `<button>`, so a whole-preview `<button>` wrapper is not an option for that stage, and (b) even
 * without the nesting rule, a whole-box click target would swallow clicks aimed at the video's own
 * play/seek bar. A small corner icon works identically for both the `"image"` and `"video"` stages,
 * so the interaction model doesn't change per asset type. Omitted entirely for `"unsupported"` —
 * that stage already renders a "Download original" link, and the lightbox would show nothing more
 * than the exact same placeholder, just bigger. */
function MediaPreview(props: MediaPreviewProps) {
  const { useMediaPreviewHook = useMediaPreview, t } = props;
  const { stage, src, altText, handleImageError, handleVideoError } = useMediaPreviewHook(props.item);

  if (stage === "unsupported") {
    // Not a bare icon: a non-previewable asset (most often the server's own defused HTML/SVG
    // response — `application/octet-stream` + `Content-Disposition: attachment`, deliberately
    // non-rendering) is not a *broken* asset. The byte route worked; there's just nothing to draw
    // inline. So this still gives the operator a way to get the file, via the same `/original`
    // URL a working preview would have used as its `src` — the attachment header makes that link a
    // real download/open action, not a failed attempt to render it again.
    return (
      <div className="media-card-placeholder">
        <PlaceholderIcon />
        <p className="media-card-placeholder-text">{t("Preview not available")}</p>
        <a className="media-card-placeholder-link" href={src} target="_blank" rel="noreferrer">
          {t("Download original")}
        </a>
      </div>
    );
  }

  const expandButton = props.onExpand ? (
    <button
      type="button"
      className="media-card-expand"
      aria-label={`View "${props.item.title}" larger`}
      onClick={props.onExpand}
    >
      <ExpandIcon />
    </button>
  ) : null;

  if (stage === "video") {
    return (
      <>
        <video
          className="media-card-media"
          src={src}
          controls
          preload="metadata"
          aria-label={altText}
          onError={handleVideoError}
        />
        {expandButton}
      </>
    );
  }

  return (
    <>
      <img
        className="media-card-media"
        src={src}
        alt={altText}
        loading="lazy"
        onError={handleImageError}
      />
      {expandButton}
    </>
  );
}

interface EditMediaPanelProps {
  item: AdminMedia;
  onSaved: () => void;
  onCancel: () => void;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useEditMediaPanelHook?: typeof useEditMediaPanel;
  /** Translator closure — see `Media()`'s own `t`. */
  t: (key: string) => string;
}

/** Inline edit panel for one media item's title/alt/caption/credit (REQ-01). No longer a table
 *  row (this screen is a card grid) — rendered as its own full-width `.card` above the grid so an
 *  in-progress edit is never squeezed into one grid cell's width, and expanding it never reflows
 *  its siblings' cells. */
function EditMediaPanel(props: EditMediaPanelProps) {
  const { item, onSaved, onCancel, useEditMediaPanelHook = useEditMediaPanel, t } = props;
  const {
    draft,
    setTitle,
    setAlt,
    setCaption,
    setCredit,
    setWidth,
    setHeight,
    setCssClass,
    saving,
    error,
    hashCopied,
    urlCopied,
    originalUrl,
    copyHash,
    copyUrl,
    save,
  } = useEditMediaPanelHook({ item, onSaved, onCancel });

  return (
    <div className="card media-edit-panel">
      <div className="editor-header">
        <h2>
          {t("Editing")} "{item.title}"
        </h2>
      </div>
      {/* Field layout per the OD reference (od-settings-external-mcp-customform.png): uppercase
          letterspaced label above its control (`.field-label`), short fields pairing into a
          row (`.field-row`) instead of every field stacking full-width regardless of length. */}
      <div className="field-group">
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-title-${item.id}`}>
              {t("Title")}
            </label>
            <input
              id={`media-edit-title-${item.id}`}
              value={draft.title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-alt-${item.id}`}>
              {t("Alt")}
            </label>
            <input
              id={`media-edit-alt-${item.id}`}
              value={draft.alt}
              onChange={(e) => setAlt(e.target.value)}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-caption-${item.id}`}>
              {t("Caption")}
            </label>
            <input
              id={`media-edit-caption-${item.id}`}
              value={draft.caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-credit-${item.id}`}>
              {t("Credit")}
            </label>
            <input
              id={`media-edit-credit-${item.id}`}
              value={draft.credit}
              onChange={(e) => setCredit(e.target.value)}
            />
          </div>
        </div>
        {/* Quick-and-dirty public-render sizing fields (owner-directed skip-the-ADR fix — images
            inserted into post bodies were rendering at full native pixel width with no way to
            control size). Both optional, pixel-size numeric inputs: leaving either (or both) blank
            means "render at native/as-is size" — the public renderer omits the attribute entirely
            rather than defaulting to a computed value. Own row directly under Caption/Credit, per
            owner's explicit placement instruction. */}
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-width-${item.id}`}>
              {t("Width (px)")}
            </label>
            <input
              id={`media-edit-width-${item.id}`}
              type="number"
              min={1}
              placeholder="native"
              value={draft.width ?? ""}
              onChange={(e) => setWidth(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-height-${item.id}`}>
              {t("Height (px)")}
            </label>
            <input
              id={`media-edit-height-${item.id}`}
              type="number"
              min={1}
              placeholder="native"
              value={draft.height ?? ""}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`media-edit-css-class-${item.id}`}>
            {t("CSS class (optional)")}
          </label>
          <input
            id={`media-edit-css-class-${item.id}`}
            value={draft.cssClass ?? ""}
            onChange={(e) => setCssClass(e.target.value)}
          />
        </div>
        {/* User report: "where is the location of the asset? I dont see the location data" — there
            was no answer to that anywhere in this panel. Same read-only+Copy shape as the sha256
            row below (this component's own established idiom for "show it, let it be copied, it
            isn't something you type into"), but a clickable `<a>` instead of `<code>` since this
            value is a real, followable URL, not an opaque identifier. */}
        <div className="field">
          <span className="field-label">{t("File URL")}</span>
          <div className="field-readonly-row">
            <a
              className="field-mono field-readonly"
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
            >
              {originalUrl}
            </a>
            <button type="button" className="btn-ghost" onClick={copyUrl}>
              {urlCopied ? t("Copied") : t("Copy")}
            </button>
          </div>
        </div>
        {/* Integrity/dedupe metadata, demoted out of the main view — genuinely useful when
            chasing a duplicate upload or verifying a file, noise the rest of the time. Read-only:
            this is a content hash, not something an operator edits. Monospace per the OD idiom
            for values that are code/identifiers, not prose. */}
        <div className="field">
          <span className="field-label">{t("sha256")}</span>
          <div className="field-readonly-row">
            <code className="field-mono field-readonly">{item.sha256}</code>
            <button type="button" className="btn-ghost" onClick={copyHash}>
              {hashCopied ? t("Copied") : t("Copy")}
            </button>
          </div>
        </div>
        <span className="editor-actions">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? t("Saving…") : t("Save")}
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            {t("Cancel")}
          </button>
        </span>
      </div>
      {error ? (
        <span className="save-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface MediaLightboxProps {
  /** The full grid list, not just the open item — see `use-media-lightbox.hooks.ts`'s
   *  `MediaLightboxHookProps` for why this is the whole array rather than a resolved item. */
  items: AdminMedia[];
  /** Index into `items` that is open, or `null` when closed — see the hook props' own comment for
   *  why an index rather than the item itself. */
  activeIndex: number | null;
  onNavigate: (index: number) => void;
  onClose: () => void;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useMediaLightboxHook?: typeof useMediaLightbox;
  /** Translator closure — see `Media()`'s own `t`; forwarded to the `MediaPreview` this remounts. */
  t: (key: string) => string;
}

/**
 * Single shared lightbox `<dialog>` for the whole Media grid — see this file's header comment for
 * why one shared instance is used instead of one per card. Controlled exactly like `ConfirmDialog`
 * (native `<dialog>`, stays mounted unconditionally, `showModal()`/`close()` driven by an effect,
 * guarded by the same jsdom-compat `typeof` check `ConfirmDialog` uses — jsdom 29 implements
 * neither method) — see that component's own doc comment for the full rationale of building on
 * native `<dialog>` rather than a hand-rolled focus-trap/backdrop `<div>`.
 *
 * Renders the enlarged asset via the SAME `MediaPreview` the grid card uses (not a lightbox-
 * specific clone of the image/video/placeholder fallback chain) — `media.css`'s `.media-lightbox-
 * media` scope re-skins `.media-card-media`/`.media-card-placeholder` for a contain-fit, full-size
 * presentation purely in CSS, so the fallback logic itself (and the property that a defused
 * octet-stream asset lands on the placeholder with zero special-casing) is defined in exactly one
 * place.
 */
function MediaLightbox(props: MediaLightboxProps) {
  const { items, activeIndex, onNavigate, onClose, useMediaLightboxHook = useMediaLightbox, t } = props;
  const { titleId, dialogRef, closeRef, item, hasPrev, hasNext, handleNativeCancel, handleBackdropClick, handleKeyDown, goToPrev, goToNext } =
    useMediaLightboxHook({ items, activeIndex, onNavigate, onClose });

  return (
    <dialog
      ref={dialogRef}
      className="media-lightbox"
      aria-labelledby={item ? titleId : undefined}
      onCancel={handleNativeCancel}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      {item ? (
        <>
          <div className="media-lightbox-header">
            <h2 id={titleId} className="media-lightbox-title">
              {item.title}
            </h2>
            {items.length > 1 ? (
              <span className="media-lightbox-counter">
                {activeIndex! + 1} / {items.length}
              </span>
            ) : null}
            <button type="button" ref={closeRef} className="media-lightbox-close" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
          <div className="media-lightbox-stage">
            {hasPrev ? (
              <button
                type="button"
                className="media-lightbox-nav media-lightbox-nav-prev"
                aria-label="Previous asset"
                onClick={goToPrev}
              >
                <ChevronIcon />
              </button>
            ) : null}
            <div className="media-lightbox-media">
              {/* `key` is load-bearing, not a list-reconciliation habit: `useMediaPreview`'s `stage`
                  is component state with no reset-on-`item` effect, and this ONE shared lightbox
                  instance sits at a fixed tree position across prev/next. Without a changing key
                  React keeps the instance, so a PDF that fell all the way through to `"unsupported"`
                  leaves the next asset stuck on the placeholder even when it is a perfectly good
                  image. The grid cards never hit this — each card owns its own instance. */}
              <MediaPreview key={item.id} item={item} t={t} />
            </div>
            {hasNext ? (
              <button
                type="button"
                className="media-lightbox-nav media-lightbox-nav-next"
                aria-label="Next asset"
                onClick={goToNext}
              >
                <ChevronIcon flip />
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </dialog>
  );
}

/** The upload row — file picker, alt-text draft, and the Upload button. Extracted out of `Media`
 *  because its "Uploading…"/"Upload" label ternary was one of that component's independent
 *  branches; as a top-level function it's scored in its own scope instead. */
function MediaToolbar({
  fileInputRef,
  altDraft,
  setAltDraft,
  upload,
  uploading,
  t,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  altDraft: string;
  setAltDraft: (value: string) => void;
  upload: () => void;
  uploading: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="toolbar">
      <input ref={fileInputRef} className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
      <input value={altDraft} onChange={(e) => setAltDraft(e.target.value)} placeholder={t("Alt text (optional)")} />
      <button onClick={upload} disabled={uploading}>
        {uploading ? t("Uploading…") : t("Upload")}
      </button>
    </div>
  );
}

/** The purge-confirmation dialog — extracted out of `Media` for the same reason as
 *  `MediaToolbar`: its `pendingPurge`-derived `body`/`pending` expressions were two more of that
 *  component's independent branches. */
function MediaPurgeDialog({
  pendingPurge,
  rowSavingId,
  onConfirm,
  onCancel,
  t,
}: {
  pendingPurge: AdminMedia | null;
  rowSavingId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  return (
    <ConfirmDialog
      open={pendingPurge !== null}
      title={t("Delete permanently?")}
      body={
        pendingPurge ? (
          <p>
            {t("Permanently delete")} &quot;{pendingPurge.title}&quot;? {t("This cannot be undone.")}
          </p>
        ) : null
      }
      confirmLabel={t("Delete permanently")}
      destructive
      pending={pendingPurge !== null && rowSavingId === pendingPurge.id}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export interface MediaProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useMediaHook?: typeof useMedia;
}

/** "Images"/"Videos" tab body — see `Media()`'s own comment at the tab-bar mount site for why
 *  these don't filter the grid yet: `AdminMedia` carries no content type to filter by. */
function MediaTypeFilterPlaceholder({ kind, t }: { kind: "images" | "videos"; t: (key: string) => string }) {
  return (
    <div className="card">
      <div className="empty-state">
        <p>{t("Filtering by type isn't wired up yet.")}</p>
        <p className="page-description">
          The media list doesn't carry a content type to filter by today (see this file's header
          comment) — the "{kind === "images" ? t("Images") : t("Videos")}" tab is here to confirm the
          layout; it will show a filtered grid once that gap closes.
        </p>
      </div>
    </div>
  );
}

export function Media({ useMediaHook = useMedia }: MediaProps = {}) {
  const {
    media,
    error,
    uploading,
    altDraft,
    setAltDraft,
    fileInputRef,
    upload,
    editingId,
    editingItem,
    toggleEditing,
    onMetadataSaved,
    setEditingId,
    trash,
    pendingPurge,
    setPendingPurge,
    rowSavingId,
    purge,
    lightboxIndex,
    setLightboxIndex,
  } = useMediaHook();
  const { activeTab, setActiveTab } = useMediaTabs();
  const locale = useAdminLocale();
  const t = (key: string): string => MEDIA_DICT[locale]?.[key] ?? key;

  if (error && !media) return <div className="notice error">{error}</div>;
  if (!media) return <div className="notice">Loading media…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Media")}</h1>
          <p className="page-description">{t("Upload and manage image and video assets used across the site.")}</p>
        </div>
      </div>

      {/* OD-parity tab bar (owner instruction, 2026-08-08); see `use-media-tabs.hooks.ts` for why
          this is still plain tab state rather than a URL-synced `?tab=`. "Media providers" mounts
          `@jini-ai/ui`'s component against Tovu's own backend: credentials persist per workspace
          in `media_provider_credentials` and survive a reload. Both the port and the catalog are
          module-level constants, so neither needs a `useRef` to stay stable across renders. */}
      <div className="media-tabs" role="tablist" aria-label="Media">
        {MEDIA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="media-tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {activeTab === "media-providers" ? (
        // `data-theme="light"` is REQUIRED, not cosmetic — same trap `AiAssistant.tsx` and
        // `PlaceholderTabs.tsx` already document at their own mounts of `@jini-ai/ui/settings-
        // dialog.css` content: with no `data-theme` ancestor, the stylesheet falls through to its
        // `@media (prefers-color-scheme: dark)` variant, so this tab renders dark on any OS/browser
        // set to dark mode while the rest of the (light-only) admin shell stays light. This screen
        // has no appearance control of its own, so pin to light rather than leave it themable.
        <div data-theme="light">
          <MediaProvidersTab port={mediaProvidersPort} catalog={MEDIA_PROVIDER_CATALOG} />
        </div>
      ) : activeTab === "images" ? (
        <MediaTypeFilterPlaceholder kind="images" t={t} />
      ) : activeTab === "videos" ? (
        <MediaTypeFilterPlaceholder kind="videos" t={t} />
      ) : (
        <>
          {error ? <div className="notice error">{error}</div> : null}
          <MediaToolbar
            fileInputRef={fileInputRef}
            altDraft={altDraft}
            setAltDraft={setAltDraft}
            upload={upload}
            uploading={uploading}
            t={t}
          />

          {editingItem ? (
            <EditMediaPanel
              item={editingItem}
              onSaved={onMetadataSaved}
              onCancel={() => setEditingId(null)}
              t={t}
            />
          ) : null}

          {media.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <p>{t("No media uploaded yet.")}</p>
                <p className="page-description">{t("Choose a file above and upload it to get started.")}</p>
              </div>
            </div>
          ) : (
            <div className="media-grid">
              {media.map((item, index) => (
                <div className="media-card" key={item.id}>
                  <div className="media-card-preview">
                    <MediaPreview item={item} onExpand={() => setLightboxIndex(index)} t={t} />
                  </div>
                  <div className="media-card-body">
                    <p className="media-card-title" title={item.title}>
                      {item.title}
                    </p>
                    <div className="media-card-meta">
                      <span className={`status status-${item.status}`}>{item.status}</span>
                      <RowMenu
                        triggerLabel={`Actions for "${item.title}"`}
                        items={mediaRowMenuItems(
                          item,
                          editingId,
                          {
                            onToggleEdit: toggleEditing,
                            onTrash: trash,
                            onRequestPurge: setPendingPurge,
                          },
                          locale,
                        )}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <MediaLightbox
            items={media}
            activeIndex={lightboxIndex}
            onNavigate={setLightboxIndex}
            onClose={() => setLightboxIndex(null)}
            t={t}
          />

          <MediaPurgeDialog
            pendingPurge={pendingPurge}
            rowSavingId={rowSavingId}
            onConfirm={purge}
            onCancel={() => setPendingPurge(null)}
            t={t}
          />
        </>
      )}
    </div>
  );
}
