import { useEffect, useRef, useState } from "react";

import type { AdminMedia } from "../../../lib/api";
import { describeApiError, findEditingItem, readFileAsBase64 } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../media-i18n";
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
 * `createFakeMediaPort` instead of stubbing global `fetch`. `t(locale, …)` stays a direct import —
 * it is a pure `DICT[locale]?.[key] ?? key` lookup with no host boundary, same category as
 * `describeApiError` (see `media-port.hooks.ts`'s own doc comment for the identical reasoning
 * about `api.mediaOriginalUrl`). `useWiredMedia` below is the zero-argument pair `Media.tsx`
 * actually mounts.
 */

export interface MediaDependencies {
  port: MediaPort;
  locale: string;
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
}

/**
 * @complexity Time/space: O(1) per call — one list round trip on mount, one per mutation.
 */
export function useMedia({ port, locale }: MediaDependencies): MediaController {
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
      .catch((e) => setError(e instanceof Error ? e.message : t(locale, "failed to load media")));
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
      setError(e instanceof Error ? e.message : t(locale, "upload failed"));
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
      setError(describeApiError(e, t(locale, "delete failed")));
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
      setError(describeApiError(e, t(locale, "delete failed")));
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
  };
}

/**
 * Binds the real `/api/.../media` client and the real `useAdminLocale()` — see
 * `media-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Media.tsx` composes
 * this and a test composes {@link useMedia} with `createFakeMediaPort`.
 */
export function useWiredMedia(): MediaController {
  const locale = useAdminLocale();
  return useMedia({ port: defaultMediaPort, locale });
}
