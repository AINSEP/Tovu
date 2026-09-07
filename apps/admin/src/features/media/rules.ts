import { ApiError, type AdminMedia } from "../../lib/api";
import type { RowMenuItem } from "@jini-ai/admin/react";
import type { QueryKey } from "../../lib/fetch-query";
import type { MediaTabId } from "./hooks/use-media-tabs.hooks";
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

/**
 * This screen's name on `lib/content-refresh-bus.ts` — see `taxonomy/rules.ts`'s `TAXONOMY_RESOURCE`
 * for why this is a plain colocated constant rather than a shared registry, and
 * `use-content-refresh-subscription.hooks.ts` for the hook that reads it. No agent tool writes media
 * today (`apps/website/src/features` has no `media/agent-tools.ts`), but the grid still subscribes:
 * the bus's own "unknown scope, refresh everything" default (`contentRefreshApplies`'s `null` case)
 * means every finished assistant run already notifies this resource whether or not the run touched
 * it, and wiring it now is a one-line, zero-risk way for this screen to inherit a future media tool's
 * writes automatically instead of needing a fourth staleness bug fixed later.
 */
export const MEDIA_RESOURCE = "media";

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
 * sends an unchanged field (AC-01's "field left unchanged is not overwritten" proof).
 *
 * `item` MUST be the same snapshot `draft` was seeded from, frozen for the caller's whole edit
 * session — never a live value that can advance independently of `draft` (2026-08-12 audit,
 * TM-TOVU-2026-08-12-A). If `item` moves out from under a frozen `draft`, an untouched field whose
 * server value changed in the interim reads as "changed" here and gets wrongly included in the
 * patch, silently reverting whatever changed it. See `use-edit-media-panel.hooks.ts`'s
 * `baselineRef` for the caller-side guarantee. */
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

/**
 * The grid contents for one tab: every asset on "all", and only assets whose sniffed
 * `contentType` is in the matching family on "images"/"videos".
 *
 * Prefix matching on `image/`/`video/` rather than an enumerated list of the sniffer's current
 * outputs: the server's sniffer allowlist can gain a format (another image codec, say) without
 * this file having to learn about it, and a prefix cannot mis-sort a type it has never seen.
 *
 * Three kinds of asset are deliberately NOT in either filtered tab:
 * - `application/octet-stream` — a REAL answer from the sniffer (an unrecognized file), not a
 *   missing one. It is neither an image nor a video, so All is where it belongs.
 * - `text/html`/`image/svg+xml` — markup the byte-serving route force-downloads as a stored-XSS
 *   defusal. `image/svg+xml` does match the `image/` prefix and so DOES appear under Images, which
 *   is correct: it is genuinely an image, and its card falls back to the non-previewable
 *   placeholder exactly as it does on All.
 * - `null` — see {@link hasUntypedMedia}.
 *
 * @complexity Time O(n), space O(n).
 */
export function filterMediaByTab(media: AdminMedia[], tab: MediaTabId): AdminMedia[] {
  if (tab === "images") return media.filter((item) => item.contentType?.startsWith("image/") ?? false);
  if (tab === "videos") return media.filter((item) => item.contentType?.startsWith("video/") ?? false);
  return media;
}

/**
 * Whether any asset has no recorded content type — what drives the filtered tabs' "some items
 * aren't shown here" note.
 *
 * A `null` `contentType` does not mean "unknown format" (that is a real, recorded
 * `application/octet-stream`); it means the server could not read that blob's bytes to sniff them,
 * because the list route backfills every readable pre-existing row on read. So this is normally
 * `false` and the note never renders. It exists because the alternative — a filtered tab that
 * quietly drops rows it cannot classify — is worse than the honest placeholder these tabs replaced:
 * an operator would have no way to tell "no images" from "images the server couldn't read".
 *
 * @complexity Time O(n), space O(1).
 */
export function hasUntypedMedia(media: AdminMedia[]): boolean {
  return media.some((item) => item.contentType === null);
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
