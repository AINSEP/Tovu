import { ApiError, type AdminMedia } from "../../lib/api";
import type { RowMenuItem } from "@jini-ai/admin/react";

/**
 * @file Pure logic for the `media` feature — everything that computes a value rather than
 * rendering one. One shared module for `Media.tsx`'s four components (`Media`, `MediaPreview`,
 * `EditMediaPanel`, `MediaLightbox`), matching `features/posts/rules.ts`'s convention: the
 * decisions live in one importable, directly testable module with no React in it.
 */

/** @complexity Time/space: O(1). */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Editable metadata fields `api.updateMedia` accepts — kept as its own type so the diffing
 * helper below stays exhaustive if the patch shape ever grows. */
export type MediaMetadataPatch = { title?: string; alt?: string; caption?: string; credit?: string };

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
  return patch;
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
export function mediaRowMenuItems(item: AdminMedia, editingId: string | null, handlers: MediaRowMenuHandlers): RowMenuItem[] {
  const items: RowMenuItem[] = [
    {
      key: "edit",
      label: editingId === item.id ? "Close editing" : "Edit metadata",
      onSelect: () => handlers.onToggleEdit(item),
    },
  ];
  if (item.status === "trashed") {
    items.push({ key: "purge", label: "Delete permanently", destructive: true, onSelect: () => handlers.onRequestPurge(item) });
  } else {
    items.push({ key: "trash", label: "Trash", onSelect: () => handlers.onTrash(item) });
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
