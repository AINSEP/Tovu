import { useEffect, useId, useRef, useState } from "react";
import { ApiError, api, type AdminMedia } from "../lib/api";
import { RowMenu, type RowMenuItem } from "../components/RowMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";

/**
 * @file Media admin screen — list + upload + trash/purge ladder, wiring the `media` backend into
 * the admin UI.
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

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Editable metadata fields `api.updateMedia` accepts — kept as its own type so the diffing
 * helper below stays exhaustive if the patch shape ever grows. */
type MediaMetadataPatch = { title?: string; alt?: string; caption?: string; credit?: string };

/** Builds a partial patch containing only the fields whose draft value differs from `item`'s
 * current value — the backend's own contract is optional-field/partial-patch, so this never
 * sends an unchanged field (AC-01's "field left unchanged is not overwritten" proof). */
function diffMediaMetadata(required: {
  item: AdminMedia;
  draft: Required<MediaMetadataPatch>;
}): MediaMetadataPatch {
  const { item, draft } = required;
  const patch: MediaMetadataPatch = {};
  if (draft.title !== item.title) patch.title = draft.title;
  if (draft.alt !== item.alt) patch.alt = draft.alt;
  if (draft.caption !== item.caption) patch.caption = draft.caption;
  if (draft.credit !== item.credit) patch.credit = draft.credit;
  return patch;
}

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

type PreviewStage = "image" | "video" | "unsupported";

/** Resolves whether an asset previews as an image, a video, or neither — see this file's header
 *  comment for why this is a client-side fallback chain rather than a server content-type read.
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
function MediaPreview(props: { item: AdminMedia; onExpand?: () => void }) {
  const [stage, setStage] = useState<PreviewStage>("image");
  const src = api.mediaOriginalUrl(props.item.id);
  const altText = props.item.alt || props.item.title || "Untitled asset";

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
        <p className="media-card-placeholder-text">Preview not available</p>
        <a className="media-card-placeholder-link" href={src} target="_blank" rel="noreferrer">
          Download original
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
          onError={() => setStage("unsupported")}
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
        onError={() => setStage("video")}
      />
      {expandButton}
    </>
  );
}

/** Inline edit panel for one media item's title/alt/caption/credit (REQ-01). No longer a table
 *  row (this screen is a card grid) — rendered as its own full-width `.card` above the grid so an
 *  in-progress edit is never squeezed into one grid cell's width, and expanding it never reflows
 *  its siblings' cells. */
function EditMediaPanel(props: { item: AdminMedia; onSaved: () => void; onCancel: () => void }) {
  const { item } = props;
  const [draft, setDraft] = useState<Required<MediaMetadataPatch>>({
    title: item.title,
    alt: item.alt,
    caption: item.caption,
    credit: item.credit,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Feedback for the sha256 copy affordance below — resets on its own so a stale "Copied" label
   *  never survives past the moment it's true, without needing the caller to clear it. */
  const [hashCopied, setHashCopied] = useState(false);

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(item.sha256);
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — the full hash is still
      // visible and selectable in the field itself, so a failed copy degrades to "select manually"
      // rather than losing the value.
    }
  }

  async function save() {
    const patch = diffMediaMetadata({ item, draft });
    if (Object.keys(patch).length === 0) {
      props.onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateMedia({ id: item.id }, patch);
      props.onSaved();
    } catch (e) {
      setError(describeApiError(e, "failed to save media metadata"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card media-edit-panel">
      <div className="editor-header">
        <h2>Editing "{item.title}"</h2>
      </div>
      {/* Field layout per the OD reference (od-settings-external-mcp-customform.png): uppercase
          letterspaced label above its control (`.field-label`), short fields pairing into a
          row (`.field-row`) instead of every field stacking full-width regardless of length. */}
      <div className="field-group">
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-title-${item.id}`}>
              Title
            </label>
            <input
              id={`media-edit-title-${item.id}`}
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-alt-${item.id}`}>
              Alt
            </label>
            <input
              id={`media-edit-alt-${item.id}`}
              value={draft.alt}
              onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-caption-${item.id}`}>
              Caption
            </label>
            <input
              id={`media-edit-caption-${item.id}`}
              value={draft.caption}
              onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`media-edit-credit-${item.id}`}>
              Credit
            </label>
            <input
              id={`media-edit-credit-${item.id}`}
              value={draft.credit}
              onChange={(e) => setDraft((d) => ({ ...d, credit: e.target.value }))}
            />
          </div>
        </div>
        {/* Integrity/dedupe metadata, demoted out of the main view — genuinely useful when
            chasing a duplicate upload or verifying a file, noise the rest of the time. Read-only:
            this is a content hash, not something an operator edits. Monospace per the OD idiom
            for values that are code/identifiers, not prose. */}
        <div className="field">
          <span className="field-label">sha256</span>
          <div className="field-readonly-row">
            <code className="field-mono field-readonly">{item.sha256}</code>
            <button type="button" className="btn-ghost" onClick={copyHash}>
              {hashCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <span className="editor-actions">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn-secondary" onClick={props.onCancel} disabled={saving}>
            Cancel
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

/** Reads a browser `File` into a base64 string (no data: URL prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

interface MediaLightboxProps {
  /** The full grid list, not just the open item — kept as the whole array (rather than the
   *  caller resolving `items[activeIndex]` itself) so this component can compute prev/next
   *  boundaries for arrow-key nav from the same data its caller already has in scope. */
  items: AdminMedia[];
  /** Index into `items` that is open, or `null` when closed. An index rather than the item
   *  itself so navigating just moves this number — the caller (`Media()`) doesn't need a second
   *  piece of state to track "which one," and this component doesn't need to search `items` to
   *  find "where am I" when deciding whether prev/next exist. */
  activeIndex: number | null;
  onNavigate: (index: number) => void;
  onClose: () => void;
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
 *
 * @complexity O(1) per open/close/navigate — one `showModal`/`close` call per open/close
 * transition, one array index bounds check per arrow-key or arrow-button press.
 */
function MediaLightbox(props: MediaLightboxProps) {
  const { items, activeIndex, onNavigate, onClose } = props;
  // See `ConfirmDialog`'s own `titleId` comment: `useId()` here is the standing rule for any
  // dialog heading id in this codebase, not a defense against a collision this specific shared
  // instance can actually hit today (only one `MediaLightbox` is ever mounted by `Media()`).
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Captured at the moment `activeIndex` flips from `null`, before focus moves into the dialog —
  // the element that had focus then is, by construction, whichever card's expand button opened
  // this lightbox. Restored on close, same mechanism as `ConfirmDialog.triggerRef`.
  const triggerRef = useRef<Element | null>(null);
  const isOpen = activeIndex !== null;
  const item = activeIndex !== null ? items[activeIndex] : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      triggerRef.current = document.activeElement;
      if (typeof dialog.showModal === "function") {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      // Focus the close action, not whichever nav arrow happens to render first — a single-item
      // grid has no nav arrows at all, and the close button is the one control guaranteed to
      // exist regardless of position in the list, so it's a stable, always-available focus target
      // (same reasoning as `ConfirmDialog` explicitly choosing Cancel over letting the browser's
      // showModal() default land wherever it likes).
      closeRef.current?.focus();
    } else {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    }
    // Deliberately keyed on `isOpen`, not `activeIndex` — navigating to a different item while
    // already open changes `activeIndex` without an open/close transition, and re-running
    // `showModal()` on an already-open dialog would throw (`InvalidStateError`) in real browsers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleNativeCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    // Same reasoning as `ConfirmDialog.handleNativeCancel`: always prevented so the effect above
    // stays the single source of truth for open/closed, with Escape routed through `onClose` so
    // the caller's own state update is what actually calls `dialog.close()`.
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    // Same box-vs-content-box reasoning as `ConfirmDialog.handleBackdropClick`.
    if (e.target === dialogRef.current) onClose();
  }

  function goTo(nextIndex: number) {
    // Clamps rather than wrapping past either end — a "next" press on the last asset staying on
    // the last asset (not silently looping back to the first) is the less surprising default for
    // an operator navigating a specific set of uploads, not a slideshow.
    if (nextIndex < 0 || nextIndex >= items.length) return;
    onNavigate(nextIndex);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (activeIndex === null) return;
    // Known limitation, not fixed here: when the currently-focused element is a `<video controls>`
    // (the "video" stage's own native control surface), a real browser's built-in seek behavior
    // for ArrowLeft/ArrowRight fires independently of this handler, so pressing an arrow key while
    // the video itself has focus both seeks the video AND navigates the lightbox. Narrowing this
    // would need knowing the active item's resolved preview stage, which is private state inside
    // `MediaPreview` (by design — see that component's own doc comment on why `Media()` doesn't
    // track content-type itself). Flagged rather than worked around silently.
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(activeIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(activeIndex - 1);
    }
  }

  const hasPrev = activeIndex !== null && activeIndex > 0;
  const hasNext = activeIndex !== null && activeIndex < items.length - 1;

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
                onClick={() => goTo(activeIndex! - 1)}
              >
                <ChevronIcon />
              </button>
            ) : null}
            <div className="media-lightbox-media">
              <MediaPreview item={item} />
            </div>
            {hasNext ? (
              <button
                type="button"
                className="media-lightbox-nav media-lightbox-nav-next"
                aria-label="Next asset"
                onClick={() => goTo(activeIndex! + 1)}
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

export function Media() {
  const [media, setMedia] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [altDraft, setAltDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Purge (permanent delete) confirmation — mirrors `Posts.tsx`'s `pendingDelete`/`rowSavingId`
  // pair exactly. Trashing (the reversible first rung of the ladder) has no confirm step, matching
  // the original `window.confirm` call's own scope: it only ever guarded the permanent-delete path.
  const [pendingPurge, setPendingPurge] = useState<AdminMedia | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  // Lightbox — an index into `media`, not the item itself, so `MediaLightbox`'s own arrow-key/nav-
  // button navigation can move this number directly without this component re-deriving "what's
  // next" from an item reference. `null` is closed, mirroring `pendingPurge`'s own null-is-closed
  // convention for the other dialog already driven from this component.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .listMedia()
      .then((r) => setMedia(r.media))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load media"));
  }

  useEffect(load, []);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await api.uploadMedia(
        { filename: file.name, contentType: file.type, dataBase64 },
        { alt: altDraft.trim() || undefined }
      );
      setAltDraft("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function trash(item: AdminMedia) {
    setError(null);
    setRowSavingId(item.id);
    try {
      await api.trashMedia(item.id);
      load();
    } catch (e) {
      setError(describeApiError(e, "delete failed"));
    } finally {
      setRowSavingId(null);
    }
  }

  async function purge() {
    if (!pendingPurge) return;
    const item = pendingPurge;
    setRowSavingId(item.id);
    setError(null);
    try {
      await api.deleteMedia(item.id);
      load();
    } catch (e) {
      setError(describeApiError(e, "delete failed"));
    } finally {
      setRowSavingId(null);
      setPendingPurge(null);
    }
  }

  function rowMenuItems(item: AdminMedia): RowMenuItem[] {
    const items: RowMenuItem[] = [
      {
        key: "edit",
        label: editingId === item.id ? "Close editing" : "Edit metadata",
        onSelect: () => setEditingId((id) => (id === item.id ? null : item.id)),
      },
    ];
    if (item.status === "trashed") {
      items.push({ key: "purge", label: "Delete permanently", destructive: true, onSelect: () => setPendingPurge(item) });
    } else {
      items.push({ key: "trash", label: "Trash", onSelect: () => trash(item) });
    }
    return items;
  }

  if (error && !media) return <div className="notice error">{error}</div>;
  if (!media) return <div className="notice">Loading media…</div>;

  const editingItem = media.find((m) => m.id === editingId) ?? null;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Media</h1>
          <p className="page-description">Upload and manage image and video assets used across the site.</p>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="toolbar">
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
        <input
          value={altDraft}
          onChange={(e) => setAltDraft(e.target.value)}
          placeholder="Alt text (optional)"
        />
        <button onClick={upload} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>

      {editingItem ? (
        <EditMediaPanel
          item={editingItem}
          onSaved={() => {
            setEditingId(null);
            load();
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : null}

      {media.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No media uploaded yet.</p>
            <p className="page-description">Choose a file above and upload it to get started.</p>
          </div>
        </div>
      ) : (
        <div className="media-grid">
          {media.map((item, index) => (
            <div className="media-card" key={item.id}>
              <div className="media-card-preview">
                <MediaPreview item={item} onExpand={() => setLightboxIndex(index)} />
              </div>
              <div className="media-card-body">
                <p className="media-card-title" title={item.title}>
                  {item.title}
                </p>
                <div className="media-card-meta">
                  <span className={`status status-${item.status}`}>{item.status}</span>
                  <RowMenu triggerLabel={`Actions for "${item.title}"`} items={rowMenuItems(item)} />
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
      />

      <ConfirmDialog
        open={pendingPurge !== null}
        title="Delete permanently?"
        body={
          pendingPurge ? (
            <p>
              Permanently delete &quot;{pendingPurge.title}&quot;? This cannot be undone.
            </p>
          ) : null
        }
        confirmLabel="Delete permanently"
        destructive
        pending={pendingPurge !== null && rowSavingId === pendingPurge.id}
        onConfirm={purge}
        onCancel={() => setPendingPurge(null)}
      />
    </div>
  );
}
