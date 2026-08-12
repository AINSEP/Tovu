import { useEffect, useRef, useState } from "react";

import type { AdminMedia } from "../../../lib/api";
import { describeApiError, findEditingItem, readFileAsBase64 } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { MEDIA_DICT, t as translate } from "../media-i18n";
import { defaultMediaPort } from "./media-dependencies.hooks";
import type { MediaPort } from "./media-port.hooks";

/**
 * @file Everything the top-level Media grid screen does, so `Media()` in `Media.tsx` is only
 * markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error handling. The doc comments
 * below moved WITH the state and functions they describe — several are decision records (why
 * trashing has no confirm step but purge does, why the lightbox tracks an index rather than an
 * item) and a comment separated from its code stops being read.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local
 * because nothing outside `features/media` needs it.
 *
 * `port`/`locale` are injected (see `media-port.hooks.ts` and the `useWiredX` convention doc at
 * `development/docs/architecture/wired-hooks-convention.md`) rather than reaching for `lib/api`'s
 * `api` and `useAdminLocale()` directly, so a test can describe list/write outcomes against
 * `createFakeMediaPort` instead of stubbing global `fetch`. `media-i18n.ts`'s own `t(locale, key)`
 * — aliased `translate` here to avoid colliding with this file's own bound `(key) => string`
 * closure — stays a direct import for this hook's OWN error strings: a pure `DICT[locale]?.[key]
 * ?? key` lookup with no host boundary, same category as `describeApiError` (see
 * `media-port.hooks.ts`'s own doc comment for the identical reasoning about
 * `api.mediaOriginalUrl`). `useWiredMedia` below is the zero-argument pair `Media.tsx` actually
 * mounts.
 *
 * `t`/`locale` are ALSO returned from {@link useMedia} (standing i18n rule, 2026-08-11 — a
 * component with a hook gets a BOUND `t` from that hook, not its own `useAdminLocale()`/dictionary
 * import, same shape `use-pages.hooks.ts` established) purely so `Media.tsx` — and the
 * `MediaPreview`/`EditMediaPanel`/`MediaLightbox`/`MediaToolbar`/`MediaPurgeDialog` sub-components
 * it threads `t` into as a prop — have somewhere to source their UI copy. `locale` itself is
 * exposed too, not just `t`: `Media.tsx` passes the raw string on to `mediaRowMenuItems`
 * (`../rules.ts`), which keeps its own independent `MEDIA_DICT[locale]?.[key] ?? key` closure
 * unchanged — same "row-menu builder is a different, out-of-scope thing" precedent
 * `use-pages.hooks.ts` cites for `pageRowMenuItems`.
 */

export interface MediaDependencies {
  port: MediaPort;
  locale: string;
  t: (key: string) => string;
}

export interface MediaController {
  /** `null` until the initial load settles — the caller renders a loading state. */
  media: AdminMedia[] | null;
  error: string | null;
  uploading: boolean;
  altDraft: string;
  setAltDraft: (value: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  upload: () => Promise<void>;
  /** The id of the media item whose `EditMediaPanel` is expanded, or `null` when none is. */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  /** `findEditingItem(media, editingId)`, resolved here so the view never searches `media`
   *  itself. */
  editingItem: AdminMedia | null;
  /** Opens `EditMediaPanel` for `item`, or closes it if it is already the one expanded. */
  toggleEditing: (item: AdminMedia) => void;
  /** Closes the edit panel and reloads — the `EditMediaPanel`'s `onSaved` callback. */
  onMetadataSaved: () => void;
  trash: (item: AdminMedia) => Promise<void>;
  // Purge (permanent delete) confirmation — mirrors `Posts.tsx`'s `pendingDelete`/`rowSavingId`
  // pair exactly. Trashing (the reversible first rung of the ladder) has no confirm step, matching
  // the original `window.confirm` call's own scope: it only ever guarded the permanent-delete path.
  pendingPurge: AdminMedia | null;
  setPendingPurge: (item: AdminMedia | null) => void;
  /** In-flight row action (Trash, or the confirmed permanent delete) — one at a time. */
  rowSavingId: string | null;
  purge: () => Promise<void>;
  // Lightbox — an index into `media`, not the item itself, so `MediaLightbox`'s own arrow-key/nav-
  // button navigation can move this number directly without this component re-deriving "what's
  // next" from an item reference. `null` is closed, mirroring `pendingPurge`'s own null-is-closed
  // convention for the other dialog already driven from this component.
  lightboxIndex: number | null;
  setLightboxIndex: (index: number | null) => void;
  /** Bound translator — see this file's own header for why it arrives via the hook rather than
   *  `Media.tsx` calling `useAdminLocale()`/`MEDIA_DICT` directly. */
  t: (key: string) => string;
  /** The raw resolved locale — exposed only because `mediaRowMenuItems` (`../rules.ts`) genuinely
   *  needs it, not `t`. */
  locale: string;
}

/**
 * @complexity Time/space: O(1) per call — one list round trip on mount, one per mutation.
 */
export function useMedia({ port, locale, t }: MediaDependencies): MediaController {
  const [media, setMedia] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [altDraft, setAltDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingPurge, setPendingPurge] = useState<AdminMedia | null>(null);
  const [rowSavingId, setRowSavingId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    port
      .listMedia()
      .then((r) => setMedia(r.media))
      .catch((e) => setError(e instanceof Error ? e.message : translate(locale, "failed to load media")));
  }

  useEffect(load, []);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await port.uploadMedia(
        { filename: file.name, contentType: file.type, dataBase64 },
        { alt: altDraft.trim() || undefined }
      );
      setAltDraft("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : translate(locale, "upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function trash(item: AdminMedia) {
    setError(null);
    setRowSavingId(item.id);
    try {
      await port.trashMedia(item.id);
      load();
    } catch (e) {
      setError(describeApiError(e, translate(locale, "delete failed")));
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
      await port.deleteMedia(item.id);
      load();
    } catch (e) {
      setError(describeApiError(e, translate(locale, "delete failed")));
    } finally {
      setRowSavingId(null);
      setPendingPurge(null);
    }
  }

  function toggleEditing(item: AdminMedia) {
    setEditingId((id) => (id === item.id ? null : item.id));
  }

  function onMetadataSaved() {
    setEditingId(null);
    load();
  }

  return {
    media,
    error,
    uploading,
    altDraft,
    setAltDraft,
    fileInputRef,
    upload,
    editingId,
    setEditingId,
    editingItem: findEditingItem(media, editingId),
    toggleEditing,
    onMetadataSaved,
    trash,
    pendingPurge,
    setPendingPurge,
    rowSavingId,
    purge,
    lightboxIndex,
    setLightboxIndex,
    t,
    locale,
  };
}

/**
 * Binds the real `/api/.../media` client, the real `useAdminLocale()`, and a `MEDIA_DICT`-bound
 * translator — see `media-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Media.tsx` composes
 * this and a test composes {@link useMedia} with `createFakeMediaPort`.
 */
export function useWiredMedia(): MediaController {
  const locale = useAdminLocale();
  const t = (key: string): string => MEDIA_DICT[locale]?.[key] ?? key;
  return useMedia({ port: defaultMediaPort, locale, t });
}
