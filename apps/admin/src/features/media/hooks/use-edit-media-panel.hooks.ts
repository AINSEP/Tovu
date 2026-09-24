import { useRef, useState } from "react";

import { embedMarkerSnippet } from "@tovu/embed-marker";

import type { AdminMedia } from "@/lib/api";
import { useFetchMutation } from "@/lib/fetch-query";
import {
  KEYS,
  describeApiError,
  describeMediaHtmlAttributeError,
  diffMediaMetadata,
  parseMediaHtmlAttributes,
  parseOptionalPixelSize,
  type MediaMetadataPatch,
} from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../media-i18n";
import { defaultMediaPort } from "./media-dependencies.hooks";
import type { MediaPort } from "./media-port.hooks";

/**
 * @file Everything `EditMediaPanel` does, so the component in `Media.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same error string. The doc comments below moved
 * WITH the values they describe; a comment separated from its code stops being read.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local
 * because nothing outside `features/media` needs it.
 *
 * `deps.port`/`deps.locale` are injected (see `media-port.hooks.ts`) rather than reaching for
 * `lib/api`'s `api` and `useAdminLocale()` directly, sharing the same `MediaPort` `use-media.hooks
 * .ts` injects — both hooks read/write the one `/media` resource.
 *
 * `publicUrl` (readable-slugs S5a, UI half, 2026-09-23) replaced this hook's old `originalUrl`
 * field, which read `port.mediaOriginalUrl(item.id)` — the authenticated admin byte route, the only
 * "where is this file" answer available before the server started resolving a real public URL (see
 * `lib/api.ts`'s `AdminMedia.publicUrl` doc for the full story: slug-keyed when the asset has a
 * valid one, else id-keyed, `null` for a trashed asset or when no public transform is registered).
 * `publicUrl` is a plain pass-through of `item.publicUrl` — no port call, since the server now
 * computes it directly (`ff6b713f0`). `MediaPreview`'s `<img>`/`<video>` `src`
 * (`use-media-preview.hooks.ts`) still uses `port.mediaOriginalUrl` — that route is a different
 * thing (an authenticated admin-only byte stream, not necessarily a link a visitor could follow) and
 * is unaffected by this change.
 *
 * `lib/fetch-query` migration (2026-08-12): `save` is one `useFetchMutation` that `invalidates:
 * [KEYS.list]` — this hook has no read of its own to invalidate (see `rules.ts`'s `KEYS` doc), so
 * there is no sibling-vs-nested key decision to make here at all, unlike `forms`/`collections`'
 * list-plus-detail-editor pairs.
 *
 * `baselineRef` (2026-08-12 audit round, TM-TOVU-2026-08-12-A — silent-revert lost update, media's
 * instance of the Comments defect): `diffMediaMetadata` must diff `draft` against the SAME snapshot
 * `draft` was seeded from, not the live `item` prop. `props.item` is NOT frozen — `use-media.hooks
 * .ts`'s `editingItem` is recomputed from `list.data` on every render, and `Media.tsx`'s
 * `key={editingItem.id}` only remounts this panel when the id itself changes, not when the SAME
 * item's other fields change via a background refetch (e.g. a different operator editing a
 * DIFFERENT field of this same asset while this panel is open, surfaced by any invalidating write
 * in this session — upload/trash/purge/another save all invalidate `KEYS.list`). Before this fix,
 * `save()` diffed `draft` against that live, drifting `item`: an untouched field whose server value
 * had since changed would show up as "changed" (draft's stale original vs the new live value) and
 * get wrongly included in the patch, silently reverting the other operator's committed change. See
 * `rules.ts`'s `diffMediaMetadata` doc for the other half of this fix.
 *
 * `htmlAttributesError` (2026-09-07): a LIVE, as-you-type hint only — computed from `draft
 * .htmlAttributes` via `rules.ts`'s `parseMediaHtmlAttributes`/`describeMediaHtmlAttributeError`,
 * shown so an operator sees why a value would be rejected before clicking Save. It must NEVER gate
 * `save()` (and `Media.tsx` must never disable the Save button on it either) — an earlier version of
 * this field did exactly that (`if (htmlAttributesError) return;` before `diffMediaMetadata` ever
 * ran, reverted as `a7cce060`), which meant an invalid attributes draft silently blocked saving
 * title/alt/caption/credit/cssClass too, fields with nothing to do with it. `save()` below always
 * runs `diffMediaMetadata` and submits unconditionally; if `htmlAttributes` itself is invalid, the
 * SERVER's `MediaValidationError` -> 400 (already wired, `updateMediaMetadata`'s
 * `resolveHtmlAttributesForUpdate`) surfaces through the same `error` save-error banner every other
 * save failure already uses — exactly how a malformed `slug` already works end to end.
 */

export interface EditMediaPanelHookProps {
  item: AdminMedia;
  onSaved: () => void;
  onCancel: () => void;
}

export interface EditMediaPanelDependencies {
  port: MediaPort;
  locale: string;
}

export interface EditMediaPanelController {
  draft: Required<MediaMetadataPatch>;
  setTitle: (value: string) => void;
  /** `slug` is a SEPARATE field from `title` (2026-09-07) — see `AdminMedia.slug`'s own doc. Setting
   *  it here never touches `draft.title`, and vice versa. */
  setSlug: (value: string) => void;
  setAlt: (value: string) => void;
  setCaption: (value: string) => void;
  setCredit: (value: string) => void;
  /** `value` is the raw `<input type="number">` string; blank parses to `null` (native size) via
   *  `parseOptionalPixelSize` — see that helper's own doc. */
  setWidth: (value: string) => void;
  setHeight: (value: string) => void;
  setCssClass: (value: string) => void;
  /** Same undefined/null/value-trims-to-null contract as `setCssClass` — see `AdminMedia
   *  .htmlAttributes`'s own doc. */
  setHtmlAttributes: (value: string) => void;
  /** The specific, visible allowlist-rejection message for `draft.htmlAttributes`'s CURRENT value,
   *  or `null` when it parses clean (including empty/unset) — a live hint only, see this file's own
   *  header for why it must never gate `save()`. */
  htmlAttributesError: string | null;
  saving: boolean;
  error: string | null;
  /** Feedback for the sha256 copy affordance below — resets on its own so a stale "Copied" label
   *  never survives past the moment it's true, without needing the caller to clear it. */
  hashCopied: boolean;
  /** Same pattern as `hashCopied`, for the asset URL field below. Separate state because the two
   *  copy buttons can be clicked independently and each needs its own "Copied" label lifetime. */
  urlCopied: boolean;
  /** Same pattern again, for the "Copy embed code" button. */
  embedCopied: boolean;
  /** The asset's real, public `/m/...` URL — see `lib/api.ts`'s `AdminMedia.publicUrl` doc. `null`
   *  when the server has none to offer (trashed, or no public transform registered yet); `Media.tsx`
   *  hides the row entirely in that case rather than showing a dead link. */
  publicUrl: string | null;
  copyHash: () => Promise<void>;
  /** No-op when `publicUrl` is `null` — see `publicUrl`'s own doc for why that happens and why
   *  `Media.tsx` never renders this button in that state anyway; the guard is here too so a stray
   *  call is inert rather than handing the clipboard API a `null`. */
  copyUrl: () => Promise<void>;
  /** `embedMarkerSnippet("media", "slug", item.slug)` — see `@tovu/embed-marker`'s doc for the
   *  shared helper. Computed here (not in `Media.tsx`, which stays markup-only) so the panel can
   *  both display it (in a read-only `<code>`, same idiom as the sha256/URL rows) and copy it. */
  embedSnippet: string;
  /** Copies {@link embedSnippet}. Unlike `copyUrl`, this needs no null-guard: `item.slug` is always
   *  a non-empty string (uploads always derive one, `deriveUniqueMediaSlug`). */
  copyEmbedCode: () => Promise<void>;
  save: () => Promise<void>;
}

/**
 * @complexity Time/space: O(1) per call — one metadata round trip per save, two clipboard writes.
 */
export function useEditMediaPanel(props: EditMediaPanelHookProps, { port, locale }: EditMediaPanelDependencies): EditMediaPanelController {
  const { item, onSaved, onCancel } = props;
  const [draft, setDraft] = useState<Required<MediaMetadataPatch>>({
    title: item.title,
    slug: item.slug,
    alt: item.alt,
    caption: item.caption,
    credit: item.credit,
    width: item.width,
    height: item.height,
    cssClass: item.cssClass,
    htmlAttributes: item.htmlAttributes,
  });
  // Frozen at mount, exactly like `draft`'s own `useState` initializer above — `useRef(item)` only
  // reads its argument on the FIRST render, so this stays the value `draft` was seeded from even as
  // `props.item` keeps advancing underneath it. See this file's own header.
  const baselineRef = useRef(item);
  const saveMutation = useFetchMutation({
    run: (input: { target: { id: string }; patch: MediaMetadataPatch }) => port.updateMedia(input.target, input.patch),
    invalidates: [KEYS.list],
  });
  const [hashCopied, setHashCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  // See this file's header for why `publicUrl` is a plain read of the server-computed field, not a
  // port call.
  const publicUrl = item.publicUrl;
  const embedSnippet = embedMarkerSnippet("media", "slug", item.slug);

  function setTitle(value: string) {
    setDraft((d) => ({ ...d, title: value }));
  }
  function setSlug(value: string) {
    setDraft((d) => ({ ...d, slug: value }));
  }
  function setAlt(value: string) {
    setDraft((d) => ({ ...d, alt: value }));
  }
  function setCaption(value: string) {
    setDraft((d) => ({ ...d, caption: value }));
  }
  function setCredit(value: string) {
    setDraft((d) => ({ ...d, credit: value }));
  }
  function setWidth(value: string) {
    setDraft((d) => ({ ...d, width: parseOptionalPixelSize(value) }));
  }
  function setHeight(value: string) {
    setDraft((d) => ({ ...d, height: parseOptionalPixelSize(value) }));
  }
  function setCssClass(value: string) {
    setDraft((d) => ({ ...d, cssClass: value.trim() === "" ? null : value }));
  }
  function setHtmlAttributes(value: string) {
    setDraft((d) => ({ ...d, htmlAttributes: value.trim() === "" ? null : value }));
  }

  const htmlAttributesParsed = parseMediaHtmlAttributes(draft.htmlAttributes ?? "");
  const htmlAttributesError = htmlAttributesParsed.error
    ? describeMediaHtmlAttributeError(htmlAttributesParsed.error, locale)
    : null;

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

  async function copyUrl() {
    if (publicUrl === null) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1500);
    } catch {
      // Same degrade-to-select-manually reasoning as `copyHash` above — the link itself is still
      // there to click or select even if the clipboard write is denied.
    }
  }

  async function copyEmbedCode() {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 1500);
    } catch {
      // Same degrade-to-select-manually reasoning as `copyHash`/`copyUrl` above — `Media.tsx` shows
      // the snippet itself in a read-only `<code>` next to this button (same `MediaEditCopyRow`
      // idiom as the other two rows), so a denied clipboard write never leaves the operator with no
      // way to get the value at all.
    }
  }

  async function save() {
    const patch = diffMediaMetadata({ item: baselineRef.current, draft });
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    try {
      await saveMutation.mutate({ target: { id: item.id }, patch });
      onSaved();
    } catch {
      // already surfaced through saveMutation.error -> error below
    }
  }

  const error = saveMutation.error ? describeApiError(saveMutation.error, t(locale, "failed to save media metadata")) : null;

  return {
    draft,
    setTitle,
    setSlug,
    setAlt,
    setCaption,
    setCredit,
    setWidth,
    setHeight,
    setCssClass,
    setHtmlAttributes,
    htmlAttributesError,
    saving: saveMutation.status === "pending",
    error,
    hashCopied,
    urlCopied,
    embedCopied,
    publicUrl,
    embedSnippet,
    copyHash,
    copyUrl,
    copyEmbedCode,
    save,
  };
}

/**
 * Binds the real `/api/.../media` client and the real `useAdminLocale()` — see
 * `media-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Media.tsx` composes this and a test composes {@link useEditMediaPanel} with
 * `createFakeMediaPort`.
 */
export function useWiredEditMediaPanel(props: EditMediaPanelHookProps): EditMediaPanelController {
  const locale = useAdminLocale();
  return useEditMediaPanel(props, { port: defaultMediaPort, locale });
}
