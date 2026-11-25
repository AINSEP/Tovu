import { useMediaPickerItems, useMediaPickerDialog, type MediaPickerDialogController } from "@jini-ai/cms/react/media/MediaPickerDialog/MediaPickerDialog.hooks";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { describeApiError } from "../../lib/admin-http/request";
import { DEFAULT_LOCALE } from "../../hooks/admin-locale-dependencies.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t as sharedComponentsT } from "@jini-ai/admin/shell/components/shared-components-i18n";
import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";
import { mediaApi } from "../../features/media/api/media-api";
import type { MediaPickerPort } from "@jini-ai/admin/shell/components/MediaPickerDialog/media-picker-port.hooks";

/**
 * @file The only place under `components/MediaPickerDialog` that reaches `lib/api` — see
 * `media-picker-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. */
export const defaultMediaPickerPort: MediaPickerPort = {
  listMedia: () => mediaApi.listMedia(),
  mediaOriginalUrl: ({ id }, _options: Record<string, never> = {}) => mediaApi.mediaOriginalUrl({ id }),
};

/** Seed state for {@link createFakeMediaPickerPort}. */
export interface FakeMediaPickerPortOptions {
  media?: AdminMedia[];
}

/**
 * An in-memory {@link MediaPickerPort} for tests — lets a test describe "these items are
 * available to pick" directly, instead of stubbing global `fetch` or spying on `api.listMedia`.
 * Shipped alongside the real binding per the pattern's "every port gets a fake" rule.
 */
export function createFakeMediaPickerPort(options: FakeMediaPickerPortOptions = {}): MediaPickerPort {
  return {
    async listMedia() {
      return { media: [...(options.media ?? [])] };
    },

    // A distinct `fake://` scheme, not `api.mediaOriginalUrl`'s real
    // `/workspaces/.../media/.../original` shape — so a test asserting a rendered thumbnail's `src`
    // came from THIS fake fails if `MediaPickerDialog.tsx` ever goes back to calling the real `api`
    // directly.
    mediaOriginalUrl({ id }) {
      return `fake://media-picker-original/${id}`;
    },
  };
}

/** Binds the real `/api/.../media` client — see `media-picker-dependencies.hooks.ts`. The
 *  zero-argument half of the `useX(dependencies)` / `useWiredX()` pair for
 *  {@link useMediaPickerItems}; not composed by any component directly (only through
 *  {@link useWiredMediaPickerDialog} below), but given its own wired pair since the existing test
 *  file exercises it directly. */
export function useWiredMediaPickerItems({ port = defaultMediaPickerPort }: { port?: MediaPickerPort } = {}, { locale = DEFAULT_LOCALE }: { locale?: string } = {}) {
  return useMediaPickerItems({ port, locale, useFetchQueryHook: useFetchQuery, describeError: describeApiError, translate: sharedComponentsT }, {});
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
 * @param input.onSelect - Forwarded to {@link useMediaPickerDialog}.
 * @param input.onCancel - Forwarded to {@link useMediaPickerDialog}.
 * @returns The dialog's full render-time contract — see {@link MediaPickerDialogController}.
 */
export function useWiredMediaPickerDialog({ onSelect, onCancel }: { onSelect: (item: AdminMedia) => void; onCancel: () => void }, _options: Record<string, never> = {}): MediaPickerDialogController {
  const locale = useAdminLocale();
  return useMediaPickerDialog({ onSelect, _onCancel: onCancel, deps: { port: defaultMediaPickerPort, locale }, useFetchQueryHook: useFetchQuery, describeError: describeApiError, translate: sharedComponentsT });
}
