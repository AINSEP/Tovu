import { useRef, useState } from "react";

import type { AdminMedia } from "@/lib/api";
import { useFetchMutation } from "@/lib/fetch-query";
import { KEYS, describeApiError, diffMediaMetadata, parseOptionalPixelSize, type MediaMetadataPatch } from "../rules";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t } from "../media-i18n";
import { defaultMediaPort } from "./media-dependencies.hooks";
import type { MediaPort } from "./media-port.hooks";

/**
 * @file Everything `EditMediaPanel` does, so the component in `Media.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same error string. The doc comments below moved
 * WITH the values they describe; `originalUrl`'s is a decision record (why there is no stored
 * filename/path to show, and why the authenticated byte-route URL is what's displayed instead) and
 * a comment separated from its code stops being read.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local
 * because nothing outside `features/media` needs it.
 *
 * `deps.port`/`deps.locale` are injected (see `media-port.hooks.ts`) rather than reaching for
 * `lib/api`'s `api` and `useAdminLocale()` directly, sharing the same `MediaPort` `use-media.hooks
 * .ts` injects — both hooks read/write the one `/media` resource. `originalUrl` below now reads
 * `port.mediaOriginalUrl(item.id)` rather than calling `api.mediaOriginalUrl` directly — see
 * `media-port.hooks.ts`'s header for why that URL builder moved onto the port (2026-08-14).
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
  saving: boolean;
  error: string | null;
  /** Feedback for the sha256 copy affordance below — resets on its own so a stale "Copied" label
   *  never survives past the moment it's true, without needing the caller to clear it. */
  hashCopied: boolean;
  /** Same pattern as `hashCopied`, for the asset URL field below. Separate state because the two
   *  copy buttons can be clicked independently and each needs its own "Copied" label lifetime. */
  urlCopied: boolean;
  originalUrl: string;
  copyHash: () => Promise<void>;
  copyUrl: () => Promise<void>;
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

  /** `MediaRecord` (`@jini-ai/cms/media`) carries no filename/path/URL field at all — only
   *  `title`/`alt`/`caption`/`credit`/`source.sha256` (see that type's own doc comment: media is
   *  a bespoke editorial record, not yet the generic `entries` model ADR-022 describes, and even
   *  that model wouldn't store a filesystem path — the physical bytes live in the separate
   *  `asset_blobs` sidecar, keyed by `(workspaceId, sha256)` for dedup, not by this media record).
   *  So "where is this asset" has no stored answer to surface — the correct one to show is the
   *  same authenticated byte-serving URL `MediaPreview` already uses as this exact item's `<img>`/
   *  `<video>` `src` (`lib/api.ts`'s `mediaOriginalUrl` route, REQ from MSG-05's rewrite, read here
   *  through the injected `port` rather than the `api` client directly): it is the one thing that
   *  reliably, uniquely resolves to THIS media record's bytes regardless of dedup (two records can
   *  share one blob's `storageKey`, which is why that internal key is not what's shown here). */
  const originalUrl = port.mediaOriginalUrl(item.id);

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
    try {
      await navigator.clipboard.writeText(originalUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1500);
    } catch {
      // Same degrade-to-select-manually reasoning as `copyHash` above — the link itself is still
      // there to click or select even if the clipboard write is denied.
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
    saving: saveMutation.status === "pending",
    error,
    hashCopied,
    urlCopied,
    originalUrl,
    copyHash,
    copyUrl,
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
