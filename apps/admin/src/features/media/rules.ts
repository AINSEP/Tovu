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
  /** Independent of `title` (2026-09-07) — see `AdminMedia.slug`'s own doc. Never `null`: unlike
   *  `cssClass`, a media asset's slug has no "cleared" representation to fall back to. */
  slug?: string;
  alt?: string;
  caption?: string;
  credit?: string;
  width?: number | null;
  height?: number | null;
  cssClass?: string | null;
  /** Same undefined/null/value contract as `cssClass` above (2026-09-07) — see `AdminMedia
   *  .htmlAttributes`'s own doc. */
  htmlAttributes?: string | null;
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
  if (draft.slug !== item.slug) patch.slug = draft.slug;
  if (draft.alt !== item.alt) patch.alt = draft.alt;
  if (draft.caption !== item.caption) patch.caption = draft.caption;
  if (draft.credit !== item.credit) patch.credit = draft.credit;
  if (draft.width !== item.width) patch.width = draft.width;
  if (draft.height !== item.height) patch.height = draft.height;
  if (draft.cssClass !== item.cssClass) patch.cssClass = draft.cssClass;
  if (draft.htmlAttributes !== item.htmlAttributes) patch.htmlAttributes = draft.htmlAttributes;
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

/**
 * WIRED TO `EditMediaPanel`'s "HTML attributes" field (2026-09-07). Originally built ahead of the
 * field it now backs (see the removed/re-added history in `ADS-memory/reports/
 * 2026-09-07-media-admin-ui.md` and `2026-09-07-media-slug-and-attributes.md`): `AdminMedia`/
 * `MediaRecord` gained `htmlAttributes: string | null` (same "one string column, `null` means not
 * set" shape as `cssClass`), the server now persists and re-validates it (write path:
 * `updateMediaMetadata`'s `resolveHtmlAttributesForUpdate`; render path: `render.ts`'s
 * `renderImageTag`/`renderVideoTag`, both re-parsing with `@jini-ai/cms/media`'s own copy of this
 * allowlist), and this file's `isAllowedMediaHtmlAttributeName`/`parseMediaHtmlAttributes`/
 * `describeMediaHtmlAttributeError` now back the admin form's live, as-you-type hint.
 *
 * That hint is a UX convenience, not the security boundary: the server re-validates independently
 * (its own ported copy of this same allowlist, `@jini-ai/cms/media`'s `html-attributes.ts` — see
 * that file's doc for why it is a separate copy, not a shared import across the browser/Node
 * boundary) and fails closed, so a client bypassed or out of date cannot smuggle a rejected value
 * onto the public render. This form-side copy exists purely so an operator sees WHY a value would be
 * rejected before ever clicking save, and it must never gate `save()` itself — see
 * `use-edit-media-panel.hooks.ts`'s `save()` doc for the incident (`a7cce060`) this rule prevents.
 *
 * Exact-match attribute names the allowlist accepts beyond the open-ended `data-`/`aria-` prefix
 * families (checked separately in {@link isAllowedMediaHtmlAttributeName}) — see
 * {@link parseMediaHtmlAttributes}'s own header for why this is an allowlist, not a blocklist.
 * Picked for the owner's stated near-term uses (animations, custom WebMCP hooks) plus the standard
 * `<img>`/`<video>` attributes those uses actually need; extend this list, not the parser, when a
 * new one is needed.
 */
export const MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES = [
  "loading",
  "decoding",
  "playsinline",
  "muted",
  "loop",
  "autoplay",
  "poster",
] as const;

/**
 * The shape EVERY accepted attribute name must have, checked before allowlist membership
 * (2026-09-07 stored-XSS fix; keep identical in `@jini-ai/cms/media`'s `html-attributes.ts` — see
 * that file's copy of this comment for the full incident).
 *
 * The `data-`/`aria-` families below are open-ended by design — no fixed suffix list — so the
 * prefix check alone accepted whatever characters {@link HTML_ATTRIBUTE_TOKEN}'s name class
 * (`[^\s="']+`, which excludes only whitespace, `=` and quotes) let through. `<`, `>` and `/` are
 * all legal in that class, and the server renderer templating a name into ` name="value"` escapes
 * only the VALUE — so a stored `data-x><svg/onload=alert(1)` closed the `<img>` and opened a live
 * `<svg onload>` on the public page. Constraining the NAME to the characters a real HTML attribute
 * name can contain is what makes "the value is escaped" sufficient.
 */
const MEDIA_HTML_ATTRIBUTE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/** Whether `name` is on the allowlist — a well-formed attribute name
 *  ({@link MEDIA_HTML_ATTRIBUTE_NAME_PATTERN}) that is either an exact match against
 *  {@link MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES} or carries a `data-`/`aria-` prefix (both open-ended
 *  families with no fixed suffix list). Case-insensitive: HTML attribute names are themselves
 *  case-insensitive, and an operator typing `DATA-FOO` should not slip past a lowercase-only check.
 *
 * @complexity O(n) in the name's length (one anchored regex test), then O(1) — one prefix check,
 * one fixed-length array lookup.
 */
export function isAllowedMediaHtmlAttributeName(name: string): boolean {
  const lower = name.toLowerCase();
  if (!MEDIA_HTML_ATTRIBUTE_NAME_PATTERN.test(lower)) return false;
  if (lower.startsWith("data-") || lower.startsWith("aria-")) return true;
  return (MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES as readonly string[]).includes(lower);
}

/** Why one parsed attribute token was rejected — see {@link parseMediaHtmlAttributes}'s own doc for
 *  why `event-handler`/`javascript-url` are checked, and reported, ahead of plain allowlist
 *  membership. */
export type MediaHtmlAttributeRejectionReason = "disallowed-name" | "event-handler" | "javascript-url" | "malformed";

export interface MediaHtmlAttributeError {
  reason: MediaHtmlAttributeRejectionReason;
  /** The exact attribute name (or, for `malformed`, the unparsable fragment) the caller's error
   *  message must name — never a generic "invalid input" (owner requirement: a visible, specific
   *  error naming the rejected attribute). */
  attribute: string;
}

export interface ParsedMediaHtmlAttributes {
  /** Lowercased attribute name -> value. A boolean attribute (`muted`, written with no
   *  `="..."`) maps to `""` — recording only that it was present; how a valueless attribute gets
   *  emitted onto the real tag is the future renderer's decision, not this parser's. */
  attributes: Record<string, string>;
  /** `null` when every token in the input is allowed and safe; otherwise the FIRST rejection found
   *  scanning left to right — one specific, visible reason at a time, not a batch of every problem
   *  in the string. */
  error: MediaHtmlAttributeError | null;
}

/** Matches one `name`, or one `name="value"`/`name='value'`/`name=value` pair — the same loose
 *  shape real HTML attribute syntax allows, since that is the syntax an operator typing this field
 *  would naturally reach for. */
const HTML_ATTRIBUTE_TOKEN = /([^\s="']+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;

/** Classifies one already-tokenized `name`/`value` pair. Split out of {@link parseMediaHtmlAttributes}
 *  so each rejection reason is its own directly testable branch, and so the loop below reads as
 *  "tokenize, then classify" rather than one function doing both.
 *
 * Order matters: `on*`/`javascript:` are checked BEFORE allowlist membership, so a rejected
 * `onerror="..."` always reports as `event-handler` (the more specific, more actionable reason)
 * rather than the generic `disallowed-name` — both this repo's XSS threat model and the owner's own
 * framing single out event handlers and `javascript:` values as the attributes worth naming
 * precisely, not lumping in with "not on the list".
 *
 * @complexity O(1) — three fixed checks against one already-extracted token.
 */
function classifyMediaHtmlAttributeToken(name: string, value: string): MediaHtmlAttributeError | null {
  if (name.startsWith("on")) return { reason: "event-handler", attribute: name };
  if (value.trim().toLowerCase().startsWith("javascript:")) return { reason: "javascript-url", attribute: name };
  if (!isAllowedMediaHtmlAttributeName(name)) return { reason: "disallowed-name", attribute: name };
  return null;
}

/**
 * Parses the `HTML attributes` field's free text (`name="value" name2="value2"`, or a bare
 * boolean `name`) into a validated attribute map, rejecting anything not on the allowlist.
 *
 * This is a SECURITY boundary, not a syntax convenience: media metadata is authored in this admin
 * but rendered on the public site, so a free-text HTML-attribute passthrough is a stored-XSS vector
 * (`onerror`, `onclick`, `style`, `href="javascript:"`, any `on*` handler) the moment it reaches a
 * public page. The allowlist in {@link isAllowedMediaHtmlAttributeName} is therefore the ONLY path
 * to acceptance — nothing here tries to sanitize or escape an otherwise-disallowed name into
 * something safe, it is rejected outright, and the caller must show the reason (not silently drop
 * it) so an operator can tell a typo from a hard "no". NOTE: this validator runs in the admin only —
 * see this repo's media-admin-ui report for where the write and render paths that would actually
 * persist and emit this attribute still need the SAME allowlist enforced server-side (a client-only
 * check is not a control, since the API accepts whatever a caller sends).
 *
 * @complexity Time O(n) in `text`'s length (one regex pass over it), space O(k) for k parsed
 *   attributes.
 */
export function parseMediaHtmlAttributes(text: string): ParsedMediaHtmlAttributes {
  const trimmed = text.trim();
  if (trimmed === "") return { attributes: {}, error: null };

  const attributes: Record<string, string> = {};
  HTML_ATTRIBUTE_TOKEN.lastIndex = 0;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_ATTRIBUTE_TOKEN.exec(trimmed)) !== null) {
    // Non-whitespace text between the previous match and this one is a fragment the token pattern
    // could not parse as a name (e.g. a stray quote) — reported once, at the first gap, rather
    // than silently skipped.
    const skipped = trimmed.slice(consumed, match.index);
    if (skipped.trim() !== "") return { attributes: {}, error: { reason: "malformed", attribute: skipped.trim() } };
    consumed = match.index + match[0].length;

    const name = match[1]!.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    const rejection = classifyMediaHtmlAttributeToken(name, value);
    if (rejection) return { attributes: {}, error: rejection };
    attributes[name] = value;
  }

  const trailing = trimmed.slice(consumed);
  if (trailing.trim() !== "") return { attributes: {}, error: { reason: "malformed", attribute: trailing.trim() } };
  return { attributes, error: null };
}

/** Formats a {@link MediaHtmlAttributeError} into the specific, visible message the edit form
 *  shows — always names the rejected attribute or fragment (owner requirement). Same
 *  `MEDIA_DICT[locale]?.[key] ?? key` + `.replace("{placeholder}", ...)` idiom
 *  `ThemePageDetailsModal.tsx`'s collision warning already uses for an interpolated value.
 *
 * @complexity O(1).
 */
export function describeMediaHtmlAttributeError(error: MediaHtmlAttributeError, locale: string): string {
  const t = (key: string): string => MEDIA_DICT[locale]?.[key] ?? key;
  const ATTRIBUTE_PLACEHOLDER = "{attribute}";
  if (error.reason === "event-handler") {
    return t("Event handler attributes like '{attribute}' are not allowed.").replace(ATTRIBUTE_PLACEHOLDER, error.attribute);
  }
  if (error.reason === "javascript-url") {
    return t("'{attribute}' cannot use a javascript: value.").replace(ATTRIBUTE_PLACEHOLDER, error.attribute);
  }
  if (error.reason === "malformed") {
    return t("Could not parse HTML attributes near '{fragment}'.").replace("{fragment}", error.attribute);
  }
  return t("'{attribute}' is not an allowed HTML attribute.").replace(ATTRIBUTE_PLACEHOLDER, error.attribute);
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
