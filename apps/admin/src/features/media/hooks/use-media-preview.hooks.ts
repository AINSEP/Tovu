import { useState } from "react";

import type { AdminMedia } from "@/lib/api";
import { mediaAltText } from "../rules";
import { defaultMediaPort } from "./media-dependencies.hooks";
import type { MediaPort } from "./media-port.hooks";

/**
 * @file Everything `MediaPreview` does, so the component in `Media.tsx` is only markup.
 *
 * See `Media.tsx`'s file header for the full rationale of the optimistic image → video →
 * placeholder fallback chain this hook drives — the client has no server-provided content type to
 * read, so `stage` resolves it by trying to render, not by probing first.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local
 * because nothing outside `features/media` needs it.
 *
 * IS a `useWiredX` candidate as of 2026-08-14 (superseding the 2026-08-11 wired-hooks-audit
 * review, which excluded it): `src` now reads `port.mediaOriginalUrl(item.id)` — the same
 * `MediaPort` route `use-media.hooks.ts`/`use-edit-media-panel.hooks.ts` already inject — rather
 * than calling `api.mediaOriginalUrl` directly. The old exclusion argued a pure, synchronous URL
 * template has no host boundary worth injecting; the owner's ruling supersedes that argument for
 * every `lib/api.ts` URL builder uniformly, so a test can prove this hook's `src` came from the
 * injected port instead of a hardcoded `api` call, the same thing the other two hooks' routes were
 * already bought for. See `media-port.hooks.ts`'s header for the full account. `deps.port` is the
 * ONLY thing this hook now takes as a dependency — everything else it does (fallback-chain state,
 * `mediaAltText`) stays exactly as before.
 */

export type PreviewStage = "image" | "video" | "unsupported";

export interface MediaPreviewController {
  stage: PreviewStage;
  /** The authenticated byte-serving URL this asset previews from — same URL a working preview
   *  uses as its `<img>`/`<video>` `src`, and what the "unsupported" placeholder's download link
   *  points at. */
  src: string;
  altText: string;
  /** Wired to the `<img>`'s `onError` — advances the fallback chain to the video probe. */
  handleImageError: () => void;
  /** Wired to the `<video>`'s `onError` — advances the fallback chain to the placeholder. */
  handleVideoError: () => void;
}

/** What {@link useMediaPreview} needs from the outside world — just the one URL builder, unlike
 *  its sibling hooks which also read/write media metadata. */
export interface UseMediaPreviewDependencies {
  port: Pick<MediaPort, "mediaOriginalUrl">;
}

/**
 * @param item - The asset being previewed.
 * @param deps - Injected dependencies — see {@link UseMediaPreviewDependencies}.
 * @returns The fallback-chain state and handlers `MediaPreview` renders from.
 * @complexity Time/space: O(1) — one state transition per probe failure, no iteration.
 */
export function useMediaPreview(
  item: AdminMedia,
  { port }: UseMediaPreviewDependencies,
  t: (key: string) => string = (key) => key,
): MediaPreviewController {
  const [stage, setStage] = useState<PreviewStage>("image");
  const src = port.mediaOriginalUrl(item.id);
  const altText = mediaAltText(item, t("Untitled asset"));

  function handleImageError() {
    setStage("video");
  }
  function handleVideoError() {
    setStage("unsupported");
  }

  return { stage, src, altText, handleImageError, handleVideoError };
}

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
