import { useEffect, useState } from "react";
import { acceptsMedia } from "@jini-ai/admin/media";
import { describeApiError, type AdminMedia } from "../../lib/api";
import { DEFAULT_LOCALE } from "../../hooks/admin-locale-dependencies.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { t as sharedComponentsT } from "../shared-components-i18n";
import { defaultMediaPickerPort } from "./media-picker-dependencies.hooks";
import type { MediaPickerPort } from "./media-picker-port.hooks";

/**
 * @file `MediaPickerDialog`'s data-fetch and selection state, split out of the component so
 * it can be swapped for a fake via the `useDialog` prop on `MediaPickerDialogProps` — see that
 * prop's doc comment in `MediaPickerDialog.tsx`. Same split `ConfirmDialog`/`ConfirmDialog.hooks.tsx`
 * uses in `@jini-ai/admin`.
 *
 * `useMediaPickerDialog` takes `onSelect`/`onCancel` as two positional callbacks rather than the
 * whole `MediaPickerDialogProps` object — mirrors `useConfirmDialog`'s primitives-in shape there,
 * and avoids a type-only import cycle back into `MediaPickerDialog.tsx` for the `useDialog` prop's
 * own type (`typeof useWiredMediaPickerDialog`). Historically the Escape listener listed `onCancel`
 * as a dependency (2026-08-21 lint pass) and rebound whenever its identity changed — every real
 * caller passes a fresh arrow per render, so the listener is torn down and re-added on those
 * renders; the `document.removeEventListener`/`addEventListener` pair in the same synchronous
 * effect run keeps that rebind unobservable (no double-fire, no dropped Escape). This closes the
 * stale-closure gap the old mount-once `[]` had — a caller could previously escape-cancel into a
 * `onCancel` captured from an earlier render. Phase 17 removes that listener entirely: Jini's
 * native dialog receives the current callback directly, so this reason still applies without
 * maintaining a second document subscription.
 *
 * `port` is injected (see `media-picker-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly, so a test can describe "these items are available" against `createFakeMediaPickerPort`
 * instead of stubbing global `fetch`/spying on `api.listMedia`. `describeApiError` stays a direct
 * import — pure, no host boundary.
 */

/**
 * Fetches the workspace's active media once per mount — mirrors `useExistingInstances`'s exact
 * shape (`null` while loading, a describable `error` string on failure).
 *
 * @param port - Injected `MediaPickerPort` — see `media-picker-port.hooks.ts`.
 * @param locale - Translates the `describeApiError` fallback via `shared-components-i18n.ts`'s `t`.
 *   Defaults to `DEFAULT_LOCALE` ("en"), which renders the same English fallback as before this
 *   parameter existed — mirrors `useExistingInstances`'s identical `locale` parameter in
 *   `WidgetPickerDialog.hooks.tsx`.
 * @returns `items` (`null` while the fetch is in flight, otherwise the loaded, active-only list)
 *   and `error` (a describable failure message, or `null`).
 */
export function useMediaPickerItems(port: MediaPickerPort, locale: string = DEFAULT_LOCALE) {
  const [items, setItems] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    port
      .listMedia()
      .then((r) => setItems(r.media.filter((m) => m.status === "active")))
      .catch((e) => setError(describeApiError(e, sharedComponentsT({ locale: locale, key: "failed to load media" }))));
    // `locale` is added below for the same reason `useExistingInstances`'s does — see that hook's
    // identical eslint-disable note in `WidgetPickerDialog.hooks.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, locale]);
  return { items, error };
}

/** The legacy grid's half of `MediaPickerDialogProps.accept` — Jini's own `acceptsMedia` rule, so
 *  this dialog and the Jini picker (handed the same `accept` list) can never disagree on a type.
 *  `null` (still loading) passes through.
 *  @complexity O(n · a) for n items and a accept entries. */
export function acceptedMediaItems(items: AdminMedia[] | null, accept: readonly string[] = []): AdminMedia[] | null {
  return items && items.filter((item) => acceptsMedia({ item, accept }));
}

/** Binds the real `/api/.../media` client — see `media-picker-dependencies.hooks.ts`. The
 *  zero-argument half of the `useX(dependencies)` / `useWiredX()` pair for
 *  {@link useMediaPickerItems}; not composed by any component directly (only through
 *  {@link useWiredMediaPickerDialog} below), but given its own wired pair since the existing test
 *  file exercises it directly. */
export function useWiredMediaPickerItems() {
  return useMediaPickerItems(defaultMediaPickerPort);
}

/** What {@link useMediaPickerDialog} (and {@link useWiredMediaPickerDialog}) hands back to
 *  `MediaPickerDialog.tsx` — the dialog's full render-time contract. */
export interface MediaPickerDialogController {
  items: AdminMedia[] | null;
  error: string | null;
  select: (item: AdminMedia) => void;
  /** Synchronous URL builder for a thumbnail's `<img src>`, forwarded straight from the injected
   *  {@link MediaPickerPort} — see that port's own `mediaOriginalUrl` doc for why a pure URL
   *  template still crosses this seam rather than staying a direct `lib/api` import in the
   *  component. */
  mediaOriginalUrl: (id: string) => string;
  /** Bound to `deps.locale` (or `DEFAULT_LOCALE`) via `shared-components-i18n.ts`'s `t` — see this
   *  file's header for why it's resolved here rather than at each call site. */
  t: Translate;
  /** The locale `t` above is bound to — same parity reasoning as `WidgetPickerDialogController`'s
   *  own `locale` field. */
  locale: string;
}

/**
 * Owns selection on top of {@link useMediaPickerItems}; Jini now owns native cancellation
 * and focus management. Split out for the same reason
 * `useWidgetPickerDialog` is — a render-free unit to test the interaction logic against.
 *
 * Focus management (2026-09-16 fix — no dialog wrapper or focus/blur handling existed at all
 * before this): Jini now captures whatever had focus on mount and moves focus onto Cancel (a stable
 * target present regardless of loading/error/empty/populated state); on unmount, restores focus
 * to what was captured. Without this, closing left focus on `<body>` — a keyboard/screen-reader
 * user was dropped to the top of the page instead of back at the control that opened the dialog.
 *
 * @param onSelect - Called with the chosen item when a thumbnail is clicked.
 * @param _onCancel - Retained for the existing hook ABI; the component forwards cancellation to Jini.
 * @param deps - Injected `{ port?; locale? }` — both optional/defaulted, mirroring
 *   `useWidgetPickerDialog`'s identical shape in `WidgetPickerDialog.hooks.tsx`. `port` defaults to
 *   {@link defaultMediaPickerPort} and `locale` to `DEFAULT_LOCALE`, so every existing call site
 *   that still passes only `{ port: fakePort }` keeps compiling and behaving unchanged.
 * @returns The dialog's full render-time contract — see {@link MediaPickerDialogController}.
 */
export function useMediaPickerDialog(
  onSelect: (item: AdminMedia) => void,
  _onCancel: () => void,
  deps: { port?: MediaPickerPort; locale?: string }
): MediaPickerDialogController {
  const port = deps.port ?? defaultMediaPickerPort;
  const locale = deps.locale ?? DEFAULT_LOCALE;
  const t: Translate = (key) => sharedComponentsT({ locale: locale, key: key });
  const { items, error } = useMediaPickerItems(port, locale);
  // Jini captures at mount, before focus moves onto Cancel — the element that had focus then is,
  // by construction, whatever opened this dialog (e.g. the Posts/Pages editor's "Insert from Media
  // Library" toolbar button). Restored on unmount. This component is only ever rendered while the
  // dialog is open (the caller conditionally mounts it, per `MediaPickerDialog.tsx`'s own doc
  // comment), so mount/unmount IS the open/close transition — same technique `ConfirmDialog`
  // (`@jini-ai/admin`) and this app's own `useMediaLightbox` use for an always-mounted native
  // `<dialog>`'s `showModal()`/`close()` pair. The component marks Cancel with Jini's autofocus
  // attribute so it remains the stable target even while media is loading or the fetch fails.

  return { items, error, select: onSelect, mediaOriginalUrl: port.mediaOriginalUrl, t, locale };
}

/**
 * Binds the real `/api/.../media` client and resolves `locale` via `useAdminLocale()` — see
 * `media-picker-dependencies.hooks.ts` and `WidgetPickerDialog.hooks.tsx`'s
 * `useWiredWidgetPickerDialog` for the identical wired/unwired reasoning.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `MediaPickerDialog.tsx` composes this and a test composes {@link useMediaPickerDialog} with
 * `createFakeMediaPickerPort`.
 *
 * @param onSelect - Forwarded to {@link useMediaPickerDialog}.
 * @param onCancel - Forwarded to {@link useMediaPickerDialog}.
 * @returns The dialog's full render-time contract — see {@link MediaPickerDialogController}.
 */
export function useWiredMediaPickerDialog(onSelect: (item: AdminMedia) => void, onCancel: () => void): MediaPickerDialogController {
  const locale = useAdminLocale();
  return useMediaPickerDialog(onSelect, onCancel, { port: defaultMediaPickerPort, locale });
}
