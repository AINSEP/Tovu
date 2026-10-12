import { useEffect, useMemo, useRef, useState, type RefObject, type UIEvent } from "react";
import type { AdminMedia } from "../../lib/api";
import { acceptedMediaItems, useMediaPickerItems } from "../MediaPickerDialog/MediaPickerDialog.hooks";
import { defaultMediaPickerPort } from "../MediaPickerDialog/media-picker-dependencies.hooks";
import type { MediaPickerPort } from "../MediaPickerDialog/media-picker-port.hooks";
import {
  appendMediaSlugs,
  inactiveTabWillBeDropped,
  insertAtSelection,
  isValidMediaSlug,
  layoutUsesColumns,
  lineCount,
  MAX_MEDIA_HTML_LENGTH,
  MAX_MEDIA_ITEMS,
  mediaKindOf,
  mediaLayoutsFor,
  mediaSlugProblem,
  mediaSnippetFor,
  moveMediaItem,
  readMediaContent,
  slugCanShowEnd,
  switchMediaContentMode,
  toMediaConfig,
  viewedMediaContent,
  type MediaContentMode,
  type MediaContentState,
  type MediaContentStash,
  type MediaDraft,
  type MediaItem,
  type MediaKind,
  type MediaLayout,
  type MediaSlugProblem,
} from "./media-content-rules";

/**
 * @file State and handlers for `MediaContentEditor.tsx` (the two-tab Media / Raw HTML editor), so
 * the component stays markup only. The CONFIG passed in stays the single source of truth for the
 * active tab — every edit is emitted through `onChange` as the complete replacement config for
 * that tab (`toMediaConfig`). The only local state is what the config cannot hold:
 *
 * - the inactive tab's content (`stash`), so flipping tabs back and forth before Save loses
 *   nothing, while the saved config still carries only the active tab (contract);
 * - the tab shown without a config change (`viewMode`): switching to an empty tab emits nothing,
 *   so flipping tabs alone never marks the page dirty (`viewedMediaContent`);
 * - the add-by-slug input, the library picker's open state and its checked slugs.
 *
 * The library comes from `useMediaPickerItems` — the same cached `["media"]` query the media picker
 * dialog reads, not a second fetch path.
 */

/** One structured row with what the library knows about its slug. */
export interface MediaItemRow {
  item: MediaItem;
  /** The library asset with this slug, or `undefined` (unknown, or the library is still loading). */
  asset: AdminMedia | undefined;
  kind: MediaKind;
  /** The unfocused slug box shows the slug's end — see `slugCanShowEnd`. */
  showsSlugEnd: boolean;
  /** Why this row will not render, or `null`. `"unknown"` only once the library has loaded. */
  problem: Exclude<MediaSlugProblem, "empty" | "full"> | null;
}

export interface MediaContentEditorController {
  mode: MediaContentMode;
  setMode: (mode: MediaContentMode) => void;
  /** The tab NOT shown still holds content that saving the shown tab would drop. */
  inactiveHasContent: boolean;
  /** Active library assets (`null` while loading) and a load failure message. */
  library: AdminMedia[] | null;
  libraryError: string | null;
  /** What the picker offers: images, video and audio (the kinds the media widget renders). */
  pickable: AdminMedia[] | null;
  mediaUrl: (asset: AdminMedia) => string;

  layouts: readonly MediaLayout[];
  media: MediaDraft;
  showColumns: boolean;
  setLayout: (layout: MediaLayout) => void;
  setColumns: (value: string) => void;
  setAspectRatio: (value: string) => void;
  setCssClass: (value: string) => void;

  rows: MediaItemRow[];
  maxItems: number;
  updateItem: (index: number, patch: Partial<MediaItem>) => void;
  moveItem: (index: number, delta: -1 | 1) => void;
  removeItem: (index: number) => void;

  slugDraft: string;
  setSlugDraft: (value: string) => void;
  slugProblem: { problem: MediaSlugProblem; slug: string } | null;
  addSlug: () => void;

  /** The rows themselves are `HtmlAttributeRows`' local state; this stores their string. */
  setHtmlAttributes: (value: string) => void;

  /** Where picked slugs go: the item list, or the Raw HTML caret. `null` = picker closed. */
  picker: "items" | "html" | null;
  picked: string[];
  openPicker: (target: "items" | "html") => void;
  togglePicked: (slug: string) => void;
  cancelPicker: () => void;
  confirmPicker: () => void;

  html: string;
  setHtml: (value: string) => void;
  htmlLines: number;
  htmlTooLong: boolean;
  maxHtmlLength: number;
  htmlRef: RefObject<HTMLTextAreaElement | null>;
  gutterRef: RefObject<HTMLDivElement | null>;
  /** Keeps the line-number gutter scrolled with the textarea. */
  onHtmlScroll: (event: UIEvent<HTMLTextAreaElement>) => void;
}

/** Required inputs: the config being edited, where edits go, and which widget type owns it. */
export interface MediaContentEditorInput {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  /** `media`, `gallery` (no Single layout), or `media` for a placement override. */
  widgetType: string;
}

const PICKABLE_TYPES = ["image/*", "video/*", "audio/*"] as const;

function rowProblem(required: { item: MediaItem; index: number; items: readonly MediaItem[]; asset: AdminMedia | undefined; libraryLoaded: boolean }): MediaItemRow["problem"] {
  if (!isValidMediaSlug(required.item.slug)) return "invalid";
  if (required.items.findIndex((other) => other.slug === required.item.slug) !== required.index) return "duplicate";
  if (required.libraryLoaded && !required.asset) return "unknown";
  return null;
}

/**
 * Owns the editor's derived view and handlers — see this file's header for what is local state.
 *
 * @param required - {@link MediaContentEditorInput}.
 * @param optional.port - The media library seam (`listMedia`, `mediaOriginalUrl`); tests pass a fake.
 * @param optional.locale - Locale for the library load-failure message.
 * @returns {@link MediaContentEditorController}.
 * @complexity O(n·n + m) per render for n ≤ 50 items (duplicate check) and m library assets.
 */
export function useMediaContentEditor(
  required: MediaContentEditorInput,
  optional: { port?: MediaPickerPort; locale?: string } = {},
): MediaContentEditorController {
  const { config, onChange, widgetType } = required;
  const port = optional.port ?? defaultMediaPickerPort;
  const { items: library, error: libraryError } = useMediaPickerItems(port, optional.locale);
  const stored = useMemo(() => readMediaContent({ config, widgetType }, { library }), [config, widgetType, library]);
  const [stash, setStash] = useState<MediaContentStash>({});
  const [viewMode, setViewMode] = useState<MediaContentMode | null>(null);
  // Every handler below edits what is SHOWN, so the first edit in an untouched tab commits it.
  const state = viewedMediaContent({ stored, viewMode, stash });
  const [slugDraft, setSlugDraftState] = useState("");
  const [slugProblem, setSlugProblem] = useState<MediaContentEditorController["slugProblem"]>(null);
  const [picker, setPicker] = useState<"items" | "html" | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const htmlRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current === null || !htmlRef.current) return;
    htmlRef.current.focus();
    htmlRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const emit = (next: MediaContentState) => onChange(toMediaConfig({ state: next }));
  const emitMedia = (patch: Partial<MediaDraft>) => emit({ ...state, media: { ...state.media, ...patch } });
  const setItems = (items: MediaItem[]) => emitMedia({ items });
  const assetsBySlug = new Map((library ?? []).map((asset) => [asset.slug, asset]));

  function addSlug() {
    const slug = slugDraft.trim();
    const problem = mediaSlugProblem({ slug, items: state.media.items, library });
    if (problem) { setSlugProblem({ problem, slug }); return; }
    setItems(appendMediaSlugs({ items: state.media.items, slugs: [slug] }));
    setSlugDraftState("");
    setSlugProblem(null);
  }

  function insertHtml(snippet: string) {
    const area = htmlRef.current;
    const start = area?.selectionStart ?? state.html.length;
    const end = area?.selectionEnd ?? start;
    const result = insertAtSelection({ text: state.html, start, end, insert: snippet });
    pendingCaret.current = result.caret;
    emit({ ...state, html: result.text });
  }

  function confirmPicker() {
    if (picker === "items") setItems(appendMediaSlugs({ items: state.media.items, slugs: picked }));
    if (picker === "html") {
      insertHtml(picked.flatMap((slug) => {
        const asset = assetsBySlug.get(slug);
        return asset ? [mediaSnippetFor({ slug, alt: asset.alt, contentType: asset.contentType })] : [];
      }).join("\n"));
    }
    setPicker(null);
  }

  return {
    mode: state.mode,
    setMode: (mode) => {
      if (mode === state.mode) return;
      const next = switchMediaContentMode({ stored, stash, mode });
      setStash(next.stash);
      setViewMode(next.viewMode);
      if (next.emit) emit(next.emit);
    },
    inactiveHasContent: inactiveTabWillBeDropped({ stored, viewMode, stash }),
    library,
    libraryError,
    pickable: acceptedMediaItems(library, PICKABLE_TYPES),
    mediaUrl: (asset) => port.mediaOriginalUrl(asset.id),

    layouts: mediaLayoutsFor(widgetType),
    media: state.media,
    showColumns: layoutUsesColumns(state.media.layout),
    setLayout: (layout) => emitMedia({ layout }),
    setColumns: (value) => {
      const columns = Number.parseInt(value, 10);
      emitMedia({ columns: Number.isFinite(columns) ? Math.max(1, Math.min(6, columns)) : undefined });
    },
    setAspectRatio: (aspectRatio) => emitMedia({ aspectRatio }),
    setCssClass: (cssClass) => emitMedia({ cssClass }),

    rows: state.media.items.map((item, index, items) => {
      const asset = assetsBySlug.get(item.slug);
      return { item, asset, kind: mediaKindOf(asset?.contentType), showsSlugEnd: slugCanShowEnd(item.slug), problem: rowProblem({ item, index, items, asset, libraryLoaded: library !== null }) };
    }),
    maxItems: MAX_MEDIA_ITEMS,
    updateItem: (index, patch) => setItems(state.media.items.map((item, i) => (i === index ? { ...item, ...patch } : item))),
    moveItem: (index, delta) => {
      const next = moveMediaItem({ items: state.media.items, from: index, to: index + delta });
      if (next !== state.media.items) setItems(next);
    },
    removeItem: (index) => setItems(state.media.items.filter((_, i) => i !== index)),

    slugDraft,
    setSlugDraft: (value) => { setSlugDraftState(value); setSlugProblem(null); },
    slugProblem,
    addSlug,

    setHtmlAttributes: (htmlAttributes) => emitMedia({ htmlAttributes }),

    picker,
    picked,
    openPicker: (target) => { setPicked([]); setPicker(target); },
    togglePicked: (slug) => setPicked((current) => (current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug])),
    cancelPicker: () => setPicker(null),
    confirmPicker,

    html: state.html,
    setHtml: (html) => emit({ ...state, html }),
    htmlLines: lineCount(state.html),
    htmlTooLong: state.html.length > MAX_MEDIA_HTML_LENGTH,
    maxHtmlLength: MAX_MEDIA_HTML_LENGTH,
    htmlRef,
    gutterRef,
    onHtmlScroll: (event) => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop; },
  };
}
