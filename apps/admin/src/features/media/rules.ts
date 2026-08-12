import { ApiError, type AdminMedia } from "../../lib/api";
import type { RowMenuItem } from "@jini-ai/admin/react";
import type { QueryKey } from "../../lib/fetch-query";
import { MEDIA_DICT } from "./media-i18n";

/**
 * @file Pure logic for the `media` feature — everything that computes a value rather than
 * rendering one. One shared module for `Media.tsx`'s four components (`Media`, `MediaPreview`,
 * `EditMediaPanel`, `MediaLightbox`), matching `features/posts/rules.ts`'s convention: the
 * decisions live in one importable, directly testable module with no React in it.
 *
 * `KEYS` (fetch-query migration, 2026-08-12): one cache identity for the whole media grid. No
 * separate "detail" key — unlike `forms`/`collections`, `EditMediaPanel` never independently reads
 * an item; it receives `item: AdminMedia` as a prop, already resolved from the list by
 * `findEditingItem` below. So the sibling-vs-nested-key trap `forms/rules.ts`'s `KEYS` doc and
 * `collections/rules.ts`'s `KEYS` doc both document does not apply here — there is only ever one
 * query on this resource, and every write (`upload`/`trash`/`deleteMedia`/`updateMedia`, whether
 * fired from `use-media.hooks.ts` or `use-edit-media-panel.hooks.ts`) invalidates it.
 */
export const KEYS = {
  list: ["media"] as QueryKey,
};

/** @complexity Time/space: O(1). */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Editable metadata fields `api.updateMedia` accepts — kept as its own type so the diffing
 * helper below stays exhaustive if the patch shape ever grows.
 *
 * `width`/`height`/`cssClass` (owner-directed quick-and-dirty sizing fix): `null` means "not set" —
 * both size fields are optional, blank-means-render-at-native-size, never defaulted/computed. */
export type MediaMetadataPatch = {
  title?: string;
  alt?: string;
  caption?: string;
  credit?: string;
  width?: number | null;
  height?: number | null;
  cssClass?: string | null;
};

/** Builds a partial patch containing only the fields whose draft value differs from `item`'s
 * current value — the backend's own contract is optional-field/partial-patch, so this never
 * sends an unchanged field (AC-01's "field left unchanged is not overwritten" proof). */
export function diffMediaMetadata(required: {
  item: AdminMedia;
  draft: Required<MediaMetadataPatch>;
}): MediaMetadataPatch {
  const { item, draft } = required;
  const patch: MediaMetadataPatch = {};
  if (draft.title !== item.title) patch.title = draft.title;
  if (draft.alt !== item.alt) patch.alt = draft.alt;
  if (draft.caption !== item.caption) patch.caption = draft.caption;
  if (draft.credit !== item.credit) patch.credit = draft.credit;
  if (draft.width !== item.width) patch.width = draft.width;
  if (draft.height !== item.height) patch.height = draft.height;
  if (draft.cssClass !== item.cssClass) patch.cssClass = draft.cssClass;
  return patch;
}

/** Parses a `<input type="number">`'s string value into the `number | null` shape
 *  `MediaMetadataPatch.width`/`height` need: blank -> `null` (native size), otherwise `Number(...)`.
 *  Not guarded against `NaN` here — the input's own `type="number"` keeps free-text out in
 *  practice, and a stray `NaN` would fail `updateMediaMetadata`'s positive-integer check server-side
 *  rather than silently save, matching this fix's "quick and dirty, not silently wrong" bar. */
export function parseOptionalPixelSize(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/** Reads a browser `File` into a base64 string (no data: URL prefix). */
export function readFileAsBase64(file: File): Promise<string> {
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

/** Alt text fallback chain for a previewed media asset: prefers the operator-set alt, falls back
 *  to the title, and finally a generic label when neither is set. */
export function mediaAltText(item: AdminMedia): string {
  return item.alt || item.title || "Untitled asset";
}

/** Resolves `media.find((m) => m.id === editingId)`, or `null` — the item whose `EditMediaPanel`
 *  is expanded, resolved once here rather than in the view. */
export function findEditingItem(media: AdminMedia[] | null, editingId: string | null): AdminMedia | null {
  if (!media) return null;
  return media.find((m) => m.id === editingId) ?? null;
}

/**
 * `useMedia`'s error banner, extracted out of that hook (`refactor/fetch-query` complexity pass,
 * 2026-08-12 — same reason `redirects/rules.ts`'s `visibleRedirectsError` was extracted).
 *
 * Precedence: an active write's own failure (upload/trash/purge, in array order) always wins over a
 * background list-refresh failure — `use-media.hooks.ts`'s `clearOtherWriteErrors` is this rule's
 * other half, same pairing `redirects/rules.ts`'s `firstWriteError`/`clearOtherWriteErrors` document,
 * so at most one write error is ever live at a time and array order rarely matters in practice. The
 * list error only surfaces before `media` has ever loaded, matching every other migrated feature's
 * "a later background failure must not blank an already-rendered screen" guard.
 *
 * Fallback strings are passed in, not hardcoded — unlike `forms/rules.ts`'s `visibleFormEditorError`
 * (whose hook never localized its own error strings), `use-media.hooks.ts`'s pre-migration catches
 * all used `translate(locale, "...")` fallbacks, and this preserves that.
 *
 * @complexity Time/space: O(1) — four fixed checks, no iteration.
 */
export function visibleMediaError(params: {
  uploadError: Error | null;
  uploadFallback: string;
  trashError: Error | null;
  purgeError: Error | null;
  deleteFallback: string;
  listError: Error | null;
  listFallback: string;
  hasMedia: boolean;
}): string | null {
  if (params.uploadError) return describeApiError(params.uploadError, params.uploadFallback);
  if (params.trashError) return describeApiError(params.trashError, params.deleteFallback);
  if (params.purgeError) return describeApiError(params.purgeError, params.deleteFallback);
  if (params.hasMedia) return null;
  return params.listError ? describeApiError(params.listError, params.listFallback) : null;
}

/** The callbacks a media row menu needs. Passed in rather than imported so this module stays free
 *  of state and navigation, and so a test can assert exactly which one a given row wires up —
 *  mirrors `features/posts/rules.ts`'s `PostRowMenuHandlers`. */
export interface MediaRowMenuHandlers {
  onToggleEdit: (item: AdminMedia) => void;
  onTrash: (item: AdminMedia) => void;
  onRequestPurge: (item: AdminMedia) => void;
}

/**
 * The row-action menu for one media item.
 *
 * Two branches worth a test: the "Edit metadata"/"Close editing" label flips on whether THIS row
 * is the one currently expanded (`editingId === item.id`), and "Trash" vs. "Delete permanently"
 * is gated on `item.status` — an already-trashed item skips the reversible step entirely, same
 * asymmetry `Posts.tsx`'s row menu documents for its own Disable/Delete split.
 *
 * @complexity Time/space: O(1) — at most two entries, no iteration.
 */
export function mediaRowMenuItems(
  item: AdminMedia,
  editingId: string | null,
  handlers: MediaRowMenuHandlers,
  locale: string,
): RowMenuItem[] {
  const t = (key: string): string => MEDIA_DICT[locale]?.[key] ?? key;
  const items: RowMenuItem[] = [
    {
      key: "edit",
      label: editingId === item.id ? t("Close editing") : t("Edit metadata"),
      onSelect: () => handlers.onToggleEdit(item),
    },
  ];
  if (item.status === "trashed") {
    items.push({ key: "purge", label: t("Delete permanently"), destructive: true, onSelect: () => handlers.onRequestPurge(item) });
  } else {
    items.push({ key: "trash", label: t("Trash"), onSelect: () => handlers.onTrash(item) });
  }
  return items;
}

/** Resolves the lightbox's currently-open item from an index into `items`, or `null` when
 *  `activeIndex` is `null` (closed). */
export function resolveLightboxItem(items: AdminMedia[], activeIndex: number | null): AdminMedia | null {
  return activeIndex !== null ? items[activeIndex] : null;
}

/** Whether the lightbox's "previous" nav arrow should render — `false` at the first item or when
 *  closed. */
export function lightboxHasPrev(activeIndex: number | null): boolean {
  return activeIndex !== null && activeIndex > 0;
}

/** Whether the lightbox's "next" nav arrow should render — `false` at the last item or when
 *  closed. */
export function lightboxHasNext(items: AdminMedia[], activeIndex: number | null): boolean {
  return activeIndex !== null && activeIndex < items.length - 1;
}

/** Whether `index` is a navigable position within `items` — the lightbox clamps rather than wraps
 *  past either end (see `MediaLightbox`'s own `goTo` doc comment for why: a "next" press on the
 *  last asset staying on the last asset, not silently looping to the first, is the less surprising
 *  default for an operator navigating a specific set of uploads, not a slideshow). */
export function isValidLightboxIndex(items: AdminMedia[], index: number): boolean {
  return index >= 0 && index < items.length;
}
