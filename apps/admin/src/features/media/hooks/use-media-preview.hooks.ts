import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";
import { useMediaPreview, type MediaPreviewController } from "@jini-ai/admin/screens/media/hooks/use-media-preview.hooks";
import { defaultMediaPort } from "./media-dependencies.hooks";

/**
 * @file STAYS-HOST (binding): `@jini-ai/admin`'s `useMediaPreview` bound to this host's media port.
 */

/**
 * Binds the real `/api/.../media` client — see `media-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair; `Media.tsx`
 * composes this (as `MediaPreviewProps.useMediaPreviewHook`'s default) and a test composes
 * {@link useMediaPreview} directly with a fake `port`.
 *
 * @param item - Forwarded to {@link useMediaPreview}.
 * @returns The fallback-chain state and handlers `MediaPreview` renders from.
 */
export function useWiredMediaPreview(item: AdminMedia, t?: (key: string) => string): MediaPreviewController {
  return useMediaPreview(item, { port: defaultMediaPort }, t);
}
