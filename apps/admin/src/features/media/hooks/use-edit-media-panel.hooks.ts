import { useState } from "react";

import { api, type AdminMedia } from "../../../lib/api";
import { describeApiError, diffMediaMetadata, parseOptionalPixelSize, type MediaMetadataPatch } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
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
 * .ts` injects — both hooks read/write the one `/media` resource. `api.mediaOriginalUrl` stays a
 * direct import: a pure, synchronous URL template (no `fetch`/`await` — see `lib/api.ts`), the
 * same "no host boundary, no I/O" category as `describeApiError`, per `media-port.hooks.ts`'s own
 * doc comment.
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
    alt: item.alt,
    caption: item.caption,
    credit: item.credit,
    width: item.width,
    height: item.height,
    cssClass: item.cssClass,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hashCopied, setHashCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  /** `MediaRecord` (`@jini-ai/cms/media`) carries no filename/path/URL field at all — only
   *  `title`/`alt`/`caption`/`credit`/`source.sha256` (see that type's own doc comment: media is
   *  a bespoke editorial record, not yet the generic `entries` model ADR-022 describes, and even
   *  that model wouldn't store a filesystem path — the physical bytes live in the separate
   *  `asset_blobs` sidecar, keyed by `(workspaceId, sha256)` for dedup, not by this media record).
   *  So "where is this asset" has no stored answer to surface — the correct one to show is the
   *  same authenticated byte-serving URL `MediaPreview` already uses as this exact item's `<img>`/
   *  `<video>` `src` (`api.mediaOriginalUrl`, REQ from MSG-05's rewrite): it is the one thing that
   *  reliably, uniquely resolves to THIS media record's bytes regardless of dedup (two records can
   *  share one blob's `storageKey`, which is why that internal key is not what's shown here). */
  const originalUrl = api.mediaOriginalUrl(item.id);

  function setTitle(value: string) {
    setDraft((d) => ({ ...d, title: value }));
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
    const patch = diffMediaMetadata({ item, draft });
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await port.updateMedia({ id: item.id }, patch);
      onSaved();
    } catch (e) {
      setError(describeApiError(e, t(locale, "failed to save media metadata")));
    } finally {
      setSaving(false);
    }
  }

  return {
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
